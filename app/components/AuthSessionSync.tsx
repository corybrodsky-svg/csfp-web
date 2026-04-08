"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { clearServerSession, syncSessionWithServer } from "../lib/clientAuth";

export default function AuthSessionSync() {
  useEffect(() => {
    let cancelled = false;

    async function syncCurrentSession() {
      const { data } = await supabase.auth.getSession();
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
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
