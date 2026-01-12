import { describe, it, expect } from 'vitest';
import { buildSql } from './queryBuilder';
import type { Dataset } from '../../lib/metadata';
import type { QueryState, Filter } from '../../types';

describe('buildSql', () => {
    const mockDataset: Dataset = {
        id: 'test_ds',
        name: 'Test Dataset',
        sources: ['test.parquet'],
        schema: [
            { name: 'col1', type: 'VARCHAR' },
            { name: 'col2', type: 'INTEGER' }
        ],
        semantic: {
            dimensions: [
                { name: 'dim1', sql: 'col1', label: 'Dim 1', type: 'string' },
                { name: 'dim_date', sql: 'date_col', label: 'Date', type: 'date' }
            ],
            measures: [
                { name: 'meas1', sql: 'SUM(col2)', label: 'Meas 1' },
                {
                    name: 'semi_add_last',
                    sql: 'SUM(col2)',
                    label: 'Semi Add Last',
                    non_additive_dimension: {
                        dimension_name: 'dim_date',
                        window_choice: 'LAST_VALUE'
                    }
                }
            ]
        }
    };

    const emptyFilter: Filter[] = [];
    const baseState: QueryState = {
        selectedDatasetId: 'test_ds',
        selectedColumns: [],
        selectedDimensions: [],
        selectedMeasures: [],
        limit: 100
    };

    it('should generate raw query with selected columns', () => {
        const state = { ...baseState, selectedColumns: ['col1', 'col2'] };
        const sql = buildSql(mockDataset, state, emptyFilter, []);
        expect(sql).toContain("SELECT col1, col2 FROM read_parquet('test.parquet')");
        expect(sql).toContain("LIMIT 100");
    });

    it('should generate aggregation query with dimensions and measures', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: ['meas1']
        };
        const sql = buildSql(mockDataset, state, emptyFilter, []);

        expect(sql).toContain("SELECT col1 AS dim1, SUM(col2) AS meas1");
        expect(sql).toContain("GROUP BY 1");
    });

    it('should handle WHERE filters correctly', () => {
        const state = { ...baseState, selectedColumns: ['col1'] };
        const filters: Filter[] = [
            { id: 1, column: 'col1', operator: '=', value: 'val' },
            { id: 2, column: 'col2', operator: '>', value: '10' }
        ];

        const sql = buildSql(mockDataset, state, filters, []);

        // Check quoting for strings (col1 is VARCHAR) and no quoting for numbers (col2 is INTEGER)
        expect(sql).toContain("col1 = 'val'");
        expect(sql).toContain("col2 > 10");
        expect(sql).toContain("WHERE");
        expect(sql).toContain("AND");
    });

    it('should handle HAVING filters correctly', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: ['meas1']
        };
        const measureFilters: Filter[] = [
            { id: 1, column: 'meas1', operator: '>', value: '100' }
        ];

        const sql = buildSql(mockDataset, state, emptyFilter, measureFilters);

        // Should use the expression SUM(col2)
        expect(sql).toContain("HAVING SUM(col2) > 100");
    });

    it('should respect ignoreLimit flag', () => {
        const state = { ...baseState, selectedColumns: ['col1'] };
        const sql = buildSql(mockDataset, state, emptyFilter, [], true);

        expect(sql).not.toContain("LIMIT");
    });

    it('should generate CTE and Window Function for semi-additive measure', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: ['semi_add_last']
        };
        const sql = buildSql(mockDataset, state, emptyFilter, []);

        // Expect CTE definition
        expect(sql).toContain("WITH filtro_nao_aditivo AS (");

        // Expect Last Value Window Function logic (descending order)
        expect(sql).toContain("dim_date = FIRST_VALUE(dim_date) OVER (");
        expect(sql).toContain("ORDER BY dim_date DESC");

        // Expect QUALIFY because only semi-additive is selected
        expect(sql).toContain("QUALIFY");

        // Expect Aggregation using CASE WHEN
        expect(sql).toContain("SUM(CASE WHEN");
        expect(sql).toContain("THEN col2 END) AS semi_add_last");
    });

    it('should NOT use QUALIFY when mixing additive and semi-additive measures', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: ['meas1', 'semi_add_last']
        };
        const sql = buildSql(mockDataset, state, emptyFilter, []);

        expect(sql).toContain("WITH filtro_nao_aditivo AS (");
        // Should contain standard additive sum
        expect(sql).toContain("SUM(col2) AS meas1");
        // Should contain semi-additive conditional sum
        expect(sql).toContain("AS semi_add_last");

        // CRITICAL: Should NOT verify rows in strict mode using QUALIFY because we need all rows for the additive measure
        // Note: The user requirement says "QUALIFY ... -- Apply only if all measures are non-additive"
        expect(sql).not.toContain("QUALIFY");
    });
});
