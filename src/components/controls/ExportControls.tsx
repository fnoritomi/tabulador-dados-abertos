import React from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { Dataset } from '../../lib/metadata';
import type { QueryState } from '../../types';
import { useCsvExport } from '../../hooks/useCsvExport';
import type { AppFormattingConfig } from '../../lib/formatting';

interface ExportControlsProps {
    db: duckdb.AsyncDuckDB | null;
    activeDataset: Dataset | null;
    queryState: QueryState;
    filters: any[];
    measureFilters: any[];
    rawSql?: string;
    disabled?: boolean;
    onExportStart?: () => void;
    onExportEnd?: (result: { success: boolean; message?: string; details?: { time: number; sizeMB: number; url?: string } }) => void;
    onExportStatus?: (msg: string) => void;
    formattingConfig: AppFormattingConfig;
}

export const ExportControls: React.FC<ExportControlsProps> = ({
    db, activeDataset, queryState,
    filters,
    measureFilters,
    rawSql,
    disabled = false,
    onExportStart,
    onExportEnd,
    onExportStatus,
    formattingConfig
}) => {

    const { exporting, cancelling, runExport, cancelExport } = useCsvExport();

    const handleExportClick = async () => {
        onExportStart?.();

        const result = await runExport({
            db,
            activeDataset,
            queryState,
            filters,
            measureFilters,
            rawSql,
            onStatus: onExportStatus,
            formattingConfig
        });

        onExportEnd?.(result);
    };

    return (
        <>
            {!exporting ? (
                <button
                    onClick={handleExportClick}
                    disabled={disabled && !exporting}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        cursor: (disabled && !exporting) ? 'not-allowed' : 'pointer',
                        backgroundColor: (disabled && !exporting) ? '#e0e0e0' : '#28a745',
                        color: (disabled && !exporting) ? '#888' : 'white',
                        border: 'none',
                        borderRadius: '4px'
                    }}
                >
                    Exportar CSV
                </button>
            ) : (
                <button
                    onClick={cancelExport}
                    disabled={cancelling}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        cursor: cancelling ? 'not-allowed' : 'pointer',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        opacity: cancelling ? 0.7 : 1
                    }}
                >
                    Cancelar exportação
                </button>
            )}
        </>
    );
};
