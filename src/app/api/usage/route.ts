import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_PATH = process.env.USAGE_DATA_PATH || path.join(process.cwd(), "src", "data", "usage-rollup.json");

export async function GET() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const payload = JSON.parse(raw);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[usage-api]", err);
    return NextResponse.json({ generatedAt: null, dailyBudgetTokens: null, days: [] });
  }
}
