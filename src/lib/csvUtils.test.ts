import { describe, it, expect } from 'vitest';
import { arrowBatchToCsv } from './csvUtils';
import { Type } from 'apache-arrow';

// Mock Arrow structures simply for testing logic if possible, 
// or use real Arrow types if we can construct them easily.
// Constructing real Arrow batches is verbose. 
// For this test, we can mock the behavior if we inspect how arrowBatchToCsv works.
// It uses: batch.schema.fields, batch.numRows, batch.getChildAt(j).get(i).

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
        expect(csv).toContain('"with,comma"');
        expect(csv).toContain('"with""quote"'); // Double quote escape
        expect(csv).toContain('"with\nnewline"');
    });

    it('should format dates as ISO 8601', () => {
        const date = new Date('2023-01-01T12:00:00Z');
        const data = [
            [date]
        ];
        const fields = [
            { name: 'dateCol', typeId: Type.Date }
        ];

        const batch = createMockBatch(data, fields);
        const csv = arrowBatchToCsv(batch, false);

        expect(csv.trim()).toBe(date.toISOString());
    });

    it('should handle Date numbers (epoch)', () => {
        const date = new Date('2023-01-01T00:00:00Z');
        const epoch = date.getTime();
        const data = [
            [epoch]
        ];
        const fields = [
            { name: 'dateCol', typeId: Type.Date }
        ];

        const batch = createMockBatch(data, fields);
        const csv = arrowBatchToCsv(batch, false);

        expect(csv.trim()).toBe(date.toISOString());
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

        expect(csv.trim()).toBe(','); // Empty,,Empty
    });
});
