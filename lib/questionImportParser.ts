/**
 * Parses bulk-imported questions from plain text (already extracted from
 * a .docx, or read directly from a .csv) into draft questions ready for
 * teacher review.
 *
 * Deliberately never guesses which option is correct — that's a
 * judgment call that belongs to the teacher reviewing the import, not a
 * pattern match on the source document.
 *
 * Detection logic was rebuilt against two real exam documents (not a
 * guess at the format) and the actual pattern they use is NOT "numbered
 * question, then each option on its own lettered line" — it's:
 *
 *   - The question number itself is almost always Word's own
 *     auto-numbering list feature, not typed text — it never appears in
 *     the extracted content at all, so detection can't depend on seeing
 *     "1." or "1)" at the start of a line.
 *   - All of the options sit INLINE, on the very same line/paragraph as
 *     the question, e.g. "The SI unit of viscosity is A. Newton
 *     B. Pascal-second C. Joule D. Watt" — one teacher's documents used
 *     "(a) ... (b) ... (c) ..." (lowercase, parenthesized), another used
 *     "A. ... B. ... C. ..." (uppercase, period, often bolded). Both are
 *     handled; a hand-typed numbered-question-then-separate-option-lines
 *     layout (the original, wrong assumption this file started from) is
 *     still supported too as a secondary pattern, in case some teacher's
 *     document genuinely is formatted that way.
 *
 * The one thing this *can* detect reliably, for a Word import
 * specifically, is whether a question originally had an image — see
 * DIAGRAM_MARKER below and how it's used in
 * app/api/teacher/questions/parse-import/route.ts's mammoth
 * configuration. Word's native Equation Editor objects, by contrast,
 * don't survive text extraction at all and leave no reliable trace, so
 * that gets a single upfront notice to the teacher instead of a
 * per-question flag this parser can't honestly make.
 *
 * Known, accepted limitation: multi-part theory/essay questions (a
 * numbered question with "i. ii. iii." sub-parts, or a block of several
 * run-on essay prompts) are real-world exam content this parser cannot
 * reliably split into discrete questions — it does a best-effort single
 * free-response question per detected block, and a teacher importing a
 * theory-heavy section should expect to do more manual cleanup there
 * than for a multiple-choice section.
 */

export const DIAGRAM_MARKER = "@@DIAGRAM_MARKER@@";

export type DraftQuestionType = "multiple_choice" | "true_false" | "fill_blank" | "short_theory";

export interface DraftOption {
  text: string;
}

export interface DraftQuestion {
  type: DraftQuestionType;
  prompt: string;
  options: DraftOption[];
  points: number;
  topic?: string;
  hadDiagram: boolean;
  warning?: string;
}

export interface ParseResult {
  questions: DraftQuestion[];
  /** Lines that looked like they were trying to be a question but couldn't be parsed cleanly — surfaced so nothing silently vanishes. */
  skippedLineCount: number;
}

/**
 * Finds inline options on a single line/paragraph and splits it into a
 * prompt plus each option's text. Tries lowercase-parenthesized style
 * ("(a) ... (b) ...") first, then uppercase-period style
 * ("A. ... B. ..."). Either way, the letters found must appear in
 * strict alphabetical order starting from "a"/"A" — this is what keeps
 * an ordinary abbreviation or stray parenthetical in running prose from
 * being mistaken for an option list; real option sequences in these
 * documents are consistently in order, coincidental matches essentially
 * never are.
 */
function splitInlineOptions(line: string): { prompt: string; options: string[] } | null {
  const tryPattern = (regex: RegExp, expectedLetters: string[]): { prompt: string; options: string[] } | null => {
    const matches = [...line.matchAll(regex)];
    if (matches.length < 2) return null;

    const letters = matches.map((m) => m[1].toLowerCase());
    // Keep only a prefix run that matches a, b, c, d(...) in order —
    // trims off anything after a sequence break rather than rejecting
    // the whole line outright.
    let validCount = 0;
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] === expectedLetters[i]) validCount++;
      else break;
    }
    if (validCount < 2) return null;

    const used = matches.slice(0, validCount);
    const prompt = line.slice(0, used[0].index).trim();
    const options: string[] = [];
    for (let i = 0; i < used.length; i++) {
      const start = (used[i].index ?? 0) + used[i][0].length;
      const end = i + 1 < used.length ? used[i + 1].index : line.length;
      options.push(line.slice(start, end).trim());
    }
    return { prompt, options };
  };

  const letterSeq = ["a", "b", "c", "d", "e", "f"];
  return (
    tryPattern(/\(([A-Fa-f])\)\s*/g, letterSeq) ?? tryPattern(/\b([A-Fa-f])[.)]\s+/g, letterSeq)
  );
}

// Allows an optional trailing letter after the number ("1A.", "2B)") —
// a real pattern seen in these documents for sub-labeled theory
// questions (1A, 1B, 2A, 2B...), each one a genuinely distinct,
// independently-answerable question worth splitting out on its own.
const STANDALONE_QUESTION_START = /^\s*(\d{1,3})[A-Za-z]?[.)]\s+(.*)$/;
const STANDALONE_OPTION_START = /^\s*\(?([A-Fa-f])[.)]\s+(.*)$/;

/** Boilerplate that shows up in exam document headers/section dividers — never real question content. */
function looksLikeHeaderOrBoilerplate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^section\b/i.test(trimmed)) return true;
  if (/^class\s*:/i.test(trimmed)) return true;
  if (/^subject\s*:/i.test(trimmed)) return true;
  if (/^motto\s*:/i.test(trimmed)) return true;
  if (/^answer\s+(any|all)\b/i.test(trimmed)) return true;
  if (/examination$/i.test(trimmed) && trimmed.split(" ").length <= 4) return true;
  // The school-address line that commonly follows a school name/motto
  // header: starts with a street number, mentions a street-type word.
  if (/^\d+[,.]?\s/.test(trimmed) && /\b(street|road|avenue|close|way|lane|estate|b\/stop|bus\s?stop)\b/i.test(trimmed)) return true;
  // A short-to-medium line with essentially no lowercase letters reads
  // as a shouted header/title in these documents, not a sentence a real
  // question would be phrased as.
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  const lowercase = trimmed.replace(/[^a-z]/g, "");
  if (letters.length > 0 && lowercase.length / letters.length < 0.15 && trimmed.length < 120) return true;
  return false;
}

export function parseQuestionText(raw: string): ParseResult {
  const lines = raw.split(/\r\n|\r|\n/);

  const questions: DraftQuestion[] = [];
  let building: { promptLines: string[]; options: string[][] } | null = null;
  let skippedLineCount = 0;

  const flushBuilding = () => {
    if (!building) return;
    const prompt = building.promptLines.join(" ").replace(/\s+/g, " ").trim();
    const hadDiagram = prompt.includes(DIAGRAM_MARKER) || building.options.some((o) => o.join("").includes(DIAGRAM_MARKER));
    const cleanPrompt = stripDiagramMarker(prompt);
    const optionTexts = building.options.map((lines) => stripDiagramMarker(lines.join(" "))).filter((t) => t.length > 0);
    building = null;
    if (!cleanPrompt) return;
    questions.push(buildDraftQuestion(cleanPrompt, optionTexts, hadDiagram));
  };

  for (const line of lines) {
    const hasContent = line.trim().length > 0 || line.includes(DIAGRAM_MARKER);
    if (!hasContent) continue;

    // Primary pattern: inline options on this same line — a complete
    // question all on its own, regardless of what came before.
    const inline = splitInlineOptions(line);
    if (inline && inline.prompt.trim()) {
      flushBuilding();
      const hadDiagram = line.includes(DIAGRAM_MARKER);
      const cleanPrompt = stripDiagramMarker(inline.prompt);
      const optionTexts = inline.options.map(stripDiagramMarker).filter((t) => t.length > 0);
      questions.push(buildDraftQuestion(cleanPrompt, optionTexts, hadDiagram));
      continue;
    }

    // Secondary pattern: hand-typed "1. question" / "A. option" on
    // separate lines, for a document actually formatted that way.
    const qMatch = STANDALONE_QUESTION_START.exec(line);
    if (qMatch) {
      flushBuilding();
      building = { promptLines: [qMatch[2]], options: [] };
      continue;
    }
    const oMatch = STANDALONE_OPTION_START.exec(line);
    if (oMatch && building) {
      building.options.push([oMatch[2]]);
      continue;
    }

    if (looksLikeHeaderOrBoilerplate(line)) continue;

    if (building) {
      if (building.options.length > 0) {
        building.options[building.options.length - 1].push(line.trim());
      } else {
        building.promptLines.push(line.trim());
      }
      continue;
    }

    // No question in progress, no recognizable marker, not boilerplate —
    // starts a new free-response (short_theory) question. Real theory
    // sections are often typed as "1A. Define Salvation" or just a bare
    // sentence; strip a leading number/letter label if present so it
    // doesn't end up duplicated inside the prompt text itself.
    const labelStripped = line.trim().replace(/^\d{1,3}[A-Za-z]?[.)]\s*/, "");
    if (labelStripped) {
      building = { promptLines: [labelStripped], options: [] };
    } else {
      skippedLineCount++;
    }
  }
  flushBuilding();

  return { questions, skippedLineCount };
}

function stripDiagramMarker(text: string): string {
  return text.replace(new RegExp(DIAGRAM_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").replace(/\s+/g, " ").trim();
}

function buildDraftQuestion(prompt: string, optionTexts: string[], hadDiagram: boolean): DraftQuestion {
  const normalized = optionTexts.map((t) => t.toLowerCase());
  const isTrueFalse = optionTexts.length === 2 && normalized.includes("true") && normalized.includes("false");

  let type: DraftQuestionType;
  let options: DraftOption[];
  let warning: string | undefined;

  if (isTrueFalse) {
    type = "true_false";
    options = [{ text: "True" }, { text: "False" }];
  } else if (optionTexts.length >= 2) {
    type = "multiple_choice";
    options = optionTexts.map((text) => ({ text }));
  } else {
    type = "short_theory";
    options = [];
    if (optionTexts.length === 1) {
      warning = "Only one option was detected under this question — imported as a written-answer question instead. Review the prompt below.";
    }
  }

  return { type, prompt, options, points: 1, hadDiagram, warning };
}

/**
 * Minimal, dependency-free CSV parser (handles quoted fields containing
 * commas, newlines, and escaped quotes) — adding a library felt like
 * overkill for a format this well-defined, and avoids one more
 * dependency for something this contained.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/**
 * CSV template columns: Prompt, Option A, Option B, Option C, Option D,
 * Points, Topic. No "correct answer" column — same reasoning as the
 * Word path: that's chosen on review, not parsed. Leaving all four
 * option columns blank on a row imports it as a written-answer question.
 */
export function parseCsvQuestions(text: string): ParseResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { questions: [], skippedLineCount: 0 };

  const startIndex = /^prompt$/i.test(rows[0][0]?.trim() ?? "") ? 1 : 0;

  const questions: DraftQuestion[] = [];
  let skippedLineCount = 0;

  for (let r = startIndex; r < rows.length; r++) {
    const row = rows[r];
    const prompt = (row[0] ?? "").trim();
    if (!prompt) {
      skippedLineCount++;
      continue;
    }
    const optionTexts = [row[1], row[2], row[3], row[4]].map((c) => (c ?? "").trim()).filter((t) => t.length > 0);
    const points = Number(row[5]);
    const topic = (row[6] ?? "").trim();

    const draft = buildDraftQuestion(prompt, optionTexts, false);
    draft.points = Number.isFinite(points) && points > 0 ? points : 1;
    if (topic) draft.topic = topic;
    questions.push(draft);
  }

  return { questions, skippedLineCount };
}
