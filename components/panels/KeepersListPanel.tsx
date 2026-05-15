import { Table, THead, TBody, TR, TH, TD } from "../ui/Table";

interface PlayerInfo {
  playerId: string;
  name: string;
  position: string;
  roster: string;
}

export function KeepersListPanel({ players }: { players: PlayerInfo[] }) {
  if (players.length === 0) {
    return <p className="text-sm text-ink-500">No keepers saved yet.</p>;
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-8">#</TH>
          <TH>Player</TH>
          <TH>Pos</TH>
          <TH>Roster</TH>
        </TR>
      </THead>
      <TBody>
        {players.map((p, idx) => (
          <TR key={p.playerId}>
            <TD>{idx + 1}</TD>
            <TD className="font-medium">{p.name}</TD>
            <TD>{p.position}</TD>
            <TD>{p.roster}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
