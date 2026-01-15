
import { describe, it, expect } from 'vitest';
import { buildSql } from '../../../src/services/semantic/queryBuilder';
import { MetadataService } from '../../../src/services/semantic/MetadataService';
import type { Dataset } from '../../../src/lib/metadata';
import type { QueryState } from '../../../src/types';

describe('queryBuilder - Attributes', () => {
    const mockDataset: Dataset = {
        id: 'test',
        name: 'Test Dataset',
        sources: ['data.parquet'],
        schema: [],
        semantic: {
            measures: [
                { name: 'count', sql: 'COUNT(*)', label: 'Contagem' }
            ],
            dimensions: [
                {
                    name: 'uf',
                    type: 'VARCHAR',
                    label: 'Estado',
                    sql: 't.uf'
                },
                {
                    name: 'localizacao',
                    type: 'group',
                    label: 'Localização',
                    attributes: [
                        {
                            name: 'municipio',
                            type: 'VARCHAR',
                            label: 'Município',
                            sql: 't.nome_mun'
                        },
                        {
                            name: 'cod_mun',
                            type: 'INTEGER',
                            label: 'Cód. Município',
                            sql: 't.cod_mun'
                        }
                    ]
                }
            ]
        }
    };

    const baseState: QueryState = {
        selectedDatasetId: 'test',
        selectedColumns: [],
        selectedDimensions: [],
        selectedMeasures: [],
        limit: 100
    };

    it('should generate SQL for simple top-level dimension', () => {
        const state = { ...baseState, selectedDimensions: ['uf'] };
        const sql = buildSql(mockDataset, state, [], []);
        expect(sql).toContain('t.uf AS uf');
        expect(sql).toContain('GROUP BY ALL');
    });

    it('should generate SQL for nested attribute', () => {
        const state = { ...baseState, selectedDimensions: ['municipio'] };
        const sql = buildSql(mockDataset, state, [], []);
        // Should use the SQL from the attribute definition
        expect(sql).toContain('t.nome_mun AS municipio');
        expect(sql).toContain('GROUP BY ALL');
    });

    it('should generate SQL for multiple attributes from same group', () => {
        const state = { ...baseState, selectedDimensions: ['municipio', 'cod_mun'] };
        const sql = buildSql(mockDataset, state, [], []);
        expect(sql).toContain('t.nome_mun AS municipio');
        expect(sql).toContain('t.cod_mun AS cod_mun');
    });

    it('should generate SQL for mix of top-level dimension and attribute', () => {
        const state = { ...baseState, selectedDimensions: ['uf', 'municipio'] };
        const sql = buildSql(mockDataset, state, [], []);
        expect(sql).toContain('t.uf AS uf');
        expect(sql).toContain('t.nome_mun AS municipio');
    });

    it('should correctly filter on aliased attribute with quoting', () => {
        // uf maps to t.uf. Let's assume t.uf is a string in raw schema.
        // We need to update mockDataset schema to have types for quoting to work
        const datasetWithSchema: Dataset = {
            ...mockDataset,
            schema: [
                { name: 't.uf', type: 'VARCHAR' },
                { name: 't.nome_mun', type: 'VARCHAR' }
            ]
        };

        const filterState: QueryState = { ...baseState };
        const filters = [{ id: 1, column: 'uf', operator: '=', value: 'SP' }];

        const sql = buildSql(datasetWithSchema, filterState, filters, []);

        // Should resolve 'uf' -> 't.uf' and quote 'SP' because t.uf is VARCHAR
        expect(sql).toContain("WHERE t.uf = 'SP'");
    });
});
