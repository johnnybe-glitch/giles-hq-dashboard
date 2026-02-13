import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

type CronJob = {
  jobId: string;
  name: string;
  enabled: boolean;
  schedule: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOk: boolean;
};

export async function GET() {
  try {
    const { stdout } = await execFileAsync("openclaw", ["cron", "list", "--all", "--json"], { timeout: 12000 });
    const parsed = JSON.parse(stdout);
    const jobsRaw = Array.isArray(parsed?.jobs) ? parsed.jobs : [];

    const jobs: CronJob[] = jobsRaw.map((j: Record<string, unknown>, idx: number) => ({
      jobId: String(j?.jobId ?? j?.id ?? `job-${idx}`),
      name: String(j?.name ?? j?.payload?.message ?? `Job ${idx + 1}`),
      enabled: Boolean(j?.enabled ?? false),
      schedule: formatSchedule(j?.schedule),
      nextRunAt: asIso(j?.nextRunAt ?? j?.nextAt),
      lastRunAt: asIso(j?.lastRunAt ?? j?.lastAt),
      lastOk: j?.lastOk !== false,
    }));

    const enabledCount = jobs.filter((j) => j.enabled).length;
    const disabledCount = jobs.length - enabledCount;
    const upcoming = jobs
      .filter((j) => j.enabled)
      .sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""))
      .slice(0, 5)
      .map((j) => ({ name: j.name, nextRunAt: j.nextRunAt }));

    return NextResponse.json({
      enabledCount,
      disabledCount,
      upcoming,
      jobs,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      enabledCount: 0,
      disabledCount: 0,
      upcoming: [],
      jobs: [],
      updatedAt: new Date().toISOString(),
    });
  }
}

function asIso(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

function formatSchedule(s: Record<string, unknown> | null | undefined): string {
  if (!s || typeof s !== "object") return "Schedule unavailable";
  if (s.kind === "cron" && s.expr) return `${s.expr}${s.tz ? ` (${s.tz})` : ""}`;
  if (s.kind === "every" && s.everyMs) return `every ${Math.round(Number(s.everyMs) / 60000)}m`;
  if (s.kind === "at" && s.at) return `at ${s.at}`;
  return "Schedule unavailable";
}
