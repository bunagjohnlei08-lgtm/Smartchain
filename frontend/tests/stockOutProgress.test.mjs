import test from 'node:test';
import assert from 'node:assert/strict';
import { stockOutProgressByUnit } from '../src/page/plant-manager/stockOutProgress.ts';

test('mixed stock units have independent release progress without conversion', () => {
  const items = [{ unit: 'PCS', orderedQty: 30, releasedQty: 10 }, { unit: 'SACK', orderedQty: 8, releasedQty: 2 }, { unit: 'DRUM', orderedQty: 3, releasedQty: 1 }, { unit: 'PCS', orderedQty: 10, releasedQty: 10 }];
  const before = structuredClone(items);
  const progress = stockOutProgressByUnit(items);
  assert.deepEqual(progress.map(({ unit, ordered, released }) => ({ unit, ordered, released })), [
    { unit: 'PCS', ordered: 40, released: 20 }, { unit: 'SACK', ordered: 8, released: 2 }, { unit: 'DRUM', ordered: 3, released: 1 },
  ]);
  assert.equal(progress[0].percentage, 50);
  assert.equal(progress[1].percentage, 25);
  assert.deepEqual(items, before);
});

test('empty, completed and historical units retain their own presentation values', () => {
  assert.deepEqual(stockOutProgressByUnit([]), []);
  assert.deepEqual(stockOutProgressByUnit([{ unit: 'KG', orderedQty: 5, releasedQty: 5 }]), [{ unit: 'KG', ordered: 5, released: 5, percentage: 100 }]);
  assert.equal(stockOutProgressByUnit([{ unit: 'PCS', orderedQty: 0, releasedQty: 0 }])[0].percentage, 0);
});
