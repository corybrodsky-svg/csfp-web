"use client";

import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClientError, requireSupabaseBrowserClient } from "./supabaseClient";

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function asErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
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
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function signOutUser() {
  if (!getSupabaseBrowserClientError()) {
    try {
      const browserClient = requireSupabaseBrowserClient();
      await browserClient.auth.signOut();
    } catch (error) {
      console.warn(asErrorMessage(error, "Browser auth sign-out failed."));
    }
  }
  await clearServerSession();
}

export function redirectToLogin() {
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}

export async function signOutUserAndRedirect() {
  await signOutUser();
  redirectToLogin();
}
