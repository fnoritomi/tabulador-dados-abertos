import { useState, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { Table } from 'apache-arrow';

export const useQueryExecutor = (db: duckdb.AsyncDuckDB | null) => {
    const [result, setResult] = useState<Table | null>(null);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultMode, setResultMode] = useState<'raw' | 'semantic'>('raw');

    // Track active connection
    const activeConn = useRef<duckdb.AsyncDuckDBConnection | null>(null);
    const queryIdRef = useRef(0);

    const execute = async (sql: string, mode: 'raw' | 'semantic') => {
        if (!db || !sql) return;

        const currentQueryId = ++queryIdRef.current;

        setLoading(true);
        setError(null);
        setResult(null);
        setExecutionTime(null);
        setResultMode(mode);

        try {
            const start = performance.now();
            const conn = await db.connect();
            activeConn.current = conn;

            const table = await conn.query(sql);
            const end = performance.now();

            // Only update state if this is still the active query
            if (currentQueryId === queryIdRef.current) {
                setExecutionTime(end - start);
                setResult(table as any);
            }

            await conn.close();
            activeConn.current = null;
        } catch (err: any) {
            console.error(err);
            // Only update error if this is still the active query
            if (currentQueryId === queryIdRef.current) {
                setError(err.message || 'Erro ao executar consulta');
            }
        } finally {
            // Only stop loading if this is still the active query
            if (currentQueryId === queryIdRef.current) {
                setLoading(false);
            }

            if (activeConn.current) {
                try {
                    await activeConn.current.close();
                } catch (e) { /* ignore */ }
                activeConn.current = null;
            }
        }
    };

    const cancel = async () => {
        // Increment query ID to invalidate any pending results
        queryIdRef.current++;
        setCancelling(true);

        if (activeConn.current) {
            try {
                await activeConn.current.cancelSent();
            } catch (e) {
                console.warn("Failed to cancel query", e);
            }
        }

        // Reset state immediately
        setLoading(false);
        setResult(null);
        setExecutionTime(null);
        setError(null); // Clear error to avoid displaying error box
        setCancelling(false);
    };

    const reset = () => {
        // Increment query ID to invalidate any pending results
        queryIdRef.current++;

        setResult(null);
        setExecutionTime(null);
        setError(null);
        setLoading(false);
    };

    return { execute, cancel, reset, activeConn, result, executionTime, loading, cancelling, error, resultMode };
};
