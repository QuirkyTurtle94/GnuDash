import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
