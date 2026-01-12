import React from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { Table } from 'apache-arrow';

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
}

const VirtualizedTable: React.FC<VirtualizedTableProps> = ({ data, schema, getColumnLabel }) => {
    if (!data || data.length === 0) return <div style={{ padding: '20px' }}>Sem dados para exibir.</div>;

    const columns = schema.fields.map(f => f.name);

    // Render fixed header
    const fixedHeaderContent = () => {
        return (
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                {columns.map(col => (
                    <th key={col} style={{
                        padding: '10px',
                        textAlign: 'left',
                        borderRight: '1px solid #eee',
                        whiteSpace: 'nowrap',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        backgroundColor: '#f9f9f9' // Ensure opaque for sticky
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
                    let displayVal = val;

                    if (typeof val === 'object' && val !== null) {
                        if (val instanceof Date) displayVal = val.toLocaleString();
                        else displayVal = JSON.stringify(val);
                    } else if (val === null || val === undefined) {
                        displayVal = <span style={{ color: '#ccc' }}>null</span>;
                    }

                    return (
                        <td key={col} style={{
                            padding: '8px',
                            borderRight: '1px solid #eee',
                            borderBottom: '1px solid #eee',
                            whiteSpace: 'nowrap',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '13px'
                        }}>
                            {displayVal}
                        </td>
                    );
                })}
            </>
        );
    };

    return (
        <div style={{ height: '400px', width: '100%', border: '1px solid #ddd', borderRadius: '4px' }}>
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
