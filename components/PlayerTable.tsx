import React, { useMemo, useState } from "react";
import { assignKeeperSlots } from "../lib/keepers";
import { cn } from "../lib/cn";

interface PlayerRowData {
  playerId: string;
  name: string;
  currentTeam: string;
  previousTeam: string;
  position: string;
  round: number | null;
  pickNo: number | null;
  draftRank: number;
  keeperRound: number | null;
  pprRank: number | null;
  posRank?: number | null;
  adjustedRound?: number | null;
  prevKeeper?: boolean;
  starReason?: string;
  rosterId: number;
  teamAbbr: string;
  valueScore?: number | null;
}

type SortKey = keyof Pick<
  PlayerRowData,
  | "valueScore"
  | "draftRank"
  | "pprRank"
  | "name"
  | "teamAbbr"
  | "currentTeam"
  | "previousTeam"
  | "position"
  | "round"
  | "keeperRound"
>;

interface Props {
  players: PlayerRowData[];
  selected: Set<string>;
  onSelectionChange: (sel: Set<string>) => void;
  maxKeepers?: number;
  missing?: Record<number, number[]>;
  showDraftDetails?: boolean;
}

const SortIcon = ({ active, asc }: { active: boolean; asc: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "ml-1 inline-block text-[0.6rem]",
      active ? "text-ink-700" : "text-ink-300",
    )}
  >
    {active ? (asc ? "▲" : "▼") : "↕"}
  </span>
);

const PlayerTable: React.FC<Props> = ({
  players,
  selected,
  onSelectionChange,
  maxKeepers = 4,
  missing = {},
  showDraftDetails = true,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("pprRank");
  const [asc, setAsc] = useState<boolean>(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const adjustedMap = useMemo(() => {
    const candidates = players
      .filter((p) => selected.has(p.playerId) && p.keeperRound != null)
      .map((p) => ({
        playerId: p.playerId,
        rosterId: p.rosterId,
        cost: p.keeperRound!,
      }));
    const missingByRoster = new Map<number, Set<number>>();
    Object.entries(missing).forEach(([rid, rounds]) => {
      missingByRoster.set(parseInt(rid), new Set(rounds));
    });
    return assignKeeperSlots(candidates, missingByRoster).slots;
  }, [players, selected, missing]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const dir = asc ? 1 : -1;
      const av = a[sortKey] as unknown;
      const bv = b[sortKey] as unknown;
      if (av == null && bv == null) return 0;
      if (av == null) return asc ? 1 : -1;
      if (bv == null) return asc ? -1 : 1;
      if (typeof av === "number" && typeof bv === "number") {
        if (sortKey === "valueScore") return (bv - av) * dir;
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [players, sortKey, asc]);

  const toggle = (playerId: string) => {
    const newSel = new Set<string>(selected);
    if (newSel.has(playerId)) {
      newSel.delete(playerId);
    } else {
      const target = players.find((pl) => pl.playerId === playerId);
      if (!target || target.rosterId === -1) return;
      const sameTeamCount = Array.from(newSel).filter((pid) => {
        const p = players.find((pl) => pl.playerId === pid);
        return p && p.rosterId === target.rosterId;
      }).length;
      if (sameTeamCount >= maxKeepers) return;
      newSel.add(playerId);
    }
    onSelectionChange(newSel);
  };

  const SortableHeader = ({
    keyName,
    children,
    className,
  }: {
    keyName: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => (
    <th
      onClick={() => handleSort(keyName)}
      className={cn(
        "cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-700 hover:text-brand-700",
        className,
      )}
    >
      {children}
      <SortIcon active={sortKey === keyName} asc={asc} />
    </th>
  );

  // Frozen left columns (Keep + Player) keep a player's identity in view while
  // the stats scroll horizontally — the key pattern for wide tables on phones.
  // Keep is w-12 (48px), so Player sticks at left-12. Header cells need their
  // own bg + higher z; body cells use bg-inherit so the row tint carries over.
  const headFrozen = "sticky top-0 z-20 bg-ink-100";
  const bodyFrozen = "sticky z-10 bg-inherit";

  return (
    <div className="relative rounded-xl border border-ink-200 bg-white shadow-sm scroll-x-fade">
      <div className="scroll-x no-scrollbar overflow-x-auto rounded-xl">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-ink-100">
            <tr>
              <th className={cn("w-12 px-2 py-2 text-center text-xs font-semibold uppercase text-ink-700 left-0", headFrozen)}>
                Keep
              </th>
              <SortableHeader keyName="name" className={cn("left-12", headFrozen)}>Player</SortableHeader>
              <SortableHeader keyName="pprRank" className="w-16">Rank</SortableHeader>
              <SortableHeader keyName="teamAbbr" className="w-16">Team</SortableHeader>
              <SortableHeader keyName="position" className="w-12">Pos</SortableHeader>
              {showDraftDetails && <SortableHeader keyName="previousTeam">Draft Team</SortableHeader>}
              {showDraftDetails && <SortableHeader keyName="draftRank">Drafted</SortableHeader>}
              <SortableHeader keyName="currentTeam">Current Roster</SortableHeader>
              <SortableHeader keyName="keeperRound" className="w-20">Keeper</SortableHeader>
              <SortableHeader keyName="valueScore" className="w-20">Value</SortableHeader>
              <th className="w-20 px-3 py-2 text-left text-xs font-semibold uppercase text-ink-700">
                Used Slot
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p) => {
              const sameTeamCount = Array.from(selected).filter((pid) => {
                const pl = players.find((pp) => pp.playerId === pid);
                return pl && pl.rosterId === p.rosterId;
              }).length;
              const disabled =
                p.rosterId === -1 ||
                (!selected.has(p.playerId) && sameTeamCount >= maxKeepers);
              return (
                <tr
                  key={p.playerId}
                  className={cn(
                    "border-b border-ink-100 transition-colors hover:bg-ink-50/80",
                    `row-pos-${p.position}`,
                    selected.has(p.playerId) && "ring-1 ring-inset ring-emerald-300",
                  )}
                >
                  <td className={cn("w-12 p-0 text-center left-0", bodyFrozen)}>
                    <label className="flex h-full min-h-[44px] w-full cursor-pointer items-center justify-center px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(p.playerId)}
                        disabled={disabled}
                        onChange={() => toggle(p.playerId)}
                        className="h-5 w-5 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
                      />
                    </label>
                  </td>
                  <td className={cn("whitespace-nowrap px-3 py-2 font-medium text-ink-900 left-12", bodyFrozen)}>
                    {p.name}
                  </td>
                  <td className="px-3 py-2 text-ink-500">{p.pprRank ?? "-"}</td>
                  <td className="px-3 py-2 text-ink-500">{p.teamAbbr}</td>
                  <td className="px-3 py-2 text-ink-700">
                    {p.position}
                    {p.posRank != null && (
                      <span className="ml-1 text-xs text-ink-400 tabular-nums">
                        {p.posRank}
                      </span>
                    )}
                  </td>
                  {showDraftDetails && <td className="px-3 py-2 text-ink-700">{p.previousTeam}</td>}
                  {showDraftDetails && (
                    <td className="whitespace-nowrap px-3 py-2 text-ink-700">
                      {p.rosterId === -1
                        ? "-"
                        : p.round == null
                        ? "Undrafted"
                        : `${p.round} (${p.pickNo != null ? p.pickNo : "?"})`}
                    </td>
                  )}
                  <td className="px-3 py-2 text-ink-700">{p.currentTeam}</td>
                  <td className="px-3 py-2 font-medium">
                    {p.rosterId === -1 ? "-" : p.keeperRound ?? "N/A"}
                    {p.prevKeeper && (
                      <span
                        title={p.starReason || "Keeper cost advanced"}
                        className="ml-1 cursor-help text-amber-500"
                      >
                        *
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">
                    {p.valueScore != null ? p.valueScore.toFixed(1) : "-"}
                  </td>
                  <td className="px-3 py-2 font-semibold text-emerald-700">
                    {adjustedMap.get(p.playerId) ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlayerTable;
