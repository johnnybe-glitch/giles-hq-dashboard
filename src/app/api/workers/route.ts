import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNTIME_PATHS = [
  process.env.GILES_RUNTIME_DIR,
  "/Users/johnny2/Desktop/_Giles Shared/runtime",
  "/Users/johnny2/Desktop/_Giles_Shared/runtime",
  "/Users/giles2/Desktop/_Giles Shared/runtime",
  "/Users/giles2/Desktop/_Giles_Shared/runtime",
  "/Users/giles/Desktop/_Giles Shared/runtime",
  "/Users/giles/Desktop/_Giles_Shared/runtime",
].filter(Boolean) as string[];

type WorkerState = "idle" | "working" | "blocked" | "error" | "offline";

type WorkerRow = {
  id: string;
  name: string;
  role: string;
  state: WorkerState;
  status_text?: string;
  model?: string;
  last_seen_at?: string;
  focus?: string;
  last_error?: string;
  last_command?: string;
  duration_seconds?: number;
  run_count?: number;
  last_run_at?: string;
  last_run_status?: "ok" | "blocked" | "error";
  isMain?: boolean;
};

type WorkerFile = {
  updated_at?: string;
  workers?: Array<{
    id?: string;
    name?: string;
    role?: string;
    state?: string;
    status_text?: string;
    model?: string;
    last_seen_at?: string;
    focus?: string;
    last_error?: string;
    last_command?: string;
    duration_seconds?: number;
    run_count?: number;
    last_run_at?: string;
    last_run_status?: string;
  }>;
};

const DEFAULT_ROSTER: WorkerRow[] = [
  { id: "main", name: "Gilbert", role: "Coordinator", state: "idle", isMain: true },
  { id: "operator", name: "Operator", role: "Execution", state: "idle" },
  { id: "scout", name: "Scout", role: "Research", state: "idle" },
  { id: "qa", name: "QA", role: "Verification", state: "idle" },
];

export async function GET() {
  const runtimeWorkers = await readWorkersFromRuntime();
  const workers = mergeRoster(runtimeWorkers);
  return NextResponse.json({ workers });
}

async function readWorkersFromRuntime(): Promise<WorkerRow[]> {
  for (const root of RUNTIME_PATHS) {
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) continue;
      const file = path.join(root, "workers.json");
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as WorkerFile;
      const rows = (parsed.workers ?? []).map((w) => ({
        id: String(w.id ?? "").toLowerCase(),
        name: String(w.name ?? "").trim(),
        role: String(w.role ?? "").trim(),
        state: normalizeState(w.state),
        status_text: normalizeText(w.status_text),
        model: normalizeText(w.model),
        last_seen_at: normalizeIso(w.last_seen_at),
        focus: normalizeText(w.focus),
        last_error: normalizeText(w.last_error),
        last_command: normalizeText(w.last_command),
        duration_seconds: normalizeSeconds(w.duration_seconds),
        run_count: normalizeCount(w.run_count),
        last_run_at: normalizeIso(w.last_run_at),
        last_run_status: normalizeRunStatus(w.last_run_status),
        isMain: String(w.id ?? "").toLowerCase() === "main",
      }));
      return rows.filter((r) => r.id);
    } catch {
      continue;
    }
  }
  return [];
}

function mergeRoster(input: WorkerRow[]): WorkerRow[] {
  const byId = new Map(input.map((w) => [w.id, w]));

  return DEFAULT_ROSTER.map((base) => {
    const live = byId.get(base.id);
    const state = live?.state ?? base.state;
    return {
      ...base,
      state,
      name: live?.name || base.name,
      role: live?.role || base.role,
      status_text: live?.status_text,
      model: live?.model,
      last_seen_at: live?.last_seen_at,
      focus: live?.focus || "No active task",
      last_error: state === "error" || state === "blocked" ? live?.last_error : undefined,
      last_command: live?.last_command,
      duration_seconds: live?.duration_seconds,
      run_count: live?.run_count,
      last_run_at: live?.last_run_at,
      last_run_status: live?.last_run_status,
      isMain: base.id === "main",
    };
  });
}

function normalizeState(value?: string): WorkerState {
  const v = (value ?? "idle").toLowerCase();
  if (["idle", "working", "blocked", "error", "offline"].includes(v)) return v as WorkerState;
  return "idle";
}

function normalizeText(value?: string): string | undefined {
  const out = (value ?? "").trim();
  return out.length ? out : undefined;
}

function normalizeIso(value?: string): string | undefined {
  const v = normalizeText(value);
  if (!v) return undefined;
  const ts = Date.parse(v);
  return Number.isNaN(ts) ? undefined : new Date(ts).toISOString();
}

function normalizeSeconds(value?: number): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return undefined;
  return Math.round(value);
}

function normalizeCount(value?: number): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return undefined;
  return Math.floor(value);
}

function normalizeRunStatus(value?: string): "ok" | "blocked" | "error" | undefined {
  const v = (value ?? "").toLowerCase();
  if (v === "ok" || v === "blocked" || v === "error") return v;
  return undefined;
}
