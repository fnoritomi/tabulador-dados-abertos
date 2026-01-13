import { useState, useRef, useCallback } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { FileSystemService } from '../services/io/FileSystemService';
import { buildSql } from '../services/semantic/queryBuilder';
import { MetadataService } from '../services/semantic/MetadataService';
import type { Dataset } from '../lib/metadata';
import type { QueryState } from '../types';

interface ExportOptions {
    db: duckdb.AsyncDuckDB | null;
    activeDataset: Dataset | null;
    queryState: QueryState;
    filters: any[];
    measureFilters: any[];
    onStatus?: (msg: string) => void;
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

    const cancelExport = useCallback(() => {
        if (exporting && !cancelling) {
            setCancelling(true);
            abortControllerRef.current?.abort();
        }
    }, [exporting, cancelling]);

    const runExport = useCallback(async (options: ExportOptions): Promise<ExportResult> => {
        const { db, activeDataset, queryState, filters, measureFilters, onStatus } = options;

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
            // 1. Prepare SQL
            const exportSql = buildSql(activeDataset, queryState, filters, measureFilters, true);

            // 2. Initialize Writer (IO)
            const fileName = `export_${activeDataset.id}_${Date.now()}.csv`;
            writer = await fileSystemService.current.createWriter(fileName, onStatus);

            if (signal.aborted) throw new Error("Cancelado pelo usuário.");

            // 3. Connect & Stream from DB
            onStatus?.("Executando consulta no banco de dados...");
            conn = await db.connect();

            if (signal.aborted) throw new Error("Cancelado pelo usuário.");

            // allowStreamResult: true is critical!
            const reader = await conn.send(exportSql, true);

            // 4. Transform and Write
            const { arrowBatchToCsv } = await import('../lib/csvUtils'); // Dynamic import
            const encoder = new TextEncoder();

            // Prepare formatters with MetadataService
            const getColumnOverride = (colName: string) => MetadataService.getColumnFormat(activeDataset, colName, 'semantic');
            const getColumnLabel = (colName: string) => MetadataService.getColumnLabel(activeDataset, colName, 'semantic');
            const getColumnType = (colName: string) => MetadataService.getColumnType(activeDataset, colName, 'semantic');

            let isFirstBatch = true;
            onStatus?.("Gerando arquivo CSV...");

            for await (const batch of reader) {
                if (signal.aborted) throw new Error("Cancelado");

                // @ts-ignore
                const csvChunk = arrowBatchToCsv(batch as any, isFirstBatch, getColumnOverride, getColumnLabel, getColumnType);
                const bytes = encoder.encode(csvChunk);

                await writer.write(bytes);

                totalSize += bytes.byteLength;
                isFirstBatch = false;

                onStatus?.(`Exportando... ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

                // Yield to GC
                await new Promise(r => setTimeout(r, 0));
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
            // Clean up writer on error
            if (writer) {
                try { await writer.abort(); } catch { }
            }

            if (msg.includes("Cancelado") || msg.includes("The user aborted a request") || msg.includes("AbortError")) {
                return { success: false, message: "Exportação cancelada pelo usuário." };
            }
            return { success: false, message: `Erro: ${msg}` };

        } finally {
            // Clean up DB Connection
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
