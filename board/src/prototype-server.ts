// THROWAWAY #30: existing dashboard route, fixture reads only. No GitHub/updater imports.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import type { BoardData } from './model.ts';

if (process.env.NODE_ENV === 'production') throw new Error('Throwaway prototype is disabled in production.');
const port = Number(process.env.BOARD_PORT ?? 4318);
if (port === 4317) throw new Error('4317 belongs to the live board. Choose a spare port.');
const data = JSON.parse(readFileSync(new URL('../test/sample.json', import.meta.url), 'utf8')) as BoardData;
data.error = null;
data.capture = { enabled: true, session: 'prototype-memory-only' };
const css = ['styles.css', 'prototype.css'].map(name => readFileSync(new URL(name, import.meta.url), 'utf8')).join('\n');
const names = ['prototype-client.ts', 'prototype-ui.ts', 'prototype-revision.ts', 'render.ts', 'model.ts', 'add-item.ts'];
const assets = new Map(names.map(name => [name, stripTypeScriptTypes(readFileSync(new URL(name, import.meta.url), 'utf8'))]));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Mux · Dashboard design study</title><link rel="icon" href="data:,"><style>${css}</style></head><body><a class="skip-link" href="#workspace">Skip to work</a><div id="app"></div><div id="dialogs"></div><script id="board-data" type="application/json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script><script type="module" src="/assets/prototype-client.ts"></script></body></html>`;
createServer((req, res) => {
  // All mutations are in browser memory, including updates and thread starts.
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const asset = assets.get(path.replace('/assets/', ''));
  const status = req.method !== 'GET' && req.method !== 'HEAD' ? 405 : path === '/' || asset ? 200 : 404;
  res.writeHead(status, { 'Content-Type': asset ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'" });
  res.end(status === 200 ? asset ?? html : 'Prototype: no server mutations.');
}).listen(port, '127.0.0.1', () => console.log(`Throwaway dashboard: http://127.0.0.1:${port}/?variant=D (all mutations stubbed)`));
