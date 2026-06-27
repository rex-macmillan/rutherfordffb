/**
 * Single source of truth for app navigation. Consumed by the desktop top nav
 * (Layout) and the mobile bottom tab bar (MobileTabBar). `core` links show in
 * the bottom bar; the rest live behind the "More" sheet.
 */
export interface NavLink {
  href: string;
  /** Short label for the bottom tab bar. */
  label: string;
  /** Full label for the desktop nav + "More" sheet. */
  full: string;
  /** Emoji icon (avoids pulling in an icon library). */
  icon: string;
  /** Shown directly in the mobile bottom tab bar when true. */
  core: boolean;
  match: (pathname: string) => boolean;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Keeper", full: "Keeper Helper", icon: "🏈", core: true, match: (p) => p === "/" },
  { href: "/draftboard", label: "Board", full: "Draft Board", icon: "📋", core: true, match: (p) => p.startsWith("/draftboard") },
  { href: "/advisor", label: "Advisor", full: "Advisor", icon: "✨", core: true, match: (p) => p.startsWith("/advisor") },
  { href: "/trade-evaluator", label: "Trade", full: "Trade Eval", icon: "⚖️", core: true, match: (p) => p.startsWith("/trade-evaluator") },
  { href: "/draft-order", label: "Draft Order", full: "Draft Order", icon: "🗓️", core: false, match: (p) => p.startsWith("/draft-order") },
  { href: "/playoffs", label: "Playoffs", full: "Playoffs", icon: "🏆", core: false, match: (p) => p.startsWith("/playoffs") },
  { href: "/rules", label: "Rules", full: "Rules", icon: "📜", core: false, match: (p) => p.startsWith("/rules") },
];
