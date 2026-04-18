import { NextResponse } from "next/server";
import { getSession, isActiveSession } from "@/lib/server/session";
import { importGnucashFile } from "@/lib/server/import-export/import";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!isActiveSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Origin check: refuse cross-origin uploads.
  const appOrigin = process.env.APP_ORIGIN;
  const origin = req.headers.get("origin");
  if (appOrigin && origin && origin !== appOrigin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const overwrite = url.searchParams.get("overwrite") === "true";

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File too large" },
      { status: 413 }
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 400 });
  }

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }

  try {
    const result = await importGnucashFile(buffer, { overwrite });
    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    const isConflict = /already contains data/.test(message);
    return NextResponse.json(
      { error: message },
      { status: isConflict ? 409 : 400 }
    );
  }
}
