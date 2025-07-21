import { useEffect, useState } from "react";
import {
  getUserByUsername,
  getNFLState,
  getUserLeagues,
  getLeagueDrafts,
  getDraftPicks,
  getDraft,
  getRosters,
  getTradedPicks,
  getLeague,
  getLeagueUsers,
  getPlayers,
  getFCRanks,
  calculateKeeperRound,
  DraftPick,
} from "../utils/sleeper";
import DraftBoard from "../components/DraftBoard";
import KeepersListSidebar from "../components/KeepersListSidebar";
import BestPlayersSidebar from "../components/BestPlayersSidebar";

export default function DraftBoardPage(){
  const username="rex-macmillan";
  const [ready,setReady]=useState(false);
  const [picksByRound,setPicksByRound]=useState<any>({});
  const [slots,setSlots]=useState<number[]>([]);
  const [rosterIdToName,setRosterIdToName]=useState<Record<number,string>>({});
  const [keeperPlayers,setKeeperPlayers]=useState<{playerId:string,name:string,position:string,roster:string}[]>([]);
  const [bestPlayers,setBestPlayers]=useState<{playerId:string,name:string,position:string,teamAbbr:string,rank:number}[]>([]);
  useEffect(()=>{
    (async()=>{
      try{
        const user=await getUserByUsername(username);
        const state=await getNFLState();
        const season=state.league_season;
        const leagues=await getUserLeagues(user.user_id,season);
        if(!leagues.length) return;
        const lg=leagues[0];
        const currentLeagueId=lg.league_id;
        const drafts=await getLeagueDrafts(currentLeagueId);
        if(!drafts.length) return;
        const draftSummary=drafts[0];
        // Fetch full draft details to get correct slot mapping
        const draftDetails = await getDraft(draftSummary.draft_id);
        let slotMap:Record<string,number>= draftDetails.slot_to_roster_id || draftDetails.draft_order || {};
        const [rosters,users]=await Promise.all([
          getRosters(currentLeagueId),
          getLeagueUsers(currentLeagueId),
        ]);
        const ownerToName:Record<string,string>={};
        users.forEach(u=>{ ownerToName[u.user_id]=u.metadata?.team_name||u.display_name||""; });
        // fallback: build slot map sequentially if missing
        if(Object.keys(slotMap).length===0){
          rosters.forEach((r,idx)=>{ slotMap[String(idx+1)]=r.roster_id; });
        }
        const slotNumbers=Object.keys(slotMap).map(n=>parseInt(n)).sort((a,b)=>a-b);
        setSlots(slotNumbers);
        const idToName:Record<number,string>={};
        rosters.forEach(r=>{
          idToName[r.roster_id]=ownerToName[r.owner_id]||`Team ${r.roster_id}`;
        });
        setRosterIdToName(idToName);
        const traded=await getTradedPicks(currentLeagueId);
        const tradedKey=new Map<string,number>();
        traded.forEach(t=>{
          tradedKey.set(`${t.round}-${t.roster_id}`,t.owner_id);
        });
        const board:any={};
        const rounds=17;
        for(let r=1;r<=rounds;r++){
          board[r]={};
          slotNumbers.forEach(s=>{
            const rid=slotMap[String(s)];
            const k=`${r}-${rid}`;
            if(tradedKey.has(k)){
              board[r][s]={rosterId:tradedKey.get(k)!,traded:true,fromRosterId:rid};
            }else{
              board[r][s]={rosterId:rid,traded:false};
            }
          });
        }
        // ---------------- Insert keepers into board ----------------

        // Build original round map from previous season draft
        const prevLeagueId = lg.previous_league_id;
        const roundMap = new Map<string, number>();
        if(prevLeagueId){
          try{
            const prevDrafts = await getLeagueDrafts(prevLeagueId);
            if(prevDrafts.length){
              const prevDraftPicks = await getDraftPicks(prevDrafts[0].draft_id);
              prevDraftPicks.forEach(p=> roundMap.set(p.player_id, p.round));
            }
          }catch{}
        }

        // ----------------- NEW: Build multi-season history for accurate keeper cost -----------------
        interface HistInfo { base:number|null; streak:number; lastKeeper:boolean }
        const infoMap = new Map<string, HistInfo>();
        if(prevLeagueId){
          const seasonDrafts: DraftPick[][] = [];
          let chainLeagueId: string | undefined = prevLeagueId;
          let depth = 0;
          const MAX_DEPTH = 5; // safety limit
          while(chainLeagueId && depth < MAX_DEPTH){
            try{
              const chainDrafts = await getLeagueDrafts(chainLeagueId);
              if(chainDrafts.length){
                const chainPicks = await getDraftPicks(chainDrafts[0].draft_id);
                seasonDrafts.unshift(chainPicks); // oldest first
              }
              const chainLeague = await getLeague(chainLeagueId);
              chainLeagueId = chainLeague.previous_league_id;
            }catch{ chainLeagueId = undefined; }
            depth += 1;
          }

          // Aggregate info per player across seasons
          for(const picks of seasonDrafts){
            for(const pick of picks){
              const curr = infoMap.get(pick.player_id) || { base: null, streak: 0, lastKeeper: false } as HistInfo;
              if(curr.base === null){
                if(!pick.is_keeper){
                  curr.base = pick.round;
                  curr.streak = 0;
                  curr.lastKeeper = false;
                }
              }else{
                if(pick.is_keeper){
                  curr.streak += 1;
                  curr.lastKeeper = true;
                }else{
                  curr.base = pick.round;
                  curr.streak = 0;
                  curr.lastKeeper = false;
                }
              }
              infoMap.set(pick.player_id, curr);
            }
          }
        }

        // Helper: desired keeper cost taking into account consecutive keeps
        const keeperCost = (pid:string): number => {
          const info = infoMap.get(pid);
          if(!info || info.base == null){
            // Undrafted players cost 6th by default (league rule)
            return 6;
          }
          let cost = info.base;
          for(let i=0; i<info.streak + 1; i++){
            cost = calculateKeeperRound(cost);
          }
          return cost;
        };

        // Compute missing (traded away) rounds per roster
        const missingByRoster: Record<number, Set<number>> = {};
        traded.forEach(tp=>{
          if(tp.season!==season) return;
          // original roster lost this round
          if(!missingByRoster[tp.roster_id]) missingByRoster[tp.roster_id]=new Set();
          missingByRoster[tp.roster_id].add(tp.round);
        });

        // Track taken rounds per roster as we assign keepers
        const taken = new Set<string>();
        const key = (rid:number, rd:number)=> `${rid}-${rd}`;

        const slotForRoster: Record<number, number> = {};
        Object.entries(slotMap).forEach(([s,rid])=>{ slotForRoster[ rid as any ] = parseInt(s); });

        // Alternative: build map using rosters players list earlier
        const pidToRosterId = new Map<string, number>();
        rosters.forEach(r=> r.players.forEach(pid=> pidToRosterId.set(pid, r.roster_id)));

        // Fetch player metadata and ranks early for helper functions
        const [playersMeta, fcRanks] = await Promise.all([getPlayers(), getFCRanks()]);

        const nameFor = (pid: string) => {
          const meta: any = playersMeta[pid] || {};
          return (
            meta.full_name || `${meta.first_name || ""} ${meta.last_name || ""}`.trim() || pid
          );
        };

        const posFor = (pid: string) => {
          const meta: any = playersMeta[pid] || {};
          if (Array.isArray(meta.fantasy_positions) && meta.fantasy_positions.length) {
            const priority = ["QB","RB","WR","TE"];
            const found = priority.find(p=> meta.fantasy_positions.includes(p));
            return found || meta.fantasy_positions[0];
          }
          return meta.position || "WR";
        };

        // Build keeper objects array
        interface KeeperObj { pid:string; rid:number; cost:number; name:string; position:string; placement?:number; }
        const keeperObjs: KeeperObj[] = [];
        let keeperIds: string[] = [];
        let keeperSlots: Record<string, number> = {};
        const keeperRawTop = localStorage.getItem(`keepers-${currentLeagueId}`);
        if (keeperRawTop) {
          try {
            const parsed = JSON.parse(keeperRawTop);
            if(Array.isArray(parsed)){
              keeperIds = parsed as string[];
            } else if(parsed && Array.isArray(parsed.ids)){
              keeperIds = parsed.ids as string[];
              if(parsed.slots) keeperSlots = parsed.slots as Record<string,number>;
            }
          } catch {}
        }

        keeperIds.forEach((pid:string)=>{
          const rid = pidToRosterId.get(pid);
          if(rid==null) return;
          const placement = keeperSlots[pid];
          keeperObjs.push({pid,rid,cost:keeperCost(pid),name:nameFor(pid),position:posFor(pid),placement});
        });

        // sort by cost ascending to allocate cheaper rounds first
        keeperObjs.sort((a,b)=> a.cost - b.cost);

        keeperObjs.forEach(k=>{
          let desired = (k.placement && typeof k.placement==='number') ? k.placement : k.cost;
          const missSet = missingByRoster[k.rid] || new Set<number>();
          const isUnavailable = (round:number) => missSet.has(round) || taken.has(key(k.rid, round));
          if(k.placement==null && isUnavailable(desired)){
            // Rule: if the pick round is unavailable due to trade or other keeper, move UP (earlier round)
            let rd = desired-1;
            while(rd>=1 && isUnavailable(rd)) rd-=1;
            if(rd<1){
              // fallback: if no earlier round available (unlikely), move downward until available
              rd = desired+1;
              while(isUnavailable(rd)) rd+=1;
            }
            desired = rd;
          }
          taken.add(key(k.rid, desired));

          const slot = slotForRoster[k.rid];
          if(board[desired] && board[desired][slot]){
            board[desired][slot] = {
              ...board[desired][slot],
              keeper:true,
              playerName:k.name,
              position:k.position
            } as any;
          }
        });

        setPicksByRound(board);

        // ---------- keepers & best available sidebars ----------

        // Build quick map playerId -> roster name using rosters list
        const pidToRosterName = new Map<string, string>();
        rosters.forEach(r=>{
          const teamName = idToName[r.roster_id];
          r.players.forEach(pid=> pidToRosterName.set(pid, teamName));
        });

        // Build keeper list
        const keepArr = keeperObjs.map(k => ({
          playerId: k.pid,
          name: k.name,
          position: k.position,
          roster: pidToRosterName.get(k.pid) || "",
          rank: fcRanks.get(k.pid) ?? Number.MAX_SAFE_INTEGER,
        })).sort((a,b)=> a.rank - b.rank)
          .map(({rank, ...rest})=>rest); // drop rank before storing
        setKeeperPlayers(keepArr);

        // Build best remaining list (exclude keepers)
        const bestArr: {playerId:string,name:string,position:string,teamAbbr:string,rank:number}[] = [];
        fcRanks.forEach((overallRank:number, playerId:string)=>{
          if(!keeperIds.includes(playerId)){
            const meta:any = playersMeta[playerId] || {};
            const teamAbbr = meta.team || meta.maybeTeam || "";
            bestArr.push({playerId:playerId,name:nameFor(playerId),position:posFor(playerId),teamAbbr,rank:overallRank});
          }
        });
        bestArr.sort((a,b)=>a.rank-b.rank);
        setBestPlayers(bestArr);

        setReady(true);
      }catch(e){console.error(e);}
    })();
  },[]);

  if(!ready) return <p style={{padding:"2rem"}}>Loading draft board...</p>;
  return (
    <>
      {/* Sidebars */}
      <KeepersListSidebar players={keeperPlayers} />
      <BestPlayersSidebar players={bestPlayers} />

      <main style={{padding:"2rem"}}>
        <h1>Upcoming Draft Board</h1>
        <DraftBoard slots={slots} teams={[]} picksByRound={picksByRound} maxRound={17} rosterIdToName={rosterIdToName} />
      </main>
    </>
  );
} 