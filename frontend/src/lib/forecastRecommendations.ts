import { apiClient } from './api';

export type ForecastRecommendation = {
  product_id: number;
  product_name: string;
  item_classification?: 'RAW_MATERIAL' | 'FINISHED_PRODUCT';
  warehouse_id: number;
  warehouse_name: string;
  unit: string;
  available_stock: number;
  eligible_confirmed_incoming?: number;
  incoming_data_supported?: boolean;
  status: 'REORDER_RECOMMENDED' | 'NO_REORDER_NEEDED' | 'NO_HISTORY' | 'UNSUPPORTED_UNIT' | 'WAREHOUSE_SCOPE_UNAVAILABLE' | 'UNAVAILABLE';
  actionable: boolean;
  message: string;
  raw_demand?: number;
  planning_demand?: number;
  net_need_raw?: number;
  recommended_reorder?: number;
  horizon_weeks?: number;
  generated_at?: string;
  stale?: boolean;
  model_version?: string;
  training_weeks?: number;
  model_quality?: { mae?: number };
  forecast?: Array<{ week_start: string; expected_quantity: number }>;
  existing_request?: { id: number; reference: string; status: string } | null;
  purchasing_rule?: PurchasingRule;
};

export type PurchasingRule = {
  mode: 'unique_agreement' | 'admin_validation';
  eligible_supplier_count?: number;
  term_id?: number;
  supplier_id?: number;
  supplier_name?: string;
  unit?: string;
  minimum_order_quantity?: number | null;
  maximum_order_quantity?: number | null;
  order_multiple?: number | null;
};

export type ForecastRecommendationsResponse = {
  data: ForecastRecommendation[];
  warehouse: { id: number; name: string };
  scope: string;
  formula: string;
  incoming_data_supported: boolean;
};

export const loadForecastRecommendations = async (signal?: AbortSignal) =>
  (await apiClient.get<ForecastRecommendationsResponse>('/plant-manager/procurement/forecast-recommendations', { signal })).data;

export const wholePackage = (value: number) => value > 0 ? Math.ceil(value) : 0;
