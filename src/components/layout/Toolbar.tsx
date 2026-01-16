import React from 'react';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useCsvExport } from '../../hooks/useCsvExport';

interface ToolbarProps {
    db: AsyncDuckDB | null;
    queryLoading: boolean;
    isExporting: boolean;
    queryState: any; // Type accurately if possible
    filters: any[];
    measureFilters: any[];
    onRunQuery: () => void;
    onCancelQuery: () => void;
    onExportStart: () => void;
    onExportEnd: (result: { success: boolean; message?: string; details?: any }) => void;
    activeDataset: any; // Type accurately
    formattingConfig: any;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    db,
    queryLoading,
    isExporting,
    queryState,
    filters,
    measureFilters,
    onRunQuery,
    onCancelQuery,
    onExportStart,
    onExportEnd,
    activeDataset,
    formattingConfig
}) => {
    const { runExport, cancelExport } = useCsvExport();

    const handleExportClick = async () => {
        if (queryLoading || isExporting) return;

        onExportStart();

        // Prepare query object for export
        const exportOptions = {
            db,
            activeDataset,
            queryState: {
                ...queryState,
                filters,
                measureFilters,
                limit: 0
            },
            filters,
            measureFilters,
            formattingConfig
        };

        const result = await runExport(exportOptions);

        onExportEnd(result);
    };

    return (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Run / Cancel Buttons */}
            {queryLoading ? (
                <button onClick={onCancelQuery} style={{ color: 'white', background: 'var(--color-error)' }}>
                    Cancelar
                </button>
            ) : (
                <button
                    onClick={onRunQuery}
                    disabled={isExporting}
                    style={{
                        background: 'var(--primary-color)',
                        color: 'white',
                        opacity: isExporting ? 0.5 : 1,
                        cursor: isExporting ? 'not-allowed' : 'pointer'
                    }}
                >
                    Executar Consulta
                </button>
            )}

            {/* Export / Cancel Export Button */}
            {isExporting ? (
                <button
                    onClick={cancelExport}
                    style={{ background: 'var(--color-error)', color: 'white' }}
                >
                    Cancelar Exportação
                </button>
            ) : (
                <button
                    onClick={handleExportClick}
                    disabled={queryLoading || !activeDataset}
                    style={{
                        background: 'var(--color-success)',
                        color: 'white',
                        opacity: (queryLoading || !activeDataset) ? 0.6 : 1
                    }}
                >
                    Exportar CSV
                </button>
            )}
        </div>
    );
};
