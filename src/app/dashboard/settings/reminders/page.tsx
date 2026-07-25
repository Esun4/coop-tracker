import { getReminderSettings } from "@/lib/actions/reminders";
import { RemindersClient } from "@/components/dashboard/reminders-client";

export default async function RemindersPage() {
  const initial = await getReminderSettings();
  return <RemindersClient initial={initial} />;
}
