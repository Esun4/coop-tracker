/**
 * Row-selection set maths, kept out of the component so the two rules that are
 * easy to get wrong — shift-range extension and pruning — can be tested without
 * a DOM.
 *
 * `anchor` is the last row toggled on its own. Shift-clicking extends from the
 * anchor to the clicked row and leaves the anchor where it is, so a second
 * shift-click re-extends from the same origin rather than walking forward.
 */

export interface Selection {
  readonly ids: ReadonlySet<string>;
  /** Origin of the next shift-range; null when nothing has been clicked yet. */
  readonly anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: null };

/** How the header checkbox should read for the rows currently on screen. */
export type HeaderState = "none" | "some" | "all";

/**
 * Toggle one row. With `extend`, adds every row between the anchor and `id`
 * inclusive — additive, so an existing selection outside the range survives.
 */
export function toggleRow(
  state: Selection,
  orderedIds: readonly string[],
  id: string,
  extend: boolean,
): Selection {
  const anchorIndex = state.anchor ? orderedIds.indexOf(state.anchor) : -1;
  const index = orderedIds.indexOf(id);

  // A range needs both ends present in the rows on screen. If either has been
  // filtered or paged away, fall through to a plain toggle rather than guessing.
  if (extend && anchorIndex !== -1 && index !== -1) {
    const [from, to] =
      anchorIndex <= index ? [anchorIndex, index] : [index, anchorIndex];
    const ids = new Set(state.ids);
    for (const rangeId of orderedIds.slice(from, to + 1)) ids.add(rangeId);
    return { ids, anchor: state.anchor };
  }

  const ids = new Set(state.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, anchor: id };
}

/** Select or clear every row on screen. Leaves rows off screen untouched. */
export function toggleAll(
  state: Selection,
  orderedIds: readonly string[],
  select: boolean,
): Selection {
  const ids = new Set(state.ids);
  for (const id of orderedIds) {
    if (select) ids.add(id);
    else ids.delete(id);
  }
  return { ids, anchor: null };
}

/**
 * Drop ids that no longer exist in `allowedIds`. Called when the filtered set
 * changes: the bar must never claim a count that includes rows the user has
 * filtered away or applications that were deleted underneath them.
 */
export function pruneSelection(
  state: Selection,
  allowedIds: readonly string[],
): Selection {
  const allowed = new Set(allowedIds);
  const ids = new Set<string>();
  for (const id of state.ids) if (allowed.has(id)) ids.add(id);

  // The anchor is checked separately: it is the last row *clicked*, which may
  // have been clicked off again, so it can leave the set while every selected
  // id is still valid.
  const anchor =
    state.anchor && allowed.has(state.anchor) ? state.anchor : null;

  // Same object when nothing changed, so a derived prune does not invalidate
  // memoisation on every render.
  if (ids.size === state.ids.size && anchor === state.anchor) return state;
  return { ids, anchor };
}

export function headerState(
  state: Selection,
  orderedIds: readonly string[],
): HeaderState {
  if (orderedIds.length === 0) return "none";
  let selected = 0;
  for (const id of orderedIds) if (state.ids.has(id)) selected += 1;
  if (selected === 0) return "none";
  return selected === orderedIds.length ? "all" : "some";
}
