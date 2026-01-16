import * as duckdb from '@duckdb/duckdb-wasm';
import { RecordBatch } from 'apache-arrow';
import { SafetyPlanner } from './safety-planner';
import { DuckDbSqlBuilder } from '../semantic/sql_builder_duckdb';
import type { QueryIR } from '../semantic/types';
import { registry } from '../semantic/registry';

export interface QueryRunnerOptions {
    baseUrl?: string;
    onStatus?: (msg: string) => void;
    planner?: SafetyPlanner;
    builder?: DuckDbSqlBuilder;
    allowPartitioning?: boolean;
}

export type BatchGenerator = AsyncGenerator<RecordBatch, void, unknown>;

export class QueryRunner {
    private planner: SafetyPlanner;
    private builder: DuckDbSqlBuilder;

    constructor(options: { baseUrl?: string | undefined, planner?: SafetyPlanner, builder?: DuckDbSqlBuilder }) {
        const baseUrl = options.baseUrl || '/';
        this.planner = options.planner || new SafetyPlanner(baseUrl);
        this.builder = options.builder || new DuckDbSqlBuilder(baseUrl);
    }

    async run(
        conn: duckdb.AsyncDuckDBConnection,
        queryIR: QueryIR,
        options: { onStatus?: (msg: string) => void, forcePartitioning?: boolean, signal?: AbortSignal }
    ): Promise<BatchGenerator> {
        const { onStatus, forcePartitioning, signal } = options;

        // Check High Cardinality Tag
        // Check High Cardinality Tag or Config
        let shouldPartition = forcePartitioning || false;
        let plannerOptions: { target_per_bucket?: number, threshold?: number, limit_target_multiplier?: number, limit_threshold_multiplier?: number } | undefined;

        if (!shouldPartition) {
            const model = registry.getModel(queryIR.semanticModel);
            if (model) {
                if (typeof model.high_cardinality === 'object') {
                    if (model.high_cardinality.enabled !== false) {
                        if (!shouldPartition) shouldPartition = true;
                    }
                    plannerOptions = model.high_cardinality;
                } else if (model.high_cardinality === true) {
                    if (!shouldPartition) shouldPartition = true;
                } else if (model.tags?.includes('high_cardinality')) {
                    if (!shouldPartition) shouldPartition = true;
                }
            }
        }

        if (shouldPartition) {
            return this.runPartitionedGenerator(conn, queryIR, { force: Boolean(forcePartitioning), onStatus, signal, plannerOptions });
        }

        // Standard Run
        try {
            // Use streaming execution
            const sql = this.builder.build(queryIR);
            // Verify signal before starting
            if (signal?.aborted) throw new Error("Aborted");

            const reader = await conn.send(sql, true);

            async function* standardGenerator() {
                for await (const batch of reader) {
                    if (signal?.aborted) throw new Error("Aborted");
                    // Cast to unknown then to RecordBatch to avoid structural type errors between versions
                    yield batch as unknown as RecordBatch;
                }
            }

            return standardGenerator();

        } catch (err: unknown) {
            const error = err as Error;
            const isOOM = error.message && (error.message.includes('Out of Memory') || error.message.includes('allocation failed'));
            if (isOOM) {
                onStatus?.("OOM detectado. Tentando particionamento...");
                return this.runPartitionedGenerator(conn, queryIR, { force: true, onStatus, signal, plannerOptions });
            }
            throw err;
        }
    }

    private async *runPartitionedGenerator(
        conn: duckdb.AsyncDuckDBConnection,
        queryIR: QueryIR,
        options: {
            force: boolean,
            onStatus?: (msg: string) => void,
            signal?: AbortSignal,
            plannerOptions?: { target_per_bucket?: number, threshold?: number, limit_target_multiplier?: number, limit_threshold_multiplier?: number }
        }
    ): AsyncGenerator<RecordBatch, void, unknown> {
        const { force, onStatus, signal, plannerOptions } = options;

        onStatus?.("Planejando execução...");
        const plan = await this.planner.planExecution(conn, queryIR, force, plannerOptions);

        if (!plan.enabled) {
            // Planner decided not to partition
            const sql = this.builder.build(queryIR);
            const reader = await conn.send(sql, true);
            for await (const batch of reader) {
                if (signal?.aborted) throw new Error("Aborted");
                yield batch as unknown as RecordBatch;
            }
            return;
        }

        let totalRows = 0;

        for (let i = 0; i < plan.bucketCount; i++) {
            if (signal?.aborted) throw new Error("Aborted");

            onStatus?.(`Processando parte ${i + 1}/${plan.bucketCount} (Grupos est.: ${plan.estimatedGroups})...`);

            // Adjust limit for this partition if a global limit exists
            let currentPartitionIR = queryIR;
            if (queryIR.limit !== undefined) {
                const remaining = queryIR.limit - totalRows;
                if (remaining <= 0) break; // Should be handled by loop check, but safety first
                currentPartitionIR = { ...queryIR, limit: remaining };
            }

            const sql = this.builder.buildPartitionedQuery(currentPartitionIR, {
                bucketCount: plan.bucketCount,
                bucketKeys: plan.bucketKeys,
                bucketIndex: i
            });

            // Use the same connection (no fresh connection overhead)
            // PASS TRUE allows streaming result to prevent materialization
            const reader = await conn.send(sql, true);

            for await (const batch of reader) {
                if (signal?.aborted) throw new Error("Aborted");

                // duckdb-wasm's RecordBatch might have numRows property or use length
                // Cast to any to access safely
                const b = batch as { numRows?: number; length?: number };
                const count = b.numRows || b.length || 0;

                if (count > 0) {
                    yield batch as unknown as RecordBatch;
                    totalRows += count;
                }
            }

            // Explicitly yield to event loop after each bucket to allow GC
            await new Promise(r => setTimeout(r, 0));

            if (queryIR.limit && totalRows >= queryIR.limit) {
                break;
            }
        }
    }
}
