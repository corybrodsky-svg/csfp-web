"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("LOGIN ERROR:", error);
      setErrorMessage(error.message); // ← REAL ERROR (no lies)
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f4f7fb"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "400px",
        padding: "24px",
        borderRadius: "12px",
        background: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,0.1)"
      }}>
        <h1>CFSP Login</h1>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              background: "#1e4f8a",
              color: "white",
              border: "none"
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {errorMessage && (
          <div style={{
            marginTop: "10px",
            color: "red"
          }}>
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
