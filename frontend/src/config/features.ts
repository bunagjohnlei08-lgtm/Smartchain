const enabled = (value: string | undefined): boolean =>
  ['1', 'true', 'on', 'yes'].includes(value?.trim().toLowerCase() ?? '');

export const AI_FORECAST_ENABLED = enabled(import.meta.env.VITE_AI_FORECAST_ENABLED);
