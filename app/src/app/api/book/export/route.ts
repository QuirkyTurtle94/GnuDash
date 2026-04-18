import { NextResponse } from "next/server";
import { getSession, isActiveSession } from "@/lib/server/session";
import { exportGnucashFile } from "@/lib/server/import-export/export";

export async function GET() {
  const session = await getSession();
  if (!isActiveSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bytes = await exportGnucashFile();
    // NextResponse body wants BodyInit; Blob is the least-ceremony shape.
    const body = new Blob([new Uint8Array(bytes)], {
      type: "application/x-gnucash",
    });
    const res = new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-gnucash",
        "Content-Disposition": 'attachment; filename="book.gnucash"',
        "Content-Length": String(body.size),
        "Cache-Control": "no-store",
      },
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
