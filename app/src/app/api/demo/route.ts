import { NextResponse } from "next/server";
import { generateDemoData } from "@/lib/demo-data";

export async function GET() {
  try {
    const data = generateDemoData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate demo data" },
      { status: 500 }
    );
  }
}
