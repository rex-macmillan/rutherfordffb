import Link from "next/link";
import { ReactNode, useState } from "react";
import { useRouter } from "next/router";
import { LeaguePanelProvider, LeaguePanelTrigger } from "./LeaguePanel";
import MobileTabBar from "./MobileTabBar";
import { AppMenu } from "./AppMenu";
import { NavIcon } from "./NavIcon";
import { Avatar } from "./ui/Avatar";
import { useIdentity } from "../lib/identity";
import { useCurrentLeague } from "../lib/leagueHooks";
import { NAV_LINKS } from "../lib/navLinks";
import { cn } from "../lib/cn";

interface Props {
  children: ReactNode;
}

const Layout: React.FC<Props> = ({ children }) => {
  const router = useRouter();
  const { username, signOut } = useIdentity();
  const { league } = useCurrentLeague();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <LeaguePanelProvider>
      <div className="min-h-screen bg-ink-50">
        <nav className="sticky top-0 z-40 flex items-center gap-2 bg-ink-900 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-ink-100 shadow-sm">
          {/* League identity — tap goes home. */}
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white"
          >
            {league?.avatar ? (
              <Avatar avatarId={league.avatar} alt={league.name} size={24} />
            ) : (
              <span aria-hidden>🏈</span>
            )}
            <span className="truncate">{league?.name ?? "Rutherford FFB"}</span>
          </Link>

          {/* Desktop inline nav. */}
          <div className="ml-4 hidden items-center gap-0.5 md:flex">
            {NAV_LINKS.map((l) => {
              const active = l.match(router.pathname);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
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

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <LeaguePanelTrigger />
            {username && (
              <div className="hidden items-center gap-2 text-sm md:flex">
                <span className="hidden text-ink-300 lg:inline">{username}</span>
                <button
                  onClick={signOut}
                  className="rounded border border-ink-700 px-2 py-0.5 text-xs text-ink-300 hover:bg-ink-800 hover:text-white"
                  title="Switch user"
                >
                  switch
                </button>
              </div>
            )}
            {/* Full-menu button — the mobile "hamburger". */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              className="grid h-10 w-10 place-items-center rounded-lg text-ink-200 hover:bg-ink-800 hover:text-white md:hidden"
            >
              <NavIcon name="menu" className="h-6 w-6" />
            </button>
          </div>
        </nav>

        <main className="px-4 py-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-6 md:py-6 md:pb-6">
          {children}
        </main>

        <MobileTabBar />
        <AppMenu open={menuOpen} onOpenChange={setMenuOpen} />
      </div>
    </LeaguePanelProvider>
  );
};

export default Layout;
