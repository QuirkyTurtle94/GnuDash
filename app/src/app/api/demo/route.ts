import { NextResponse } from "next/server";
import { generateDemoData } from "@/lib/demo-data";

export async function GET() {
  try {
    const data = generateDemoData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Demo data generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate demo data" },
      { status: 500 }
    );
  }
}
