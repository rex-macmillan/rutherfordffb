/**
 * Replay previous-season transactions to determine each player's keeper cost
 * basis (draft round, FAAB tier, or free agent).
 *
 * Rules:
 *  - Process transactions chronologically (week, then created timestamp).
 *  - The most recent waiver / free-agent add wins until the player is dropped.
 *  - Drops clear waiver / free-agent basis; draft basis survives a drop (§6 trades
 *    don't reset cost — a traded player keeps their draft basis).
 *  - Waiver / free-agent re-acquisition overwrites a prior draft basis.
 *  - Trade adds never change basis.
 */

import type { DraftPick, SleeperTransaction } from "./sleeperApi";
import {
  calculateKeeperRound,
  FREE_AGENT_KEEPER_ROUND,
  keeperRoundFromFaab,
} from "./keeperCostTable";

export type AcquisitionBasis =
  | { kind: "draft"; round: number }
  | { kind: "waiver"; faab: number }
  | { kind: "free_agent" };

/** Keeper round implied by the final acquisition basis after replay. */
export function keeperRoundFromBasis(
  basis: AcquisitionBasis | undefined,
): number {
  if (!basis) return FREE_AGENT_KEEPER_ROUND;
  if (basis.kind === "draft") return calculateKeeperRound(basis.round);
  if (basis.kind === "waiver") return keeperRoundFromFaab(basis.faab);
  return FREE_AGENT_KEEPER_ROUND;
}

function sortTransactions(txs: SleeperTransaction[]): SleeperTransaction[] {
  return [...txs]
    .filter((t) => t.status === "complete")
    .sort((a, b) => {
      const weekA = a.leg ?? 0;
      const weekB = b.leg ?? 0;
      if (weekA !== weekB) return weekA - weekB;
      return (a.created ?? 0) - (b.created ?? 0);
    });
}

/**
 * Build playerId → acquisition basis for the season by replaying draft picks
 * and weekly transactions.
 */
export function buildPlayerAcquisitionBasis(
  draftPicks: Pick<DraftPick, "player_id" | "round">[],
  transactions: SleeperTransaction[],
): Map<string, AcquisitionBasis> {
  const basis = new Map<string, AcquisitionBasis>();

  draftPicks.forEach((p) => {
    if (p.player_id) {
      basis.set(p.player_id, { kind: "draft", round: p.round });
    }
  });

  for (const tx of sortTransactions(transactions)) {
    if (tx.drops) {
      for (const playerId of Object.keys(tx.drops)) {
        const current = basis.get(playerId);
        if (current?.kind === "waiver" || current?.kind === "free_agent") {
          basis.delete(playerId);
        }
      }
    }

    if (!tx.adds) continue;

    for (const playerId of Object.keys(tx.adds)) {
      if (tx.type === "waiver") {
        basis.set(playerId, {
          kind: "waiver",
          faab: tx.settings?.waiver_bid ?? 0,
        });
      } else if (tx.type === "free_agent") {
        basis.set(playerId, { kind: "free_agent" });
      }
      // trade adds: intentionally no-op — in-season trades don't change cost
    }
  }

  return basis;
}
