import type { FormatOptions } from './metadata';

export interface LocaleConfig {
    code: string;
    currency: string;
    csv: {
        separator: string;
        encoding: 'UTF-8' | 'UTF-8-BOM' | 'Windows-1252';
    };
}

export interface AppFormattingConfig {
    locale: string;
    currency: string;
    csv: {
        separator: string;
        encoding: 'UTF-8' | 'UTF-8-BOM' | 'Windows-1252';
    };
    locales?: LocaleConfig[]; // Registry of available locales

    defaults?: {
        date?: FormatOptions;
        timestamp?: FormatOptions;
        number?: FormatOptions;
    }
}

export let DEFAULT_CONFIG: AppFormattingConfig = {
    locale: 'pt-BR',
    currency: 'BRL',
    csv: { separator: ';', encoding: 'Windows-1252' }
};

export const setConfig = (config: AppFormattingConfig) => {
    DEFAULT_CONFIG = {
        ...DEFAULT_CONFIG,
        ...config
    };
};

// --- Intl Formatters ---

export const formatDate = (value: Date | number | string, config: AppFormattingConfig = DEFAULT_CONFIG, options?: FormatOptions): string => {
    if (value === null || value === undefined) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);

    // Explicit Pattern (legacy/custom support)
    if (options?.pattern) {
        return formatDateWithPattern(date, options.pattern);
    }

    // Default Intl Date
    return new Intl.DateTimeFormat(options?.locale || config.locale, {
        dateStyle: 'short', // e.g. dd/mm/yyyy
        timeZone: 'UTC' // Data usually comes as UTC/Date-only, avoid shifting
    }).format(date);
};

export const formatTimestamp = (value: Date | number | string, config: AppFormattingConfig = DEFAULT_CONFIG, options?: FormatOptions): string => {
    if (value === null || value === undefined) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);

    if (options?.pattern) {
        return formatDateWithPattern(date, options.pattern);
    }

    return new Intl.DateTimeFormat(options?.locale || config.locale, {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'UTC'
    }).format(date);
};

export const formatNumber = (value: number, config: AppFormattingConfig = DEFAULT_CONFIG, options?: FormatOptions): string => {
    if (value === null || value === undefined || isNaN(value)) return '';

    const locale = options?.locale || config.locale;
    const isCurrency = options?.type === 'currency';
    const isPercent = options?.type === 'percent';
    const useSeparator = options?.useThousandsSeparator ?? true;

    const intlOptions: Intl.NumberFormatOptions = {
        useGrouping: useSeparator
    };

    if (isCurrency) {
        intlOptions.style = 'currency';
        intlOptions.currency = options?.currency || config.currency;
    } else if (isPercent) {
        intlOptions.style = 'percent';
        // Percent logic: 0.1 -> 10%
    } else {
        intlOptions.style = 'decimal';
    }

    if (options?.decimals !== undefined) {
        intlOptions.minimumFractionDigits = options.decimals;
        intlOptions.maximumFractionDigits = options.decimals;
    } else {
        // Defaults if not specified check strict types
        if (isPercent) {
            intlOptions.minimumFractionDigits = 2;
            intlOptions.maximumFractionDigits = 2;
        }
        // For standard numbers, let Intl decide or default to 0-3
    }

    // Legacy fix: if type=INTEGER implied by usage, force decimals 0
    // But formatValue passes type argument so we use that in main function

    return new Intl.NumberFormat(locale, intlOptions).format(value);
};

// --- Helpers ---

const pad = (n: number) => n.toString().padStart(2, '0');

const formatDateWithPattern = (date: Date, pattern: string): string => {
    const d = pad(date.getUTCDate());
    const m = pad(date.getUTCMonth() + 1);
    const y = date.getUTCFullYear().toString();
    const H = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const s = pad(date.getUTCSeconds());

    return pattern
        .replace('dd', d)
        .replace('MM', m)
        .replace('yyyy', y)
        .replace('yy', y.slice(-2))
        .replace('HH', H)
        .replace('mm', min)
        .replace('ss', s);
};


// --- Main Export ---

export const formatValue = (
    value: any,
    type: 'DATE' | 'TIMESTAMP' | 'INTEGER' | 'FLOAT' | 'VARCHAR' | 'OTHER',
    config: AppFormattingConfig = DEFAULT_CONFIG,
    overrides?: FormatOptions
): string => {
    if (value === null || value === undefined) return '';

    // Handle "Type" overrides from Metadata that map to simple Types here
    let effectiveType = type;
    if (overrides) {
        if (overrides.type === 'date') effectiveType = 'DATE';
        if (overrides.type === 'datetime') effectiveType = 'TIMESTAMP';
        // 'number', 'currency', 'percent' all fall into Number logic, 
        // but we keep the main type switch for signature.
    }

    switch (effectiveType) {
        case 'DATE':
            return formatDate(value, config, overrides);
        case 'TIMESTAMP':
            return formatTimestamp(value, config, overrides);
        case 'INTEGER':
            // Force decimals 0 for INTEGER if not overridden
            return formatNumber(Number(value), config, { decimals: 0, ...overrides });
        case 'FLOAT':
            return formatNumber(Number(value), config, overrides);
        default:
            // If it's number-like (currency/percent) but type came as something else?
            if ((overrides?.type === 'currency' || overrides?.type === 'percent' || overrides?.type === 'number') && typeof value === 'number') {
                return formatNumber(value, config, overrides);
            }

            if (value instanceof Date) return formatDateTimestampAuto(value, config, overrides);
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
    }
};

const formatDateTimestampAuto = (value: Date, config: AppFormattingConfig, overrides?: FormatOptions) => {
    // Heuristic: if override says date/datetime
    if (overrides?.type === 'date') return formatDate(value, config, overrides);
    return formatTimestamp(value, config, overrides);
};
