import { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-ink-200/60", className)}
      {...rest}
    />
  );
}

export function SkeletonRow({ cols = 8 }: { cols?: number }) {
  return (
    <tr className="border-b border-ink-100">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 10, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <table className="w-full">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  );
}
