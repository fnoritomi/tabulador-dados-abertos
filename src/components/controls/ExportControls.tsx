import React, { useState } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { Dataset } from '../../lib/metadata';
import { buildSql } from '../../services/semantic/queryBuilder';
import type { QueryState } from '../../types';

interface ExportControlsProps {
    db: duckdb.AsyncDuckDB | null;
    activeDataset: Dataset | null;
    queryState: QueryState;
    filters: any[];
    measureFilters: any[];
    disabled?: boolean;
}

export const ExportControls: React.FC<ExportControlsProps> = ({
    db, activeDataset, queryState,
    filters,
    measureFilters,
    disabled = false
}) => {
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExportCsv = async () => {
        if (!db || !activeDataset) return;
        setExporting(true);
        setError(null);

        try {
            // 1. Get SQL without limit
            const exportSql = buildSql(activeDataset, queryState, filters, measureFilters, true);

            let fileHandle: any = null;
            let writable: any = null;

            // 2. Try File System Access API
            try {
                // @ts-ignore
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: `export_${activeDataset.id}_${Date.now()}.csv`,
                    types: [{
                        description: 'Comma Separated Values',
                        accept: { 'text/csv': ['.csv'] },
                    }],
                });
                writable = await fileHandle.createWritable();
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    setExporting(false);
                    return;
                }
                console.warn('File System Access API error or unsupported', err);
                setError("Seu navegador não suporta salvamento direto ou foi cancelado.");
                setExporting(false);
                return;
            }

            // 3. Streaming Execution
            const conn = await db.connect();
            const results = await conn.send(exportSql);

            // 4. Transform and Stream Write
            const { arrowBatchToCsv } = await import('../../lib/csvUtils');

            const getColumnOverride = (colName: string) => {
                if (!activeDataset?.semantic) return undefined;
                const meas = activeDataset.semantic.measures.find(m => m.name === colName);
                if (meas?.display_decimals !== undefined) return { decimals: meas.display_decimals };
                return undefined;
            };

            const getColumnLabel = (colName: string): string => {
                if (!activeDataset?.semantic) return colName;
                const dim = activeDataset.semantic.dimensions.find(d => d.name === colName);
                if (dim?.label) return dim.label;
                const meas = activeDataset.semantic.measures.find(m => m.name === colName);
                if (meas?.label) return meas.label;
                return colName;
            };

            const getColumnType = (colName: string): string | undefined => {
                if (!activeDataset?.semantic) return undefined;
                const dim = activeDataset.semantic.dimensions.find(d => d.name === colName);
                if (dim?.type) return dim.type;
                const meas = activeDataset.semantic.measures.find(m => m.name === colName);
                if (meas) return 'FLOAT'; // Force format for measures
                return undefined;
            };

            let isFirstBatch = true;
            // Handle Table vs Iterator
            const batches = (results as any).batches || results;

            for await (const batch of batches) {
                const csvChunk = arrowBatchToCsv(batch, isFirstBatch, getColumnOverride, getColumnLabel, getColumnType);
                await writable.write(csvChunk);
                isFirstBatch = false;
            }

            await writable.close();
            await conn.close();

        } catch (err: any) {
            console.error(err);
            setError('Erro ao exportar: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <>
            <button
                onClick={handleExportCsv}
                disabled={!db || !activeDataset || exporting || disabled}
                style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    cursor: (!db || !activeDataset || exporting || disabled) ? 'not-allowed' : 'pointer',
                    backgroundColor: (!db || !activeDataset || exporting || disabled) ? '#e0e0e0' : '#28a745',
                    color: (!db || !activeDataset || exporting || disabled) ? '#888' : 'white',
                    border: 'none',
                    borderRadius: '4px'
                }}
            >
                {exporting ? 'Exportando...' : 'Exportar CSV'}
            </button>
            {error && <div style={{ color: 'red', marginTop: '5px', fontSize: '0.9em' }}>{error}</div>}
        </>
    );
};
