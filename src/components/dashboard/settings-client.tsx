"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProBadge } from "@/components/ui/pro-badge";
import {
  UpgradeDialog,
  useUpgradePrompt,
} from "@/components/dashboard/upgrade-dialog";
import { getPreferences, updatePreferences } from "@/lib/actions/preferences";
import {
  DENSITIES,
  PALETTES,
  SCAN_FREQUENCIES,
  THEMES,
  narrowPreference as narrow,
  type DensityPref,
  type Palette,
  type Preferences,
  type ScanFrequency,
  type Theme,
} from "@/lib/preferences";

/**
 * Account · Email sync · Appearance · Data & privacy.
 *
 * Manual scanning is free; the two scheduled options are Pro, and they stay
 * visible-but-locked rather than hidden, so the tier is legible instead of
 * mysterious. Palette offers Neutral ink for anyone who would rather have no
 * status colour at all; it swaps the ramp variables only, and stage stays
 * readable from the tick meter either way.
 */

type Initial = Awaited<ReturnType<typeof getPreferences>>;

// Reminders is its own route; the rest are cards on this page, so they scroll
// to their own heading rather than navigating to the URL they are already on.
// "Account" stays the page link — it is the you-are-here entry.
const SECTIONS = [
  { label: "Account", href: "/dashboard/settings" },
  { label: "Email sync", href: "#email-sync" },
  { label: "Reminders", href: "/dashboard/settings/reminders" },
  { label: "Appearance", href: "#appearance" },
  { label: "Data & privacy", href: "#data-privacy" },
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="bg-secondary flex shrink-0 rounded-md p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`text-caption rounded-sm px-2.5 py-1 transition-colors ${
            value === o.value
              ? "bg-card text-foreground font-medium"
              : "text-muted-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  title,
  description,
  children,
  bordered = true,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-5 py-4 ${
        bordered ? "border-border-subtle border-b" : ""
      }`}
    >
      <div>
        <p className="text-body">{title}</p>
        {description && (
          <p className="text-meta text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Card({
  id,
  heading,
  children,
}: {
  id?: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-card border-border scroll-mt-20 rounded-xl border px-6 py-[22px]"
    >
      <h2 className="text-lede font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

/**
 * A radio card. Used for scan frequency and palette.
 *
 * `locked` keeps the option on screen but turns it into an upgrade prompt: the
 * radio becomes a lock, a Pro badge sits by the title, and `onSelect` is
 * expected to open the paywall instead of saving. It is not `disabled` —
 * a disabled button can't be clicked, and clicking is exactly how we want a
 * free user to discover what Pro is.
 */
function ChoiceCard({
  selected,
  title,
  description,
  onSelect,
  swatches,
  locked = false,
}: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
  swatches?: string[];
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={locked ? undefined : selected}
      className={`rounded-inline border px-4 py-[15px] text-left transition-colors ${
        selected && !locked
          ? "border-primary/45 bg-attn ring-attn ring-[3px]"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {locked ? (
          <Lock
            className="text-muted-foreground size-[15px] shrink-0"
            aria-hidden
          />
        ) : (
          <span
            className={`size-[15px] shrink-0 rounded-full border ${
              selected ? "border-primary border-4" : "border-border"
            }`}
            aria-hidden
          />
        )}
        <span
          className={`text-body font-semibold ${
            locked ? "text-muted-foreground" : ""
          }`}
        >
          {title}
        </span>
        {locked && <ProBadge />}
      </div>

      {swatches && (
        <div className="mt-3 flex gap-1">
          {swatches.map((cls) => (
            <span key={cls} className={`h-4 flex-1 rounded-sm ${cls}`} />
          ))}
        </div>
      )}

      <p className="text-meta text-muted-foreground mt-2.5 leading-relaxed">
        {description}
      </p>
    </button>
  );
}

export function SettingsClient({ initial }: { initial: Initial }) {
  const [prefs, setPrefs] = useState({
    theme: narrow<Theme>(initial.theme, THEMES, "system"),
    palette: narrow<Palette>(initial.palette, PALETTES, "ledger"),
    density: narrow<DensityPref>(initial.density, DENSITIES, "compact"),
    scanFrequency: narrow<ScanFrequency>(
      initial.scanFrequency,
      SCAN_FREQUENCIES,
      "manual",
    ),
  });
  const [, startTransition] = useTransition();
  const { setTheme } = useTheme();
  const upgrade = useUpgradePrompt();

  function save(patch: Preferences) {
    // Optimistic: an appearance switch that lags feels broken. Keep the old
    // values so a rejected save can put the screen back where it was.
    const previous = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (patch.theme) setTheme(patch.theme);
    if (patch.palette) {
      document.documentElement.dataset.palette = patch.palette;
    }

    startTransition(async () => {
      // updatePreferences throws rather than returning { error } on an expired
      // session or a dropped request, the same as the theme toggle in nav.tsx.
      // Both paths have to roll back, or the screen keeps a preference the
      // account never stored.
      function rollback(message: string) {
        setPrefs(previous);
        setTheme(previous.theme);
        document.documentElement.dataset.palette = previous.palette;
        toast.error(message);
      }

      try {
        const result = await updatePreferences(patch);
        if (result.error) rollback(result.error);
      } catch {
        rollback("Could not save your preferences.");
      }
    });
  }

  // On wide screens the card column is what sits centred in the viewport; the
  // section nav hangs off its left in the leftover gutter. Below 2xl there is
  // not enough room for that, so the pair falls back to a centred block.
  return (
    <div className="mx-auto grid w-full max-w-[1080px] grid-cols-[200px_1fr] gap-12 2xl:max-w-none 2xl:grid-cols-[minmax(0,1fr)_820px_minmax(0,1fr)]">
      <div className="2xl:w-[200px] 2xl:justify-self-end">
        <h1 className="font-heading text-title tracking-title mb-5 font-semibold">
          Settings
        </h1>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map((section, i) => (
            <Link
              key={section.label}
              href={section.href}
              className={`text-body rounded-md px-2.5 py-[7px] ${
                i === 0 ? "bg-secondary font-medium" : "text-muted-foreground"
              }`}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card id="email-sync" heading="Email sync">
          <div className="border-border-subtle flex items-center justify-between gap-5 border-b pt-4 pb-4">
            <div>
              <p className="text-body font-medium">{initial.email}</p>
              <p className="text-meta text-muted-foreground mt-1">
                {initial.gmailConnected
                  ? "Read-only access"
                  : "Not connected — sign in with Google to enable scanning"}
                {/* Rendered during SSR, so the zone is pinned — left to the
                    runtime, the server and the browser can disagree on the
                    day and React reports a hydration mismatch. */}
                {initial.lastEmailSync &&
                  ` · last scan ${initial.lastEmailSync.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}`}
              </p>
            </div>
            {initial.gmailConnected && (
              <Button variant="outline" size="sm" disabled title="Not wired up yet">
                Disconnect
              </Button>
            )}
          </div>

          <div className="pt-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-body font-medium">Scan frequency</p>
              <span className="text-meta text-muted-foreground">
                Manual sync is always available from the header
              </span>
            </div>

            <div className="mt-3.5 grid grid-cols-3 gap-3">
              <ChoiceCard
                selected={prefs.scanFrequency === "manual"}
                title="Manual"
                description="You press Sync, we check once. Nothing runs in the background."
                onSelect={() => save({ scanFrequency: "manual" })}
              />
              <ChoiceCard
                selected={prefs.scanFrequency === "every6h"}
                locked={!initial.isPro}
                title="Every 6 hours"
                description="Four sweeps a day, so nothing sits unseen for long."
                onSelect={() =>
                  initial.isPro
                    ? save({ scanFrequency: "every6h" })
                    : upgrade.request("scan_schedule")
                }
              />
              <ChoiceCard
                selected={prefs.scanFrequency === "daily8am"}
                locked={!initial.isPro}
                title="Daily at 8am"
                description="One sweep each morning."
                onSelect={() =>
                  initial.isPro
                    ? save({ scanFrequency: "daily8am" })
                    : upgrade.request("scan_schedule")
                }
              />
            </div>
          </div>
        </Card>

        <Card id="appearance" heading="Appearance">
          <Row title="Theme">
            <Segmented
              label="Theme"
              value={prefs.theme}
              onChange={(theme) => save({ theme })}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
            />
          </Row>

          <div className="border-border-subtle border-b py-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-body">Palette</p>
              <span className="text-meta text-muted-foreground">
                Stage is always readable from the tick meter alone
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ChoiceCard
                selected={prefs.palette === "ledger"}
                title="Muted ledger"
                description="Green deepens as an application advances."
                onSelect={() => save({ palette: "ledger" })}
                swatches={[
                  "bg-stage-1",
                  "bg-stage-2",
                  "bg-stage-3",
                  "bg-stage-5",
                ]}
              />
              <ChoiceCard
                selected={prefs.palette === "ink"}
                title="Neutral ink"
                description="No status colour at all — weight and the meter carry stage. Offers stay highlighted."
                onSelect={() => save({ palette: "ink" })}
                swatches={[
                  "bg-stage-off",
                  "bg-border",
                  "bg-muted-foreground",
                  "bg-primary",
                ]}
              />
            </div>
          </div>

          <Row title="Table density" bordered={false}>
            <Segmented
              label="Table density"
              value={prefs.density}
              onChange={(density) => save({ density })}
              options={[
                { value: "compact", label: "Compact" },
                { value: "comfortable", label: "Comfortable" },
              ]}
            />
          </Row>
        </Card>

        <Card id="data-privacy" heading="Data & privacy">
          <Row
            title="Export everything"
            description="Applications, activity and suggestions as CSV"
          >
            <Button variant="outline" size="sm" disabled title="Not wired up yet">
              Download
            </Button>
          </Row>
          <Row
            title="Delete account"
            description="Removes your applications and revokes Gmail access immediately"
            bordered={false}
          >
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Not wired up yet"
              className="border-destructive/40 text-destructive"
            >
              Delete
            </Button>
          </Row>
        </Card>
      </div>

      {/* Portals out, so its position in the grid is irrelevant. */}
      <UpgradeDialog {...upgrade.dialogProps} />
    </div>
  );
}
