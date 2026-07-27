"use client";

import { useState } from "react";
import { ResumeTailor } from "./resume-tailor";
import { CoverLetterTailor } from "./cover-letter-tailor";

/**
 * One workspace instead of two pages.
 *
 * Resume Tailoring and Cover Letter Tailoring were near-identical screens that
 * each asked for the same job posting and each sat empty until you pasted it.
 * They become tabs off a single page, so the posting is the thing you pick and
 * the document is just a view of it.
 *
 * The tailoring engines themselves are unchanged — this is the shell that
 * merges them.
 */

const TABS = [
  { id: "resume", label: "Resume" },
  { id: "cover", label: "Cover letter" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DocumentsWorkspace() {
  const [tab, setTab] = useState<TabId>("resume");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-5">
        <div>
          <h1 className="font-heading text-title tracking-title font-semibold">
            Tailor for a posting
          </h1>
          <p className="text-body text-muted-foreground mt-1.5">
            Paste the posting once — the resume and the letter both work from it.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Document type"
          className="bg-secondary flex shrink-0 rounded-md p-0.5"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`text-meta rounded-sm px-3 py-[5px] transition-colors ${
                tab === t.id
                  ? "bg-card text-foreground font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Both are kept mounted so switching tabs never discards a draft. */}
      <div className={tab === "resume" ? "" : "hidden"}>
        <ResumeTailor />
      </div>
      <div className={tab === "cover" ? "" : "hidden"}>
        <CoverLetterTailor />
      </div>
    </div>
  );
}
