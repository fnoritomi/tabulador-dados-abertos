import React from 'react';
import { ExportControls } from './ExportControls';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { Dataset } from '../../lib/metadata';
import type { QueryState, Filter } from '../../types';

interface ExecutionBarProps {
    db: duckdb.AsyncDuckDB | null;
    activeDataset: Dataset | null;
    queryLoading: boolean;
    queryCancelling: boolean;
    warmingUp: boolean;
    isExporting: boolean;
    queryState: QueryState;
    filters: Filter[];
    measureFilters: Filter[];
    onRunQuery: () => void;
    onCancelQuery: () => void;
    onExportStart: () => void;
    onExportEnd: (result: { success: boolean; message?: string; details?: { time: number; sizeMB: number } }) => void;
    onExportStatus: (msg: string) => void;
}

export const ExecutionBar: React.FC<ExecutionBarProps> = ({
    db,
    activeDataset,
    queryLoading,
    queryCancelling,
    warmingUp,
    isExporting,
    queryState,
    filters,
    measureFilters,
    onRunQuery,
    onCancelQuery,
    onExportStart,
    onExportEnd,
    onExportStatus
}) => {
    return (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            {queryLoading && !warmingUp && (
                <button
                    onClick={onCancelQuery}
                    disabled={queryCancelling}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        cursor: queryCancelling ? 'not-allowed' : 'pointer',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        opacity: queryCancelling ? 0.7 : 1
                    }}
                >
                    Cancelar
                </button>
            )}

            {!queryLoading && (
                <button
                    onClick={onRunQuery}
                    disabled={!db || warmingUp || isExporting}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        cursor: (!db || warmingUp || isExporting) ? 'not-allowed' : 'pointer',
                        backgroundColor: (!db || warmingUp || isExporting) ? '#e0e0e0' : '#007bff',
                        color: (!db || warmingUp || isExporting) ? '#888' : 'white',
                        border: 'none',
                        borderRadius: '4px'
                    }}
                >
                    {warmingUp ? 'Carregando estatísticas...' : 'Executar consulta'}
                </button>
            )}

            <ExportControls
                db={db}
                activeDataset={activeDataset}
                queryState={queryState}
                filters={filters}
                measureFilters={measureFilters}
                disabled={warmingUp || queryLoading || isExporting}
                onExportStart={onExportStart}
                onExportEnd={onExportEnd}
                onExportStatus={onExportStatus}
            />
        </div>
    );
};
