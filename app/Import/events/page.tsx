import Link from "next/link";

export default function ImportEventsPage() {
  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Import Events</h1>
      <p>This route now exists.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
        <Link href="/">Home</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/events">Events</Link>
        <Link href="/events/new">New Event</Link>
      </div>
    </main>
  );
}
