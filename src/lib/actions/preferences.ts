"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { preferencesSchema } from "@/lib/preferences";

/**
 * Appearance and scanning preferences.
 *
 * These live on the User row rather than in localStorage so they follow the
 * account to another machine, and so the server can render the right theme on
 * the first paint instead of flashing the wrong one.
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
    },
  });
  if (!user) throw new Error("Unauthorized");

  return {
    theme: user.theme,
    palette: user.palette,
    density: user.density,
    scanFrequency: user.scanFrequency,
    email: user.email,
    lastEmailSync: user.lastEmailSync,
    gmailConnected: !!user.googleAccessToken,
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

  await prisma.user.update({ where: { id: userId }, data: parsed.data });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: true };
}
