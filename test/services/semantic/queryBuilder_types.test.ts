
import { describe, it, expect } from 'vitest';
import { buildSql } from '../../../src/services/semantic/queryBuilder';
import type { Dataset } from '../../../src/lib/metadata';
import type { Filter } from '../../../src/types';
import type { QueryState } from '../../../src/types';

describe('queryBuilder - Data Types QA', () => {
    const mockDataset: Dataset = {
        id: 'types_test',
        name: 'Types Test',
        sources: [],
        schema: [],
        semantic: {
            dimensions: [
                { name: 'str_col', label: 'String', sql: 't.str', dataType: 'VARCHAR' },
                { name: 'int_col', label: 'Integer', sql: 't.int', dataType: 'INTEGER' },
                { name: 'float_col', label: 'Float', sql: 't.flt', dataType: 'FLOAT' },
                { name: 'date_col', label: 'Date', sql: 't.dt', dataType: 'DATE' },
                { name: 'bool_col', label: 'Bool', sql: 't.bool', dataType: 'BOOLEAN' },
                // Composite with typed attribute
                {
                    name: 'group',
                    label: 'Group',
                    attributes: [
                        { name: 'nested_str', label: 'Nested Str', sql: 't.n_str', type: 'VARCHAR' }
                    ]
                }
            ],
            measures: [
                { name: 'count', label: 'Count', sql: 'COUNT(*)' }
            ]
        }
    };

    const baseState: QueryState = {
        selectedDatasetId: 'types_test',
        selectedColumns: [],
        selectedDimensions: ['str_col'],
        selectedMeasures: ['count'],
        limit: 10
    };

    it('should quote VARCHAR values', () => {
        const filters: Filter[] = [
            { id: 1, column: 'str_col', operator: '=', value: 'hello' }
        ];
        const sql = buildSql(mockDataset, baseState, filters, []);
        expect(sql).toContain("t.str = 'hello'");
    });

    it('should NOT quote INTEGER values', () => {
        const filters: Filter[] = [
            { id: 1, column: 'int_col', operator: '=', value: '123' }
        ];
        // We need to temporarily select int_col so builder knows it
        const state = { ...baseState, selectedDimensions: ['int_col'] };
        const sql = buildSql(mockDataset, state, filters, []);
        expect(sql).toContain("t.int = 123");
    });

    it('should NOT quote FLOAT values', () => {
        const filters: Filter[] = [
            { id: 1, column: 'float_col', operator: '>', value: '45.67' }
        ];
        const state = { ...baseState, selectedDimensions: ['float_col'] };
        const sql = buildSql(mockDataset, state, filters, []);
        expect(sql).toContain("t.flt > 45.67");
    });

    it('should quote DATE values', () => {
        const filters: Filter[] = [
            { id: 1, column: 'date_col', operator: '=', value: '2023-01-01' }
        ];
        const state = { ...baseState, selectedDimensions: ['date_col'] };
        const sql = buildSql(mockDataset, state, filters, []);
        expect(sql).toContain("t.dt = '2023-01-01'");
    });

    it('should handle BOOLEAN true/false', () => {
        // Assuming string "true"/"false" from UI or boolean
        const filters: Filter[] = [
            { id: 1, column: 'bool_col', operator: '=', value: 'true' }
        ];
        const state = { ...baseState, selectedDimensions: ['bool_col'] };
        const sql = buildSql(mockDataset, state, filters, []);
        // DuckDB/Postgres usually accept TRUE/FALSE literals or 'true'/'false' strings.
        // Our builder currently might quote strings. Ideally unquoted for consistency but strings work in many SQLs.
        // Let's verify what it DOES currently.
        // If logic relies on typeof value, 'true' string is quoted.
        // If logic relies on metadata type, we might want to fix it to be unquoted TRUE/FALSE.
        // For now, let's observe.
        expect(sql).toContain("t.bool = true"); // Unquoted boolean
    });

    it('should quote Nested Attribute VARCHAR', () => {
        const filters: Filter[] = [
            { id: 1, column: 'nested_str', operator: '=', value: 'nested' }
        ];
        const state = { ...baseState, selectedDimensions: ['nested_str'] };
        const sql = buildSql(mockDataset, state, filters, []);
        expect(sql).toContain("t.n_str = 'nested'");
    });
});
