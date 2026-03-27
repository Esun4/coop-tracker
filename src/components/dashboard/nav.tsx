"use client";

import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ChevronDown } from "lucide-react";

interface DashboardNavProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
}

export function DashboardNav({ user }: DashboardNavProps) {
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
        {/* Wordmark */}
        <div className="flex items-center">
          <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
            App
          </span>
          <span className="font-heading text-xl font-semibold tracking-tight text-primary">
            Tracker
          </span>
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
