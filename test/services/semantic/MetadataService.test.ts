
import { describe, it, expect } from 'vitest';
import { MetadataService } from '../../../src/services/semantic/MetadataService';
import type { Dataset } from '../../../src/lib/metadata';

describe('MetadataService', () => {
    const mockDataset: Dataset = {
        id: 'test',
        name: 'Test Dataset',
        sources: [],
        schema: [],
        semantic: {
            measures: [],
            dimensions: [
                {
                    name: 'uf',
                    label: 'Estado',
                    attributes: [
                        {
                            name: 'uf',
                            type: 'VARCHAR',
                            label: 'Estado',
                            sql: 't.uf'
                        }
                    ]
                },
                {
                    name: 'localizacao',
                    type: 'geo',
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

    it('should find nested attribute', () => {
        const def = MetadataService.findDimensionOrAttribute(mockDataset, 'municipio');
        expect(def).toBeDefined();
        expect(def?.label).toBe('Município');
        // Only Attributes have SQL
        expect((def as any).sql).toBe('t.nome_mun');
    });

    it('should return undefined for unknown column', () => {
        const def = MetadataService.findDimensionOrAttribute(mockDataset, 'unknown');
        expect(def).toBeUndefined();
    });

    it('should resolve label for attribute', () => {
        const label = MetadataService.getColumnLabel(mockDataset, 'municipio', 'semantic');
        expect(label).toBe('Município');
    });



});
