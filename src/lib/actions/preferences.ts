"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  preferencesSchema,
  effectiveScanFrequency,
  isProScanFrequency,
} from "@/lib/preferences";
// `isPro` is the pure rule, used below to *read* entitlement when shaping the
// response; `requirePro` is the gate. Both come from the same module so the two
// can never drift apart.
import { isPro as computeIsPro, requirePro } from "@/lib/entitlements";

/**
 * Appearance and scanning preferences.
 *
 * These live on the User row rather than in localStorage so they follow the
 * account to another machine, and so the server can render the right theme on
 * the first paint instead of flashing the wrong one.
 *
 * `getPreferences` doubles as the entitlement read for the dashboard: the
 * layout, the applications page and settings all call it already, so returning
 * `isPro` from the same row costs nothing extra and saves every one of those
 * screens a second query.
 */

async function getAuthUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function getPreferences() {
  const userId = await getAuthUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      theme: true,
      palette: true,
      density: true,
      scanFrequency: true,
      email: true,
      lastEmailSync: true,
      googleAccessToken: true,
      plan: true,
      proUntil: true,
    },
  });
  if (!user) throw new Error("Unauthorized");

  const isPro = computeIsPro(user);

  return {
    theme: user.theme,
    palette: user.palette,
    density: user.density,
    // The effective value, not the stored one: a lapsed account should see
    // "Manual" selected, because manual is what is actually happening.
    scanFrequency: effectiveScanFrequency(user.scanFrequency, isPro),
    email: user.email,
    lastEmailSync: user.lastEmailSync,
    gmailConnected: !!user.googleAccessToken,
    isPro,
  };
}

export async function updatePreferences(input: unknown) {
  const userId = await getAuthUserId();

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid preference" };
  }
  if (Object.keys(parsed.data).length === 0) {
    return { error: "Nothing to update" };
  }

  // Scheduled scanning is Pro. The client hides the option, but a Server Action
  // is directly invocable, so this check is the one that counts. Only pay for
  // the entitlement read when the patch actually asks for a gated value —
  // a theme switch shouldn't cost a second query.
  if (parsed.data.scanFrequency && isProScanFrequency(parsed.data.scanFrequency)) {
    const gate = await requirePro(userId);
    if (gate) return gate;
  }

  await prisma.user.update({ where: { id: userId }, data: parsed.data });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}
