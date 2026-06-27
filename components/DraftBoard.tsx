import React from "react";
import { cn } from "../lib/cn";

interface TeamOption {
  rosterId: number;
  teamName: string;
}

interface PickCell {
  rosterId: number;
  traded: boolean;
  fromRosterId?: number;
  keeper?: boolean;
  playerName?: string;
  position?: string;
}

interface Props {
  slots: number[];
  teams: TeamOption[];
  picksByRound: Record<number, Record<number, PickCell>>;
  maxRound: number;
  rosterIdToName: Record<number, string>;
}

const DraftBoard: React.FC<Props> = ({
  slots,
  picksByRound,
  maxRound,
  rosterIdToName,
}) => {
  return (
    <div className="relative scroll-x-fade">
      <div className="scroll-x overflow-auto rounded-xl border border-ink-200 bg-white shadow-sm">
        <div
          className="grid auto-rows-[64px]"
          style={{
            gridTemplateColumns: `48px repeat(${slots.length}, minmax(104px, 1fr))`,
          }}
        >
        <div className="sticky left-0 top-0 z-20 border-b border-r border-ink-700 bg-ink-900" />
        {slots.map((s) => {
          const rid = picksByRound[1]?.[s]?.rosterId;
          return (
            <div
              key={`h-${s}`}
              className="sticky top-0 z-10 grid place-items-center border-b border-r border-ink-700 bg-ink-900 px-1 text-center text-[0.7rem] font-medium leading-tight text-ink-100"
            >
              {rosterIdToName[rid] || `Slot ${s}`}
            </div>
          );
        })}

        {Array.from({ length: maxRound }, (_, i) => i + 1).map((round) => (
          <React.Fragment key={`r-${round}`}>
            <div className="sticky left-0 z-10 grid place-items-center border-b border-r border-ink-200 bg-ink-100 text-sm font-semibold text-ink-700">
              {round}
            </div>
            {slots.map((slot) => {
              const cell = picksByRound[round]?.[slot];
              const label =
                round % 2 === 1 ? `${round}.${slot}` : `${round}.${slots.length - slot + 1}`;
              if (!cell)
                return (
                  <div
                    key={`${round}-${slot}`}
                    className="border-b border-r border-ink-200"
                  />
                );
              return (
                <div
                  key={`${round}-${slot}`}
                  className={cn(
                    "border-b border-r border-ink-200 px-1 py-1.5 text-center text-[0.75rem] leading-tight",
                    cell.keeper && "bg-emerald-50",
                    cell.traded && !cell.keeper && "bg-amber-50",
                  )}
                >
                  {cell.keeper ? (
                    <div>
                      <div className="font-semibold text-emerald-800">
                        {cell.playerName}
                      </div>
                      <div className="text-[0.65rem] text-ink-500">{cell.position}</div>
                    </div>
                  ) : cell.traded ? (
                    <div>
                      <div className="text-[0.65rem] font-semibold text-amber-700">
                        → traded
                      </div>
                      <div className="text-[0.7rem] text-ink-700">
                        {rosterIdToName[cell.rosterId]}
                      </div>
                      <div className="text-[0.65rem] text-ink-400">{label}</div>
                    </div>
                  ) : (
                    <span className="text-ink-500">{label}</span>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
        </div>
      </div>
    </div>
  );
};

export default DraftBoard;
