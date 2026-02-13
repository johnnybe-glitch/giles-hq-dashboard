import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSIONS_DIR = "/Users/giles/.openclaw/agents/main/sessions";

type TranscriptRow = {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
};

type ChatRow = { ts: string | null; role: string; text: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit") || 10)));

  const file = await latestSessionFile();
  if (!file) return NextResponse.json({ chats: [] as ChatRow[] });

  try {
    const raw = await fs.readFile(file, "utf8");
    const rows = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as TranscriptRow;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is TranscriptRow => Boolean(entry && entry.type === "message" && entry.message))
      .map((entry) => {
        const role = entry.message?.role;
        const rawText = (entry.message?.content ?? [])
          .filter((part) => part?.type === "text" && typeof part?.text === "string")
          .map((part) => part.text ?? "")
          .join(" ");

        const text = humanizeChat(rawText);

        return {
          ts: typeof entry.timestamp === "string" ? entry.timestamp : null,
          role: role === "user" || role === "assistant" ? role : "assistant",
          text,
        };
      })
      .filter((r) => r.text.length > 0)
      .reverse()
      .slice(0, limit);

    return NextResponse.json({ chats: rows });
  } catch {
    return NextResponse.json({ chats: [] as ChatRow[] });
  }
}

function humanizeChat(input: string): string {
  const text = input
    .replace(/\[\[reply_to_current\]\]/gi, "")
    .replace(/\[\[[^\]]+\]\]/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\b(call_[a-zA-Z0-9|_:-]+|fc_[a-zA-Z0-9|_:-]+)\b/g, "")
    .replace(/\b(openclaw|npm|curl|python3|jsonl|tool|api|route\.ts)\b/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}

async function latestSessionFile(): Promise<string | null> {
  try {
    const files = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".jsonl"));
    if (!files.length) return null;
    const items = await Promise.all(
      files.map(async (f) => {
        const fp = path.join(SESSIONS_DIR, f);
        const st = await fs.stat(fp);
        return { fp, m: st.mtimeMs };
      }),
    );
    items.sort((a, b) => b.m - a.m);
    return items[0]?.fp ?? null;
  } catch {
    return null;
  }
}
