import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_ORDERS_PER_PAGE, adminOrderPage, adminOrderPageButtons } from '../src/page/admin/adminOrderPagination.ts';

test('zero, partial and full eight-row pages use actual filtered totals', () => {
  assert.equal(ADMIN_ORDERS_PER_PAGE, 8);
  for (const [total, totalPages] of [[0, 1], [1, 1], [8, 1], [9, 2], [16, 2], [17, 3], [26, 4]]) {
    const state = adminOrderPage(total, 1);
    assert.equal(state.totalPages, totalPages);
    assert.equal(state.from, total ? 1 : 0);
    assert.equal(state.to, Math.min(total, 8));
  }
});

test('page two and the last page show correct server-record ranges', () => {
  assert.deepEqual(adminOrderPage(26, 2), { currentPage: 2, totalPages: 4, total: 26, from: 9, to: 16 });
  assert.deepEqual(adminOrderPage(26, 4), { currentPage: 4, totalPages: 4, total: 26, from: 25, to: 26 });
  assert.deepEqual(adminOrderPage(101, 13), { currentPage: 13, totalPages: 13, total: 101, from: 97, to: 101 });
});

test('refresh shrink clamps to the last valid page and an empty result stays on page one', () => {
  assert.deepEqual(adminOrderPage(9, 4), { currentPage: 2, totalPages: 2, total: 9, from: 9, to: 9 });
  assert.deepEqual(adminOrderPage(0, 4), { currentPage: 1, totalPages: 1, total: 0, from: 0, to: 0 });
});

test('numbered controls are compact and show ellipses wherever pages are omitted', () => {
  assert.deepEqual(adminOrderPageButtons(2, 4), [1, 2, 3, 4]);
  for (const current of [1, 4, 5, 50, 97, 100]) {
    const buttons = adminOrderPageButtons(current, 100);
    assert.ok(buttons.length <= 8);
    assert.equal(buttons[0], 1);
    assert.equal(buttons.at(-1), 100);
    assert.ok(buttons.includes(current));
    for (let i = 1; i < buttons.length; i++) {
      if (typeof buttons[i] === 'number' && typeof buttons[i - 1] === 'number') assert.equal(buttons[i], buttons[i - 1] + 1);
    }
  }
});
