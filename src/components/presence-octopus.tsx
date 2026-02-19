"use client";

import React from "react";

export type PresenceState = "idle" | "working" | "blocked" | "error" | "offline";

type Props = {
  botName?: string;
  state: PresenceState;
  statusText?: string;
  lastErrorSnippet?: string | null;
  className?: string;
  compact?: boolean;
};

const STATE_META: Record<
  PresenceState,
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
  idle: {
    label: "IDLE",
    glow: "rgba(168, 85, 247, 0.52)",
    pillBg: "rgba(168, 85, 247, 0.12)",
    pillBorder: "rgba(168, 85, 247, 0.38)",
    pillText: "rgba(233, 213, 255, 0.95)",
    animClass: "octo-idle",
  },
  working: {
    label: "WORKING",
    glow: "rgba(34, 197, 94, 0.30)",
    pillBg: "rgba(34, 197, 94, 0.10)",
    pillBorder: "rgba(34, 197, 94, 0.28)",
    pillText: "rgba(187, 247, 208, 0.95)",
    animClass: "octo-working",
  },
  blocked: {
    label: "BLOCKED",
    glow: "rgba(245, 158, 11, 0.36)",
    pillBg: "rgba(245, 158, 11, 0.12)",
    pillBorder: "rgba(245, 158, 11, 0.40)",
    pillText: "rgba(254, 243, 199, 0.95)",
    animClass: "octo-blocked",
  },
  error: {
    label: "ERROR",
    glow: "rgba(239, 68, 68, 0.46)",
    pillBg: "rgba(239, 68, 68, 0.12)",
    pillBorder: "rgba(239, 68, 68, 0.45)",
    pillText: "rgba(254, 202, 202, 0.95)",
    animClass: "octo-error",
  },
  offline: {
    label: "OFFLINE",
    glow: "rgba(148, 163, 184, 0.04)",
    pillBg: "rgba(148, 163, 184, 0.10)",
    pillBorder: "rgba(148, 163, 184, 0.25)",
    pillText: "rgba(226, 232, 240, 0.85)",
    animClass: "octo-offline-state",
    desaturate: true,
  },
};

export function PresenceOctopus({
  botName = "Gilbert",
  state,
  statusText,
  lastErrorSnippet,
  className,
  compact = false,
}: Props) {
  const meta = STATE_META[state];

  return (
    <div className={["presence-wrap", compact ? "presence-compact" : "", className].filter(Boolean).join(" ")}>
      <div
        className={[
          "presence-avatar",
          `state-${state}`,
          meta.animClass,
          meta.desaturate ? "octo-offline" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ ["--octo-glow" as const]: meta.glow } as React.CSSProperties}
        aria-label={`${botName} presence ${state}`}
      >
        <div className="presence-glow" />
        <div className="presence-core-pulse" />
        <OctopusSVG state={state} />
        {state === "working" && <Bubbles />}
      </div>

      {!compact ? (
        <div className="presence-meta">
          <div className="presence-top">
            <div className="presence-name">{botName}</div>
            <div
              className="presence-pill"
              style={{ background: meta.pillBg, borderColor: meta.pillBorder, color: meta.pillText }}
            >
              {meta.label}
            </div>
            {statusText ? <div className="presence-statusText">{statusText}</div> : null}
          </div>
          {state === "error" && lastErrorSnippet ? (
            <div className="presence-errorSnippet" title={lastErrorSnippet}>
              {lastErrorSnippet}
            </div>
          ) : null}
        </div>
      ) : null}

      <style jsx>{`
        .presence-wrap {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 320px;
        }
        .presence-wrap.presence-compact {
          min-width: 0;
          gap: 0;
        }
        .presence-avatar {
          position: relative;
          width: 84px;
          height: 84px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: border-color 420ms ease, filter 420ms ease, transform 420ms ease;
        }
        .presence-avatar svg {
          position: absolute;
          left: 50%;
          top: 50%;
          display: block;
          transform: translate(-55%, -50%);
          transform-origin: center;
          transition: filter 420ms ease;
          z-index: 2;
        }
        .presence-glow {
          position: absolute;
          inset: -28px;
          background: radial-gradient(circle at 40% 35%, var(--octo-glow), transparent 60%);
          filter: blur(18px);
          opacity: 0.9;
          transition: background 420ms ease, opacity 420ms ease;
          pointer-events: none;
          z-index: 0;
        }
        .presence-core-pulse {
          position: absolute;
          width: 56px;
          height: 56px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.14), transparent 70%);
          opacity: 0;
          z-index: 1;
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
          transition: background 420ms ease, border-color 420ms ease, color 420ms ease;
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

        .state-idle svg {
          filter: drop-shadow(0 0 7px rgba(34, 197, 94, 0.32));
        }
        .state-working svg {
          filter: drop-shadow(0 0 11px rgba(168, 85, 247, 0.45));
        }
        .state-blocked svg {
          filter: drop-shadow(0 0 9px rgba(245, 158, 11, 0.42));
        }
        .state-error svg {
          filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.45));
        }
        .state-offline .presence-glow {
          opacity: 0;
        }

        .octo-idle {
          animation: idleFloat 5.2s ease-in-out infinite;
        }
        .octo-working {
          animation: workingBob 2s ease-in-out infinite;
        }
        .octo-working .presence-core-pulse {
          opacity: 0.5;
          animation: corePulse 1.6s ease-in-out infinite;
        }
        .octo-blocked {
          animation: blockedWait 8.2s ease-in-out infinite;
        }
        .octo-error {
          animation: errorTwitch 6s ease-in-out infinite;
        }
        .octo-offline-state,
        .octo-offline-state * {
          animation: none !important;
        }
        .octo-offline {
          filter: saturate(0.06) brightness(0.85);
        }

        @keyframes idleFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        @keyframes workingBob {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        @keyframes blockedWait {
          0%,
          82%,
          100% {
            transform: translateY(0px);
            opacity: 1;
          }
          88% {
            opacity: 0.74;
          }
          92% {
            opacity: 1;
          }
        }
        @keyframes errorTwitch {
          0%,
          94%,
          100% {
            transform: translateX(0);
          }
          95% {
            transform: translateX(-2px);
          }
          96% {
            transform: translateX(2px);
          }
          97% {
            transform: translateX(-1px);
          }
        }
        @keyframes corePulse {
          0%,
          100% {
            transform: scale(0.96);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.12);
            opacity: 0.68;
          }
        }
      `}</style>
    </div>
  );
}

function OctopusSVG({ state }: { state: PresenceState }) {
  const fillId =
    state === "working"
      ? "octoWorking"
      : state === "idle"
        ? "octoIdle"
        : state === "blocked"
          ? "octoBlocked"
          : state === "error"
            ? "octoError"
            : "octoOffline";

  const eyes =
    state === "offline" ? (
      <>
        <path d="M33 42h10" stroke="#0b0b0f" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M53 42h10" stroke="#0b0b0f" strokeWidth="2.8" strokeLinecap="round" />
      </>
    ) : state === "blocked" ? (
      <>
        <ellipse cx="38" cy="40" rx="7.3" ry="7.1" fill="white" stroke="#0b0b0f" strokeWidth="2.5" />
        <ellipse cx="58" cy="40" rx="7.3" ry="7.1" fill="white" stroke="#0b0b0f" strokeWidth="2.5" />
        <circle cx="40" cy="41" r="3.9" fill="#0b0b0f" />
        <circle cx="60" cy="41" r="3.9" fill="#0b0b0f" />
      </>
    ) : (
      <>
        <circle cx="38" cy="40" r="7.5" fill="white" stroke="#0b0b0f" strokeWidth="2.5" />
        <circle cx="58" cy="40" r="7.5" fill="white" stroke="#0b0b0f" strokeWidth="2.5" />
        <circle cx="40" cy="41" r="4" fill="#0b0b0f" />
        <circle cx="60" cy="41" r="4" fill="#0b0b0f" />
        <circle cx="38.5" cy="38.5" r="1.2" fill="white" />
        <circle cx="58.5" cy="38.5" r="1.2" fill="white" />
      </>
    );

  return (
    <svg width="57" height="57" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="octoIdle" x1="24" y1="10" x2="72" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b878ff" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="octoWorking" x1="24" y1="10" x2="72" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="octoBlocked" x1="24" y1="10" x2="72" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="octoError" x1="24" y1="10" x2="72" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fb7185" />
          <stop offset="1" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id="octoOffline" x1="24" y1="10" x2="72" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
      </defs>

      <g transform="translate(-6 0)">
        <path
          d="M48 12c-14 0-24 11-24 24 0 9 4 13 7 20 2 5 0 8-6 8-5 0-8-3-11-8-2 6 1 13 9 15 7 2 12-1 16-4 2-2 3 0 2 2-3 5-6 10-9 15 6 1 13-2 18-9l4-6 4 6c5 7 12 10 18 9-3-5-6-10-9-15-1-2 0-4 2-2 4 3 9 6 16 4 8-2 11-9 9-15-3 5-6 8-11 8-6 0-8-3-6-8 3-7 7-11 7-20 0-13-10-24-24-24Z"
          fill={`url(#${fillId})`}
          stroke="#0b0b0f"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        {eyes}

        <path d="M40 52c2.2 3.5 5 5 8 5s5.8-1.5 8-5" stroke="#0b0b0f" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Bubbles() {
  return (
    <>
      <div className="bub bub-1" />
      <div className="bub bub-2" />
      <div className="bub bub-3" />
      <style jsx>{`
        .bub {
          position: absolute;
          bottom: 8px;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.4);
          opacity: 0;
          animation: bubble 1.9s ease-in-out infinite;
          z-index: 3;
        }
        .bub-1 {
          left: 16px;
          animation-delay: 0ms;
        }
        .bub-2 {
          left: 30px;
          animation-delay: 260ms;
        }
        .bub-3 {
          left: 44px;
          animation-delay: 520ms;
        }
        @keyframes bubble {
          0% {
            transform: translateY(0);
            opacity: 0;
          }
          25% {
            opacity: 0.55;
          }
          70% {
            opacity: 0.2;
          }
          100% {
            transform: translateY(-18px);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
