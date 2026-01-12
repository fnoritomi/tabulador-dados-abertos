import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_eh,
        mainWorker: eh_worker,
    },
};

class DuckDBService {
    private db: duckdb.AsyncDuckDB | null = null;
    private initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

    async getInstance(): Promise<duckdb.AsyncDuckDB> {
        if (this.db) return this.db;

        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }

        return this.initPromise;
    }

    private async initialize(): Promise<duckdb.AsyncDuckDB> {
        try {
            const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
            const worker = new Worker(bundle.mainWorker!);
            const logger = new duckdb.ConsoleLogger();
            const db = new duckdb.AsyncDuckDB(logger, worker);
            await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
            this.db = db;
            return db;
        } catch (error) {
            this.initPromise = null;
            throw error;
        }
    }
}

export const duckDBService = new DuckDBService();
