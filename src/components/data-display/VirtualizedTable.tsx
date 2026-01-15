import React, { useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { Table, Type } from 'apache-arrow';
import { formatValue, DEFAULT_CONFIG } from '../../lib/formatting';

// Using react-virtuoso for virtualization.
// It renders standard HTML tables, is responsive, and handles sticky headers natively.
// This solves the memory issues of a huge standard table while avoiding the
// ESM/CJS import issues of react-window.

type ArrowSchema = Table['schema'];

interface VirtualizedTableProps {
    data: any[];
    schema: ArrowSchema;
    resultMode: 'raw' | 'semantic';
    getColumnLabel: (colName: string) => string;
    getColumnOverride?: (colName: string) => { decimals?: number } | undefined;
    getColumnType?: (colName: string) => string | undefined;
}

const VirtualizedTable: React.FC<VirtualizedTableProps> = ({
    data,
    schema,
    getColumnLabel,
    getColumnOverride,
    getColumnType
}) => {
    if (!data || data.length === 0) return <div style={{ padding: '20px' }}>Sem dados para exibir.</div>;

    const columns = useMemo(() => schema.fields.map(f => f.name), [schema]);

    // Pre-calculate column types map
    const columnTypes = useMemo(() => {
        const types: Record<string, 'DATE' | 'TIMESTAMP' | 'INTEGER' | 'FLOAT' | 'VARCHAR'> = {};
        schema.fields.forEach(f => {
            // Priority: Metadata > Schema
            const metaType = getColumnType ? getColumnType(f.name) : undefined;
            if (metaType) {
                // Map metadata types to formatting types
                if (metaType === 'INTEGER' || metaType === 'BIGINT') types[f.name] = 'INTEGER';
                else if (metaType === 'FLOAT' || metaType === 'DOUBLE' || metaType === 'DECIMAL' || metaType === 'REAL') types[f.name] = 'FLOAT';
                else if (metaType === 'DATE') types[f.name] = 'DATE';
                else if (metaType === 'TIMESTAMP') types[f.name] = 'TIMESTAMP';
                else types[f.name] = 'VARCHAR';
            } else {
                let type = 'VARCHAR'; // Default
                if (f.typeId === Type.Date) type = 'DATE';
                else if (f.typeId === Type.Timestamp) type = 'TIMESTAMP';
                else if (f.typeId === Type.Int) type = 'INTEGER';
                else if (f.typeId === Type.Float || f.typeId === Type.Decimal) type = 'FLOAT';
                // @ts-ignore
                types[f.name] = type;
            }
        });
        return types;
    }, [schema, getColumnType]);

    // Render fixed header
    const fixedHeaderContent = () => {
        return (
            <tr style={{ backgroundColor: 'var(--bg-panel)', borderBottom: '2px solid var(--border-color)' }}>
                {columns.map(col => (
                    <th key={col} style={{
                        padding: '10px',
                        textAlign: 'left',
                        borderRight: '1px solid var(--border-color)',
                        whiteSpace: 'nowrap',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        backgroundColor: 'var(--bg-panel)', // Ensure opaque for sticky
                        color: 'var(--text-main)'
                    }}>
                        {getColumnLabel(col)}
                    </th>
                ))}
            </tr>
        );
    };

    // Render row content
    const rowContent = (_index: number, row: any) => {
        return (
            <>
                {columns.map(col => {
                    const val = row[col];
                    // @ts-ignore
                    const colType = columnTypes[col] || 'OTHER';
                    const override = getColumnOverride ? getColumnOverride(col) : undefined;

                    const displayVal = formatValue(val, colType as any, DEFAULT_CONFIG, override);

                    return (
                        <td key={col} style={{
                            padding: '8px',
                            borderRight: '1px solid var(--border-color)',
                            borderBottom: '1px solid var(--border-color)',
                            whiteSpace: 'nowrap',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '13px',
                            textAlign: (colType === 'INTEGER' || colType === 'FLOAT') ? 'right' : 'left',
                            color: 'var(--text-main)'
                        }}>
                            {displayVal}
                        </td>
                    );
                })}
            </>
        );
    };

    return (
        <div style={{ height: '400px', width: '100%', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-app)' }}>
            <TableVirtuoso
                data={data}
                fixedHeaderContent={fixedHeaderContent}
                itemContent={rowContent}
                style={{ height: '100%' }}
            />
        </div>
    );
};

export default VirtualizedTable;
