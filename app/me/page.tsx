import Link from "next/link";

export default function MyProfilePage() {
  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>My Profile</h1>
      <p>This route now exists.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
        <Link href="/">Home</Link>
        <Link href="/login">Login</Link>
        <Link href="/sps">SP Portal</Link>
        <Link href="/events">Events</Link>
      </div>
    </main>
  );
}
