import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { parseGnuCashFile } from "@/lib/gnucash";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

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

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 100 MB)" },
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
    console.error("GNUCash parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse GNUCash file" },
      { status: 500 }
    );
  } finally {
    // Clean up temp file
    try {
      await unlink(tempPath);
    } catch {
      // ignore cleanup errors
    }
  }
}
