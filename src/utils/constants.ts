export const API_URL = 'https://api.raporty.pse.pl/api/pk5l-wp';

export const DEFAULT_ORANGE_THRESHOLD = 500;
export const DEFAULT_RED_THRESHOLD = 300;

export const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export const PULL_THRESHOLD_PX = 80;

export const STORAGE_PREFIX = 'pse-dashboard-';

export const SETTINGS_VERSION = 1;

export const HOURS_PER_DAY = 24;
export const DAYS_TO_FETCH = 3;
export const TOTAL_HOURS = HOURS_PER_DAY * DAYS_TO_FETCH;

export const TREND_MAX_REASONABLE = 2000;
export const TREND_STABLE_THRESHOLD = 10;

export const DAY_NAMES = ['Dziś', 'Jutro', 'Pojutrze'] as const;
