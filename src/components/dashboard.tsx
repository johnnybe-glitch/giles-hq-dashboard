"use client";

import { useEffect, useState } from "react";
import { PresenceOctopus } from "./presence-octopus";
import { Pill } from "./ui/pill";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollableList } from "./ui/scrollable-list";
import { formatRelativeTime } from "@/lib/relative-time";

const REFRESH_MS = 30_000;
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
  const [eventLimit, setEventLimit] = useState<50 | 100>(50);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [chatRows, setChatRows] = useState<ChatRow[]>([]);
  const [eventView, setEventView] = useState<"all" | "chats">("all");
  const [tokens, setTokens] = useState<TokenData | null>(null);
  const [nowNext, setNowNext] = useState<NowNextData | null>(null);
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [headroom, setHeadroom] = useState<HeadroomData | null>(null);
  const [updating, setUpdating] = useState(false);
  const [cronData, setCronData] = useState<CronData | null>(null);
  const [showDisabledCron, setShowDisabledCron] = useState(false);
  const [deletingCronId, setDeletingCronId] = useState<string | null>(null);
  const [cronActionId, setCronActionId] = useState<string | null>(null);
  const [syncHealth, setSyncHealth] = useState<"healthy" | "delayed">("healthy");
  const [clearedWorkerIds, setClearedWorkerIds] = useState<string[]>([]);
  const [stateTestMode, setStateTestMode] = useState(false);
  const [stateTestValue, setStateTestValue] = useState<"idle" | "working" | "blocked" | "error" | "offline">("idle");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("giles-cleared-workers");
      if (raw) setClearedWorkerIds(JSON.parse(raw));
    } catch {}
  }, []);

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
        const [eventsRes, chatsRes, tokensRes, nowNextRes, workersRes, versionRes, headroomRes, cronRes] = await Promise.all([
          fetch(`/api/events?limit=100`, { cache: "no-store" }),
          fetch(`/api/chats?limit=100`, { cache: "no-store" }),
          fetch(`/api/tokens`, { cache: "no-store" }),
          fetch(`/api/now-next`, { cache: "no-store" }),
          fetch(`/api/workers`, { cache: "no-store" }),
          fetch(`/api/version`, { cache: "no-store" }),
          fetch(`/api/headroom`, { cache: "no-store" }),
          fetch(`/api/cron`, { cache: "no-store" }),
        ]);

        const allOk = [eventsRes, chatsRes, tokensRes, nowNextRes, workersRes, versionRes, headroomRes, cronRes].every((r) => r.ok);
        const eventsData = eventsRes.ok ? ((await eventsRes.json()) as { events?: EventRow[] }) : { events: [] };
        const chatsData = chatsRes.ok ? ((await chatsRes.json()) as { chats?: ChatRow[] }) : { chats: [] };
        const tokenData = tokensRes.ok ? ((await tokensRes.json()) as TokenData) : null;
        const nowNextData = nowNextRes.ok ? ((await nowNextRes.json()) as NowNextData) : null;
        const workersData = workersRes.ok ? ((await workersRes.json()) as { workers?: WorkerData[] }) : { workers: [] };
        const versionData = versionRes.ok ? ((await versionRes.json()) as VersionInfo) : null;
        const headroomData = headroomRes.ok ? ((await headroomRes.json()) as HeadroomData) : null;
        const cron = cronRes.ok ? ((await cronRes.json()) as CronData) : null;

        if (!cancelled) {
          setEvents(eventsData.events ?? []);
          setChatRows(chatsData.chats ?? []);
          if (tokenData) setTokens(tokenData);
          if (nowNextData) setNowNext(nowNextData);
          setWorkers(workersData.workers ?? []);
          if (versionData) setVersionInfo(versionData);
          if (headroomData) setHeadroom(headroomData);
          if (cron) setCronData(cron);
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
    try {
      await fetch(`/api/version`, { method: "POST" });
    } finally {
      setUpdating(false);
    }
  };

  const syncDashboard = () => {
    window.location.reload();
  };

  const clearCompletedWorker = (workerId: string) => {
    setClearedWorkerIds((prev) => {
      const next = Array.from(new Set([...prev, workerId]));
      try {
        localStorage.setItem("giles-cleared-workers", JSON.stringify(next));
      } catch {}
      return next;
    });
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

  return (
    <div className="dashboard-shell">
      <header className="top-bar">
        <div className="top-left">
          <PresenceOctopus botName="Giles" state={stateTestMode ? stateTestValue : toPresenceState(nowNext?.status)} />
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
            <ScrollableList className={eventLimit === 100 ? "eventlog-expanded" : "eventlog-collapsed"}>
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
            <p className="eventlog-note">Default shows 50 rows; expand for 100.</p>
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

            {tokens && (tokens.today_series.length || tokens.last7_series.length) ? (
              <div className="tokens-series-wrap">
                <SeriesLine label="Hourly" values={tokens.today_series} />
                <SeriesLine label="Daily" values={tokens.today_series} />
                <SeriesLine label="Last 7 days" values={tokens.last7_series} />
              </div>
            ) : (
              <div className="tokens-series-wrap">
                <SeriesLine label="Hourly" values={[]} />
                <SeriesLine label="Daily" values={[]} />
                <SeriesLine label="Last 7 days" values={[]} />
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
            {workers.length ? (
              <div className="workers-list">
                {workers
                  .filter((worker) => !clearedWorkerIds.includes(worker.id))
                  .slice(0, 6)
                  .map((worker) => (
                  <div key={worker.id} className={`worker-row ${worker.isMain ? "worker-main" : "worker-sub"} state-${worker.state}`}>
                    {worker.isMain ? (
                      <div className="worker-avatar-live">
                        <PresenceOctopus botName="Giles" state={toPresenceState(worker.state)} compact />
                      </div>
                    ) : (
                      <div className={`worker-avatar-mini worker-avatar-subagent state-${worker.state}`}>
                        <SubagentFishAvatar />
                      </div>
                    )}
                    <div className="worker-meta">
                      {!worker.isMain ? (
                        <div className="worker-top">
                          <span className="worker-name">{worker.name}</span>
                          <span className="worker-state-pill">{worker.state.toUpperCase()}</span>
                          {worker.ageLabel ? <span className="worker-age-pill">{worker.ageLabel}</span> : null}
                          {worker.model ? <span className="worker-model-pill">{worker.model}</span> : null}
                          <button
                            className="worker-clear-btn"
                            onClick={() => clearCompletedWorker(worker.id)}
                            disabled={Math.max(0, Math.min(100, worker.progress ?? 0)) < 100}
                            title={Math.max(0, Math.min(100, worker.progress ?? 0)) >= 100 ? "Clear completed task" : "Available when completed"}
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <div className="worker-top">
                          <span className="worker-state-pill">{worker.state.toUpperCase()}</span>
                          {worker.ageLabel ? <span className="worker-age-pill">{worker.ageLabel}</span> : null}
                          {worker.model ? <span className="worker-model-pill">{worker.model}</span> : null}
                        </div>
                      )}
                      {!worker.isMain ? <div className="worker-role">{worker.role}</div> : null}
                      <div className="worker-task">{worker.task ?? worker.activity ?? "In progress"}</div>
                      <div className="worker-progress-track">
                        <div className={`worker-progress-fill ${Math.max(0, Math.min(100, worker.progress ?? 0)) >= 100 ? "worker-progress-complete" : ""}`} style={{ width: `${Math.max(0, Math.min(100, worker.progress ?? 0))}%` }} />
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
              <CronSection
                title="Maintenance automations"
                jobs={maintenanceCronJobs}
                cronActionId={cronActionId}
                deletingCronId={deletingCronId}
                onRun={runCronAction}
                onRemove={removeCronJob}
              />
              <CronSection
                title="Operational automations"
                jobs={operationalCronJobs}
                cronActionId={cronActionId}
                deletingCronId={deletingCronId}
                onRun={runCronAction}
                onRemove={removeCronJob}
              />
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
