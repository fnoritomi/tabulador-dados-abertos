import { describe, it, expect } from 'vitest';
import { formatValue } from './formatting';
import type { AppFormattingConfig } from './formatting';

describe('Formatting Utils (Intl)', () => {
    // pt-BR Config
    const ptConfig: AppFormattingConfig = {
        locale: 'pt-BR',
        currency: 'BRL',
        csv: { separator: ';', encoding: 'Windows-1252' }
    };

    // en-US Config
    const enConfig: AppFormattingConfig = {
        locale: 'en-US',
        currency: 'USD',
        csv: { separator: ',', encoding: 'UTF-8' }
    };

    describe('DATE Formatting', () => {
        it('should format date for pt-BR (dd/mm/yyyy)', () => {
            const date = new Date(Date.UTC(2023, 0, 25)); // Jan 25 2023
            // Note: unexpected space varies by node version sometimes, but regex helps or standard check
            // pt-BR dateStyle: 'short' -> 25/01/2023
            expect(formatValue(date, 'DATE', ptConfig)).toMatch(/25\/01\/2023/);
        });

        it('should format date for en-US (m/d/yy)', () => {
            const date = new Date(Date.UTC(2023, 0, 25));
            // en-US dateStyle: 'short' -> 1/25/23
            expect(formatValue(date, 'DATE', enConfig)).toMatch(/1\/25\/23/);
        });
    });

    describe('NUMBER Formatting', () => {
        it('should format integer for pt-BR (1.000)', () => {
            expect(formatValue(1234, 'INTEGER', ptConfig)).toBe('1.234');
        });

        it('should format integer for en-US (1,000)', () => {
            expect(formatValue(1234, 'INTEGER', enConfig)).toBe('1,234');
        });

        it('should format float for pt-BR (1.234,56)', () => {
            expect(formatValue(1234.56, 'FLOAT', ptConfig)).toBe('1.234,56');
        });

        it('should format float for en-US (1,234.56)', () => {
            expect(formatValue(1234.56, 'FLOAT', enConfig)).toBe('1,234.56');
        });

        it('should format currency for pt-BR', () => {
            // Note: non-breaking space issues common in currency testing
            const result = formatValue(10, 'FLOAT', ptConfig, { type: 'currency' });
            expect(result.replace(/\s/g, ' ')).toContain('R$ 10,00');
        });
    });

    describe('Overrides', () => {
        it('should respect decimals override', () => {
            expect(formatValue(1234.5678, 'FLOAT', ptConfig, { decimals: 1 })).toBe('1.234,6');
        });

        it('should respect useThousandsSeparator: false', () => {
            expect(formatValue(1234.56, 'FLOAT', ptConfig, { useThousandsSeparator: false })).toBe('1234,56');
        });
    });
});
