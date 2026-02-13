import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

type LaunchdRow = {
  label: string;
  lastExitStatus: number | null;
  healthy: boolean;
};

const TRACKED_LABELS = [
  "com.giles.dashboard.gitbackup.daily",
  "com.giles.continuity.bundle.daily",
  "com.giles.dashboard.safetytag.weekly",
  "com.giles.continuity.integrity.weekly",
];

export async function GET() {
  try {
    const { stdout } = await execFileAsync("launchctl", ["list"], { timeout: 10000 });
    const rows = parseLaunchctlList(stdout);

    const launchdJobs: LaunchdRow[] = TRACKED_LABELS.map((label) => {
      const row = rows.get(label);
      const lastExitStatus = row?.lastExitStatus ?? null;
      return {
        label,
        lastExitStatus,
        healthy: lastExitStatus === null || lastExitStatus === 0,
      };
    });

    return NextResponse.json({
      launchdJobs,
      healthyCount: launchdJobs.filter((j) => j.healthy).length,
      totalCount: launchdJobs.length,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      launchdJobs: [] as LaunchdRow[],
      healthyCount: 0,
      totalCount: 0,
      updatedAt: new Date().toISOString(),
    });
  }
}

function parseLaunchctlList(stdout: string): Map<string, { lastExitStatus: number | null }> {
  const out = new Map<string, { lastExitStatus: number | null }>();
  const lines = stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const label = parts[2];
    if (!label.startsWith("com.giles.")) continue;

    const statusRaw = parts[1];
    const lastExitStatus = /^-?\d+$/.test(statusRaw) ? Number(statusRaw) : null;
    out.set(label, { lastExitStatus });
  }

  return out;
}
