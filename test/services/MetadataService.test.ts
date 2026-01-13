import { describe, it, expect } from 'vitest';
import { MetadataService } from '../../src/services/semantic/MetadataService';
import type { Dataset } from '../../src/lib/metadata';

const mockDataset: Dataset = {
    id: 'test',
    name: 'Test Dataset',
    sources: [],
    schema: [],
    semantic: {
        dimensions: [
            { name: 'dim1', type: 'VARCHAR', label: 'Dimension 1' },
            { name: 'dim2', type: 'INTEGER' } // No label
        ],
        measures: [
            { name: 'meas1', sql: 'SUM(x)', label: 'Total Sales', display_decimals: 2 },
            { name: 'meas2', sql: 'COUNT(*)' } // No label, no formatting
        ]
    }
};

describe('MetadataService', () => {
    describe('getColumnLabel', () => {
        it('should return raw name if mode is raw', () => {
            expect(MetadataService.getColumnLabel(mockDataset, 'dim1', 'raw')).toBe('dim1');
        });

        it('should return label for dimension if defined', () => {
            expect(MetadataService.getColumnLabel(mockDataset, 'dim1', 'semantic')).toBe('Dimension 1');
        });

        it('should return name if label is missing for dimension', () => {
            expect(MetadataService.getColumnLabel(mockDataset, 'dim2', 'semantic')).toBe('dim2');
        });

        it('should return label for measure', () => {
            expect(MetadataService.getColumnLabel(mockDataset, 'meas1', 'semantic')).toBe('Total Sales');
        });

        it('should return default name if dataset is null', () => {
            expect(MetadataService.getColumnLabel(null, 'dim1')).toBe('dim1');
        });
    });

    describe('getColumnType', () => {
        it('should return undefined for raw mode', () => {
            expect(MetadataService.getColumnType(mockDataset, 'dim1', 'raw')).toBeUndefined();
        });

        it('should return type for dimension', () => {
            expect(MetadataService.getColumnType(mockDataset, 'dim1', 'semantic')).toBe('VARCHAR');
            expect(MetadataService.getColumnType(mockDataset, 'dim2', 'semantic')).toBe('INTEGER');
        });

        it('should return FLOAT (default) for measure', () => {
            expect(MetadataService.getColumnType(mockDataset, 'meas1', 'semantic')).toBe('FLOAT');
            expect(MetadataService.getColumnType(mockDataset, 'meas2', 'semantic')).toBe('FLOAT');
        });

        it('should return undefined for unknown column', () => {
            expect(MetadataService.getColumnType(mockDataset, 'unknown', 'semantic')).toBeUndefined();
        });
    });

    describe('getColumnFormat', () => {
        it('should return decimals for measure if defined', () => {
            expect(MetadataService.getColumnFormat(mockDataset, 'meas1', 'semantic')).toEqual({ decimals: 2 });
        });

        it('should return undefined for measure without explicit decimals', () => {
            expect(MetadataService.getColumnFormat(mockDataset, 'meas2', 'semantic')).toBeUndefined();
        });

        it('should return undefined for dimension', () => {
            expect(MetadataService.getColumnFormat(mockDataset, 'dim1', 'semantic')).toBeUndefined();
        });
    });
});
