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

  const [openclaw, modelStatus] = await Promise.all([readOpenclawStatus(), readOpenclawModelStatus()]);
  const latestUserTask = await readLatestUserTask();
  const hasActiveWork =
    Boolean(status?.current_run?.task_name) || Boolean(openclaw?.hasActiveSubagent) || Boolean(openclaw?.hasRecentMainActivity);
  const now = buildNow(status, openclaw?.activeTask, latestUserTask, hasActiveWork);
  const queued = await buildQueued();

  // Prefer live session model over cached/default configs
  const model = openclaw?.model ?? status?.model ?? modelStatus?.primary ?? "gpt-5.3-codex";
  const fallbacks = openclaw?.fallbacks?.length
    ? openclaw.fallbacks
    : status?.fallbacks?.length
      ? status.fallbacks
      : modelStatus?.fallbacks?.length
        ? modelStatus.fallbacks
        : [];
  const localHelper =
    typeof status?.local_helper === "boolean"
      ? status.local_helper
      : (openclaw?.heartbeatModel ?? "").toLowerCase().startsWith("ollama/");

  const lastUpdateIso = status?.last_activity_at ?? openclaw?.updatedAt ?? null;

  const explicitState = (status?.presence_state ?? "").toLowerCase();
  const computedState =
    explicitState === "error" || explicitState === "blocked" || explicitState === "offline"
      ? explicitState
      : hasActiveWork
        ? "working"
        : "idle";

  return NextResponse.json({
    now,
    queued,
    status: computedState.toUpperCase(),
    model,
    fallbacks,
    local_helper: localHelper,
    last_update_at: lastUpdateIso,
    plan_text: status?.status_text ?? "This is my current plan. It updates as tasks/subagents progress.",
  });
}

function buildNow(status: StatusFile | null, activeTask?: string | null, latestUserTask?: string | null, hasActiveWork = false) {
  const task = status?.current_run?.task_name;
  const stage = status?.current_run?.stage;
  const stageText = stage?.name
    ? `${stage.name}${stage.index && stage.total ? ` (${stage.index}/${stage.total})` : ""}`
    : null;

  const genericActive = activeTask && /^main task$/i.test(activeTask.trim());
  const chosenTask = task ?? (genericActive ? null : activeTask) ?? latestUserTask ?? activeTask;

  return {
    title: chosenTask ?? "No active task",
    detail: stageText ?? status?.status_text ?? (hasActiveWork ? "In progress" : "Standing by"),
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

async function readOpenclawModelStatus(): Promise<{ primary?: string; fallbacks: string[] } | null> {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["models", "status", "--json"], { timeout: 12000 });
    const parsed = JSON.parse(stdout);
    return {
      primary: parsed?.resolvedDefault ?? parsed?.defaultModel,
      fallbacks: Array.isArray(parsed?.fallbacks) ? parsed.fallbacks : [],
    };
  } catch {
    return null;
  }
}

async function readOpenclawStatus() {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["status", "--json"], { timeout: 12000 });
    const parsed = JSON.parse(stdout);
    const recent = parsed?.sessions?.recent?.[0];
    const heartbeatModel = parsed?.heartbeat?.agents?.[0]?.model;
    const recentSessions = Array.isArray(parsed?.sessions?.recent) ? parsed.sessions.recent : [];
    const activeRecent = recentSessions.find((s: { key?: string; age?: number }) => Number(s?.age ?? 9e9) < 180000);
    const hasActiveSubagent = recentSessions.some(
      (s: { key?: string; age?: number }) => !String(s?.key ?? "").endsWith(":main") && Number(s?.age ?? 9e9) < 180000,
    );
    const hasRecentMainActivity = recentSessions.some(
      (s: { key?: string; age?: number }) => String(s?.key ?? "").endsWith(":main") && Number(s?.age ?? 9e9) < 60000,
    );

    const activeTask = activeRecent?.key ? `${String(activeRecent.key).split(":").pop()} task` : null;

    return {
      model: recent?.model as string | undefined,
      fallbacks: [] as string[],
      heartbeatModel: heartbeatModel as string | undefined,
      updatedAt: typeof recent?.updatedAt === "number" ? new Date(recent.updatedAt).toISOString() : null,
      activeTask,
      hasActiveSubagent,
      hasRecentMainActivity,
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

async function readLatestUserTask(): Promise<string | null> {
  try {
    const dir = "/Users/giles/.openclaw/agents/main/sessions";
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
    if (!files.length) return null;

    const stats = await Promise.all(
      files.map(async (f) => {
        const fp = path.join(dir, f);
        const st = await fs.stat(fp);
        return { fp, m: st.mtimeMs };
      }),
    );
    stats.sort((a, b) => b.m - a.m);

    const raw = await fs.readFile(stats[0].fp, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean).reverse();

    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (row?.type !== "message" || row?.message?.role !== "user") continue;
        const text = (row?.message?.content ?? [])
          .filter((p: { type?: string; text?: string }) => p?.type === "text" && typeof p?.text === "string")
          .map((p: { text?: string }) => p.text ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!text) continue;
        return summarizeTaskText(text);
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

function summarizeTaskText(input: string): string {
  const cleaned = input
    .replace(/Conversation info[\s\S]*$/i, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/\[\[[^\]]+\]\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Working on your latest task";
  const firstSentence = cleaned.split(/[.!?]\s/)[0] ?? cleaned;
  return truncate(firstSentence, 72);
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
