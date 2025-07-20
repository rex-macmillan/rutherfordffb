import { useEffect, useState } from "react";
import {
  getUserByUsername,
  getNFLState,
  getUserLeagues,
  getLeagueDrafts,
  getDraftPicks,
  getRosters,
  getTradedPicks,
  getLeague,
  getLeagueUsers,
} from "../utils/sleeper";
import DraftBoard from "../components/DraftBoard";

export default function DraftBoardPage(){
  const username="rex-macmillan";
  const [ready,setReady]=useState(false);
  const [picksByRound,setPicksByRound]=useState<any>({});
  const [slots,setSlots]=useState<number[]>([]);
  const [rosterIdToName,setRosterIdToName]=useState<Record<number,string>>({});
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
        const draft=drafts[0];
        let slotMap:Record<string,number>= (draft as any).slot_to_roster_id||{};
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
        setPicksByRound(board);
        setReady(true);
      }catch(e){console.error(e);}
    })();
  },[]);

  if(!ready) return <p style={{padding:"2rem"}}>Loading draft board...</p>;
  return (
    <main style={{padding:"2rem"}}>
      <h1>Upcoming Draft Board</h1>
      <DraftBoard slots={slots} teams={[]} picksByRound={picksByRound} maxRound={17} rosterIdToName={rosterIdToName} />
    </main>
  );
} 