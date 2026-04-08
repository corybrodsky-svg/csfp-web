"use client";

import { useEffect } from "react";
import {
  getSupabaseBrowserClientError,
  requireSupabaseBrowserClient,
} from "../lib/supabaseClient";
import { clearServerSession, syncSessionWithServer } from "../lib/clientAuth";

export default function AuthSessionSync() {
  useEffect(() => {
    if (getSupabaseBrowserClientError()) {
      return;
    }

    let cancelled = false;
    const browserClient = requireSupabaseBrowserClient();

    async function syncCurrentSession() {
      const { data } = await browserClient.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        await syncSessionWithServer(data.session).catch(() => undefined);
      } else {
        await clearServerSession().catch(() => undefined);
      }
    }

    void syncCurrentSession();

    const {
      data: { subscription },
    } = browserClient.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void syncSessionWithServer(session).catch(() => undefined);
      } else {
        void clearServerSession().catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
