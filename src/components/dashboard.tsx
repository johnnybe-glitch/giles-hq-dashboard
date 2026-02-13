"use client";

import { useEffect, useState } from "react";
import { PresenceOctopus } from "./presence-octopus";
import { Pill } from "./ui/pill";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollableList } from "./ui/scrollable-list";
import { formatRelativeTime } from "@/lib/relative-time";

const REFRESH_MS = 30_000;
const BUILD_STAMP = "Live (dev)";

type EventRow = {
  ts: string | null;
  type: string;
  message: string;
};

type ChatRow = {
  ts: string | null;
  role: string;
  text: string;
};

type NowNextData = {
  now: { title: string; detail: string };
  queued: Array<{ title: string; detail: string }>;
  status: string;
  model: string;
  fallbacks: string[];
  local_helper: boolean;
  last_update_at: string | null;
  plan_text: string;
};

type WorkerData = {
  id: string;
  name: string;
  role: string;
  state: "idle" | "working" | "blocked" | "error" | "offline";
  activity?: string;
  task?: string;
  progress?: number;
  model?: string;
  ageLabel?: string;
  isMain?: boolean;
};

type VersionInfo = {
  current: string | null;
  latest: string | null;
  updateAvailable: boolean;
};

type HeadroomData = {
  provider: string;
  updatedAt: string | null;
  windows: Array<{
    label: string;
    usedPercent: number;
    leftPercent: number;
    resetAt: string | null;
    tone: "green" | "amber" | "red";
  }>;
};

type TokenData = {
  updated_at: string | null;
  tokens_today: number | null;
  tokens_30d_total: number | null;
  burn_rate_per_hour: number | null;
  snapshots_count: number | null;
  today_series: number[];
  last7_series: number[];
  last14_series: number[];
};

export function Dashboard() {
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(0);
  const [eventLimit, setEventLimit] = useState<10 | 50>(10);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [chatRows, setChatRows] = useState<ChatRow[]>([]);
  const [eventView, setEventView] = useState<"all" | "chats">("all");
  const [tokens, setTokens] = useState<TokenData | null>(null);
  const [nowNext, setNowNext] = useState<NowNextData | null>(null);
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [headroom, setHeadroom] = useState<HeadroomData | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [eventsRes, chatsRes, tokensRes, nowNextRes, workersRes, versionRes, headroomRes] = await Promise.all([
          fetch(`/api/events?limit=${eventLimit}`, { cache: "no-store" }),
          fetch(`/api/chats?limit=${eventLimit}`, { cache: "no-store" }),
          fetch(`/api/tokens`, { cache: "no-store" }),
          fetch(`/api/now-next`, { cache: "no-store" }),
          fetch(`/api/workers`, { cache: "no-store" }),
          fetch(`/api/version`, { cache: "no-store" }),
          fetch(`/api/headroom`, { cache: "no-store" }),
        ]);

        if (!eventsRes.ok || !chatsRes.ok || !tokensRes.ok || !nowNextRes.ok || !workersRes.ok || !versionRes.ok || !headroomRes.ok) return;

        const eventsData = (await eventsRes.json()) as { events?: EventRow[] };
        const chatsData = (await chatsRes.json()) as { chats?: ChatRow[] };
        const tokenData = (await tokensRes.json()) as TokenData;
        const nowNextData = (await nowNextRes.json()) as NowNextData;
        const workersData = (await workersRes.json()) as { workers?: WorkerData[] };
        const versionData = (await versionRes.json()) as VersionInfo;
        const headroomData = (await headroomRes.json()) as HeadroomData;

        if (!cancelled) {
          setEvents(eventsData.events ?? []);
          setChatRows(chatsData.chats ?? []);
          setTokens(tokenData);
          setNowNext(nowNextData);
          setWorkers(workersData.workers ?? []);
          setVersionInfo(versionData);
          setHeadroom(headroomData);
          setLastRefreshAt(Date.now());
        }
      } catch {}
    }

    loadData();
    const timer = setInterval(() => {
      setLastRefreshAt(Date.now());
      loadData();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventLimit]);



  const triggerUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await fetch(`/api/version`, { method: "POST" });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="top-bar">
        <div className="top-left">
          <PresenceOctopus botName="Giles" state={toPresenceState(nowNext?.status)} statusText={nowNext?.status ? `Live: ${nowNext.status}` : "Live: IDLE"} />
        </div>
        <div className="top-title">AGENT DASHBOARD</div>
        <div className="top-right">
          <Pill className="pill-flat">Build: {BUILD_STAMP}</Pill>
          <Pill className="pill-flat">Last refresh: {formatRelativeTime(lastRefreshAt)}</Pill>
          <Pill>OpenClaw {versionInfo?.current ?? "—"}</Pill>
          <button className="eventlog-toggle" onClick={triggerUpdate}>
            {updating ? "Updating…" : versionInfo?.updateAvailable ? `Update to ${versionInfo.latest}` : "Refresh version"}
          </button>
        </div>
      </header>

      <main className="card-grid">
        <Card className="now-next-card">
          <CardHeader>
            <CardTitle>Now / Next</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="now-panel">
              <div className="now-label">Now</div>
              <div className="now-title">{nowNext?.now?.title ?? "No active task"}</div>
            </div>

            <div className="now-updated">Updated {formatRelativeTime(nowNext?.last_update_at ?? null)}</div>

            <div className="now-chips">
              <span className="now-chip now-chip-status">Status {nowNext?.status ?? "WORKING"}</span>
              <span className="now-chip">Model {nowNext?.model ?? "gpt-5.3-codex"}</span>
              <span className="now-chip">Fallbacks {nowNext?.fallbacks?.length ? nowNext.fallbacks.join(" → ") : "—"}</span>
              <span className="now-chip">Local helper {nowNext?.local_helper ? "ON" : "OFF"}</span>
            </div>

            <p className="now-plan">{nowNext?.plan_text ?? "This is my current plan. It updates as tasks/subagents progress."}</p>

            <div className="now-next-queue">
              {nowNext?.queued?.length ? nowNext.queued.map((item, idx) => (
                <div key={`${item.title}-${idx}`} className="list-item" style={{ padding: "6px 0" }}>
                  {item.title}
                  <span style={{ opacity: 0.65 }}> · {item.detail}</span>
                </div>
              )) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="eventlog-card">
          <CardHeader>
            <CardTitle>Event Log (Latest)</CardTitle>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="eventlog-toggle" onClick={() => setEventView("all")}>All</button>
              <button className="eventlog-toggle" onClick={() => setEventView("chats")}>Chats</button>
              <button
                className="eventlog-toggle"
                onClick={() => setEventLimit(eventLimit === 10 ? 50 : 10)}
              >
                {eventLimit === 10 ? "Show more" : "Show less"}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollableList>
              {eventView === "all" ? (
                events.length === 0 ? (
                  <p className="empty-state">No recent events.</p>
                ) : (
                  events.map((event, idx) => (
                    <div key={`${event.ts ?? "no-ts"}-${idx}`} className="list-item eventlog-line">
                      • {event.ts ? formatRelativeTime(event.ts) : "—"} · {event.type} {event.message ? ` · ${event.message}` : ""}
                    </div>
                  ))
                )
              ) : chatRows.length === 0 ? (
                <p className="empty-state">No chat history found.</p>
              ) : (
                chatRows.map((row, idx) => (
                  <div key={`${row.ts ?? "no-ts"}-${idx}`} className="list-item eventlog-line">
                    • {row.ts ? formatRelativeTime(row.ts) : "—"} · {row.role} · {row.text}
                  </div>
                ))
              )}
            </ScrollableList>
            <p className="eventlog-note">Default shows 10 rows; expand for 50.</p>
          </CardContent>
        </Card>

        <Card className="tokens-card">
          <CardHeader>
            <CardTitle>Tokens & Burn</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="tokens-metrics">
              <div className="tokens-metric">
                <div className="tokens-metric-label">Tokens today</div>
                <div className="tokens-metric-value">{formatNum(tokens?.tokens_today)}</div>
              </div>
              <div className="tokens-metric">
                <div className="tokens-metric-label">Burn rate (tokens/hour)</div>
                <div className="tokens-metric-value">{formatNum(tokens?.burn_rate_per_hour)}</div>
              </div>
              <div className="tokens-metric">
                <div className="tokens-metric-label">Snapshots</div>
                <div className="tokens-metric-value">{formatNum(tokens?.snapshots_count)}</div>
              </div>
            </div>

            <div className="tokens-updated">
              Last updated: <strong>{formatRelativeTime(tokens?.updated_at ?? null)}</strong>
            </div>

            {tokens && (tokens.today_series.length || tokens.last7_series.length || tokens.last14_series.length) ? (
              <div className="tokens-series-wrap">
                <SeriesLine label="Today" values={tokens.today_series} />
                <SeriesLine label="Last 7 days" values={tokens.last7_series} />
                <SeriesLine label="Last 14 days" values={tokens.last14_series} />
              </div>
            ) : (
              <div className="tokens-series-wrap">
                <SeriesLine label="Today" values={[]} />
                <SeriesLine label="Last 7 days" values={[]} />
                <SeriesLine label="Last 14 days" values={[]} />
              </div>
            )}

            <p className="tokens-note">Charts populate once we collect snapshots. (No Zapier needed.)</p>
          </CardContent>
        </Card>

        <Card className="headroom-card">
          <CardHeader>
            <CardTitle>Headroom</CardTitle>
          </CardHeader>
          <CardContent>
            {headroom?.windows?.length ? (
              <div className="headroom-list">
                {headroom.windows.map((w, idx) => (
                  <div key={`${w.label}-${idx}`} className="headroom-row">
                    <div className="headroom-top">
                      <span className="headroom-label">{w.label} window</span>
                      <span className={`headroom-value tone-${w.tone}`}>{w.leftPercent}% left</span>
                    </div>
                    <div className="headroom-track">
                      <div className={`headroom-fill tone-${w.tone}`} style={{ width: `${w.leftPercent}%` }} />
                    </div>
                    <div className="headroom-meta">Reset {formatRelativeTime(w.resetAt)}</div>
                  </div>
                ))}
                <div className="headroom-updated">Provider {headroom.provider} · Updated {formatRelativeTime(headroom.updatedAt)}</div>
              </div>
            ) : (
              <p className="empty-state">No usage windows available yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="workers-card span-2">
          <CardHeader>
            <CardTitle>Workers</CardTitle>
          </CardHeader>
          <CardContent>
            {workers.length ? (
              <div className="workers-list">
                {workers.slice(0, 6).map((worker) => (
                  <div key={worker.id} className={`worker-row ${worker.isMain ? "worker-main" : "worker-sub"} state-${worker.state}`}>
                    <span className="worker-dot" />
                    <div className="worker-avatar-mini">🐙</div>
                    <div className="worker-meta">
                      <div className="worker-top">
                        <span className="worker-name">{worker.name}{worker.isMain ? " (main)" : ""}</span>
                        <span className="worker-state-pill">{worker.state.toUpperCase()}</span>
                        {worker.ageLabel ? <span className="worker-age-pill">{worker.ageLabel}</span> : null}
                        {worker.model ? <span className="worker-model-pill">{worker.model}</span> : null}
                      </div>
                      <div className="worker-role">{worker.role}</div>
                      <div className="worker-task">{worker.task ?? worker.activity ?? "In progress"}</div>
                      <div className="worker-progress-track">
                        <div className="worker-progress-fill" style={{ width: `${Math.max(0, Math.min(100, worker.progress ?? 0))}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
                {workers.length <= 1 ? <p className="empty-state">No subagents active.</p> : null}
              </div>
            ) : (
              <p className="empty-state">No active workers. Assign a task to spawn subagents.</p>
            )}
          </CardContent>
        </Card>

        <Card className="cron-card span-2">
          <CardHeader>
            <CardTitle>Cron Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="empty-state">No cron schedule loaded yet. Jobs will appear here when wired.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function toPresenceState(value?: string): "idle" | "working" | "blocked" | "error" | "offline" {
  const v = (value ?? "").toLowerCase();
  if (v === "idle" || v === "working" || v === "blocked" || v === "error" || v === "offline") return v;
  return "idle";
}

function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Intl.NumberFormat().format(Math.round(value));
}

function SeriesLine({ label, values }: { label: string; values: number[] }) {
  const hasData = values.length > 1;
  const safeValues = hasData ? values : [0, 0, 0, 0, 0, 0];
  const max = Math.max(...safeValues, 1);
  const points = safeValues
    .map((v, i) => {
      const x = (i / Math.max(safeValues.length - 1, 1)) * 100;
      const y = 100 - (v / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="tokens-series-block">
      <div className="tokens-series-label">{label}</div>
      <div className="tokens-series-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="tokens-series-svg">
          <polyline
            fill="none"
            stroke="rgba(104, 193, 255, 0.95)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
        </svg>
      </div>
    </div>
  );
}
