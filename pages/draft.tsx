import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import DraftBoard from "../components/DraftBoard";
import { CountdownBanner } from "../components/CountdownBanner";
import { DraftRecap } from "../components/DraftRecap";
import { usePanelTabs } from "../components/LeaguePanel";
import { KeeperRulesPanel } from "../components/panels/KeeperRulesPanel";
import { KeepersListPanel } from "../components/panels/KeepersListPanel";
import { BestAvailablePanel } from "../components/panels/BestAvailablePanel";
import { Skeleton } from "../components/ui/Skeleton";
import { Avatar } from "../components/ui/Avatar";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { findMyRosterId, useCurrentLeague } from "../lib/leagueHooks";
import { useIdentity } from "../lib/identity";
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
import { cn } from "../lib/cn";

const POSITION_PRIORITY = ["QB", "RB", "WR", "TE"] as const;

type DraftTab = "board" | "order" | "recap";

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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function DraftCenterPage() {
  const router = useRouter();
  const { username } = useIdentity();
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

  // ----- Tab state, synced with ?tab= so links deep-link correctly -----
  const [tab, setTab] = useState<DraftTab>("board");
  useEffect(() => {
    if (!router.isReady) return;
    const t = router.query.tab;
    if (t === "board" || t === "order" || t === "recap") setTab(t);
  }, [router.isReady, router.query.tab]);

  const switchTab = (t: DraftTab) => {
    setTab(t);
    router.replace(
      { pathname: "/draft", query: t === "board" ? {} : { tab: t } },
      undefined,
      { shallow: true },
    );
  };

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
      slotForRoster,
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

  const mySlot = useMemo(() => {
    if (!board || !rostersQ.data || !usersQ.data) return null;
    const rid = findMyRosterId(usersQ.data, rostersQ.data, username);
    return rid != null ? board.slotForRoster[rid] ?? null : null;
  }, [board, rostersQ.data, usersQ.data, username]);

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

  // "recap" is only a valid tab once the draft is complete.
  const activeTab: DraftTab = tab === "recap" && !draftComplete ? "board" : tab;

  const tabs: { key: DraftTab; label: string }[] = [
    { key: "board", label: "Board" },
    { key: "order", label: "Order" },
    ...(draftComplete ? [{ key: "recap" as DraftTab, label: "Recap" }] : []),
  ];

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Draft</h1>
        <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1 shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              aria-pressed={activeTab === t.key}
              className={cn(
                "min-h-10 rounded-lg px-4 text-sm font-medium transition-colors",
                activeTab === t.key
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "board" && (
        <>
          {board.slotsProvisional && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {board.slotSource === "selection" ? (
                <>
                  Provisional board — the draft order isn&apos;t set in Sleeper yet,
                  so slots default to the{" "}
                  <button
                    type="button"
                    onClick={() => switchTab("order")}
                    className="font-medium underline"
                  >
                    slot-selection order
                  </button>{" "}
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border border-emerald-200 bg-emerald-50" />
              Keeper
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border border-amber-200 bg-amber-50" />
              Traded pick
            </span>
            {mySlot != null && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-brand-200 bg-brand-50" />
                Your column
              </span>
            )}
          </div>

          <DraftBoard
            slots={board.slotNumbers}
            teams={[]}
            picksByRound={board.grid}
            maxRound={MAX_DRAFT_ROUND}
            rosterIdToName={board.idToName}
            highlightSlot={mySlot}
          />
        </>
      )}

      {activeTab === "order" && <OrderTab />}

      {activeTab === "recap" && draftComplete && season && (
        <DraftRecap season={season} picks={recapPicks} />
      )}
    </div>
  );
}

/** Slot-selection order — the old /draft-order page, now a Draft tab. */
function OrderTab() {
  const { rows, seasonLabel, isLoading, error } = useDraftSelectionOrder();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">
        Order in which managers select their draft slot, based on{" "}
        {seasonLabel || "the previous season"}&apos;s final standings. Per{" "}
        <Link href="/rules#4-draft-order-slot-selection" className="text-brand-700 underline">
          §4 of the rulebook
        </Link>
        , the worst-finishing teams pick first.
      </p>

      {error && (
        <Card>
          <CardBody className="text-sm text-red-700">{error.message}</CardBody>
        </Card>
      )}

      {rows.length === 0 && !isLoading && !error && (
        <Card>
          <CardBody className="text-sm text-ink-700">
            No completed bracket data found yet for the previous season.
          </CardBody>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selection order</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="relative scroll-x-fade">
              <div className="scroll-x no-scrollbar overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Pick</th>
                      <th className="px-3 py-2 text-left">Finished</th>
                      <th className="px-3 py-2 text-left">Team</th>
                      <th className="px-3 py-2 text-right">Pts For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.rosterId}
                        className={cn(
                          "border-t border-ink-100",
                          r.selectionOrder === 1 && "bg-brand-50/40",
                        )}
                      >
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                              r.selectionOrder === 1
                                ? "bg-brand-600 text-white"
                                : "bg-ink-100 text-ink-700",
                            )}
                          >
                            {r.selectionOrder}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-ink-700">
                          {ordinal(r.place)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar avatarId={r.avatarId} alt={r.teamName} size={28} />
                            <div className="min-w-0">
                              <div className="font-medium">{r.teamName}</div>
                              {r.managerName && r.managerName !== r.teamName && (
                                <div className="text-xs text-ink-500">{r.managerName}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-700">
                          {r.pointsFor.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How this works</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-ink-700">
          <p>
            The selection sequence is hard-wired:{" "}
            <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">
              7 → 8 → 9 → 10 → 11 → 12 → 5 → 6 → 3 → 4 → 2 → 1
            </code>
            . The number is the team&apos;s previous-season final place. So the
            7th-place team picks their preferred slot first; the champion picks
            last.
          </p>
          <p>
            Slot selection happens <strong>before keepers lock</strong> — when
            you keep a player, their round cost consumes your pick in the slot
            you chose (e.g. you chose slot 4 and keep a 4th-rounder → that
            player occupies pick 4.04).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
