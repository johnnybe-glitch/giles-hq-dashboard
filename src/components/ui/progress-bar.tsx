type ProgressBarProps = {
  value: number;
  className?: string;
};

export function ProgressBar({ value, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={`progress-bar ${className ?? ""}`.trim()}>
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}
