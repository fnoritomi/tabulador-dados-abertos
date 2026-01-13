import { useState, useEffect, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { Dataset } from '../lib/metadata';

export function useDuckDBWarmup(db: duckdb.AsyncDuckDB | null, activeDataset: Dataset | null) {
    const [warmingUp, setWarmingUp] = useState(false);
    const [warmingUpTime, setWarmingUpTime] = useState<number | null>(null);
    const warmupConnRef = useRef<duckdb.AsyncDuckDBConnection | null>(null);

    // Reset warmup stats when dataset changes
    useEffect(() => {
        setWarmingUpTime(null);
    }, [activeDataset]);

    useEffect(() => {
        const performWarmup = async () => {
            if (!db || !activeDataset || !activeDataset.sources || activeDataset.sources.length === 0) return;

            setWarmingUp(true);
            const start = performance.now();

            try {
                const conn = await db.connect();
                warmupConnRef.current = conn;

                // Execute count on metadata for each source file to warn up DuckDB cache
                for (const source of activeDataset.sources) {
                    // Check if cancelled (e.g. by cleanup)
                    if (!warmupConnRef.current) break;

                    try {
                        // We use count(*) on parquet_metadata to force reading file footer/metadata without reading all data
                        await conn.query(`SELECT count(*) FROM parquet_metadata('${source}')`);
                    } catch (err) {
                        console.warn(`Failed to warm up source ${source}`, err);
                    }
                }

                if (warmupConnRef.current) {
                    await conn.close();
                    // Ref clearing moved to finally
                    const end = performance.now();
                    setWarmingUpTime(end - start);
                    console.log(`Warm-up completed in ${(end - start).toFixed(2)}ms`);
                }
            } catch (err) {
                console.error("Warm-up failed", err);
            } finally {
                if (warmupConnRef.current) { // Only set false if we weren't cancelled (ref still exists)
                    warmupConnRef.current = null;
                    setWarmingUp(false);
                }
            }
        };

        performWarmup();

        return () => {
            // Cleanup: Cancel warmup if in progress
            if (warmupConnRef.current) {
                console.log("Cancelling warm-up due to effect cleanup");
                warmupConnRef.current.cancelSent().catch(console.warn);
                warmupConnRef.current.close().catch(console.warn);
                warmupConnRef.current = null;
                setWarmingUp(false);
            }
        };
    }, [activeDataset, db]);

    return {
        warmingUp,
        warmingUpTime
    };
}
