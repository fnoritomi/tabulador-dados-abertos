import type { FormatConfig, NumberFormatConfig, DateFormatConfig } from './types';

export class SemanticFormatter {
    private locale: string;

    constructor(locale: string = 'pt-BR') {
        this.locale = locale;
    }

    format(value: any, config?: FormatConfig, typeOverride?: 'date' | 'number'): string {
        if (value === null || value === undefined) return '';

        if (typeOverride === 'date' || config?.date) {
            return this.formatDate(value, config?.date);
        }

        if (typeOverride === 'number' || (typeof value === 'number' && config?.number)) {
            return this.formatNumber(value, config?.number);
        }

        // Fallback or explicit string
        if (value instanceof Date) return this.formatDate(value);
        if (typeof value === 'number') return this.formatNumber(value);

        return String(value);
    }

    private formatNumber(value: number, config?: NumberFormatConfig): string {
        const options: Intl.NumberFormatOptions = {};

        if (config) {
            if ((config as any).style) options.style = (config as any).style; // Allow direct style override if present in TS definition (it's not in ours yet, but useful)

            if (config.currency) {
                options.style = 'currency';
                options.currency = config.currency;
            } else if (config.percent) {
                options.style = 'percent';
            } else if (config.notation) {
                options.notation = config.notation;
            }

            if (config.use_grouping === false) options.useGrouping = false;

            if (config.decimals !== undefined) {
                options.minimumFractionDigits = config.decimals;
                options.maximumFractionDigits = config.decimals;
            }
        }

        return new Intl.NumberFormat(this.locale, options).format(value);
    }

    private formatDate(value: any, config?: DateFormatConfig): string {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return String(value);

        // Usage of pattern if provided
        if (config?.pattern) {
            return this.formatDatePattern(date, config.pattern);
        }

        // Fallback to Intl
        const options: Intl.DateTimeFormatOptions = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        };

        return new Intl.DateTimeFormat(this.locale, options).format(date);
    }

    private formatDatePattern(date: Date, pattern: string): string {
        const map: Record<string, string> = {
            'dd': String(date.getDate()).padStart(2, '0'),
            'd': String(date.getDate()),
            'MM': String(date.getMonth() + 1).padStart(2, '0'),
            'M': String(date.getMonth() + 1),
            'yyyy': String(date.getFullYear()),
            'yy': String(date.getFullYear()).slice(-2),
            'HH': String(date.getHours()).padStart(2, '0'),
            'mm': String(date.getMinutes()).padStart(2, '0'),
            'ss': String(date.getSeconds()).padStart(2, '0')
        };

        return pattern.replace(/dd|d|MM|M|yyyy|yy|HH|mm|ss/g, matched => map[matched]);
    }
}
