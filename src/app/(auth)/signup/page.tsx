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
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

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

  // async function handleGoogleSignIn() {
  //   setError(null);
  //   const supabase = createClient();
  //   const { error } = await supabase.auth.signInWithOAuth({
  //     provider: "google",
  //     options: {
  //       redirectTo: `${window.location.origin}/auth/callback`,
  //     },
  //   });
  //   if (error) setError(error.message);
  // }

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
      <Input
        id="confirm-password"
        label="Confirm password"
        type="password"
        placeholder="••••••••"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
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
