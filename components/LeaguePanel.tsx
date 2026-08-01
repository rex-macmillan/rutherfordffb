import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Sheet, SheetContent, SheetTrigger } from "./ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/Tabs";
import { Button } from "./ui/Button";
import { NavIcon } from "./NavIcon";
import { cn } from "../lib/cn";

/**
 * One slide-out panel that consolidates what used to be four overlapping
 * sidebars. Pages register their tabs via `usePanelTabs(...)` and the
 * trigger lives in the top nav.
 */

export interface PanelTab {
  id: string;
  label: string;
  count?: number;
  body: ReactNode;
}

interface PanelState {
  tabs: PanelTab[];
  open: boolean;
  active: string | null;
}

interface PanelDispatch {
  setTabs: (tabs: PanelTab[]) => void;
  setOpen: (v: boolean) => void;
  setActive: (id: string) => void;
}

const PanelStateCtx = createContext<PanelState | undefined>(undefined);
const PanelDispatchCtx = createContext<PanelDispatch | undefined>(undefined);

function usePanelState() {
  const ctx = useContext(PanelStateCtx);
  if (!ctx) throw new Error("usePanelState must be inside LeaguePanelProvider");
  return ctx;
}

function usePanelDispatch() {
  const ctx = useContext(PanelDispatchCtx);
  if (!ctx) throw new Error("usePanelDispatch must be inside LeaguePanelProvider");
  return ctx;
}

export function LeaguePanelProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabsState] = useState<PanelTab[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const setTabs = useCallback((next: PanelTab[]) => {
    setTabsState((prev) => {
      const metaSame =
        prev.length === next.length &&
        prev.every(
          (t, i) =>
            t.id === next[i].id &&
            t.label === next[i].label &&
            t.count === next[i].count,
        );
      if (metaSame) {
        const bodiesSame = prev.every((t, i) => t.body === next[i].body);
        return bodiesSame ? prev : next;
      }
      setActive((current) => {
        if (current && next.some((t) => t.id === current)) return current;
        return next[0]?.id ?? null;
      });
      return next;
    });
  }, []);

  const state = useMemo<PanelState>(
    () => ({ tabs, open, active }),
    [tabs, open, active],
  );

  const dispatch = useMemo<PanelDispatch>(
    () => ({ setTabs, setOpen, setActive }),
    [setTabs],
  );

  return (
    <PanelDispatchCtx.Provider value={dispatch}>
      <PanelStateCtx.Provider value={state}>{children}</PanelStateCtx.Provider>
    </PanelDispatchCtx.Provider>
  );
}

/**
 * Pages call this with their tab list. The caller is responsible for
 * memoizing the array (use useMemo). On unmount we clear, so the panel
 * doesn't show stale tabs after navigation.
 *
 * Uses dispatch-only context so registering tabs does not re-render the page
 * when panel state updates (which previously blocked navigation on data-heavy
 * pages like Keepers).
 */
export function usePanelTabs(tabs: PanelTab[]) {
  const { setTabs } = usePanelDispatch();

  useEffect(() => {
    setTabs(tabs);
  }, [tabs, setTabs]);

  useEffect(() => {
    return () => setTabs([]);
  }, [setTabs]);
}

/**
 * Top-nav trigger. Hidden when no tabs are registered.
 */
export function LeaguePanelTrigger({ className }: { className?: string }) {
  const { tabs, open } = usePanelState();
  const { setOpen } = usePanelDispatch();
  if (tabs.length === 0) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          aria-label="League panels"
          className={cn(
            "h-10 gap-1.5 border-ink-700/30 bg-ink-800 px-2.5 text-white hover:bg-ink-700 md:h-8",
            className,
          )}
        >
          <NavIcon name="panels" className="h-5 w-5" />
          <span className="hidden md:inline">Panels</span>
          <span className="rounded-full bg-brand-600 px-1.5 py-px text-[0.65rem] font-bold text-white">
            {tabs.length}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent title="League panels" side="responsive">
        <PanelTabsBody />
      </SheetContent>
    </Sheet>
  );
}

function PanelTabsBody() {
  const { tabs, active } = usePanelState();
  const { setActive } = usePanelDispatch();
  return (
    <Tabs
      value={active ?? tabs[0]?.id}
      onValueChange={setActive}
      className="flex h-full flex-col"
    >
      <TabsList className="bg-ink-50">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>
            {t.label}
            {typeof t.count === "number" && (
              <span className="ml-1 rounded bg-ink-200 px-1 text-[0.65rem] text-ink-700">
                {t.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} className="flex-1 overflow-y-auto p-4">
          {t.body}
        </TabsContent>
      ))}
    </Tabs>
  );
}
