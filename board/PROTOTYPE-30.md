# Dashboard design study — issue 30, revision 2

Throwaway UI on `/`, with all mutations simulated in browser memory. Pedro rejected
Boards A/B/C, selected Flow B's indented relationship outline, and confirmed the
scope as parent/child plus explicit GitHub blocked-by links, including off-board
issue references. Never infer dependencies from sibling issues.

Run from this assigned checkout:

```sh
pnpm --dir board run prototype:30
```

Uses spare port 4318, refuses 4317 and production mode. Current comparison bar
cycles D/E (also left/right arrows, except while typing). Defaults to D. A/B/C
remain accessible by query parameter and in commit `4939b47`; they are historical
rejected alternatives, not the current comparison.

- D: `http://127.0.0.1:4318/?variant=D` — full-width register, amber attention strip,
  next queue immediately below it, then active rows. Compact List is a separate
  Board-area tab: `?variant=D&area=list`.
- E: `http://127.0.0.1:4318/?variant=E` — equal active-work lanes, a full-width next
  queue below them, then a distinctly separated collapsed List.
- Both: append `#flow` for the same selected indented relationship outline.

Both use the entire available window with 28px edge padding (16px narrow),
horizontal navigation, no sidebar or inspector panel, and no invented wordmark.
Desktop List rows are about 39px high; narrow rows wrap their titles/actions.
Duplicate kind/label badges are removed. Kind, labels, issue state, timestamps,
parent, sub-issues, blocker count, PR/check detail and queued command remain
accessible in native item-detail dialogs. Queue/Start/Abandon/Add actions remain
available. Concepts and recent Done are compact expandable supporting sections.
Existing theme tokens supply light/dark styles and visible keyboard focus.

The exact SVG path from the read-only sibling source
`/Users/pedrogomes/Developer/Mux/mux-server/web/src/shared/design-system/display/BrandMark.tsx`
is embedded unchanged. No sibling files were edited. No external design reference
was supplied; Pedro's feedback and the product's own mark/tokens are the contract.

## Relationships and fixture boundaries

Source is `src/model.ts` plus `test/sample.json`. Parent joins use both repository
and issue number. Concept #200 reports 6 children / 2 complete, while this board
snapshot contains 4 children. The 2 absent children are explicitly called out.
PR links are explicit source relationships. Fixture time stays pinned at
21 October 2026, 10:00 UTC so check ages and recent Done stay comparable.

The source model only contains a `blockedBy` count. The real blocker identity for
Owner accounts is not invented. A separate, prominently labeled fictional example
shows EX-01 as parent, EX-02/EX-03 as its children, an explicit EX-03 blocked-by
EX-02 link, and a fictional off-board `example/auth-service#44` dependency. These
are static demo references with no outbound GitHub links. Off-board references do
not become board items. Production needs the GitHub blocked-by identity fields
(repository, issue number, title, URL), including off-board references. The scope
is decided; implementing that read model/API work remains outside this prototype.
Whether to fetch missing concept children remains open.

## Behavior contract and safety

All actions, refreshes, updates and thread starts stay in memory. No fetch,
GitHub/updater/T3 imports, persistence, or real update processes. Server rejects
non-read requests; CSP disables browser connections. Reload resets fixtures.
Actual fixture issue/PR links are ordinary read-only outbound links. Demo-created
items start at #901 without a GitHub URL; descriptions are not persisted.

Success/completed-update notices are dismissible and expire in 5000 ms. Failures
stay until dismissed; warnings stay until the condition resolves. Rendering keeps
the visible item and its viewport offset, or the nearest surviving old neighbor,
then restores focus with `preventScroll`. Creation keeps the current reading area;
View item explicitly opens the destination List/tab and jumps to the item. Native
viewport limits can clamp restoration at the end of a shortened page. A 15-second
memory-only refresh exercises the original focused-lower-control regression.

The floating demo controls expose success, failure, completed update, connection
loss/recovery, insertion above, removal, quick add, View item and reset, alongside
relevant memory state. The same behavior is shared between D/E and Flow.

Screenshots/browser exercise scripts stay outside this checkout in
`${TMPDIR:-/tmp}/mux-30-ui/`, with D/E prefixes. No screenshot commits, PR, issue
updates or board-status changes. No production implementation is selected yet.

## Revision 2 verification

Typecheck passes. No production tests were added or rerun for this design-only
revision. Real Chrome exercised D/E: 5-second success/completed-update expiry,
failure dismissal and persistence, warning recovery, quick/full-form creation,
insertions above, nearest surviving item after removal, explicit View item opening
List, queue/start/abandon stubs, detail dialogs, and keyboard cycling. Screen
offsets stayed within one CSS pixel of their original position. Both exact
15-second lower-control-focus reproductions kept scrollY at zero.

Board, open List, and Flow have no horizontal overflow at widths 320, 390, 768,
1024, 1440 and 1920. Content spans viewport width minus edge padding. D/E Flow
content is identical. Desktop List row height: 39px. Light/dark and narrow
screenshots were inspected. Console errors: 0. Write requests: 0. T3 navigation
works, but snapshot timed out twice (`Preview automation snapshot timed out after
15000ms.`), so screenshots and interaction verification used local Chrome.
