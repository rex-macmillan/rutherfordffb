/**
 * Pure derivation: raw Sleeper + FantasyCalc data → table rows for the
 * Keeper Helper page. No React, no I/O.
 */

import {
  DraftPick,
  LeagueUser,
  PlayersBlob,
  Roster,
  SleeperPlayer,
  TradedPick,
} from "./sleeperApi";
import {
  KeeperHistory,
  buildKeeperHistory,
  buildKeeperCostMap,
  calculateKeeperRound,
  computeKeeperCost,
  UNDRAFTED_KEEPER_ROUND,
} from "./keepers";

export interface PlayerRow {
  playerId: string;
  name: string;
  currentTeam: string;
  previousTeam: string;
  teamAbbr: string;
  position: string;
  round: number | null;
  pickNo: number | null;
  draftRank: number;
  keeperRound: number | null;
  adjustedRound?: number | null;
  prevKeeper?: boolean;
  starReason?: string;
  rosterId: number;
  pprRank: number | null;
  valueScore?: number | null;
}

export interface TeamOption {
  rosterId: number;
  teamName: string;
}

interface DeriveInput {
  currentRosters: Roster[];
  currentUsers: LeagueUser[];
  previousRosters: Roster[];
  previousUsers: LeagueUser[];
  previousDraftPicks: DraftPick[];
  chainDraftPicks: DraftPick[][]; // oldest-first, used for history
  players: PlayersBlob;
  fcRanks: Map<string, number>;
  tradedPicks: TradedPick[];
  currentSeason: string;
  /** Cap for FC ranks we'll include for free agents. */
  freeAgentRankCutoff?: number;
}

const POSITION_PRIORITY = ["QB", "RB", "WR", "TE"] as const;
const EXCLUDED_POSITIONS = new Set(["DEF", "K"]);

function preferredPosition(meta: SleeperPlayer | undefined): string {
  if (!meta) return "WR";
  const fp = meta.fantasy_positions;
  if (Array.isArray(fp) && fp.length) {
    const found = POSITION_PRIORITY.find((p) => fp.includes(p));
    return found ?? fp[0];
  }
  if (meta.position) {
    return POSITION_PRIORITY.includes(meta.position as any)
      ? meta.position
      : "WR";
  }
  return "WR";
}

function playerName(meta: SleeperPlayer | undefined, fallbackId: string) {
  const base =
    meta?.full_name ||
    `${meta?.first_name ?? ""} ${meta?.last_name ?? ""}`.trim();
  const named = base || fallbackId;
  return meta?.years_exp === 0 ? `${named} (R)` : named;
}

/**
 * Value heuristic combining FantasyCalc rank with keeper round cost. Mirrors
 * the original (rex-owned) formula from pages/index.tsx so the public-facing
 * "value" number doesn't change unexpectedly.
 */
export function computeValueScore(
  rank: number | null,
  keeperCost: number | null,
  position?: string,
): number | null {
  if (rank == null || keeperCost == null) return null;
  let score = (keeperCost - rank / 12) * ((200 - rank + 50) / 200);
  if (position === "QB") score *= 0.75;
  return score;
}

function teamNameMap(users: LeagueUser[], rosters: Roster[]) {
  const ownerToName = new Map<string, string>();
  users.forEach((u) => {
    ownerToName.set(u.user_id, u.metadata?.team_name || u.display_name || "Unknown");
  });
  const rosterToName = new Map<number, string>();
  rosters.forEach((r) => {
    rosterToName.set(
      r.roster_id,
      ownerToName.get(r.owner_id) || `Team ${r.roster_id}`,
    );
  });
  return rosterToName;
}

export interface DeriveResult {
  rows: PlayerRow[];
  teams: TeamOption[];
  history: Map<string, KeeperHistory>;
  keeperCostByPid: Map<string, number>;
  prevRosterByPid: Map<string, number>;
}

export function derivePlayerRows(input: DeriveInput): DeriveResult {
  const {
    currentRosters,
    currentUsers,
    previousRosters,
    previousUsers,
    previousDraftPicks,
    chainDraftPicks,
    players,
    fcRanks,
    freeAgentRankCutoff = 200,
  } = input;

  // Previous-season name lookup.
  const prevRosterToName = teamNameMap(previousUsers, previousRosters);
  const currentRosterToName = teamNameMap(currentUsers, currentRosters);

  // Round + pick map from the most recent draft.
  const roundMap = new Map<string, number>();
  const pickNoMap = new Map<string, number>();
  const prevRosterByPid = new Map<string, number>();
  previousDraftPicks.forEach((p) => {
    roundMap.set(p.player_id, p.round);
    pickNoMap.set(p.player_id, p.pick_no ?? 0);
    prevRosterByPid.set(p.player_id, p.roster_id);
  });

  const history = buildKeeperHistory(chainDraftPicks);
  const keeperCostByPid = buildKeeperCostMap(history);

  const teams: TeamOption[] = Array.from(currentRosterToName.entries()).map(
    ([rosterId, teamName]) => ({ rosterId, teamName }),
  );

  const rows: PlayerRow[] = [];
  currentRosters.forEach((r) => {
    r.players.forEach((pid) => {
      const meta = players[pid];
      const pos = preferredPosition(meta);
      if (EXCLUDED_POSITIONS.has(pos)) return;

      const roundVal = roundMap.get(pid) ?? null;
      const hist = history.get(pid);
      const baseRoundRef = hist?.base ?? roundVal;
      const baseCost = calculateKeeperRound(baseRoundRef);
      const escalated = keeperCostByPid.get(pid);

      let keeperCost: number;
      if (roundVal == null) {
        // Undrafted last year → 6th-round default (§2).
        keeperCost = UNDRAFTED_KEEPER_ROUND;
      } else if (escalated != null) {
        keeperCost = escalated;
      } else {
        keeperCost = baseCost;
      }

      const pickNoVal = pickNoMap.get(pid) ?? null;
      const draftRank =
        roundVal == null
          ? Number.POSITIVE_INFINITY
          : roundVal * 100 + (pickNoVal ?? 0);
      const baseCostFromRound = calculateKeeperRound(roundVal);
      const escalatedDueToStreak =
        (hist?.lastKeeper ?? false) && baseCostFromRound !== keeperCost;

      rows.push({
        playerId: pid,
        name: playerName(meta, pid),
        currentTeam: currentRosterToName.get(r.roster_id) || "",
        previousTeam:
          prevRosterToName.get(prevRosterByPid.get(pid) ?? -1) || "",
        position: pos,
        teamAbbr: meta?.team || "",
        round: roundVal,
        pickNo: pickNoVal,
        draftRank,
        keeperRound: keeperCost,
        pprRank: fcRanks.get(pid) ?? null,
        adjustedRound: null,
        prevKeeper: escalatedDueToStreak,
        starReason: escalatedDueToStreak
          ? `Keeper cost advanced due to consecutive keeps (was ${baseCostFromRound}, now ${keeperCost})`
          : undefined,
        rosterId: r.roster_id,
        valueScore: computeValueScore(fcRanks.get(pid) ?? null, keeperCost, pos),
      });
    });
  });

  // Append free agents ranked in the top N by FantasyCalc.
  const present = new Set(rows.map((r) => r.playerId));
  fcRanks.forEach((rank, pid) => {
    if (rank > freeAgentRankCutoff) return;
    if (present.has(pid)) return;
    const meta = players[pid];
    const pos = preferredPosition(meta);
    if (EXCLUDED_POSITIONS.has(pos)) return;
    rows.push({
      playerId: pid,
      name: playerName(meta, pid),
      currentTeam: "",
      previousTeam: "",
      position: pos,
      teamAbbr: meta?.team || "",
      round: null,
      pickNo: null,
      draftRank: Number.POSITIVE_INFINITY,
      keeperRound: null,
      adjustedRound: null,
      prevKeeper: false,
      starReason: undefined,
      rosterId: -1,
      pprRank: rank,
      valueScore: null,
    });
  });

  return { rows, teams, history, keeperCostByPid, prevRosterByPid };
}
