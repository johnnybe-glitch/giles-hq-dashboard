import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_MINUTE = 60_000;
const TWO_MINUTES = 120_000;
const TEN_SECONDS = 10_000;

const RUNTIME_PATHS = [
  process.env.GILES_RUNTIME_DIR,
  "/Users/johnny2/Desktop/_Giles Shared/runtime",
  "/Users/johnny2/Desktop/_Giles_Shared/runtime",
].filter(Boolean) as string[];

type PresenceFile = {
  bot_name?: string;
  state?: string;
  updated_at?: string;
  detail?: string;
};

type StatusFile = {
  bot_name?: string;
  presence_state?: string;
  status_text?: string;
  last_heartbeat_at?: string;
  last_activity_at?: string;
  last_error_at?: string;
  last_error_message?: string;
  current_run?: {
    task_name?: string;
    stage?: { name?: string; index?: number; total?: number };
  };
};

type TokenSnapshotFile = {
  tokens_today?: number;
  tokens_30d_total?: number;
};

export async function GET() {
  const runtimeRoot = await resolveRuntimeRoot();
  if (!runtimeRoot) {
    return NextResponse.json(buildOfflinePayload("Runtime folder not found"));
  }

  const [presence, status, tokens] = await Promise.all([
    readJson<PresenceFile>(runtimeRoot, "presence.json"),
    readJson<StatusFile>(runtimeRoot, "status.json"),
    readJson<TokenSnapshotFile>(runtimeRoot, "token_snapshot.json"),
  ]);

  const now = Date.now();

  const presenceState = normalizeState(presence?.state);
  const statusState = normalizeState(status?.presence_state);
  const lastHeartbeatTs = parseTimestamp(status?.last_heartbeat_at);
  const lastActivityTs = parseTimestamp(status?.last_activity_at);
  const presenceUpdatedTs = parseTimestamp(presence?.updated_at);
  const signalTs = firstTimestamp([lastHeartbeatTs, lastActivityTs, presenceUpdatedTs]);
  const lastErrorTs = parseTimestamp(status?.last_error_at);

  const lastHeartbeatIso = toIso(signalTs);
  const lastActivityIso = toIso(lastActivityTs);
  const lastErrorIso = toIso(lastErrorTs);

  const lastErrorMessage = status?.last_error_message ?? null;
  const presenceDetail = presence?.detail;
  const currentTask = status?.current_run?.task_name;

  const state = computeState({
    now,
    signalTs,
    lastErrorTs,
    lastActivityTs,
    presenceState,
    statusState,
    lastErrorMessage,
  });

  const computedWhy = computeWhy(state, {
    lastErrorMessage,
    presenceDetail,
    currentTask,
    runtimeRoot,
    hasSignal: Boolean(signalTs),
  });

  const payload = {
    bot_name: presence?.bot_name ?? status?.bot_name ?? "Gilbert",
    computed_state: state,
    computed_why: computedWhy,
    last_heartbeat_at: lastHeartbeatIso,
    last_activity_at: lastActivityIso,
    last_error_at: lastErrorIso,
    last_error_message: lastErrorMessage,
    tokens_today: tokens?.tokens_today ?? null,
    tokens_30d_total: tokens?.tokens_30d_total ?? null,
  };

  return NextResponse.json(payload);
}

async function resolveRuntimeRoot(): Promise<string | null> {
  for (const candidate of RUNTIME_PATHS) {
    if (!candidate) continue;
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error?.code !== "ENOENT") {
        console.warn("runtime path access issue", candidate, error?.message ?? "");
      }
    }
  }
  return null;
}

async function readJson<T>(root: string, filename: string): Promise<T | null> {
  try {
    const filePath = path.join(root, filename);
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data) as T;
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error?.code !== "ENOENT") {
      console.warn(`Failed to read ${filename}`, error?.message ?? "");
    }
    return null;
  }
}

function parseTimestamp(value?: string | number | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    return value > 1e12 ? value : value * 1000;
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function firstTimestamp(values: Array<number | null>): number | null {
  for (const ts of values) {
    if (typeof ts === "number" && !Number.isNaN(ts)) {
      return ts;
    }
  }
  return null;
}

function toIso(value: number | null): string | null {
  return typeof value === "number" ? new Date(value).toISOString() : null;
}

function normalizeState(value?: string | null): PresenceFile["state"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (["idle", "working", "blocked", "error", "offline"].includes(normalized)) {
    return normalized as PresenceFile["state"];
  }
  return undefined;
}

function computeState(params: {
  now: number;
  signalTs: number | null;
  lastErrorTs: number | null;
  lastActivityTs: number | null;
  presenceState?: string;
  statusState?: string;
  lastErrorMessage?: string | null;
}): "idle" | "working" | "blocked" | "error" | "offline" {
  const { now, signalTs, lastErrorTs, lastActivityTs, presenceState, statusState, lastErrorMessage } = params;
  const offline = !signalTs || now - signalTs > ONE_MINUTE;
  if (offline) return "offline";

  const isError =
    (lastErrorTs && now - lastErrorTs <= TWO_MINUTES) ||
    presenceState === "error" ||
    statusState === "error";
  if (isError) return "error";

  const blocked =
    presenceState === "blocked" ||
    statusState === "blocked" ||
    (lastErrorMessage ? /approval|blocked|awaiting/i.test(lastErrorMessage) : false);
  if (blocked) return "blocked";

  const working =
    presenceState === "working" ||
    statusState === "working" ||
    (lastActivityTs ? now - lastActivityTs <= TEN_SECONDS : false);
  if (working) return "working";

  return "idle";
}

function computeWhy(
  state: "idle" | "working" | "blocked" | "error" | "offline",
  context: {
    lastErrorMessage?: string | null;
    presenceDetail?: string;
    currentTask?: string;
    runtimeRoot?: string | null;
    hasSignal: boolean;
  },
) {
  if (state === "offline") {
    if (!context.runtimeRoot) return "Runtime folder not found";
    if (!context.hasSignal) return "No recent heartbeat";
    return "No recent heartbeat";
  }
  if (state === "error") {
    return context.lastErrorMessage ?? context.presenceDetail ?? "Recent error";
  }
  if (state === "blocked") {
    return context.lastErrorMessage ?? context.presenceDetail ?? "Waiting for approval";
  }
  if (state === "working") {
    return context.presenceDetail ?? context.currentTask ?? "Working";
  }
  return "Idle";
}

function buildOfflinePayload(reason: string) {
  return {
    bot_name: "Gilbert",
    computed_state: "offline" as const,
    computed_why: reason,
    last_heartbeat_at: null,
    last_activity_at: null,
    last_error_at: null,
    last_error_message: null,
    tokens_today: null,
    tokens_30d_total: null,
  };
}
