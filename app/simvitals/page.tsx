"use client";

import { useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";
import { SimVitalsFullExperience } from "../components/SimVitals";

type SimVitalsMeResponse = {
  user?: {
    email?: string | null;
  };
  profile?: {
    full_name?: string | null;
    schedule_match_name?: string | null;
    schedule_name?: string | null;
    role?: string | null;
    email?: string | null;
  } | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getFirstName(fullName: string) {
  return asText(fullName).split(/\s+/).filter(Boolean)[0] || "";
}

function getEmailUsername(email: string) {
  const text = asText(email);
  const atIndex = text.indexOf("@");
  return atIndex > 0 ? text.slice(0, atIndex) : text;
}

function getDisplayName(me: SimVitalsMeResponse | null) {
  const fullNameFirst = getFirstName(asText(me?.profile?.full_name));
  if (fullNameFirst) return fullNameFirst;

  const scheduleName = asText(me?.profile?.schedule_match_name) || asText(me?.profile?.schedule_name);
  if (scheduleName) return scheduleName;

  const emailUsername = getEmailUsername(asText(me?.user?.email) || asText(me?.profile?.email));
  if (emailUsername) return emailUsername;

  return "CFSP Team";
}

export default function SimVitalsPage() {
  const [me, setMe] = useState<SimVitalsMeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) return;

        const body = (await response.json().catch(() => null)) as SimVitalsMeResponse | null;
        if (cancelled || !body) return;
        setMe(body);
      } catch {
        return;
      }
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = useMemo(() => getDisplayName(me), [me]);
  const role = asText(me?.profile?.role) || "sim_op";

  return (
    <SiteShell
      title="SimVitals"
      subtitle="Check SimVitals for simulation-native signals, operational telemetry, staffing alerts, faculty coordination, and live lab support."
    >
      <SimVitalsFullExperience displayName={displayName} profileRole={role} />
    </SiteShell>
  );
}
