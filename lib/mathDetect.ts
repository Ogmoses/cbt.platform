/**
 * Auto-detects math expressions inside ordinary prose, with no required
 * markup (no `$...$`, no special syntax) — a teacher just types
 * "the area is x^2 + 3" and the "x^2 + 3" part renders as real math while
 * the rest stays plain text.
 *
 * This is inherently a heuristic, not a parser — plain English and math
 * notation share characters (slashes, parentheses, digits), so there's
 * no fully reliable way to tell "3/4 of the students" (prose) apart from
 * "3/4" (a fraction) without either guessing or requiring markup. The
 * approach here stays conservative: a token only becomes part of a math
 * run if it contains an unambiguous math marker itself (^, a single
 * underscore between characters, a backslash LaTeX command, "sqrt(",
 * or √), or if it's short and directly adjacent to such a token (so
 * "2x + 5 = 11" becomes one run, numbers and operators pulled in by
 * their neighbors). Plain fractions like "3/4" are deliberately left as
 * plain text — the false-positive rate against dates (9/25) and ordinary
 * phrases ("and/or") wasn't worth it. A teacher who needs a real
 * fraction can still type explicit LaTeX (`\frac{3}{4}`), which always
 * renders correctly — backslash commands are the one unambiguous signal
 * this heuristic fully trusts.
 *
 * Known limitation: because there's no explicit boundary marker, a
 * common English word sitting directly next to a math run (e.g. "solve
 * for x" where "for" touches "x") could occasionally get pulled in. The
 * STOPWORDS list below exists specifically to block the common cases of
 * that (word-break on "for", "is", "a", etc.), but this isn't bulletproof
 * for every sentence construction. This is a reasonable trade-off for
 * "no markup required" — a teacher who hits a case this gets wrong can
 * always wrap the exact part that matters in `\(...\)` as an override.
 */

export interface TextSegment {
  type: "text" | "math";
  value: string;
}

const STRONG_MATH_TOKEN = /\^.|\\[a-zA-Z]|^sqrt\(|√|^[A-Za-z0-9]+_[A-Za-z0-9]+$/i;
const BARE_OPERATOR = new Set(["+", "-", "*", "=", "<", ">", "<=", ">=", "!=", "±", "×", "÷", "≤", "≥", "≠"]);
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "of", "to", "in", "on", "at", "for", "and", "or", "if", "it",
  "as", "by", "be", "do", "so", "no", "we", "he", "she", "you", "i", "my", "me", "us", "up", "out", "can",
  "not", "all", "any", "but", "how", "its", "let", "may", "now", "see", "set", "use", "with", "that", "this",
  "from", "has", "have", "will", "your", "find", "find.", "value", "values", "number", "numbers",
]);

function isStrongMathToken(token: string): boolean {
  if (STRONG_MATH_TOKEN.test(token)) return true;
  if (BARE_OPERATOR.has(token)) return true;
  return false;
}

/** Short, non-word-like tokens (numbers, single letters, operators) that can be swept into an adjacent math run. */
function isAbsorbable(token: string): boolean {
  if (token.length > 6) return false;
  if (STOPWORDS.has(token.toLowerCase().replace(/[.,!?;:]+$/, ""))) return false;
  return /^[A-Za-z0-9().]+$/.test(token);
}

/**
 * Splits text into alternating plain-text and math-expression segments.
 * Consecutive math-qualifying tokens (and short absorbable neighbors
 * like bare numbers/variables) merge into a single math run so an
 * equation like "2x + 5 = 11" renders as one expression rather than
 * fragmenting at every space.
 */
export function splitMathSegments(text: string): TextSegment[] {
  // First, honor explicit \( ... \) or $ ... $ as a trusted override —
  // always math, regardless of what's inside, for the rare case the
  // heuristic below gets something wrong.
  const explicitPattern = /\\\(([\s\S]+?)\\\)|\$([^$\n]+)\$/g;
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = explicitPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(...autoDetect(text.slice(lastIndex, match.index)));
    }
    segments.push({ type: "math", value: match[1] ?? match[2] ?? "" });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push(...autoDetect(text.slice(lastIndex)));
  }
  return segments;
}

function autoDetect(text: string): TextSegment[] {
  // Split into words and whitespace, keeping whitespace as its own
  // tokens so exact spacing is preserved when reassembling.
  const parts = text.split(/(\s+)/).filter((p) => p.length > 0);
  const isSpace = parts.map((p) => /^\s+$/.test(p));
  const strong = parts.map((p, i) => !isSpace[i] && isStrongMathToken(p));

  // A word token joins a math run if it's strong itself, or if it's
  // absorbable AND directly adjacent (ignoring a single space) to a
  // strong token on either side.
  const inRun = new Array(parts.length).fill(false);
  for (let i = 0; i < parts.length; i++) {
    if (isSpace[i]) continue;
    if (strong[i]) {
      inRun[i] = true;
      continue;
    }
    if (!isAbsorbable(parts[i])) continue;
    const prevWord = i >= 2 && isSpace[i - 1] ? i - 2 : i >= 1 && !isSpace[i - 1] ? i - 1 : -1;
    const nextWord = i + 2 < parts.length && isSpace[i + 1] ? i + 2 : i + 1 < parts.length && !isSpace[i + 1] ? i + 1 : -1;
    if ((prevWord >= 0 && strong[prevWord]) || (nextWord >= 0 && strong[nextWord])) {
      inRun[i] = true;
    }
  }
  // A single space between two in-run tokens stays part of the run (so
  // "2x + 5 = 11" merges into one segment instead of five).
  for (let i = 0; i < parts.length; i++) {
    if (isSpace[i] && parts[i].length === 1 && i > 0 && i + 1 < parts.length && inRun[i - 1] && inRun[i + 1]) {
      inRun[i] = true;
    }
  }

  const segments: TextSegment[] = [];
  let buffer = "";
  let bufferIsMath: boolean | null = null;
  for (let i = 0; i < parts.length; i++) {
    const partIsMath = inRun[i];
    if (bufferIsMath === null) {
      bufferIsMath = partIsMath;
      buffer = parts[i];
    } else if (partIsMath === bufferIsMath) {
      buffer += parts[i];
    } else {
      segments.push({ type: bufferIsMath ? "math" : "text", value: buffer });
      buffer = parts[i];
      bufferIsMath = partIsMath;
    }
  }
  if (buffer) segments.push({ type: bufferIsMath ? "math" : "text", value: buffer });

  return segments
    .map((s): TextSegment => (s.type === "math" ? { type: "math", value: shorthandToLatex(s.value.trim()) } : s))
    .filter((s) => s.value.length > 0);
}

/** Finds the matching close-paren for an open-paren at `openIndex`, or -1 if unbalanced. */
function matchingParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Replaces every `sqrt(...)` (case-insensitive) with `\sqrt{...}`, using
 * real paren matching so a nested case like `sqrt((x+1)*(x-1))` doesn't
 * truncate at the first inner `)`. Done as an explicit scan rather than
 * a single regex, since balanced-paren matching isn't something a
 * regular expression can do correctly on its own.
 */
function convertSqrt(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const m = /^sqrt\(/i.exec(rest);
    if (m) {
      const openIndex = i + m[0].length - 1; // index of the "(" itself
      const closeIndex = matchingParen(text, openIndex);
      if (closeIndex !== -1) {
        out += `\\sqrt{${text.slice(openIndex + 1, closeIndex)}}`;
        i = closeIndex + 1;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/**
 * Converts common ASCII math shorthand to LaTeX, so a teacher can type
 * naturally (x^2, sqrt(16), H_2O) without knowing LaTeX syntax at all.
 * Existing backslash commands pass through untouched.
 */
export function shorthandToLatex(run: string): string {
  let out = run;

  out = convertSqrt(out);

  // √16 or √(16) -> \sqrt{16}
  out = out.replace(/√\(([^()]*)\)/g, "\\sqrt{$1}");
  out = out.replace(/√([A-Za-z0-9]+)/g, "\\sqrt{$1}");

  // Exponents / subscripts: wrap the attached value in braces so
  // multi-character exponents (10^-3) render as a single superscript
  // instead of LaTeX's default of just the next character.
  out = out.replace(/\^(-?[A-Za-z0-9]+)/g, "^{$1}");
  out = out.replace(/([A-Za-z0-9])_(-?[A-Za-z0-9]+)/g, "$1_{$2}");

  // Common ASCII comparison shorthand.
  out = out.replace(/<=/g, "\\le ").replace(/>=/g, "\\ge ").replace(/!=/g, "\\ne ");

  return out;
}
