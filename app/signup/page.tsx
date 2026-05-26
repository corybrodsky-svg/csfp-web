import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="cfsp-page flex min-h-screen items-center justify-center px-4 py-8">
      <section className="cfsp-panel grid w-full max-w-xl gap-5 px-6 py-6">
        <div>
          <p className="cfsp-kicker">CFSP account access</p>
          <h1 className="mt-3 text-[2rem] leading-tight font-black text-[#14304f]">
            Request workspace access
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5e7388]">
            CFSP accounts are approved by organization. Use your Organization Access Code to request access before signing in.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/request-access" className="cfsp-btn cfsp-btn-primary">
            Request Access
          </Link>
          <Link href="/login" className="cfsp-btn cfsp-btn-secondary">
            Back to Login
          </Link>
        </div>
      </section>
    </main>
  );
}
