import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Skeleton } from "../components/ui/Skeleton";
import { useDraftSelectionOrder } from "../lib/draftOrder";
import { cn } from "../lib/cn";

export default function DraftOrderPage() {
  const { rows, seasonLabel, isLoading, error } = useDraftSelectionOrder();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Draft Slot Selection Order
        </h1>
        <p className="text-sm text-ink-500">
          Order in which managers select their draft slot for the upcoming
          season, based on {seasonLabel || "the previous season"}&apos;s final
          standings. Per <Link href="/rules#4-draft-order-slot-selection" className="text-brand-700 underline">§4 of the rulebook</Link>, the worst-finishing teams pick first.
        </p>
      </div>

      {error && (
        <Card>
          <CardBody className="text-sm text-red-700">{error.message}</CardBody>
        </Card>
      )}

      {rows.length === 0 && !isLoading && !error && (
        <Card>
          <CardBody className="text-sm text-ink-700">
            No completed bracket data found yet for the previous season.
          </CardBody>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selection order</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="relative scroll-x-fade">
              <div className="scroll-x no-scrollbar overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-3 py-2 text-left">Pick</th>
                  <th className="px-3 py-2 text-left">Finished</th>
                  <th className="px-3 py-2 text-left">Team</th>
                  <th className="px-3 py-2 text-right">Pts For</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.rosterId}
                    className={cn(
                      "border-t border-ink-100",
                      r.selectionOrder === 1 && "bg-brand-50/40",
                    )}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                          r.selectionOrder === 1
                            ? "bg-brand-600 text-white"
                            : "bg-ink-100 text-ink-700",
                        )}
                      >
                        {r.selectionOrder}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-700">
                      {ordinal(r.place)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar avatarId={r.avatarId} alt={r.teamName} size={28} />
                        <div className="min-w-0">
                          <div className="font-medium">{r.teamName}</div>
                          {r.managerName && r.managerName !== r.teamName && (
                            <div className="text-xs text-ink-500">{r.managerName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-700">
                      {r.pointsFor.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How this works</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-ink-700">
          <p>
            The selection sequence is hard-wired:{" "}
            <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">
              7 → 8 → 9 → 10 → 11 → 12 → 5 → 6 → 3 → 4 → 2 → 1
            </code>
            . The number is the team&apos;s previous-season final place. So the
            7th-place team picks their preferred slot first; the champion picks
            last.
          </p>
          <p>
            Slot selection happens <strong>before keepers lock</strong> — when
            you keep a player, their round cost consumes your pick in the slot
            you chose (e.g. you chose slot 4 and keep a 4th-rounder → that
            player occupies pick 4.04).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
