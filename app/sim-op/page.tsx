import Link from "next/link";

export default function SimOpPage() {
  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Sim Op Portal</h1>
      <p>This route now exists.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
        <Link href="/">Home</Link>
        <Link href="/login">Login</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/events">Events</Link>
        <Link href="/events/new">New Event</Link>
        <Link href="/import/events">Import Events</Link>
      </div>
    </main>
  );
}
