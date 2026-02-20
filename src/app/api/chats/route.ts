import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSIONS_DIR = "/Users/giles2/.openclaw/agents/main/sessions";

type TranscriptPart = { type?: string; text?: string };

type TranscriptRow = {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | TranscriptPart[];
  };
};

type ChatRow = { ts: string | null; role: string; text: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 10)));

  const files = await sessionFilesInPriorityOrder();
  if (!files.length) return NextResponse.json({ chats: [] as ChatRow[] });

  const out: ChatRow[] = [];

  for (const file of files) {
    if (out.length >= limit) break;

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
          const rawText = contentToText(entry.message?.content);
          const text = humanizeChat(rawText);

          return {
            ts: typeof entry.timestamp === "string" ? entry.timestamp : null,
            role: role === "user" || role === "assistant" ? role : "assistant",
            text,
          };
        })
        .filter((r) => r.text.length > 0)
        .reverse();

      for (const row of rows) {
        if (out.length >= limit) break;
        out.push(row);
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json({ chats: out.slice(0, limit) });
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

async function sessionFilesInPriorityOrder(): Promise<string[]> {
  try {
    const files = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".jsonl"));
    if (!files.length) return [];

    const withStats = await Promise.all(
      files.map(async (name) => {
        const fp = path.join(SESSIONS_DIR, name);
        const st = await fs.stat(fp);
        return { name, fp, mtimeMs: st.mtimeMs };
      }),
    );

    withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const mainSessionId = await resolveMainSessionId();
    const mainFile = mainSessionId ? `${mainSessionId}.jsonl` : null;

    const main = withStats.filter((x) => mainFile && x.name === mainFile).map((x) => x.fp);
    const others = withStats.filter((x) => !mainFile || x.name !== mainFile).map((x) => x.fp);

    return [...main, ...others];
  } catch {
    return [];
  }
}

async function resolveMainSessionId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(SESSIONS_DIR, "sessions.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, { sessionId?: string }>;
    return parsed?.["agent:main:main"]?.sessionId ?? null;
  } catch {
    return null;
  }
}

function contentToText(content?: string | TranscriptPart[]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => part.text ?? "")
    .join(" ");
}
