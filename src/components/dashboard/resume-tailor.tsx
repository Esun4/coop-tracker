"use client";

// Client stepper for the resume tailoring pipeline. Owns only UI state: the
// two text inputs and the three step results. All model work happens in the
// resume server actions; each step is gated on the one before it so the flow
// reads top-to-bottom like the manual prompt sequence it replaces.

import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/lib/actions/resume";
import type {
  JobAnalysis,
  TailoredResume,
  ResumeComparison,
} from "@/lib/resume-prompt";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
      {n}
    </span>
  );
}

export function ResumeTailor() {
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [comparison, setComparison] = useState<ResumeComparison | null>(null);

  // One step runs at a time; a single flag keeps the buttons honest.
  const [running, setRunning] = useState<"analyze" | "tailor" | "compare" | null>(null);
  const [copied, setCopied] = useState(false);

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
      setTailored(null);
      setComparison(null);
    } finally {
      setRunning(null);
    }
  }

  async function handleTailor() {
    if (!analysis) return;
    setRunning("tailor");
    try {
      const result = await tailorResume({ resume, jobDescription, analysis });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setTailored(result.data);
      setComparison(null);
    } finally {
      setRunning(null);
    }
  }

  async function handleCompare() {
    if (!tailored) return;
    setRunning("compare");
    try {
      const result = await compareResumes({
        originalResume: resume,
        tailoredResume: tailored.tailoredResume,
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

  async function handleCopy() {
    if (!tailored) return;
    try {
      await navigator.clipboard.writeText(tailored.tailoredResume);
      setCopied(true);
      toast.success("Tailored resume copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Resume Tailoring
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste your resume and a job description, then work through the three
          steps: analyze the posting, tailor your resume to it, and review
          exactly what changed.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUser className="size-4 text-muted-foreground" />
                Your resume
              </CardTitle>
              <CardDescription>
                The resume you want tailored. Only what&apos;s on it will be
                used — nothing gets invented.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <Label htmlFor="resume-text" className="sr-only">
                Resume
              </Label>
              <Textarea
                id="resume-text"
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                placeholder="Jane Doe — Software Engineering Student&#10;&#10;EXPERIENCE&#10;…"
                className="min-h-[16rem] resize-y text-sm leading-relaxed"
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

        {/* Results: the three steps, stacked */}
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

          {/* Step 2 — tailored resume */}
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
                      Reworded for this posting — no new claims added.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {tailored.tailoredResume}
                </div>

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

                <Button
                  variant="outline"
                  onClick={handleCompare}
                  disabled={running !== null}
                  className="w-full"
                >
                  {running === "compare" ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Comparing versions…
                    </>
                  ) : (
                    <>
                      <Columns2 />
                      Compare with original
                    </>
                  )}
                </Button>
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