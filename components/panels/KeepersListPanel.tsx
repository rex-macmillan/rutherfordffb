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
    <div className="relative scroll-x-fade">
      <div className="scroll-x no-scrollbar overflow-x-auto">
        <Table className="min-w-[320px]">
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
                <TD className="whitespace-nowrap font-medium">{p.name}</TD>
                <TD>{p.position}</TD>
                <TD className="whitespace-nowrap">{p.roster}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
