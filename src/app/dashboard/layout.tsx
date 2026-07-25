import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/nav";
import { getPreferences } from "@/lib/actions/preferences";
import { PreferencesSync } from "@/components/dashboard/preferences-sync";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  // Read once on the server so the stored theme and palette are applied on the
  // first paint rather than swapped in after hydration.
  const preferences = await getPreferences();

  return (
    <div className="min-h-screen flex flex-col">
      <PreferencesSync theme={preferences.theme} palette={preferences.palette} />
      <DashboardNav user={session.user} />
      <main className="flex-1 mx-auto px-8 lg:px-16 py-7 w-full max-w-[1400px]">
        {children}
      </main>
    </div>
  );
}
