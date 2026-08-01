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
} from "./keepers";
import { overallPickNumber } from "./draftSlots";
import {
  AcquisitionBasis,
  keeperRoundFromBasis,
} from "./playerAcquisition";
import {
  KeeperGrade,
  computeKeeperSurplus,
  describeKeeperValue,
  gradeKeeperSurplus,
} from "./keeperValue";

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
  /** Overall pick number this player's keeper cost consumes. */
  keeperPickSlot?: number | null;
  /** Surplus in FantasyCalc points. Sort key behind the grade. */
  keeperSurplus?: number | null;
  /** Bucketed surplus — this is what the UI shows. */
  keeperGrade?: KeeperGrade | null;
  /** Tooltip sentence explaining the grade in picks. */
  keeperValueHint?: string;
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
  /** sleeperId → FantasyCalc value, for the keeper value model. */
  fcValues?: Map<string, number>;
  /** All FantasyCalc values, descending. Without it, grades stay null. */
  valueCurve?: number[];
  /**
   * rosterId → draft slot (1..teamCount). Drives the pick number a keeper
   * costs, which is what separates a 1.01 keeper from a 1.12 one. When absent
   * every team is assumed to pick mid-round.
   */
  draftSlotByRoster?: Map<number, number>;
  /** True while the draft order is still the provisional reverse-standings default. */
  slotsProvisional?: boolean;
  /** Snake drafts reverse on even rounds. */
  snakeDraft?: boolean;
  tradedPicks: TradedPick[];
  currentSeason: string;
  /** Replay of last season's draft + transactions for FAAB / FA cost. */
  acquisitionBasis?: Map<string, AcquisitionBasis>;
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
    fcValues,
    valueCurve,
    draftSlotByRoster,
    slotsProvisional = false,
    snakeDraft = true,
    acquisitionBasis,
    freeAgentRankCutoff = 200,
  } = input;

  const teamCount = currentRosters.length;
  // Without a known slot, assume the team picks mid-round — the least wrong
  // single guess, and it keeps grades available before the order is set.
  const slotFor = (rosterId: number) =>
    draftSlotByRoster?.get(rosterId) ?? Math.ceil(teamCount / 2);

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
      const basis = acquisitionBasis?.get(pid);
      const baseRoundRef = hist?.base ?? roundVal;
      const draftEscalated = keeperCostByPid.get(pid);
      const acquisitionOverridesDraft =
        basis?.kind === "waiver" || basis?.kind === "free_agent";

      let keeperCost: number;
      if (acquisitionOverridesDraft) {
        // Waiver / FA re-acquisition resets cost basis (§2 acquisition table).
        keeperCost = keeperRoundFromBasis(basis);
      } else if (draftEscalated != null) {
        keeperCost = draftEscalated;
      } else {
        keeperCost = keeperRoundFromBasis(basis);
      }

      const pickNoVal = pickNoMap.get(pid) ?? null;
      const draftRank =
        roundVal == null
          ? Number.POSITIVE_INFINITY
          : roundVal * 100 + (pickNoVal ?? 0);
      const baseCostFromRound = calculateKeeperRound(baseRoundRef);
      const escalatedDueToStreak =
        !acquisitionOverridesDraft &&
        (hist?.lastKeeper ?? false) &&
        baseCostFromRound !== keeperCost;

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
        // posRank and the keeper value fields are filled in a second pass
        // below, once every row exists.
        posRank: null,
        keeperPickSlot: null,
        keeperSurplus: null,
        keeperGrade: null,
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
      keeperPickSlot: null,
      keeperSurplus: null,
      keeperGrade: null,
    });
  });

  // Second pass — positional ranks need the whole pool to be present, and the
  // keeper value model needs each row's keeper cost, so both land here.
  const posRanks = buildPositionalRanks(rows);
  const topValue = valueCurve?.[0] ?? 0;
  rows.forEach((r) => {
    r.posRank = posRanks.get(r.playerId) ?? null;
    if (r.rosterId < 0 || r.keeperRound == null) return;
    if (!valueCurve?.length || !teamCount) return;

    const pickSlot = overallPickNumber(
      r.keeperRound,
      slotFor(r.rosterId),
      teamCount,
      snakeDraft,
    );
    r.keeperPickSlot = pickSlot;
    r.keeperSurplus = computeKeeperSurplus({
      playerValue: fcValues?.get(r.playerId) ?? null,
      playerRank: r.pprRank,
      pickSlot,
      valueCurve,
    });
    r.keeperGrade = gradeKeeperSurplus(r.keeperSurplus, topValue);
    r.keeperValueHint = describeKeeperValue({
      grade: r.keeperGrade,
      playerRank: r.pprRank,
      pickSlot,
      teamCount,
      provisionalSlot: slotsProvisional,
    });
  });

  return { rows, teams, history, keeperCostByPid, prevRosterByPid };
}
