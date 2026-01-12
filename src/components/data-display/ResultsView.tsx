import React from 'react';
import VirtualizedTable from '../VirtualizedTable';
import { Table } from 'apache-arrow';
import type { Dataset } from '../../lib/metadata';

interface ResultsViewProps {
    result: Table | null;
    resultMode: 'raw' | 'semantic';
    activeDataset: Dataset | null;
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
    );
};
