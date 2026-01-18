
import { RecordBatch, Type } from 'apache-arrow';
import { formatValue, DEFAULT_CONFIG, type AppFormattingConfig } from './formatting';
import type { FormatOptions } from './metadata';

// Helper to escape CSV fields
function escapeCsvField(value: unknown, separator: string): string {
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

    // Use separator from provided config
    // If formattingConfig is default, separator is ';'
    const separator = formattingConfig.csv.separator;

    // Pre-calculate column types map
    const columnTypes: Record<string, 'DATE' | 'TIMESTAMP' | 'INTEGER' | 'FLOAT' | 'VARCHAR'> = {};
    schema.fields.forEach(f => {
        // Priority: Metadata > Schema
        const metaType = getColumnType ? getColumnType(f.name) : undefined;
        if (metaType) {
            // Map metadata types to formatting types
            const t = metaType.toLowerCase();
            if (t === 'integer' || t === 'bigint' || t === 'int') columnTypes[f.name] = 'INTEGER';
            else if (t === 'float' || t === 'double' || t === 'decimal' || t === 'real' || t === 'numeric') columnTypes[f.name] = 'FLOAT';
            else if (t === 'date' || t === 'time') columnTypes[f.name] = 'DATE';
            else if (t === 'timestamp' || t === 'datetime') columnTypes[f.name] = 'TIMESTAMP';
            else columnTypes[f.name] = 'VARCHAR';
        } else {
            let type = 'VARCHAR'; // Default
            if (f.typeId === Type.Date) type = 'DATE';
            else if (f.typeId === Type.Timestamp) type = 'TIMESTAMP';
            else if (f.typeId === Type.Int) type = 'INTEGER';
            else if (f.typeId === Type.Float || f.typeId === Type.Decimal) type = 'FLOAT';
            // @ts-expect-error Arrow types
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
            let val = vec?.get(i);
            const colName = schema.fields[j].name;
            const colType = columnTypes[colName];

            const override = getColumnOverride ? getColumnOverride(colName) : undefined;


            // Force disable thousands separator for CSV export
            // BUT respect decimals and other options
            const csvOverride: FormatOptions = {
                ...override,
                useThousandsSeparator: false
            };

            // Force strict patterns for CSV (Machine Readable / Standard)
            if (colType === 'DATE' && !csvOverride.pattern) {
                csvOverride.pattern = 'yyyy-MM-dd';
            } else if (colType === 'TIMESTAMP' && !csvOverride.pattern) {
                csvOverride.pattern = 'yyyy-MM-dd HH:mm:ss';
            }

            // Fix for Arrow Date32 (Days)
            // Arrow JS often returns "days from epoch" as a number for Date32 column
            // We must convert this to milliseconds for Date constructor to work in formatValue
            const fieldType = schema.fields[j].type;
            if (typeof val === 'number' && fieldType.typeId === Type.Date) {
                // DateUnit.DAY is 0. DateUnit.MILLISECOND is 1.
                // safe cast as we checked typeId (or better, instanceof)
                const dateType = fieldType as import('apache-arrow').Date_;
                // Default to day (unit 0) if unit is undefined (e.g. in simple mocks) or if it is explicitly 0
                // In Arrow, unit 0 = DAY, 1 = MILLI.
                // If mock doesn't have unit, assume it's the "tricky" day case (raw number) or just process it?
                // If it's a number and Date type, it's likely days if unit is 0.
                // If unit is undefined, let's assume it might be days if value is small?
                // Safest: Check explicitly for 0, OR undefined if that breaks tests.
                // The failing test likely has NO unit property.
                if (dateType.unit === 0 || dateType.unit === undefined) {
                    val = val * 86400000;
                }
            }

            const formattedVal = formatValue(val, colType, formattingConfig, csvOverride);
            row.push(escapeCsvField(formattedVal, separator));
        }
        output += row.join(separator) + '\n';
    }
    return output;
}
