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

const STATE_META: Record<
    PresenceState,
    {
        label: string;
        glow: string; // CSS color
        pillBg: string;
        pillBorder: string;
        pillText: string;
        animClass: string; // applied to avatar container
        desaturate?: boolean;
    }
> = {
    idle: {
        label: "IDLE",
        glow: "rgba(34, 197, 94, 0.55)", // green
        pillBg: "rgba(34, 197, 94, 0.10)",
        pillBorder: "rgba(34, 197, 94, 0.35)",
        pillText: "rgba(187, 247, 208, 0.95)",
        animClass: "octo-breathe",
    },
    working: {
        label: "WORKING",
        glow: "rgba(168, 85, 247, 0.60)", // purple
        pillBg: "rgba(168, 85, 247, 0.12)",
        pillBorder: "rgba(168, 85, 247, 0.40)",
        pillText: "rgba(233, 213, 255, 0.95)",
        animClass: "octo-bob",
    },
    blocked: {
        label: "BLOCKED",
        glow: "rgba(245, 158, 11, 0.55)", // amber
        pillBg: "rgba(245, 158, 11, 0.12)",
        pillBorder: "rgba(245, 158, 11, 0.40)",
        pillText: "rgba(254, 243, 199, 0.95)",
        animClass: "octo-blink",
    },
    error: {
        label: "ERROR",
        glow: "rgba(239, 68, 68, 0.65)", // red
        pillBg: "rgba(239, 68, 68, 0.12)",
        pillBorder: "rgba(239, 68, 68, 0.45)",
        pillText: "rgba(254, 202, 202, 0.95)",
        animClass: "octo-shake-once",
    },
    offline: {
        label: "OFFLINE",
        glow: "rgba(148, 163, 184, 0.35)", // gray
        pillBg: "rgba(148, 163, 184, 0.10)",
        pillBorder: "rgba(148, 163, 184, 0.25)",
        pillText: "rgba(226, 232, 240, 0.85)",
        animClass: "",
        desaturate: true,
    },
};

export default function PresenceOctopus({
    botName = "Giles",
    state,
    statusText,
    lastErrorSnippet,
    className,
}: Props) {
    const meta = STATE_META[state];

    return (
        <div className={["presence-wrap", className].filter(Boolean).join(" ")}> 
            <div className={["presence-avatar", meta.animClass, meta.desaturate ? "octo-offline" : "",]
                .filter(Boolean)
                .join(" ")}
                style={{
                    // used by CSS for glow
                    ["--octo-glow" as any]: meta.glow,
                } as React.CSSProperties}
                aria-label={${botName} presence ${state}}>
                <div className="presence-glow" />
                {/* Add SVG octopus here */} 
                <Bubbles />
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
            {/* component-scoped styles */}
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
            `}</style>
        </div>
    );
}