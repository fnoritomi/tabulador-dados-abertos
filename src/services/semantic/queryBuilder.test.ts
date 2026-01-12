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

    it('should generate raw query with selected columns (Legacy Mode)', () => {
        const state = { ...baseState, selectedColumns: ['col1', 'col2'] };
        const sql = buildSql(mockDataset, state, emptyFilter, []);
        expect(sql).toContain("SELECT col1, col2 FROM read_parquet('test.parquet')");
        expect(sql).toContain("LIMIT 100");
    });

    it('should generate 3-layer SQL for standard aggregation', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: ['meas1']
        };
        const sql = buildSql(mockDataset, state, emptyFilter, []);

        // Layer 1: Source
        expect(sql).toContain("source_cte AS (");

        // Layer 2: Aggregation
        expect(sql).toContain("agregacao AS (");
        expect(sql).toContain("GROUP BY ALL");

        // Layer 3: Final
        expect(sql).toContain("SELECT dim1, meas1 FROM agregacao");
    });

    it('should handle Dimension Filters in Layer 1 (Source CTE)', () => {
        const state = { ...baseState, selectedDimensions: ['dim1'], selectedMeasures: ['meas1'] };
        const filters: Filter[] = [
            { id: 1, column: 'col1', operator: '=', value: 'val' }
        ];

        const sql = buildSql(mockDataset, state, filters, []);

        // Check filter inside Source CTE
        // It's part of the source_cte definition
        expect(sql).toMatch(/source_cte AS \([\s\S]*WHERE col1 = 'val'/);
    });

    it('should handle Measure Filters in Layer 3 (Final Query)', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: ['meas1']
        };
        const measureFilters: Filter[] = [
            { id: 1, column: 'meas1', operator: '>', value: '100' }
        ];

        const sql = buildSql(mockDataset, state, emptyFilter, measureFilters);

        // Check filter in Final Query
        expect(sql).toContain("WHERE meas1 > 100");
        expect(sql).not.toContain("HAVING");
    });

    it('should handle Semi-Additive Logic in Layer 1', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: ['semi_add_last']
        };
        const sql = buildSql(mockDataset, state, emptyFilter, []);

        // Window function in Layer 1
        expect(sql).toContain("dim_date = FIRST_VALUE(dim_date) OVER");

        // Aggregation in Layer 2
        expect(sql).toContain("SUM(CASE WHEN");
    });

    it('should include hidden measures in aggregation (Layer 2) for filtering', () => {
        // User selects dim1, but filters by hidden measure 'meas1' (not selected for display)
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: []
        };
        const measureFilters: Filter[] = [
            { id: 1, column: 'meas1', operator: '>', value: '50' }
        ];

        const sql = buildSql(mockDataset, state, emptyFilter, measureFilters);

        // Layer 2 should calculate meas1
        expect(sql).toContain("SUM(col2) AS meas1");

        // Layer 3 should filter by meas1
        expect(sql).toContain("WHERE meas1 > 50");
    });

    // NEW REGRESSION TEST
    it('should generate flag for hidden semi-additive measure used in filter', () => {
        const state = {
            ...baseState,
            selectedDimensions: ['dim1'],
            selectedMeasures: []
        };
        const measureFilters: Filter[] = [
            { id: 1, column: 'semi_add_last', operator: '>', value: '10' }
        ];

        const sql = buildSql(mockDataset, state, emptyFilter, measureFilters);

        // 1. Source CTE must generate the flag (currently FAILS)
        expect(sql).toContain("AS semi_add_last_flag");

        // 2. Aggregation must calculate the hidden measure
        expect(sql).toContain("SUM(CASE WHEN semi_add_last_flag THEN col2 END) AS semi_add_last");

        // 3. Final query must filter
        expect(sql).toContain("WHERE semi_add_last > 10");
    });
});
