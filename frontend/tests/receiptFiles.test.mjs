import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendReceiptFiles, createReceiptPreview, RECEIPT_MAX_BYTES, validateReceiptFile } from '../src/lib/receiptFiles.ts';

const hash = async file => createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
const png = (name = 'receipt.png', suffix = 'one') => new File([new Uint8Array([137,80,78,71,13,10,26,10]), suffix], name, { type: 'image/png' });

for (const [name, type, bytes] of [
  ['receipt.png', 'image/png', [137,80,78,71,13,10,26,10]],
  ['receipt.jpg', 'image/jpeg', [255,216,255]],
  ['receipt.pdf', 'application/pdf', [37,80,68,70,45]],
]) {
  test(`accepts ${type} and retains filename`, async () => {
    const file = new File([new Uint8Array(bytes)], name, { type });
    const result = await appendReceiptFiles([], [file], hash);
    assert.equal(result.error, null);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].name, name);
    assert.equal(result.files[0], file);
  });
}

test('adds four distinct files and rejects a fifth without losing existing files', async () => {
  const files = Array.from({ length: 4 }, (_, index) => png(`${index}.png`, String(index)));
  const added = await appendReceiptFiles([], files, hash);
  assert.equal(added.files.length, 4);
  assert.equal(added.error, null);
  const rejected = await appendReceiptFiles(added.files, [png('fifth.png')], hash);
  assert.match(rejected.error, /no more than 4/);
  assert.equal(rejected.files, added.files);
});

test('rejects unsupported extension and mismatched MIME', () => {
  assert.match(validateReceiptFile(new File(['x'], 'file.exe', { type: 'image/png' })), /matching file extension/);
  assert.match(validateReceiptFile(new File(['x'], 'file.png', { type: 'text/plain' })), /matching file extension/);
});

test('rejects empty files', () => {
  assert.match(validateReceiptFile(new File([], 'empty.pdf', { type: 'application/pdf' })), /empty/);
});

test('rejects mismatched content without losing files', async () => {
  const files = [png()];
  const result = await appendReceiptFiles(files, [new File(['wrong header'], 'bad.pdf', { type: 'application/pdf' })], hash);
  assert.match(result.error, /content does not match/);
  assert.equal(result.files, files);
});

test('allows 10 MB and rejects above 10 MB', () => {
  assert.equal(validateReceiptFile(new File([new Uint8Array(RECEIPT_MAX_BYTES)], 'max.pdf', { type: 'application/pdf' })), null);
  assert.match(validateReceiptFile(new File([new Uint8Array(RECEIPT_MAX_BYTES + 1)], 'large.pdf', { type: 'application/pdf' })), /10 MB/);
});

test('rejects a renamed content duplicate and preserves previous selection', async () => {
  const files = [png()];
  const result = await appendReceiptFiles(files, [png('renamed.png')], hash);
  assert.match(result.error, /Duplicate/);
  assert.equal(result.files, files);
});

test('rejects duplicates within a single selection atomically', async () => {
  const result = await appendReceiptFiles([], [png('first.png'), png('second.png')], hash);
  assert.match(result.error, /Duplicate/);
  assert.deepEqual(result.files, []);
});

test('cancelled selection retains existing files', async () => {
  const files = [png()];
  const result = await appendReceiptFiles(files, [], hash);
  assert.equal(result.files, files);
  assert.equal(result.error, null);
});

test('a removed file can be selected again', async () => {
  const file = png();
  const files = (await appendReceiptFiles([], [file], hash)).files;
  const remaining = files.filter(existing => existing !== file);
  const result = await appendReceiptFiles(remaining, [file], hash);
  assert.equal(result.error, null);
  assert.deepEqual(result.files, [file]);
});

test('unreadable files are contained without clearing previous files', async () => {
  const files = [png()];
  const result = await appendReceiptFiles(files, [png('new.png', 'two')], async () => { throw new Error('read failed'); });
  assert.match(result.error, /could not read/);
  assert.equal(result.files, files);
});

test('preview creation failure falls back safely to the filename', () => {
  const preview = createReceiptPreview(png(), { createObjectURL() { throw new Error('Blob unavailable'); }, revokeObjectURL() {} });
  assert.equal(preview.url, null);
  assert.doesNotThrow(preview.dispose);
});

test('preview URL is released on cleanup', () => {
  const revoked = [];
  const preview = createReceiptPreview(png(), { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) });
  assert.equal(preview.url, 'blob:test');
  preview.dispose();
  assert.deepEqual(revoked, ['blob:test']);
});

test('PDF attachment does not require an image preview', () => {
  const preview = createReceiptPreview(new File(['%PDF-1.4'], 'file.pdf', { type: 'application/pdf' }), {
    createObjectURL() { assert.fail('PDF must not allocate an image URL'); }, revokeObjectURL() {},
  });
  assert.equal(preview.url, null);
});

test('preview cleanup failure is contained', () => {
  const preview = createReceiptPreview(png(), { createObjectURL: () => 'blob:test', revokeObjectURL() { throw new Error('cleanup failed'); } });
  assert.doesNotThrow(preview.dispose);
});
