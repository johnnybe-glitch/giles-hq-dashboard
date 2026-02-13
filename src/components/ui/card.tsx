import { ReactNode } from "react";
import clsx from "clsx";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("card", className)}>{children}</section>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card-header", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card-title", className)}>{children}</div>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card-content", className)}>{children}</div>;
}
