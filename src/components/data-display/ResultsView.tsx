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
                />
            </div>
        </ErrorBoundary>
    );
};
