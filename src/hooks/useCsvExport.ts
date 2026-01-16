import { useState, useRef, useCallback } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { FileSystemService } from '../services/io/FileSystemService';
import { MetadataService } from '../services/semantic/MetadataService';
import type { Dataset } from '../lib/metadata';
import type { QueryState } from '../types';
import type { QueryIR } from '../semantic/types';
import type { AppFormattingConfig } from '../lib/formatting';
import { QueryRunner } from '../lib/query-runner';


interface ExportOptions {
    db: duckdb.AsyncDuckDB | null;
    activeDataset: Dataset | null;
    queryState: QueryState;
    filters: any[];
    measureFilters: any[];
    rawSql?: string;
    onStatus?: (msg: string) => void;
    formattingConfig: AppFormattingConfig;
}

interface ExportResult {
    success: boolean;
    message?: string;
    details?: { time: number; sizeMB: number };
}

export function useCsvExport() {
    const [exporting, setExporting] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const fileSystemService = useRef(new FileSystemService()); // Default 100MB limit
    const runner = useRef<QueryRunner | null>(null);

    // Initializer runner (lazy)
    if (!runner.current) {
        const baseUrl = import.meta.env.BASE_URL;
        const fullBaseUrl = typeof window !== 'undefined' ? window.location.origin + (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`) : baseUrl;
        runner.current = new QueryRunner({ baseUrl: fullBaseUrl });
    }

    const cancelExport = useCallback(() => {
        if (exporting && !cancelling) {
            setCancelling(true);
            abortControllerRef.current?.abort();
        }
    }, [exporting, cancelling]);

    const runExport = useCallback(async (options: ExportOptions): Promise<ExportResult> => {
        const { db, activeDataset, queryState, filters, measureFilters, rawSql, onStatus, formattingConfig } = options;

        if (!db || !activeDataset) {
            return { success: false, message: "Banco de dados ou dataset indisponível." };
        }

        setExporting(true);
        setCancelling(false);
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        let conn: duckdb.AsyncDuckDBConnection | null = null;
        let writer: any = null;
        const startTime = performance.now();
        let totalSize = 0;

        try {
            // 0. Initialize Writer (IO) - MUST be first to capture User Gesture
            const fileName = `export_${activeDataset.id}_${Date.now()}.csv`;
            // This might trigger showSaveFilePicker which requires a user gesture.
            writer = await fileSystemService.current.createWriter(fileName, onStatus);

            if (signal.aborted) throw new Error("Cancelado pelo usuário.");

            conn = await db.connect();

            // Prepare Query
            let generator: AsyncGenerator<any, void, unknown>;

            if (rawSql) {
                // Raw SQL mode: manual stream
                if (signal.aborted) throw new Error("Cancelado pelo usuário.");
                const reader = await conn.send(rawSql);
                async function* rawGen() {
                    for await (const batch of reader) {
                        yield batch;
                    }
                }
                generator = rawGen();
            } else {
                // Semantic Mode with potential partitioning
                const mode = queryState.mode || (activeDataset.semantic ? 'semantic' : 'dataset');
                const queryIR: QueryIR = {
                    mode: mode === 'dataset' ? 'dataset' : 'semantic',
                    semanticModel: activeDataset.id,
                    columns: queryState.selectedColumns,
                    dimensions: queryState.selectedDimensions,
                    measures: queryState.selectedMeasures,
                    filters: filters.map(f => ({ field: f.column, operator: f.operator as any, value: f.value })),
                    measureFilters: measureFilters.map(f => ({ field: f.column, operator: f.operator as any, value: f.value })),
                    limit: undefined // No limit for export
                };

                // But we already have the writer, so we are good on the UI side.
                generator = await runner.current!.run(conn, queryIR, {
                    onStatus,
                    signal
                });
            }

            // 3. Transform and Write
            const { arrowBatchToCsv, encodeText } = await import('../lib/csvUtils');

            const formatMode = (queryState.mode || 'dataset') === 'dataset' ? 'raw' : 'semantic';
            const getColumnOverride = (colName: string) => MetadataService.getColumnFormat(activeDataset, colName, formatMode);
            const getColumnLabel = (colName: string) => MetadataService.getColumnLabel(activeDataset, colName, formatMode);
            const getColumnType = (colName: string) => MetadataService.getColumnType(activeDataset, colName, formatMode);

            let isFirstBatch = true;
            onStatus?.("Gerando arquivo CSV...");

            const BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
            let bufferChunks: Uint8Array[] = [];
            let bufferSize = 0;

            for await (const batch of generator) {
                if (signal.aborted) throw new Error("Cancelado");

                // @ts-ignore
                const csvChunk = arrowBatchToCsv(batch as any, isFirstBatch, getColumnOverride, getColumnLabel, getColumnType, formattingConfig);

                const bytes = encodeText(csvChunk, formattingConfig.csv.encoding);

                bufferChunks.push(bytes);
                bufferSize += bytes.byteLength;

                if (bufferSize >= BUFFER_SIZE) {
                    const merged = new Uint8Array(bufferSize);
                    let offset = 0;
                    for (const chunk of bufferChunks) {
                        merged.set(chunk, offset);
                        offset += chunk.byteLength;
                    }

                    await writer.write(merged);
                    bufferChunks = [];
                    bufferSize = 0;
                }

                totalSize += bytes.byteLength;
                isFirstBatch = false; // Only first batch of first bucket should have header.

                // Note: QueryRunner yields batches. 
                // However, `arrowBatchToCsv` internal logic prints header if `isFirstBatch` is true.
                // This seems correct: we only want header once.

                if (bufferSize === 0) {
                    onStatus?.(`Exportando... ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            // Flush remaining
            if (bufferSize > 0) {
                const merged = new Uint8Array(bufferSize);
                let offset = 0;
                for (const chunk of bufferChunks) {
                    merged.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                await writer.write(merged);
            }

            await writer.close();

            const endTime = performance.now();
            const duration = (endTime - startTime) / 1000;
            const sizeMB = totalSize / 1024 / 1024;

            return {
                success: true,
                details: { time: duration, sizeMB }
            };

        } catch (err: any) {
            const msg = err.message || "";
            if (writer) {
                try { await writer.abort(); } catch { }
            }
            if (msg.includes("Cancelado") || msg.includes("Aborted")) {
                return { success: false, message: "Exportação cancelada pelo usuário." };
            }
            return { success: false, message: `Erro: ${msg}` };

        } finally {
            if (conn) {
                try { await conn.close(); } catch (e) { console.warn("Error closing connection", e); }
            }
            setExporting(false);
            setCancelling(false);
            abortControllerRef.current = null;
        }

    }, []);

    return {
        exporting,
        cancelling,
        runExport,
        cancelExport
    };
}
