// THROWAWAY #30: D/E revisions on the existing / route; A/B/C are history.
// Current question: full-width active work + next queue, with a separate compact List.
import { renderRevised } from './prototype-revision.ts';
import { esc, renderBoardView, stepBar } from './render.ts';
import { countsOf, kindOf, kindLabel, platformOf, ref, checkState, isSlow, isRecentlyDone, workCommand, canAbandon } from './model.ts';
import type { BoardData, Item } from './model.ts';
export type Variant = 'A' | 'B' | 'C' | 'D' | 'E';
export const directions = { A: 'Attention board', B: 'Work ledger', C: 'Studio workspace', D: 'Work register', E: 'Work lanes' };
export const fixtureNow = Date.parse('2026-10-21T10:00:00Z');
export interface DemoState {
  boardArea: 'work' | 'list'; variant: Variant; view: 'board' | 'flow'; selected: string; toggled: Record<string, boolean>;
  warning: boolean; updating: boolean; refreshes: number; added: number; removed: string;
  notices: { id: number; tone: 'success' | 'failure'; text: string; item?: string }[];
}
const button = (action: string, text: string, value = '', cls = '') => `<button class="copy ${cls}" data-${action}="${esc(value)}">${text}</button>`;
function itemActions(item: Item, data: BoardData): string {
  const cmd = workCommand(item);
  return `<div class="item-actions">${button('inspect', 'Details', item.id)}${item.status === 'List' ? button('queue', 'Queue', item.id) : ''}${canAbandon(item) ? button('abandon', 'Abandon', item.id, 'abandon') : ''}${item.status === 'Queued' && cmd ? button('start', data.started?.[item.id] ? 'Thread started (demo)' : 'Start', item.id, 'start-item') : ''}</div>${item.status === 'Queued' && cmd ? `<div class="cmd"><code>${esc(cmd)}</code>${button('copy', 'Copy', cmd)}</div>` : item.status === 'Queued' ? '<p class="foot">Convert this draft to an issue before starting.</p>' : ''}`;
}
function details(item: Item, data: BoardData): string {
  return `<div class="item-meta"><span class="kind kind-${kindOf(item)}">${esc(kindLabel(item))}</span><span>${esc(platformOf(item, data.repos))}</span><span>${esc(item.state ?? 'Draft')}</span>${item.blockedBy ? `<span class="blocked">Blocked by ${item.blockedBy} · identities unavailable</span>` : ''}${item.subIssues.total ? `<span>${item.subIssues.completed}/${item.subIssues.total} sub-issues complete</span>` : ''}</div>${item.parent ? `<p class="parent">Part of <a target="_blank" rel="noopener" href="${esc(item.parent.url)}">#${item.parent.number} ${esc(item.parent.title)}</a></p>` : ''}<div class="fixture-labels">${item.labels.map(l => `<span class="label">${esc(l)}</span>`).join('')}</div>${item.linkedPrs.map(pr => {
    const state = checkState(pr.checks); const slow = pr.checks && isSlow(pr.checks, fixtureNow);
    return `<p class="foot"><a href="${esc(pr.url)}" target="_blank" rel="noopener">PR #${pr.number}${pr.isDraft ? ' · draft' : ''} · ${esc(pr.state.toLowerCase())}</a>${state ? `<span class="checks ${state}${slow ? ' slow' : ''}">${state === 'running' ? `${pr.checks!.passed}/${pr.checks!.total} checks · ${pr.checks!.running} running${slow ? ' · over 30m' : ''}` : `checks ${state} · ${pr.checks!.passed}/${pr.checks!.total}`}</span>` : ''}</p>`;
  }).join('')}${data.started?.[item.id] ? '<p class="foot">Demo thread started · no T3 thread was created.</p>' : ''}`;
}
function itemCard(item: Item, data: BoardData, context = 'board'): string {
  return `<article tabindex="-1" class="work-item ${['Needs you','Verify','Ready to merge'].includes(item.status) ? 'attention' : ''}" data-anchor="${context}-${esc(item.id)}" data-item="${esc(item.id)}"><div class="item-heading"><span class="ref">${esc(ref(item))}</span><span class="status-text">${esc(item.status)}</span></div><h3>${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)}</h3>${details(item, data)}${stepBar(item.status)}${itemActions(item, data)}</article>`;
}
function groups(data: BoardData): { id: string; title: string; note: string; items: Item[] }[] {
  const items = data.items;
  return [
    {id:'needs-you', title:'Needs you', note:'Answer, verify or merge', items:items.filter(i=>['Needs you','Verify','Ready to merge'].includes(i.status))},
    {id:'in-flight', title:'In flight', note:'Shaping, ready, building and review', items:items.filter(i=>['Shaping','Ready','In progress','Review'].includes(i.status) && kindOf(i)!=='concept')},
    {id:'concepts', title:'Concepts', note:'Parent issues and their open questions', items:items.filter(i=>kindOf(i)==='concept' && i.status!=='Done')},
    {id:'queued', title:'Queued', note:'Ready to start a mux-work thread', items:items.filter(i=>i.status==='Queued')},
    {id:'list', title:'List', note:'Captured work by platform', items:items.filter(i=>i.status==='List')},
    {id:'done', title:'Done', note:'Closed in the last 7 days', items:items.filter(i=>isRecentlyDone(i,fixtureNow))},
  ];
}
export function VariantA(data: BoardData, state: DemoState): string {
  return `<div class="attention-board">${renderBoardView(data,{now:fixtureNow,ui:{view:'board',flowTab:'all',toggled:state.toggled}})}</div>`;
}
export function VariantB(data: BoardData): string {
  return `<div class="ledger"><div class="ledger-columns" aria-hidden="true"><span>Work / relationships</span><span>State, platform & actions</span></div>${groups(data).map(g=>`<section id="${g.id}" class="ledger-group"><h2>${g.title} <span>${g.items.length}</span><small>${g.note}</small></h2>${g.items.map(i=>itemCard(i,data)).join('') || '<p class="empty">No items here.</p>'}</section>`).join('')}</div>`;
}
export function VariantC(data: BoardData): string {
  return `<div class="studio-lanes">${groups(data).map((g,n)=>`<section id="${g.id}" class="studio-lane lane-${n}"><header><span class="eyebrow">0${n+1}</span><h2>${g.title} <span>${g.items.length}</span></h2><p>${g.note}</p></header>${g.items.map(i=>itemCard(i,data)).join('') || '<p class="empty">No items here.</p>'}</section>`).join('')}</div>`;
}
function flow(data: BoardData, state: DemoState): string {
  const concepts = data.items.filter(i=>kindOf(i)==='concept');
  const related = (i: Item, p: Item) => i.parent?.number === p.number && i.parent?.repo === p.repo;
  const loose = data.items.filter(i=>!concepts.includes(i) && !concepts.some(p=>related(i,p)));
  return `<div class="relationship-map map-${state.variant}"><div class="flow-intro"><h2>How the work connects</h2><p>Concept → sub-issue is a parent relationship. PR links belong to their issue. Status is context, not an edge.</p><div class="relation-key"><span>└─ parent / child</span><span>↗ linked PR</span><span>⚑ blocker count only</span></div></div>${concepts.map(p=> {
    const children=data.items.filter(i=>related(i,p));
    return `<section class="concept-map" aria-label="${esc(p.title)} relationships"><div class="root-node">${itemCard(p,data,'flow')}<p class="map-annotation">${children.length} of ${p.subIssues.total} reported children in this snapshot. ${p.subIssues.total-children.length} are outside this board snapshot.</p></div><div class="relationship-children">${['decision','build'].map(kind=>`<section class="relation-branch"><h2>└─ ${kind==='decision'?'Decisions':'Builds'} <span>${children.filter(i=>kindOf(i)===kind).length}</span></h2><p class="branch-note">Sub-issues of #${p.number}</p>${children.filter(i=>kindOf(i)===kind).map(i=>itemCard(i,data,'flow')).join('')}</section>`).join('')}</div></section>`;
  }).join('')}<aside class="model-note"><strong>Dependency detail is unavailable</strong><p>Owner accounts is blocked by 1 issue. The current API model supplies the count, not its identity. No decision-to-build dependency is inferred here.</p></aside><details class="other-work" ${state.toggled['other-work']?'open':''} id="other-work"><summary>Other work · ${loose.length} items without a concept parent in this snapshot</summary><div class="loose-items">${loose.map(i=>itemCard(i,data,'flow')).join('')}</div></details></div>`;
}
function inspector(data: BoardData, state: DemoState): string {
  const item=data.items.find(i=>i.id===state.selected) ?? data.items.find(i=>kindOf(i)==='concept')!;
  return `<aside class="inspector" aria-label="Item inspector"><div class="eyebrow">Selected item</div><h2>${esc(ref(item))} ${esc(item.title)}</h2>${details(item,data)}<p class="inspect-time">Updated ${esc(item.updatedAt.replace('T',' ').replace('Z',' UTC'))}</p>${stepBar(item.status)}<p class="foot">${item.status==='Needs you'?'Answer in its T3 thread.':item.status==='Verify'?'Test with the PR steps, then merge.':item.status==='Ready to merge'?'Merge the PR after reviewing its checks.':'Open the issue for the full discussion.'}</p>${itemActions(item,data)}<p class="map-annotation">Fixture data. No assignees, estimates, dependency targets or decision outcomes are available in this model.</p></aside>`;
}
export function renderPrototype(data: BoardData, state: DemoState): string {
  const c=countsOf(data);
  const nav=`<nav class="view-nav" aria-label="Dashboard views"><button data-view="board" aria-current="${state.view==='board'?'page':'false'}">Board</button><button data-view="flow" aria-current="${state.view==='flow'?'page':'false'}">Flow <span>Relationships</span></button></nav>`;
  const rail=`<aside class="studio-rail"><a class="wordmark" href="?variant=C">m<span>ux</span><i>factory</i></a>${nav}<div class="rail-label">On the board</div>${groups(data).map(g=>`<a href="#${g.id}" data-section="${g.id}">${g.title}<b>${g.items.length}</b></a>`).join('')}<p>Local workspace<br>Fixture · 21 Oct 2026</p></aside>`;
  const revised=state.variant==='D'||state.variant==='E';
  return (revised ? renderRevised(data,state) : `<div class="prototype-label"><span>DESIGN STUDY / 30</span> Throwaway · all actions stay in memory <span>Fixture snapshot · 21 Oct, 10:00</span></div><div class="shell direction-${state.variant}">${state.variant==='C'?rail:''}<div class="main-shell"><header class="workspace-header">${state.variant!=='C'?'<a class="wordmark" href="?variant=A">m<span>ux</span><i>factory</i></a>':''}<div class="workspace-heading"><p class="eyebrow">${state.variant==='B'?'WORK REGISTER':'YOUR WORKSPACE'}</p><h1>${state.view==='flow'?'Flow':'Board'}</h1></div><div class="header-actions">${button('refresh','↻ Refresh')}${button('update',state.updating?'Updating…':'Update')}${button('add-item','+ Add item','','submit-item')}</div></header>${state.variant!=='C'?nav:''}<div class="workspace-summary"><div><strong>${c.needsYou}</strong><span>need you</span></div><div><strong>${c.inFlight}</strong><span>in flight</span></div><div><strong>${c.queued}</strong><span>queued</span></div><div><strong>${c.list}</strong><span>in List</span></div><p>Read from fixtures · refreshed ${state.refreshes}×<br>Same information. Three ways to see it.</p></div><div class="notice-stack" aria-live="polite">${state.warning?'<div class="ongoing-warning" role="status"><strong>⚑ Connection unavailable</strong><span>Showing the last good snapshot. This warning stays until connectivity recovers.</span></div>':''}${state.updating?'<div class="ongoing-warning" role="status"><strong>Updating the board (demo)…</strong><span>Fetch → install → restart. No updater is running.</span></div>':''}${state.notices.map(n=>`<div class="notice ${n.tone}" role="${n.tone==='failure'?'alert':'status'}"><span><strong>${n.tone==='failure'?'Action failed':'✓'}</strong> ${esc(n.text)}</span>${n.item?button('view-item','View item',n.item):''}${button('dismiss','×',String(n.id),'dismiss')}</div>`).join('')}</div><div class="content-grid"><main id="workspace" tabindex="-1">${state.view==='flow'?flow(data,state):state.variant==='A'?VariantA(data,state):state.variant==='B'?VariantB(data):VariantC(data)}</main>${inspector(data,state)}</div><footer class="model-footer">Fixture assumptions: realistic sample issues; demo creation, starts and updates are simulated. Parent refs and linked PRs are real model semantics. Blockers have counts only.</footer></div></div>`) + `<details class="demo-console"><summary>Demo controls <span>in memory</span></summary><p>Try these while reading lower down. Only “View item” jumps.</p><div>${button('demo','Success','success')}${button('demo','Failure','failure')}${button('demo','Completed update','completed')}${button('demo',state.warning?'Recover connection':'Ongoing warning','warning')}${button('demo','Refresh + insert above','insert')}${button('demo','Remove reading item','remove')}${button('demo','Quick add to List','add')}${button('demo','View latest item','view')}${button('demo','Reset demo','reset')}</div><output>${esc(JSON.stringify({variant:state.variant,view:state.view,boardArea:state.boardArea,items:data.items.length,refreshes:state.refreshes,added:state.added,notices:state.notices.length,warning:state.warning,updating:state.updating,selected:state.selected,removed:state.removed||null}))}</output></details>${prototypeSwitcher(state.variant)}`;
}
function prototypeSwitcher(variant: Variant): string {
  return `<nav class="prototype-switcher" aria-label="Prototype variants"><button data-cycle="-1" aria-label="Previous variant">←</button><span><b>${variant}</b> ${directions[variant]} <small>← → to compare</small></span><button data-cycle="1" aria-label="Next variant">→</button></nav>`;
}
