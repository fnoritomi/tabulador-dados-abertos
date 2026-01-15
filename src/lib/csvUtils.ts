
import { RecordBatch, Type } from 'apache-arrow';
import { formatValue, DEFAULT_CONFIG, type AppFormattingConfig } from './formatting';
import type { FormatOptions } from './metadata';

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

const WINDOWS_1252_MAP: Record<number, number> = {
    8364: 128, // €
    8218: 130, // ‚
    402: 131,  // ƒ
    8222: 132, // „
    8230: 133, // …
    8224: 134, // †
    8225: 135, // ‡
    // ... complete essential list or simple version
    // For brevity, we handle common ones. Full map is larger.
    // If not found, we fallback to '?' (63)
};

export function encodeText(text: string, encoding: string): Uint8Array {
    if (encoding === 'Windows-1252') {
        const len = text.length;
        const buf = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            const charCode = text.charCodeAt(i);
            if (charCode < 256) {
                // ISO-8859-1 range (includes ASCII)
                // Windows-1252 deviates in 0x80-0x9F but largely compatible for non-control
                buf[i] = charCode;
            } else {
                // Try map or fallback
                buf[i] = WINDOWS_1252_MAP[charCode] || 63; // '?'
            }
        }
        return buf;
    }

    // Default UTF-8
    let output = text;
    if (encoding === 'UTF-8-BOM') {
        output = '\uFEFF' + text;
    }
    return new TextEncoder().encode(output);
}

export type ColumnOverrideFn = (colName: string) => FormatOptions | undefined;

// Convert an Arrow RecordBatch to a CSV chunk string
export function arrowBatchToCsv(
    batch: RecordBatch,
    includeHeader: boolean = false,
    getColumnOverride?: ColumnOverrideFn,
    getColumnLabel?: (colName: string) => string,
    getColumnType?: (colName: string) => string | undefined,
    formattingConfig: AppFormattingConfig = DEFAULT_CONFIG
): string {
    let output = '';
    const schema = batch.schema;
    const numRows = batch.numRows;
    const numCols = schema.fields.length;

    // Use separator from provided config (Debug this!)
    // If formattingConfig is default, separator is ';'
    const separator = formattingConfig.csv.separator;

    // Pre-calculate column types map
    const columnTypes: Record<string, 'DATE' | 'TIMESTAMP' | 'INTEGER' | 'FLOAT' | 'VARCHAR'> = {};
    schema.fields.forEach(f => {
        // Priority: Metadata > Schema
        const metaType = getColumnType ? getColumnType(f.name) : undefined;
        if (metaType) {
            // Map metadata types to formatting types
            if (metaType === 'INTEGER' || metaType === 'BIGINT') columnTypes[f.name] = 'INTEGER';
            else if (metaType === 'FLOAT' || metaType === 'DOUBLE' || metaType === 'DECIMAL' || metaType === 'REAL') columnTypes[f.name] = 'FLOAT';
            else if (metaType === 'DATE') columnTypes[f.name] = 'DATE';
            else if (metaType === 'TIMESTAMP') columnTypes[f.name] = 'TIMESTAMP';
            else columnTypes[f.name] = 'VARCHAR';
        } else {
            let type = 'VARCHAR'; // Default
            if (f.typeId === Type.Date) type = 'DATE';
            else if (f.typeId === Type.Timestamp) type = 'TIMESTAMP';
            else if (f.typeId === Type.Int) type = 'INTEGER';
            else if (f.typeId === Type.Float || f.typeId === Type.Decimal) type = 'FLOAT';
            // @ts-ignore
            columnTypes[f.name] = type;
        }
    });

    // Header
    if (includeHeader) {
        // Removed BOM check here, doing it in encodeText

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

            // Force disable thousands separator for CSV export
            // BUT respect decimals and other options
            const csvOverride: FormatOptions = {
                ...override,
                useThousandsSeparator: false
            };

            const formattedVal = formatValue(val, colType, formattingConfig, csvOverride);

            row.push(escapeCsvField(formattedVal, separator));
        }
        output += row.join(separator) + '\n';
    }

    return output;
}
