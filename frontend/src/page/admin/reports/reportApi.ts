import { apiClient } from '../../../lib/api';

export type ReportFormat = 'CSV' | 'XLSX' | 'PDF';
export type ReportFilterName = 'date' | 'warehouse' | 'product' | 'supplier' | 'status' | 'movement_type' | 'category';
export type ColumnType = 'text' | 'number' | 'percent' | 'date' | 'datetime' | 'status';

export interface ReportColumn { key: string; label: string; type: ColumnType }

export interface ReportDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  category_label: string;
  formats: ReportFormat[];
  filters: ReportFilterName[];
  date_label: string | null;
  statuses: Array<{ value: string; label: string }>;
  columns: ReportColumn[];
  available: boolean;
  unavailable_reason: string | null;
  last_generated_at: string | null;
  active_schedules: number;
}

export interface ReportFilterValues {
  date_from?: string;
  date_to?: string;
  warehouse_id?: string;
  product_id?: string;
  supplier_id?: string;
  status?: string;
  movement_type?: string;
  category?: string;
}

export interface ReportHistoryItem {
  id: number;
  action: 'EXPORT' | 'PREVIEW';
  source: string;
  report_key: string;
  report_name: string;
  category: string;
  format: ReportFormat | null;
  filters: ReportFilterValues;
  status: 'SUCCESS' | 'FAILED';
  row_count: number | null;
  file_name: string | null;
  file_size: number | null;
  error_message: string | null;
  generated_at: string;
  generated_by: string | null;
}

export interface SchedulerState {
  last_run_at: string | null;
  running: boolean;
  overdue_schedules: number;
  requirement: string;
}

export interface ReportSchedule {
  id: number;
  report_key: string;
  report_name: string;
  category: string | null;
  format: ReportFormat;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  run_time: string;
  day_of_week: number | null;
  day_of_month: number | null;
  date_window: string;
  filters: ReportFilterValues;
  recipient: { id: number; name: string; email: string } | null;
  created_by: string | null;
  status: 'ACTIVE' | 'PAUSED';
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: 'SUCCESS' | 'FAILED' | null;
  last_error: string | null;
}

export interface ReportOptions {
  categories: Array<{ id: string; label: string }>;
  formats: Array<{ value: ReportFormat; label: string }>;
  warehouses: Array<{ id: number; name: string; code: string; status: string }>;
  products: Array<{ id: number; name: string; category: string | null }>;
  product_categories: string[];
  suppliers: Array<{ id: number; supplier_code: string; name: string; status: string }>;
  recipients: Array<{ id: number; name: string; email: string }>;
  schedule: { frequencies: string[]; date_windows: string[]; timezone: string };
}

export interface ReportPreview {
  report: { key: string; name: string; category: string; category_label: string; formats: ReportFormat[]; columns: ReportColumn[] };
  rows: Array<Record<string, string | number | null>>;
  total: number;
  page: number;
  per_page: number;
  last_page: number;
  generated_at: string;
  filters_applied: string[];
}

export const FORMAT_LABELS: Record<ReportFormat, string> = { CSV: 'CSV', XLSX: 'Excel', PDF: 'PDF' };

/** Only the filters the definition declares are sent; empty values are dropped. */
export const applicableFilters = (definition: ReportDefinition, values: ReportFilterValues): ReportFilterValues => {
  const allowed: Record<keyof ReportFilterValues, ReportFilterName> = {
    date_from: 'date', date_to: 'date', warehouse_id: 'warehouse', product_id: 'product',
    supplier_id: 'supplier', status: 'status', movement_type: 'movement_type', category: 'category',
  };
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value && definition.filters.includes(allowed[key as keyof ReportFilterValues])),
  ) as ReportFilterValues;
};

export const errorMessage = async (error: any, fallback: string): Promise<string> => {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return firstValidationError(parsed) || parsed.message || fallback;
    } catch {
      return fallback;
    }
  }
  return firstValidationError(data) || data?.message || fallback;
};

const firstValidationError = (data: any): string | null => {
  const errors = data?.errors;
  if (!errors || typeof errors !== 'object') return null;
  const first = Object.values(errors)[0];
  return Array.isArray(first) ? String(first[0]) : null;
};

export const downloadReport = async (payload: { report_key: string; format: ReportFormat; source?: string; title?: string } & ReportFilterValues) => {
  const response = await apiClient.post('/admin/reports/export', payload, { responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const extension = payload.format === 'XLSX' ? 'xlsx' : payload.format.toLowerCase();
  const filename = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] || `${payload.report_key.replace(/\W+/g, '_')}.${extension}`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = decodeURIComponent(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename: link.download, rows: Number(response.headers['x-report-rows'] ?? NaN) };
};

export const formatDateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const formatBytes = (bytes: number | null) => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
