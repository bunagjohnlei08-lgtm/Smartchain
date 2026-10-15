import type { ProductionBatchRecord, ProductionStatus } from './productionApi';

export const QUALITY_CHECKS = {
  quantity_verified: 'I verified the actual produced quantity and its unit.',
  passed_inspected: 'The quantity marked as passed was inspected against the approved criteria for this product.',
  passed_meets_requirements: 'The units marked as passed meet the applicable quality requirements.',
  failed_excluded: 'Failed or non-conforming units are identified and excluded from the passed quantity.',
};
export type CheckKey = keyof typeof QUALITY_CHECKS;

export const PRODUCTION_BASE = '/plant-manager/production';
export const STEPS = ['Batch Details', 'Materials', 'Production Output', 'QA Inspection', 'Finished Goods Stock In'] as const;
export type ProductionStep = 1 | 2 | 3 | 4 | 5;
export const STATUS_LABELS: Record<ProductionStatus, string> = {
  PLANNED: 'Planned', IN_PRODUCTION: 'In Production', PENDING_QA: 'Awaiting QA',
  QA_COMPLETED: 'QA Complete', STOCKED_IN: 'Stocked In', CANCELLED: 'Cancelled',
};
export function listQuery(params: URLSearchParams): string {
  const result = new URLSearchParams();
  for (const key of ['q', 'status', 'page']) { const value = params.get(key); if (value) result.set(key, value); }
  return result.toString();
}
export function productionLink(path: string, query: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams(query);
  Object.entries(extra ?? {}).forEach(([key, value]) => params.set(key, value));
  return `${PRODUCTION_BASE}${path}${params.size ? `?${params}` : ''}`;
}
export function batchProgress(batch: ProductionBatchRecord) {
  const issued = !!batch.issued_at || (batch.materials.length > 0 && batch.materials.every(material => material.required_quantity !== null && material.required_quantity > 0 && material.issued_quantity >= material.required_quantity));
  const output = !!batch.output_recorded_at && batch.actual_quantity !== null;
  const inspected = !!batch.qa_completed_at && batch.actual_quantity !== null && batch.passed_quantity !== null && batch.failed_quantity !== null
    && batch.passed_quantity + batch.failed_quantity === batch.actual_quantity;
  const stocked = !!batch.stocked_in_at;
  const cancelled = batch.status === 'CANCELLED' || !!batch.cancelled_at;
  const shortage = batch.materials.length === 0 || batch.materials.some(material => material.blocking_reason || material.required_quantity === null || material.required_quantity <= 0 || material.available_quantity < Math.max(0, material.required_quantity - material.issued_quantity) || (material.shortage_quantity ?? 0) > 0);
  const canIssue = batch.status === 'PLANNED' && !issued && !cancelled && !shortage;
  const canOutput = batch.status === 'IN_PRODUCTION' && issued && !output && !cancelled;
  const canStockIn = batch.status === 'QA_COMPLETED' && inspected && (batch.passed_quantity ?? 0) > 0 && !stocked && !cancelled;
  const canCancel = !cancelled && !output && ['PLANNED', 'IN_PRODUCTION'].includes(batch.status);
  const current: ProductionStep = cancelled ? (issued ? 2 : 1) : stocked ? 5 : inspected ? ((batch.passed_quantity ?? 0) > 0 ? 5 : 4) : output ? 4 : issued ? 3 : 2;
  const unlocked: ProductionStep = cancelled ? (issued ? 2 : 1) : inspected ? 5 : output ? 4 : issued ? 3 : 2;
  const canContinue = !cancelled && !stocked && (batch.status === 'PLANNED' || canOutput || canStockIn);
  const stockedQuantity = stocked && inspected ? batch.passed_quantity! : 0; // Existing stock-in is atomic for ALL passed goods, not partial posting.
  const eligible = inspected ? batch.passed_quantity! : 0;
  const completed = (step: ProductionStep) => step === 1 || (step === 2 && issued) || (step === 3 && output) || (step === 4 && inspected) || (step === 5 && stocked);
  let next = 'Review batch information.';
  if (cancelled) next = 'This batch is cancelled. Review its recorded material disposition and history.';
  else if (stocked) next = 'Passed goods are stocked in. Continue customer fulfillment through the existing Inventory and Stock Out pages.';
  else if (batch.status === 'PLANNED') next = shortage ? 'Resolve the listed material shortages or incompatible demand before issuing.' : 'Review and issue the required materials to begin production.';
  else if (canOutput) next = batch.timing && !batch.timing.elapsed ? 'Wait for the minimum processing time, then deliberately record output and assign QA.' : 'Record actual produced quantity and assign a QA Supervisor.';
  else if (output && !inspected) next = 'Waiting for the assigned QA Supervisor to inspect the recorded output.';
  else if (canStockIn) next = 'Stock in only the QA-passed quantity. Destination capacity is checked when you submit.';
  else if (inspected && eligible === 0) next = 'All recorded output failed QA. No goods are eligible for stock-in; QA handles the internal disposition.';
  else next = 'Recorded status and required production data do not establish a valid next action. Refresh the batch or ask an administrator to review it.';
  return { issued, output, inspected, stocked, cancelled, shortage, canIssue, canOutput, canStockIn, canCancel, canContinue, current, unlocked, completed, next, eligible, stockedQuantity, remaining: Math.max(0, eligible - stockedQuantity) };
}
export function dateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}
