
import { RecordBatch, Type } from 'apache-arrow';
import { formatValue, DEFAULT_CONFIG } from './formatting';

// Helper to escape CSV fields
function escapeCsvField(value: any, separator: string): string {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);
    if (stringValue.includes(separator) || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

export type ColumnOverrideFn = (colName: string) => { decimals?: number } | undefined;

// Convert an Arrow RecordBatch to a CSV chunk string
export function arrowBatchToCsv(
    batch: RecordBatch,
    includeHeader: boolean = false,
    getColumnOverride?: ColumnOverrideFn,
    getColumnLabel?: (colName: string) => string
): string {
    let output = '';
    const schema = batch.schema;
    const numRows = batch.numRows;
    const numCols = schema.fields.length;
    const separator = DEFAULT_CONFIG.csv.separator;

    // Pre-calculate column types map
    const columnTypes: Record<string, 'DATE' | 'TIMESTAMP' | 'INTEGER' | 'FLOAT' | 'VARCHAR'> = {};
    schema.fields.forEach(f => {
        let type = 'VARCHAR'; // Default
        if (f.typeId === Type.Date) type = 'DATE';
        else if (f.typeId === Type.Timestamp) type = 'TIMESTAMP';
        else if (f.typeId === Type.Int) type = 'INTEGER';
        else if (f.typeId === Type.Float || f.typeId === Type.Decimal) type = 'FLOAT';
        // @ts-ignore
        columnTypes[f.name] = type;
    });

    // Header
    if (includeHeader) {
        // Handle BOM if encoding says so
        if (DEFAULT_CONFIG.csv.encoding === 'UTF-8-BOM') {
            output += '\uFEFF';
        }

        const headerRow = schema.fields.map(f => {
            const label = getColumnLabel ? getColumnLabel(f.name) : f.name;
            return escapeCsvField(label, separator);
        });

        output += headerRow.join(separator) + '\n';
    }

    // Rows
    for (let i = 0; i < numRows; i++) {
        const row: string[] = [];
        for (let j = 0; j < numCols; j++) {
            const vec = batch.getChildAt(j);
            const val = vec?.get(i);
            const colName = schema.fields[j].name;
            const colType = columnTypes[colName] as any;

            const override = getColumnOverride ? getColumnOverride(colName) : undefined;
            const formattedVal = formatValue(val, colType, DEFAULT_CONFIG, override);

            row.push(escapeCsvField(formattedVal, separator));
        }
        output += row.join(separator) + '\n';
    }

    return output;
}
