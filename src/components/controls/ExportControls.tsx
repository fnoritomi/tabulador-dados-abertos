import React, { useState, useRef } from 'react';
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
    onExportStart?: () => void;
    // Modified signature to allow reporting success/failure messages directly
    onExportEnd?: (result: { success: boolean; message?: string; details?: { time: number; sizeMB: number; url?: string } }) => void;
    onExportStatus?: (msg: string) => void;
}

export const ExportControls: React.FC<ExportControlsProps> = ({
    db, activeDataset, queryState,
    filters,
    measureFilters,
    disabled = false,
    onExportStart,
    onExportEnd,
    onExportStatus
}) => {
    const [exporting, setExporting] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    // Ref for AbortController to cancel processing
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleExportCsv = async () => {
        if (!db || !activeDataset) return;

        // Start process
        setExporting(true);
        setCancelling(false);
        onExportStart?.();

        const startTime = performance.now();
        let totalSize = 0;

        // Setup AbortController
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            // 1. Get SQL without limit
            const exportSql = buildSql(activeDataset, queryState, filters, measureFilters, true);

            let fileHandle: any = null;
            let writable: any = null;
            let useFallback = false;

            // 2. Try File System Access API
            try {
                // @ts-ignore
                if (typeof window.showSaveFilePicker === 'function') {
                    fileHandle = await window.showSaveFilePicker({
                        suggestedName: `export_${activeDataset.id}_${Date.now()}.csv`,
                        types: [{
                            description: 'Comma Separated Values',
                            accept: { 'text/csv': ['.csv'] },
                        }],
                    });
                    writable = await fileHandle.createWritable();
                } else {
                    useFallback = true;
                }
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    // User cancelled the picker dialog
                    setExporting(false);
                    onExportEnd?.({ success: false, message: "Exportação cancelada pelo usuário." });
                    return;
                }
                console.warn('File System Access API error or unsupported, using fallback', err);
                useFallback = true;
            }

            if (signal.aborted) throw new Error("Cancelado pelo usuário.");

            // 3. Streaming Execution
            onExportStatus?.("Executando consulta no banco de dados...");
            const conn = await db.connect();
            const results = await conn.send(exportSql);

            if (signal.aborted) {
                await conn.close();
                throw new Error("Cancelado pelo usuário.");
            }

            // 4. Transform and Stream Write / Fallback Buffer
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

            onExportStatus?.("Gerando arquivo CSV...");

            if (!useFallback && writable) {
                // Standard Direct Save
                try {
                    for await (const batch of batches) {
                        if (signal.aborted) throw new Error("Cancelado");
                        const csvChunk = arrowBatchToCsv(batch, isFirstBatch, getColumnOverride, getColumnLabel, getColumnType);
                        await writable.write(csvChunk);
                        totalSize += csvChunk.length;
                        isFirstBatch = false;
                        onExportStatus?.(`Exportando... ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
                    }
                    await writable.close();
                } catch (e: any) {
                    if (e.message === "Cancelado") {
                        // Try to abort writable if possible or just ignore
                        try { await writable.abort(); } catch (werr) { }
                        throw new Error("Exportação cancelada pelo usuário");
                    }
                    throw e;
                }
            } else {
                // Fallback: Partitioned Memory Download
                const FALLBACK_SIZE_LIMIT_BYTES = 50 * 1024 * 1024; // 50MB
                let buffer: string[] = [];
                let currentBufferSize = 0;
                let partIndex = 1;
                const baseFileName = `export_${activeDataset.id}_${Date.now()}`;

                const downloadPart = async (data: string[], partNum: number, isFinal: boolean) => {
                    const blob = new Blob(data, { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;

                    // If it's a single file (part 1 and final), normal name. Else suffixed.
                    const fileName = (partNum === 1 && isFinal)
                        ? `${baseFileName}.csv`
                        : `${baseFileName}_part${partNum}.csv`;

                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    // Allow UI/Download to process
                    await new Promise(resolve => setTimeout(resolve, 500));
                    URL.revokeObjectURL(url);
                };

                for await (const batch of batches) {
                    if (signal.aborted) throw new Error("Exportação cancelada pelo usuário");

                    const csvChunk = arrowBatchToCsv(batch, isFirstBatch, getColumnOverride, getColumnLabel, getColumnType);
                    buffer.push(csvChunk);
                    currentBufferSize += csvChunk.length;
                    totalSize += csvChunk.length;

                    onExportStatus?.(`Exportando... ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

                    if (currentBufferSize >= FALLBACK_SIZE_LIMIT_BYTES) {
                        onExportStatus?.(`Baixando parte ${partIndex}...`);
                        // Download current part
                        await downloadPart(buffer, partIndex, false);

                        // Clear memory immediately
                        buffer = [];
                        currentBufferSize = 0;
                        partIndex++;
                        isFirstBatch = true;
                    } else {
                        isFirstBatch = false;
                    }
                }

                // Download remaining part
                if (buffer.length > 0) {
                    if (signal.aborted) throw new Error("Exportação cancelada pelo usuário");
                    onExportStatus?.(`Baixando parte final...`);
                    await downloadPart(buffer, partIndex, true);
                }
            }

            await conn.close();

            const endTime = performance.now();
            const duration = (endTime - startTime) / 1000;
            const sizeMB = totalSize / 1024 / 1024;

            onExportEnd?.({
                success: true,
                details: { time: duration, sizeMB: sizeMB }
            });

        } catch (err: any) {
            console.error(err);
            const msg = err.message || "";
            // Normalize error messages
            if (msg.includes("Cancelado") || msg.includes("The user aborted a request") || msg.includes("AbortError")) {
                onExportEnd?.({ success: false, message: "Exportação cancelada pelo usuário." }); // Normalized cancel message
            } else {
                onExportEnd?.({ success: false, message: 'Erro: ' + msg });
            }
        } finally {
            setExporting(false);
            setCancelling(false);
            abortControllerRef.current = null;
        }
    };

    const handleCancel = () => {
        setCancelling(true);
        onExportStatus?.("Cancelando exportação...");
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    return (
        <>
            {!exporting ? (
                <button
                    onClick={handleExportCsv}
                    // Only disable if explicitly disabled passed from parent (e.g. during query exec)
                    // AND not currently exporting (which is handled by swapping button)
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
                    onClick={handleCancel}
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
            {/* NO ERROR RENDERED HERE - DELEGATED TO PARENT */}
        </>
    );
};
