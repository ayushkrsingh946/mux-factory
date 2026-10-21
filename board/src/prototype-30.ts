// PROTOTYPE for maddec01/mux-factory#30, throwaway. Lives on prototype/30-board-fresh only.
// Plan: three variants of today's Board on the existing `/` route, switchable via
// `?variant=1|2|3` and a bar at the bottom (sample mode only). They differ only in how
// far they move from today's layout. Flow is the same relationship outline in all three.
// Shared by the server and the browser, so it imports only the model.

import { AMBER_STATUSES, STATUSES, isRecentlyDone, kindLabel, kindOf, platformOf, ref } from './model.ts';
import type { BoardData, Item } from './model.ts';

export const VARIANTS = [
  { key: '1', name: "Today's layout, T3 theme" },
  { key: '2', name: 'Queued next to active work, List apart' },
  { key: '3', name: '2 with denser cards' },
] as const;

export type Variant = (typeof VARIANTS)[number]['key'];

export function variantOf(search: string): Variant {
  const key = new URLSearchParams(search).get('variant');
  return VARIANTS.find((v) => v.key === key)?.key ?? '1';
}

function esc(value: unknown): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** The Mux logo: viewBox and path copied unchanged from mux-server's BrandMark.tsx. */
export const BRAND_MARK = '<svg class="brand-mark" role="img" aria-label="Mux" viewBox="0 0 56 32" fill="none"><path d="M5 3.5v25M5 3.5V12a8.5 8.5 0 0 0 17 0V3.5M22 12c0 4.5 2 7.5 5.5 7.5M36 3.5l14 17M50 3.5l-14 17" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The prototype's bar: outside the polling render area, sample mode only. */
export function renderSwitcher(variant: Variant): string {
  const current = VARIANTS.find((v) => v.key === variant)!;
  return `<div class="proto-bar" role="region" aria-label="Prototype controls">
<button type="button" data-proto-step="-1" aria-label="Previous variant">&#8592;</button>
<span class="proto-label"><b>${esc(current.key)}</b> ${esc(current.name)}</span>
<button type="button" data-proto-step="1" aria-label="Next variant">&#8594;</button>
<span class="proto-sep" aria-hidden="true"></span>
<span class="proto-try">Try:</span>
<button type="button" data-proto-sim="refresh" title="A refresh adds an item to Needs you and drops one from In flight">Refresh with changes</button>
<button type="button" data-proto-sim="update-done">Update finished</button>
<button type="button" data-proto-sim="update-failed">Update failed</button>
</div>`;
}

// ---------- Flow: relationship outline ----------

/** A blocked-by or parent reference. On-board ones link to the item's row; the rest are references. */
interface IssueRef { repo: string; number: number; title: string; state: 'OPEN' | 'CLOSED' }

/**
 * FICTIONAL fixture links for the prototype. Today the board reads only a blocked-by
 * count, so these identities are made up to show how explicit GitHub blocked-by links,
 * and parents that aren't on the board, would look. Never inferred from the data.
 */
const FICTIONAL_BLOCKERS: Record<string, IssueRef[]> = {
  'maddec01/mux-server#140': [{ repo: 'maddec01/mux-server', number: 118, title: 'Accounts table migration', state: 'OPEN' }],
  'maddec01/mux-server#202': [{ repo: 'maddec01/mux-server', number: 201, title: 'Relay: broker only or full TURN?', state: 'OPEN' }],
  'maddec01/mux-apple#31': [{ repo: 'maddec01/mux-apple', number: 27, title: 'Artwork cache eviction', state: 'CLOSED' }],
};
const FICTIONAL_PARENTS: Record<string, IssueRef> = {
  'maddec01/mux-apple#22': { repo: 'maddec01/mux-apple', number: 9, title: 'Home screen refresh', state: 'OPEN' },
  'maddec01/mux-apple#23': { repo: 'maddec01/mux-apple', number: 9, title: 'Home screen refresh', state: 'OPEN' },
};

const keyOf = (repo: string | null, number: number | null) => (repo && number !== null ? `${repo}#${number}` : null);

function statusChip(item: Item): string {
  const amber = AMBER_STATUSES.includes(item.status) ? ' amber' : item.status === 'Done' ? ' done' : '';
  return `<span class="o-status${amber}">${esc(item.status)}</span>`;
}

function shortRef(r: IssueRef, from: string | null): string {
  return from && r.repo === from ? `#${r.number}` : `${r.repo.split('/')[1]}#${r.number}`;
}

function refLink(r: IssueRef, from: string | null, onBoard: Item | undefined): string {
  if (onBoard) {
    return `<a class="o-ref" href="#o-${esc(onBoard.id)}" data-outline-jump="${esc(onBoard.id)}"><b>${esc(shortRef(r, from))}</b> ${esc(r.title)}</a> ${statusChip(onBoard)}`;
  }
  return `<a class="o-ref off" href="https://github.com/${esc(r.repo)}/issues/${r.number}" target="_blank" rel="noopener"><b>${esc(shortRef(r, from))}</b> ${esc(r.title)}</a> <span class="o-off">not on board · ${r.state === 'OPEN' ? 'open' : 'closed'}</span>`;
}

export function renderRelationshipOutline(data: BoardData, now: number, looseOpen: boolean): string {
  const items = data.items.filter((i) => i.status !== 'Done' || isRecentlyDone(i, now));
  const byKey = new Map(items.flatMap((i) => { const k = keyOf(i.repo, i.number); return k ? [[k, i] as const] : []; }));
  const parentKey = (i: Item): string | null => {
    const k = keyOf(i.repo, i.number);
    if (i.parent) return keyOf(i.parent.repo, i.parent.number);
    return k && FICTIONAL_PARENTS[k] ? keyOf(FICTIONAL_PARENTS[k].repo, FICTIONAL_PARENTS[k].number) : null;
  };
  const children = new Map<string, Item[]>();
  for (const i of items) {
    const p = parentKey(i);
    if (p) children.set(p, [...(children.get(p) ?? []), i]);
  }
  const blockersOf = (i: Item) => FICTIONAL_BLOCKERS[keyOf(i.repo, i.number) ?? ''] ?? [];
  const blocking = new Map<string, Item[]>();
  for (const i of items) for (const b of blockersOf(i)) {
    const k = keyOf(b.repo, b.number)!;
    blocking.set(k, [...(blocking.get(k) ?? []), i]);
  }
  const order = (a: Item, b: Item) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (a.number ?? 0) - (b.number ?? 0);

  const node = (i: Item, depth: number): string => {
    const k = keyOf(i.repo, i.number);
    const kids = (k ? children.get(k) ?? [] : []).sort(order);
    const blockers = blockersOf(i);
    const blocks = k ? blocking.get(k) ?? [] : [];
    const fictionalParent = k && FICTIONAL_PARENTS[k] && !i.parent;
    const title = i.url ? `<a class="o-title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="ref">${esc(ref(i))}</span> ${esc(i.title)}</a>` : `<span class="o-title"><span class="ref">${esc(ref(i))}</span> ${esc(i.title)}</span>`;
    const subs = i.subIssues.total ? `<span class="o-subs">${i.subIssues.completed}/${i.subIssues.total} sub-issues done</span>` : '';
    const unknownBlockers = i.blockedBy > blockers.length
      ? `<li class="o-link o-unknown"><span class="o-rel">blocked by</span> ${i.blockedBy - blockers.length} issue${i.blockedBy - blockers.length === 1 ? '' : 's'} GitHub didn't name</li>` : '';
    const links = [
      ...blockers.map((b) => `<li class="o-link blocked-by"><span class="o-rel">blocked by</span> ${refLink(b, i.repo, byKey.get(keyOf(b.repo, b.number)!))} <span class="fictional">fictional</span></li>`),
      ...blocks.map((b) => `<li class="o-link blocks"><span class="o-rel">blocks</span> <a class="o-ref" href="#o-${esc(b.id)}" data-outline-jump="${esc(b.id)}"><b>${esc(ref(b))}</b> ${esc(b.title)}</a> <span class="fictional">fictional</span></li>`),
    ].join('') + unknownBlockers;
    // Sub-issues the board doesn't hold: counted from GitHub's totals, never guessed.
    const onBoardKids = k ? data.items.filter((c) => c.parent && keyOf(c.parent.repo, c.parent.number) === k).length : 0;
    const missing = i.subIssues.total - onBoardKids;
    const missingRow = missing > 0 ? `<li class="o-missing">${missing} more sub-issue${missing === 1 ? '' : 's'} not on the board</li>` : '';
    const kidRows = kids.map((c) => node(c, depth + 1)).join('') + missingRow;
    return `<li class="o-node" id="o-${esc(i.id)}" data-anchor="o:${esc(i.id)}">
<div class="o-row"><span class="plat plat-${esc(platformOf(i, data.repos).toLowerCase())}">${esc(platformOf(i, data.repos))}</span><span class="kind kind-${kindOf(i)}">${esc(kindLabel(i))}</span>${title}${statusChip(i)}${subs}${fictionalParent ? '<span class="fictional">fictional parent</span>' : ''}</div>
${links ? `<ul class="o-links">${links}</ul>` : ''}${kidRows ? `<ul class="o-tree">${kidRows}</ul>` : ''}</li>`;
  };

  const related = (i: Item) => {
    const k = keyOf(i.repo, i.number);
    return Boolean(parentKey(i) || i.subIssues.total || i.blockedBy || blockersOf(i).length || (k && (children.has(k) || blocking.has(k))));
  };
  // Roots: related items whose parent isn't on the board. An off-board parent becomes a reference root.
  const roots = items.filter((i) => related(i) && !(parentKey(i) && byKey.has(parentKey(i)!))).sort(order);
  const offParents = new Map<string, { ref: IssueRef; kids: Item[] }>();
  const onRoots: Item[] = [];
  for (const r of roots) {
    const p = parentKey(r);
    if (!p) { onRoots.push(r); continue; }
    const pr = r.parent ? { repo: r.parent.repo, number: r.parent.number, title: r.parent.title, state: 'OPEN' as const } : FICTIONAL_PARENTS[keyOf(r.repo, r.number)!]!;
    offParents.set(p, { ref: pr, kids: [...(offParents.get(p)?.kids ?? []), r] });
  }
  const offRoots = [...offParents.values()].map(({ ref: pr, kids }) => `<li class="o-node o-offroot">
<div class="o-row">${refLink(pr, null, undefined)}</div>
<ul class="o-tree">${kids.map((c) => node(c, 1)).join('')}</ul></li>`).join('');
  const loose = items.filter((i) => !related(i)).sort(order);

  return `<div class="outline">
<p class="proto-note" role="note"><strong>Prototype data.</strong> Parent and sub-issue links come from the sample. Links tagged <span class="fictional">fictional</span> are made up to show explicit GitHub blocked-by links and parents that aren't on the board; the board doesn't read blocker identities yet.</p>
<ul class="o-legend" aria-label="Legend"><li><span class="o-rel">nested</span> sub-issue of the row above</li><li><span class="o-rel">blocked by</span> GitHub's blocked-by link</li><li><span class="o-ref off sample">dashed</span> not on the board, shown as a reference</li></ul>
<ul class="o-tree o-root">${onRoots.map((r) => node(r, 0)).join('')}${offRoots}</ul>
<details class="platform o-loose" id="flow-loose"${looseOpen ? " open" : ""}><summary>${loose.length} items with no recorded relationships</summary><ul class="rows">${loose.map((i) => `<li class="row-item"><span class="plat plat-${esc(platformOf(i, data.repos).toLowerCase())}">${esc(platformOf(i, data.repos))}</span><span class="row-title"><span class="ref">${esc(ref(i))}</span> ${esc(i.title)}</span>${statusChip(i)}</li>`).join('')}</ul></details>
</div>`;
}
