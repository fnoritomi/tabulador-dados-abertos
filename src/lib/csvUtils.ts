
import { RecordBatch, Type } from 'apache-arrow';

// Helper to escape CSV fields
function escapeCsvField(value: any): string {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

// Convert an Arrow RecordBatch to a CSV chunk string
export function arrowBatchToCsv(batch: RecordBatch, includeHeader: boolean = false): string {
    let output = '';
    const schema = batch.schema;
    const numRows = batch.numRows;
    const numCols = schema.fields.length;

    // Header
    if (includeHeader) {
        output += schema.fields.map(f => escapeCsvField(f.name)).join(',') + '\n';
    }

    // Rows
    for (let i = 0; i < numRows; i++) {
        const row: string[] = [];
        for (let j = 0; j < numCols; j++) {
            const vec = batch.getChildAt(j);
            let val = vec?.get(i);

            // Handle Dates - Format to ISO 8601
            // Arrow dates can be numbers (epoch) or Date objects depending on the specific type
            if (val instanceof Date) {
                val = val.toISOString();
            } else if (schema.fields[j].typeId === Type.Date || schema.fields[j].typeId === Type.Timestamp) {
                // If it comes as number but is a date type
                if (typeof val === 'number') {
                    val = new Date(val).toISOString();
                }
            }

            row.push(escapeCsvField(val));
        }
        output += row.join(',') + '\n';
    }

    return output;
}
