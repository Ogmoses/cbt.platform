/**
 * Parses bulk-imported questions from plain text (already extracted from
 * a .docx, or read directly from a .csv) into draft questions ready for
 * teacher review.
 *
 * Deliberately never guesses which option is correct — that's a
 * judgment call that belongs to the teacher reviewing the import, not a
 * pattern match on the source document. This also sidesteps the biggest
 * reliability problem a from-Word import would otherwise have: detecting
 * an explicit "Answer: B" line is fragile (teachers format that
 * differently, bold/underline instead of writing it, etc.), and getting
 * it wrong would silently mark the wrong option correct. Not attempting
 * it at all is safer than attempting it unreliably.
 *
 * The one thing this *can* detect reliably, for a Word import
 * specifically, is whether a question originally had an image — see
 * DIAGRAM_MARKER below and how it's used in
 * app/api/teacher/questions/parse-import/route.ts's mammoth
 * configuration. Word's native Equation Editor objects, by contrast,
 * don't survive text extraction at all and leave no reliable trace, so
 * that gets a single upfront notice to the teacher instead of a
 * per-question flag this parser can't honestly make.
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

const QUESTION_START = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const OPTION_START = /^\s*\(?([A-Fa-f])[.)]\s+(.*)$/;

export function parseQuestionText(raw: string): ParseResult {
  const lines = raw.split(/\r\n|\r|\n/);

  const questions: DraftQuestion[] = [];
  let current: { promptLines: string[]; options: string[][] } | null = null;
  let skippedLineCount = 0;

  const flush = () => {
    if (!current) return;
    const prompt = current.promptLines.join(" ").replace(/\s+/g, " ").trim();
    const hadDiagram = prompt.includes(DIAGRAM_MARKER) || current.options.some((o) => o.join("").includes(DIAGRAM_MARKER));
    const cleanPrompt = prompt.replace(new RegExp(DIAGRAM_MARKER, "g"), "").replace(/\s+/g, " ").trim();
    const optionTexts = current.options
      .map((lines) => lines.join(" ").replace(new RegExp(DIAGRAM_MARKER, "g"), "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0);

    if (!cleanPrompt) {
      current = null;
      return;
    }

    questions.push(buildDraftQuestion(cleanPrompt, optionTexts, hadDiagram));
    current = null;
  };

  for (const line of lines) {
    if (!line.trim() && !line.includes(DIAGRAM_MARKER)) continue;

    const qMatch = QUESTION_START.exec(line);
    if (qMatch) {
      flush();
      current = { promptLines: [qMatch[2]], options: [] };
      continue;
    }

    const oMatch = OPTION_START.exec(line);
    if (oMatch && current) {
      current.options.push([oMatch[2]]);
      continue;
    }

    if (current) {
      if (current.options.length > 0) {
        // Continuation of a wrapped option line.
        current.options[current.options.length - 1].push(line.trim());
      } else {
        // Continuation of a wrapped question prompt.
        current.promptLines.push(line.trim());
      }
    } else if (line.trim()) {
      skippedLineCount++;
    }
  }
  flush();

  return { questions, skippedLineCount };
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
      warning = "Only one option line was detected under this question — imported as a written-answer question instead. Review the prompt below.";
    }
  }

  return {
    type,
    prompt,
    options,
    points: 1,
    hadDiagram,
    warning,
  };
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

  // Skip a header row if the first cell looks like a label rather than content.
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
