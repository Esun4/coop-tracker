"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";
import { PDF_VALIDATION_CONFIG, formatFileSize } from "@/lib/pdfutils";
import type { DropzoneProps } from "@/types/pdf";

/**
 * The drop target + hidden file input. Its only job is to surface a single
 * chosen File via `onFileSelected` — it does no validation or parsing itself
 * (the hook handles that). Drag-hover styling is local UI state.
 */
export function Dropzone({ onFileSelected, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/20 hover:bg-muted/40",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UploadCloud className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">
        Drop a PDF here, or click to browse
      </p>
      <p className="text-xs text-muted-foreground">
        PDF only, up to {formatFileSize(PDF_VALIDATION_CONFIG.maxSizeBytes)}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          // Reset so selecting the same file again still fires onChange.
          e.target.value = "";
        }}
      />
    </div>
  );
}
