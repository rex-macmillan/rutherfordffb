import { NavIconName } from "../lib/navLinks";
import { cn } from "../lib/cn";

/**
 * Monochrome line icons (Lucide-style) for navigation. Stroke uses
 * currentColor so active/inactive state is just a text-color change.
 * Inlined to avoid pulling in an icon library.
 */
export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  const stroke = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      {name === "home" && (
        <g {...stroke}>
          <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 21v-7h6v7" />
        </g>
      )}
      {name === "keepers" && (
        <g {...stroke}>
          <rect x="8" y="2.5" width="8" height="4" rx="1" />
          <path d="M16 4.5h2a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2" />
          <path d="m9 13.5 2 2 4-4.5" />
        </g>
      )}
      {name === "teams" && (
        <g {...stroke}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </g>
      )}
      {name === "menu" && (
        <g {...stroke}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </g>
      )}
      {name === "panels" && (
        <g {...stroke}>
          <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
          <path d="M14 2v4M8 10v4M16 18v4" />
        </g>
      )}
      {name === "board" && (
        <g {...stroke}>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <path d="M3 9h18M9 3v18" />
        </g>
      )}
      {name === "order" && (
        <g {...stroke}>
          <path d="M9 6h12M9 12h12M9 18h12" />
          <path d="M4 5.5 5.2 5v3.5M4 17h2l-2 2.5h2" />
        </g>
      )}
      {name === "rules" && (
        <g {...stroke}>
          <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
          <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
          <path d="M9 7.5h6M9 11h6" />
        </g>
      )}
      {name === "advisor" && (
        <g {...stroke}>
          <path d="M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9z" />
        </g>
      )}
      {name === "trade" && (
        <g {...stroke}>
          <path d="M7 4 3 8l4 4" />
          <path d="M3 8h14" />
          <path d="m17 20 4-4-4-4" />
          <path d="M21 16H7" />
        </g>
      )}
      {name === "playoffs" && (
        <g {...stroke}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M5 21h14" />
          <path d="M9 17.5c-.6.3-1 .9-1 1.6V21M15 17.5c.6.3 1 .9 1 1.6V21" />
          <path d="M18 4H6v6a6 6 0 0 0 12 0z" />
        </g>
      )}
      {name === "more" && (
        <g fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </g>
      )}
    </svg>
  );
}
