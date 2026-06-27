import { Table, THead, TBody, TR, TH, TD } from "../ui/Table";

interface PlayerInfo {
  playerId: string;
  name: string;
  position: string;
  teamAbbr: string;
  rank: number;
}

export function BestAvailablePanel({ players }: { players: PlayerInfo[] }) {
  return (
    <div className="relative scroll-x-fade">
      <div className="scroll-x no-scrollbar overflow-x-auto">
        <Table className="min-w-[320px]">
          <THead>
            <TR>
              <TH className="w-12">Rank</TH>
              <TH>Player</TH>
              <TH>Pos</TH>
              <TH>Team</TH>
            </TR>
          </THead>
          <TBody>
            {players.slice(0, 200).map((p, idx) => (
              <TR key={p.playerId}>
                <TD className="whitespace-nowrap text-ink-500">
                  {idx + 1} <span className="text-ink-400">({p.rank})</span>
                </TD>
                <TD className="whitespace-nowrap font-medium">{p.name}</TD>
                <TD>{p.position}</TD>
                <TD>{p.teamAbbr}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
