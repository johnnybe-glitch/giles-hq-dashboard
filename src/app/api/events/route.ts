import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_DIR = "/tmp/openclaw";
const execFileAsync = promisify(execFile);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/opt/homebrew/bin/openclaw";

type EventRow = {
  ts: string | null;
  type: string;
  message: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 10)));

  const logFile = await resolveLatestLogFile();
  if (!logFile) return NextResponse.json({ events: [] as EventRow[] });

  const content = await readTextFile(logFile);
  if (!content) return NextResponse.json({ events: [] as EventRow[] });

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2500)
    .filter((line) => isMeaningful(line));

  const events = lines.reverse().slice(0, limit).map(parseLogLine);

  const heartbeatEvent = await getHeartbeatEvent();
  const withHeartbeat = heartbeatEvent ? [heartbeatEvent, ...events].slice(0, limit) : events;

  return NextResponse.json({ events: withHeartbeat });
}

async function resolveLatestLogFile(): Promise<string | null> {
  try {
    const files = await fs.readdir(LOG_DIR);
    const candidates = files
      .filter((f) => /^openclaw-.*\.log$/.test(f))
      .map((name) => path.join(LOG_DIR, name));

    if (!candidates.length) return null;

    const withTimes = await Promise.all(
      candidates.map(async (filePath) => {
        const stat = await fs.stat(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      }),
    );

    withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return withTimes[0]?.filePath ?? null;
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function isMeaningful(line: string) {
  const l = line.toLowerCase();
  return (
    l.includes("heartbeat") ||
    l.includes("session state") ||
    l.includes("run registered") ||
    l.includes("embedded run") ||
    l.includes("worker") ||
    l.includes("cron") ||
    l.includes("error") ||
    l.includes("warn")
  );
}

function parseLogLine(line: string): EventRow {
  const isoMatch = line.match(/(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z)/i);
  const bracketMatch = line.match(/\[(\d{4}-\d{2}-\d{2}[^\]]+)\]/);
  const tsRaw = isoMatch?.[1] ?? bracketMatch?.[1] ?? null;

  const lower = line.toLowerCase();
  const type = lower.includes("error")
    ? "error"
    : lower.includes("warn")
      ? "warning"
      : lower.includes("heartbeat")
        ? "heartbeat"
        : lower.includes("worker")
          ? "workers"
          : "event";

  return {
    ts: normalizeTimestamp(tsRaw),
    type,
    message: summarize(line),
  };
}

function normalizeTimestamp(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return value;
}

async function getHeartbeatEvent(): Promise<EventRow | null> {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["status", "--json"], { timeout: 10000 });
    const parsed = JSON.parse(stdout);
    const hb = parsed?.lastHeartbeat;
    if (!hb) return null;

    const ts = typeof hb?.at === "string" ? hb.at : typeof hb?.ts === "string" ? hb.ts : null;
    const note = typeof hb?.summary === "string" && hb.summary.trim() ? hb.summary.trim() : "Heartbeat received";

    return {
      ts: normalizeTimestamp(ts),
      type: "heartbeat",
      message: note,
    };
  } catch {
    return null;
  }
}

function summarize(line: string): string {
  const raw = line.replace(/^\[[^\]]+\]\s*/, "");

  const toolStart = raw.match(/embedded run tool start:.*tool=([^\s,]+)/i)?.[1];
  if (toolStart) return `Tool started: ${toolStart}`;

  const toolEnd = raw.match(/embedded run tool end:.*tool=([^\s,]+)/i)?.[1];
  if (toolEnd) return `Tool finished: ${toolEnd}`;

  if (/embedded run agent start/i.test(raw)) return "Agent run started";
  if (/embedded run agent end/i.test(raw)) return "Agent run finished";
  if (/embedded run prompt start/i.test(raw)) return "Prompt started";
  if (/embedded run prompt end/i.test(raw)) return "Prompt finished";

  if (/heartbeat/i.test(raw)) return "Heartbeat check";

  if (/session state:/i.test(raw)) {
    const next = raw.match(/new=([^\s,]+)/i)?.[1];
    return next ? `Session state: ${next}` : "Session state updated";
  }

  if (/run registered/i.test(raw)) return "Run registered";

  const clean = raw
    .replace(/_meta\s*:.*$/i, "")
    .replace(/(runId|toolCallId|sessionId|sessionKey|traceId|hostname|runtimeVersion|fullFilePath|fileNameWithLine|filePathWithLine|filePath|fileName|fileColumn|fileLine|method|parentNames|logLevelName|logLevelId)=[^\s,]+/gi, "")
    .replace(/[{}\[\]"]+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > 100 ? `${clean.slice(0, 99)}…` : clean || "System event";
}
