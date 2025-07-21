import React from "react";
import styles from "./Bracket.module.css";

interface Entry {
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

interface Props {
  entries: Entry[];
  rosterIdToName: Record<number, string>;
  isLosers?: boolean;
}

const Bracket: React.FC<Props> = ({ entries, rosterIdToName, isLosers = false }) => {
  // group by round
  const roundsMap: Record<number, Entry[]> = {};
  entries.forEach((e) => {
    if (!roundsMap[e.round]) roundsMap[e.round] = [];
    roundsMap[e.round].push(e);
  });

  const roundNums = Object.keys(roundsMap)
    .map((n) => parseInt(n))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  const finalsRound = roundNums[roundNums.length - 1];

  const labelForMatch = (round: number, idx: number): string | null => {
    if (round === finalsRound) {
      if (isLosers) {
        if (idx === 0) return "💩 Last Place";
        if (idx === 1) return "10th Place";
        const place = 12 - idx * 2;
        return `${place}th Place`;
      }
      if (idx === 0) return "🏆 Championship";
      const place = idx * 2 + 1;
      return `${place}th Place`;
    }
    // placement labels in rounds after the finals (e.g., consolation)
    if (round > finalsRound) {
      const place = (idx + 1) * 2 + 1;
      return isLosers ? `${12 - place}th Place` : `${place}th Place`;
    }

    // Special middle-round placement games (e.g., 5th or 8th place)
    if (round === finalsRound - 1) {
      if (!isLosers) {
        // winners bracket: assume last matchup in this round is 5th-place game
        const isLast = idx === (roundsMap[round].length - 1);
        if (isLast) return "5th Place";
      } else {
        // losers bracket: assume last matchup in this round decides 8th place
        const isLast = idx === (roundsMap[round].length - 1);
        if (isLast) return "8th Place";
      }
    }
    return null;
  };

  const renderTeam = (rid: number | null, isWinner: boolean, seed?: number | null, score?: number | null) => {
    if (rid == null) return <span className={styles.vs}>BYE</span>;
    const name = rosterIdToName[rid] || `Team ${rid}`;
    return (
      <div className={styles.team} style={{ fontWeight: isWinner ? 600 : 400 }}>
        <span>
          {seed != null && <span style={{ color: "#94a3b8" }}>#{seed} </span>}
          {name}
        </span>
        {score != null && <span style={{ marginLeft: "0.5rem" }}>{score.toFixed(2)}</span>}
      </div>
    );
  };

  return (
    <div className={styles.bracket}>
      {roundNums.map((r) => (
        <div key={r} className={styles.column}>
          <h4 style={{ textAlign: "center" }}>Round {r}</h4>
          {roundsMap[r].map((m, idx) => (
            <div key={m.matchup_id} className={styles.match}>
              {labelForMatch(r, idx) && <div className={styles.header}>{labelForMatch(r, idx)}</div>}
              {renderTeam(m.t1, m.winner === m.t1, (m as any).seed1 ?? (m as any).t1_seed ?? null, m.score1 ?? (m as any).p1 ?? null)}
              <div className={styles.vs}>vs</div>
              {renderTeam(m.t2, m.winner === m.t2, (m as any).seed2 ?? (m as any).t2_seed ?? null, m.score2 ?? (m as any).p2 ?? null)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Bracket; 