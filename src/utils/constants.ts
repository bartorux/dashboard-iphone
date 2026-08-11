export const API_URL = 'https://api.raporty.pse.pl/api/pk5l-wp';

export const DEFAULT_ORANGE_THRESHOLD = 500;
export const DEFAULT_RED_THRESHOLD = 300;

/**
 * Bounds for the user's alert thresholds, taken from the distribution of the
 * margin over 792 measured hours.
 *
 * The alarm floor is 0 because a deficit is an alarm by definition — a negative
 * threshold would assert the opposite and quietly stop flagging real shortfalls.
 * The ceilings come from how much a threshold would cover: 1500 MW already marks
 * half of all hours, 2000 MW marks over two thirds, and past that the levels
 * stop distinguishing anything.
 */
export const RED_THRESHOLD_MIN = 0;
export const RED_THRESHOLD_MAX = 1500;
export const ORANGE_THRESHOLD_MAX = 2000;

export const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export const PULL_THRESHOLD_PX = 80;

export const STORAGE_PREFIX = 'pse-dashboard-';

export const SETTINGS_VERSION = 1;

export const HOUR_MS = 60 * 60 * 1000;

/**
 * Row cap on the forecast query. PSE truncates silently past it, so it has to
 * clear the widest window `visibleDayOffsets` can produce — five working days
 * over a weekend and a run of holidays — with room to spare. At 24 rows a day,
 * 400 covers sixteen calendar days against a worst case of about eight.
 */
export const FORECAST_ROW_LIMIT = 400;

/**
 * The operator may refrain from declaring a call period despite the reserve
 * falling below what is required, provided the surplus stays at or above this
 * figure and it sees no threat to covering demand. A regulatory constant, not a
 * user setting — deliberately separate from the alert thresholds.
 */
export const CALL_PERIOD_EXEMPTION_MW = 1100;

export const TREND_STABLE_THRESHOLD = 10;

