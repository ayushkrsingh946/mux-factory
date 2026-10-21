# Dashboard design study — issue 30

Throwaway UI demonstration on the existing `/` dashboard route. Three directions
answer the hierarchy/layout question; no direction is selected or validated yet.
The existing app is the design reference. No external reference was supplied.

From this checkout, run one command:

```sh
pnpm --dir board run prototype:30
```

Uses spare port 4318 by default (`BOARD_PORT` can override it). The runner refuses
4317 and production mode. Board URLs are `http://127.0.0.1:4318/?variant=A`, `B`,
and `C`; append `#flow` for each relationship view. Use the floating bottom bar or
left/right arrows to compare. Typing in inputs does not change direction.

- A, Attention board: existing grouped cards, amber attention area first, full-width
  concept context, and compact platform lists. Flow branches beneath its concept.
- B, Work ledger: aligned rows, status gutter, work in the middle, actions at the
  right; direct comparison and denser scanning. Flow becomes an indented outline.
- C, Studio workspace: navigation rail, parallel work lanes, and a selected-item
  inspector. Flow puts the parent beside its decision/build branches.

All share fixtures, counts, actions, and in-memory state when switched. The common
contract is to put work ahead of chrome, retain the Board's existing information
and actions, keep statuses legible without color, and preserve light/dark theme
tokens. Narrow layouts stack content; item details open a native modal where the
inline inspector would be below the fold. Native forms/dialogs, focus indicators,
and keyboard controls remain available. Reject decorative metrics, implied
dependency edges, fabricated assignees, and throughput charts.

## Model evidence and fixture assumptions

`src/model.ts` and `test/sample.json` are the source. `parent` carries a repo and
issue number, so the prototype joins those exact keys; `subIssues` supplies totals;
`linkedPrs` supplies explicit links and checks. Kinds come from the same labels as
the existing board (`concept`, `decision:*`, `build`). No decision-to-build edge
can be inferred from a shared parent. `blockedBy` is a count, not an identity list.

The #200 concept has 6 reported children / 2 completed. Only 4 children (3 decisions
and 1 build) appear in the fixture snapshot. The map explicitly labels the 2 absent
children. Sample issue contents are realistic fixtures, not claims about current
GitHub state. Fixture time is pinned to 21 October 2026, 10:00 UTC so recent Done
and check-age states remain comparable. Demo-created numbers start at #901; they
have no GitHub URL. Creation descriptions are accepted but not persisted.

Open product/API questions for implementation: fetch blocker identities before
showing dependency edges; decide whether decision→build dependencies are explicit
GitHub blocking relationships or a new domain relation; decide whether to fetch
children outside the project. Decision outcomes, assignees, estimates and thread
links for pre-existing work are not supplied by this model. No UI promises them.

## Interaction demonstration

The fixture-only runner has no GitHub/updater/T3 imports. It rejects every non-read
request; its CSP disables browser connections. Queue, Start, Abandon, Add item,
Refresh and Update are memory-only simulations. Reload resets state. Original
GitHub issue/PR links are read-only outbound links. Command Copy uses clipboard.
The bottom demo console exposes the relevant state and can simulate success,
failure, completed updates, connection loss/recovery, insertion above the reading
item, removal, creation, and explicit View item. It can reset the demo.

Successful actions and completed-update notices can be closed and expire after
5000 ms. Failure notices stay until dismissed. Connection warnings stay until
recovery; update progress stays until its simulated completion. Every 15 s a
memory-only refresh exercises the known lower-control-focus regression.

Every render captures the reading item's identity and viewport offset, restores
that item or the nearest surviving old neighbor, then restores focus with
`preventScroll`. Creation preserves reading position. View item opens List and
explicitly jumps/focuses the destination. Details preserves position; on narrow
screens it opens a modal. Native viewport limits can clamp restoration near the
absolute end of a shortened page. This is demonstration code, not the production
scroll implementation.

Screenshots and browser exercise scripts live outside the checkout under
`${TMPDIR:-/tmp}/mux-30-ui/`; do not commit them or attach them to the issue/PR.
No issue or board status was changed. No PR is needed for this throwaway branch.

## Verification recorded with the prototype

Typecheck and all 85 existing board tests pass. No prototype tests were added.
A real Chrome exercise checked all three directions: five-second notice expiry,
persistent failures and warnings, recovery, insertion above, creation (quick add
and full form), queue/start/abandon stubs, nearest surviving item, explicit View
item, and variant/Flow URL state. Item offsets stayed within one CSS pixel
(browser scroll-coordinate rounding). The exact 15-second lower-focus reproduction
kept `scrollY` at 0. Board and Flow had no horizontal overflow at widths 320, 768,
1024 and 1440. Narrow item details and keyboard suppression in inputs worked.
Light/dark screenshots were inspected. Browser console errors: 0; non-GET
requests: 0. The T3 preview loaded and supported early inspection, but snapshot
failed twice with `Preview automation snapshot timed out after 15000ms.`;
verification and screenshots used a separate local Chrome session after that.
