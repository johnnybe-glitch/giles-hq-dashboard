import { NextResponse } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/opt/homebrew/bin/openclaw";

export async function GET() {
  const current = await getCurrentVersion();
  const latest = await getLatestVersion();

  return NextResponse.json({
    current,
    latest,
    updateAvailable: Boolean(current && latest && current !== latest),
  });
}

export async function POST() {
  const child = spawn(OPENCLAW_BIN, ["update", "--yes"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return NextResponse.json({ ok: true, started: true });
}

async function getCurrentVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["--version"], { timeout: 8000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["status", "--json"], { timeout: 10000 });
    const parsed = JSON.parse(stdout);
    return parsed?.update?.registry?.latestVersion ?? null;
  } catch {
    return null;
  }
}
