/**
 * Single source of truth for app navigation. Consumed by the desktop top nav
 * (Layout) and the mobile bottom tab bar (MobileTabBar). `core` links show in
 * the bottom bar; the rest live behind the "More" sheet.
 */
/** Names of the monochrome line icons rendered by components/NavIcon.tsx. */
export type NavIconName =
  | "home"
  | "board"
  | "order"
  | "rules"
  | "advisor"
  | "trade"
  | "playoffs"
  | "more";

export interface NavLink {
  href: string;
  /** Short label for the bottom tab bar. */
  label: string;
  /** Full label for the desktop nav + "More" sheet. */
  full: string;
  /** Line-icon key (rendered by NavIcon). */
  icon: NavIconName;
  /** Shown directly in the mobile bottom tab bar when true. */
  core: boolean;
  match: (pathname: string) => boolean;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Keeper", full: "Keeper Helper", icon: "home", core: true, match: (p) => p === "/" },
  { href: "/draftboard", label: "Board", full: "Draft Board", icon: "board", core: true, match: (p) => p.startsWith("/draftboard") },
  { href: "/draft-order", label: "Order", full: "Draft Order", icon: "order", core: true, match: (p) => p.startsWith("/draft-order") },
  { href: "/rules", label: "Rules", full: "Rules", icon: "rules", core: true, match: (p) => p.startsWith("/rules") },
  { href: "/advisor", label: "Advisor", full: "Advisor", icon: "advisor", core: false, match: (p) => p.startsWith("/advisor") },
  { href: "/trade-evaluator", label: "Trade", full: "Trade Eval", icon: "trade", core: false, match: (p) => p.startsWith("/trade-evaluator") },
  { href: "/playoffs", label: "Playoffs", full: "Playoffs", icon: "playoffs", core: false, match: (p) => p.startsWith("/playoffs") },
];
