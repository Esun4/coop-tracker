// Client-side LaTeX compilation for the resume preview, via texlive.net's
// latexcgi service (the same API learnlatex.org uses from the browser, so
// CORS is open). The user's .tex is sent to that external service — the UI
// says so next to the compile button; nothing goes through our own server.

export type LatexCompileResult =
  | { ok: true; pdf: Blob }
  | { ok: false; log: string };

const LATEXCGI_URL = "https://texlive.net/cgi-bin/latexcgi";

export async function compileLatex(
  source: string,
  engine: "pdflatex" | "xelatex" | "lualatex" = "pdflatex"
): Promise<LatexCompileResult> {
  const form = new FormData();
  form.append("filecontents[]", source);
  form.append("filename[]", "document.tex");
  form.append("engine", engine);
  form.append("return", "pdf");

  const res = await fetch(LATEXCGI_URL, { method: "POST", body: form });

  // latexcgi returns the compile log (as text) instead of a PDF when
  // compilation fails, so the content type is the success signal.
  const contentType = res.headers.get("content-type") ?? "";
  if (res.ok && contentType.includes("pdf")) {
    return { ok: true, pdf: await res.blob() };
  }

  const log = await res.text();
  return { ok: false, log: extractLatexErrors(log) };
}

/**
 * A full LaTeX log is hundreds of lines; keep the lines that start with "!"
 * (TeX's error marker) plus a little trailing context so the user sees what
 * actually broke. Falls back to the log tail when no "!" line exists.
 */
export function extractLatexErrors(log: string): string {
  const lines = log.split("\n");
  const picked: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("!")) {
      picked.push(...lines.slice(i, i + 3));
    }
  }
  if (picked.length > 0) return picked.join("\n").slice(0, 2000);
  return lines.slice(-30).join("\n").slice(0, 2000);
}
