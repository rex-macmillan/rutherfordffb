import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Sheet, SheetClose, SheetContent } from "./ui/Sheet";
import { NavIcon } from "./NavIcon";
import { useIdentity } from "../lib/identity";
import { NAV_LINKS } from "../lib/navLinks";
import { cn } from "../lib/cn";

/**
 * Instagram-style floating bottom tab bar for mobile (hidden on md+). A frosted
 * pill that floats above content, with a rounded highlight behind the active
 * tab. Core destinations sit in the bar; the rest open in a "More" sheet.
 */
export default function MobileTabBar() {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const { username, signOut } = useIdentity();
  const p = router.pathname;

  const core = NAV_LINKS.filter((l) => l.core);
  const more = NAV_LINKS.filter((l) => !l.core);
  const moreActive = more.some((l) => l.match(p)) || moreOpen;

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1.5 text-[0.6rem] font-medium transition-colors",
      active
        ? "bg-ink-900/[0.07] text-ink-900"
        : "text-ink-400 hover:text-ink-600",
    );

  return (
    <>
      {/* pointer-events-none on the wrapper so taps in the side gaps fall
          through to content; the pill itself re-enables them. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden">
        <nav
          aria-label="Primary"
          className="pointer-events-auto mx-auto flex max-w-md items-stretch gap-1 rounded-[1.75rem] border border-ink-200/70 bg-white/85 p-1.5 shadow-lg shadow-ink-900/10 backdrop-blur-xl"
        >
          {core.map((l) => {
            const active = l.match(p);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <NavIcon name={l.icon} className="h-6 w-6" />
                <span className="leading-none">{l.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-current={moreActive ? "page" : undefined}
            className={tabClass(moreActive)}
          >
            <NavIcon name="more" className="h-6 w-6" />
            <span className="leading-none">More</span>
          </button>
        </nav>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" title="More">
          <div className="grid grid-cols-3 gap-2 p-4">
            {more.map((l) => {
              const active = l.match(p);
              return (
                <SheetClose asChild key={l.href}>
                  <Link
                    href={l.href}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center text-sm font-medium transition-colors",
                      active
                        ? "border-brand-300 bg-brand-50 text-brand-900"
                        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
                    )}
                  >
                    <NavIcon name={l.icon} className="h-7 w-7" />
                    {l.full}
                  </Link>
                </SheetClose>
              );
            })}
          </div>
          {username && (
            <div className="flex items-center justify-between gap-2 border-t border-ink-200 px-4 py-3 text-sm">
              <span className="min-w-0 truncate text-ink-600">
                Signed in as <strong className="text-ink-900">{username}</strong>
              </span>
              <SheetClose asChild>
                <button
                  type="button"
                  onClick={signOut}
                  className="shrink-0 rounded-md border border-ink-300 px-3 py-1.5 text-ink-700 hover:bg-ink-50"
                >
                  Switch user
                </button>
              </SheetClose>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
