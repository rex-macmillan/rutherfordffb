import React from "react";
import { cn } from "../lib/cn";

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
    if (round > finalsRound) {
      const place = (idx + 1) * 2 + 1;
      return isLosers ? `${12 - place}th Place` : `${place}th Place`;
    }
    if (round === finalsRound - 1) {
      const isLast = idx === (roundsMap[round].length - 1);
      if (isLast) return isLosers ? "8th Place" : "5th Place";
    }
    return null;
  };

  const renderTeam = (rid: number | null, isWinner: boolean, seed?: number | null, score?: number | null) => {
    if (rid == null)
      return <span className="text-xs text-ink-400">BYE</span>;
    const name = rosterIdToName[rid] || `Team ${rid}`;
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 py-0.5",
          isWinner ? "font-semibold text-white" : "text-ink-300",
        )}
      >
        <span className="truncate">
          {seed != null && <span className="text-ink-500">#{seed} </span>}
          {name}
        </span>
        {score != null && (
          <span className="shrink-0 tabular-nums text-ink-200">{score.toFixed(2)}</span>
        )}
      </div>
    );
  };

  return (
    <div className="relative scroll-x-fade">
      <div className="scroll-x no-scrollbar overflow-x-auto pb-4">
        <div className="flex w-max gap-5 sm:gap-6 md:gap-8">
          {roundNums.map((r) => (
            <div key={r} className="flex shrink-0 flex-col gap-5 sm:gap-6">
              <h4 className="text-center text-xs font-semibold uppercase tracking-wide text-ink-500">
                Round {r}
              </h4>
              {roundsMap[r].map((m, idx) => (
                <div
                  key={m.matchup_id}
                  className="w-[180px] shrink-0 rounded-lg bg-ink-800 px-3 py-2 text-sm text-ink-100 shadow-md sm:w-[200px]"
                >
                  {labelForMatch(r, idx) && (
                    <div className="mb-1 text-center text-xs font-medium text-amber-300">
                      {labelForMatch(r, idx)}
                    </div>
                  )}
                  {renderTeam(m.t1, m.winner === m.t1, m.seed1, m.score1)}
                  <div className="text-center text-[0.65rem] uppercase tracking-widest text-ink-500">
                    vs
                  </div>
                  {renderTeam(m.t2, m.winner === m.t2, m.seed2, m.score2)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Bracket;
