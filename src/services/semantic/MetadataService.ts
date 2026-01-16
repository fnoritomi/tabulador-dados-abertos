import type { Dataset, Dimension, Attribute, FormatOptions } from '../../lib/metadata';

export class MetadataService {
    /**
     * Finds a dimension or attribute definition by name, searching recursively.
     * Supports both Simple Dimensions (leaves) and Attributes.
     */
    static findDimensionOrAttribute(dataset: Dataset | null, name: string): Attribute | Dimension | undefined {
        if (!dataset?.semantic) return undefined;
        return this.findRecursive(dataset.semantic.dimensions, name);
    }

    private static findRecursive(nodes: Dimension[], name: string): Attribute | Dimension | undefined {
        for (const node of nodes) {
            // 1. Check if the dimension itself matches
            if (node.name === name) {
                // If it's a Simple Dimension (has sql), it's a valid match for filtering/selection
                if (node.sql) return node;
                // If it's a Composite Dimension, we usually don't select the group itself, 
                // but we might want the label.
                return node;
            }

            // 2. Check its attributes
            if (node.attributes) {
                const attr = node.attributes.find(a => a.name === name);
                if (attr) return attr;
            }

            // 3. Recurse into subDimensions
            if (node.subDimensions) {
                const found = this.findRecursive(node.subDimensions, name);
                if (found) return found;
            }
        }
        return undefined;
    }



    /**
     * Resolves the display label for a column based on the dataset metadata and mode.
     */
    static getColumnLabel(dataset: Dataset | null, colName: string, mode: 'semantic' | 'raw' = 'raw'): string {
        if (!dataset || mode === 'raw') return colName;
        if (!dataset.semantic) return colName;

        const def = this.findDimensionOrAttribute(dataset, colName);
        if (def?.label) return def.label;

        // Try to find in Measures
        const meas = dataset.semantic.measures.find(m => m.name === colName);
        if (meas?.label) return meas.label;

        return colName;
    }

    /**
     * Resolves the data type for a column to assist in export formatting.
     */
    static getColumnType(dataset: Dataset | null, colName: string, mode: 'semantic' | 'raw' = 'raw'): string | undefined {
        if (!dataset) return undefined;

        // Semantic Mode
        if (mode === 'semantic' && dataset.semantic) {
            const def = this.findDimensionOrAttribute(dataset, colName);
            if (def) {
                if ('dataType' in def && def.dataType) return def.dataType;
                if ('type' in def && def.type) return (def as Attribute).type;
            }

            const meas = dataset.semantic.measures.find(m => m.name === colName);
            if (meas) return 'FLOAT';
        }

        // Raw Mode (or fallback) - Check Dataset Schema
        const col = dataset.schema.find(c => c.name === colName);
        if (col) {
            // Map Dataset types to generic types if needed, or return as is.
            // Dataset types: 'string' | 'integer' | 'double' | 'boolean' | 'date' | 'timestamp'
            const type = col.type.toLowerCase();
            if (type === 'date') return 'DATE';
            if (type === 'timestamp' || type === 'datetime') return 'TIMESTAMP';
            if (type === 'integer') return 'INTEGER';
            if (type === 'double' || type === 'float') return 'FLOAT';
            return type.toUpperCase();
        }

        return undefined;
    }

    /**
     * Resolves formatting options (e.g. decimals) for a column.
     */
    /**
     * Resolves formatting options for a column.
     */
    static getColumnFormat(dataset: Dataset | null, colName: string, mode: 'semantic' | 'raw' = 'raw'): FormatOptions | undefined {
        if (!dataset || mode === 'raw') {
            // Raw mode default: no grouping for IDs/numbers
            return { useThousandsSeparator: false };
        }
        if (!dataset.semantic) return undefined;

        // Check Measures
        const meas = dataset.semantic.measures.find(m => m.name === colName);
        if (meas) {
            // Prioritize new 'format' object
            if (meas.format) return meas.format;
            // Fallback to deprecated 'display_decimals'
            if (meas.display_decimals !== undefined) {
                return { type: 'number', decimals: meas.display_decimals };
            }
        }

        // Check Dimensions / Attributes
        const def = this.findDimensionOrAttribute(dataset, colName);
        if (def && def.format) {
            return def.format;
        }

        return undefined;
    }
}
