"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-foreground">Set new password</h2>
        <p className="text-sm text-muted-foreground">
          Choose a strong password for your account.
        </p>
      </div>
      <Input
        id="password"
        label="New password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={6}
        required
      />
      <Input
        id="confirm"
        label="Confirm password"
        type="password"
        placeholder="••••••••"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        minLength={6}
        required
      />
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button type="submit" loading={loading} className="w-full">
        Update password
      </Button>
    </form>
  );
}
