// The full HTML document the server sends on first load. Server-only.

import { readFileSync } from 'node:fs';
import { BRAND_MARK, renderAbandonDialog, renderAddItemForm, renderApp } from './render.ts';
import type { RenderOptions } from './render.ts';
import type { BoardData } from './model.ts';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
/** The logo in a mid grey that reads on light and dark tabs. */
const favicon = `data:image/svg+xml,${encodeURIComponent(BRAND_MARK.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('currentColor', '#71717b'))}`;

/** JSON that is safe inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/** PROTOTYPE #120: a fixed A/B/C picker that switches the Queued-card layout live, kept in ?variant=. */
function protoPicker(): string {
  const opts = [['A', 'Inline buttons'], ['B', 'Quiet footer row'], ['C', 'Overflow menu']];
  return `<div class="proto-picker" role="radiogroup" aria-label="Prototype #120 layout"><span>#120 layout</span>${opts
    .map(([k, name]) => `<button type="button" role="radio" data-variant="${k}" title="${name}"><b>${k}</b> ${name}</button>`)
    .join('')}</div>
`;
}

export function renderPage(data: BoardData, opts: RenderOptions): string {
  return `<!doctype html>
<html lang="en"${data.proto ? ` data-proto="${data.proto}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>µx factory</title>
<link rel="icon" href="${favicon}">
<style>
${css}</style>
</head>
<body>
<div id="app">
${renderApp(data, opts)}
</div>
${renderAddItemForm(data)}
${renderAbandonDialog()}
${data.proto ? protoPicker() : ''}<div id="copy-status" class="sr-only" role="status" aria-live="polite"></div>
<script id="board-data" type="application/json">${scriptJson(data)}</script>
<script type="module" src="/assets/client.ts"></script>
</body>
</html>
`;
}
