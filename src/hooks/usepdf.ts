"use client";

import { useCallback, useState } from "react";

import { extractText, toFileMeta, validateFile } from "@/lib/pdfutils";
import type { PdfUploadState, UsePdfReturn } from "@/types/pdf";

/**
 * Owns the PDF upload state machine. This is the only place `PdfUploadState`
 * transitions, so the components stay dumb: they read `state` and call
 * `upload` / `reset`. It orchestrates the pure helpers from lib/pdfutils
 * (validate -> extract) and decides how each outcome maps to a state.
 */
export function usePdf(): UsePdfReturn {
  const [state, setState] = useState<PdfUploadState>({ status: "idle" });

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const upload = useCallback(async (file: File) => {
    const meta = toFileMeta(file);

    // 1) Validate synchronously. A rejection is an expected outcome, not a throw.
    setState({ status: "validating", meta });
    const validationError = validateFile(file);
    if (validationError) {
      setState({ status: "error", error: validationError, meta });
      return;
    }

    // 2) Extract text, streaming page-by-page progress into the state.
    setState({ status: "extracting", meta, progress: 0 });
    try {
      const parsed = await extractText(file, (progress) =>
        setState({ status: "extracting", meta, progress }),
      );

      // A scan/image PDF parses fine but yields no selectable text.
      if (!parsed.text) {
        setState({
          status: "error",
          meta,
          error: {
            code: "no-text",
            message:
              "We couldn't find any text in that PDF — if it's a scan, paste the text manually.",
          },
        });
        return;
      }

      setState({ status: "success", parsed });
    } catch {
      setState({
        status: "error",
        meta,
        error: {
          code: "extraction-failed",
          message: "We couldn't read that PDF. Try a different file.",
        },
      });
    }
  }, []);

  return { state, upload, reset };
}
