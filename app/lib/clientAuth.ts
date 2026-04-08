"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function syncSessionWithServer(session: Session) {
  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        error.message === "Failed to fetch"
          ? "Could not reach /api/auth/session to persist the login cookie."
          : error.message
      );
    }

    throw new Error("Could not persist login session.");
  }
}

export async function clearServerSession() {
  await fetch("/api/auth/logout", {
    method: "POST",
  });
}

export async function signOutUser() {
  await supabase.auth.signOut();
  await clearServerSession();
}
