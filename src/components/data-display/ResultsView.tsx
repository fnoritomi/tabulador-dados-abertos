import React from 'react';
import VirtualizedTable from './VirtualizedTable';
import { Table } from 'apache-arrow';
import type { Dataset } from '../../lib/metadata';

interface ResultsViewProps {
    result: Table | null;
    resultMode: 'raw' | 'semantic';
    activeDataset: Dataset | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', color: 'red', border: '1px solid red' }}>
                    <h3>Something went wrong in ResultsView:</h3>
                    <pre>{this.state.error?.toString()}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

export const ResultsView: React.FC<ResultsViewProps> = ({ result, resultMode, activeDataset }) => {
    if (!result) return null;

    const getColumnLabel = (colName: string): string => {
        if (resultMode !== 'semantic') return colName;
        if (!activeDataset?.semantic) return colName;
        const dim = activeDataset.semantic.dimensions.find(d => d.name === colName);
        if (dim?.label) return dim.label;
        const meas = activeDataset.semantic.measures.find(m => m.name === colName);
        if (meas?.label) return meas.label;
        return colName;
    };

    const getColumnOverride = (colName: string): { decimals?: number } | undefined => {
        if (resultMode !== 'semantic') return undefined;
        if (!activeDataset?.semantic) return undefined;
        const meas = activeDataset.semantic.measures.find(m => m.name === colName);
        if (meas?.display_decimals !== undefined) return { decimals: meas.display_decimals };
        return undefined;
    };

    const getColumnType = (colName: string): string | undefined => {
        if (resultMode !== 'semantic') return undefined;
        if (!activeDataset?.semantic) return undefined;
        const dim = activeDataset.semantic.dimensions.find(d => d.name === colName);
        if (dim?.type) return dim.type;
        const meas = activeDataset.semantic.measures.find(m => m.name === colName);
        // Measures are typically numeric, but let's see if we can infer or if we should add type to measure def
        // For now, assume measures are FLOAT if not specified, or fallback to schema
        // Actually, for measures, we usually want formatting. 
        // Let's return undefined for now and let schema handle if it's numeric, 
        // OR better: if it's a measure, we WANT it formatted.
        // But the requirement is: "If numeric type in metadata -> format. If VARCHAR -> no format".
        // Measures don't usually have 'type' in metadata currently (checked json).
        // Let's look at `beneficiarios.json`: Only Dimensions have explicit "type".
        // Measures have "sql".
        // However, the rule is "if field OR dimension has numeric type".
        // If it's a measure, it's aggregated, so it's likely numeric (SUM/COUNT).
        // If we return 'FLOAT' for all measures, they will be formatted.
        if (meas) return 'FLOAT';

        return undefined;
    };

    return (
        <ErrorBoundary>
            <div>
                <p style={{ marginTop: '10px', color: '#666', fontWeight: 'bold' }}>
                    Retornou {result.numRows} linhas.
                </p>
                <VirtualizedTable
                    data={result.toArray().map((row: any) => row.toJSON())}
                    schema={result.schema}
                    resultMode={resultMode}
                    getColumnLabel={getColumnLabel}
                    getColumnOverride={getColumnOverride}
                    getColumnType={getColumnType}
                />
            </div>
        </ErrorBoundary>
    );
};
