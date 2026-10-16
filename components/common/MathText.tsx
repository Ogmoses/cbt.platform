"use client";

/**
 * MathText — drop-in replacement for rendering any question prompt,
 * answer option, or reference answer that might contain a math
 * expression. No special input needed from whoever wrote the text (see
 * lib/mathDetect.ts for the detection heuristic and its known limits) —
 * "the area of a circle is πr^2" renders with a real superscript
 * automatically.
 *
 * Uses katex.renderToString (synchronous, no network, no external
 * fonts beyond what's bundled) rather than a full KaTeX React wrapper —
 * simpler and faster for short inline runs like these. Malformed LaTeX
 * (most likely from the explicit $...$ / \(...\) escape hatch, since the
 * auto-detected shorthand path can't easily produce invalid LaTeX) falls
 * back to showing the raw text instead of throwing, so one bad formula
 * never breaks the whole page.
 */

import { useMemo } from "react";
import katex from "katex";
import { splitMathSegments } from "@/lib/mathDetect";

export default function MathText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMathSegments(text ?? ""), [text]);

  if (segments.length === 0) return null;

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") return <span key={i}>{seg.value}</span>;
        const html = renderKatex(seg.value);
        if (html === null) return <span key={i}>{seg.value}</span>;
        // eslint-disable-next-line react/no-danger
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}

function renderKatex(latex: string): string | null {
  try {
    return katex.renderToString(latex, { throwOnError: false, output: "html", strict: false });
  } catch {
    return null;
  }
}
