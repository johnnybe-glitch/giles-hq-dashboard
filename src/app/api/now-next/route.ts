import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/opt/homebrew/bin/openclaw";

const RUNTIME_PATHS = [
  process.env.GILES_RUNTIME_DIR,
  "/Users/johnny2/Desktop/_Giles Shared/runtime",
  "/Users/johnny2/Desktop/_Giles_Shared/runtime",
  "/Users/giles/Desktop/_Giles Shared/runtime",
  "/Users/giles/Desktop/_Giles_Shared/runtime",
].filter(Boolean) as string[];

type StatusFile = {
  status_text?: string;
  presence_state?: string;
  model?: string;
  fallbacks?: string[];
  local_helper?: boolean;
  last_activity_at?: string;
  current_run?: {
    task_name?: string;
    stage?: { name?: string; index?: number; total?: number };
  };
};

type CronJob = {
  name?: string;
  schedule?: { kind?: string; expr?: string };
  payload?: { text?: string; message?: string };
};

export async function GET() {
  const runtimeRoot = await resolveRuntimeRoot();
  const status = runtimeRoot ? await readJson<StatusFile>(runtimeRoot, "status.json") : null;

  const openclaw = await readOpenclawStatus();
  const now = buildNow(status, openclaw?.activeTask);
  const queued = await buildQueued();

  const model = status?.model ?? openclaw?.model ?? "gpt-5.3-codex";
  const fallbacks = status?.fallbacks?.length ? status.fallbacks : openclaw?.fallbacks ?? [];
  const localHelper =
    typeof status?.local_helper === "boolean"
      ? status.local_helper
      : (openclaw?.heartbeatModel ?? "").toLowerCase().startsWith("ollama/");

  const lastUpdateIso = status?.last_activity_at ?? openclaw?.updatedAt ?? null;

  return NextResponse.json({
    now,
    queued,
    status: (status?.presence_state ?? "working").toUpperCase(),
    model,
    fallbacks,
    local_helper: localHelper,
    last_update_at: lastUpdateIso,
    plan_text: status?.status_text ?? "This is my current plan. It updates as tasks/subagents progress.",
  });
}

function buildNow(status: StatusFile | null, activeTask?: string | null) {
  const task = status?.current_run?.task_name;
  const stage = status?.current_run?.stage;
  const stageText = stage?.name
    ? `${stage.name}${stage.index && stage.total ? ` (${stage.index}/${stage.total})` : ""}`
    : null;

  return {
    title: task ?? activeTask ?? "No active task",
    detail: stageText ?? status?.status_text ?? (activeTask ? "In progress" : "Standing by"),
  };
}

async function buildQueued() {
  const jobs = await readCronJobs();
  if (!jobs.length) return [];

  return jobs.slice(0, 6).map((job) => {
    const title = job.name || job.payload?.message || job.payload?.text || "Scheduled job";
    const detail = job.schedule?.expr || (job.schedule?.kind ? `schedule: ${job.schedule.kind}` : "scheduled");
    return { title: truncate(title, 70), detail };
  });
}

async function readCronJobs(): Promise<CronJob[]> {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["cron", "list", "--json"], { timeout: 12000 });
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) return parsed as CronJob[];
    if (Array.isArray(parsed?.jobs)) return parsed.jobs as CronJob[];
    return [];
  } catch {
    return [];
  }
}

async function readOpenclawStatus() {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["status", "--json"], { timeout: 12000 });
    const parsed = JSON.parse(stdout);
    const recent = parsed?.sessions?.recent?.[0];
    const heartbeatModel = parsed?.heartbeat?.agents?.[0]?.model;
    const activeRecent = Array.isArray(parsed?.sessions?.recent)
      ? parsed.sessions.recent.find((s: { key?: string; age?: number }) => Number(s?.age ?? 9e9) < 180000)
      : null;

    const activeTask = activeRecent?.key
      ? `${String(activeRecent.key).split(":").pop()} task`
      : null;

    return {
      model: recent?.model as string | undefined,
      fallbacks: [] as string[],
      heartbeatModel: heartbeatModel as string | undefined,
      updatedAt: typeof recent?.updatedAt === "number" ? new Date(recent.updatedAt).toISOString() : null,
      activeTask,
    };
  } catch {
    return null;
  }
}

async function resolveRuntimeRoot(): Promise<string | null> {
  for (const candidate of RUNTIME_PATHS) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {}
  }
  return null;
}

async function readJson<T>(root: string, filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(root, filename), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
