import { DIAGRAM_MARKER } from "./questionImportParser";

/**
 * Converts the HTML mammoth produces (via convertToHtml, configured in
 * the parse-import route to tag every image with a recognizable alt
 * text) into plain text the line-based parser can read — one line per
 * paragraph/list item, each image replaced with DIAGRAM_MARKER so
 * lib/questionImportParser.ts can tell exactly which question originally
 * had a diagram.
 *
 * This is a small, purpose-built converter for mammoth's own HTML output
 * shape specifically (p/li/h1-6/br/img, plus common inline formatting
 * tags) — not a general HTML parser. Good enough for exam documents,
 * which don't need table or arbitrary nested-structure support here.
 */
export function mammothHtmlToText(html: string): string {
  let out = html;

  // Mark every image before anything else touches the markup, using the
  // alt text the caller set (see parse-import/route.ts) rather than
  // assuming a fixed attribute order.
  out = out.replace(/<img\b[^>]*>/gi, DIAGRAM_MARKER);

  // Block-level and line-break elements become real newlines so each
  // paragraph/list item lines up with the question/option structure the
  // parser expects — do this before stripping tags generally.
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/(p|li|h[1-6]|div|tr)>/gi, "\n");

  // Strip every remaining tag, keeping only its text content.
  out = out.replace(/<[^>]+>/g, "");

  // Decode the small set of HTML entities mammoth's own output actually
  // uses — not a full entity table, just enough for exam text.
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  out = out.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_m, name: string) => entities[name]);
  out = out.replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));

  // Collapse runs of 3+ blank lines left behind by now-empty paragraphs.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}
