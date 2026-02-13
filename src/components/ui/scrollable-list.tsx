import { ReactNode } from "react";

type ScrollableListProps = {
  children: ReactNode;
  className?: string;
};

export function ScrollableList({ children, className }: ScrollableListProps) {
  return <div className={`scrollable-list ${className ?? ""}`.trim()}>{children}</div>;
}
