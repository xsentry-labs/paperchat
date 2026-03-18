"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous((user as { is_anonymous?: boolean } | null)?.is_anonymous ?? false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    // If the current user is anonymous, upgrade their account instead of creating new
    if (isAnonymous) {
      const { error } = await supabase.auth.updateUser({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  async function handleGuestSignIn() {
    setError(null);
    setGuestLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setError(error.message);
      setGuestLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">✉️</div>
        <h2 className="text-lg font-medium text-foreground">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a confirmation link to <strong>{email}</strong>.
          {isAnonymous && " Your documents and conversations will be preserved."}
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isAnonymous && (
        <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Creating an account will preserve all your documents and conversations.
        </div>
      )}
      <Input
        id="email"
        label="Email"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        id="password"
        label="Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={6}
        required
      />
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" loading={loading} className="w-full">
        {isAnonymous ? "Create account" : "Sign up"}
      </Button>
      {!isAnonymous && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleGoogleSignIn}
            className="w-full"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={guestLoading}
            onClick={handleGuestSignIn}
            className="w-full"
          >
            Continue as guest
          </Button>
        </>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
