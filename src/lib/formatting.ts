export type DateFormatOrder = 'DMY' | 'MDY' | 'YMD';

export interface AppFormattingConfig {
    date: {
        order: DateFormatOrder;
        separator: string;
    };
    timestamp: {
        order: DateFormatOrder;
        dateSeparator: string;
        timeSeparator: string;
        dateTimeSeparator: string;
    };
    number: {
        thousandSeparator: string;
        decimalSeparator: string;
    };
    csv: {
        separator: string;
        encoding: 'UTF-8' | 'UTF-8-BOM' | 'Windows-1252';
    };
}

export let DEFAULT_CONFIG: AppFormattingConfig = {
    date: {
        order: 'DMY',
        separator: '/'
    },
    timestamp: {
        order: 'DMY',
        dateSeparator: '/',
        timeSeparator: ':',
        dateTimeSeparator: ' '
    },
    number: {
        thousandSeparator: '.',
        decimalSeparator: ','
    },
    csv: {
        separator: ';', // Common in regions using comma for decimals
        encoding: 'UTF-8' // Default
    }
};

export const setConfig = (config: AppFormattingConfig) => {
    DEFAULT_CONFIG = config;
};

/**
 * pads a number with leading zeros
 */
const pad = (n: number) => n.toString().padStart(2, '0');

/**
 * Formats a single date part (day, month, year) based on order using the provided separator
 */
const combineDateParts = (day: number, month: number, year: number, order: DateFormatOrder, separator: string): string => {
    const d = pad(day);
    const m = pad(month);
    const y = year.toString();

    switch (order) {
        case 'DMY': return `${d}${separator}${m}${separator}${y}`;
        case 'MDY': return `${m}${separator}${d}${separator}${y}`;
        case 'YMD': return `${y}${separator}${m}${separator}${d}`;
    }
};

export const formatDate = (value: Date | number | string, config: AppFormattingConfig = DEFAULT_CONFIG): string => {
    if (value === null || value === undefined) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);

    return combineDateParts(
        date.getUTCDate(), // Use UTC to avoid timezone shifts from raw data usually
        date.getUTCMonth() + 1,
        date.getUTCFullYear(),
        config.date.order,
        config.date.separator
    );
};

export const formatTimestamp = (value: Date | number | string, config: AppFormattingConfig = DEFAULT_CONFIG): string => {
    if (value === null || value === undefined) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);

    const datePart = combineDateParts(
        date.getUTCDate(),
        date.getUTCMonth() + 1,
        date.getUTCFullYear(),
        config.timestamp.order,
        config.timestamp.dateSeparator
    );

    const timePart = `${pad(date.getUTCHours())}${config.timestamp.timeSeparator}${pad(date.getUTCMinutes())}${config.timestamp.timeSeparator}${pad(date.getUTCSeconds())}`;

    return `${datePart}${config.timestamp.dateTimeSeparator}${timePart}`;
};

export const formatInteger = (value: number, config: AppFormattingConfig = DEFAULT_CONFIG): string => {
    if (value === null || value === undefined || isNaN(value)) return '';
    // Format integer part with thousand separator
    return Math.trunc(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, config.number.thousandSeparator);
};

export const formatFloat = (value: number, config: AppFormattingConfig = DEFAULT_CONFIG, decimalPlaces?: number): string => {
    if (value === null || value === undefined || isNaN(value)) return '';

    let strVal: string;
    if (decimalPlaces !== undefined) {
        // Round to fixed decimal places
        strVal = value.toFixed(decimalPlaces);
    } else {
        strVal = value.toString();
    }

    const parts = strVal.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1] || '';

    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.number.thousandSeparator);

    if (decimalPart) {
        return `${formattedInteger}${config.number.decimalSeparator}${decimalPart}`;
    } else {
        return formattedInteger;
    }
};

export const formatValue = (
    value: any,
    type: 'DATE' | 'TIMESTAMP' | 'INTEGER' | 'FLOAT' | 'VARCHAR' | 'OTHER',
    config: AppFormattingConfig = DEFAULT_CONFIG,
    overrides?: { decimals?: number }
): string => {
    if (value === null || value === undefined) return '';

    switch (type) {
        case 'DATE':
            return formatDate(value, config);
        case 'TIMESTAMP':
            return formatTimestamp(value, config);
        case 'INTEGER':
            return formatInteger(Number(value), config);
        case 'FLOAT':
            return formatFloat(Number(value), config, overrides?.decimals);
        default:
            if (value instanceof Date) return value.toLocaleString();
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
    }
};
