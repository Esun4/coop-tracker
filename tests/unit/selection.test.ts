import { describe, it, expect } from "vitest";
import {
  EMPTY_SELECTION,
  headerState,
  pruneSelection,
  toggleAll,
  toggleRow,
  type Selection,
} from "@/lib/selection";

const ROWS = ["a", "b", "c", "d", "e"];

function selectionOf(ids: string[], anchor: string | null = null): Selection {
  return { ids: new Set(ids), anchor };
}

describe("toggleRow", () => {
  it("adds a row and makes it the anchor", () => {
    const next = toggleRow(EMPTY_SELECTION, ROWS, "b", false);
    expect([...next.ids]).toEqual(["b"]);
    expect(next.anchor).toBe("b");
  });

  it("removes a row that was already selected", () => {
    const next = toggleRow(selectionOf(["b"], "b"), ROWS, "b", false);
    expect([...next.ids]).toEqual([]);
  });

  it("shift-click selects the inclusive range from the anchor", () => {
    const anchored = toggleRow(EMPTY_SELECTION, ROWS, "b", false);
    const next = toggleRow(anchored, ROWS, "d", true);
    expect([...next.ids].sort()).toEqual(["b", "c", "d"]);
  });

  it("extends backwards when the click is above the anchor", () => {
    const anchored = toggleRow(EMPTY_SELECTION, ROWS, "d", false);
    const next = toggleRow(anchored, ROWS, "b", true);
    expect([...next.ids].sort()).toEqual(["b", "c", "d"]);
  });

  it("keeps the anchor put, so a second shift-click re-extends from it", () => {
    const anchored = toggleRow(EMPTY_SELECTION, ROWS, "b", false);
    const wide = toggleRow(anchored, ROWS, "e", true);
    const narrow = toggleRow(wide, ROWS, "c", true);
    expect(narrow.anchor).toBe("b");
    // Additive: the first range is not undone by the second.
    expect([...narrow.ids].sort()).toEqual(["b", "c", "d", "e"]);
  });

  it("leaves selected rows outside the range alone", () => {
    const state = selectionOf(["a"], "c");
    const next = toggleRow(state, ROWS, "d", true);
    expect([...next.ids].sort()).toEqual(["a", "c", "d"]);
  });

  it("falls back to a plain toggle when there is no anchor yet", () => {
    const next = toggleRow(EMPTY_SELECTION, ROWS, "c", true);
    expect([...next.ids]).toEqual(["c"]);
    expect(next.anchor).toBe("c");
  });

  it("falls back to a plain toggle when the anchor is no longer on screen", () => {
    const state = selectionOf(["z"], "z");
    const next = toggleRow(state, ROWS, "c", true);
    expect([...next.ids].sort()).toEqual(["c", "z"]);
    expect(next.anchor).toBe("c");
  });
});

describe("toggleAll", () => {
  it("selects every row on screen without touching rows off it", () => {
    const next = toggleAll(selectionOf(["z"]), ROWS, true);
    expect([...next.ids].sort()).toEqual(["a", "b", "c", "d", "e", "z"]);
  });

  it("clears only the rows on screen", () => {
    const next = toggleAll(selectionOf(["a", "b", "z"]), ROWS, false);
    expect([...next.ids]).toEqual(["z"]);
  });
});

describe("pruneSelection", () => {
  it("drops ids that are no longer in the filtered set", () => {
    const next = pruneSelection(selectionOf(["a", "z"], "z"), ROWS);
    expect([...next.ids]).toEqual(["a"]);
    expect(next.anchor).toBeNull();
  });

  it("returns the same object when nothing was pruned, so no re-render is forced", () => {
    const state = selectionOf(["a", "b"], "a");
    expect(pruneSelection(state, ROWS)).toBe(state);
  });

  it("clears an anchor that left the set even when every selected id survived", () => {
    // "z" was clicked and then clicked off again, so it anchors without being
    // selected — then a filter took it away.
    const state = selectionOf(["a", "b"], "z");
    const next = pruneSelection(state, ROWS);
    expect([...next.ids]).toEqual(["a", "b"]);
    expect(next.anchor).toBeNull();
  });
});

describe("headerState", () => {
  it("reads none, some and all off the rows on screen", () => {
    expect(headerState(EMPTY_SELECTION, ROWS)).toBe("none");
    expect(headerState(selectionOf(["a"]), ROWS)).toBe("some");
    expect(headerState(selectionOf(ROWS), ROWS)).toBe("all");
  });

  it("is none for an empty table, not all", () => {
    expect(headerState(selectionOf(["a"]), [])).toBe("none");
  });

  it("ignores selected rows that are not on screen", () => {
    expect(headerState(selectionOf([...ROWS, "z"]), ROWS)).toBe("all");
  });
});
