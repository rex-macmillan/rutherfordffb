import Link from "next/link";
import { ReactNode } from "react";
import { useRouter } from "next/router";
import { LeaguePanelProvider, LeaguePanelTrigger } from "./LeaguePanel";
import MobileTabBar from "./MobileTabBar";
import { useIdentity } from "../lib/identity";
import { NAV_LINKS } from "../lib/navLinks";
import { cn } from "../lib/cn";

interface Props {
  children: ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  const router = useRouter();
  const { username, signOut } = useIdentity();

  return (
    <LeaguePanelProvider>
      <div className="min-h-screen bg-ink-50">
        <nav className="sticky top-0 z-40 flex items-center gap-2 bg-ink-900 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-ink-100 shadow-sm">
          {/* Brand — mobile only (desktop leads with the nav links). */}
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm font-semibold text-white md:hidden"
          >
            <span aria-hidden>🏈</span>
            <span className="truncate">Rutherford FFB</span>
          </Link>

          {/* Desktop inline nav. */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => {
              const active = l.match(router.pathname);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-700 text-white"
                      : "text-ink-200 hover:bg-ink-800 hover:text-white",
                  )}
                >
                  {l.full}
                </Link>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <LeaguePanelTrigger />
            {username && (
              <div className="flex items-center gap-2 text-sm">
                <span className="hidden text-ink-300 sm:inline">{username}</span>
                <button
                  onClick={signOut}
                  className="hidden rounded border border-ink-700 px-2 py-0.5 text-xs text-ink-300 hover:bg-ink-800 hover:text-white md:block"
                  title="Switch user"
                >
                  switch
                </button>
              </div>
            )}
          </div>
        </nav>

        <main className="px-4 py-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:px-6 md:py-6 md:pb-6">
          {children}
        </main>

        <MobileTabBar />
      </div>
    </LeaguePanelProvider>
  );
};

export default Layout;
