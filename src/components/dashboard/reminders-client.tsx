"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { toast } from "sonner";
import {
  getReminderSettings,
  updateDigestSettings,
  updateReminderSettings,
} from "@/lib/actions/reminders";
import {
  REMINDER_DEFAULTS,
  REMINDER_KINDS,
  type ReminderKindName,
  type ReminderSettings,
} from "@/lib/reminders";

/**
 * Deadline reminders.
 *
 * The app is in a better position to do this than a calendar, because the date
 * arrives inside an email it already reads: when a recruiter writes "complete
 * it by Friday", that date attaches to the application and the reminder exists
 * without anyone typing it in.
 *
 * Email is the default channel; browser push needs an open tab and a
 * permission prompt, so it is opt-in per row.
 */

type Initial = Awaited<ReturnType<typeof getReminderSettings>>;

const SECTIONS = [
  { label: "Account", href: "/dashboard/settings" },
  { label: "Email sync", href: "/dashboard/settings" },
  { label: "Reminders", href: "/dashboard/settings/reminders" },
  { label: "Appearance", href: "/dashboard/settings" },
  { label: "Data & privacy", href: "/dashboard/settings" },
];

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <span className="flex justify-center">
      <button
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`flex size-4 items-center justify-center rounded-[4px] border transition-colors ${
          checked
            ? "bg-primary border-transparent"
            : "border-border bg-transparent"
        }`}
      >
        {checked && (
          <span className="text-primary-foreground text-[10px] leading-none font-bold">
            ✓
          </span>
        )}
      </button>
    </span>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`flex h-5 w-[34px] shrink-0 items-center rounded-full p-0.5 transition-colors ${
        on ? "bg-primary justify-end" : "bg-secondary justify-start"
      }`}
    >
      <span
        className={`size-4 rounded-full ${on ? "bg-primary-foreground" : "bg-card"}`}
      />
    </button>
  );
}

export function RemindersClient({ initial }: { initial: Initial }) {
  const [settings, setSettings] = useState<ReminderSettings>(initial.settings);
  const [digestEnabled, setDigestEnabled] = useState(initial.digestEnabled);
  const [, startTransition] = useTransition();

  // The master toggle is derived: reminders are on if any row is.
  const anyEnabled = REMINDER_KINDS.some((k) => settings[k]?.enabled);

  function patch(kind: ReminderKindName, next: Partial<ReminderSettings[ReminderKindName]>) {
    const current = settings[kind] ?? REMINDER_DEFAULTS[kind];
    const updated = { ...current, ...next };
    const previous = settings;
    setSettings((s) => ({ ...s, [kind]: updated }));

    startTransition(async () => {
      const result = await updateReminderSettings({ [kind]: updated });
      if (result.error) {
        setSettings(previous);
        toast.error(result.error);
      }
    });
  }

  function setAll(enabled: boolean) {
    const next: ReminderSettings = {};
    for (const kind of REMINDER_KINDS) {
      next[kind] = { ...(settings[kind] ?? REMINDER_DEFAULTS[kind]), enabled };
    }
    const previous = settings;
    setSettings(next);
    startTransition(async () => {
      const result = await updateReminderSettings(next);
      if (result.error) {
        setSettings(previous);
        toast.error(result.error);
      }
    });
  }

  function setDigest(enabled: boolean) {
    setDigestEnabled(enabled);
    startTransition(async () => {
      const result = await updateDigestSettings({ digestEnabled: enabled });
      if (result.error) {
        setDigestEnabled(!enabled);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-[200px_1fr] gap-9">
      <div>
        <h1 className="font-heading text-title tracking-title mb-5 font-semibold">
          Settings
        </h1>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map((section) => (
            <Link
              key={section.label}
              href={section.href}
              className={`text-body rounded-md px-2.5 py-[7px] ${
                section.label === "Reminders"
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex max-w-[700px] flex-col gap-4">
        <section className="bg-card border-border overflow-hidden rounded-xl border">
          <div className="flex items-start justify-between gap-5 px-[22px] pt-5 pb-4">
            <div>
              <h2 className="text-lede font-semibold">Deadline reminders</h2>
              <p className="text-meta text-muted-foreground mt-1.5">
                Anything with a date — assessments, offer decisions, interviews
                — can nudge you before it lands.
              </p>
            </div>
            <Toggle
              on={anyEnabled}
              onChange={setAll}
              label="All deadline reminders"
            />
          </div>

          <div className="bg-sunken border-border-subtle text-label text-muted-foreground tracking-column grid grid-cols-[1.6fr_130px_78px_78px] gap-3 border-y px-[22px] py-[9px] font-medium uppercase">
            <span>Remind me about</span>
            <span>When</span>
            <span className="text-center">Email</span>
            <span className="text-center">Browser</span>
          </div>

          {REMINDER_KINDS.map((kind) => {
            const setting = settings[kind] ?? REMINDER_DEFAULTS[kind];
            const copy = REMINDER_DEFAULTS[kind];
            return (
              <div
                key={kind}
                className={`border-border-subtle grid grid-cols-[1.6fr_130px_78px_78px] items-center gap-3 border-b px-[22px] py-3 ${
                  setting.enabled ? "" : "opacity-55"
                }`}
              >
                <span>
                  <span className="text-meta font-emphasis block">
                    {copy.title}
                  </span>
                  <span className="text-caption text-muted-foreground mt-0.5 block">
                    {copy.note}
                  </span>
                </span>

                <span className="text-meta text-muted-foreground">
                  {copy.when}
                </span>

                <Checkbox
                  checked={setting.enabled && setting.viaEmail}
                  label={`Email me about ${copy.title}`}
                  onChange={(viaEmail) =>
                    patch(kind, { viaEmail, enabled: viaEmail || setting.viaPush })
                  }
                />
                <Checkbox
                  checked={setting.enabled && setting.viaPush}
                  label={`Notify me in the browser about ${copy.title}`}
                  onChange={(viaPush) =>
                    patch(kind, { viaPush, enabled: viaPush || setting.viaEmail })
                  }
                />
              </div>
            );
          })}

          <div className="bg-sunken flex items-center gap-2.5 px-[22px] py-3.5">
            <Info className="text-muted-foreground size-3.5 shrink-0" />
            <span className="text-meta text-muted-foreground">
              Browser notifications need permission once. Email always goes to{" "}
              {initial.email}.
            </span>
          </div>
        </section>

        <section className="bg-card border-border rounded-xl border px-[22px] py-5">
          <h2 className="text-lede font-semibold">Weekly digest</h2>
          <div className="border-border-subtle flex items-center justify-between gap-5 border-b pt-3.5 pb-3.5">
            <div>
              <p className="text-body">One email, Sunday evening</p>
              <p className="text-meta text-muted-foreground mt-1">
                What&apos;s due this week, what&apos;s gone quiet, what moved
              </p>
            </div>
            <Toggle
              on={digestEnabled}
              onChange={setDigest}
              label="Weekly digest"
            />
          </div>
          <div className="flex items-center justify-between gap-5 pt-3.5">
            <div>
              <p className="text-body">Quiet hours</p>
              <p className="text-meta text-muted-foreground mt-1">
                Nothing pings you overnight; reminders wait for morning
              </p>
            </div>
            <span className="border-border text-meta inline-flex h-[30px] items-center rounded-md border px-2.5">
              {initial.quietHoursStart} – {initial.quietHoursEnd}
            </span>
          </div>
        </section>

        <p className="text-meta text-muted-foreground leading-relaxed">
          Deadlines come from the emails we already read, so a reminder exists
          the moment a recruiter names a date — nobody has to type it in.
        </p>
      </div>
    </div>
  );
}
