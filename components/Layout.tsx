import Link from "next/link";
import { ReactNode, useState } from "react";
import { useRouter } from "next/router";
import { LeaguePanelProvider, LeaguePanelTrigger } from "./LeaguePanel";
import { useIdentity } from "../lib/identity";
import { cn } from "../lib/cn";

interface Props {
  children: ReactNode;
}

const links = [
  { href: "/", label: "Keeper Helper", match: (p: string) => p === "/" },
  { href: "/advisor", label: "Advisor", match: (p: string) => p.startsWith("/advisor") },
  { href: "/trade-evaluator", label: "Trade Eval", match: (p: string) => p.startsWith("/trade-evaluator") },
  { href: "/draftboard", label: "Draft Board", match: (p: string) => p.startsWith("/draftboard") },
  { href: "/playoffs", label: "Playoffs", match: (p: string) => p.startsWith("/playoffs") },
  { href: "/rules", label: "Rules", match: (p: string) => p.startsWith("/rules") },
];

const Layout: React.FC<Props> = ({ children }) => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { username, signOut } = useIdentity();

  return (
    <LeaguePanelProvider>
      <div className="min-h-screen bg-ink-50">
        <nav className="sticky top-0 z-40 flex items-center gap-2 bg-ink-900 px-4 py-2 text-ink-100 shadow-sm">
          <button
            className="grid h-9 w-9 place-items-center rounded-md text-xl text-ink-100 hover:bg-ink-800 md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? "×" : "☰"}
          </button>

          <div
            className={cn(
              "flex flex-col gap-1 md:flex md:flex-row md:gap-1",
              menuOpen
                ? "absolute left-0 right-0 top-full bg-ink-900 px-4 py-3 shadow-md"
                : "hidden md:flex",
            )}
            onClick={() => setMenuOpen(false)}
          >
            {links.map((l) => {
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
                  {l.label}
                </Link>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <LeaguePanelTrigger />
            {username && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-300">{username}</span>
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
        </nav>
        <main className="px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>
    </LeaguePanelProvider>
  );
};

export default Layout;
