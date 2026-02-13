import { ReactNode } from "react";
import clsx from "clsx";

type ChipProps = {
  children: ReactNode;
  className?: string;
};

export function Chip({ children, className }: ChipProps) {
  return <span className={clsx("chip", className)}>{children}</span>;
}
