import { describe, it, expect } from 'vitest';
import { formatDate, formatTimestamp, formatInteger, formatFloat, DEFAULT_CONFIG } from './formatting';
import type { AppFormattingConfig } from './formatting';

describe('Formatting Utils', () => {
    const customConfig: AppFormattingConfig = {
        date: { order: 'MDY', separator: '-' },
        timestamp: { order: 'YMD', dateSeparator: '.', timeSeparator: '-', dateTimeSeparator: 'T' },
        number: { thousandSeparator: ',', decimalSeparator: '.' },
        csv: { separator: ',', encoding: 'UTF-8' }
    };

    describe('formatDate', () => {
        it('should format date using default config (DMY /)', () => {
            // 2023-01-25. Use UTC to ensure consistency
            const date = new Date(Date.UTC(2023, 0, 25));
            expect(formatDate(date, DEFAULT_CONFIG)).toBe('25/01/2023');
        });

        it('should format date using custom config (MDY -)', () => {
            const date = new Date(Date.UTC(2023, 0, 25));
            expect(formatDate(date, customConfig)).toBe('01-25-2023');
        });

        it('should handle string input', () => {
            expect(formatDate('2023-12-31', DEFAULT_CONFIG)).toBe('31/12/2023');
        });
    });

    describe('formatTimestamp', () => {
        it('should format timestamp using default config', () => {
            const date = new Date(Date.UTC(2023, 11, 25, 14, 30, 0)); // 25 Dec 2023 14:30:00 UTC
            expect(formatTimestamp(date, DEFAULT_CONFIG)).toBe('25/12/2023 14:30:00');
        });

        it('should format timestamp using custom config', () => {
            const date = new Date(Date.UTC(2023, 11, 25, 14, 30, 45));
            expect(formatTimestamp(date, customConfig)).toBe('2023.12.25T14-30-45');
        });
    });

    describe('formatInteger', () => {
        it('should format integer with default thousand separator (.)', () => {
            expect(formatInteger(1234567, DEFAULT_CONFIG)).toBe('1.234.567');
        });

        it('should format integer with custom thousand separator (,)', () => {
            expect(formatInteger(1234567, customConfig)).toBe('1,234,567');
        });

        it('should handle negative numbers', () => {
            expect(formatInteger(-1000, DEFAULT_CONFIG)).toBe('-1.000');
        });
    });

    describe('formatFloat', () => {
        it('should format float with default separators', () => {
            expect(formatFloat(1234.56, DEFAULT_CONFIG)).toBe('1.234,56');
        });

        it('should format float with custom separators', () => {
            expect(formatFloat(1234.56, customConfig)).toBe('1,234.56');
        });

        it('should respect decimal places override', () => {
            expect(formatFloat(1234.5678, DEFAULT_CONFIG, 2)).toBe('1.234,57'); // rounded
            expect(formatFloat(1234.5, DEFAULT_CONFIG, 2)).toBe('1.234,50'); // padded
        });

        it('should handle zero decimals', () => {
            expect(formatFloat(1234.9, DEFAULT_CONFIG, 0)).toBe('1.235');
        });
    });
});
