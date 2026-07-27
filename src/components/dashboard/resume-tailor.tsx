"use client";

// Client stepper for the resume tailoring pipeline. Owns only UI state: the
// inputs, the three step results, the editable draft, and the preview. All
// model work happens in the resume server actions; each step is gated on the
// one before it so the flow reads top-to-bottom like the manual prompt
// sequence it replaces.
//
// Two input formats:
//  - "text": pasted/PDF-extracted resume prose; preview renders an ATS-safe
//    text PDF client-side.
//  - "latex": the full Overleaf .tex source; the model edits text content in
//    place and the result pastes straight back into Overleaf. Preview
//    compiles via texlive.net (external service — labeled in the UI).

import { useRef, useState } from "react";
import {
  FileUser,
  Briefcase,
  ScanSearch,
  Sparkles,
  Columns2,
  Copy,
  Check,
  Loader2,
  Lightbulb,
  FileCode2,
  Eye,
  Download,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { PdfUpload } from "@/components/pdf_upload/pdfupload";
import {
  analyzeJobForResume,
  tailorResume,
  compareResumes,
  refineResume,
} from "@/lib/actions/resume";
import type {
  JobAnalysis,
  TailoredResume,
  ResumeComparison,
} from "@/lib/resume-prompt";
import type { ResumeFormat } from "@/lib/schemas";
import { compileLatex } from "@/lib/latex-compile";

const MAX_RESUME_CHARS = 20000;

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
      {n}
    </span>
  );
}

export function ResumeTailor() {
  const [format, setFormat] = useState<ResumeFormat>("text");
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  // The working copy of the tailored resume: user edits and refine passes
  // land here, and compare/preview/copy all read from here — so what you see
  // is always what gets used.
  const [draft, setDraft] = useState("");
  const [comparison, setComparison] = useState<ResumeComparison | null>(null);
  const [refineHistory, setRefineHistory] = useState<string[]>([]);
  const [refineInput, setRefineInput] = useState("");

  const [running, setRunning] = useState<
    "analyze" | "tailor" | "compare" | "refine" | null
  >(null);
  const [copied, setCopied] = useState(false);

  // Preview state (client-side render for text, texlive.net for latex).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const texFileRef = useRef<HTMLInputElement>(null);

  function resetDownstream() {
    setTailored(null);
    setDraft("");
    setComparison(null);
    setRefineHistory([]);
    setPreviewError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  function switchFormat(next: ResumeFormat) {
    if (next === format) return;
    setFormat(next);
    setResume("");
    // Tailored output is format-specific; keep the (format-agnostic) analysis.
    resetDownstream();
  }

  async function handleTexFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    if (text.length > MAX_RESUME_CHARS) {
      toast.error(`That .tex file is too large (${MAX_RESUME_CHARS.toLocaleString()} character max).`);
      return;
    }
    setResume(text);
    toast.success("LaTeX source loaded");
  }

  async function handleAnalyze() {
    setRunning("analyze");
    try {
      const result = await analyzeJobForResume({ jobDescription });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setAnalysis(result.data);
      // A fresh analysis invalidates everything built on the old one.
      resetDownstream();
    } finally {
      setRunning(null);
    }
  }

  async function handleTailor() {
    if (!analysis) return;
    setRunning("tailor");
    try {
      const result = await tailorResume({ resume, jobDescription, analysis, format });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setTailored(result.data);
      setDraft(result.data.tailoredResume);
      setComparison(null);
      setRefineHistory([]);
    } finally {
      setRunning(null);
    }
  }

  async function handleRefine() {
    const instruction = refineInput.trim();
    if (!instruction || !draft) return;
    setRunning("refine");
    try {
      const result = await refineResume({
        resume: draft,
        instruction,
        jobDescription,
        format,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setDraft(result.data.revised);
      setRefineHistory((h) => [...h, instruction]);
      setRefineInput("");
      // The comparison and preview now describe an older draft.
      setComparison(null);
      toast.success("Change applied");
    } finally {
      setRunning(null);
    }
  }

  async function handleCompare() {
    if (!draft) return;
    setRunning("compare");
    try {
      const result = await compareResumes({
        originalResume: resume,
        tailoredResume: draft,
        format,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setComparison(result.data);
    } finally {
      setRunning(null);
    }
  }

  async function handlePreview() {
    if (!draft) return;
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      let blob: Blob;
      if (format === "latex") {
        const result = await compileLatex(draft);
        if (!result.ok) {
          setPreviewError(result.log);
          return;
        }
        blob = result.pdf;
      } else {
        const { renderTextResumePdf } = await import(
          "@/components/pdf_export/text-resume-pdf"
        );
        blob = await renderTextResumePdf(draft);
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setPreviewError(
        format === "latex"
          ? "Couldn't reach the LaTeX compile service. Try again in a moment."
          : "Couldn't render the preview. Please try again."
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleDownload() {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `resume-${new Date().toISOString().split("T")[0]}.pdf`;
    link.click();
  }

  async function handleCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast.success(
        format === "latex"
          ? "LaTeX source copied — paste it into Overleaf"
          : "Tailored resume copied to clipboard"
      );
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <div className="space-y-6">

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="grid gap-1">
                  <CardTitle className="flex items-center gap-2">
                    <FileUser className="size-4 text-muted-foreground" />
                    Your resume
                  </CardTitle>
                  <CardDescription>
                    Only what&apos;s on it will be used — nothing gets
                    invented.
                  </CardDescription>
                </div>

                {/* Format toggle */}
                <div className="flex rounded-lg border overflow-hidden shrink-0">
                  {(
                    [
                      { value: "text", label: "Text" },
                      { value: "latex", label: "LaTeX" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => switchFormat(opt.value)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        format === opt.value
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {format === "text" ? (
                <>
                  <PdfUpload
                    disabled={running !== null}
                    onTextExtracted={(text) => {
                      setResume(text);
                      toast.success("Resume imported from PDF");
                    }}
                  />
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or paste it
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              ) : (
                <>
                  <input
                    ref={texFileRef}
                    type="file"
                    accept=".tex"
                    className="hidden"
                    onChange={(e) => {
                      handleTexFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={running !== null}
                    onClick={() => texFileRef.current?.click()}
                  >
                    <FileCode2 />
                    Upload .tex file
                  </Button>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or paste the Overleaf source
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}
              <Label htmlFor="resume-text" className="sr-only">
                Resume
              </Label>
              <Textarea
                id="resume-text"
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                placeholder={
                  format === "latex"
                    ? "\\documentclass{article}\n…paste your full .tex source…"
                    : "Jane Doe — Software Engineering Student\n\nEXPERIENCE\n…"
                }
                className={`min-h-[16rem] resize-y text-sm leading-relaxed ${
                  format === "latex" ? "font-mono text-xs" : ""
                }`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="size-4 text-muted-foreground" />
                Job description
              </CardTitle>
              <CardDescription>
                Paste the posting you&apos;re targeting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="resume-jd" className="sr-only">
                Job description
              </Label>
              <Textarea
                id="resume-jd"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the role's responsibilities, requirements, and qualifications…"
                className="min-h-[12rem] resize-y text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          <Button
            onClick={handleAnalyze}
            disabled={jobDescription.trim().length === 0 || running !== null}
            size="lg"
            className="w-full"
          >
            {running === "analyze" ? (
              <>
                <Loader2 className="animate-spin" />
                Analyzing posting…
              </>
            ) : (
              <>
                <ScanSearch />
                {analysis ? "Re-analyze posting" : "Analyze posting"}
              </>
            )}
          </Button>
        </div>

        {/* Results: the steps, stacked */}
        <div className="space-y-6">
          {/* Step 1 — posting analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StepBadge n={1} />
                Posting analysis
              </CardTitle>
              <CardDescription>
                The top responsibilities and keywords your resume should speak
                to.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis ? (
                <div className="space-y-5">
                  <ol className="space-y-3">
                    {analysis.responsibilities.map((r, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="font-mono text-xs text-primary pt-0.5">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>
                          <span className="font-medium">{r.responsibility}</span>{" "}
                          <span className="text-muted-foreground">
                            — {r.whyItMatters}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Keyword</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.keywords.map((k) => (
                        <TableRow key={k.keyword}>
                          <TableCell className="font-medium">
                            {k.keyword}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {k.section}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {k.count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Button
                    onClick={handleTailor}
                    disabled={resume.trim().length === 0 || running !== null}
                    className="w-full"
                  >
                    {running === "tailor" ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Tailoring resume…
                      </>
                    ) : (
                      <>
                        <Sparkles />
                        Tailor resume to this posting
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Run the analysis to see what this posting cares about.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Step 2 — tailored resume: editable draft + refine + preview */}
          {tailored && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-1">
                    <CardTitle className="flex items-center gap-2">
                      <StepBadge n={2} />
                      Tailored resume
                    </CardTitle>
                    <CardDescription>
                      {format === "latex"
                        ? "Your modified .tex — edit it here, then paste it back into Overleaf."
                        : "Reworded for this posting — edit it directly, no new claims added."}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className={`min-h-[20rem] resize-y leading-relaxed ${
                    format === "latex" ? "font-mono text-xs" : "text-sm"
                  }`}
                  aria-label="Tailored resume draft"
                />

                {tailored.quantificationFlags.length > 0 && (
                  <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Lightbulb className="size-3.5" />
                      Worth quantifying
                    </p>
                    {tailored.quantificationFlags.map((flag, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-3 text-sm dark:border-amber-400/25 dark:bg-amber-400/5"
                      >
                        <p className="font-medium">{flag.bullet}</p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
                          {flag.suggestions.map((s, j) => (
                            <li key={j}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {/* Refine loop */}
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Ask for a change
                  </p>
                  {refineHistory.length > 0 && (
                    <ul className="space-y-1">
                      {refineHistory.map((h, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <Check className="size-3 shrink-0 text-primary" />
                          <span className="truncate">{h}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={refineInput}
                      onChange={(e) => setRefineInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRefine();
                      }}
                      placeholder='e.g. "Make the second experience bullet more concise"'
                      className="h-9 text-sm"
                      disabled={running !== null}
                    />
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={handleRefine}
                      disabled={refineInput.trim().length === 0 || running !== null}
                    >
                      {running === "refine" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                      Apply
                    </Button>
                  </div>
                </div>

                {/* Preview + compare actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={handlePreview}
                    disabled={isPreviewing || running !== null}
                    className="flex-1"
                  >
                    {isPreviewing ? (
                      <>
                        <Loader2 className="animate-spin" />
                        {format === "latex" ? "Compiling…" : "Rendering…"}
                      </>
                    ) : (
                      <>
                        <Eye />
                        {previewUrl ? "Refresh preview" : "Preview PDF"}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCompare}
                    disabled={running !== null}
                    className="flex-1"
                  >
                    {running === "compare" ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Comparing…
                      </>
                    ) : (
                      <>
                        <Columns2 />
                        Compare with original
                      </>
                    )}
                  </Button>
                </div>
                {format === "latex" && (
                  <p className="text-xs text-muted-foreground">
                    LaTeX previews are compiled by texlive.net — your .tex is
                    sent to that external service.
                  </p>
                )}

                {previewError && (
                  <pre className="max-h-48 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-xs text-destructive whitespace-pre-wrap">
                    {previewError}
                  </pre>
                )}

                {previewUrl && !previewError && (
                  <div className="space-y-2">
                    <iframe
                      src={previewUrl}
                      title="Resume PDF preview"
                      className="h-[32rem] w-full rounded-lg border bg-white"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      className="w-full"
                    >
                      <Download />
                      Download PDF
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3 — what changed */}
          {comparison && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StepBadge n={3} />
                  What changed
                </CardTitle>
                <CardDescription>
                  Every meaningful edit, side by side, with the reason for it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {comparison.changes.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No meaningful changes were reported.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {comparison.changes.map((c, i) => (
                      <div key={i} className="rounded-lg border px-3.5 py-3 text-sm">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {c.section}
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md bg-muted/40 px-2.5 py-2 text-muted-foreground">
                            {c.original}
                          </div>
                          <div className="rounded-md bg-primary/5 px-2.5 py-2">
                            {c.tailored}
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {c.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}