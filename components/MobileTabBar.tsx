import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Sheet, SheetClose, SheetContent } from "./ui/Sheet";
import { useIdentity } from "../lib/identity";
import { NAV_LINKS } from "../lib/navLinks";
import { cn } from "../lib/cn";

/**
 * Fixed bottom tab bar for mobile (hidden on md+). Core destinations sit in the
 * bar; the rest open in a bottom "More" sheet. Desktop keeps the top nav.
 */
export default function MobileTabBar() {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const { username, signOut } = useIdentity();
  const p = router.pathname;

  const core = NAV_LINKS.filter((l) => l.core);
  const more = NAV_LINKS.filter((l) => !l.core);
  const moreActive = more.some((l) => l.match(p));

  const tabClass = (active: boolean) =>
    cn(
      "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.65rem] font-medium transition-colors",
      active ? "text-white" : "text-ink-400 hover:text-ink-200",
    );

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-900 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="flex">
          {core.map((l) => {
            const active = l.match(p);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                {active && (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-500" />
                )}
                <span className="text-lg leading-none" aria-hidden>
                  {l.icon}
                </span>
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
            {moreActive && (
              <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-500" />
            )}
            <span className="text-lg leading-none" aria-hidden>
              ☰
            </span>
            <span className="leading-none">More</span>
          </button>
        </div>
      </nav>

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
                    <span className="text-2xl" aria-hidden>
                      {l.icon}
                    </span>
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
