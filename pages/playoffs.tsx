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
} from "../utils/sleeper";
import styles from "../components/DraftBoard.module.css"; // reuse some simple table styles

interface BracketEntry {
  round: number;
  t1: number | null;
  t2: number | null;
  winner: number | null;
  matchup_id: number;
}

export default function PlayoffsPage() {
  const username = "rex-macmillan";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [winners, setWinners] = useState<BracketEntry[]>([]);
  const [losers, setLosers] = useState<BracketEntry[]>([]);
  const [rosterIdToName, setRosterIdToName] = useState<Record<number, string>>({});
  const [seasonLabel, setSeasonLabel] = useState<string>("");

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
        const [winRaw, loseRaw, rosters, users] = await Promise.all([
          getWinnersBracket(prevLeagueId),
          getLosersBracket(prevLeagueId),
          getRosters(prevLeagueId),
          getLeagueUsers(prevLeagueId),
        ]);

        // normalize bracket arrays
        const normalize = (arr:any[]):BracketEntry[] => arr.map(e=>({
          round: e.r ?? e.round ?? 0,
          t1: typeof e.t1 === 'number' ? e.t1 : null,
          t2: typeof e.t2 === 'number' ? e.t2 : null,
          winner: typeof e.w === 'number' ? e.w : null,
          matchup_id: e.m ?? e.matchup_id ?? 0,
        }));
        // Map rosterId -> name
        const ownerToName: Record<string, string> = {};
        users.forEach((u) => {
          ownerToName[u.user_id] = u.metadata?.team_name || u.display_name || "";
        });
        const idToName: Record<number, string> = {};
        rosters.forEach((r) => {
          idToName[r.roster_id] = ownerToName[r.owner_id] || `Team ${r.roster_id}`;
        });
        setRosterIdToName(idToName);
        setWinners(normalize(winRaw));
        setLosers(normalize(loseRaw));
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

  const renderBracket = (entries: BracketEntry[]) => {
    const grouped = groupByRound(entries);
    const rounds = Object.keys(grouped)
      .map((n) => parseInt(n))
      .filter(n=>!isNaN(n))
      .sort((a, b) => a - b);
    return (
      <div style={{ display: "flex", gap: "2rem", overflowX: "auto" }}>
        {rounds.map((r) => (
          <div key={r}>
            <h4 style={{ textAlign: "center" }}>Round {r}</h4>
            <table className={styles.table}>
              <tbody>
                {(grouped[r] || []).map((m) => (
                  <tr key={m.matchup_id}>
                    <td style={{ padding: "0.25rem 0.5rem" }}>
                      <strong style={{ color: m.winner === m.t1 ? "#16a34a" : undefined }}>
                        {m.t1 != null ? (rosterIdToName[m.t1] || m.t1) : "TBD"}
                      </strong>
                      <br />
                      <span style={{ color: "#64748b", fontSize: "0.75rem" }}>vs</span>
                      <br />
                      <strong style={{ color: m.winner === m.t2 ? "#16a34a" : undefined }}>
                        {m.t2 != null ? (rosterIdToName[m.t2] || m.t2) : "TBD"}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main style={{ padding: "2rem" }}>
      <h1>{seasonLabel ? `${seasonLabel} Playoffs` : "Playoffs"}</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && (
        <>
          <h2>Winners Bracket</h2>
          {winners.length ? renderBracket(winners) : <p>No data</p>}
          <h2 style={{ marginTop: "2rem" }}>Losers Bracket</h2>
          {losers.length ? renderBracket(losers) : <p>No data</p>}
        </>
      )}
    </main>
  );
} 