/**
 * Single source of truth for app navigation. Consumed by the desktop top nav
 * (Layout), the mobile bottom tab bar (MobileTabBar), the full-menu sheet
 * (AppMenu in Layout), and the Home quick-link grid. `core` links show in
 * the bottom bar; the rest live behind the "More" sheet.
 */
/** Names of the monochrome line icons rendered by components/NavIcon.tsx. */
export type NavIconName =
  | "home"
  | "keepers"
  | "board"
  | "order"
  | "teams"
  | "rules"
  | "advisor"
  | "trade"
  | "playoffs"
  | "menu"
  | "panels"
  | "more";

export interface NavLink {
  href: string;
  /** Short label for the bottom tab bar. */
  label: string;
  /** Full label for the desktop nav + menus. */
  full: string;
  /** Line-icon key (rendered by NavIcon). */
  icon: NavIconName;
  /** Shown directly in the mobile bottom tab bar when true. */
  core: boolean;
  match: (pathname: string) => boolean;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home", full: "Home", icon: "home", core: true, match: (p) => p === "/" },
  { href: "/keepers", label: "Keepers", full: "Keepers", icon: "keepers", core: true, match: (p) => p.startsWith("/keepers") },
  { href: "/draft", label: "Draft", full: "Draft", icon: "board", core: true, match: (p) => p.startsWith("/draft") },
  { href: "/teams", label: "Teams", full: "Teams", icon: "teams", core: false, match: (p) => p.startsWith("/teams") || p.startsWith("/team/") },
  { href: "/rules", label: "Rules", full: "Rules", icon: "rules", core: false, match: (p) => p.startsWith("/rules") },
  { href: "/advisor", label: "Advisor", full: "Keeper Advisor", icon: "advisor", core: false, match: (p) => p.startsWith("/advisor") },
  { href: "/trade-evaluator", label: "Trade", full: "Trade Evaluator", icon: "trade", core: false, match: (p) => p.startsWith("/trade-evaluator") },
  { href: "/playoffs", label: "Playoffs", full: "Playoffs", icon: "playoffs", core: false, match: (p) => p.startsWith("/playoffs") },
];
