/**
 * Stable sort for keeper table rows. Pure — no React.
 */

export type PlayerSortKey =
  | "keeperSurplus"
  | "draftRank"
  | "pprRank"
  | "name"
  | "teamAbbr"
  | "currentTeam"
  | "previousTeam"
  | "position"
  | "round"
  | "keeperRound";

export function sortPlayerRows<T>(
  rows: T[],
  sortKey: PlayerSortKey,
  asc: boolean,
): T[] {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = (a as Record<PlayerSortKey, unknown>)[sortKey];
    const bv = (b as Record<PlayerSortKey, unknown>)[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return asc ? 1 : -1;
    if (bv == null) return asc ? -1 : 1;
    if (typeof av === "number" && typeof bv === "number") {
      if (sortKey === "keeperSurplus") return (bv - av) * dir;
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv)) * dir;
  });
}
