"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setSaving(false);
        return;
      }

      router.push("/events");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Login failed"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 40 }}>
      <form onSubmit={handleSubmit}>
        <h1>Login</h1>

        {errorMessage ? <p style={{ color: "red" }}>{errorMessage}</p> : null}

        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <br /><br />

        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <br /><br />

        <button type="submit" disabled={saving}>
          {saving ? "Signing In..." : "Sign In"}
        </button>

        <br /><br />

        <Link href="/signup">Create Account</Link>
      </form>
    </main>
  );
}
