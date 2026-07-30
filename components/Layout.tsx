import Link from "next/link";
import { ReactNode } from "react";
import { useRouter } from "next/router";
import { LeaguePanelProvider, LeaguePanelTrigger } from "./LeaguePanel";
import MobileTabBar from "./MobileTabBar";
import { HeaderNavProvider, useHeaderNav } from "./HeaderNav";
import { Avatar } from "./ui/Avatar";
import { useIdentity } from "../lib/identity";
import { useCurrentLeague } from "../lib/leagueHooks";
import { NAV_LINKS } from "../lib/navLinks";
import { cn } from "../lib/cn";

interface Props {
  children: ReactNode;
}

function HeaderBackButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-10 min-w-10 items-center gap-0.5 rounded-lg text-ink-200 hover:bg-ink-800 hover:text-white",
        className,
      )}
      aria-label={`Back to ${label}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      <span className="hidden max-w-[5rem] truncate text-sm font-medium sm:inline">
        {label}
      </span>
    </Link>
  );
}

function LeagueTitle({ leagueName, leagueAvatar }: { leagueName: string; leagueAvatar?: string | null }) {
  return (
    <Link
      href="/"
      className="flex min-w-0 max-w-full items-center justify-center gap-2 text-sm font-semibold text-white"
    >
      {leagueAvatar ? (
        <Avatar avatarId={leagueAvatar} alt={leagueName} size={24} />
      ) : (
        <span aria-hidden>🏈</span>
      )}
      <span className="truncate">{leagueName}</span>
    </Link>
  );
}

function LayoutShell({ children }: Props) {
  const router = useRouter();
  const { username, signOut } = useIdentity();
  const { league } = useCurrentLeague();
  const { back } = useHeaderNav();

  const leagueName = league?.name ?? "Rutherford FFB";

  return (
    <div className="min-h-screen bg-ink-50">
      <nav className="sticky top-0 z-40 bg-ink-900 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-ink-100 shadow-sm">
        {/* Mobile: back · centered league · panel */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:hidden">
          <div className="justify-self-start">
            {back ? (
              <HeaderBackButton href={back.href} label={back.label} />
            ) : (
              <span className="block min-w-10" aria-hidden />
            )}
          </div>
          <div className="min-w-0 justify-self-center px-1">
            <LeagueTitle leagueName={leagueName} leagueAvatar={league?.avatar} />
          </div>
          <div className="flex justify-self-end">
            <LeaguePanelTrigger />
          </div>
        </div>

        {/* Desktop: back + league · inline nav · panel + user */}
        <div className="hidden items-center gap-2 md:flex">
          {back && (
            <HeaderBackButton
              href={back.href}
              label={back.label}
              className="-ml-1 shrink-0"
            />
          )}
          <LeagueTitle leagueName={leagueName} leagueAvatar={league?.avatar} />

          <div className="ml-4 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
            {NAV_LINKS.map((l) => {
              const active = l.match(router.pathname);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
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
              <div className="flex items-center gap-2 text-sm">
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
          </div>
        </div>
      </nav>

      <main className="px-4 py-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-6 md:py-6 md:pb-6">
        {children}
      </main>

      <MobileTabBar />
    </div>
  );
}

const Layout: React.FC<Props> = ({ children }) => {
  return (
    <LeaguePanelProvider>
      <HeaderNavProvider>
        <LayoutShell>{children}</LayoutShell>
      </HeaderNavProvider>
    </LeaguePanelProvider>
  );
};

export default Layout;
