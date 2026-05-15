import Link from "next/link";
import { KEEPER_COST_TABLE } from "../../lib/keeperCostTable";
import { Table, THead, TBody, TR, TH, TD } from "../ui/Table";

export function KeeperRulesPanel() {
  return (
    <div>
      <p className="mb-3 text-xs text-ink-500">
        Round a player was drafted last year → round they cost to keep this
        year. See the{" "}
        <Link href="/rules" className="text-brand-600 underline">
          full rulebook
        </Link>{" "}
        for details.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>Drafted</TH>
            <TH>Keeper Cost</TH>
          </TR>
        </THead>
        <TBody>
          {KEEPER_COST_TABLE.map((row) => (
            <TR key={String(row.draftedRound)}>
              <TD>{row.draftedRound}</TD>
              <TD>{row.keeperRound}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
