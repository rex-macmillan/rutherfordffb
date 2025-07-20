import React, { useState } from "react";
import styles from "./PlayerTable.module.css";

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
  adjustedRound?: number | null;
  prevKeeper?: boolean;
  starReason?: string;
  rosterId: number;
  teamAbbr: string;
  valueScore?: number | null;
}

type SortKey = keyof Pick<PlayerRowData, "valueScore" | "draftRank" | "pprRank" | "name" | "teamAbbr" | "currentTeam" | "previousTeam" | "position" | "round" | "keeperRound">;

interface Props {
  players: PlayerRowData[];
  selected: Set<string>;
  onSelectionChange: (sel: Set<string>) => void;
  maxKeepers?: number;
  missing?: Record<number, number[]>; // rosterId -> missing rounds
  showDraftDetails?: boolean;
}

const PlayerTable: React.FC<Props> = ({ players, selected, onSelectionChange, maxKeepers = 4, missing = {}, showDraftDetails = true }) => {
  const [sortKey, setSortKey] = useState<SortKey>("pprRank");
  const [asc, setAsc] = useState<boolean>(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  };

  // Compute adjusted rounds for selected keepers
  const computeAdjusted = () => {
    const selectedPlayers = players.filter((p) => selected.has(p.playerId));
    // sort by keeperRound ascending
    selectedPlayers.sort((a, b) => {
      const aR = a.keeperRound ?? 99;
      const bR = b.keeperRound ?? 99;
      return aR - bR;
    });
    const taken = new Set<number>();
    // populate with rounds missing because of trades (per roster)
    selectedPlayers.forEach((p) => {
      (missing[p.rosterId] || []).forEach((r) => taken.add(r));
    });
    const map = new Map<string, number>();
    for (const p of selectedPlayers) {
      let desired = p.keeperRound ?? 99;
      const unavailable = (round:number)=>taken.has(round);
      if (unavailable(desired)) {
        // try earlier slots first
        let earlier = desired - 1;
        while (earlier >= 1 && unavailable(earlier)) earlier -= 1;
        if (earlier >= 1 && !unavailable(earlier)) {
          desired = earlier;
        } else {
          while (unavailable(desired)) desired += 1;
        }
      }
      map.set(p.playerId, desired);
      taken.add(desired);
    }
    return map;
  };

  const adjustedMap = computeAdjusted();

  const sortedPlayers = [...players].sort((a, b) => {
    const dir = asc ? 1 : -1;
    const av = a[sortKey] as unknown;
    const bv = b[sortKey] as unknown;
    // Handle null/undefined (Undrafted) explicitly
    if (av == null && bv == null) return 0;
    if (av == null) return asc ? 1 : -1; // place null last when ascending
    if (bv == null) return asc ? -1 : 1;

    if (typeof av === "number" && typeof bv === "number") {
      if (sortKey === "valueScore") {
        // For valueScore we want highest positive first when ascending
        // so we reverse the natural numeric comparison
        return (bv - av) * dir;
      }
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv)) * dir;
  });

  const toggle = (playerId: string) => {
    const newSel = new Set<string>(selected);
    if (newSel.has(playerId)) {
      newSel.delete(playerId);
    } else {
      const target = players.find((pl) => pl.playerId === playerId);
      if (!target) return;
      if (target.rosterId === -1) return; // Free-agent players cannot be kept
      const sameTeamCount = Array.from(newSel).filter((pid) => {
        const p = players.find((pl) => pl.playerId === pid);
        return p && p.rosterId === target.rosterId;
      }).length;
      if (sameTeamCount >= maxKeepers) return;
      newSel.add(playerId);
    }
    onSelectionChange(newSel);
  };

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.header}>
            <th>Keep</th>
            <th className={styles.sortable} onClick={() => handleSort("pprRank")}>Rank</th>
            <th className={styles.sortable} onClick={() => handleSort("name")}>Player</th>
            <th className={styles.sortable} onClick={() => handleSort("teamAbbr")}>Team</th>
            <th className={styles.sortable} onClick={() => handleSort("position")}>Pos</th>
            {showDraftDetails && (
              <th className={styles.sortable} onClick={() => handleSort("previousTeam")}>Draft Team</th>
            )}
            {showDraftDetails && (
              <th className={styles.sortable} onClick={() => handleSort("draftRank")}>Drafted</th>
            )}
            <th className={styles.sortable} onClick={() => handleSort("currentTeam")}>Current Roster</th>
            <th className={styles.sortable} onClick={() => handleSort("keeperRound")}>Keeper</th>
            <th className={styles.sortable} onClick={() => handleSort("valueScore")}>Value</th>
            <th>Used Slot</th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((p) => (
            <tr key={p.playerId} className={`${styles.row} ${styles[`pos_${p.position}`] || ""}`}>
              <td className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={selected.has(p.playerId)}
                  disabled={p.rosterId === -1 || (!selected.has(p.playerId) && Array.from(selected).filter((pid)=>{
                    const pl=players.find(pp=>pp.playerId===pid);
                    return pl && pl.rosterId===p.rosterId;
                  }).length >= maxKeepers)}
                  onChange={() => toggle(p.playerId)}
                />
              </td>
              <td>{p.pprRank ?? "-"}</td>
              <td>{p.name}</td>
              <td>{p.teamAbbr}</td>
              <td>{p.position}</td>
              {showDraftDetails && <td>{p.previousTeam}</td>}
              {showDraftDetails && (
                <td>
                  {p.rosterId === -1
                    ? "-"
                    : p.round == null
                    ? "Undrafted"
                    : `${p.round} (${p.pickNo != null ? p.pickNo : "?"})`}
                </td>
              )}
              <td>{p.currentTeam}</td>
              <td>
                {p.rosterId === -1 ? "-" : (p.keeperRound ?? "N/A")}
                {p.prevKeeper && (
                  <span title={p.starReason || "Keeper cost advanced"} style={{ cursor: "help", color: "#eab308", marginLeft: 2 }}>*</span>
                )}
              </td>
              <td>{p.valueScore!=null? p.valueScore.toFixed(1):"-"}</td>
              <td>{adjustedMap.get(p.playerId) ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PlayerTable; 