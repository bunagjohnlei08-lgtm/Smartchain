import test from 'node:test';
import assert from 'node:assert/strict';
import { filterInspectionEvidence, inspectionEvidenceRegister, paginateInspectionEvidence } from '../src/page/QA/inspectionEvidence.ts';

const file = { id: 1, original_name: 'damage.pdf', mime_type: 'application/pdf', file_size: 120, view_url: '/qa/inspections/1/attachments/1' };
const inspection = (id, overrides = {}) => ({ inspection_id: id, receiving_id: 1, receiving_no: 'RCV-008', purchase_order: 'PO-099', supplier: 'Supplier Alpha', status: 'Passed', completed_at: '2026-11-01T10:00:00Z', cycle_number: id, inspected_by: 'QA Supervisor', attachments: [file], ...overrides });
const defaults = { search: '', status: '', availability: 'with-evidence' };

test('With Evidence excludes empty inspections without deleting them from All Inspections', () => {
  const rows = [inspection(1), inspection(2, { attachments: [] })];
  assert.deepEqual(filterInspectionEvidence(rows, defaults).map(row => row.inspection_id), [1]);
  assert.deepEqual(filterInspectionEvidence(rows, { ...defaults, availability: 'all' }).map(row => row.inspection_id), [1, 2]);
  assert.equal(rows.length, 2);
});

test('search matches receiving, PO and supplier with combined result filtering', () => {
  const rows = [inspection(1), inspection(2, { status: 'Rejected' })];
  for (const search of [' rcv-008 ', 'po-099', 'SUPPLIER alpha']) {
    assert.deepEqual(filterInspectionEvidence(rows, { ...defaults, search, status: 'Rejected' }).map(row => row.inspection_id), [2]);
  }
  assert.equal(filterInspectionEvidence(rows, { ...defaults, search: 'no-match' }).length, 0);
});

test('pagination shows eight inspection cycles per page, including cycles sharing a receiving', () => {
  const rows = Array.from({ length: 17 }, (_, i) => inspection(i + 1));
  assert.deepEqual(paginateInspectionEvidence(rows, 2).rows.map(row => row.inspection_id), [9, 10, 11, 12, 13, 14, 15, 16]);
  const last = paginateInspectionEvidence(rows, 99);
  assert.equal(last.page, 3);
  assert.deepEqual(last.rows.map(row => row.inspection_id), [17]);
  assert.deepEqual(paginateInspectionEvidence([], 2), { page: 1, pageCount: 1, rows: [] });
});

test('export register preserves per-cycle attachment ownership, type, and empty inspections', () => {
  const rows = [inspection(1), inspection(2, { status: 'Rejected', attachments: [{ ...file, id: 2, original_name: 'excess.png', mime_type: 'image/png' }] }), inspection(3, { attachments: [] })];
  const register = inspectionEvidenceRegister(rows);
  assert.equal(register.length, 4);
  assert.equal(register[1][2], 1);
  assert.equal(register[1][9], 'damage.pdf');
  assert.equal(register[2][3], 2);
  assert.equal(register[2][6], 'Rejected');
  assert.equal(register[2][9], 'excess.png');
  assert.equal(register[2][10], 'image/png');
  assert.equal(register[3][8], 0);
  assert.equal(register[3][9], '');
  assert.ok(!JSON.stringify(register).includes('/qa/inspections/'));
});
