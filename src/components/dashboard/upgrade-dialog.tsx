"use client";

import { useCallback, useState } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProBadge } from "@/components/ui/pro-badge";
import { PRO_FEATURES, PRO_FEATURE_COPY, type ProFeature } from "@/lib/pro";

/**
 * The one paywall surface.
 *
 * Every locked control in the app opens this dialog rather than routing away,
 * so hitting a gate never costs you the screen you were on — and so wiring
 * Stripe later is a single button in a single file.
 *
 * `feature` is the gate the user actually tripped; it gets pulled to the top
 * and marked, while the rest stay visible as what else the upgrade buys.
 */

export function UpgradeDialog({
  open,
  onOpenChange,
  feature,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: ProFeature;
}) {
  // The tripped feature first, the others after, without duplicating it.
  const ordered = feature
    ? [feature, ...PRO_FEATURES.filter((f) => f !== feature)]
    : [...PRO_FEATURES];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Upgrade to Pro</DialogTitle>
            <ProBadge />
          </div>
          <DialogDescription>
            {feature
              ? `${PRO_FEATURE_COPY[feature].title} is part of Pro. It comes with everything below.`
              : "Everything below comes with Pro."}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-3">
          {ordered.map((f) => {
            const highlighted = f === feature;
            return (
              <li
                key={f}
                className={`flex gap-2.5 rounded-lg px-2.5 py-2 ${
                  highlighted ? "bg-secondary" : ""
                }`}
              >
                {highlighted ? (
                  <Lock
                    className="text-primary mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                ) : (
                  <Check
                    className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {PRO_FEATURE_COPY[f].title}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    {PRO_FEATURE_COPY[f].description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          {/* The Stripe seam. Disabled until checkout exists — an enabled
              button that goes nowhere is worse than an honest one. */}
          <Button size="sm" disabled title="Billing isn't live yet">
            Upgrade — coming soon
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Wiring helper. A screen with several locked controls would otherwise repeat
 * the same open/feature state three times; this keeps that to one line and one
 * spread.
 *
 *   const upgrade = useUpgradePrompt();
 *   <button onClick={() => upgrade.request("tailoring")} />
 *   <UpgradeDialog {...upgrade.dialogProps} />
 */
export function useUpgradePrompt() {
  const [feature, setFeature] = useState<ProFeature | undefined>();
  const [open, setOpen] = useState(false);

  const request = useCallback((f?: ProFeature) => {
    setFeature(f);
    setOpen(true);
  }, []);

  return {
    request,
    dialogProps: { open, onOpenChange: setOpen, feature },
  };
}
