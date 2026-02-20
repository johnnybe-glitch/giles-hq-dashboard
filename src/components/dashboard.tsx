"use client";

import { useEffect, useState } from "react";
import { PresenceOctopus } from "./presence-octopus";
import { Pill } from "./ui/pill";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollableList } from "./ui/scrollable-list";
import { formatRelativeTime } from "@/lib/relative-time";

const REFRESH_MS = 10_000;
const HEADER_CONTEXT = "Gateway status";

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

type CronJob = {
  jobId: string;
  name: string;
  enabled: boolean;
  schedule: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOk: boolean;
  model: string | null;
};

type CronData = {
  enabledCount: number;
  disabledCount: number;
  updatedAt: string | null;
  upcoming: Array<{ name: string; nextRunAt: string | null }>;
  jobs: CronJob[];
};

type AutomationHealthData = {
  launchdJobs: Array<{ label: string; lastExitStatus: number | null; healthy: boolean }>;
  healthyCount: number;
  totalCount: number;
  updatedAt: string | null;
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

type UsageBreakdownRow = {
  label: string;
  tokens: number;
  cost: number;
};

type UsageSessionRow = {
  sessionKey: string;
  tokens: number;
  cost: number;
  channel: string;
  chatType?: string;
};

type UsageDay = {
  date: string;
  totalTokens: number;
  totalCost: number;
  budgetTokens: number | null;
  budgetCost: number | null;
  sevenDayAvgTokens: number;
  sevenDayAvgCost: number;
  byModel: Array<{ model: string; tokens: number; cost: number }>;
  byChannel: Array<{ channel: string; tokens: number; cost: number }>;
  topSessions: UsageSessionRow[];
};

type UsageRollup = {
  generatedAt: string | null;
  dailyBudgetTokens: number | null;
  days: UsageDay[];
};

export function Dashboard() {
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(0);
  const [eventLimit, setEventLimit] = useState<50 | 100>(50);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [chatRows, setChatRows] = useState<ChatRow[]>([]);
  const [eventView, setEventView] = useState<"all" | "chats">("all");
  const [tokens, setTokens] = useState<TokenData | null>(null);
  const [nowNext, setNowNext] = useState<NowNextData | null>(null);
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [headroom, setHeadroom] = useState<HeadroomData | null>(null);
  const [usageRollup, setUsageRollup] = useState<UsageRollup | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [cronData, setCronData] = useState<CronData | null>(null);
  const [automationHealth, setAutomationHealth] = useState<AutomationHealthData | null>(null);
  const [showDisabledCron, setShowDisabledCron] = useState(false);
  const [deletingCronId, setDeletingCronId] = useState<string | null>(null);
  const [cronActionId, setCronActionId] = useState<string | null>(null);
  const [syncHealth, setSyncHealth] = useState<"healthy" | "delayed">("healthy");
  const [usageRefreshing, setUsageRefreshing] = useState(false);
  const [usageRefreshNote, setUsageRefreshNote] = useState<string | null>(null);
  const [stateTestMode, setStateTestMode] = useState(false);
  const [stateTestValue, setStateTestValue] = useState<"idle" | "working" | "blocked" | "error" | "offline">("idle");

  // Workers roster is always visible; no local clearing state.

  useEffect(() => {
    if (!stateTestMode) return;
    const states: Array<"idle" | "working" | "blocked" | "error" | "offline"> = ["idle", "working", "blocked", "error", "offline"];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % states.length;
      setStateTestValue(states[i]);
    }, 1400);
    return () => clearInterval(timer);
  }, [stateTestMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [eventsRes, chatsRes, tokensRes, nowNextRes, workersRes, versionRes, headroomRes, cronRes, automationHealthRes, usageRes] = await Promise.all([
          fetch(`/api/events?limit=100`, { cache: "no-store" }),
          fetch(`/api/chats?limit=100`, { cache: "no-store" }),
          fetch(`/api/tokens`, { cache: "no-store" }),
          fetch(`/api/now-next`, { cache: "no-store" }),
          fetch(`/api/workers`, { cache: "no-store" }),
          fetch(`/api/version`, { cache: "no-store" }),
          fetch(`/api/headroom`, { cache: "no-store" }),
          fetch(`/api/cron`, { cache: "no-store" }),
          fetch(`/api/automation-health`, { cache: "no-store" }),
          fetch(`/api/usage`, { cache: "no-store" }),
        ]);

        const allOk = [eventsRes, chatsRes, tokensRes, nowNextRes, workersRes, versionRes, headroomRes, cronRes, automationHealthRes, usageRes].every((r) => r.ok);
        const eventsData = eventsRes.ok ? ((await eventsRes.json()) as { events?: EventRow[] }) : { events: [] };
        const chatsData = chatsRes.ok ? ((await chatsRes.json()) as { chats?: ChatRow[] }) : { chats: [] };
        const tokenData = tokensRes.ok ? ((await tokensRes.json()) as TokenData) : null;
        const nowNextData = nowNextRes.ok ? ((await nowNextRes.json()) as NowNextData) : null;
        const workersData = workersRes.ok ? ((await workersRes.json()) as { workers?: WorkerData[] }) : { workers: [] };
        const versionData = versionRes.ok ? ((await versionRes.json()) as VersionInfo) : null;
        const headroomData = headroomRes.ok ? ((await headroomRes.json()) as HeadroomData) : null;
        const cron = cronRes.ok ? ((await cronRes.json()) as CronData) : null;
        const automation = automationHealthRes.ok ? ((await automationHealthRes.json()) as AutomationHealthData) : null;
        const usageData = usageRes.ok ? ((await usageRes.json()) as UsageRollup) : null;

        if (!cancelled) {
          setEvents(eventsData.events ?? []);
          setChatRows(chatsData.chats ?? []);
          if (tokenData) setTokens(tokenData);
          if (nowNextData) setNowNext(nowNextData);
          setWorkers(workersData.workers ?? []);
          if (versionData) setVersionInfo(versionData);
          if (headroomData) setHeadroom(headroomData);
          if (usageData) setUsageRollup(usageData);
          if (cron) setCronData(cron);
          if (automation) setAutomationHealth(automation);
          setSyncHealth(allOk ? "healthy" : "delayed");
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
    setUpdateNote(null);
    try {
      const res = await fetch(`/api/version`, { method: "POST" });
      const body = await res.json().catch(() => ({}));

      if (res.ok && body?.ok) {
        setUpdateNote("Update completed. Refreshing version status…");
      } else {
        const detailRaw = body?.stderr || body?.error || "Update failed";
        const detail = String(detailRaw).replace(/\s+/g, " ").slice(0, 180);
        setUpdateNote(`Update failed: ${detail}`);
      }

      const fresh = await fetch(`/api/version`, { cache: "no-store" });
      if (fresh.ok) {
        const next = (await fresh.json()) as VersionInfo;
        setVersionInfo(next);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update request failed";
      setUpdateNote(`Update failed: ${message}`);
    } finally {
      setUpdating(false);
    }
  };

  const syncDashboard = () => {
    window.location.reload();
  };

  const refreshUsageNow = async () => {
    if (usageRefreshing) return;
    setUsageRefreshing(true);
    setUsageRefreshNote(null);
    try {
      const res = await fetch(`/api/usage`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setUsageRollup(body.payload ?? null);
        setUsageRefreshNote("Usage refreshed just now.");
      } else {
        setUsageRefreshNote(`Refresh failed: ${String(body?.error ?? "unknown error")}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "refresh failed";
      setUsageRefreshNote(`Refresh failed: ${message}`);
    } finally {
      setUsageRefreshing(false);
    }
  };

  const runCronAction = async (jobId: string, op: "enable" | "disable" | "run") => {
    if (!jobId || cronActionId) return;
    setCronActionId(jobId);
    try {
      await fetch(`/api/cron?jobId=${encodeURIComponent(jobId)}&op=${op}`, { method: "PATCH" });
      setCronData((prev) => {
        if (!prev) return prev;
        const jobs = prev.jobs.map((j) => (j.jobId === jobId ? { ...j, enabled: op === "enable" ? true : op === "disable" ? false : j.enabled } : j));
        return {
          ...prev,
          jobs,
          enabledCount: jobs.filter((j) => j.enabled).length,
          disabledCount: jobs.filter((j) => !j.enabled).length,
        };
      });
    } finally {
      setCronActionId(null);
    }
  };

  const removeCronJob = async (jobId: string) => {
    if (!jobId || deletingCronId) return;
    setDeletingCronId(jobId);
    try {
      await fetch(`/api/cron?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE" });
      setCronData((prev) => {
        if (!prev) return prev;
        const jobs = prev.jobs.filter((j) => j.jobId !== jobId);
        return {
          ...prev,
          jobs,
          enabledCount: jobs.filter((j) => j.enabled).length,
          disabledCount: jobs.filter((j) => !j.enabled).length,
          upcoming: prev.upcoming.filter((u) => jobs.some((j) => j.name === u.name)),
        };
      });
    } finally {
      setDeletingCronId(null);
    }
  };

  const visibleCronJobs = (cronData?.jobs ?? []).filter((j) => (showDisabledCron ? true : j.enabled));
  const maintenanceCronJobs = visibleCronJobs.filter(isMaintenanceCronJob);
  const operationalCronJobs = visibleCronJobs.filter((j) => !isMaintenanceCronJob(j));

  const usageDays = usageRollup?.days ?? [];
  const latestUsage = usageDays.length ? usageDays[usageDays.length - 1] : null;
  const usageTrend = usageDays.slice(-14);
  const headroomWindow = pickHeadroomWindow(headroom);
  const deltaVsAvg = latestUsage ? latestUsage.totalTokens - latestUsage.sevenDayAvgTokens : null;
  const headroomUsedPercent = headroomWindow?.usedPercent ?? null;
  const headroomLeftPercent = headroomWindow?.leftPercent ?? null;
  const headroomResetLabel = headroomWindow?.resetAt ?? headroom?.updatedAt ?? null;
  const projectedEodTokens =
    tokens?.burn_rate_per_hour && Number.isFinite(tokens.burn_rate_per_hour)
      ? Math.max(0, Math.round(tokens.burn_rate_per_hour * 24))
      : null;
  const usageBand = classifyUsageBand(latestUsage?.totalTokens ?? projectedEodTokens ?? null);
  const topDrivers = latestUsage?.topSessions?.slice(0, 3) ?? [];
  const usageFreshness = classifyFreshness(usageRollup?.generatedAt ?? null);

  return (
    <div className="dashboard-shell">
      <header className="top-bar">
        <div className="top-left">
          <PresenceOctopus botName="Gilbert" state={stateTestMode ? stateTestValue : toPresenceState(nowNext?.status)} />
        </div>
        <div className="top-title">AGENT DASHBOARD</div>
        <div className="top-right">
          <Pill className="pill-flat">
            {HEADER_CONTEXT}: <span className={versionInfo?.current ? "tone-good" : "tone-warn"}>{versionInfo?.current ? "Connected" : "Connecting…"}</span>
          </Pill>
          <Pill className="pill-flat">
            Last refresh: <span className="tone-good">{formatRelativeTime(lastRefreshAt)}</span>
          </Pill>
          <Pill className="pill-flat">
            Data sync <span className={syncHealth === "healthy" ? "tone-good" : "tone-warn"}>{syncHealth === "healthy" ? "healthy" : "delayed"}</span>
          </Pill>
          <Pill className={versionInfo?.updateAvailable ? "pill-update-available" : "pill-update-ok"}>
            {versionInfo?.updateAvailable
              ? `Update available: ${versionInfo.latest}`
              : `OpenClaw ${versionInfo?.current ?? "—"} · Up to date`}
          </Pill>
          {versionInfo?.updateAvailable ? (
            <button className="eventlog-toggle update-cta" onClick={triggerUpdate}>
              {updating ? "Updating…" : "Install update"}
            </button>
          ) : (
            <button className="sync-icon-btn" onClick={syncDashboard} title="Sync: refresh dashboard + check latest version">
              ↻
            </button>
          )}
          {updateNote ? <Pill className="pill-flat">{updateNote}</Pill> : null}
          <button className="eventlog-toggle" onClick={() => setStateTestMode((v) => !v)}>
            {stateTestMode ? "Stop state cycle" : "Cycle states"}
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

            <div className="now-projects-divider" />
            <div className="now-projects-header">Projects</div>
            <div className="now-next-queue">
              <div className="list-item" style={{ padding: "6px 0" }}>
                Project list coming next.
              </div>
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
                onClick={() => setEventLimit(eventLimit === 50 ? 100 : 50)}
              >
                {eventLimit === 50 ? "Show more" : "Show less"}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollableList className={eventLimit === 100 ? "eventlog-max" : "eventlog-expanded"}>
              {eventView === "all" ? (
                events.length === 0 ? (
                  <p className="empty-state">No recent events.</p>
                ) : (
                  events.slice(0, eventLimit).map((event, idx) => (
                    <div key={`${event.ts ?? "no-ts"}-${idx}`} className="list-item eventlog-line eventlog-system-line">
                      • {event.ts ? formatRelativeTime(event.ts) : "—"} · {event.type} {event.message ? ` · ${event.message}` : ""}
                    </div>
                  ))
                )
              ) : chatRows.length === 0 ? (
                <p className="empty-state">No chat history found.</p>
              ) : (
                chatRows.slice(0, eventLimit).map((row, idx) => (
                  <div key={`${row.ts ?? "no-ts"}-${idx}`} className="list-item eventlog-line eventlog-chat-line">
                    • {row.ts ? formatRelativeTime(row.ts) : "—"} · {row.role} · {row.text}
                  </div>
                ))
              )}
            </ScrollableList>
            <p className="eventlog-note">Default uses the larger view (50 rows); expand for 100 rows.</p>
          </CardContent>
        </Card>

        <Card className="tokens-card">
          <CardHeader>
            <CardTitle>Usage & Burn</CardTitle>
            <div className="usage-updated">
              Data generated {formatRelativeTime(usageRollup?.generatedAt ?? null)} · Dashboard polled {formatRelativeTime(lastRefreshAt)}
            </div>
            <div className="usage-updated" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className={usageFreshness.tone === "good" ? "tone-good" : "tone-warn"}>
                {usageFreshness.label}
              </span>
              <button className="eventlog-toggle" onClick={refreshUsageNow} disabled={usageRefreshing}>
                {usageRefreshing ? "Refreshing…" : "Refresh usage now"}
              </button>
              {usageRefreshNote ? <span>{usageRefreshNote}</span> : null}
            </div>
          </CardHeader>
          <CardContent>
            {latestUsage ? (
              <>
                <div className="usage-metrics">
                  <div>
                    <div className="usage-metric-label">Tokens today</div>
                    <div className="usage-metric-value">{formatCompact(latestUsage.totalTokens)} tokens</div>
                    {deltaVsAvg !== null ? (
                      <div className={`usage-metric-delta ${deltaVsAvg >= 0 ? "delta-up" : "delta-down"}`}>
                        {deltaVsAvg >= 0 ? "+" : ""}
                        {formatCompact(Math.abs(deltaVsAvg))} vs 7d avg
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="usage-metric-label">Burn rate now</div>
                    <div className="usage-metric-value">
                      {tokens?.burn_rate_per_hour ? `${formatCompact(tokens.burn_rate_per_hour)} / hr` : "—"}
                    </div>
                    <div className="usage-metric-delta">
                      {projectedEodTokens ? `proj. EOD ${formatCompact(projectedEodTokens)} tokens` : "Projection unavailable"}
                    </div>
                  </div>
                  <div>
                    <div className="usage-metric-label">Usage mode</div>
                    <div className="usage-metric-value">{usageBand.label}</div>
                    <div className="usage-metric-delta">{usageBand.detail}</div>
                  </div>
                  <div>
                    <div className="usage-metric-label">Headroom (Codex)</div>
                    <div className="usage-metric-value">
                      {headroomUsedPercent !== null ? `${headroomUsedPercent}% used` : "—"}
                    </div>
                    <div className="usage-metric-delta">
                      {headroomLeftPercent !== null ? `${headroomLeftPercent}% left` : ""}
                      {headroomResetLabel ? ` · resets ${formatResetTime(headroomResetLabel)}` : ""}
                    </div>
                  </div>
                </div>

                <UsageTrendChart rows={usageTrend} headroomWindow={headroomWindow} />

                <div className="usage-breakdowns">
                  <BreakdownList
                    title="Top token drivers today"
                    rows={topDrivers.map((row) => ({
                      label: row.sessionKey.replace(/^agent:/, ""),
                      tokens: row.tokens,
                      cost: row.cost,
                    }))}
                  />
                  <BreakdownList
                    title="Channels"
                    rows={latestUsage.byChannel.map((row) => ({
                      label: row.channel,
                      tokens: row.tokens,
                      cost: row.cost,
                    }))}
                  />
                </div>

                <TopSessionsTable sessions={latestUsage.topSessions} />
              </>
            ) : (
              <>
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
                <div className="tokens-series-wrap">
                  <SeriesLine label="Hourly" values={tokens?.today_series ?? []} />
                  <SeriesLine label="Daily" values={tokens?.today_series ?? []} />
                  <SeriesLine label="Last 7 days" values={tokens?.last7_series ?? []} />
                </div>
                <p className="tokens-note">Charts populate once we collect snapshots. (No Zapier needed.)</p>
              </>
            )}
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
                      <span className="headroom-label">{w.label}</span>
                      <span className={`headroom-value tone-${w.tone}`}>{w.leftPercent}% left</span>
                    </div>
                    <div className="headroom-track">
                      <div className={`headroom-fill tone-${w.tone}`} style={{ width: `${w.leftPercent}%` }} />
                    </div>
                    <div className="headroom-meta">Resets {formatResetTime(w.resetAt)}</div>
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
            <div className="workers-list workers-roster">
              {workers.slice(0, 4).map((worker) => (
                <div key={worker.id} className={`worker-row worker-roster-row ${worker.isMain ? "worker-main" : "worker-sub"} state-${worker.state}`}>
                  <div className="worker-avatar-live">
                    <PresenceOctopus botName={worker.name} state={toPresenceState(worker.state)} compact />
                  </div>
                  <div className="worker-meta">
                    <div className="worker-top">
                      <span className="worker-name">{worker.name}</span>
                      <span className="worker-state-pill">{worker.state.toUpperCase()}</span>
                    </div>
                    <div className="worker-role">{worker.role}</div>
                    <div className="worker-submeta">
                      <span>last seen: {formatRelativeTime(worker.last_seen_at ?? null)}</span>
                      {worker.model ? <span> · model: {worker.model}</span> : null}
                    </div>
                    <div className="worker-task" title={worker.focus ?? "No active task"}>{worker.focus ?? "No active task"}</div>
                    <div className="worker-submeta">
                      {worker.last_command ? <span>last command: {worker.last_command}</span> : <span>last command: —</span>}
                      <span> · duration: {typeof worker.duration_seconds === "number" ? `${worker.duration_seconds}s` : "—"}</span>
                    </div>
                    <div className="worker-submeta">
                      <span>runs: {typeof worker.run_count === "number" ? worker.run_count : 0}</span>
                      <span> · last run: {formatRelativeTime(worker.last_run_at ?? null)}</span>
                      {worker.last_run_status ? <span> · result: {worker.last_run_status.toUpperCase()}</span> : null}
                    </div>
                    {(worker.state === "error" || worker.state === "blocked") && worker.last_error ? (
                      <div className="worker-error-line" title={worker.last_error}>{worker.last_error}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="cron-card span-2">
          <CardHeader>
            <CardTitle>Automations (Cron)</CardTitle>
            <label className="cron-toggle-label">
              <input type="checkbox" checked={showDisabledCron} onChange={(e) => setShowDisabledCron(e.target.checked)} /> Show disabled
            </label>
          </CardHeader>
          <CardContent>
            <div className="cron-summary">
              <div><strong>{cronData?.enabledCount ?? 0}</strong><span>Enabled</span></div>
              <div><strong>{cronData?.disabledCount ?? 0}</strong><span>Disabled</span></div>
              <div><strong>{formatRelativeTime(cronData?.updatedAt ?? null)}</strong><span>Last refresh</span></div>
            </div>

            <div className="automation-health">
              <div className="automation-health-title">Maintenance runtime health</div>
              {(automationHealth?.launchdJobs ?? []).length ? (
                <div className="automation-health-list">
                  {(automationHealth?.launchdJobs ?? []).map((j) => (
                    <div className="automation-health-row" key={j.label}>
                      <span className={`automation-health-dot ${j.healthy ? "ok" : "fail"}`} />
                      <span className="automation-health-label">{j.label.replace("com.giles.", "")}</span>
                      <span className={`automation-health-state ${j.healthy ? "ok" : "fail"}`}>{j.healthy ? "OK" : `EXIT ${j.lastExitStatus ?? "?"}`}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">No maintenance runtime jobs detected.</div>
              )}
            </div>

            <div className="cron-upcoming">
              <div className="cron-upcoming-title">Upcoming (next 5)</div>
              {(cronData?.upcoming ?? []).length ? (
                (cronData?.upcoming ?? []).map((u, idx) => (
                  <div className="cron-upcoming-row" key={`${u.name}-${idx}`}>• {formatCronTime(u.nextRunAt)} · {u.name}</div>
                ))
              ) : (
                <div className="empty-state">No upcoming jobs.</div>
              )}
            </div>

            <div className="cron-jobs">
              {maintenanceCronJobs.length ? (
                <CronSection
                  title="Maintenance automations"
                  jobs={maintenanceCronJobs}
                  cronActionId={cronActionId}
                  deletingCronId={deletingCronId}
                  onRun={runCronAction}
                  onRemove={removeCronJob}
                />
              ) : null}
              {operationalCronJobs.length ? (
                <CronSection
                  title="Operational automations"
                  jobs={operationalCronJobs}
                  cronActionId={cronActionId}
                  deletingCronId={deletingCronId}
                  onRun={runCronAction}
                  onRemove={removeCronJob}
                />
              ) : (
                <div className="empty-state">No cron automations configured.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function isMaintenanceCronJob(job: CronJob): boolean {
  const text = `${job.name} ${job.model ?? ""}`.toLowerCase();
  return (
    text.includes("backup") ||
    text.includes("safety tag") ||
    text.includes("snapshot") ||
    text.includes("maintenance")
  );
}

function CronSection({
  title,
  jobs,
  cronActionId,
  deletingCronId,
  onRun,
  onRemove,
}: {
  title: string;
  jobs: CronJob[];
  cronActionId: string | null;
  deletingCronId: string | null;
  onRun: (jobId: string, op: "enable" | "disable" | "run") => void;
  onRemove: (jobId: string) => void;
}) {
  return (
    <div className="cron-section">
      <div className="cron-section-title">{title}</div>
      {jobs.length ? (
        jobs.map((job) => (
          <div className="cron-job" key={job.jobId}>
            <div className="cron-job-top">
              <div>
                <div className="cron-job-name">{job.name}</div>
                {job.model ? <div className="cron-job-model">Model: {job.model}</div> : null}
              </div>
              <div className="cron-job-badges">
                <span className={`cron-badge ${job.lastOk ? "ok" : "fail"}`}>{job.lastOk ? "LAST OK" : "LAST FAIL"}</span>
                <span className={`cron-badge ${job.enabled ? "enabled" : "disabled"}`}>{job.enabled ? "ENABLED" : "DISABLED"}</span>
                <button className="cron-run-btn" onClick={() => onRun(job.jobId, "run")} disabled={cronActionId === job.jobId}>Run now</button>
                <button className="cron-toggle-btn" onClick={() => onRun(job.jobId, job.enabled ? "disable" : "enable")} disabled={cronActionId === job.jobId}>
                  {job.enabled ? "Disable" : "Enable"}
                </button>
                <button className="cron-remove-btn" onClick={() => onRemove(job.jobId)} disabled={deletingCronId === job.jobId}>
                  {deletingCronId === job.jobId ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
            <div className="cron-job-meta">Schedule: {formatCronSchedule(job.schedule)} · Next: {formatCronTime(job.nextRunAt)} · Last: {formatCronTime(job.lastRunAt)}</div>
          </div>
        ))
      ) : (
        <div className="empty-state">No jobs in this section.</div>
      )}
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

function formatCronTime(value?: string | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return "—";

  const now = new Date();
  const target = new Date(ts);
  const time = target.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const dayDiff = Math.round((startOfTarget - startOfToday) / 86400000);

  const deltaMs = ts - now.getTime();
  const absMin = Math.round(Math.abs(deltaMs) / 60000);
  const rel =
    absMin < 1
      ? "now"
      : absMin < 60
        ? `${absMin}m`
        : `${Math.round(absMin / 60)}h`;

  const dayLabel = dayDiff === 0 ? "Today" : dayDiff === 1 ? "Tomorrow" : dayDiff === -1 ? "Yesterday" : target.toLocaleDateString();
  const relLabel = deltaMs >= 0 ? `in ${rel}` : `${rel} ago`;

  return `${dayLabel} ${time} (${relLabel})`;
}

function formatCronSchedule(schedule: string): string {
  if (!schedule) return "Schedule unavailable";
  if (schedule.startsWith("at ")) {
    return formatCronTime(schedule.slice(3));
  }
  return schedule;
}

function formatResetTime(value?: string | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return "—";

  const now = Date.now();
  const deltaMs = ts - now;
  const absMin = Math.max(1, Math.round(Math.abs(deltaMs) / 60000));
  const rel = absMin < 60 ? `${absMin}m` : `${Math.round(absMin / 60)}h`;
  const relLabel = deltaMs >= 0 ? `in ${rel}` : `${rel} ago`;
  const local = new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${local} (${relLabel})`;
}

function SubagentFishAvatar() {
  return (
    <div className="subagent-fish-wrap">
      <svg viewBox="0 0 120 120" width="58" height="58" aria-hidden="true" className="subagent-fish-svg">
        <ellipse cx="64" cy="62" rx="36" ry="26" fill="#ef4f83" />
        <ellipse cx="78" cy="62" rx="18" ry="23" fill="#f06292" />
        <polygon points="24,62 6,46 6,78" fill="#ef4f83" className="subagent-fish-tail" />
        <polygon points="62,30 74,16 78,32" fill="#ef4f83" />
        <polygon points="60,93 72,90 68,104" fill="#ef4f83" />
        <circle cx="80" cy="58" r="11" fill="#f8fafc" />
        <circle cx="82" cy="58" r="6" fill="#334155" />
        <circle cx="84" cy="56" r="2" fill="#ffffff" />
        <circle cx="56" cy="50" r="3" fill="#f48fb1" />
        <circle cx="68" cy="76" r="3" fill="#f48fb1" />
        <path d="M84 72 Q88 76 92 72" stroke="#f8bbd0" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <span className="subagent-bubble b1" />
      <span className="subagent-bubble b2" />
      <span className="subagent-bubble b3" />
    </div>
  );
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

function UsageTrendChart({ rows, headroomWindow }: { rows: UsageDay[]; headroomWindow?: HeadroomData["windows"][number] | null }) {
  if (!rows.length) {
    return <div className="empty-state">Usage data will appear after the first snapshot.</div>;
  }

  if (rows.length <= 1) {
    const today = rows[0];
    const percent = headroomWindow?.usedPercent ?? null;

    return (
      <div className="usage-trend usage-trend-empty">
        <div className="usage-trend-empty-text">
          Need at least two days of history for the line chart. Today: {formatCompact(today?.totalTokens ?? 0)} tokens.
        </div>
        {percent !== null ? (
          <>
            <div className="usage-progress">
              <div className="usage-progress-fill" style={{ width: `${Math.max(2, Math.min(percent, 100))}%` }} />
            </div>
            <div className="usage-progress-meta">
              {`${percent.toFixed(1)}% of Codex headroom used · resets ${formatResetTime(headroomWindow?.resetAt)}`}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const totals = rows.map((r) => r.totalTokens);
  const avgs = rows.map((r) => r.sevenDayAvgTokens);
  const maxValue = Math.max(...totals, ...avgs, 1);

  const toPoints = (values: Array<number | null>) =>
    values
      .map((value, index) => {
        const safeValue = typeof value === "number" && value >= 0 ? value : null;
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = safeValue === null ? null : 100 - (safeValue / maxValue) * 100;
        return y === null ? null : `${x},${y}`;
      })
      .filter(Boolean)
      .join(" ");

  const totalPoints = toPoints(totals);
  const avgPoints = toPoints(avgs);

  return (
    <div className="usage-trend">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="usage-trend-svg">
        <polyline className="usage-line usage-line-avg" points={avgPoints} />
        <polyline className="usage-line usage-line-total" points={totalPoints} />
      </svg>
      <div className="usage-trend-footer">
        <span>{rows[0]?.date}</span>
        <span>{rows[rows.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function BreakdownList({ title, rows }: { title: string; rows: UsageBreakdownRow[] }) {
  if (!rows.length) {
    return (
      <div className="breakdown-list">
        <div className="breakdown-title">{title}</div>
        <div className="empty-state">No data yet.</div>
      </div>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.tokens, 0);
  return (
    <div className="breakdown-list">
      <div className="breakdown-title">{title}</div>
      {rows.slice(0, 4).map((row) => (
        <div className="breakdown-row" key={row.label}>
          <div className="breakdown-meta">
            <div className="breakdown-label">{row.label}</div>
            <div className="breakdown-subtext">{formatCurrency(row.cost)}</div>
          </div>
          <div className="breakdown-bar">
            <div className="breakdown-bar-fill" style={{ width: `${total ? (row.tokens / total) * 100 : 0}%` }} />
          </div>
          <div className="breakdown-value">{formatCompact(row.tokens)}</div>
        </div>
      ))}
    </div>
  );
}

function TopSessionsTable({ sessions }: { sessions: UsageSessionRow[] }) {
  if (!sessions.length) {
    return <div className="empty-state">No session breakdown yet.</div>;
  }

  return (
    <div className="sessions-table">
      <div className="sessions-title">Top sessions today</div>
      <div className="sessions-rows">
        {sessions.map((session) => (
          <div className="session-row" key={session.sessionKey}>
            <div className="session-meta-block">
              <div className="session-id">{session.sessionKey.replace(/^agent:/, "")}</div>
              <div className="session-meta-text">{session.channel} · {session.chatType ?? "direct"}</div>
            </div>
            <div className="session-tokens">{formatCompact(session.tokens)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pickHeadroomWindow(headroom?: HeadroomData | null) {
  const windows = headroom?.windows ?? [];
  if (!windows.length) return null;
  const dayWindow = windows.find((w) => /day/i.test(w.label));
  if (dayWindow) return dayWindow;
  return windows[windows.length - 1];
}

function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const digits = value >= 1 ? 2 : 4;
  return `$${value.toFixed(digits)}`;
}

function classifyUsageBand(tokens: number | null): { label: string; detail: string } {
  if (!tokens || Number.isNaN(tokens)) return { label: "No data", detail: "Need one run to classify usage" };
  if (tokens < 30000) return { label: "NORMAL", detail: "Light day (<30k tokens)" };
  if (tokens <= 80000) return { label: "BUSY", detail: "Moderate day (30k–80k tokens)" };
  return { label: "HEAVY", detail: "High-usage day (>80k tokens)" };
}

function classifyFreshness(ts: string | null): { label: string; tone: "good" | "warn" } {
  if (!ts) return { label: "Stale (>60m)", tone: "warn" };
  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return { label: "Stale (>60m)", tone: "warn" };
  const ageMin = (Date.now() - parsed) / 60000;
  if (ageMin < 15) return { label: "Fresh (<15m)", tone: "good" };
  if (ageMin < 60) return { label: "Aging (15–60m)", tone: "warn" };
  return { label: "Stale (>60m)", tone: "warn" };
}
