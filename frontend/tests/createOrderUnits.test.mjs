import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogOrderUnit, orderUnitOptions } from '../src/page/admin/createOrderUnits.ts';
test('Create Order has exactly the canonical options in the required order', () => assert.deepEqual(orderUnitOptions, ['PCS', 'DRUM', 'SACK']));
test('product selection derives each unit independently without a PCS fallback', () => {
  assert.deepEqual(['PCS', 'DRUM', 'SACK', 'pcs', ' drum '].map(catalogOrderUnit), ['PCS', 'DRUM', 'SACK', 'PCS', 'DRUM']);
  for (const unit of [null, undefined, '', 'bulk', 'kg', 'L']) assert.equal(catalogOrderUnit(unit), '');
});
