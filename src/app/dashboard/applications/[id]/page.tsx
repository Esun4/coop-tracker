import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronUp, ChevronDown, FileText } from "lucide-react";
import {
  getApplicationDetail,
  getStageIntervals,
} from "@/lib/actions/applications";
import { statusLabels, type ApplicationStatusType } from "@/lib/schemas";
import { isClosedStage, stageDepth, STAGE_COUNT } from "@/lib/stage";
import { StageChip, StageMeter } from "@/components/ui/stage-indicator";
import { Monogram } from "@/components/ui/monogram";
import { Button } from "@/components/ui/button";
import { StageStepper } from "@/components/dashboard/detail/stage-stepper";
import { DeadlineCard } from "@/components/dashboard/detail/deadline-card";
import { HistoryRail } from "@/components/dashboard/detail/history-rail";
import { CloseOutCard } from "@/components/dashboard/detail/close-out-card";

/** The stage each cleared step was first reached, read out of the ledger. */
function clearedDates(
  logs: { details: unknown; createdAt: Date; action: string }[],
  applicationDate: Date | null,
) {
  const cleared: Partial<Record<ApplicationStatusType, Date>> = {};
  if (applicationDate) cleared.APPLIED = applicationDate;

  // Oldest first, so the first time a stage was reached wins.
  for (const log of [...logs].reverse()) {
    const details = (log.details ?? {}) as { status?: { to?: string } };
    const to = details.status?.to as ApplicationStatusType | undefined;
    if (to && !cleared[to]) cleared[to] = log.createdAt;
    if (log.action === "created" && !cleared.APPLIED) {
      cleared.APPLIED = log.createdAt;
    }
  }
  return cleared;
}

function daysSince(date: Date) {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, intervals] = await Promise.all([
    getApplicationDetail(id),
    getStageIntervals(),
  ]);

  if (!detail) notFound();

  const { application, position, total, prevId, nextId } = detail;
  const status = application.status as ApplicationStatusType;

  // Closed applications have no detail view — deliberately out of scope.
  if (isClosedStage(status)) redirect("/dashboard");

  const cleared = clearedDates(application.activityLogs, application.applicationDate);
  const inStageSince = cleared[status];

  return (
    <div className="-mx-8 -my-7 lg:-mx-16">
      {/* Sub-header: leave, and walk the cycle without going back to the table. */}
      <div className="border-border-subtle bg-card flex items-center justify-between gap-4 border-b px-8 py-3 lg:px-16">
        <div className="text-meta text-muted-foreground flex items-center gap-2">
          <ArrowLeft className="size-3.5" />
          <Link href="/dashboard" className="hover:text-foreground">
            Applications
          </Link>
          <span className="opacity-50">/</span>
          <span className="text-foreground">{application.company}</span>
        </div>

        <div className="text-caption text-muted-foreground flex items-center gap-2.5">
          {position != null && (
            <span>
              {position} of {total} in play
            </span>
          )}
          <Link
            href={prevId ? `/dashboard/applications/${prevId}` : "#"}
            aria-disabled={!prevId}
            aria-label="Previous application"
            tabIndex={prevId ? undefined : -1}
            className={`border-border flex size-6 items-center justify-center rounded-sm border ${
              prevId ? "hover:text-foreground" : "pointer-events-none opacity-45"
            }`}
          >
            <ChevronUp className="size-3" />
          </Link>
          <Link
            href={nextId ? `/dashboard/applications/${nextId}` : "#"}
            aria-disabled={!nextId}
            aria-label="Next application"
            tabIndex={nextId ? undefined : -1}
            className={`border-border flex size-6 items-center justify-center rounded-sm border ${
              nextId ? "hover:text-foreground" : "pointer-events-none opacity-45"
            }`}
          >
            <ChevronDown className="size-3" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-[22px] px-8 pt-[30px] pb-11 lg:px-16">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-3.5">
            <Monogram name={application.company} size="lg" />
            <div>
              <h1 className="font-heading text-[27px] font-semibold tracking-title">
                {application.company}
              </h1>
              <p className="text-lede text-foreground-2 mt-1">
                {[application.roleTitle, application.location]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-2.5 flex items-center gap-2.5">
                <StageChip status={status} size="lg" />
                <StageMeter status={status} size="lg" />
                <span className="text-meta text-muted-foreground">
                  stage {stageDepth(status)} of {STAGE_COUNT}
                  {inStageSince && ` · ${daysSince(inStageSince)} days here`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/dashboard/resume" />}>
              <FileText className="mr-1.5 size-3.5" />
              Tailor documents
            </Button>
          </div>
        </div>

        <StageStepper
          status={status}
          clearedAt={cleared}
          intervals={intervals}
        />

        <div className="grid items-start gap-[22px] lg:grid-cols-[1fr_310px]">
          <div className="flex flex-col gap-[18px]">
            <DeadlineCard
              key={application.id}
              applicationId={application.id}
              deadlineAt={application.deadlineAt}
              deadlineSource={application.deadlineSource}
              deadlineNote={application.deadlineNote}
            />
            <HistoryRail logs={application.activityLogs} />
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-card border-border rounded-xl border px-[18px] py-4">
              <h3 className="text-label text-muted-foreground tracking-label mb-3 font-semibold uppercase">
                Details
              </h3>
              <dl className="flex flex-col gap-2.5">
                {[
                  [
                    "Applied",
                    application.applicationDate
                      ? application.applicationDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—",
                  ],
                  ["Source", application.source || "—"],
                  ["Location", application.location || "—"],
                  ["Stage", statusLabels[status]],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-meta text-muted-foreground">{label}</dt>
                    <dd className="text-meta">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {application.contactInfo && (
              <div className="bg-card border-border rounded-xl border px-[18px] py-4">
                <h3 className="text-label text-muted-foreground tracking-label mb-3 font-semibold uppercase">
                  Contact
                </h3>
                <p className="text-meta whitespace-pre-line">
                  {application.contactInfo}
                </p>
              </div>
            )}

            {application.notes && (
              <div className="bg-card border-border rounded-xl border px-[18px] py-4">
                <h3 className="text-label text-muted-foreground tracking-label mb-3 font-semibold uppercase">
                  Notes
                </h3>
                <p className="text-meta text-foreground-2 whitespace-pre-line">
                  {application.notes}
                </p>
              </div>
            )}

            <CloseOutCard applicationId={application.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
