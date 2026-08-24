export type QaInspectionStatus = 'Pending' | 'In Progress' | 'Passed' | 'Rejected' | 'Partial';

const inspectionStatusByToken: Record<string, QaInspectionStatus> = {
  PENDING: 'Pending',
  PENDING_QA: 'Pending',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  REJECTED: 'Rejected',
  PARTIAL: 'Partial',
};

export function normalizeInspectionStatus(value: unknown): QaInspectionStatus | null {
  if (typeof value !== 'string') return null;

  const token = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return inspectionStatusByToken[token] ?? null;
}

export function formatStatusLabel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Unknown';

  return value.trim().replace(/[_-]+/g, ' ');
}
