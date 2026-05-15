import clsx, { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class-merger: clsx + de-dupes conflicting utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
