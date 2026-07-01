"use client";

import { useState } from "react";
import { Sparkles, Copy, Check, FileText, Briefcase, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { PdfUpload } from "@/components/pdf_upload/pdfupload";
import { generateCoverLetter } from "@/lib/actions/cover-letter";

export function CoverLetterTailor() {
  const [baseLetter, setBaseLetter] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const canGenerate =
    baseLetter.trim().length > 0 &&
    jobDescription.trim().length > 0 &&
    !isGenerating;

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const result = await generateCoverLetter({ baseLetter, jobDescription });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setResult(result.letter);
      toast.success("Tailored cover letter generated");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success("Cover letter copied to clipboard");
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
          Cover Letter Tailoring
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste your base cover letter and a job description, and generate a
          tailored version targeted to the role.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Your base cover letter
              </CardTitle>
              <CardDescription>
                The template or existing letter you want to adapt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PdfUpload
                disabled={isGenerating}
                onTextExtracted={(text) => {
                  setBaseLetter(text);
                  toast.success("Cover letter imported from PDF");
                }}
              />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or paste it
                <span className="h-px flex-1 bg-border" />
              </div>
              <Label htmlFor="base-letter" className="sr-only">
                Base cover letter
              </Label>
              <Textarea
                id="base-letter"
                value={baseLetter}
                onChange={(e) => setBaseLetter(e.target.value)}
                placeholder="Dear Hiring Manager,&#10;&#10;I am writing to express my interest in…"
                className="min-h-[14rem] resize-y text-sm leading-relaxed"
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
                Paste the posting you&apos;re applying to.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="job-description" className="sr-only">
                Job description
              </Label>
              <Textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the role's responsibilities, requirements, and qualifications…"
                className="min-h-[14rem] resize-y text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            size="lg"
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles />
                Generate tailored cover letter
              </>
            )}
          </Button>
        </div>

        {/* Result / preview */}
        <Card className="lg:sticky lg:top-7 lg:self-start">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="grid gap-1">
                <CardTitle>Tailored cover letter</CardTitle>
                <CardDescription>
                  Your generated letter will appear here.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!result}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="min-h-[20rem] rounded-lg border bg-muted/30 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {result}
              </div>
            ) : (
              <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Sparkles className="size-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  No cover letter yet
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Fill in your base letter and the job description, then hit
                  Generate to see your tailored cover letter here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
