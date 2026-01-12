import { useState, useEffect } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { duckDBService } from '../services/duckdb/connection';

export const useDuckDB = () => {
    const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
    const [version, setVersion] = useState<string>('');
    const [status, setStatus] = useState<string>('Initializing...');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const database = await duckDBService.getInstance();
                setDb(database);
                const ver = await database.getVersion();
                setVersion(ver);
                setStatus('DuckDB carregado com sucesso');
            } catch (e: any) {
                console.error(e);
                setError(e.message || 'Falha ao inicializar DuckDB');
                setStatus('Erro ao carregar DuckDB');
            }
        };
        init();
    }, []);

    return { db, version, status, error };
};
