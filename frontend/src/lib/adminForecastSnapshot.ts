import { readStoredUser } from './authUser';

export const ADMIN_FORECAST_SNAPSHOT_UPDATED_EVENT = 'smartchain:admin-forecast-snapshot-updated';

export type AdminForecastProduct = {
  id: number;
  name: string;
  unit: string;
  forecast: Array<{ week_start: string; expected_quantity: number }>;
  predictedDemand: number;
  averageWeeklyDemand: number;
  validationMae: number;
  modelVersion: string;
  trainingWeeks: number;
  forecastAsOf: string;
  forecastTimezone: string;
  horizonPolicy: string;
  trainingDataType: string;
};

export type AdminForecastSnapshot = {
  ownerUserId: number;
  horizonWeeks: number;
  savedAt: string;
  products: AdminForecastProduct[];
};

export const ADMIN_FORECAST_UNITS = ['DRUM', 'PCS', 'SACK'] as const;

export const adminPlanningQuantity = (value: number, unit: string): number =>
  ADMIN_FORECAST_UNITS.includes(unit.trim().toUpperCase() as typeof ADMIN_FORECAST_UNITS[number]) && value > 0
    ? Math.ceil(value)
    : value;

export const buildAdminForecastSeries = (products: AdminForecastProduct[]) => products[0]?.forecast.map((week, index) => ({
  weekStart: week.week_start,
  ...Object.fromEntries(ADMIN_FORECAST_UNITS.map((unit) => [
    unit,
    products
      .filter((product) => product.unit === unit)
      .reduce((sum, product) => sum + (product.forecast[index]?.expected_quantity ?? 0), 0),
  ])),
})) ?? [];

const storageKey = () => `smartchain:admin-forecast-snapshot:${readStoredUser()?.id ?? 'unknown'}`;

export const readAdminForecastSnapshot = (): AdminForecastSnapshot | null => {
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as AdminForecastSnapshot;
    if (snapshot.ownerUserId !== readStoredUser()?.id || !Array.isArray(snapshot.products)) return null;
    return snapshot;
  } catch {
    return null;
  }
};

export const saveAdminForecastSnapshot = (products: AdminForecastProduct[]): void => {
  const ownerUserId = readStoredUser()?.id;
  if (!ownerUserId || products.length === 0) return;
  const snapshot: AdminForecastSnapshot = {
    ownerUserId,
    horizonWeeks: products[0]?.forecast.length ?? 0,
    savedAt: new Date().toISOString(),
    products,
  };
  sessionStorage.setItem(storageKey(), JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent<AdminForecastSnapshot>(ADMIN_FORECAST_SNAPSHOT_UPDATED_EVENT, { detail: snapshot }));
};

export const subscribeToAdminForecastSnapshot = (listener: (snapshot: AdminForecastSnapshot) => void): (() => void) => {
  const handler = (event: Event) => listener((event as CustomEvent<AdminForecastSnapshot>).detail);
  window.addEventListener(ADMIN_FORECAST_SNAPSHOT_UPDATED_EVENT, handler);
  return () => window.removeEventListener(ADMIN_FORECAST_SNAPSHOT_UPDATED_EVENT, handler);
};
