#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");

const DAILY_BUDGET_TOKENS = Number(process.env.DAILY_BUDGET_TOKENS || 80000);
const OUTPUT_PATH = path.join(__dirname, "..", "src", "data", "usage-rollup.json");
const SESSIONS_ROOT = path.join(process.env.HOME || ".", ".openclaw", "agents", "main", "sessions");
const SESSIONS_INDEX = path.join(SESSIONS_ROOT, "sessions.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`[usage-rollup] Failed to read ${file}:`, err.message);
    return null;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toDateKey(iso) {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const date = new Date(ts);
  return date.toISOString().slice(0, 10);
}

function addToMap(map, key, tokens, cost) {
  if (!key) key = "unknown";
  if (!map[key]) map[key] = { tokens: 0, cost: 0 };
  map[key].tokens += tokens;
  map[key].cost += cost;
}

function normalizeJobName(sessionKey, label) {
  if (label && typeof label === "string") return label.replace(/^Cron:\s*/i, "").trim();
  if (!sessionKey) return "unknown";
  if (sessionKey.includes(":cron:")) {
    const m = sessionKey.match(/:cron:([^:]+)/);
    return m ? `cron:${m[1]}` : "cron";
  }
  if (sessionKey.includes(":subagent:")) return "subagent";
  if (sessionKey.endsWith(":main")) return "main";
  return sessionKey.replace(/^agent:/, "");
}

function buildBucketSeries(entries, now, windowMs, bucketMs) {
  const end = Math.floor(now / bucketMs) * bucketMs;
  const start = end - windowMs + bucketMs;
  const count = Math.floor(windowMs / bucketMs);
  const buckets = new Array(count).fill(0);

  for (const e of entries) {
    if (e.ts < start || e.ts > end) continue;
    const idx = Math.floor((e.ts - start) / bucketMs);
    if (idx >= 0 && idx < count) buckets[idx] += e.tokens;
  }

  return buckets.map((tokens, i) => ({
    ts: new Date(start + i * bucketMs).toISOString(),
    tokens,
  }));
}

function defaultDailyEntry(date) {
  return {
    date,
    totalTokens: 0,
    totalCost: 0,
    budgetTokens: DAILY_BUDGET_TOKENS,
    budgetCost: null,
    byModel: {},
    byChannel: {},
    sessions: {},
    byJob: {},
    sevenDayAvgTokens: 0,
    sevenDayAvgCost: 0,
  };
}

function parseUsageFromSession(sessionPath) {
  const lines = fs.readFileSync(sessionPath, "utf8").split(/\r?\n/).filter(Boolean);
  const results = [];

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record?.type !== "message") continue;
    const usage = record?.message?.usage;
    if (!usage) continue;

    const timestamp = record.timestamp || record.message?.timestamp || null;
    const ts = Date.parse(timestamp || "");
    const dateKey = toDateKey(timestamp);
    if (!dateKey || Number.isNaN(ts)) continue;

    const totalTokens = Number(usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0));
    const totalCost = Number(usage.cost?.total ?? 0);
    if (!Number.isFinite(totalTokens) || totalTokens <= 0) continue;

    const model = record.message?.model || record.message?.provider || "unknown";
    const result = {
      dateKey,
      ts,
      tokens: totalTokens,
      cost: Number.isFinite(totalCost) ? totalCost : 0,
      model,
    };
    results.push(result);
  }

  return results;
}

function buildRollup() {
  const sessionsIndex = readJson(SESSIONS_INDEX);
  if (!sessionsIndex) {
    throw new Error("sessions.json not found or unreadable");
  }

  const fileMetaLookup = new Map();
  for (const [key, meta] of Object.entries(sessionsIndex)) {
    const sessionFile = meta.sessionFile ? path.resolve(meta.sessionFile) : null;
    if (!sessionFile || !fs.existsSync(sessionFile)) continue;
    fileMetaLookup.set(sessionFile, {
      key,
      channel: meta.lastChannel || meta.deliveryContext?.channel || meta.origin?.provider || "unknown",
      chatType: meta.chatType || "direct",
      label: meta.label || null,
    });
  }

  const daily = new Map();
  const allEntries = [];

  for (const [sessionFile, info] of fileMetaLookup.entries()) {
    const usageEntries = parseUsageFromSession(sessionFile);
    for (const entry of usageEntries) {
      allEntries.push(entry);
      if (!daily.has(entry.dateKey)) {
        daily.set(entry.dateKey, defaultDailyEntry(entry.dateKey));
      }
      const day = daily.get(entry.dateKey);
      day.totalTokens += entry.tokens;
      day.totalCost += entry.cost;

      addToMap(day.byModel, entry.model, entry.tokens, entry.cost);
      addToMap(day.byChannel, info.channel, entry.tokens, entry.cost);

      if (!day.sessions[info.key]) {
        day.sessions[info.key] = {
          sessionKey: info.key,
          tokens: 0,
          cost: 0,
          channel: info.channel,
          chatType: info.chatType,
        };
      }
      day.sessions[info.key].tokens += entry.tokens;
      day.sessions[info.key].cost += entry.cost;

      const jobName = normalizeJobName(info.key, info.label);
      if (!day.byJob[jobName]) {
        day.byJob[jobName] = { job: jobName, tokens: 0, cost: 0, runs: 0 };
      }
      day.byJob[jobName].tokens += entry.tokens;
      day.byJob[jobName].cost += entry.cost;
      day.byJob[jobName].runs += 1;
    }
  }

  const sortedDates = Array.from(daily.keys()).sort();
  const finalDays = [];
  const tokenWindow = [];
  const costWindow = [];

  for (const dateKey of sortedDates) {
    const day = daily.get(dateKey);
    tokenWindow.push(day.totalTokens);
    costWindow.push(day.totalCost);
    if (tokenWindow.length > 7) tokenWindow.shift();
    if (costWindow.length > 7) costWindow.shift();

    day.sevenDayAvgTokens = tokenWindow.reduce((sum, val) => sum + val, 0) / tokenWindow.length;
    day.sevenDayAvgCost = costWindow.reduce((sum, val) => sum + val, 0) / costWindow.length;
    day.budgetCost = day.budgetTokens && day.totalTokens
      ? (day.totalCost / day.totalTokens) * day.budgetTokens
      : null;

    const byModelArr = Object.entries(day.byModel)
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.tokens - a.tokens);
    const byChannelArr = Object.entries(day.byChannel)
      .map(([channel, stats]) => ({ channel, ...stats }))
      .sort((a, b) => b.tokens - a.tokens);
    const topSessions = Object.values(day.sessions)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);
    const byJobArr = Object.values(day.byJob)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10)
      .map((row) => ({
        ...row,
        avgPerRun: row.runs > 0 ? row.tokens / row.runs : row.tokens,
      }));

    finalDays.push({
      date: dateKey,
      totalTokens: day.totalTokens,
      totalCost: Number(day.totalCost.toFixed(6)),
      budgetTokens: day.budgetTokens,
      budgetCost: day.budgetCost !== null ? Number(day.budgetCost.toFixed(6)) : null,
      sevenDayAvgTokens: Number(day.sevenDayAvgTokens.toFixed(2)),
      sevenDayAvgCost: Number(day.sevenDayAvgCost.toFixed(6)),
      byModel: byModelArr,
      byChannel: byChannelArr,
      byJob: byJobArr,
      topSessions,
    });
  }

  ensureDir(OUTPUT_PATH);
  const now = Date.now();
  const payload = {
    generatedAt: new Date().toISOString(),
    dailyBudgetTokens: DAILY_BUDGET_TOKENS,
    intraday: {
      minute60: buildBucketSeries(allEntries, now, 60 * 60 * 1000, 60 * 1000),
      quarter24h: buildBucketSeries(allEntries, now, 24 * 60 * 60 * 1000, 15 * 60 * 1000),
    },
    days: finalDays,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[usage-rollup] Wrote ${finalDays.length} day(s) to ${OUTPUT_PATH}`);
}

buildRollup();
