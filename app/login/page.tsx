"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return setMsg(error.message);

    window.location.href = "/";
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) return setMsg(error.message);

    setMsg("Account created. Now try signing in.");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0b", color: "white" }}>
      <div style={{ width: 360, padding: 24, borderRadius: 12, background: "#141414", border: "1px solid #222" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>CFSP Login</h1>
        <p style={{ opacity: 0.8, marginTop: 0, marginBottom: 16 }}>Sign in to your ops board.</p>

        <form style={{ display: "grid", gap: 10 }}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "#0f0f0f", color: "white" }}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "#0f0f0f", color: "white" }}
          />

          <button onClick={signIn} style={{ padding: 10, borderRadius: 10, border: "none", cursor: "pointer" }}>
            Sign In
          </button>

          <button onClick={signUp} type="button" style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "transparent", color: "white", cursor: "pointer" }}>
            Create Account
          </button>

          {msg ? <p style={{ marginTop: 10, opacity: 0.9 }}>{msg}</p> : null}
        </form>
      </div>
    </main>
  );
}