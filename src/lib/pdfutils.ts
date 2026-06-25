// Pure, framework-free helpers for the PDF upload feature.
//
// Nothing here knows about React or the upload state machine — these are plain
// functions the hook (src/hooks/usepdf.ts) composes. Keeping them isolated
// makes each one trivially testable and reusable.

import type {
  ParsedPdf,
  PdfFileMeta,
  PdfUploadError,
  PdfValidationConfig,
} from "@/types/pdf";

/**
 * Single source of truth for what counts as an acceptable upload. Both the
 * dropzone's `accept` attribute and the runtime `validateFile` check read from
 * here, so they can never drift apart.
 */
export const PDF_VALIDATION_CONFIG: PdfValidationConfig = {
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB — generous for a cover letter
  acceptedMimeTypes: ["application/pdf"],
};

/** Human-readable file size, e.g. 1536 -> "1.5 KB". Used by the preview UI. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);
  // Whole bytes have no decimals; larger units get one decimal place.
  const formatted = exponent === 0 ? value.toString() : value.toFixed(1);
  return `${formatted} ${units[exponent]}`;
}

/** Pull the small, serialisable slice of a File we keep in state. */
export function toFileMeta(file: File): PdfFileMeta {
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
}

/**
 * Validate a file against the config. Returns `null` when the file is
 * acceptable, or a `PdfUploadError` (with a ready-to-show message) when not.
 * Returning instead of throwing keeps the caller's control flow flat.
 *
 * Note: a `.pdf` extension fallback exists because some browsers report an
 * empty `type` for files dropped (rather than picked), so we don't reject a
 * genuine PDF just because the OS didn't tag its MIME type.
 */
export function validateFile(
  file: File,
  config: PdfValidationConfig = PDF_VALIDATION_CONFIG,
): PdfUploadError | null {
  if (file.size === 0) {
    return { code: "empty-file", message: "That file is empty." };
  }

  const typeOk = config.acceptedMimeTypes.includes(file.type);
  const extensionOk = file.name.toLowerCase().endsWith(".pdf");
  if (!typeOk && !extensionOk) {
    return { code: "invalid-type", message: "Please upload a PDF file." };
  }

  if (file.size > config.maxSizeBytes) {
    return {
      code: "file-too-large",
      message: `File is too large (max ${formatFileSize(config.maxSizeBytes)}).`,
    };
  }

  return null;
}

/**
 * Extract plain text from a PDF entirely in the browser.
 *
 * `pdfjs-dist` is imported dynamically so the (large) parser and its web worker
 * are only fetched when a user actually uploads — they never weigh down the
 * initial page load, and this file stays safe to import in any context.
 *
 * @param onProgress optional 0–100 callback, fired once per page, so the UI can
 *   show a real progress bar rather than an indefinite spinner.
 * @throws if the PDF can't be parsed; the hook maps that to an "extraction-failed"
 *   error. A successfully-parsed-but-textless PDF (e.g. a scan) returns empty
 *   `text`, which the hook treats as the "no-text" case.
 */
export async function extractText(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ParsedPdf> {
  const pdfjs = await import("pdfjs-dist");

  // Point pdfjs at its worker. `new URL(..., import.meta.url)` lets the bundler
  // emit the worker as an asset and hand back the correct hashed URL.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = doc.numPages;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    // Each item is a text fragment; non-text items (marked content) have no `str`.
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
    onProgress?.(Math.round((pageNum / pageCount) * 100));
  }

  return {
    meta: toFileMeta(file),
    text: pages.join("\n\n").trim(),
    pageCount,
  };
}
