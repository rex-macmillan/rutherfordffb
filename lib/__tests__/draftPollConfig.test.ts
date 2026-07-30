import { describe, expect, it } from "vitest";
import {
  DRAFT_POLL_END,
  DRAFT_POLL_START,
  draftPollDates,
  normalizeDateChoices,
  sanitizeDraftPollDates,
} from "../draftPollConfig";

describe("draftPollDates", () => {
  it("lists Aug 30 through Sep 7 inclusive", () => {
    const dates = draftPollDates();
    expect(dates[0].id).toBe(DRAFT_POLL_START);
    expect(dates[dates.length - 1].id).toBe(DRAFT_POLL_END);
    expect(dates).toHaveLength(9);
  });
});

describe("normalizeDateChoices", () => {
  it("drops invalid dates and resolves conflicts in favor of works", () => {
    const r = normalizeDateChoices(
      ["2026-08-30", "bogus"],
      ["2026-08-30", "2026-09-01"],
    );
    expect(r.available).toEqual(["2026-08-30"]);
    expect(r.unavailable).toEqual(["2026-09-01"]);
  });
});

describe("sanitizeDraftPollDates", () => {
  it("filters to poll window only", () => {
    expect(sanitizeDraftPollDates(["2026-08-30", "2026-09-10"])).toEqual([
      "2026-08-30",
    ]);
  });
});
