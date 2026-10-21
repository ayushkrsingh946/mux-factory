// Browser side: keeps the page live by fetching /api/board every 15 s (every
// second during an update) and re-rendering with the same template the server used.

import { DEFAULT_UI, abandonPrompt, listGroupId, renderApp } from './render.ts';
import type { FlowTab, ItemAction, RenderOptions, UiState, UpdateView, View } from './render.ts';
import { platformOf } from './model.ts';
import type { BoardData } from './model.ts';
import { validateDraft } from './add-item.ts';
import type { CreationResult, ItemDraft } from './add-item.ts';
import type { StartResult } from './t3.ts';
import { VARIANTS, variantOf } from './prototype-30.ts';
import type { Item, UpdateProgress } from './model.ts';

const POLL_MS = 15_000;
const UPDATE_POLL_MS = 1_000;
/** How long the board may stay away during an update before the page says it didn't restart. */
const RESTART_MS = 30_000;
const app = document.getElementById('app')!;
const bootstrap = document.getElementById('board-data');
const dialog = document.getElementById('add-item-dialog') as HTMLDialogElement;
const form = document.getElementById('add-item-form') as HTMLFormElement;
const repoSelect = form.elements.namedItem('repo') as HTMLSelectElement;

let data: BoardData = JSON.parse(bootstrap?.textContent ?? 'null');
let clientError: string | null = null;
let notice: RenderOptions['notice'] = null;
const actions: Record<string, ItemAction> = {};
let mutationVersion = 0;
let pollSequence = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let updateView: UpdateView | null = null;
let refusedAt = 0;
let lastBoard = '';
/** The update this page follows: the session it started in, and since when the board has been away. */
let updating: { session: string | undefined; awaySince: number | null } | null = null;
const ui: UiState = {
  ...DEFAULT_UI,
  view: location.hash === '#flow' ? 'flow' : 'board',
  toggled: {},
  variant: variantOf(location.search),
};

// ---------- PROTOTYPE #30: notices that clear themselves ----------

/** How long a success stays on screen. Failures and ongoing warnings stay. */
const SUCCESS_MS = 5_000;
const DISMISSED_KEY = 'mux-board-dismissed';
const dismissed: string[] = (() => {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]; } catch { return []; }
})();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
const expiring = new Set<string>();

function dismissKey(key: string): void {
  if (key === 'notice') {
    notice = null;
    clearTimeout(noticeTimer);
  } else if (!dismissed.includes(key)) {
    dismissed.push(key);
    if (key.startsWith('update-')) localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.filter((k) => k.startsWith('update-')).slice(-20)));
  }
  render();
}

function setNotice(next: RenderOptions['notice']): void {
  notice = next;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => dismissKey('notice'), SUCCESS_MS);
}

/** Starts the clock on a finished update's toast the first time this page shows it. */
function scheduleExpiring(): void {
  app.querySelectorAll<HTMLElement>('[data-expires]').forEach((el) => {
    const key = el.dataset.expires!;
    if (expiring.has(key)) return;
    expiring.add(key);
    setTimeout(() => dismissKey(key), SUCCESS_MS);
  });
}

// ---------- PROTOTYPE #30: keep the reading position ----------

type Anchor = { keys: string[]; index: number; top: number } | null;

function anchorKeys(): { els: HTMLElement[]; keys: string[] } {
  const els = [...app.querySelectorAll<HTMLElement>('[data-anchor]')].filter((el) => el.getClientRects().length > 0);
  const seen = new Map<string, number>();
  const keys = els.map((el) => {
    const key = el.dataset.anchor!;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}|${n}`;
  });
  return { els, keys };
}

/** The first item at least partly in view, and where it sits. Nothing at the very top: stay there. */
function captureAnchor(): Anchor {
  if (window.scrollY < 1) return null;
  const { els, keys } = anchorKeys();
  const index = els.findIndex((el) => el.getBoundingClientRect().bottom > 0);
  if (index < 0) return null;
  return { keys, index, top: els[index]!.getBoundingClientRect().top };
}

/** Puts the same item back in the same place; if it left, the nearest item that survived. */
function restoreAnchor(anchor: Anchor): void {
  if (!anchor) return;
  const { els, keys } = anchorKeys();
  const at = new Map(keys.map((k, i) => [k, els[i]!]));
  for (let d = 0; d < anchor.keys.length; d++) {
    for (const i of d ? [anchor.index + d, anchor.index - d] : [anchor.index]) {
      const el = at.get(anchor.keys[i] ?? '');
      if (!el) continue;
      window.scrollBy(0, el.getBoundingClientRect().top - anchor.top);
      return;
    }
  }
}

function render(): void {
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.focusKey;
  const { scrollX, scrollY } = window;
  const anchor = captureAnchor();
  if (proto) applySim();
  app.innerHTML = renderApp(data, { now: Date.now(), ui, clientError, notice, actions, updateView, dismissed });
  tagFocusable();
  window.scrollTo(scrollX, scrollY);
  restoreAnchor(anchor);
  // preventScroll: restoring focus must never move the page to the focused control.
  if (focusKey) focusByKey(focusKey);
  scheduleExpiring();
}

function tagFocusable(): void {
  // Give tabs, toggles and buttons stable keys so focus survives a re-render.
  app.querySelectorAll<HTMLElement>('[data-view],[data-flow-tab],[data-copy],[data-queue],[data-start],[data-abandon],[data-add-item],[data-update],details[id] > summary').forEach((el) => {
    el.dataset.focusKey = focusKeyOf(el);
  });
}

function focusKeyOf(el: HTMLElement): string {
  if (el.dataset.queue) return `queue-${el.dataset.queue}`;
  if (el.dataset.start) return `start-${el.dataset.start}`;
  if (el.hasAttribute('data-update')) return 'update';
  // Keyed by project item id, since a draft has no number.
  if (el.dataset.abandon) return `abandon-${el.dataset.abandon}`;
  return el.dataset.view ?? el.dataset.flowTab ?? el.dataset.copy ?? (el.hasAttribute('data-add-item') ? 'add-item' : `summary-${el.parentElement?.id}`);
}

function focusByKey(key: string): void {
  app.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}

function schedulePoll(): void {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => void poll(), updating && updateView?.phase !== 'lost' ? UPDATE_POLL_MS : POLL_MS);
}

async function poll(): Promise<void> {
  const version = mutationVersion;
  const sequence = ++pollSequence;
  try {
    const res = await fetch('/api/board', { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (version !== mutationVersion || sequence !== pollSequence) return;
    // Polls each second during an update: redraw only on change, so the progress isn't announced again.
    const unchanged = updating !== null && clientError === null && text === lastBoard;
    lastBoard = text;
    data = JSON.parse(text) as BoardData;
    clientError = null;
    const view = updateView;
    if (followUpdate() || (unchanged && view === updateView)) return;
  } catch (err) {
    if (version !== mutationVersion || sequence !== pollSequence) return;
    if (updating) {
      // The board is expected to go away while the update restarts it.
      updating.awaySince ??= Date.now();
      if (Date.now() - updating.awaySince > RESTART_MS) updateView = { phase: 'lost' };
    } else clientError = err instanceof Error ? err.message : String(err);
  } finally {
    if (sequence === pollSequence) schedulePoll();
  }
  render();
}

/** Follows a running update from the latest data; true when the page reloads onto the restarted board. */
function followUpdate(): boolean {
  if (updateView?.phase === 'lost' || (updateView?.phase === 'refused' && Date.now() - refusedAt > 10_000)) updateView = null;
  if (data.update?.state === 'running') {
    updating ??= { session: data.capture?.session, awaySince: null };
    updating.awaySince = null;
    return false;
  }
  // A new session means the board restarted: reload to run its new revision.
  const restarted = updating !== null && updating.session !== data.capture?.session;
  updating = null;
  if (restarted) location.reload();
  return restarted;
}

function setView(view: View, focus = false): void {
  ui.view = view;
  history.replaceState(null, '', `${location.pathname}${location.search}${view === 'flow' ? '#flow' : ''}`);
  render();
  if (focus) app.querySelector<HTMLElement>(`[data-view="${view}"]`)?.focus();
}

async function copy(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for previews without clipboard permission.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  button.textContent = 'Copied';
  setTimeout(() => {
    if (button.isConnected) button.textContent = 'Copy';
  }, 1500);
}

repoSelect.addEventListener('change', () => {
  form.querySelectorAll<HTMLElement>('[data-applicability]').forEach((group) => {
    const hidden = group.dataset.applicability !== repoSelect.value;
    group.hidden = hidden;
    group.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.checked = false;
      input.disabled = hidden;
    });
  });
});
form.querySelector('[data-close-item]')?.addEventListener('click', () => dialog.close());

const fields = document.getElementById('item-fields') as HTMLFieldSetElement;
const submit = document.getElementById('item-submit') as HTMLButtonElement;
const resultBox = document.getElementById('item-result')!;
const newItem = document.getElementById('item-new') as HTMLButtonElement;
type Attempt = { requestId: string; session: string | undefined; draft: ItemDraft };
type Submission =
  | { phase: 'editing' | 'complete' }
  | { phase: 'pending' | 'retry' | 'uncertain'; attempt: Attempt };
let submission: Submission = { phase: 'editing' };

function message(text: string, url?: string | null, label = 'View created issue'): void {
  resultBox.replaceChildren(document.createTextNode(text));
  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    link.target = '_blank';
    link.rel = 'noopener';
    resultBox.append(link);
  }
}

function updateSubmission(): void {
  const { phase } = submission;
  fields.disabled = phase === 'pending' || phase === 'retry' || phase === 'uncertain';
  submit.disabled = phase === 'pending' || phase === 'uncertain' || data.capture?.enabled === false;
  submit.textContent = phase === 'pending' ? 'Adding…' : phase === 'retry' ? 'Retry this submission' : 'Add to List';
  form.setAttribute('aria-busy', String(phase === 'pending'));
  newItem.hidden = phase !== 'uncertain';
}

function resetDraft(): void {
  form.reset();
  repoSelect.dispatchEvent(new Event('change'));
  submission = { phase: 'editing' };
  message(data.capture?.enabled === false ? 'Adding items is disabled in sample mode.' : '');
  updateSubmission();
}

form.addEventListener('input', () => {
  if (submission.phase === 'editing') message('');
});
newItem.addEventListener('click', resetDraft);
// PROTOTYPE #30: closing the form keeps the reading position; the toast's View item jumps on request.
dialog.addEventListener('close', () => {
  app.querySelector<HTMLElement>('[data-add-item]')?.focus({ preventScroll: true });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (submission.phase === 'editing' || submission.phase === 'retry') void submitItem();
});

async function submitItem(): Promise<void> {
  const retrying = submission.phase === 'retry';
  let attempt: Attempt;
  if (submission.phase === 'retry') attempt = submission.attempt;
  else {
    const values = new FormData(form);
    try {
      const draft = validateDraft({ repo: values.get('repo'), kind: values.get('kind'),
        title: values.get('title'), description: values.get('description'), labels: values.getAll('labels') }, data.repos);
      attempt = { requestId: crypto.randomUUID(), session: data.capture?.session, draft };
    } catch (err) {
      message((err as Error).message);
      form.reportValidity();
      return;
    }
  }
  submission = { phase: 'pending', attempt };
  mutationVersion++;
  message(retrying ? 'Finishing this submission…' : 'Creating the issue and adding it to List…');
  updateSubmission();
  try {
    if (proto) {
      // PROTOTYPE #30: sample mode never writes; the new item lives only in this page.
      await new Promise((r) => setTimeout(r, 400));
      const item = simItem(attempt.draft.title, attempt.draft.repo, [attempt.draft.kind, ...attempt.draft.labels]);
      sim.added.push(item);
      mutationVersion++;
      setNotice({ verb: 'Added', item, to: 'List' });
      submission = { phase: 'complete' };
      setView('board');
      dialog.close();
      return;
    }
    const response = await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt) });
    const result = await response.json() as CreationResult & { board?: BoardData };
    if (result.item && result.board) {
      mutationVersion++;
      data = result.board;
      setNotice({ verb: 'Added', item: result.item, to: 'List' });
      submission = { phase: 'complete' };
      setView('board');
      dialog.close();
    } else {
      submission = result.uncertain ? { phase: 'uncertain', attempt }
        : result.issueUrl ? { phase: 'retry', attempt } : { phase: 'editing' };
      message(`${result.issueUrl ? 'Issue created. ' : ''}${result.error ?? `Request failed (HTTP ${response.status}).`}${result.issueUrl ? ' Retry to finish this issue.' : ''}`,
        result.issueUrl ?? (result.uncertain ? `https://github.com/${attempt.draft.repo}/issues` : null), result.issueUrl ? 'View created issue' : 'Check repository issues');
    }
  } catch {
    submission = { phase: 'retry', attempt };
    message('The submission response was lost. Retry this submission to recover its result without creating another issue.');
  } finally {
    updateSubmission();
  }
}

/** Posts an item action and returns the server's answer, or a message when the server can't be reached. */
async function postAction<T extends { error: string | null; board?: BoardData }>(path: string, body: object): Promise<T> {
  mutationVersion++;
  if (proto) return simulate(path, body) as unknown as T;
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as T;
    if (result.board) {
      mutationVersion++;
      data = result.board;
    }
    return { ...result, error: result.error ?? (response.ok ? null : `Request failed (HTTP ${response.status}).`) };
  } catch {
    return { error: "Can't reach the board server. Try again." } as T;
  }
}

/** When this button's row leaves List, keep keyboard focus in the list: the same button on the next row, else its group. */
function focusAfterLeaving(button: HTMLElement, attr: string): string {
  const row = button.closest('li');
  const neighbour = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>(`[${attr}]`);
  return neighbour ? focusKeyOf(neighbour) : `summary-${button.closest('details')?.id}`;
}

async function queueItem(button: HTMLElement): Promise<void> {
  const itemId = button.dataset.queue!;
  if (actions[itemId]?.phase === 'pending') return;
  const nextFocus = focusAfterLeaving(button, 'data-queue');
  actions[itemId] = { phase: 'pending' };
  render();
  const result = await postAction('/api/queue', { itemId });
  const item = data.items.find((i) => i.id === itemId);
  if (result.error || !item) actions[itemId] = { phase: 'error', message: result.error ?? 'The item left the board.' };
  else {
    delete actions[itemId];
    setNotice({ verb: 'Moved', item, to: 'Queued' });
  }
  render();
  if (!result.error && document.activeElement === document.body) focusByKey(nextFocus);
}

async function startUpdate(): Promise<void> {
  if (updateView?.phase === 'starting' || (data.update?.state === 'running' && updateView?.phase !== 'lost')) return;
  updateView = { phase: 'starting' };
  render();
  const session = data.capture?.session;
  const result = await postAction('/api/update', {});
  if (result.error) {
    updateView = { phase: 'refused', message: result.error };
    refusedAt = Date.now();
  } else {
    updateView = null;
    updating = { session, awaySince: null };
  }
  render();
  schedulePoll();
}

async function startItem(itemId: string): Promise<void> {
  if (actions[itemId]?.phase === 'pending') return;
  actions[itemId] = { phase: 'pending' };
  render();
  const result = await postAction<StartResult & { error: string | null }>('/api/start', { session: data.capture?.session, itemId });
  actions[itemId] = result.thread ? { phase: 'started', thread: result.thread }
    : { phase: result.uncertain ? 'uncertain' : 'error', message: result.error ?? 'The thread did not start.' };
  render();
  // The Start button is gone once a thread starts or may have started; move focus to the card's message.
  if (document.activeElement === document.body) {
    app.querySelector<HTMLElement>(`[data-start-result="${CSS.escape(itemId)}"]`)?.focus();
  }
}

const abandonDialog = document.getElementById('abandon-dialog') as HTMLDialogElement;
const abandonConfirm = abandonDialog.querySelector<HTMLButtonElement>('[data-abandon-confirm]')!;
let abandonTarget: string | null = null;

function askAbandon(itemId: string): void {
  const item = data.items.find((i) => i.id === itemId);
  if (!item || actions[itemId]?.phase === 'pending') return;
  const prompt = abandonPrompt(item);
  document.getElementById('abandon-heading')!.textContent = prompt.question;
  document.getElementById('abandon-detail')!.textContent = prompt.detail;
  abandonConfirm.textContent = prompt.confirm;
  abandonTarget = itemId;
  abandonDialog.returnValue = '';
  abandonDialog.showModal();
}

abandonDialog.querySelector('[data-abandon-cancel]')!.addEventListener('click', () => abandonDialog.close());
abandonConfirm.addEventListener('click', () => abandonDialog.close('confirm'));
// Escape closes it too, as a cancel. A poll may have redrawn the button, so focus it by key.
abandonDialog.addEventListener('close', () => {
  const itemId = abandonTarget;
  abandonTarget = null;
  if (!itemId) return;
  if (abandonDialog.returnValue === 'confirm') void abandonItem(itemId);
  else focusByKey(`abandon-${itemId}`);
});

async function abandonItem(itemId: string): Promise<void> {
  const button = app.querySelector<HTMLElement>(`[data-abandon="${CSS.escape(itemId)}"]`);
  const item = data.items.find((i) => i.id === itemId);
  if (!button || !item || actions[itemId]?.phase === 'pending') return;
  const nextFocus = focusAfterLeaving(button, 'data-abandon');
  actions[itemId] = { phase: 'pending', kind: 'abandon' };
  render();
  focusByKey(`abandon-${itemId}`);
  const result = await postAction('/api/abandon', { session: data.capture?.session, itemId });
  if (result.error) actions[itemId] = { phase: 'error', kind: 'abandon', message: result.error };
  else {
    delete actions[itemId];
    setNotice({ verb: 'Abandoned', item });
  }
  render();
  if (!result.error && document.activeElement === document.body) focusByKey(nextFocus);
}

app.addEventListener('click', (event) => {
  const extra = (event.target as HTMLElement).closest<HTMLElement>('[data-dismiss],[data-view-item],[data-outline-jump]');
  if (extra?.dataset.dismiss) return dismissKey(extra.dataset.dismiss);
  if (extra?.dataset.viewItem) return viewItem(extra.dataset.viewItem);
  if (extra?.dataset.outlineJump) {
    event.preventDefault();
    return jumpTo(document.getElementById(`o-${extra.dataset.outlineJump}`));
  }
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-view],[data-flow-tab],[data-copy],[data-queue],[data-start],[data-abandon],[data-add-item],[data-update]');
  if (!target) return;
  if (target.hasAttribute('data-add-item')) {
    if (submission.phase === 'complete') resetDraft();
    dialog.showModal();
    form.querySelector<HTMLElement>('[name="repo"]')?.focus();
  } else if (target.dataset.view) setView(target.dataset.view as View);
  else if (target.dataset.flowTab) {
    ui.flowTab = target.dataset.flowTab as FlowTab;
    render();
  } else if (target.dataset.copy) void copy(target.dataset.copy, target as HTMLButtonElement);
  else if (target.dataset.queue) void queueItem(target);
  else if (target.dataset.start) void startItem(target.dataset.start);
  else if (target.hasAttribute('data-update')) void startUpdate();
  else if (target.dataset.abandon) askAbandon(target.dataset.abandon);
});

// Arrow keys move between the Board and Flow tabs (WAI-ARIA tabs pattern).
app.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (!target.dataset.view || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  setView(ui.view === 'board' ? 'flow' : 'board', true);
});

// Remember which <details> are open so a re-render keeps them that way.
app.addEventListener(
  'toggle',
  (event) => {
    const el = event.target as HTMLDetailsElement;
    if (!el.id) return;
    ui.toggled[el.id] = el.open;
  },
  true,
);

window.addEventListener('hashchange', () => setView(location.hash === '#flow' ? 'flow' : 'board'));

// ---------- PROTOTYPE #30: explicit jumps ----------

function jumpTo(el: HTMLElement | null): void {
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.remove('anchor-flash');
  void el.offsetWidth;
  el.classList.add('anchor-flash');
  el.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
}

/** View item: the one deliberate move. Opens the item's List group if it's closed. */
function viewItem(itemId: string): void {
  if (ui.view !== 'board') setView('board');
  const item = data.items.find((i) => i.id === itemId);
  if (item?.status === 'List') {
    const id = listGroupId(platformOf(item, data.repos));
    if (ui.toggled[id] === false) { ui.toggled[id] = true; render(); }
  }
  jumpTo(app.querySelector<HTMLElement>(`#panel-board [data-anchor="${CSS.escape(itemId)}"]`));
}

// ---------- PROTOTYPE #30: sample-mode stand-ins for every write ----------

const proto = data.capture?.enabled === false;
const sim = { queued: new Set<string>(), abandoned: new Set<string>(), added: [] as Item[], started: {} as Record<string, { threadId: string; title: string }>,
  refreshed: false, update: null as UpdateProgress | null };
let simCount = 0;

function simItem(title: string, repo: string | null, labels: string[]): Item {
  simCount++;
  return { id: `PROTO_${simCount}`, status: 'List', type: repo ? 'Issue' : 'DraftIssue', number: repo ? 900 + simCount : null, title, url: null, repo,
    labels: labels.filter(Boolean), state: repo ? 'OPEN' : null, parent: null, subIssues: { total: 0, completed: 0 }, blockedBy: 0,
    updatedAt: new Date().toISOString(), closedAt: null, linkedPrs: [] };
}

/** Re-applies this page's simulated changes on top of whatever the sample server sends. */
function applySim(): void {
  if (data.capture) data.capture.enabled = true;
  let items = data.items.filter((i) => !sim.abandoned.has(i.id) && !sim.added.some((a) => a.id === i.id));
  items = [...items, ...sim.added.filter((i) => !sim.abandoned.has(i.id))].map((i) => (sim.queued.has(i.id) ? { ...i, status: 'Queued' as const } : i));
  if (sim.refreshed) {
    items = items.filter((i) => !(i.repo === 'maddec01/mux-apple' && i.number === 22));
    if (!items.some((i) => i.id === 'PROTO_refresh')) {
      items.unshift({ ...simItem('Added by a refresh: subtitle offset drifts after seeking', 'maddec01/mux-server', ['bug']), id: 'PROTO_refresh', status: 'Needs you', number: 155 });
    }
  }
  data.items = items;
  data.started = { ...data.started, ...sim.started };
  if (sim.update) data.update = sim.update;
}

function simulate(path: string, body: object): { error: string | null; thread?: { threadId: string; title: string } } {
  const { itemId } = body as { itemId?: string };
  if (path === '/api/queue' && itemId) sim.queued.add(itemId);
  else if (path === '/api/abandon' && itemId) sim.abandoned.add(itemId);
  else if (path === '/api/start' && itemId) {
    const thread = { threadId: `proto-${itemId.slice(-6)}`, title: 'Prototype thread (not started)' };
    sim.started[itemId] = thread;
    return { error: null, thread };
  } else return { error: 'Not simulated in the prototype.' };
  mutationVersion++;
  return { error: null };
}

function simulateUpdate(state: 'done' | 'failed'): void {
  const now = new Date().toISOString();
  sim.update = { state, pid: 0, finished: state === 'done' ? ['check', 'fetch', 'install', 'restart', 'health', 'skills', 'profiles'] : ['check', 'fetch'],
    current: state === 'done' ? null : 'install', startedAt: now, finishedAt: now, revision: 'abc1234def', error: state === 'failed' ? 'pnpm install exited with 1.' : null,
    logTail: state === 'failed' ? 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/example: Not Found (fictional)' : null };
  render();
}

const bar = document.querySelector<HTMLElement>('.proto-bar');
function stepVariant(step: number): void {
  const i = VARIANTS.findIndex((v) => v.key === ui.variant);
  const next = VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length]!;
  ui.variant = next.key;
  const params = new URLSearchParams(location.search);
  params.set('variant', next.key);
  history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  bar!.querySelector('.proto-label')!.innerHTML = `<b>${next.key}</b> ${next.name}`;
  render();
}
if (bar) {
  bar.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (button?.dataset.protoStep) stepVariant(Number(button.dataset.protoStep));
    else if (button?.dataset.protoSim === 'refresh') { sim.refreshed = !sim.refreshed; render(); }
    else if (button?.dataset.protoSim === 'update-done') simulateUpdate('done');
    else if (button?.dataset.protoSim === 'update-failed') simulateUpdate('failed');
  });
  document.addEventListener('keydown', (event) => {
    const t = event.target as HTMLElement;
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.metaKey || event.altKey || event.ctrlKey) return;
    if (t.closest('input, textarea, select, [contenteditable], [data-view], dialog')) return;
    stepVariant(event.key === 'ArrowLeft' ? -1 : 1);
  });
}

if (ui.view !== DEFAULT_UI.view || proto) render();
else tagFocusable();
resetDraft();
followUpdate();
schedulePoll();
