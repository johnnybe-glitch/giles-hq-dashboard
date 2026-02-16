import { NextResponse } from "next/server";
import { execFile } from "child_process";
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
  try {
    const { stdout, stderr } = await execFileAsync(OPENCLAW_BIN, ["update", "--yes"], {
      timeout: 240_000,
      maxBuffer: 1024 * 1024 * 4,
    });

    return NextResponse.json({
      ok: true,
      updated: true,
      stdout: (stdout || "").trim(),
      stderr: (stderr || "").trim(),
    });
  } catch (error) {
    const e = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    return NextResponse.json(
      {
        ok: false,
        updated: false,
        error: e.message,
        code: e.code ?? null,
        stdout: (e.stdout || "").trim(),
        stderr: (e.stderr || "").trim(),
      },
      { status: 500 },
    );
  }
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
