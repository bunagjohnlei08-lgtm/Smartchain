import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSupplierAccount, supplierConflictTitle } from '../src/lib/supplierAccount.ts';

test('backend account states remain separate from supplier status and accreditation', () => {
  for (const status of ['NO_ACCOUNT', 'INVITATION_PENDING', 'INVITATION_EXPIRED']) {
    const account = mapSupplierAccount({ status, can_invite: true, reason: 'Verified account state', expires_at: '2026-11-10' });
    assert.equal(account.status, status);
    assert.equal(account.canInvite, true);
    assert.equal(account.expiresAt, '2026-11-10');
  }
  assert.equal(mapSupplierAccount({ status: 'ACCOUNT_ACTIVE', can_invite: true }).canInvite, false);
  assert.equal(mapSupplierAccount({ status: 'ACCOUNT_ACTIVE', can_invite: false }).status, 'ACCOUNT_ACTIVE');
});

test('conflicts retain guidance and safe Admin metadata, without enabling invitations', () => {
  const raw = { status: 'CONFLICT', can_invite: true, reason: 'Relationship missing', conflict: { code: 'SUPPLIER_LINK_MISSING', next_action: 'Verify independent ownership.', account: { user_id: 7, role: 'SUPPLIER', status: 'ACTIVE', supplier_id: null, password: 'must-not-display', token_hash: 'hidden' } } };
  const mapped = mapSupplierAccount(raw);
  assert.equal(mapped.canInvite, false);
  assert.equal(mapped.conflict.account.userId, 7);
  assert.equal(mapped.conflict.account.supplierId, null);
  assert.equal(mapped.conflict.nextAction, 'Verify independent ownership.');
  assert.ok(!JSON.stringify(mapped).includes('must-not-display'));
  assert.ok(!JSON.stringify(mapped).includes('token_hash'));
  assert.equal(supplierConflictTitle(mapped.conflict.code), 'Supplier relationship is missing');
});

test('older conflict responses and unknown states remain blocked and reviewable', () => {
  assert.equal(mapSupplierAccount({ status: 'CONFLICT', reason: 'Existing email owner' }).conflict, null);
  assert.equal(mapSupplierAccount({ status: 'UNRECOGNIZED', can_invite: true }).status, 'UNAVAILABLE');
  assert.equal(mapSupplierAccount({ status: 'UNRECOGNIZED', can_invite: true }).canInvite, false);
  assert.equal(mapSupplierAccount(null).canInvite, false);
  assert.equal(supplierConflictTitle(), 'Account ownership requires review');
});
