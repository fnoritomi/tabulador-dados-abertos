import { useState, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { RecordBatch } from 'apache-arrow';
import type { Table } from 'apache-arrow';
import { QueryRunner } from '../lib/query-runner';
import type { QueryIR } from '../semantic/types';

interface ExecutorOptions {
    baseUrl?: string;
}

export const useQueryExecutor = (db: duckdb.AsyncDuckDB | null, options: ExecutorOptions = {}) => {
    const [result, setResult] = useState<Table | null>(null);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultMode, setResultMode] = useState<'raw' | 'semantic'>('raw');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Track active connection
    const activeConn = useRef<duckdb.AsyncDuckDBConnection | null>(null);
    const queryIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const runner = useRef<QueryRunner | null>(null);

    // Initializer runner
    if (!runner.current) {
        runner.current = new QueryRunner({ baseUrl: options.baseUrl });
    }

    const execute = async (sql: string, mode: 'raw' | 'semantic', queryIR?: QueryIR) => {
        if (!db) return;
        const currentQueryId = ++queryIdRef.current;

        setLoading(true);
        setError(null);
        setResult(null);
        setExecutionTime(null);
        setResultMode(mode);
        setStatusMessage("Executing...");
        setCancelling(false);

        let localConn: duckdb.AsyncDuckDBConnection | null = null;
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const start = performance.now();
            console.log("[Executor] Connecting...");
            localConn = await db.connect();
            activeConn.current = localConn;

            let finalTable: Table | null = null;

            // If Semantic Mode & QueryIR present, use Smart Runner
            if (mode === 'semantic' && queryIR) {
                console.log("[Executor] Requesting Runner...", queryIR);
                const generator = await runner.current!.run(localConn, queryIR, {
                    onStatus: (msg) => {
                        if (currentQueryId === queryIdRef.current) setStatusMessage(msg);
                    },
                    signal
                });

                console.log("[Executor] Consuming generator...");
                const batches: RecordBatch[] = [];
                let batchCount = 0;
                for await (const batch of generator) {
                    if (signal.aborted) throw new Error("Cancelled");
                    // console.log("[Executor] Got batch", batchCount++); 
                    batches.push(batch);
                }
                console.log("[Executor] Got all batches:", batches.length);

                // If too many batches, log it.
                if (batches.length > 1000) console.warn("High batch count:", batches.length);

                // Check if batches is valid array
                if (!Array.isArray(batches)) console.error("Batches is NOT array!");

                if (batches.length > 0) {
                    // Virtual Table Construction
                    // To avoid "Maximum call stack size exceeded" and "TypeError: Vector constructor..." 
                    // caused by version mismatches between DuckDB-Wasm's Arrow and our local Arrow,
                    // we create a lightweight "Standard Table" object that mimics the Arrow Table interface.

                    try {
                        console.log("[Executor] Creating Virtual Table from", batches.length, "batches");

                        const firstBatch = batches[0];
                        const totalRows = batches.reduce((sum, b) => sum + b.numRows, 0);

                        // Create a proxy object that looks like an Arrow Table to the UI
                        // We cast to 'any' to bypass strict Type checks against the local Arrow library
                        finalTable = {
                            numRows: totalRows,
                            schema: firstBatch.schema,
                            // Lazy row access or eager?
                            // ResultsView calls: result.toArray().map(row => row.toJSON())
                            toArray: () => {
                                // Flatten all batches into a single array of rows
                                return batches.flatMap(b => {
                                    // Check if toArray exists (standard arrow)
                                    if (typeof b.toArray === 'function') return Array.from(b.toArray());
                                    // Fallback: iterate
                                    const rows = [];
                                    for (let i = 0; i < b.numRows; i++) {
                                        rows.push(b.get(i));
                                    }
                                    return rows;
                                });
                            },
                            // If needed
                            getChild: (name: string) => null // stub
                        } as any as Table;

                        console.log("[Executor] Virtual Table created safely.");

                    } catch (e: any) {
                        console.warn("Virtual Table creation error", e);
                        console.error(e.stack);
                        finalTable = null;
                    }
                } else {
                    console.log("[Executor] No batches, creating empty table...");
                    // Fallback to manual limit 0
                    const emptySql = `SELECT * FROM (${runner.current!['builder'].build(queryIR)}) LIMIT 0`;
                    const emptyRes = await localConn.query(emptySql);
                    finalTable = emptyRes as any;
                }

            } else {
                // Raw SQL Execution
                console.log("[Executor] Running Raw SQL...");
                const res = await localConn.query(sql);
                finalTable = res as any as Table;
            }

            const end = performance.now();

            if (currentQueryId === queryIdRef.current) {
                console.log("[Executor] Execution time:", end - start);
                setExecutionTime(end - start);
                setResult(finalTable);
                setStatusMessage(null);
            }

        } catch (err: any) {
            console.error("Executor Error:", err);
            if (err.stack) console.error(err.stack);

            if (currentQueryId === queryIdRef.current) {
                if (err.message === 'Aborted' || err.message === 'Cancelled') {
                    // ignore
                } else {
                    setError(err.message || 'Erro ao executar consulta');
                }
                setStatusMessage(null);
            }
        } finally {
            if (currentQueryId === queryIdRef.current) {
                setLoading(false);
            }
            if (localConn) {
                try {
                    await localConn.close();
                } catch (e) { /* ignore */ }
                if (activeConn.current === localConn) {
                    activeConn.current = null;
                }
            }
        }
    };

    const cancel = async () => {
        queryIdRef.current++;
        setCancelling(true);
        setStatusMessage("Cancelling...");

        // Abort signal
        abortControllerRef.current?.abort();

        if (activeConn.current) {
            try {
                await activeConn.current.cancelSent();
            } catch (e) {
                console.warn("Failed to cancel query", e);
            }
        }

        setLoading(false);
        setResult(null);
        setExecutionTime(null);
        setError(null);
        setCancelling(false);
        setStatusMessage(null);
    };

    const reset = () => {
        queryIdRef.current++;
        setResult(null);
        setExecutionTime(null);
        setError(null);
        setLoading(false);
        setStatusMessage(null);
    };

    return { execute, cancel, reset, activeConn, result, executionTime, loading, cancelling, error, resultMode, statusMessage };
};
