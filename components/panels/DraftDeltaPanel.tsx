import { DraftDelta } from "../../lib/keepers";
import { Table, THead, TBody, TR, TH, TD } from "../ui/Table";

interface TeamOption {
  rosterId: number;
  teamName: string;
}

const formatRounds = (rounds: number[]) =>
  rounds.length ? rounds.map((r) => `R${r}`).join(", ") : "—";

export function DraftDeltaPanel({
  teams,
  deltas,
}: {
  teams: TeamOption[];
  deltas: Map<number, DraftDelta>;
}) {
  return (
    <div>
      <p className="mb-3 text-xs text-ink-500">
        Picks each team has gained or lost from trades.
      </p>
      <div className="relative scroll-x-fade">
        <div className="scroll-x no-scrollbar overflow-x-auto">
          <Table className="min-w-[320px]">
            <THead>
              <TR>
                <TH>Team</TH>
                <TH>Extra</TH>
                <TH>Missing</TH>
              </TR>
            </THead>
            <TBody>
              {teams.map((t) => {
                const d = deltas.get(t.rosterId) ?? { extra: [], missing: [] };
                return (
                  <TR key={t.rosterId}>
                    <TD className="whitespace-nowrap font-medium">{t.teamName}</TD>
                    <TD className="whitespace-nowrap text-emerald-700">{formatRounds(d.extra)}</TD>
                    <TD className="whitespace-nowrap text-red-700">{formatRounds(d.missing)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
