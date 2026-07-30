"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProBadge } from "@/components/ui/pro-badge";
import { PRO_FEATURE_COPY } from "@/lib/pro";
import { ResumeTailor } from "./resume-tailor";
import { CoverLetterTailor } from "./cover-letter-tailor";
import { UpgradeDialog, useUpgradePrompt } from "./upgrade-dialog";

/**
 * One workspace instead of two pages.
 *
 * Resume Tailoring and Cover Letter Tailoring were near-identical screens that
 * each asked for the same job posting and each sat empty until you pasted it.
 * They become tabs off a single page, so the posting is the thing you pick and
 * the document is just a view of it.
 *
 * The tailoring engines themselves are unchanged — this is the shell that
 * merges them, and the paywall that fronts them. Both tailors are Pro; a free
 * account gets the pitch in their place rather than a dead-end 404, so the
 * nav entry still leads somewhere that explains itself.
 */

const TABS = [
  { id: "resume", label: "Resume" },
  { id: "cover", label: "Cover letter" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DocumentsWorkspace({ isPro }: { isPro: boolean }) {
  const [tab, setTab] = useState<TabId>("resume");
  const upgrade = useUpgradePrompt();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-5">
        <div>
          <h1 className="font-heading text-title tracking-title flex items-center gap-2.5 font-semibold">
            Tailor for a posting
            {!isPro && <ProBadge />}
          </h1>
          <p className="text-body text-muted-foreground mt-1.5">
            Paste the posting once — the resume and the letter both work from it.
          </p>
        </div>

        {/* No tab strip when both tabs are locked — it would be two controls
            that lead to the same wall. */}
        {isPro && (
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
        )}
      </div>

      {isPro ? (
        <>
          {/* Both are kept mounted so switching tabs never discards a draft. */}
          <div className={tab === "resume" ? "" : "hidden"}>
            <ResumeTailor />
          </div>
          <div className={tab === "cover" ? "" : "hidden"}>
            <CoverLetterTailor />
          </div>
        </>
      ) : (
        <div className="bg-card border-border flex flex-col items-center rounded-xl border px-6 py-14 text-center">
          <div className="bg-secondary rounded-full p-3">
            <Lock className="text-muted-foreground size-5" aria-hidden />
          </div>
          <h2 className="text-lede mt-4 font-semibold">
            {PRO_FEATURE_COPY.tailoring.title}
          </h2>
          <p className="text-body text-muted-foreground mt-2 max-w-md leading-relaxed">
            {PRO_FEATURE_COPY.tailoring.description}
          </p>
          <Button
            className="mt-6"
            onClick={() => upgrade.request("tailoring")}
          >
            See what Pro includes
          </Button>
        </div>
      )}

      <UpgradeDialog {...upgrade.dialogProps} />
    </div>
  );
}
