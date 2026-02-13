import { ReactNode } from "react";
import clsx from "clsx";

type PillProps = {
  variant?: "default" | "on" | "off";
  children: ReactNode;
  className?: string;
};

export function Pill({ variant = "default", children, className }: PillProps) {
  return <div className={clsx("pill", variant !== "default" && variant, className)}>{children}</div>;
}
