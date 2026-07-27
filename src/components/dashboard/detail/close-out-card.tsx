"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateApplicationStatus } from "@/lib/actions/applications";
import { toast } from "sonner";

/**
 * Closing an application out. Kept quiet and at the bottom of the rail: it is
 * the least pleasant action on the page and should not compete with the ones
 * that move an application forward.
 *
 * Sends you back to the table afterwards, since closed applications have no
 * detail view.
 */
export function CloseOutCard({ applicationId }: { applicationId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close(status: "REJECTED" | "WITHDRAWN") {
    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "REJECTED" ? "Marked rejected" : "Withdrawn");
      router.push("/dashboard");
    });
  }

  return (
    <div className="bg-card border-border flex flex-col gap-2.5 rounded-xl border px-[18px] py-3.5">
      <span className="text-meta text-muted-foreground">Not moving forward?</span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => close("REJECTED")}
        >
          Mark rejected
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => close("WITHDRAWN")}
        >
          Withdraw
        </Button>
      </div>
    </div>
  );
}
