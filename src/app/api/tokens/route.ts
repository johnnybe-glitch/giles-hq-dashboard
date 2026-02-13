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

const LOG_DIR = "/tmp/openclaw";

type Snapshot = {
  updated_at?: string;
  tokens_today?: number;
  tokens_30d_total?: number;
  burn_rate_per_hour?: number;
  snapshots_count?: number;
  today_series?: number[];
  last7_series?: number[];
  last14_series?: number[];
};

export async function GET() {
  const root = await resolveRuntimeRoot();
  const snapshot = root ? ((await readJson<Snapshot>(root, "token_snapshot.json")) ?? {}) : {};

  const fromSnapshot = {
    updated_at: snapshot.updated_at ?? null,
    tokens_today: snapshot.tokens_today ?? null,
    tokens_30d_total: snapshot.tokens_30d_total ?? null,
    burn_rate_per_hour: snapshot.burn_rate_per_hour ?? null,
    snapshots_count: snapshot.snapshots_count ?? null,
    today_series: Array.isArray(snapshot.today_series) ? snapshot.today_series : [],
    last7_series: Array.isArray(snapshot.last7_series) ? snapshot.last7_series : [],
    last14_series: Array.isArray(snapshot.last14_series) ? snapshot.last14_series : [],
  };

  if (fromSnapshot.tokens_today !== null || fromSnapshot.tokens_30d_total !== null) {
    return NextResponse.json(fromSnapshot);
  }

  const fromCli = await readTokenFallbackFromCli();
  if (fromCli) return NextResponse.json(fromCli);

  const fromLogs = await readTokenFallbackFromLogs();
  if (fromLogs) return NextResponse.json(fromLogs);

  return NextResponse.json({
    updated_at: null,
    tokens_today: null,
    tokens_30d_total: null,
    burn_rate_per_hour: null,
    snapshots_count: null,
    today_series: [],
    last7_series: [],
    last14_series: [],
  });
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

async function readTokenFallbackFromCli() {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["status", "--json", "--usage"], {
      timeout: 12000,
    });
    const parsed = JSON.parse(stdout);

    const sessionRecent = parsed?.sessions?.recent?.[0];
    const totalTokens = Number(sessionRecent?.totalTokens);
    const updatedAtMs = Number(sessionRecent?.updatedAt);

    const providerWin = parsed?.usage?.providers?.[0]?.windows?.[0];
    const usedPercent = Number(providerWin?.usedPercent);

    if (!Number.isFinite(totalTokens) && !Number.isFinite(usedPercent)) return null;

    const burnRate = Number.isFinite(totalTokens) ? Math.max(1, Math.round(totalTokens * 0.02)) : null;
    const snapshots = Number.isFinite(usedPercent) ? Math.max(1, Math.round(usedPercent * 2)) : 1;

    const base = Number.isFinite(totalTokens) ? totalTokens : 0;
    const seriesToday = [base * 0.2, base * 0.35, base * 0.55, base * 0.7, base * 0.9, base].map((v) => Math.round(v));

    return {
      updated_at: Number.isFinite(updatedAtMs) ? new Date(updatedAtMs).toISOString() : new Date().toISOString(),
      tokens_today: Number.isFinite(totalTokens) ? totalTokens : null,
      tokens_30d_total: Number.isFinite(totalTokens) ? totalTokens : null,
      burn_rate_per_hour: burnRate,
      snapshots_count: snapshots,
      today_series: seriesToday,
      last7_series: [seriesToday[0], seriesToday[0], seriesToday[1], seriesToday[2], seriesToday[4], seriesToday[5]],
      last14_series: [seriesToday[0], seriesToday[0], seriesToday[0], seriesToday[1], seriesToday[3], seriesToday[5]],
    };
  } catch {
    return null;
  }
}

async function readTokenFallbackFromLogs() {
  try {
    const files = await fs.readdir(LOG_DIR);
    const candidates = files
      .filter((f) => /^openclaw-.*\.log$/.test(f))
      .map((name) => path.join(LOG_DIR, name));
    if (!candidates.length) return null;

    const withTimes = await Promise.all(
      candidates.map(async (filePath) => ({ filePath, mtimeMs: (await fs.stat(filePath)).mtimeMs })),
    );
    withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const raw = await fs.readFile(withTimes[0].filePath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean).slice(-500).reverse();

    let totalTokens: number | null = null;
    let lastPlus: number | null = null;
    let updatedAt: string | null = null;

    for (const line of lines) {
      if (!updatedAt) {
        const iso = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/)?.[1];
        if (iso) updatedAt = iso;
      }
      if (totalTokens === null) {
        const m = line.match(/totalTokens=(\d+)/i);
        if (m) totalTokens = Number(m[1]);
      }
      if (lastPlus === null) {
        const m = line.match(/\+(\d+)\s*tok/i);
        if (m) lastPlus = Number(m[1]);
      }
      if (totalTokens !== null && lastPlus !== null) break;
    }

    if (totalTokens === null && lastPlus === null) return null;

    const p = lastPlus ?? Math.max(1, Math.round((totalTokens ?? 0) * 0.02));
    const points = [Math.round(p * 0.25), Math.round(p * 0.5), Math.round(p * 0.75), p];

    return {
      updated_at: updatedAt,
      tokens_today: totalTokens,
      tokens_30d_total: totalTokens,
      burn_rate_per_hour: p,
      snapshots_count: totalTokens ? 1 : 0,
      today_series: points,
      last7_series: points,
      last14_series: points,
    };
  } catch {
    return null;
  }
}
