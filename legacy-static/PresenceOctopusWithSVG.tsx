"use client";

import * as React from "react";

export type PresenceState = "idle" | "working" | "blocked" | "error" | "offline";

type Props = {
    botName?: string;
    state: PresenceState;
    statusText?: string; // short status text beside pill (e.g. "Working", "No recent heartbeat")
    lastErrorSnippet?: string; // only used/visible in error state
    className?: string;
};

const STATE_META: Record<PresenceState,
    {
        label: string;
        glow: string;
        pillBg: string;
        pillBorder: string;
        pillText: string;
        animClass: string;
        desaturate?: boolean;
    }
> = {
    idle: { label: "IDLE", glow: "rgba(34, 197, 94, 0.55)", pillBg: "rgba(34, 197, 94, 0.10)", pillBorder: "rgba(34, 197, 94, 0.35)", pillText: "rgba(187, 247, 208, 0.95)", animClass: "octo-breathe", },
    working: { label: "WORKING", glow: "rgba(168, 85, 247, 0.60)", pillBg: "rgba(168, 85, 247, 0.12)", pillBorder: "rgba(168, 85, 247, 0.40)", pillText: "rgba(233, 213, 255, 0.95)", animClass: "octo-bob", },
    blocked: { label: "BLOCKED", glow: "rgba(245, 158, 11, 0.55)", pillBg: "rgba(245, 158, 11, 0.12)", pillBorder: "rgba(245, 158, 11, 0.40)", pillText: "rgba(254, 243, 199, 0.95)", animClass: "octo-blink", },
    error: { label: "ERROR", glow: "rgba(239, 68, 68, 0.65)", pillBg: "rgba(239, 68, 68, 0.12)", pillBorder: "rgba(239, 68, 68, 0.45)", pillText: "rgba(254, 202, 202, 0.95)", animClass: "octo-shake-once", },
    offline: { label: "OFFLINE", glow: "rgba(148, 163, 184, 0.35)", pillBg: "rgba(148, 163, 184, 0.10)", pillBorder: "rgba(148, 163, 184, 0.25)", pillText: "rgba(226, 232, 240, 0.85)", animClass: "", desaturate: true, },
};

export default function PresenceOctopus({ botName = "Giles", state, statusText, lastErrorSnippet, className, }: Props) {
    const meta = STATE_META[state];

    return (
        <div className={["presence-wrap", className].filter(Boolean).join(" ")}> 
            <div className={["presence-avatar", meta.animClass, meta.desaturate ? "octo-offline" : "",]
                .filter(Boolean)
                .join(" ")}
                style={{
                    ["--octo-glow" as any]: meta.glow,
                } as React.CSSProperties}
                aria-label={${botName} presence ${state}}>
                <div className="presence-glow" />
                <OctopusSVG />
                {state === "working" && <Bubbles />}
            </div>
            <div className="presence-meta">
                <div className="presence-top">
                    <div className="presence-name">{botName}</div>
                    <div className="presence-pill" style={{
                        background: meta.pillBg,
                        borderColor: meta.pillBorder,
                        color: meta.pillText,
                    }}>
                        {meta.label}
                    </div>
                    {statusText ? (
                        <div className="presence-statusText">{statusText}</div>
                    ) : null}
                </div>
                {state === "error" && lastErrorSnippet ? (
                    <div className="presence-errorSnippet" title={lastErrorSnippet}> 
                        {lastErrorSnippet}
                    </div>
                ) : null}
            </div>
            <style jsx>{` 
                .presence-wrap {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  min-width: 260px;
                }
                .presence-avatar {
                  position: relative;
                  width: 56px;
                  height: 56px;
                  border-radius: 14px;
                  border: 1px solid rgba(255, 255, 255, 0.10);
                  background: rgba(255, 255, 255, 0.03);
                  display: grid;
                  place-items: center;
                  overflow: hidden;
                }
                .presence-glow {
                  position: absolute;
                  inset: -28px;
                  background: radial-gradient(circle at 40% 35%, var(--octo-glow), transparent 60%);
                  filter: blur(18px);
                  opacity: 0.9;
                  transition: background 260ms ease, opacity 260ms ease;
                  pointer-events: none;
                }
                .presence-meta {
                  display: flex;
                  flex-direction: column;
                  gap: 4px;
                }
                .presence-top {
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  line-height: 1;
                }
                .presence-name {
                  font-weight: 800;
                  font-size: 16px;
                  color: rgba(255, 255, 255, 0.92);
                }
                .presence-pill {
                  font-size: 11px;
                  font-weight: 800;
                  letter-spacing: 0.08em;
                  padding: 6px 10px;
                  border-radius: 999px;
                  border: 1px solid rgba(255, 255, 255, 0.14);
                  text-transform: uppercase;
                  transition: background 200ms ease, border-color 200ms ease, color 200ms ease;
                }
                .presence-statusText {
                  font-size: 13px;
                  color: rgba(255, 255, 255, 0.62);
                  white-space: nowrap;
                }
                .presence-errorSnippet {
                  max-width: 520px;
                  font-size: 12px;
                  color: rgba(254, 202, 202, 0.92);
                  background: rgba(239, 68, 68, 0.08);
                  border: 1px solid rgba(239, 68, 68, 0.22);
                  padding: 6px 10px;
                  border-radius: 10px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }
                .octo-breathe {
                  animation: breathe 3.2s ease-in-out infinite;
                }
                .octo-bob {
                  animation: bob 1.25s ease-in-out infinite;
                }
                .octo-blink {
                  animation: blink 4.4s ease-in-out infinite;
                }
                .octo-shake-once {
                  animation: shake 0.22s ease-in-out 1;
                }
                .octo-offline {
                  filter: saturate(0.1) brightness(0.92);
                }
                @keyframes breathe {
                  0%, 100% {
                    transform: scale(1);
                  }
                  50% {
                    transform: scale(1.06);
                  }
                }
                @keyframes bob {
                  0%, 100% {
                    transform: translateY(0);
                  }
                  50% {
                    transform: translateY(-3px);
                  }
                }
                @keyframes blink {
                  0%, 90%, 100% {
                    opacity: 1;
                  }
                  92%, 96% {
                    opacity: 0.25;
                  }
                }
                @keyframes shake {
                  0% {
                    transform: translateX(0);
                  }
                  25% {
                    transform: translateX(-2px);
                  }
                  50% {
                    transform: translateX(2px);
                  }
                  75% {
                    transform: translateX(-1px);
                  }
                  100% {
                    transform: translateX(0);
                  }
                }
            `}</style>
        </div>
    );
}