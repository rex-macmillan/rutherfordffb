import { ImgHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { avatarThumbUrl } from "../../lib/sleeperApi";

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  avatarId?: string | null;
  alt: string;
  size?: number;
  fallback?: string;
}

/**
 * Renders a Sleeper-CDN avatar with a colored initial-fallback if no avatar
 * is present (or the request fails).
 */
export function Avatar({
  avatarId,
  alt,
  size = 28,
  fallback,
  className,
  ...rest
}: Props) {
  const url = avatarThumbUrl(avatarId);
  const initial = (fallback ?? alt ?? "?").trim().charAt(0).toUpperCase();
  // We render the fallback in-place when no URL is set. When URL exists, the
  // <img> handles its own loading; onError swaps to the fallback overlay.
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-200 text-xs font-semibold text-ink-700",
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={alt}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          {...rest}
        />
      ) : null}
      <span aria-hidden className="select-none">
        {initial}
      </span>
    </span>
  );
}
