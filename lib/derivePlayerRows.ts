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
  /** Position-specific rank within the league pool, e.g. RB5 / TE7 / QB12. */
  posRank?: number | null;
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
 * Approximate typical draft round given a player's positional rank.
 *
 * Anchored to ADP heuristics in a 12-team 1QB PPR snake draft. Each row is
 * [maxPositionalRank, typicalRound]. First matching row wins.
 */
const MARKET_ROUND_TABLE: Record<string, Array<[number, number]>> = {
  RB: [
    [6, 1],
    [12, 2],
    [20, 4],
    [30, 8],
    [42, 11],
    [60, 14],
  ],
  WR: [
    [8, 1.5],
    [15, 2.5],
    [24, 4],
    [36, 7],
    [48, 11],
    [70, 14],
  ],
  TE: [
    [3, 3.5],
    [6, 5],
    [10, 7],
    [15, 10],
    [20, 14],
  ],
  QB: [
    [6, 6],
    [12, 10],
    [18, 13],
    [24, 15],
  ],
};

/**
 * Bonus rounds added to equity for players at scarce positions. Captures the
 * fact that TE and QB starters are much harder to find than RB/WR depth.
 */
const SCARCITY_BONUS: Record<string, Array<[number, number]>> = {
  TE: [
    [3, 3],
    [6, 2],
    [10, 1.5],
    [14, 1],
  ],
  QB: [
    [6, 1.5],
    [12, 1],
    [18, 0.5],
  ],
  RB: [],
  WR: [],
};

const TIER_HALF_LIFE: Record<string, number> = {
  RB: 18,
  WR: 18,
  TE: 8,
  QB: 12,
};

function lookup(
  table: Array<[number, number]>,
  posRank: number,
  fallback: number,
): number {
  for (const [maxRank, value] of table) {
    if (posRank <= maxRank) return value;
  }
  return fallback;
}

/**
 * Tier weight on (0.15..1.0]. Top of position is worth the most; depth tier
 * is heavily discounted. This is what stops a "barely-startable" RB30 from
 * out-scoring a real RB5 just because the equity arithmetic looks similar.
 */
function tierWeight(posRank: number, position: string): number {
  const hl = TIER_HALF_LIFE[position] ?? 18;
  return Math.max(0.15, 1 - (posRank - 1) / (2.2 * hl));
}

/**
 * Loose fallback when we don't have a positional rank. Maps overall PPR
 * rank to a rough position rank based on typical PPR rank density per
 * position. Only used when posRank wasn't provided.
 */
function approxPosRank(overallRank: number, position: string): number {
  const factor: Record<string, number> = {
    QB: 0.13,
    TE: 0.12,
    RB: 0.45,
    WR: 0.45,
  };
  return Math.max(1, Math.round(overallRank * (factor[position] ?? 0.45)));
}

/**
 * Value score for the Keeper Helper table.
 *
 * Components:
 *   - market round approximated from POSITIONAL rank (not overall PPR)
 *   - equity = keeperRound - market (positive = below market = good keep)
 *   - tier weight pulls down depth-tier players even if their equity looks fat
 *   - scarcity bonus rewards top-of-position TE / QB given how thin those
 *     positions get in 12-team drafts
 *
 * Score = (equity + scarcityBonus) * tierWeight
 */
export function computeValueScore(
  pprRank: number | null,
  keeperCost: number | null,
  position?: string,
  posRank?: number | null,
): number | null {
  if (pprRank == null || keeperCost == null) return null;
  const pos = position ?? "WR";
  const effectivePosRank = posRank ?? approxPosRank(pprRank, pos);
  const market = lookup(MARKET_ROUND_TABLE[pos] ?? MARKET_ROUND_TABLE.WR, effectivePosRank, 17);
  const equity = keeperCost - market;
  const bonus = lookup(SCARCITY_BONUS[pos] ?? [], effectivePosRank, 0);
  const weight = tierWeight(effectivePosRank, pos);
  return (equity + bonus) * weight;
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

/**
 * Build a (playerId → positional rank) map by sorting all players in a pool
 * by overall PPR rank within each position.
 */
function buildPositionalRanks(
  pool: Array<{ playerId: string; position: string; pprRank: number | null }>,
): Map<string, number> {
  const byPos = new Map<string, typeof pool>();
  for (const p of pool) {
    if (p.pprRank == null) continue;
    if (!byPos.has(p.position)) byPos.set(p.position, []);
    byPos.get(p.position)!.push(p);
  }
  const out = new Map<string, number>();
  byPos.forEach((arr) => {
    arr.sort((a, b) => (a.pprRank ?? 9999) - (b.pprRank ?? 9999));
    arr.forEach((p, idx) => out.set(p.playerId, idx + 1));
  });
  return out;
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
        // valueScore is filled in a second pass below, once we know each
        // player's positional rank across the full pool.
        valueScore: null,
        posRank: null,
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
      posRank: null,
      valueScore: null,
    });
  });

  // Second pass — now that we have every player, compute positional rank
  // across the whole pool and refresh the value score for every rostered
  // player using that positional rank.
  const posRanks = buildPositionalRanks(rows);
  rows.forEach((r) => {
    r.posRank = posRanks.get(r.playerId) ?? null;
    if (r.rosterId >= 0) {
      r.valueScore = computeValueScore(
        r.pprRank,
        r.keeperRound,
        r.position,
        r.posRank,
      );
    }
  });

  return { rows, teams, history, keeperCostByPid, prevRosterByPid };
}
