"use client";

import Link from "next/link";
import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { updatePreferences } from "@/lib/actions/preferences";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  ChevronDown,
  LayoutDashboard,
  FileText,
  BarChart2,
  Settings,
  Sun,
  Moon,
} from "lucide-react";

interface DashboardNavProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
}

// Three destinations, not four: resume and cover letter were two near-identical
// pages asking for the same posting, so they merge under Documents.
const navLinks = [
  { href: "/dashboard", label: "Applications", icon: LayoutDashboard },
  { href: "/dashboard/analytics", label: "Insights", icon: BarChart2 },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
];

export function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname();

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Same width cage as <main> in the dashboard layout, so the wordmark
          lines up with the content edge instead of drifting on wide screens. */}
      <div className="mx-auto flex h-14 w-full max-w-[1720px] items-center justify-between px-6 lg:px-10">
        {/* Wordmark + nav */}
        <div className="flex items-center gap-6 lg:gap-8">
          <Link href="/dashboard" className="flex items-baseline shrink-0">
            <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
              coop
            </span>
            <span className="font-heading text-xl font-semibold tracking-tight text-primary">
              tracker
            </span>
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          </Link>

          <nav className="flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`text-body flex items-center gap-[7px] rounded-md px-[11px] py-1.5 font-medium transition-colors ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5 opacity-60" />
                  <span className="hidden sm:block">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Theme toggle + user menu */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground border">
                  {initials}
                </span>
                <span className="hidden sm:block max-w-[160px] truncate">
                  {user.name ?? user.email}
                </span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            }
          />
          <DropdownMenuContent
            align="end"
            className="w-auto min-w-(--anchor-width) max-w-[min(20rem,calc(100vw-2rem))]"
          >
            <div className="px-3 py-2.5 border-b">
              {user.name && (
                <p className="text-sm font-medium">{user.name}</p>
              )}
              <p className="text-xs text-muted-foreground break-all">
                {user.email}
              </p>
            </div>
            <DropdownMenuItem
              render={<Link href="/dashboard/settings" />}
              className="mx-1 my-1 cursor-pointer"
            >
              <Settings className="mr-2 h-3.5 w-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="mx-1 my-1 cursor-pointer"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/**
 * Flips light/dark and writes the choice to the account.
 *
 * Persisting matters: theme is a stored preference (Settings → Appearance reads
 * the same column), so a toggle that only moved next-themes' local state would
 * be undone by `PreferencesSync` on the next load. Optimistic — the class flips
 * immediately and only rolls back if the save is rejected.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    // One write in flight at a time: two fast clicks would race two saves, and
    // the loser's rollback would fight the winner's optimistic state.
    if (isPending) return;

    // `resolvedTheme` is undefined until next-themes has mounted, and the button
    // is clickable before then. The class on <html> is written by next-themes'
    // blocking script, so it is correct from the first paint — read it as the
    // fallback rather than assuming light and sending the first click nowhere.
    const isDark = resolvedTheme
      ? resolvedTheme === "dark"
      : document.documentElement.classList.contains("dark");
    const previous = isDark ? "dark" : "light";
    const next = isDark ? "light" : "dark";
    setTheme(next);

    startTransition(async () => {
      // The action returns `{ error }` for a rejected value, but *throws* on an
      // expired session or a dropped request. Both have to put the theme back,
      // or the screen keeps a change the account never stored.
      try {
        const result = await updatePreferences({ theme: next });
        if (!result.error) return;
        setTheme(previous);
        toast.error(result.error);
      } catch {
        setTheme(previous);
        toast.error("Could not save your theme.");
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default"
      aria-label="Toggle theme"
    >
      {/* Both icons rendered; CSS picks one so server and client markup match */}
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </button>
  );
}
