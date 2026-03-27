"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-12 bg-muted border-r">
        {/* Wordmark */}
        <div>
          <span className="font-heading text-2xl font-semibold text-foreground">App</span>
          <span className="font-heading text-2xl font-semibold text-primary">Tracker</span>
        </div>

        {/* Center content */}
        <div className="space-y-8">
          <div>
            <h2 className="font-heading text-3xl xl:text-4xl font-semibold leading-tight mb-3 text-foreground">
              Your career
              <br />
              <span className="text-muted-foreground">at a glance.</span>
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Track every application, every status change, and every opportunity — all in one place.
            </p>
          </div>

          <div className="space-y-3">
            {[
              "Pipeline status tracking",
              "Gmail integration with AI detection",
              "Analytics & funnel visualization",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
                <span className="text-sm text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />
      </div>

      {/* Right: form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px] space-y-7 animate-fade-up">
          {/* Mobile wordmark */}
          <div className="lg:hidden text-center">
            <span className="font-heading text-2xl font-semibold text-foreground">App</span>
            <span className="font-heading text-2xl font-semibold text-primary">Tracker</span>
          </div>

          <div>
            <h1 className="font-heading text-2xl font-semibold mb-1 text-foreground">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to continue tracking your applications
            </p>
          </div>

          {/* Google OAuth */}
          <button
            className="w-full flex items-center justify-center gap-3 rounded-md border py-2.5 text-sm font-medium transition-colors bg-background hover:bg-muted text-foreground"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Credentials form */}
          <form onSubmit={handleCredentials} className="space-y-4">
            {error && (
              <p className="text-sm text-center rounded-md px-3 py-2 text-destructive bg-destructive/8 border border-destructive/20">
                {error}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-ring/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-ring/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/auth/signup" className="text-foreground underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
