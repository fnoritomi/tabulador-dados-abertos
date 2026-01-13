import type { Dataset } from '../../lib/metadata';

export class MetadataService {
    /**
     * Resolves the display label for a column based on the dataset metadata and mode.
     * @param dataset The active dataset
     * @param colName The column name (raw or semantic)
     * @param mode 'semantic' or 'raw'
     */
    static getColumnLabel(dataset: Dataset | null, colName: string, mode: 'semantic' | 'raw' = 'raw'): string {
        if (!dataset || mode === 'raw') return colName;
        if (!dataset.semantic) return colName;

        // Try to find in Dimensions
        const dim = dataset.semantic.dimensions.find(d => d.name === colName);
        if (dim?.label) return dim.label;

        // Try to find in Measures
        const meas = dataset.semantic.measures.find(m => m.name === colName);
        if (meas?.label) return meas.label;

        return colName;
    }

    /**
     * Resolves the data type for a column to assist in export formatting.
     * Returns 'FLOAT' for measures by default if not specified.
     */
    static getColumnType(dataset: Dataset | null, colName: string, mode: 'semantic' | 'raw' = 'raw'): string | undefined {
        if (!dataset || mode === 'raw') return undefined;
        if (!dataset.semantic) return undefined;

        const dim = dataset.semantic.dimensions.find(d => d.name === colName);
        if (dim?.type) return dim.type;

        const meas = dataset.semantic.measures.find(m => m.name === colName);
        // Measures are typically aggregations, so we treat them as FLOAT/numeric unless specified otherwise,
        // which helps export formatters decide if they should apply localization.
        if (meas) return 'FLOAT';

        return undefined;
    }

    /**
     * Resolves formatting options (e.g. decimals) for a column.
     */
    static getColumnFormat(dataset: Dataset | null, colName: string, mode: 'semantic' | 'raw' = 'raw'): { decimals?: number } | undefined {
        if (!dataset || mode === 'raw') return undefined;
        if (!dataset.semantic) return undefined;

        const meas = dataset.semantic.measures.find(m => m.name === colName);
        if (meas?.display_decimals !== undefined) {
            return { decimals: meas.display_decimals };
        }

        return undefined;
    }
}
