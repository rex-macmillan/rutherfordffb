import React, { useMemo } from "react";
import { assignKeeperSlots } from "../lib/keepers";
import type { KeeperGrade } from "../lib/keeperValue";
import type { PlayerSortKey } from "../lib/sortPlayerRows";
import { KeeperGradeBadge } from "./KeeperGradeBadge";
import { Tooltip } from "./ui/Tooltip";
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
  keeperSurplus?: number | null;
  keeperGrade?: KeeperGrade | null;
  keeperValueHint?: string;
}

export type { PlayerSortKey as SortKey };

interface Props {
  players: PlayerRowData[];
  selected: Set<string>;
  onSelectionChange: (sel: Set<string>) => void;
  sortKey: PlayerSortKey;
  sortAsc: boolean;
  onSortChange: (key: PlayerSortKey, asc?: boolean) => void;
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

const MOBILE_SORTS: { key: PlayerSortKey; label: string; asc: boolean }[] = [
  { key: "pprRank", label: "Overall rank", asc: true },
  { key: "keeperSurplus", label: "Keeper value", asc: true },
  { key: "keeperRound", label: "Keeper round", asc: true },
  { key: "name", label: "Name A–Z", asc: true },
  { key: "position", label: "Position", asc: true },
  { key: "currentTeam", label: "Current roster", asc: true },
];

const HEAD_FROZEN = "sticky top-0 z-20 bg-ink-100";
const BODY_FROZEN = "sticky z-10 bg-inherit";

function SortableHeader({
  keyName,
  sortKey,
  sortAsc,
  onSortChange,
  children,
  className,
  frozen,
}: {
  keyName: PlayerSortKey;
  sortKey: PlayerSortKey;
  sortAsc: boolean;
  onSortChange: (key: PlayerSortKey, asc?: boolean) => void;
  children: React.ReactNode;
  className?: string;
  frozen?: boolean;
}) {
  return (
    <th className={cn(className, frozen && HEAD_FROZEN)}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onSortChange(keyName);
        }}
        className="flex w-full cursor-pointer select-none items-center px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-700 hover:text-brand-700"
      >
        {children}
        <SortIcon active={sortKey === keyName} asc={sortAsc} />
      </button>
    </th>
  );
}

const PlayerTable: React.FC<Props> = ({
  players,
  selected,
  onSelectionChange,
  sortKey,
  sortAsc,
  onSortChange,
  maxKeepers = 4,
  missing = {},
  showDraftDetails = true,
}) => {
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

  const isDisabled = (p: PlayerRowData) => {
    if (p.rosterId === -1) return true;
    if (selected.has(p.playerId)) return false;
    const sameTeamCount = Array.from(selected).filter((pid) => {
      const pl = players.find((pp) => pp.playerId === pid);
      return pl && pl.rosterId === p.rosterId;
    }).length;
    return sameTeamCount >= maxKeepers;
  };

  const mobileSortValue =
    MOBILE_SORTS.find((s) => s.key === sortKey)?.key ?? "pprRank";

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2 border-b border-ink-200 bg-ink-50/60 px-3 py-2">
          <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            Sort
            <select
              className="rounded-md border border-ink-300 bg-white px-2 py-1.5 text-base font-normal normal-case text-ink-900"
              value={mobileSortValue}
              onChange={(e) => {
                const preset = MOBILE_SORTS.find((s) => s.key === e.target.value);
                if (!preset) return;
                onSortChange(preset.key, preset.asc);
              }}
            >
              {MOBILE_SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs tabular-nums text-ink-400">
            {players.length} players
          </span>
        </div>
        <ul className="divide-y divide-ink-100">
          {players.map((p) => {
            const disabled = isDisabled(p);
            const isSelected = selected.has(p.playerId);
            const slot = adjustedMap.get(p.playerId);
            return (
              <li key={p.playerId} className={`row-pos-${p.position}`}>
                <label
                  className={cn(
                    "flex min-h-[56px] cursor-pointer items-center gap-3 px-3 py-2",
                    isSelected && "ring-1 ring-inset ring-emerald-300",
                    disabled && !isSelected && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => toggle(p.playerId)}
                    className="h-5 w-5 shrink-0 accent-brand-600 disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink-900">
                      {p.name}
                      {p.prevKeeper && (
                        <Tooltip content={p.starReason || "Keeper cost advanced"}>
                          <span
                            tabIndex={0}
                            className="ml-1 cursor-help text-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                          >
                            *
                          </span>
                        </Tooltip>
                      )}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {p.position}
                      {p.posRank != null ? p.posRank : ""} · {p.teamAbbr || "FA"}
                      {p.pprRank != null && <> · #{p.pprRank}</>}
                      {p.currentTeam && <> · {p.currentTeam}</>}
                    </span>
                    {showDraftDetails && p.rosterId !== -1 && (
                      <span className="block truncate text-xs text-ink-400">
                        {p.round == null
                          ? "Undrafted last year"
                          : `Drafted R${p.round} (${p.pickNo ?? "?"})`}
                        {p.previousTeam ? ` by ${p.previousTeam}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "inline-block rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
                        isSelected
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-ink-900/5 text-ink-700",
                      )}
                    >
                      {p.rosterId === -1
                        ? "—"
                        : p.keeperRound != null
                        ? `R${p.keeperRound}`
                        : "N/A"}
                    </span>
                    {slot != null && slot !== p.keeperRound && (
                      <span className="block text-xs font-semibold text-emerald-700">
                        → slot R{slot}
                      </span>
                    )}
                    {p.keeperGrade && (
                      <span className="mt-0.5 block">
                        <KeeperGradeBadge
                          grade={p.keeperGrade}
                          hint={p.keeperValueHint}
                        />
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative hidden md:block">
        <div className="scroll-x no-scrollbar overflow-x-auto rounded-xl">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-ink-100">
              <tr>
                <th
                  className={cn(
                    "w-12 px-2 py-2 text-center text-xs font-semibold uppercase text-ink-700 left-0",
                    HEAD_FROZEN,
                  )}
                >
                  Keep
                </th>
                <SortableHeader
                  keyName="name"
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSortChange={onSortChange}
                  className="left-12"
                  frozen
                >
                  Player
                </SortableHeader>
                <SortableHeader
                  keyName="pprRank"
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSortChange={onSortChange}
                  className="w-16"
                >
                  Rank
                </SortableHeader>
                <SortableHeader
                  keyName="teamAbbr"
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSortChange={onSortChange}
                  className="w-16"
                >
                  Team
                </SortableHeader>
                <SortableHeader
                  keyName="position"
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSortChange={onSortChange}
                  className="w-12"
                >
                  Pos
                </SortableHeader>
                {showDraftDetails && (
                  <SortableHeader
                    keyName="previousTeam"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSortChange={onSortChange}
                  >
                    Draft Team
                  </SortableHeader>
                )}
                {showDraftDetails && (
                  <SortableHeader
                    keyName="draftRank"
                    sortKey={sortKey}
                    sortAsc={sortAsc}
                    onSortChange={onSortChange}
                  >
                    Drafted
                  </SortableHeader>
                )}
                <SortableHeader
                  keyName="currentTeam"
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSortChange={onSortChange}
                >
                  Current Roster
                </SortableHeader>
                <SortableHeader
                  keyName="keeperRound"
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSortChange={onSortChange}
                  className="w-20"
                >
                  Keeper
                </SortableHeader>
                <SortableHeader
                  keyName="keeperSurplus"
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSortChange={onSortChange}
                  className="w-28"
                >
                  Value
                </SortableHeader>
                <th className="w-20 px-3 py-2 text-left text-xs font-semibold uppercase text-ink-700">
                  Used Slot
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const disabled = isDisabled(p);
                return (
                  <tr
                    key={p.playerId}
                    className={cn(
                      "border-b border-ink-100 transition-colors hover:bg-ink-50/80",
                      `row-pos-${p.position}`,
                      selected.has(p.playerId) && "ring-1 ring-inset ring-emerald-300",
                    )}
                  >
                    <td className={cn("w-12 p-0 text-center left-0", BODY_FROZEN)}>
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
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2 font-medium text-ink-900 left-12",
                        BODY_FROZEN,
                      )}
                    >
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
                    {showDraftDetails && (
                      <td className="px-3 py-2 text-ink-700">{p.previousTeam}</td>
                    )}
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
                        <Tooltip content={p.starReason || "Keeper cost advanced"}>
                          <span
                            tabIndex={0}
                            className="ml-1 cursor-help text-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                          >
                            *
                          </span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <KeeperGradeBadge
                        grade={p.keeperGrade}
                        hint={p.keeperValueHint}
                      />
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
    </div>
  );
};

export default PlayerTable;
