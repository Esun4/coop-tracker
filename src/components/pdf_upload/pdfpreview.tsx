"use client";

import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/pdfutils";
import type { PdfPreviewProps } from "@/types/pdf";

/**
 * Shows the selected file's name + size with a button to clear it. Renders from
 * `PdfFileMeta` (not the raw File), so it never touches the filesystem.
 */
export function PdfPreview({ meta, onRemove }: PdfPreviewProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        <FileText className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{meta.name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(meta.size)}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Remove file"
      >
        <X />
      </Button>
    </div>
  );
}
