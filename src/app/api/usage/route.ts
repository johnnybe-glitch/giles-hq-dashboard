import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_PATH = process.env.USAGE_DATA_PATH || path.join(process.cwd(), "src", "data", "usage-rollup.json");
const BUILD_SCRIPT = process.env.USAGE_BUILD_SCRIPT || path.join(process.cwd(), "scripts", "build_usage_rollup.js");
const execFileAsync = promisify(execFile);

export async function GET() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const payload = JSON.parse(raw);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[usage-api:get]", err);
    return NextResponse.json({ generatedAt: null, dailyBudgetTokens: null, days: [] });
  }
}

export async function POST() {
  try {
    await execFileAsync(process.execPath, [BUILD_SCRIPT], { timeout: 20000 });
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const payload = JSON.parse(raw);
    return NextResponse.json({ ok: true, payload });
  } catch (err) {
    console.error("[usage-api:post]", err);
    const message = err instanceof Error ? err.message : "Usage refresh failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
