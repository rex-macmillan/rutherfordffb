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
    <Table>
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
            <TD className="text-ink-500">
              {idx + 1} <span className="text-ink-400">({p.rank})</span>
            </TD>
            <TD className="font-medium">{p.name}</TD>
            <TD>{p.position}</TD>
            <TD>{p.teamAbbr}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
