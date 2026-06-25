"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { usePdf } from "@/hooks/usepdf";
import type { ParsedPdf, PdfUploadProps } from "@/types/pdf";
import { Dropzone } from "./dropzone";
import { PdfPreview } from "./pdfpreview";
import { ProgressBar } from "./progressbar";

/**
 * Entry point for the feature. Owns nothing itself — it pulls state from
 * usePdf and renders the right sub-component for each status. The only bit of
 * glue logic is handing the extracted text up to the parent form on success.
 */
export function PdfUpload({ onTextExtracted, disabled }: PdfUploadProps) {
  const { state, upload, reset } = usePdf();

  // Emit the extracted text exactly once per successful parse. The ref keys off
  // the parsed object's identity, so a parent re-render (or an unstable
  // onTextExtracted) can't trigger a duplicate emit.
  const emittedFor = useRef<ParsedPdf | null>(null);
  useEffect(() => {
    if (state.status === "success" && emittedFor.current !== state.parsed) {
      emittedFor.current = state.parsed;
      onTextExtracted(state.parsed.text);
    }
  }, [state, onTextExtracted]);

  if (state.status === "idle") {
    return <Dropzone onFileSelected={upload} disabled={disabled} />;
  }

  if (state.status === "validating" || state.status === "extracting") {
    const progress = state.status === "extracting" ? state.progress : 0;
    return (
      <div className="space-y-3 rounded-lg border bg-muted/20 px-3 py-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          <span className="truncate">{state.meta.name}</span>
        </div>
        <ProgressBar value={progress} label="Extracting text…" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error.message}</span>
        </div>
        <Dropzone onFileSelected={upload} disabled={disabled} />
      </div>
    );
  }

  // success
  const { meta, pageCount } = state.parsed;
  return (
    <div className="space-y-2">
      <PdfPreview meta={meta} onRemove={reset} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5 text-emerald-600" />
        Imported {pageCount} page{pageCount === 1 ? "" : "s"} into your base
        letter below.
      </p>
    </div>
  );
}
