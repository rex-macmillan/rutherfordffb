import Link from "next/link";
import { useRouter } from "next/router";
import { Sheet, SheetClose, SheetContent } from "./ui/Sheet";
import { NavIcon } from "./NavIcon";
import { useIdentity } from "../lib/identity";
import { NAV_LINKS } from "../lib/navLinks";
import { cn } from "../lib/cn";

/**
 * Full-navigation sheet opened from the top-bar menu button. Every page in
 * one place (the bottom bar only carries the core three + More), plus the
 * signed-in user row. This is the app's "hamburger" menu.
 */
export function AppMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { username, signOut } = useIdentity();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Menu">
        <div className="flex h-full min-h-full flex-col">
        <nav className="flex flex-col p-2">
          {NAV_LINKS.map((l) => {
            const active = l.match(router.pathname);
            return (
              <SheetClose asChild key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-900"
                      : "text-ink-700 hover:bg-ink-50",
                  )}
                >
                  <NavIcon name={l.icon} className="h-5 w-5" />
                  {l.full}
                </Link>
              </SheetClose>
            );
          })}
        </nav>
        {username && (
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-200 px-4 py-3 text-sm">
            <span className="min-w-0 truncate text-ink-600">
              Signed in as <strong className="text-ink-900">{username}</strong>
            </span>
            <SheetClose asChild>
              <button
                type="button"
                onClick={signOut}
                className="min-h-11 shrink-0 rounded-md border border-ink-300 px-3 text-ink-700 hover:bg-ink-50"
              >
                Switch user
              </button>
            </SheetClose>
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
