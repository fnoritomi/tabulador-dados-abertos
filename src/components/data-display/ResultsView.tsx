import React from 'react';
import VirtualizedTable from './VirtualizedTable';
import { Table } from 'apache-arrow';
import type { Dataset } from '../../lib/metadata';
import { MetadataService } from '../../services/semantic/MetadataService';

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
        return MetadataService.getColumnLabel(activeDataset, colName, resultMode);
    };

    const getColumnOverride = (colName: string): { decimals?: number } | undefined => {
        return MetadataService.getColumnFormat(activeDataset, colName, resultMode);
    };

    const getColumnType = (colName: string): string | undefined => {
        return MetadataService.getColumnType(activeDataset, colName, resultMode);
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
