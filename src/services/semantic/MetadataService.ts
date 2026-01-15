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
     * Returns a flat list of all attributes and selectable (Simple) dimensions for easy UI consumption.
     */
    static getFlatAttributes(dataset: Dataset | null): Array<(Attribute | Dimension) & { groupId: string, groupLabel: string }> {
        if (!dataset?.semantic) return [];
        const flat: Array<(Attribute | Dimension) & { groupId: string, groupLabel: string }> = [];
        this.flattenRecursive(dataset.semantic.dimensions, [], flat);
        return flat;
    }

    private static flattenRecursive(nodes: Dimension[], parentPath: string[], result: any[]) {
        for (const node of nodes) {
            const currentPath = [...parentPath, node.label || node.name];

            // Case A: Simple Dimension (Leaf)
            // It acts as its own attribute equivalent
            if (node.sql) {
                result.push({
                    ...node,
                    groupId: node.name, // Self-grouping
                    groupLabel: parentPath.join(' > ') // Use parent path as label context
                });
            }

            // Case B: Composite Dimension - Add its Attributes
            if (node.attributes) {
                node.attributes.forEach(attr => {
                    result.push({
                        ...attr,
                        groupId: node.name,
                        groupLabel: currentPath.join(' > ')
                    });
                });
            }

            // Recurse into subDimensions
            if (node.subDimensions) {
                this.flattenRecursive(node.subDimensions, currentPath, result);
            }
        }
    }

    // Kept for compatibility but points to new method
    static getFlatDimensions(dataset: Dataset | null): any[] {
        return this.getFlatAttributes(dataset);
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
        if (!dataset || mode === 'raw') return undefined;
        if (!dataset.semantic) return undefined;

        const def = this.findDimensionOrAttribute(dataset, colName);

        // Check for 'dataType' (Simple Dim) or 'type' (Attribute)
        if (def) {
            if ('dataType' in def && def.dataType) return def.dataType;
            if ('type' in def && def.type) return (def as Attribute).type;
        }

        const meas = dataset.semantic.measures.find(m => m.name === colName);
        if (meas) return 'FLOAT';

        return undefined;
    }

    /**
     * Resolves formatting options (e.g. decimals) for a column.
     */
    /**
     * Resolves formatting options for a column.
     */
    static getColumnFormat(dataset: Dataset | null, colName: string, mode: 'semantic' | 'raw' = 'raw'): FormatOptions | undefined {
        if (!dataset || mode === 'raw') return undefined;
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
