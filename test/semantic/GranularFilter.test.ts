
import { describe, it, expect, beforeEach } from 'vitest';
import { DuckDbSqlBuilder } from '../../src/semantic/sql_builder_duckdb';
import { registry } from '../../src/semantic/registry';
import type { SemanticModel } from '../../src/semantic/types';

describe('DuckDbSqlBuilder - Granular Filters', () => {
    let builder: DuckDbSqlBuilder;

    beforeEach(() => {
        builder = new DuckDbSqlBuilder();
        // Mock Registry
        registry.registerModel({
            name: 'test_model', // Required by registry.registerModel
            model: 'test_model',
            dimensions: [
                { name: 'date_col', type: 'date', expr: 'date_col' },
                { name: 'other_col', type: 'string', expr: 'other_col' }
            ],
            measures: [],
            joins: []
        } as unknown as SemanticModel);

        registry.registerDataset({
            name: 'test_model',
            relation: 'test_table',
            columns: []
        });
    });

    it('should generate range for Year equality', () => {
        const query = {
            mode: 'semantic',
            semanticModel: 'test_model',
            dimensions: ['date_col'],
            measures: [],
            filters: [{
                field: 'date_col',
                operator: '=',
                value: '2023',
                granularity: 'year'
            }]
        };

        // @ts-ignore
        const sql = builder.build(query);
        expect(sql).toContain("date_col >= '2023-01-01'");
        expect(sql).toContain("date_col < '2024-01-01'");
    });

    it('should generate range for Month equality', () => {
        const query = {
            mode: 'semantic',
            semanticModel: 'test_model',
            dimensions: ['date_col'],
            measures: [],
            filters: [{
                field: 'date_col',
                operator: '=',
                value: '2023-02',
                granularity: 'month'
            }]
        };

        // @ts-ignore
        const sql = builder.build(query);
        expect(sql).toContain("date_col >= '2023-02-01'");
        expect(sql).toContain("date_col < '2023-03-01'");
    });

    it('should generate range for Quarter equality', () => {
        // Q1 2023 -> 2023-01
        const query = {
            mode: 'semantic',
            semanticModel: 'test_model',
            dimensions: ['date_col'],
            measures: [],
            filters: [{
                field: 'date_col',
                operator: '=',
                value: '2023-01',
                granularity: 'quarter'
            }]
        };

        // @ts-ignore
        const sql = builder.build(query);
        expect(sql).toContain("date_col >= '2023-01-01'");
        expect(sql).toContain("date_col < '2023-04-01'");
    });

    it('should handle Greater Than Year', () => {
        const query = {
            mode: 'semantic',
            semanticModel: 'test_model',
            dimensions: ['date_col'],
            measures: [],
            filters: [{
                field: 'date_col',
                operator: '>',
                value: '2023',
                granularity: 'year'
            }]
        };

        // @ts-ignore
        const sql = builder.build(query);
        // > 2023 means >= 2024-01-01
        expect(sql).toContain("date_col >= '2024-01-01'");
    });

    it('should handle Less Than or Equal Month', () => {
        const query = {
            mode: 'semantic',
            semanticModel: 'test_model',
            dimensions: ['date_col'],
            measures: [],
            filters: [{
                field: 'date_col',
                operator: '<=',
                value: '2023-02',
                granularity: 'month'
            }]
        };

        // @ts-ignore
        const sql = builder.build(query);
        // <= Feb 2023 means < 2023-03-01
        expect(sql).toContain("date_col < '2023-03-01'");
    });
});
