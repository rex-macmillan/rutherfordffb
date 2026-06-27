import { useMemo } from "react";
import Link from "next/link";
import DraftBoard from "../components/DraftBoard";
import { CountdownBanner } from "../components/CountdownBanner";
import { DraftRecap } from "../components/DraftRecap";
import { usePanelTabs } from "../components/LeaguePanel";
import { KeeperRulesPanel } from "../components/panels/KeeperRulesPanel";
import { KeepersListPanel } from "../components/panels/KeepersListPanel";
import { BestAvailablePanel } from "../components/panels/BestAvailablePanel";
import { Skeleton } from "../components/ui/Skeleton";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { useCurrentLeague } from "../lib/leagueHooks";
import {
  useDraft,
  useDraftPicks,
  useFCRanks,
  useLeagueDrafts,
  useLeagueChainDraftPicks,
  useLeagueUsers,
  usePlayers,
  useRosters,
  useTradedPicks,
} from "../lib/sleeperQueries";
import { useLeagueKeepers } from "../lib/leagueState";
import { useDraftSelectionOrder } from "../lib/draftOrder";
import { resolveDraftSlotMap } from "../lib/draftSlots";
import {
  assignKeeperSlots,
  buildKeeperCostMap,
  buildKeeperHistory,
  computeDraftDeltas,
  KeeperCandidate,
  MAX_DRAFT_ROUND,
  missingByRosterFromDeltas,
  UNDRAFTED_KEEPER_ROUND,
} from "../lib/keepers";
import { LeagueUser, SleeperPlayer } from "../lib/sleeperApi";

const POSITION_PRIORITY = ["QB", "RB", "WR", "TE"] as const;

function preferredPosition(meta: SleeperPlayer | undefined): string {
  if (!meta) return "WR";
  const fp = meta.fantasy_positions;
  if (Array.isArray(fp) && fp.length) {
    const found = POSITION_PRIORITY.find((p) => fp.includes(p));
    return found ?? fp[0];
  }
  return meta.position || "WR";
}

function playerName(meta: SleeperPlayer | undefined, pid: string) {
  return (
    meta?.full_name ||
    `${meta?.first_name ?? ""} ${meta?.last_name ?? ""}`.trim() ||
    pid
  );
}

function teamNameByOwner(users: LeagueUser[]): Record<string, string> {
  const out: Record<string, string> = {};
  users.forEach((u) => {
    out[u.user_id] = u.metadata?.team_name || u.display_name || "";
  });
  return out;
}

export default function DraftBoardPage() {
  const { league, season } = useCurrentLeague();
  const leagueId = league?.league_id;

  const draftsQ = useLeagueDrafts(leagueId);
  const draftId = draftsQ.data?.[0]?.draft_id;
  const draftQ = useDraft(draftId);
  const livePicksQ = useDraftPicks(draftId);
  const rostersQ = useRosters(leagueId);
  const usersQ = useLeagueUsers(leagueId);
  const tradedQ = useTradedPicks(leagueId);
  const playersQ = usePlayers();
  const fcQ = useFCRanks();
  const chainQ = useLeagueChainDraftPicks(league?.previous_league_id);
  const selOrder = useDraftSelectionOrder();

  const { data: keeperData } = useLeagueKeepers(leagueId);

  const ready =
    !!league &&
    !!season &&
    !!draftQ.data &&
    !!rostersQ.data &&
    !!usersQ.data &&
    !!tradedQ.data &&
    !!playersQ.data &&
    !!fcQ.data &&
    !!chainQ.data;

  const board = useMemo(() => {
    if (!ready) return null;

    const sleeperSlotMap: Record<string, number> =
      (draftQ.data?.slot_to_roster_id as Record<string, number>) ||
      (draftQ.data?.draft_order as Record<string, number>) ||
      {};
    const rosterIds = rostersQ.data!.map((r) => r.roster_id);

    // Sleeper always returns a populated slot_to_roster_id (the identity/join
    // map before the order is set), so its presence means nothing. The order is
    // only OFFICIAL once draft_order is set (or the draft is underway/complete).
    const orderIsOfficial =
      draftQ.data?.draft_order != null ||
      draftQ.data?.status === "drafting" ||
      draftQ.data?.status === "complete";

    // When the order isn't official we'll default to the slot-selection order —
    // wait for it to load first so we don't flash the join-order fallback.
    if (!orderIsOfficial && selOrder.isLoading) return null;

    const {
      slotMap: finalSlotMap,
      provisional: slotsProvisional,
      source: slotSource,
    } = resolveDraftSlotMap({
      sleeperSlotMap,
      orderIsOfficial,
      selectionRows: selOrder.rows,
      rosterIds,
    });

    const slotNumbers = Object.keys(finalSlotMap)
      .map((n) => parseInt(n))
      .sort((a, b) => a - b);

    const ownerToName = teamNameByOwner(usersQ.data!);
    const idToName: Record<number, string> = {};
    rostersQ.data!.forEach((r) => {
      idToName[r.roster_id] = ownerToName[r.owner_id] || `Team ${r.roster_id}`;
    });

    const tradedKey = new Map<string, number>();
    tradedQ.data!.forEach((t) => {
      if (t.season === season) tradedKey.set(`${t.round}-${t.roster_id}`, t.owner_id);
    });

    const grid: Record<number, Record<number, any>> = {};
    for (let r = 1; r <= MAX_DRAFT_ROUND; r++) {
      grid[r] = {};
      slotNumbers.forEach((s) => {
        const rid = finalSlotMap[String(s)];
        const k = `${r}-${rid}`;
        if (tradedKey.has(k)) {
          grid[r][s] = {
            rosterId: tradedKey.get(k)!,
            traded: true,
            fromRosterId: rid,
          };
        } else {
          grid[r][s] = { rosterId: rid, traded: false };
        }
      });
    }

    const history = buildKeeperHistory(chainQ.data!);
    const costMap = buildKeeperCostMap(history);

    const pidToRosterId = new Map<string, number>();
    rostersQ.data!.forEach((r) =>
      r.players.forEach((pid) => pidToRosterId.set(pid, r.roster_id)),
    );

    const slotForRoster: Record<number, number> = {};
    Object.entries(finalSlotMap).forEach(([s, rid]) => {
      slotForRoster[rid as number] = parseInt(s);
    });

    const keeperCandidates: KeeperCandidate[] = [];
    keeperData.forEach((entry) => {
      entry.playerIds.forEach((pid) => {
        const rid = entry.rosterId >= 0 ? entry.rosterId : pidToRosterId.get(pid);
        if (rid == null) return;
        const placement = entry.slotOverrides[pid];
        keeperCandidates.push({
          playerId: pid,
          rosterId: rid,
          cost: costMap.get(pid) ?? UNDRAFTED_KEEPER_ROUND,
          placement,
        });
      });
    });

    const deltas = computeDraftDeltas(rosterIds, tradedQ.data!, season!);
    const missingByRoster = missingByRosterFromDeltas(deltas);

    const { slots: assignedSlots } = assignKeeperSlots(keeperCandidates, missingByRoster);

    keeperCandidates.forEach((k) => {
      const round = assignedSlots.get(k.playerId);
      if (round == null) return;
      const slot = slotForRoster[k.rosterId];
      const cell = grid[round]?.[slot];
      if (!cell) return;
      const meta = playersQ.data![k.playerId];
      grid[round][slot] = {
        ...cell,
        keeper: true,
        playerName: playerName(meta, k.playerId),
        position: preferredPosition(meta),
      };
    });

    const pidToRosterName = new Map<string, string>();
    rostersQ.data!.forEach((r) => {
      const teamName = idToName[r.roster_id];
      r.players.forEach((pid) => pidToRosterName.set(pid, teamName));
    });

    const keeperRows = keeperCandidates
      .map((k) => {
        const meta = playersQ.data![k.playerId];
        return {
          playerId: k.playerId,
          name: playerName(meta, k.playerId),
          position: preferredPosition(meta),
          roster: pidToRosterName.get(k.playerId) || "",
          rank: fcQ.data!.get(k.playerId) ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.rank - b.rank)
      .map(({ rank, ...rest }) => rest);

    const keeperIdSet = new Set(keeperCandidates.map((k) => k.playerId));
    const bestRows: {
      playerId: string;
      name: string;
      position: string;
      teamAbbr: string;
      rank: number;
    }[] = [];
    fcQ.data!.forEach((rank, pid) => {
      if (keeperIdSet.has(pid)) return;
      const meta = playersQ.data![pid];
      bestRows.push({
        playerId: pid,
        name: playerName(meta, pid),
        position: preferredPosition(meta),
        teamAbbr: meta?.team || "",
        rank,
      });
    });
    bestRows.sort((a, b) => a.rank - b.rank);

    return {
      slotNumbers,
      idToName,
      grid,
      keeperRows,
      bestRows,
      slotsProvisional,
      slotSource,
    };
  }, [
    ready,
    draftQ.data,
    rostersQ.data,
    usersQ.data,
    tradedQ.data,
    playersQ.data,
    fcQ.data,
    chainQ.data,
    keeperData,
    season,
    selOrder.rows,
    selOrder.isLoading,
  ]);

  const panelTabs = useMemo(() => {
    if (!board) return [];
    return [
      { id: "rules", label: "Rules", body: <KeeperRulesPanel /> },
      {
        id: "keepers",
        label: "Keepers",
        count: board.keeperRows.length,
        body: <KeepersListPanel players={board.keeperRows} />,
      },
      {
        id: "best",
        label: "Best Available",
        count: Math.min(200, board.bestRows.length),
        body: <BestAvailablePanel players={board.bestRows} />,
      },
    ];
  }, [board]);

  usePanelTabs(panelTabs);

  const draftComplete = draftQ.data?.status === "complete";
  const recapPicks = useMemo(() => {
    if (!draftComplete || !livePicksQ.data || !playersQ.data || !board) return [];
    return livePicksQ.data.map((p) => {
      const meta = playersQ.data![p.player_id];
      const name = playerName(meta, p.player_id);
      const teamName = board.idToName[p.roster_id] ?? `Team ${p.roster_id}`;
      return {
        pick: p.pick_no,
        round: p.round,
        team: teamName,
        player: name,
        position: preferredPosition(meta),
        pprRank: fcQ.data?.get(p.player_id) ?? null,
        isKeeper: !!p.is_keeper,
      };
    });
  }, [draftComplete, livePicksQ.data, playersQ.data, board, fcQ.data]);

  if (!ready || !board) {
    return (
      <div className="space-y-3">
        <CountdownBanner />
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CountdownBanner />
      {board.slotsProvisional && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {board.slotSource === "selection" ? (
            <>
              Provisional board — the draft order isn&apos;t set in Sleeper yet,
              so slots default to the{" "}
              <Link href="/draft-order" className="font-medium underline">
                slot-selection order
              </Link>{" "}
              (reverse standings; the first selector shows in slot 1). It updates
              automatically once the commissioner locks the order.
            </>
          ) : (
            <>
              Provisional board — the draft order isn&apos;t set in Sleeper and
              the previous season&apos;s standings aren&apos;t fully resolved, so
              slots fall back to roster order for now.
            </>
          )}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Draft Board</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DraftBoard
            slots={board.slotNumbers}
            teams={[]}
            picksByRound={board.grid}
            maxRound={MAX_DRAFT_ROUND}
            rosterIdToName={board.idToName}
          />
        </CardBody>
      </Card>

      {draftComplete && season && (
        <DraftRecap season={season} picks={recapPicks} />
      )}
    </div>
  );
}
