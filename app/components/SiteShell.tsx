"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AUTH_STATE_EVENT,
  redirectToLogin,
  signOutUserAndRedirect,
} from "../lib/clientAuth";

type SiteShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

type MeResponse = {
  user?: {
    id: string;
    email?: string | null;
  };
  profile?: {
    full_name: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean | null;
  } | null;
  error?: string;
};

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f7fb",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "20px 24px 24px",
};

const headerStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d6deeb",
  borderRadius: "20px",
  padding: "18px 20px 16px",
  marginBottom: "16px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
};

const headerTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
  flexWrap: "wrap",
};

const brandWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  minWidth: "300px",
};

const brandMarkStyle: React.CSSProperties = {
  width: "46px",
  height: "46px",
  borderRadius: "14px",
  background: "linear-gradient(135deg, #173b6c 0%, #245ca1 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.15)",
  flexShrink: 0,
};

const brandNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "19px",
  fontWeight: 900,
  color: "#16213e",
  lineHeight: 1.1,
  letterSpacing: "0.01em",
};

const brandSubtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: "12px",
  color: "#64748b",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const pageIntroStyle: React.CSSProperties = {
  flex: "1 1 300px",
  minWidth: "260px",
};

const pageEyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "11px",
  color: "#64748b",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const titleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: "30px",
  color: "#16213e",
  lineHeight: 1.08,
};

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0 0",
  fontSize: "14px",
  color: "#5a667a",
  lineHeight: 1.5,
};

const navWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginTop: "16px",
  paddingTop: "14px",
  borderTop: "1px solid #e7edf5",
};

const navLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  padding: "9px 13px",
  borderRadius: "12px",
  border: "1px solid #cfd7e6",
  background: "#ffffff",
  color: "#16213e",
  fontWeight: 700,
  fontSize: "13px",
};

const navButtonStyle: React.CSSProperties = {
  ...navLinkStyle,
  cursor: "pointer",
  fontFamily: "inherit",
};

const contentCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d6deeb",
  borderRadius: "18px",
  padding: "22px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/signup";
}

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getNavLinkStyle(active: boolean): React.CSSProperties {
  if (!active) return navLinkStyle;

  return {
    ...navLinkStyle,
    background: "#173b6c",
    border: "1px solid #173b6c",
    color: "#ffffff",
    boxShadow: "0 6px 18px rgba(23, 59, 108, 0.16)",
  };
}

export default function SiteShell({
  title,
  subtitle,
  children,
}: SiteShellProps) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadAuthState = useCallback(async () => {
    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
        credentials: "include",
      });

      if (response.status === 401) {
        setAuthenticated(false);
        setAuthReady(true);
        return;
      }

      const body = (await response.json().catch(() => null)) as MeResponse | null;
      if (!response.ok) {
        setAuthenticated(false);
        setAuthReady(true);
        return;
      }

      setAuthenticated(Boolean(asText(body?.user?.id)));
      setAuthReady(true);
    } catch {
      setAuthenticated(false);
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void loadAuthState();
  }, [loadAuthState, pathname]);

  useEffect(() => {
    function handleAuthState(event: Event) {
      const nextAuthenticated =
        event instanceof CustomEvent &&
        typeof event.detail?.authenticated === "boolean"
          ? event.detail.authenticated
          : false;

      setAuthenticated(nextAuthenticated);
      setAuthReady(true);
    }

    window.addEventListener(AUTH_STATE_EVENT, handleAuthState);
    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, handleAuthState);
    };
  }, []);

  useEffect(() => {
    if (!authReady || authenticated || isPublicPath(pathname)) return;
    redirectToLogin();
  }, [authReady, authenticated, pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await signOutUserAndRedirect();
    } catch {
      redirectToLogin();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <section style={headerStyle}>
          <div style={headerTopStyle}>
            <div style={brandWrapStyle}>
              <div style={brandMarkStyle} aria-hidden="true">
                <Image
                  src="/favicon.ico"
                  alt="CFSP logo"
                  width={30}
                  height={30}
                  style={{
                    width: "30px",
                    height: "30px",
                    objectFit: "contain",
                    display: "block",
                    borderRadius: "8px",
                  }}
                />
              </div>

              <div>
                <p style={brandNameStyle}>CFSP Ops Board</p>
                <p style={brandSubtitleStyle}>Conflict-Free SP · Simulation Operations</p>
              </div>
            </div>

            <div style={pageIntroStyle}>
              <p style={pageEyebrowStyle}>CFSP Ops Board</p>
              <h1 style={titleStyle}>{title}</h1>
              {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
            </div>
          </div>

          <div style={navWrapStyle}>
            <Link href="/dashboard" style={getNavLinkStyle(isNavActive(pathname, "/dashboard"))}>Dashboard</Link>
            <Link href="/events" style={getNavLinkStyle(isNavActive(pathname, "/events"))}>Events</Link>
            <Link href="/events/new" style={getNavLinkStyle(isNavActive(pathname, "/events/new"))}>New Event</Link>
            <Link href="/events/upload" style={getNavLinkStyle(isNavActive(pathname, "/events/upload"))}>Upload</Link>
            <Link href="/sps" style={getNavLinkStyle(isNavActive(pathname, "/sps"))}>SP Database</Link>
            <Link href="/sim-op" style={getNavLinkStyle(isNavActive(pathname, "/sim-op"))}>Sim Op</Link>
            <Link href="/staff" style={getNavLinkStyle(isNavActive(pathname, "/staff"))}>Staff</Link>
            <Link href="/admin" style={getNavLinkStyle(isNavActive(pathname, "/admin"))}>Admin</Link>
            <Link href="/me" style={getNavLinkStyle(isNavActive(pathname, "/me"))}>Me</Link>
            {!authReady ? null : authenticated ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                style={{ ...navButtonStyle, opacity: loggingOut ? 0.7 : 1 }}
              >
                {loggingOut ? "Logging Out..." : "Logout"}
              </button>
            ) : (
              <Link href="/login" style={navLinkStyle}>Login</Link>
            )}
          </div>
        </section>

        <section style={contentCardStyle}>{children}</section>
      </div>
    </main>
  );
}
