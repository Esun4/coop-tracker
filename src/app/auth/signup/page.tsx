"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await signUp(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    if (signInResult?.error) {
      setError("Account created but could not sign in. Please sign in manually.");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col justify-between p-12 bg-muted border-r">
        <div>
          <span className="font-heading text-2xl font-semibold text-foreground">App</span>
          <span className="font-heading text-2xl font-semibold text-primary">Tracker</span>
        </div>

        <div className="space-y-6">
          <h2 className="font-heading text-3xl xl:text-4xl font-semibold leading-tight text-foreground">
            Start tracking
            <br />
            <span className="text-muted-foreground">your journey.</span>
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Join thousands of students organizing their internship and co-op applications.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { value: "100%", label: "Free forever" },
              { value: "∞", label: "Applications" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border bg-background p-3">
                <p className="font-mono text-lg font-medium text-foreground">{stat.value}</p>
                <p className="text-xs mt-0.5 text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />
      </div>

      {/* Right: form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px] space-y-7 animate-fade-up">
          {/* Mobile wordmark */}
          <div className="lg:hidden text-center">
            <span className="font-heading text-2xl font-semibold text-foreground">App</span>
            <span className="font-heading text-2xl font-semibold text-primary">Tracker</span>
          </div>

          <div>
            <h1 className="font-heading text-2xl font-semibold mb-1 text-foreground">
              Create account
            </h1>
            <p className="text-sm text-muted-foreground">
              Get started — it only takes a minute
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-center rounded-md px-3 py-2 text-destructive bg-destructive/8 border border-destructive/20">
                {error}
              </p>
            )}

            {[
              { id: "name", label: "Name", type: "text", placeholder: "Your name", minLength: undefined },
              { id: "email", label: "Email", type: "email", placeholder: "you@example.com", minLength: undefined },
              { id: "password", label: "Password", type: "password", placeholder: "Min. 8 characters", minLength: 8 },
            ].map((field) => (
              <div key={field.id} className="space-y-1.5">
                <label htmlFor={field.id} className="text-xs font-medium text-muted-foreground">
                  {field.label}
                </label>
                <input
                  id={field.id}
                  name={field.id}
                  type={field.type}
                  required
                  placeholder={field.placeholder}
                  minLength={field.minLength}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-ring/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
