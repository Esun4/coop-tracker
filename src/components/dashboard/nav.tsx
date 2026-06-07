"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
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
} from "lucide-react";

interface DashboardNavProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/cover-letter", label: "Cover Letter", icon: FileText },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart2 },
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
      <div className="flex h-14 items-center justify-between px-8 lg:px-16">
        {/* Wordmark + nav */}
        <div className="flex items-center gap-6 lg:gap-8">
          <Link href="/dashboard" className="flex items-center shrink-0">
            <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
              coop
            </span>
            <span className="font-heading text-xl font-semibold tracking-tight text-primary">
              tracker
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User menu */}
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
          <DropdownMenuContent align="end">
            <div className="px-3 py-2.5 border-b">
              {user.name && (
                <p className="text-sm font-medium">{user.name}</p>
              )}
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
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
    </header>
  );
}
