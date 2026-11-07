import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyReturnDestination, RETURN_ORDER_NAVIGATION, returnAction, returnActionLabel, returnEmptyMessage, returnLoadError, returnTabLabel } from '../src/components/returns/customerReturnUi.ts';

const row = { status: 'REQUESTED', restock_status: 'NOT_ELIGIBLE', disposal_status: 'NOT_REQUIRED', passed_quantity: 0, failed_quantity: 0, restocked_quantity: 0, disposed_quantity: 0 };

test('each role has a discoverable return tab and an explicit empty state', () => {
  assert.equal(returnTabLabel('admin'), 'Return Orders');
  assert.equal(returnTabLabel('receiving'), 'Return Orders');
  assert.equal(returnTabLabel('qa'), 'Return Order Inspection');
  assert.equal(returnTabLabel('stock-in'), 'Customer Return Stock In');
  assert.equal(returnEmptyMessage('admin', false), 'No customer returns have been registered.');
  assert.match(returnEmptyMessage('qa', false), /assigned/);
  assert.match(returnEmptyMessage('stock-in', false), /restocking/);
  assert.match(returnEmptyMessage('admin', true), /filters/);
});

test('legacy return selectors redirect without stealing ordinary filters or unrelated role pages', () => {
  assert.equal(legacyReturnDestination('/admin/order-management', '?tab=returns&status=PENDING_QA', ''), `${RETURN_ORDER_NAVIGATION.admin.path}?status=PENDING_QA`);
  assert.equal(legacyReturnDestination('/qa/inspection', '', '#returns'), RETURN_ORDER_NAVIGATION.qa.path);
  assert.equal(legacyReturnDestination('/qa/inspection', '?tab=return-inspections', '#details'), `${RETURN_ORDER_NAVIGATION.qa.path}#details`);
  assert.equal(legacyReturnDestination('/admin/order-management', '?status=NEW', ''), null);
  assert.equal(legacyReturnDestination('/qa/inspection', '?tab=receiving', ''), null);
  assert.equal(legacyReturnDestination('/plant-manager/receiving', '?tab=returns', ''), null);
});

test('receive and inspect actions follow physical workflow and role', () => {
  const approved = { ...row, status: 'AWAITING_RETURN' };
  assert.equal(returnAction('receiving', row), '');
  assert.equal(returnAction('receiving', approved), 'receive');
  assert.equal(returnAction('qa', approved), '');
  assert.equal(returnAction('qa', { ...row, status: 'PENDING_QA' }), 'inspect');
  assert.equal(returnActionLabel('receive'), 'Receive Return');
});

test('restocking requires passed outstanding quantity and disposal requires failed outstanding quantity', () => {
  const passed = { ...row, status: 'PENDING_DISPOSITION', restock_status: 'PENDING_STOCK_IN', passed_quantity: 3 };
  assert.equal(returnAction('stock-in', row), '');
  assert.equal(returnAction('stock-in', { ...passed, passed_quantity: 0 }), '');
  assert.equal(returnAction('stock-in', passed), 'restock');
  assert.equal(returnAction('stock-in', { ...passed, restocked_quantity: 3 }), '');
  assert.equal(returnAction('qa', passed), '');
  const failed = { ...row, disposal_status: 'FOR_DISPOSAL', failed_quantity: 2 };
  assert.equal(returnAction('admin', failed), 'dispose');
  assert.equal(returnAction('admin', { ...failed, disposed_quantity: 2 }), '');
  assert.equal(returnAction('stock-in', failed), '');
  assert.equal(returnAction('receiving', failed), '');
});

test('failed requests distinguish authentication, authorization and unavailable service without guessing missing schema', () => {
  assert.match(returnLoadError(null), /unavailable/);
  assert.match(returnLoadError({ response: { status: 401 } }), /sign in/);
  assert.match(returnLoadError({ response: { status: 403 } }), /not authorized/);
  assert.match(returnLoadError({}), /connection/);
  assert.match(returnLoadError({ response: { status: 500 } }), /could not be loaded/);
  assert.doesNotMatch(returnLoadError({ response: { status: 500 } }), /setup is pending/i);
});
