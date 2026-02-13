import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "/opt/homebrew/bin/openclaw";

type WindowRow = {
  label: string;
  usedPercent: number;
  leftPercent: number;
  resetAt: string | null;
  tone: "green" | "amber" | "red";
};

export async function GET() {
  try {
    const { stdout } = await execFileAsync(OPENCLAW_BIN, ["status", "--json", "--usage"], { timeout: 12000 });
    const parsed = JSON.parse(stdout);
    const provider = parsed?.usage?.providers?.[0];
    const windows = Array.isArray(provider?.windows) ? provider.windows : [];

    const rows: WindowRow[] = windows.map((w: { label?: string; usedPercent?: number; resetAt?: number }) => {
      const used = clamp(Number(w?.usedPercent ?? 0));
      const left = clamp(100 - used);
      return {
        label: String(w?.label ?? "Window"),
        usedPercent: used,
        leftPercent: left,
        resetAt: Number.isFinite(w?.resetAt) ? new Date(Number(w.resetAt)).toISOString() : null,
        tone: left > 66 ? "green" : left > 33 ? "amber" : "red",
      };
    });

    return NextResponse.json({
      provider: provider?.displayName ?? provider?.provider ?? "OpenClaw",
      windows: rows,
      updatedAt: parsed?.usage?.updatedAt ? new Date(Number(parsed.usage.updatedAt)).toISOString() : null,
    });
  } catch {
    return NextResponse.json({ provider: "OpenClaw", windows: [], updatedAt: null });
  }
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
