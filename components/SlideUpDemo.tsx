import { useMemo, useState } from "react";
import { assignKeeperSlots, MAX_DRAFT_ROUND } from "../lib/keepers";
import { Card, CardBody, CardHeader, CardTitle } from "./ui/Card";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";

/**
 * Live demo of the §6 slide-up rule. Reader picks which keepers to add and
 * which picks are traded away; the widget shows where each keeper actually
 * lands, using the SAME math the rest of the site uses (no special-cased
 * demo logic). This is the most "you can't get this anywhere else" piece of
 * the rules page.
 */

interface DemoKeeper {
  id: string;
  name: string;
  cost: number;
}

const PRESETS: { name: string; keepers: DemoKeeper[]; missing: number[] }[] = [
  {
    name: "Documented example (Etienne R3 + Olave R4, R4 traded)",
    keepers: [
      { id: "etienne", name: "RB Etienne", cost: 3 },
      { id: "olave", name: "WR Olave", cost: 4 },
    ],
    missing: [4],
  },
  {
    name: "Three keepers at the same round",
    keepers: [
      { id: "a", name: "Keeper A", cost: 4 },
      { id: "b", name: "Keeper B", cost: 4 },
      { id: "c", name: "Keeper C", cost: 4 },
    ],
    missing: [],
  },
  {
    name: "Trade away both your top picks",
    keepers: [
      { id: "rb", name: "RB stud", cost: 1 },
      { id: "wr", name: "WR stud", cost: 2 },
    ],
    missing: [1, 2],
  },
];

export function SlideUpDemo() {
  const [keepers, setKeepers] = useState<DemoKeeper[]>(PRESETS[0].keepers);
  const [missing, setMissing] = useState<Set<number>>(new Set(PRESETS[0].missing));
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState(4);

  const result = useMemo(() => {
    const candidates = keepers.map((k) => ({
      playerId: k.id,
      rosterId: 1,
      cost: k.cost,
    }));
    return assignKeeperSlots(candidates, new Map([[1, missing]]));
  }, [keepers, missing]);

  const toggleMissing = (round: number) => {
    setMissing((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  const addKeeper = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setKeepers((prev) => [
      ...prev,
      { id: `k-${prev.length + 1}`, name: trimmed, cost: newCost },
    ]);
    setNewName("");
  };

  const loadPreset = (presetIdx: number) => {
    const p = PRESETS[presetIdx];
    setKeepers(p.keepers);
    setMissing(new Set(p.missing));
  };

  return (
    <Card className="not-prose">
      <CardHeader>
        <CardTitle>Try it: the slide-up rule in action</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-600">
          Add keepers, mark which rounds you&apos;ve traded away, and watch where
          each keeper actually lands. This uses the same math the keeper
          helper does.
        </p>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Presets
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
              <Button
                key={p.name}
                size="sm"
                variant="secondary"
                onClick={() => loadPreset(i)}
              >
                {p.name}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            Keepers
          </div>
          <div className="overflow-x-auto rounded-lg border border-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-3 py-2 text-left">Player</th>
                  <th className="px-3 py-2 text-left">Cost</th>
                  <th className="px-3 py-2 text-left">Lands in</th>
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {keepers.map((k) => {
                  const landed = result.slots.get(k.id);
                  const slid = landed != null && landed !== k.cost;
                  return (
                    <tr key={k.id} className="border-t border-ink-100">
                      <td className="px-3 py-2 font-medium">{k.name}</td>
                      <td className="px-3 py-2">R{k.cost}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            slid ? "text-amber-700" : "text-emerald-700",
                          )}
                        >
                          R{landed}
                        </span>
                        {slid && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-amber-800">
                            slid
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() =>
                            setKeepers((prev) => prev.filter((p) => p.id !== k.id))
                          }
                          className="text-xs text-red-600 hover:underline"
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {keepers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-sm text-ink-500">
                      No keepers yet. Add one below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Keeper name"
              className="flex-1 rounded border border-ink-300 px-2 py-1 text-sm"
            />
            <select
              value={newCost}
              onChange={(e) => setNewCost(parseInt(e.target.value))}
              className="rounded border border-ink-300 px-2 py-1 text-sm"
            >
              {Array.from({ length: MAX_DRAFT_ROUND }, (_, i) => i + 1).map(
                (r) => (
                  <option key={r} value={r}>
                    R{r}
                  </option>
                ),
              )}
            </select>
            <Button size="sm" onClick={addKeeper}>
              Add keeper
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            Traded-away rounds
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: MAX_DRAFT_ROUND }, (_, i) => i + 1).map((r) => {
              const active = missing.has(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleMissing(r)}
                  className={cn(
                    "rounded border px-2 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-red-200 bg-red-100 text-red-800"
                      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
                  )}
                >
                  R{r}
                </button>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
