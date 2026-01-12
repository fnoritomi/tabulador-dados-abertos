import { describe, it, expect } from 'vitest';
import { arrowBatchToCsv } from './csvUtils';
import { Type } from 'apache-arrow';

// Mock Arrow structures
const createMockBatch = (data: any[], fields: any[]) => {
    return {
        schema: {
            fields: fields.map(f => ({
                name: f.name,
                typeId: f.typeId
            }))
        },
        numRows: data.length,
        getChildAt: (colIndex: number) => ({
            get: (rowIndex: number) => data[rowIndex][colIndex]
        })
    } as any;
};

describe('arrowBatchToCsv', () => {
    it('should escape fields with commas, quotes, or newlines', () => {
        const data = [
            ['normal', 'with,comma', 'with"quote', 'with\nnewline']
        ];
        const fields = [
            { name: 'col1', typeId: Type.Utf8 },
            { name: 'col2', typeId: Type.Utf8 },
            { name: 'col3', typeId: Type.Utf8 },
            { name: 'col4', typeId: Type.Utf8 }
        ];

        const batch = createMockBatch(data, fields);
        const csv = arrowBatchToCsv(batch, false);

        expect(csv).toContain('normal');
        expect(csv).toContain('with,comma'); // Comma (,) doesn't need escape with (;) separator
        expect(csv).toContain('"with""quote"'); // Double quote escape
        expect(csv).toContain('"with\nnewline"');
    });

    it('should format dates using App Config (DD/MM/YYYY)', () => {
        // 2023-01-01
        const date = new Date(Date.UTC(2023, 0, 1));
        const data = [
            [date]
        ];
        const fields = [
            { name: 'dateCol', typeId: Type.Date }
        ];

        const batch = createMockBatch(data, fields);
        const csv = arrowBatchToCsv(batch, false);

        expect(csv.trim()).toBe('01/01/2023');
    });

    it('should handle Date numbers (epoch)', () => {
        const date = new Date(Date.UTC(2023, 0, 1));
        const epoch = date.getTime();
        const data = [
            [epoch]
        ];
        const fields = [
            { name: 'dateCol', typeId: Type.Date }
        ];

        const batch = createMockBatch(data, fields);
        const csv = arrowBatchToCsv(batch, false);

        expect(csv.trim()).toBe('01/01/2023');
    });

    it('should replace null/undefined with empty string', () => {
        const data = [
            [null, undefined]
        ];
        const fields = [
            { name: 'col1', typeId: Type.Utf8 },
            { name: 'col2', typeId: Type.Utf8 }
        ];

        const batch = createMockBatch(data, fields);
        const csv = arrowBatchToCsv(batch, false);

        expect(csv.trim()).toBe(';'); // Empty;;Empty
    });

    it('should format decimals with overrides', () => {
        const data = [
            [1234.5678]
        ];
        const fields = [
            { name: 'val', typeId: Type.Float }
        ];

        const batch = createMockBatch(data, fields);

        // Default separator is ';'
        const csvDefault = arrowBatchToCsv(batch, false);
        // Default config: thousand='.' decimal=',' separator=';'
        // No quotes needed because ',' is not ';'
        expect(csvDefault.trim()).toBe('1.234,5678');

        // With Override
        const override = (col: string) => col === 'val' ? { decimals: 2 } : undefined;
        const csvOverride = arrowBatchToCsv(batch, false, override);
        expect(csvOverride.trim()).toBe('1.234,57');
    });

    it('should use friendly headers if provided', () => {
        const data = [['foo']];
        const fields = [{ name: 'col_raw', typeId: Type.Utf8 }];
        const batch = createMockBatch(data, fields);

        const getColumnLabel = (col: string) => col === 'col_raw' ? 'Friendly Name' : col;

        const csv = arrowBatchToCsv(batch, true, undefined, getColumnLabel);
        // Expect header to be 'Friendly Name'
        // Separator is ';' in default config
        const lines = csv.trim().split('\n');
        expect(lines[0].trim()).toBe('Friendly Name');
        expect(lines[1].trim()).toBe('foo');
    });
});
