import { getPreferences } from "@/lib/actions/preferences";
import { SettingsClient } from "@/components/dashboard/settings-client";

export default async function SettingsPage() {
  const preferences = await getPreferences();
  return <SettingsClient initial={preferences} />;
}
