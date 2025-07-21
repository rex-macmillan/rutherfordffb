import { useState, useEffect } from "react";
import PlayerTable from "../components/PlayerTable";
import filterStyles from "../components/Filters.module.css";
import KeeperSidebar from "../components/KeeperSidebar";
import DraftDeltaSidebar from "../components/DraftDeltaSidebar";
import {
  calculateKeeperRound,
  getDraftPicks,
  getLeague,
  getLeagueDrafts,
  getRosters,
  getLeagueUsers,
  getPlayers,
  getUserByUsername,
  getNFLState,
  getUserLeagues,
  DraftPick,
  getTradedPicks,
  getFCRanks,
} from "../utils/sleeper";

interface PlayerRow {
  playerId: string;
  name: string;
  currentTeam: string;
  previousTeam: string;
  teamAbbr: string;
  position: string;
  round: number | null;
  pickNo: number | null;
  draftRank: number; // for precise sorting
  keeperRound: number | null;
  adjustedRound?: number | null;
  prevKeeper?: boolean;
  starReason?: string;
  rosterId: number;
  pprRank: number | null;
  valueScore?: number | null;
}

type Position = string;

interface TeamOption {
  rosterId: number;
  teamName: string;
}

export default function HomePage() {
  const [username, setUsername] = useState<string>("rex-macmillan");
  const [season, setSeason] = useState<string>("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedRoster, setSelectedRoster] = useState<number | "all">("all");
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPos, setSelectedPos] = useState<Position | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeepers,setSelectedKeepers]=useState<Set<string>>(new Set());
  const [savedKeepers,setSavedKeepers]=useState<Set<string>>(new Set());
  const [leagueName, setLeagueName] = useState<string>("");
  const [leagueId,setLeagueId]=useState<string>("");
  interface DeltaInfo { extra: string[]; missing: string[] }
  const [draftDelta, setDraftDelta] = useState<Record<number, DeltaInfo>>({});
  const [showDraftDetails, setShowDraftDetails] = useState(false);

  // Auto-load on first render
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!username) {
        throw new Error("Please enter your Sleeper username");
      }

      // 1. Get userId
      const user = await getUserByUsername(username);

      // 2. Determine current season via `/state/nfl`
      const state = await getNFLState();
      const seasonYear = state.league_season;
      setSeason(seasonYear);

      // 3. Fetch leagues for user in current season
      const userLeagues = await getUserLeagues(user.user_id, seasonYear);
      if (!userLeagues.length) {
        throw new Error("No leagues found for that user in the current season");
      }

      // For now, take the first league
      const league = userLeagues[0];
      setLeagueName(league.name || "");

      if (!league.previous_league_id) {
        throw new Error("previous_league_id not available for selected league");
      }

      const currentLeagueId = league.league_id;
      setLeagueId(currentLeagueId);
      const prevLeagueId = league.previous_league_id;

      // Fetch previous league's draft picks
      const drafts = await getLeagueDrafts(prevLeagueId);
      if (!drafts.length) {
        throw new Error("Previous league draft not found");
      }
      const draftPicks = await getDraftPicks(drafts[0].draft_id);
      // Map playerId -> round and pickNo
      const roundMap = new Map<string, number>();
      const pickNoMap = new Map<string, number>();
      const prevKeeperSet = new Set<string>();
      const prevRosterMap = new Map<string, number>(); // playerId -> prev roster
      draftPicks.forEach((p) => {
        roundMap.set(p.player_id, p.round);
        pickNoMap.set(p.player_id, p.pick_no ?? 0);
        if (p.is_keeper) prevKeeperSet.add(p.player_id);
        prevRosterMap.set(p.player_id, p.roster_id);
      });

      // -------- Build historical draft chain to compute keeper costs --------
      interface HistInfo { base: number | null; streak: number; lastKeeper: boolean }
      const infoMap = new Map<string, HistInfo>();

      const seasonDrafts: DraftPick[][] = [];

      let chainLeagueId: string | undefined = prevLeagueId;
      let depth = 0;
      const MAX_DEPTH = 5;
      while (chainLeagueId && depth < MAX_DEPTH) {
        const chainDrafts = await getLeagueDrafts(chainLeagueId);
        if (chainDrafts.length) {
          const chainPicks = await getDraftPicks(chainDrafts[0].draft_id);
          seasonDrafts.unshift(chainPicks); // oldest first
        }
        const chainLeague = await getLeague(chainLeagueId);
        chainLeagueId = chainLeague.previous_league_id;
        depth += 1;
      }

      // Aggregate info per player across seasons
      for (const picks of seasonDrafts) {
        for (const pick of picks) {
          const curr = infoMap.get(pick.player_id) || { base: null, streak: 0, lastKeeper: false };
          if (curr.base === null) {
            if (!pick.is_keeper) {
              curr.base = pick.round;
              curr.streak = 0;
              curr.lastKeeper = false;
            }
          } else {
            if (pick.is_keeper) {
              curr.streak += 1;
              curr.lastKeeper = true;
            } else {
              curr.base = pick.round;
              curr.streak = 0;
              curr.lastKeeper = false;
            }
          }
          infoMap.set(pick.player_id, curr);
        }
      }

      // Compute final keeper cost map
      const keeperCostMap = new Map<string, number>();
      infoMap.forEach((info, pid) => {
        if (info.base == null) return;
        let cost = info.base;
        for (let i = 0; i < info.streak + 1; i++) {
          cost = calculateKeeperRound(cost);
        }
        keeperCostMap.set(pid, cost);
      });

      // Fetch previous league users & rosters to map roster_id -> team name
      const [prevRosters, prevUsers] = await Promise.all([
        getRosters(prevLeagueId),
        getLeagueUsers(prevLeagueId),
      ]);

      const prevOwnerToName = new Map<string, string>();
      prevUsers.forEach((u) => {
        const name = u.metadata?.team_name || u.display_name || "Unknown";
        prevOwnerToName.set(u.user_id, name);
      });
      const prevRosterIdToTeam = new Map<number, string>();
      prevRosters.forEach((r) => {
        const tName = prevOwnerToName.get(r.owner_id) || `Team ${r.roster_id}`;
        prevRosterIdToTeam.set(r.roster_id, tName);
      });

      // get rosters and users for current season
      const [rosters, users, playersMeta, tradedPicks, fcRanks] = await Promise.all([
        getRosters(currentLeagueId),
        getLeagueUsers(currentLeagueId),
        getPlayers(),
        getTradedPicks(currentLeagueId),
        getFCRanks(),
      ]);

      // Build rosterId -> teamName map
      const ownerToName = new Map<string, string>();
      users.forEach((u) => {
        const name = u.metadata?.team_name || u.display_name || "Unknown";
        ownerToName.set(u.user_id, name);
      });
      const rosterIdToTeam = new Map<number, string>();
      rosters.forEach((r) => {
        const teamName = ownerToName.get(r.owner_id) || `Team ${r.roster_id}`;
        rosterIdToTeam.set(r.roster_id, teamName);
      });

      // Prepare team options
      const teamOptions: TeamOption[] = Array.from(rosterIdToTeam.entries()).map(
        ([rosterId, teamName]) => ({ rosterId, teamName }),
      );
      setTeams(teamOptions);

      // --- compute draft deltas ---
      const deltaMap: Record<number, Record<number, number>> = {};
      const maxRound = 17;
      // Maximum rank we consider when normalizing PPR values
      const MAX_PPR_RANK = 200;

      // Compute a value score that rewards highly-ranked players that can be
      // kept in later (higher-numbered) rounds and penalises low-ranked
      // players that would cost early picks. The score is normalised to the
      // range ‑1 (worst) to +1 (best).
      const computeValueScore = (rank: number | null, keeperCost: number | null, position?: string): number | null => {
        if (rank == null || keeperCost == null) return null;
        // 1  → best rank, 0  → worst rank considered
        const rankNorm = (MAX_PPR_RANK - Math.min(rank, MAX_PPR_RANK) + 1) / MAX_PPR_RANK;
        // 1  → cheapest pick (late round), 0 → most expensive (round 1)
        const roundNorm = (keeperCost - 1) / (maxRound - 1);
        // Base score scaled for legibility
        let score = (keeperCost - (rank)/12) * ((200-rank+50)/200);
        // Quarterbacks get a 0.75 multiplier
        if (position === "QB") score *= 0.75;
        return score;
      };
      rosters.forEach((r) => {
        deltaMap[r.roster_id] = {};
        for (let rd = 1; rd <= maxRound; rd++) deltaMap[r.roster_id][rd] = 1;
      });
      tradedPicks.forEach((tp) => {
        if (tp.season !== seasonYear) return;
        // original owner loses
        if (deltaMap[tp.roster_id]) deltaMap[tp.roster_id][tp.round] -= 1;
        // new owner gains
        if (deltaMap[tp.owner_id]) deltaMap[tp.owner_id][tp.round] += 1;
      });
      const summary: Record<number, DeltaInfo> = {};
      Object.entries(deltaMap).forEach(([ridStr, rounds]) => {
        const extraArr: string[] = [];
        const missingArr: string[] = [];
        Object.entries(rounds).forEach(([rStr, cnt]) => {
          const r = parseInt(rStr);
          const c = cnt as number;
          if (c > 1) {
            for (let i = 0; i < c - 1; i++) extraArr.push(`R${r}`);
          }
          else if (c === 0) missingArr.push(`R${r}`);
        });
        summary[parseInt(ridStr)] = { extra: extraArr, missing: missingArr };
      });
      setDraftDelta(summary);

      // Collect players across all rosters (skip DEF)
      const rows: PlayerRow[] = [];
      rosters.forEach((r) => {
        r.players.forEach((pid) => {
          const playerMeta = playersMeta[pid] || {};
          let fullName = playerMeta.full_name || `${playerMeta.first_name || ""} ${playerMeta.last_name || ""}`.trim();
          if ((playerMeta as any).years_exp === 0) fullName += " (R)";
          let pos = "N/A";
          const fp = (playerMeta as any).fantasy_positions;
          if (Array.isArray(fp) && fp.length) {
            const priority = ["QB","RB","WR","TE"];
            const found = priority.find((pr)=> fp.includes(pr));
            pos = found || fp[0];
          } else if (playerMeta.position) {
            pos = ["QB","RB","WR","TE"].includes(playerMeta.position) ? playerMeta.position : "WR";
          }
          if (pos === "DEF" || pos === "K") return; // exclude DEF and Kickers
          const roundVal = roundMap.get(pid) ?? null;
          const infoObj = infoMap.get(pid);
          const baseRoundRef = infoObj?.base ?? roundVal;
          const baseCost = calculateKeeperRound(baseRoundRef);
          const cp = keeperCostMap.get(pid);
          let keeperCost: number;
          let prevCost: number;
          if (typeof cp === "number" || cp === undefined) {
            keeperCost = cp ?? baseCost;
            prevCost = baseCost;
          } else {
            // when map stores object (if future change)
            keeperCost = (cp as any).current ?? baseCost;
            prevCost = (cp as any).previous ?? baseCost;
          }
          if (roundVal == null) { // undrafted previous season
            keeperCost = 6;
            prevCost = 6;
          }
          const pickNoVal = pickNoMap.get(pid) ?? null;
          const draftRank = roundVal == null ? Number.POSITIVE_INFINITY : roundVal * 100 + (pickNoVal ?? 0);
          const valueScore = computeValueScore(fcRanks.get(pid) ?? null, keeperCost, pos);
          rows.push({
            playerId: pid,
            name: fullName || pid,
            currentTeam: rosterIdToTeam.get(r.roster_id) || "",
            previousTeam: prevRosterIdToTeam.get(prevRosterMap.get(pid) || -1) || "",
            position: pos,
            teamAbbr: playerMeta.team || "",
            round: roundVal,
            pickNo: pickNoVal,
            draftRank,
            keeperRound: keeperCost,
            pprRank: fcRanks.get(pid) ?? null,
            adjustedRound: null,
            prevKeeper: (infoObj?.lastKeeper ?? false) && calculateKeeperRound(roundVal) !== keeperCost,
            starReason: (infoObj?.lastKeeper ?? false) && calculateKeeperRound(roundVal) !== keeperCost ? `Keeper cost advanced due to consecutive keeps (was ${calculateKeeperRound(roundVal)}, now ${keeperCost})` : undefined,
            rosterId: r.roster_id,
            valueScore,
          });
        });
      });

      // include top 300 PPR not already present
      const existing = new Set(rows.map(r=>r.playerId));
      fcRanks.forEach((rank, pid)=>{
        if(rank<=200 && !existing.has(pid)){
          const meta:any = playersMeta[pid] || {};
          let fullName = meta.full_name || `${meta.first_name||""} ${meta.last_name||""}`.trim();
          if ((meta as any).years_exp === 0) fullName += " (R)";
          let pos;
          if (Array.isArray(meta.fantasy_positions) && meta.fantasy_positions.length) {
            const priority = ["QB","RB","WR","TE"];
            const found = priority.find((p)=>(meta.fantasy_positions as any).includes(p));
            pos = found || (meta.fantasy_positions as any)[0];
          } else if (meta.position) {
            pos = ["QB","RB","WR","TE"].includes(meta.position)? meta.position : "WR";
          } else {
            pos="WR";
          }
          if(pos==='DEF'||pos==='K') return;
          // Free-agent players do not have an immediate keeper cost, so no value score.
          const valueScore: number | null = null;
          rows.push({
            playerId: pid,
            name: fullName||pid,
            currentTeam: "",
            previousTeam: "",
            position: pos,
            teamAbbr: meta.team || (meta as any).maybeTeam || "",
            round: null,
            pickNo: null,
            draftRank: Number.POSITIVE_INFINITY,
            keeperRound: null,
            adjustedRound: null,
            prevKeeper: false,
            starReason: undefined,
            rosterId: -1,
            pprRank: rank,
            valueScore,
          });
        }
      });

      setPlayers(rows);

      // restore saved keepers (support legacy array or new object with slots)
      const savedRaw=localStorage.getItem(`keepers-${currentLeagueId}`);
      if(savedRaw){
        try{
          const parsed = JSON.parse(savedRaw);
          let arr:string[]=[];
          if(Array.isArray(parsed)) arr = parsed as string[];
          else if(parsed && Array.isArray(parsed.ids)) arr = parsed.ids as string[];
          const s=new Set(arr);
          setSelectedKeepers(new Set(s));
          setSavedKeepers(new Set(s));
        }catch{}
      }else setSelectedKeepers(new Set());

      // derive positions list
      const uniquePos = Array.from(new Set(rows.map((p) => p.position))).sort();
      setPositions(uniquePos);
      setSelectedPos("all");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredByTeam = selectedRoster === "all" ? players : players.filter((p) => p.rosterId === selectedRoster);
  const filteredPlayers = selectedPos === "all" ? filteredByTeam : filteredByTeam.filter((p) => p.position === selectedPos);

  // ---- helper to compute adjusted keeper slots (mirrors PlayerTable logic) ----
  const computeAdjustedSlots = (): Map<string, number> => {
    const selectedPlayers = players.filter(p => selectedKeepers.has(p.playerId));
    selectedPlayers.sort((a,b)=> (a.keeperRound??99)-(b.keeperRound??99));

    const missingSets: Record<number, Set<number>> = {};
    Object.entries(draftDelta).forEach(([ridStr, d])=>{
      const rid = parseInt(ridStr);
      missingSets[rid] = new Set(d.missing.map(s=> parseInt(s.slice(1))));
    });

    const taken = new Set<string>();
    const key = (rid:number, rd:number)=>`${rid}-${rd}`;
    const isUnavailable = (rid:number, rd:number)=> taken.has(key(rid,rd)) || (missingSets[rid]?.has(rd) ?? false);

    const map = new Map<string,number>();
    for(const p of selectedPlayers){
      if(p.keeperRound==null) continue;
      const rid = p.rosterId;
      let desired = p.keeperRound;

      if(isUnavailable(rid, desired)){
        const missingInDesired = missingSets[rid]?.has(desired) ?? false;
        if(missingInDesired){
          let earlier = desired-1;
          while(earlier>=1 && isUnavailable(rid, earlier)) earlier-=1;
          if(earlier>=1 && !isUnavailable(rid, earlier)) desired = earlier;
          else {
            let later = desired+1;
            while(isUnavailable(rid, later)) later+=1;
            desired = later;
          }
        }else{
          let later = desired+1;
          while(isUnavailable(rid, later)) later+=1;
          desired = later;
        }
      }

      map.set(p.playerId, desired);
      taken.add(key(rid, desired));
    }
    return map;
  };

  return (
    <main style={{ padding: "2rem" }}>
      <KeeperSidebar />
      <h1>{leagueName ? `${leagueName} - Keeper Helper` : "Keeper Helper"}</h1>
      {/* Username input hidden for now (hardcoded rex-macmillan) */}
      {(teams.length > 0 || positions.length > 0) && (
        <div className={filterStyles.filtersRow}>
          {teams.length > 0 && (
            <div className={filterStyles.inputGroup}>
              <label>
                Team
                <select
                  className={filterStyles.select}
                  value={selectedRoster}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedRoster(val === "all" ? "all" : parseInt(val));
                  }}
                >
                  <option value="all">All</option>
                  {teams.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {positions.length > 0 && (
            <div className={filterStyles.inputGroup}>
              <label>
                Position
                <select
                  className={filterStyles.select}
                  value={selectedPos}
                  onChange={(e) => setSelectedPos(e.target.value as Position | "all")}
                >
                  <option value="all">All</option>
                  {positions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}
      <div className={filterStyles.filtersRow} style={{marginTop:"0.5rem"}}>
        <label style={{fontSize:"0.85rem"}}>
          <input type="checkbox" checked={showDraftDetails} onChange={e=>setShowDraftDetails(e.target.checked)} /> Show Previous Draft Details
        </label>
      </div>
      {/* Draft delta sidebar */}
      <DraftDeltaSidebar teams={teams} deltas={draftDelta} />
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {filteredPlayers.length > 0 && (
        <>
          <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.5rem", textAlign: "right" }}>
            PPR rankings sourced from <a href="https://fantasycalc.com" target="_blank" rel="noreferrer">FantasyCalc.com</a>
          </p>
          <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.5rem", textAlign: "right" }}>
            Value is an algorithm created by <a href="https://twitter.com/rexmacmillan" target="_blank" rel="noreferrer">Rex MacMillan</a>
          </p>
          <PlayerTable 
            players={filteredPlayers}
            selected={selectedKeepers}
            onSelectionChange={(set)=>setSelectedKeepers(new Set(set))}
            missing={Object.fromEntries(Object.entries(draftDelta).map(([rid, d])=>[rid, d.missing.map(s=>parseInt(s.slice(1)))]))}
            showDraftDetails={showDraftDetails}
          />
          <div style={{position:"fixed", right:"1.5rem", bottom:"1.5rem", display:"flex", gap:"0.5rem", zIndex:200}}>
            {(!areSetsEqual(selectedKeepers,savedKeepers) || selectedKeepers.size>0) && (
            <>
            {!areSetsEqual(selectedKeepers,savedKeepers) && (
            <button disabled={!leagueId}
              style={{padding:"0.5rem 1rem",border:"none",borderRadius:"6px",background:"#16a34a",color:"#fff",cursor: leagueId?"pointer":"not-allowed"}}
              onClick={()=>{
                if(!leagueId) return;
                const slotMap = computeAdjustedSlots();
                const data = { ids: Array.from(selectedKeepers), slots: Object.fromEntries(slotMap) };
                localStorage.setItem(`keepers-${leagueId}`, JSON.stringify(data));
                setSavedKeepers(new Set(selectedKeepers));
              }}>
              Save Keepers
            </button>
            )}
            {selectedKeepers.size>0 && (
            <button disabled={!leagueId}
              style={{padding:"0.5rem 1rem",border:"none",borderRadius:"6px",background:"#dc2626",color:"#fff",cursor: leagueId?"pointer":"not-allowed"}}
              onClick={()=>{ if(!leagueId) return; localStorage.removeItem(`keepers-${leagueId}`);setSelectedKeepers(new Set());setSavedKeepers(new Set());}}>
              Clear
            </button>
            )}
            </>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function areSetsEqual(a:Set<string>,b:Set<string>){
  if(a.size!==b.size) return false;
  let same=true;
  a.forEach(v=>{ if(!b.has(v)) same=false; });
  return same;
} 