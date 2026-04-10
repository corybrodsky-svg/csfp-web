"use client";

export const AUTH_STATE_EVENT = "cfsp-auth-state";

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function emitAuthState(authenticated: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_STATE_EVENT, {
      detail: { authenticated },
    })
  );
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
  await clearServerSession();
  emitAuthState(false);
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
