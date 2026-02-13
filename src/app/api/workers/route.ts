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

type WorkerState = "idle" | "working" | "blocked" | "error" | "offline";

type WorkerRow = {
  id: string;
  name: string;
  role: string;
  state: WorkerState;
  activity?: string;
  task?: string;
  progress?: number;
  model?: string;
  ageLabel?: string;
  isMain?: boolean;
};

type WorkerFile = {
  workers?: Array<{
    id?: string;
    name?: string;
    role?: string;
    state?: WorkerState;
    activity?: string;
    task?: string;
    progress?: number;
    model?: string;
    ageLabel?: string;
    isMain?: boolean;
  }>;
};

export async function GET() {
  const fromRuntime = await readWorkersFromRuntime();
  if (fromRuntime.length) return NextResponse.json({ workers: sortWorkers(ensureCoordinator(fromRuntime)) });

  const fromStatus = await readWorkersFromOpenclaw();
  if (fromStatus.length) return NextResponse.json({ workers: sortWorkers(ensureCoordinator(fromStatus)) });

  return NextResponse.json({ workers: sortWorkers(ensureCoordinator([])) });
}

async function readWorkersFromRuntime(): Promise<WorkerRow[]> {
  for (const root of RUNTIME_PATHS) {
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) continue;
      const file = path.join(root, "workers.json");
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as WorkerFile;
      const rows = (parsed.workers ?? []).map((w, idx) => ({
        id: w.id ?? `worker-${idx}`,
        name: w.name ?? `Worker-${idx + 1}`,
        role: w.role ?? "Subagent",
        state: normalizeState(w.state),
        activity: w.activity,
        task: w.task ?? w.activity ?? "In progress",
        progress: clampProgress(w.progress),
        model: w.model,
        ageLabel: w.ageLabel,
        isMain: Boolean(w.isMain),
      }));
      if (rows.length) return rows;
    } catch {}
  }
  return [];
}

async function readWorkersFromOpenclaw(): Promise<WorkerRow[]> {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["status", "--json"], { timeout: 12000 });
    const parsed = JSON.parse(stdout);
    const sessions = parsed?.sessions?.recent;
    if (!Array.isArray(sessions)) return [];

    return sessions.map(
      (
        s: { key?: string; percentUsed?: number; abortedLastRun?: boolean; age?: number; model?: string },
        idx: number,
      ) => {
        const key = String(s?.key ?? "");
        const isMain = key.includes(":main");
        const rawName = key.split(":").pop() || `Subagent-${idx + 1}`;
        const name = isMain ? "Giles" : humanizeName(rawName);
        const percentUsed = Number(s?.percentUsed ?? 0);
        const ageMs = Number(s?.age ?? 0);

        const state: WorkerState =
          percentUsed >= 100 ? "blocked" : s?.abortedLastRun ? "error" : ageMs < 120000 ? "working" : "idle";

        const progress =
          state === "working"
            ? Math.min(95, Math.max(10, 100 - Math.min(90, Math.round(percentUsed || 20))))
            : state === "blocked"
              ? 100
              : state === "idle"
                ? 0
                : 30;

        return {
          id: key || `session-${idx}`,
          name,
          role: isMain ? "Coordinator" : "Subagent",
          state,
          task: state === "working" ? `${name} task — In progress` : state === "blocked" ? `${name} task — Awaiting input` : `${name} task — Idle`,
          activity: state === "working" ? "In progress (awaiting label)" : state === "blocked" ? "Waiting for context reset" : "Standing by",
          progress,
          model: s?.model,
          ageLabel: formatAge(ageMs),
          isMain,
        };
      },
    );
  } catch {
    return [];
  }
}

function humanizeName(v: string) {
  const seaNames = [
    "Dolphin",
    "Orca",
    "Manta",
    "Nautilus",
    "Seahorse",
    "Marlin",
    "Jellyfish",
    "Coral",
    "Kraken",
    "Turtle",
  ];

  const m = v.match(/(\d+)/);
  const n = m ? Number(m[1]) : Math.abs(hashCode(v));
  const base = seaNames[n % seaNames.length];
  return `${base}-${(n % 97) + 1}`;
}

function hashCode(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function clampProgress(v?: number) {
  if (!Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(100, Number(v)));
}

function normalizeState(value?: string): WorkerState {
  const v = (value ?? "idle").toLowerCase();
  if (["idle", "working", "blocked", "error", "offline"].includes(v)) return v as WorkerState;
  return "idle";
}

function ensureCoordinator(rows: WorkerRow[]): WorkerRow[] {
  const hasMain = rows.some((r) => r.isMain || r.name.toLowerCase() === "giles");
  if (hasMain) {
    return rows.map((r) =>
      r.isMain || r.name.toLowerCase() === "giles"
        ? { ...r, id: r.id || "main", name: "Giles", role: "Coordinator", isMain: true }
        : r,
    );
  }
  return [
    {
      id: "main",
      name: "Giles",
      role: "Coordinator",
      state: "idle",
      activity: "Standing by",
      task: "No active task",
      progress: 0,
      ageLabel: "now",
      isMain: true,
    },
    ...rows,
  ];
}

function sortWorkers(rows: WorkerRow[]): WorkerRow[] {
  const priority: Record<WorkerState, number> = { error: 0, blocked: 1, working: 2, idle: 3, offline: 4 };
  const main = rows.filter((r) => r.isMain);
  const subs = rows
    .filter((r) => !r.isMain)
    .sort((a, b) => priority[a.state] - priority[b.state] || a.name.localeCompare(b.name));
  return [...main, ...subs];
}
