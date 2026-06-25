// Shared types for the PDF upload feature on the cover-letter tailoring page.
//
// The flow these types describe: a user drops/selects a PDF -> we validate it
// -> we extract its text -> the text is handed back to the cover-letter form.
// Everything here is library-agnostic on purpose, so swapping the underlying
// PDF parser (pdfjs-dist, pdf-parse, a server action, etc.) never touches the
// component or hook contracts.

/**
 * Every reason a file can be rejected, kept as a string union so the UI can map
 * each code to a human message without a pile of booleans.
 */
export type PdfUploadErrorCode =
  | "invalid-type" // not a PDF
  | "file-too-large" // exceeds maxSizeBytes
  | "empty-file" // 0 bytes
  | "extraction-failed" // parser threw
  | "no-text"; // parsed fine but contained no selectable text (e.g. a scan)

export interface PdfUploadError {
  code: PdfUploadErrorCode;
  /** Ready-to-display message; the source of truth for what the user sees. */
  message: string;
}

/**
 * Lightweight, serialisable metadata about the selected file. We keep this
 * instead of holding the raw `File` in state so the preview/progress UI can
 * render without re-reading the file off disk.
 */
export interface PdfFileMeta {
  name: string;
  /** Size in bytes; format for display with `formatFileSize` in lib/pdfutils. */
  size: number;
  lastModified: number;
}

/** The successful result of parsing a PDF. */
export interface ParsedPdf {
  meta: PdfFileMeta;
  /** Extracted plain text, ready to drop into the base-letter textarea. */
  text: string;
  pageCount: number;
}

/**
 * Discriminated union over `status` describing every state the upload can be in.
 * Because each variant carries only the data valid for that state, impossible
 * combinations (e.g. a "success" with an error) won't type-check.
 */
export type PdfUploadState =
  | { status: "idle" }
  | { status: "validating"; meta: PdfFileMeta }
  | { status: "extracting"; meta: PdfFileMeta; progress: number } // progress: 0–100
  | { status: "success"; parsed: ParsedPdf }
  | { status: "error"; error: PdfUploadError; meta?: PdfFileMeta };

/** Public API returned by the `usePdf` hook in src/hooks/usepdf.ts. */
export interface UsePdfReturn {
  state: PdfUploadState;
  /** Validate then extract text from a dropped/selected file. */
  upload: (file: File) => Promise<void>;
  /** Clear back to the idle state. */
  reset: () => void;
}

/**
 * Validation rules consumed by the helpers in src/lib/pdfutils.ts. Centralising
 * these means the dropzone's `accept` attribute and the runtime check can read
 * from one source.
 */
export interface PdfValidationConfig {
  maxSizeBytes: number;
  acceptedMimeTypes: readonly string[];
}

// ---------------------------------------------------------------------------
// Component prop contracts
// ---------------------------------------------------------------------------

/** Top-level component that wires the dropzone, preview, and progress together. */
export interface PdfUploadProps {
  /** Called with the extracted text once a PDF is successfully parsed. */
  onTextExtracted: (text: string) => void;
  disabled?: boolean;
}

export interface DropzoneProps {
  /** Fires once a single file has been chosen (click or drag-and-drop). */
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export interface PdfPreviewProps {
  meta: PdfFileMeta;
  /** Clears the current file and returns the uploader to idle. */
  onRemove: () => void;
}

export interface ProgressBarProps {
  /** 0–100. */
  value: number;
  label?: string;
}
