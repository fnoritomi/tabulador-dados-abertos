import { useState } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { Table } from 'apache-arrow';

export const useQueryExecutor = (db: duckdb.AsyncDuckDB | null) => {
    const [result, setResult] = useState<Table | null>(null);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultMode, setResultMode] = useState<'raw' | 'semantic'>('raw');

    const execute = async (sql: string, mode: 'raw' | 'semantic') => {
        if (!db || !sql) return;
        setLoading(true);
        setError(null);
        setResult(null);
        setExecutionTime(null);
        setResultMode(mode);

        try {
            const start = performance.now();
            const conn = await db.connect();
            const table = await conn.query(sql);
            const end = performance.now();

            setExecutionTime(end - start);
            setResult(table as any);
            await conn.close();
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro ao executar consulta');
        } finally {
            setLoading(false);
        }
    };

    return { execute, result, executionTime, loading, error, resultMode };
};
