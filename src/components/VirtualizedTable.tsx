
import React, { useState, useRef, useEffect } from 'react';

interface VirtualizedTableProps {
    data: any[];
    schema: any;
    resultMode: 'raw' | 'semantic';
    getColumnLabel: (colName: string) => string;
}

const ROW_HEIGHT = 35;

const AutoSizer = ({ children }: { children: (size: { height: number; width: number }) => React.ReactNode }) => {
    const [size, setSize] = useState({ height: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use contentRect for precise inner dimensions
                setSize({ height: entry.contentRect.height, width: entry.contentRect.width });
            }
        });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
            {size.height > 0 && size.width > 0 && children(size)}
        </div>
    );
};

const VirtualizedTable: React.FC<VirtualizedTableProps> = ({ data, schema, getColumnLabel }) => {
    const [scrollTop, setScrollTop] = useState(0);

    if (!data || data.length === 0) return <div style={{ padding: '10px' }}>Sem dados para exibir.</div>;

    const fields = schema.fields;
    const estimateColumnWidth = (field: any) => {
        const label = getColumnLabel(field.name);
        return Math.max(100, label.length * 10, 150);
    };

    const columnWidths = fields.map(estimateColumnWidth);
    const totalRowWidth = columnWidths.reduce((a: number, b: number) => a + b, 0);

    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const Header = () => (
        <div style={{ display: 'flex', background: '#f5f5f5', borderBottom: '2px solid #ddd', fontWeight: 'bold' }}>
            {fields.map((field: any, i: number) => (
                <div
                    key={field.name}
                    style={{
                        width: columnWidths[i],
                        flexShrink: 0,
                        padding: '8px',
                        boxSizing: 'border-box',
                        borderRight: '1px solid #ccc'
                    }}
                >
                    {getColumnLabel(field.name)}
                </div>
            ))}
        </div>
    );

    return (
        <div style={{ height: '500px', width: '100%', border: '1px solid #ccc', display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflowX: 'auto', flex: 1 }}>
                <div style={{ width: totalRowWidth, minWidth: '100%' }}>
                    <Header />
                    <div style={{ height: '450px' }}>
                        <AutoSizer>
                            {({ height, width }) => {
                                const totalHeight = data.length * ROW_HEIGHT;
                                // Simple virtualization logic
                                const visibleRowCount = Math.ceil(height / ROW_HEIGHT);
                                const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
                                const endIndex = Math.min(data.length - 1, startIndex + visibleRowCount + 4);

                                const items = [];
                                for (let i = startIndex; i <= endIndex; i++) {
                                    const row = data[i];
                                    items.push(
                                        <div
                                            key={i}
                                            style={{
                                                position: 'absolute',
                                                top: i * ROW_HEIGHT,
                                                left: 0,
                                                height: ROW_HEIGHT,
                                                width: '100%',
                                                display: 'flex',
                                                borderBottom: '1px solid #eee',
                                                background: '#fff'
                                            }}
                                        >
                                            {fields.map((field: any, j: number) => (
                                                <div
                                                    key={field.name}
                                                    style={{
                                                        width: columnWidths[j],
                                                        flexShrink: 0,
                                                        padding: '8px',
                                                        boxSizing: 'border-box',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        borderRight: '1px solid #eee'
                                                    }}
                                                    title={String(row[field.name])}
                                                >
                                                    {String(row[field.name])}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        style={{ height, width, overflow: 'auto', position: 'relative' }}
                                        onScroll={onScroll}
                                    >
                                        <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
                                            {items}
                                        </div>
                                    </div>
                                );
                            }}
                        </AutoSizer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VirtualizedTable;
