import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { parseGnuCashFile } from "@/lib/gnucash/parser";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.endsWith(".gnucash")) {
    return NextResponse.json(
      { error: "File must be a .gnucash file" },
      { status: 400 }
    );
  }

  const tempDir = join(tmpdir(), "gnucash-dashboard");
  await mkdir(tempDir, { recursive: true });
  const tempPath = join(tempDir, `${randomUUID()}.gnucash`);

  try {
    // Write uploaded file to temp location
    const bytes = await file.arrayBuffer();
    await writeFile(tempPath, Buffer.from(bytes));

    // Parse the GNUCash file
    const data = parseGnuCashFile(tempPath);

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse file";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Clean up temp file
    try {
      await unlink(tempPath);
    } catch {
      // ignore cleanup errors
    }
  }
}
