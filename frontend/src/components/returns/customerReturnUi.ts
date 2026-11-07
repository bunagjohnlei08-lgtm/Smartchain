export type ReturnMode = 'admin' | 'receiving' | 'qa' | 'stock-in';

export const RETURN_ORDER_NAVIGATION = {
  admin: { path: '/admin/return-orders', label: 'Return Orders' },
  qa: { path: '/qa/return-order-inspection', label: 'Return Order Inspection' },
} as const;

export const returnTabLabel = (mode: ReturnMode) => mode === 'qa' ? RETURN_ORDER_NAVIGATION.qa.label
  : mode === 'stock-in' ? 'Customer Return Stock In' : 'Return Orders';

export function legacyReturnDestination(pathname: string, search: string, hash: string): string | null {
  const destination = pathname === '/admin/order-management' ? RETURN_ORDER_NAVIGATION.admin.path
    : pathname === '/qa/inspection' ? RETURN_ORDER_NAVIGATION.qa.path : null;
  if (!destination) return null;
  const params = new URLSearchParams(search);
  const returnSelectors = ['returns', 'return-orders', 'returned-orders', 'customer-returns', 'return-inspections'];
  const returnTab = returnSelectors.includes(params.get('tab') ?? '');
  const returnHash = returnSelectors.includes(hash.replace(/^#/, ''));
  if (!returnTab && !returnHash) return null;
  if (returnTab) params.delete('tab');
  const remaining = params.toString();
  return destination + (remaining ? `?${remaining}` : '') + (returnHash ? '' : hash);
}

export function returnAction(mode: ReturnMode, row: {
  status: string; restock_status: string; disposal_status: string;
  passed_quantity: number; failed_quantity: number; restocked_quantity: number; disposed_quantity: number;
}) {
  if (mode === 'receiving' && row.status === 'AWAITING_RETURN') return 'receive';
  if (mode === 'qa' && row.status === 'PENDING_QA') return 'inspect';
  if (mode === 'stock-in' && row.restock_status === 'PENDING_STOCK_IN' && row.passed_quantity > row.restocked_quantity) return 'restock';
  if (mode === 'admin' && row.disposal_status === 'FOR_DISPOSAL' && row.failed_quantity > row.disposed_quantity) return 'dispose';
  return '';
}

export const returnActionLabel = (action: string) => (({ receive: 'Receive Return', inspect: 'Inspect Return', restock: 'Stock In Passed Quantity', dispose: 'Document Completed Disposal' } as Record<string, string>)[action] ?? action);

export function returnLoadError(error: unknown) {
  const response = (error as { response?: { status?: number } } | null)?.response;
  const status = response?.status;
  if (status === 403) return 'You are not authorized to access customer returns for this assignment or warehouse.';
  if (status === 401) return 'Your session could not be authenticated. Please sign in again.';
  if (!response) return 'Customer Returns is unavailable. Check your connection and use Refresh to retry.';
  return 'Customer Returns could not be loaded. Use Refresh to retry. If this persists, ask an administrator to verify the API and return migration.';
}

export function returnEmptyMessage(mode: ReturnMode, filtered: boolean) {
  if (filtered) return 'No customer returns match these filters.';
  if (mode === 'admin') return 'No customer returns have been registered.';
  if (mode === 'qa') return 'No customer returns are assigned for inspection.';
  if (mode === 'stock-in') return 'No customer returns are available for restocking.';
  return 'No customer returns are available for receiving.';
}
