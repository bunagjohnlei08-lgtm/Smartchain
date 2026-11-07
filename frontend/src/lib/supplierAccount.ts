export interface SupplierAccountInfo {
  status: 'NO_ACCOUNT' | 'INVITATION_PENDING' | 'INVITATION_EXPIRED' | 'ACCOUNT_ACTIVE' | 'EMAIL_REQUIRED' | 'CONFLICT' | 'UNAVAILABLE';
  canInvite: boolean;
  reason: string;
  expiresAt: string | null;
  conflict: { code: string; nextAction: string; account: { userId: number; role: string | null; status: string; supplierId: number | null } | null } | null;
}

export function mapSupplierAccount(account: any): SupplierAccountInfo {
  const known = ['NO_ACCOUNT', 'INVITATION_PENDING', 'INVITATION_EXPIRED', 'ACCOUNT_ACTIVE', 'EMAIL_REQUIRED', 'CONFLICT', 'UNAVAILABLE'];
  const status: SupplierAccountInfo['status'] = known.includes(account?.status) ? account.status : 'UNAVAILABLE';
  const conflict = account?.conflict;
  return {
    status,
    canInvite: ['NO_ACCOUNT', 'INVITATION_PENDING', 'INVITATION_EXPIRED'].includes(status) && account?.can_invite === true,
    reason: account?.reason || 'Supplier Account status is unavailable.',
    expiresAt: account?.expires_at || null,
    conflict: status === 'CONFLICT' && conflict ? {
      code: conflict.code,
      nextAction: conflict.next_action,
      account: conflict.account ? { userId: conflict.account.user_id, role: conflict.account.role, status: conflict.account.status, supplierId: conflict.account.supplier_id } : null,
    } : null,
  };
}

export function supplierConflictTitle(code?: string): string {
  return ({ LINKED_ROLE_MISMATCH: 'Linked account has a different role', EMAIL_ROLE_CONFLICT: 'Email belongs to another account role',
    EMAIL_LINKED_TO_OTHER_SUPPLIER: 'Account belongs to another supplier', SUPPLIER_LINK_MISSING: 'Supplier relationship is missing',
    LINKED_EMAIL_MISMATCH: 'Pending account email differs', AMBIGUOUS_EMAIL: 'Multiple matching user accounts' } as Record<string, string>)[code ?? ''] ?? 'Account ownership requires review';
}
