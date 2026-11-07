import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Render the actual TSX components without Vite or a running operational backend.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      for (const extension of ['', '.ts', '.tsx']) {
        const url = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.png')) return { format: 'module', source: 'export default "test-logo.png";', shortCircuit: true };
    if (url.endsWith('/config/features.ts')) return { format: 'module', source: 'export const AI_FORECAST_ENABLED = false;', shortCircuit: true };
    if (url.endsWith('/lib/api.ts')) return { format: 'module', source: 'export const apiClient = new Proxy({}, { get() { throw new Error("Network access is prohibited in render tests"); } });', shortCircuit: true };
    if (url.startsWith('file:') && /\.(ts|tsx)$/.test(url) && !url.includes('/node_modules/')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
  },
});
after(() => hooks.deregister());
const { default: AdminSidebar } = await import('../src/components/layout/AdminSidebar.tsx');
const { default: QASidebar } = await import('../src/components/layout/QASidebar.tsx');
const { CustomerReturns } = await import('../src/components/returns/CustomerReturnWorkspace.tsx');
const { default: ReturnOrderNavigation } = await import('../src/components/returns/ReturnOrderNavigation.tsx');
const { default: ReturnOrderSelect } = await import('../src/components/returns/ReturnOrderSelect.tsx');
const render = (component, path, props = {}) => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] }, h(component, props)));

test('return selectors render accessible controlled values and retain an order outside the current search page', () => {
  const html = renderToStaticMarkup(h(ReturnOrderSelect, { label: 'Original order', value: '42', selectedLabel: 'SO-2026-0042 / UAT customer', options: [], onChange() {}, placeholder: 'Select original order' }));
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-labelledby=/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /SO-2026-0042 \/ UAT customer/);
  assert.doesNotMatch(html, /<select/);
  const waiting = renderToStaticMarkup(h(ReturnOrderSelect, { label: 'Fulfilled product and original warehouse', value: '', options: [], disabled: true, onChange() {}, placeholder: 'Loading fulfilled items...' }));
  assert.match(waiting, /disabled=""/);
  assert.match(waiting, /Loading fulfilled items/);
  const reason = renderToStaticMarkup(h(ReturnOrderSelect, { label: 'Return reason', value: 'QUALITY_CONCERN', options: [{ value: 'QUALITY_CONCERN', label: 'QUALITY CONCERN' }], onChange() {}, placeholder: 'Select reason' }));
  assert.match(reason, /QUALITY CONCERN/);
  assert.doesNotMatch(reason, /SO-2026-0042/);
});

test('Admin SWS renders Return Orders immediately after Order Management with the active link', () => {
  const html = render(AdminSidebar, '/admin/return-orders');
  assert.match(html, /Smart Warehousing System/);
  assert.ok(html.indexOf('Order Management') < html.indexOf('Return Orders'));
  assert.match(html, /aria-current="page"[^>]*href="\/admin\/return-orders"/);
});

test('QA sidebar renders Return Order Inspection after Quality Inspection and marks it active', () => {
  const html = render(QASidebar, '/qa/return-order-inspection');
  assert.ok(html.indexOf('Quality Inspection') < html.indexOf('Return Order Inspection'));
  assert.match(html, /href="\/qa\/return-order-inspection"/);
  assert.match(html, /aria-current="page"/);
});

test('standalone role pages render breadcrumbs, registration and loading states without API data', () => {
  const admin = render(CustomerReturns, '/admin/return-orders', { mode: 'admin' });
  const qa = render(CustomerReturns, '/qa/return-order-inspection', { mode: 'qa' });
  assert.match(admin, /aria-label="Breadcrumb"/);
  assert.match(admin, /<h1[^>]*>Return Orders<\/h1>/);
  assert.match(admin, /Register Return/);
  assert.match(admin, /Loading customer returns/);
  assert.match(qa, /<h1[^>]*>Return Order Inspection<\/h1>/);
  assert.doesNotMatch(qa, /Register Return/);
});

test('former host page has a destination link and preserves ordinary content without return processing tabs', () => {
  const html = render(ReturnOrderNavigation, '/admin/order-management', { mode: 'admin', children: h('p', null, 'Existing order content') });
  assert.match(html, /href="\/admin\/return-orders"/);
  assert.match(html, /Existing order content/);
  assert.doesNotMatch(html, /Workflow selection|Register Return/);
});
