import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../lib/api';

export type ProductionStatus = 'PLANNED' | 'IN_PRODUCTION' | 'PENDING_QA' | 'QA_COMPLETED' | 'STOCKED_IN' | 'CANCELLED';
export type ProductionOptions = {
  warehouse: { id: number; name: string } | null;
  products: Array<{ id: number; name: string; unit: string; bom_id: number | null }>;
  qa_assignees: Array<{ id: number; name: string }>;
  statuses: ProductionStatus[];
};
export type ProductionMaterial = {
  id: number; product_name: string; unit: string; bom_quantity: string;
  required_quantity: number | null; required_quantity_exact: string;
  available_quantity: number; issued_quantity: number; shortage_quantity: number | null;
  blocking_reason: string | null; disposition: string | null;
};
export type ProductionBatchRecord = {
  id: number; batch_number: string; product_name: string; unit: string; status: ProductionStatus;
  warehouse: { id: number; name: string }; target_quantity: number; bom_id: number; bom_output_quantity: number;
  created_by_name?: string | null; assigned_qa_name?: string | null; updated_at?: string;
  minimum_processing_minutes?: number | null; production_started_at?: string | null; output_available_at?: string | null;
  timing?: { minimum_processing_minutes: number; production_started_at: string | null; output_available_at: string | null; server_time: string; remaining_seconds: number; elapsed: boolean; compatibility: 'snapshot' | 'legacy_recorded_issuance' | 'legacy_no_recorded_start' };
  created_at: string; issued_at: string | null; actual_quantity: number | null;
  output_recorded_at: string | null; assigned_qa_user_id: number | null;
  passed_quantity: number | null; failed_quantity: number | null; qa_completed_at: string | null; qa_notes: string | null;
  stocked_in_at: string | null; cancelled_at: string | null; cancellation_reason: string | null;
  materials: ProductionMaterial[];
  non_conformance: { quantity: number; disposition: string; notes: string; resolved_at: string | null } | null;
  events: Array<{ id: number; action: string; notes: string | null; occurred_at: string; actor_name?: string; metadata?: Record<string, unknown> | null; performed_by?: { name: string } | string }>;
};
export function productionError(error: unknown): string {
  const cause = error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
  const data = cause.response?.data;
  return data?.errors ? Object.values(data.errors).flat().join(' ') : data?.message ?? 'Unable to load or update production. Please try again.';
}

/** Fetch every existing role-scoped page: the API has no server-side search contract. */
export async function fetchProductionBatches(signal: AbortSignal): Promise<ProductionBatchRecord[]> {
  const records: ProductionBatchRecord[] = [];
  let page = 1, lastPage = 1;
  do {
    const response = await apiClient.get<{ data: ProductionBatchRecord[]; last_page: number }>('/production/batches', { params: { page, per_page: 100 }, signal });
    records.push(...response.data.data);
    lastPage = response.data.last_page;
    page++;
  } while (page <= lastPage);
  return records;
}

export function useProductionOptions() {
  const [data, setData] = useState<ProductionOptions | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void apiClient.get<ProductionOptions>('/production/options', { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data); })
      .catch(cause => { if (!controller.signal.aborted) { setData(null); setError(productionError(cause)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return { data, error, loading, reload };
}

export function useProductionBatch(id: string | undefined) {
  const [data, setData] = useState<ProductionBatchRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const accept = useCallback((batch: ProductionBatchRecord) => {
    active.current?.abort(); setData(batch); setError(''); setLoading(false);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setData(null);
    if (!id || !/^\d+$/.test(id)) { setError('Choose a valid production batch.'); setLoading(false); return () => controller.abort(); }
    void apiClient.get<{ data: ProductionBatchRecord }>(`/production/batches/${id}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data.data); })
      .catch(cause => { if (!controller.signal.aborted) setError(productionError(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  return { data, error, loading, reload, accept };
}
