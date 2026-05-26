import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Self-registration is disabled. Request access with an Organization Access Code.",
    },
    { status: 403 }
  );
}
