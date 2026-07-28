import { cn } from "../lib/cn";
import type { KeeperGrade } from "../lib/keeperValue";
import { Tooltip } from "./ui/Tooltip";

const TONE_CLASSES: Record<KeeperGrade["tone"], string> = {
  emerald: "bg-emerald-100 text-emerald-800",
  brand: "bg-brand-100 text-brand-700",
  ink: "bg-ink-900/5 text-ink-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

/**
 * The keeper value readout. Deliberately a label rather than a number — the
 * underlying surplus is in FantasyCalc points, which means nothing to a human;
 * the bucket and the pick comparison in the tooltip do.
 */
export function KeeperGradeBadge({
  grade,
  hint,
  className,
}: {
  grade: KeeperGrade | null | undefined;
  hint?: string;
  className?: string;
}) {
  if (!grade) return <span className="text-ink-400">—</span>;

  const badge = (
    <span
      tabIndex={hint ? 0 : undefined}
      className={cn(
        "inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium outline-none",
        hint && "cursor-help focus-visible:ring-2 focus-visible:ring-brand-500/40",
        TONE_CLASSES[grade.tone],
        className,
      )}
    >
      {grade.label}
    </span>
  );

  if (!hint) return badge;

  return <Tooltip content={hint}>{badge}</Tooltip>;
}
