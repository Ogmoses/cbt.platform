# Fonts

Report-card PDFs no longer need any font files here: `ReportCardDocument.tsx`
uses react-pdf's built-in Helvetica. This folder is intentionally empty.

Caveat: built-in fonts only cover Latin-1 characters, so letters such as
Yoruba "ẹ", "ọ", "ṣ" may not render in PDFs. If that becomes a problem, add a
`.ttf` that includes them and `Font.register` it with a path the server can
read from disk (e.g. via `path.join(process.cwd(), ...)` plus
`outputFileTracingIncludes` in `next.config.ts`) — a `/fonts/...` URL path
does not work for server-side rendering.
