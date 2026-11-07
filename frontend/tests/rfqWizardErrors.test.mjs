import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRfqUnit, mapRfqValidationErrors, rfqErrorStep } from '../src/page/admin/rfqWizardErrors.ts';

test('only recognized package units normalize; legacy and unknown units never convert', () => {
  for (const [input, output] of [['pcs', 'PCS'], [' Sack ', 'SACK'], ['drum', 'DRUM'], ['KG', 'KG'], ['kg', 'kg'], ['L', 'L'], ['BULK', 'BULK']]) assert.equal(canonicalRfqUnit(input), output);
});

test('server line indexes map to the actual submitted product identity, preserving every message', () => {
  const lines = [{ replenishment_request_id: 81, product_name: 'Drum Product' }, { replenishment_request_id: 12, product_name: 'PCS Product' }];
  const errors = mapRfqValidationErrors({ 'lines.1.unit': ['The selected lines.1.unit is invalid.', 'Expected PCS.'], 'lines.0.required_quantity': ['Approved quantity changed.'] }, lines);
  assert.ok(errors.line_12_unit.includes('PCS Product'));
  assert.ok(errors.line_12_unit.includes('Expected PCS.'));
  assert.ok(!errors.line_12_unit.includes('lines.1.unit'));
  assert.ok(errors.line_81_required_quantity.includes('Drum Product'));
  assert.equal(rfqErrorStep('line_12_unit'), 0);
  assert.equal(rfqErrorStep('line_81_required_quantity'), 0);
  assert.equal(lines[0].replenishment_request_id, 81);
});

test('dates, specifications, evaluation fields and approval errors point to their wizard steps', () => {
  const errors = mapRfqValidationErrors({ 'lines.0.public_specification': ['Required.'], 'lines.0.reference_unit_price': ['Invalid price.'], opens_at: ['Date is past.'], 'evaluation_criteria.1.weight': ['The evaluation_criteria.1.weight is invalid.'], reason: ['Explain the amendment.'], approval: ['Not eligible.'] }, [{ replenishment_request_id: 7, product_name: 'Chemical' }]);
  assert.equal(rfqErrorStep('opens_at'), 1);
  assert.equal(rfqErrorStep('line_7_specification'), 2);
  assert.equal(rfqErrorStep('line_7_price'), 2);
  assert.equal(rfqErrorStep('evaluation_1_weight'), 3);
  assert.equal(rfqErrorStep('reason'), 4);
  assert.equal(rfqErrorStep('approval'), 4);
  assert.ok(errors.evaluation_1_weight.includes('criterion 2 weight'));
  assert.ok(errors.line_7_specification.includes('Chemical'));
});

test('unknown line fields and stale indexes still produce actionable product-step errors', () => {
  const mapped = mapRfqValidationErrors({ 'lines.8.unit': ['Invalid.'], 'lines.0.product_id': ['Mismatched identity.'], 'lines.0': ['This requirement is unavailable.'] }, [{ replenishment_request_id: 9, product_name: 'Selected Product' }]);
  assert.ok(mapped.lines.includes('Selected product 9'));
  assert.ok(mapped.line_9_product_id.includes('Selected Product'));
  assert.equal(rfqErrorStep('line_9_identity'), 0);
  assert.equal(rfqErrorStep('lines'), 0);
});
