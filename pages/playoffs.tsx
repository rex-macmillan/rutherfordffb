import { useEffect, useState } from "react";
import {
  getUserByUsername,
  getNFLState,
  getUserLeagues,
  getWinnersBracket,
  getLosersBracket,
  getRosters,
  getLeagueUsers,
  getLeague,
  getMatchups,
} from "../utils/sleeper";
import Bracket from "../components/Bracket";
import styles from "../components/Bracket.module.css";
import React from "react";

interface BracketEntry {
  round: number;
  t1: number | null;
  t2: number | null;
  winner: number | null;
  matchup_id: number;
  seed1?: number | null;
  seed2?: number | null;
  score1?: number | null;
  score2?: number | null;
}

export default function PlayoffsPage() {
  const username = "rex-macmillan";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [winners, setWinners] = useState<BracketEntry[]>([]);
  const [losers, setLosers] = useState<BracketEntry[]>([]);
  interface Row { place:number; team:string; points:number; draftPos:number }
  const [rows,setRows]=useState<Row[]>([]);
  const [sortBy,setSortBy]=useState<'place'|'draftPos'>('place');
  const [rosterIdToName, setRosterIdToName] = useState<Record<number, string>>({});
  const [seasonLabel, setSeasonLabel] = useState<string>("");

  const seedMapRef = React.useRef<Record<number, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const user = await getUserByUsername(username);
        const state = await getNFLState();
        const seasonYear = state.league_season;
        // Get leagues for current season
        const leagues = await getUserLeagues(user.user_id, seasonYear);
        if (!leagues.length) throw new Error("No leagues found");
        const lg = leagues[0];
        if (!lg.previous_league_id) throw new Error("previous_league_id missing");
        const prevLeagueId = lg.previous_league_id;
        // Retrieve previous league to get its season label
        try{
          const prevLeague = await getLeague(prevLeagueId);
          setSeasonLabel(prevLeague.season);
        }catch{ setSeasonLabel(String(parseInt(lg.season)-1)); }
        // Fetch brackets, rosters, users in parallel
        const [winRaw, loseRaw, rosters, users, leagueObj] = await Promise.all([
          getWinnersBracket(prevLeagueId),
          getLosersBracket(prevLeagueId),
          getRosters(prevLeagueId),
          getLeagueUsers(prevLeagueId),
          getLeague(prevLeagueId),
        ]);

        // Map rosterId -> name
        const ownerToName: Record<string, string> = {};
        users.forEach((u) => {
          ownerToName[u.user_id] = u.metadata?.team_name || u.display_name || "";
        });
        const idToName: Record<number, string> = {};
        // Determine playoff start week
        const playoffStartWeek = parseInt((leagueObj as any).settings?.playoff_week_start || "15");

        // Build seed map first
        const seedMap: Record<number, number> = {};
        rosters.forEach((r) => {
          idToName[r.roster_id] = ownerToName[r.owner_id] || `Team ${r.roster_id}`;
          const seedVal = (r as any).settings?.playoff_seed ?? (r as any).settings?.seed ?? null;
          if (seedVal != null) seedMap[r.roster_id] = parseInt(seedVal);
        });
        seedMapRef.current = seedMap;

        // ----- Resolve bracket entries to concrete rosterIds -----
        interface RawEntry { r:number; m:number; t1:any; t2:any; w:number|null }

        const resolveBracket = (rawArr:any[]):BracketEntry[]=>{
          const sorted = [...rawArr].sort((a,b)=> (a.r??0)-(b.r??0));
          const outcomeMap = new Map<number,{winner:number|null, loser:number|null}>();
          const resolved: BracketEntry[] = [];
          for(const e of sorted){
            const matchId = e.m ?? e.matchup_id;
            const getRoster = (obj:any):number|null=>{
              if(typeof obj === 'number') return obj;
              if(obj && typeof obj==='object'){
                 if(obj.w) return outcomeMap.get(obj.w)?.winner ?? null;
                 if(obj.l) return outcomeMap.get(obj.l)?.loser ?? null;
              }
              return null;
            };
            const t1Id = getRoster(e.t1);
            const t2Id = getRoster(e.t2);
            const winnerId:number|null = (typeof e.w === 'number') ? e.w : null;
            const loserId:number|null = winnerId!=null ? (winnerId===t1Id? t2Id : t1Id) : null;
            outcomeMap.set(matchId,{winner:winnerId, loser:loserId});

            resolved.push({
              round: e.r ?? 0,
              t1: t1Id,
              t2: t2Id,
              winner: winnerId,
              matchup_id: matchId,
              seed1: t1Id!=null? seedMap[t1Id] ?? null : null,
              seed2: t2Id!=null? seedMap[t2Id] ?? null : null,
              score1: null,
              score2: null,
            });
          }
          return resolved;
        };

        const winnersResolved = resolveBracket(winRaw);
        const losersResolved = resolveBracket(loseRaw);

        // Collect weeks needed based on max round
        const neededRounds = new Set<number>([...winnersResolved,...losersResolved].map(e=>e.round));
        const weeks = Array.from(neededRounds).map(r=>playoffStartWeek + r -1);

        const matchupsByWeek = await Promise.all(weeks.map(w=>getMatchups(prevLeagueId, w)));
        const scoreLookup = new Map<string, number>(); // key `${week}-${rosterId}`
        matchupsByWeek.forEach((arr, idx)=>{
            const weekNum = weeks[idx];
            (arr as any[]).forEach(m=>scoreLookup.set(`${weekNum}-${m.roster_id}`, m.points));
        });

        const attachScores = (entries:BracketEntry[]):BracketEntry[]=>entries.map(en=>{
           const weekNum = playoffStartWeek + en.round -1;
           const s1 = en.t1!=null? scoreLookup.get(`${weekNum}-${en.t1}`) ?? null : null;
           const s2 = en.t2!=null? scoreLookup.get(`${weekNum}-${en.t2}`) ?? null : null;
           return {...en, score1:s1, score2:s2};
        });

        const winnersFinal = attachScores(winnersResolved);
        const losersFinal = attachScores(losersResolved);

        // ---------- Derive Final Standings (12-team specific) ----------
        const ptsMap = new Map<number, number>();
        rosters.forEach(r=>ptsMap.set(r.roster_id, (r as any).settings?.fpts ?? 0));

        const getWinner = (m:BracketEntry)=>m.winner!;
        const getLoser  = (m:BracketEntry)=> (m.t1===m.winner? m.t2!: m.t1!);

        const wMax = Math.max(...winnersFinal.map(e=>e.round));
        const lMax = Math.max(...losersFinal.map(e=>e.round));

        const finalsArr = winnersFinal.filter(e=>e.round===wMax);
        const semiArr   = winnersFinal.filter(e=>e.round===wMax-1);

        const champMatch   = finalsArr[0];
        const thirdMatch   = finalsArr.length>1? finalsArr[1]:null;
        const fifthMatch   = semiArr.length? semiArr[semiArr.length-1]:null;

        const losersFinalArr = losersFinal.filter(e=>e.round===lMax);
        const lastPlaceMatch = losersFinalArr[0];
        const tenthMatch     = losersFinalArr.length>1? losersFinalArr[1]:null;
        const losersSemiArr  = losersFinal.filter(e=>e.round===lMax-1);
        const eighthMatch    = losersSemiArr.length? losersSemiArr[losersSemiArr.length-1]:null;

        const order: number[] = [];
        if(champMatch){ order.push(getWinner(champMatch), getLoser(champMatch)); }
        if(thirdMatch){ order.push(getWinner(thirdMatch), getLoser(thirdMatch)); }
        if(fifthMatch){ order.push(getWinner(fifthMatch), getLoser(fifthMatch)); }
        if(eighthMatch){ order.push(getLoser(eighthMatch), getWinner(eighthMatch)); } // 7th is loser of 8th place game
        if(tenthMatch){ order.push(getLoser(tenthMatch), getWinner(tenthMatch)); }
        if(lastPlaceMatch){ order.push(getLoser(lastPlaceMatch), getWinner(lastPlaceMatch)); }

        const standingsArr = order.map((rid, idx)=>({
          place: idx+1,
          team: idToName[rid] || `Team ${rid}`,
          points: ptsMap.get(rid) ?? 0,
        }));

        // Build draft slot selection order per league rules
        const pickSequence = [7,8,9,10,11,12,5,6,3,4,2,1];
        const draftArr = pickSequence.map(p=>{
          const s = standingsArr.find(st=>st.place===p);
          return s? {place:p, team:s.team}: {place:p, team:""};
        });

        // merge table rows
        const rowsCombined: Row[] = standingsArr.map(st=>{
          const dIdx = draftArr.findIndex(d=>d.team===st.team);
          return {...st, draftPos:dIdx+1};
        });

        setRosterIdToName(idToName);
        setRows(rowsCombined);
        setWinners(winnersFinal);
        setLosers(losersFinal);
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groupByRound = (arr: BracketEntry[]) => {
    const map: Record<number, BracketEntry[]> = {};
    arr.forEach((m) => {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    });
    return map;
  };

  const renderBracket = (entries: BracketEntry[], isLosers=false) => (
    <Bracket entries={entries} rosterIdToName={rosterIdToName} isLosers={isLosers} />
  );

  return (
    <main style={{ padding: "2rem" }}>
      <h1>{seasonLabel ? `${seasonLabel} Playoffs` : "Playoffs"}</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && (
        <>
            {rows.length>0 && (
              <div style={{marginTop:"1rem"}}>
                <h2>Final Standings & Draft Order</h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.sortable} style={{cursor:"pointer"}} onClick={()=>setSortBy('place')}>Place{sortBy==='place'? '▼':' '}</th>
                      <th className={styles.sortable} style={{cursor:"pointer"}} onClick={()=>setSortBy('draftPos')}>Draft{sortBy==='draftPos'? '▼':' '}</th>
                      <th>Team</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].sort((a,b)=> sortBy==='place'? a.place-b.place : a.draftPos-b.draftPos).map(r=> (
                      <tr key={r.team}>
                        <td>{r.place}</td><td>{r.draftPos}</td><td>{r.team}</td><td>{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <h2 style={{marginTop:"2rem"}}>Winners Bracket</h2>
          {winners.length ? renderBracket(winners) : <p>No data</p>}
          <h2 style={{ marginTop: "2rem" }}>Losers Bracket</h2>
          {losers.length ? renderBracket(losers,true) : <p>No data</p>}


        </>
      )}
    </main>
  );
} 