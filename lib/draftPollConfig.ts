/**
 * Draft date poll — one row per calendar day (night drafts assumed).
 *
 * Window: Sun Aug 30 through Mon Sep 7, 2026. Week 1 kicks off Wed Sep 9.
 * Exact start times get picked once the league settles on a day.
 */

export const CURRENT_DRAFT_POLL_ID = "2026-draft";

/** Inclusive ISO bounds for valid poll dates. */
export const DRAFT_POLL_START = "2026-08-30";
export const DRAFT_POLL_END = "2026-09-07";

export interface DraftPollDate {
  /** ISO date, YYYY-MM-DD */
  id: string;
  /** e.g. "Sunday, Aug 30" */
  label: string;
  /** Shorter column header, e.g. "Sun 8/30" */
  shortLabel: string;
  note?: string;
}

const DATE_NOTES: Record<string, string> = {
  "2026-08-30": "First option — night after preseason finale",
  "2026-09-06": "Labor Day Sunday",
  "2026-09-07": "Last option before Week 1 (Wed Sep 9)",
};

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

/** Every draft-night candidate from Aug 30 through Sep 7. */
export function draftPollDates(): DraftPollDate[] {
  const out: DraftPollDate[] = [];
  const start = parseIso(DRAFT_POLL_START);
  const end = parseIso(DRAFT_POLL_END);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const id = toIso(d);
    out.push({
      id,
      label: formatLabel(d),
      shortLabel: formatShort(d),
      note: DATE_NOTES[id],
    });
  }
  return out;
}

export const DRAFT_POLL_DATE_IDS = new Set(
  draftPollDates().map((d) => d.id),
);

export function sanitizeDraftPollDates(ids: string[]): string[] {
  return ids.filter((id) => DRAFT_POLL_DATE_IDS.has(id));
}

/** Strip overlap if someone marks the same date both ways. Works wins. */
export function normalizeDateChoices(
  available: string[],
  unavailable: string[],
): { available: string[]; unavailable: string[] } {
  const yes = new Set(sanitizeDraftPollDates(available));
  const no = sanitizeDraftPollDates(unavailable).filter((d) => !yes.has(d));
  return { available: [...yes].sort(), unavailable: [...no].sort() };
}
