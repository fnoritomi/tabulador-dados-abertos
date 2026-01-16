
import { DuckDbSqlBuilder } from '../semantic/sql_builder_duckdb';
import type { QueryIR } from '../semantic/types';
import * as duckdb from '@duckdb/duckdb-wasm';

export interface PartitionPlan {
    enabled: boolean;
    bucketCount: number;
    bucketKeys: string[];
    estimatedGroups: number;
}

export class SafetyPlanner {
    private builder: DuckDbSqlBuilder;

    constructor(fullBaseUrl: string) {
        this.builder = new DuckDbSqlBuilder(fullBaseUrl);
    }

    /**
     * Estimates the number of groups for the query and plans partitioning if necessary.
     */
    async planExecution(
        conn: duckdb.AsyncDuckDBConnection,
        queryIR: QueryIR,
        forcePartitioning: boolean = false,
        options?: { target_per_bucket?: number, threshold?: number, limit_target_multiplier?: number, limit_threshold_multiplier?: number }
    ): Promise<PartitionPlan> {
        // 1. If not an aggregate query or no dimensions, no need to partition (usually)
        if (queryIR.dimensions.length === 0) {
            return { enabled: false, bucketCount: 1, bucketKeys: [], estimatedGroups: 0 };
        }

        // 2. Build Estimation Query (approx_count_distinct)
        const estimationSql = this.buildEstimationSql(queryIR);

        console.log('[SafetyPlanner] Estimating cardinality...', estimationSql);
        const result = await conn.query(estimationSql);
        const row = result.get(0);

        if (!row) {
            return { enabled: false, bucketCount: 1, bucketKeys: [], estimatedGroups: 0 };
        }

        const approxGroups = Number(row['approx_groups'] || 0);
        console.log('[SafetyPlanner] Estimated Groups:', approxGroups);

        // 3. Decide on Partitioning
        // Threshold: e.g., > 150k groups triggers partitioning, or if forced (retry)
        const defaultThreshold = options?.threshold || 150_000;
        let threshold = defaultThreshold;

        // If limit is present and we have a limit_threshold_multiplier, adjust the threshold
        if (queryIR.limit && queryIR.limit > 0 && options?.limit_threshold_multiplier) {
            threshold = queryIR.limit * options.limit_threshold_multiplier;
        }

        const shouldPartition = forcePartitioning || approxGroups > threshold;

        if (!shouldPartition) {
            return { enabled: false, bucketCount: 1, bucketKeys: [], estimatedGroups: approxGroups };
        }

        // 4. Calculate Bucket Count
        // Target ~50k-100k groups per bucket
        let target = options?.target_per_bucket || 75_000;

        // Optimization for Limited Queries (Visualization)
        // If there is a limit, we don't need huge buckets. 
        // We want to return roughly the limit amount (or slightly more to account for skew)
        if (queryIR.limit && queryIR.limit > 0) {
            const multiplier = options?.limit_target_multiplier || 3;
            target = Math.min(target, queryIR.limit * multiplier);
        }

        const TARGET_PER_BUCKET = target;
        let bucketCount = Math.ceil(approxGroups / TARGET_PER_BUCKET);

        // Clamp and ensure reasonable bounds
        bucketCount = Math.max(1, bucketCount);
        // Increase max to 8192 to support small targets (visualization)
        bucketCount = Math.min(8192, bucketCount);

        if (forcePartitioning && bucketCount === 1) {
            // If forced but count is small, force at least 4 buckets to help OOM
            bucketCount = 4;
        }

        // 5. Select Bucket Keys
        // We need to pick dimensions that have high cardinality.
        // We calculated individual cardinalities in the estimation query.
        const bucketKeys = this.selectBucketKeys(row, queryIR.dimensions, bucketCount);

        console.log('[SafetyPlanner] Plan:', { bucketCount, bucketKeys, approxGroups });

        return {
            enabled: true,
            bucketCount,
            bucketKeys,
            estimatedGroups: approxGroups
        };
    }

    private buildEstimationSql(queryIR: QueryIR): string {
        // Based on user provided template:
        // 1. CTE 'filtered' with user filters
        // 2. approx_count_distinct(concat_ws(...attrs))
        // 3. individual approx_count_distinct for dimensions

        // We cheat a bit: we use the existing builder to generate the "base" query
        // but override the SELECT clause to valid estimation metrics.

        // NOTE: The current builder builds a full query. We need to extract the FROM/JOIN/WHERE parts.
        // Or, simpler: we build a query that selects * from source where filters... 
        // and wrap it.

        // Actually, let's look at how the builder works. It produces a full string.
        // Ideally we add a method to the builder to produce the CTE or a "Base Select".
        // For now, let's try to construct it manually using the builder's internal logic concepts if possible,
        // or just use the builder to give us a "Select *" with filters and subquery it.

        // const baseQuery = this.builder.build({
        //     ...queryIR,
        //     limit: 0, // No limit
        //     orderBy: [], // No ordering
        //     dimensions: [], // We'll add custom select
        //     measures: [],
        //     columns: [] // No columns
        // });

        // The builder might return "SELECT * FROM ... WHERE ... GROUP BY ..."
        // We need to strip GROUP BY if it adds it automatically when dims are empty? 
        // If dimensions are empty, it shouldn't add GROUP BY.

        // BUT: The builder is designed to produce the final SQL.
        // Let's rely on a helper in builder or just parsing? Parsing is risky.
        // Let's assume we can ask the builder for a "base dataset query" 
        // which basically select * from sources where filters.

        // Strategy:
        // 1. Use builder to get the "Source + Joins + Filters" part.
        // Since we can't easily hook into the builder's internals without modifying it,
        // let's modify the builder to support an "estimation mode" or exposing a definition.
        // OR: We construct the `AS filtered (...)` by passing empty dims/measures and valid filters.

        // Implementation detail: We will implement `buildEstimationQuery` in the builder itself
        // to keep SQL logic encapsulated, and call it here. But for now, assuming that method exists.
        // I'll update the plan to add `buildEstimationQuery` to `DuckDbSqlBuilder`.

        return this.builder.buildEstimationQuery(queryIR);
    }

    private selectBucketKeys(row: Record<string, unknown>, dimensions: string[], bucketCount: number): string[] {
        // Collect cardinalities
        const cards = dimensions.map(dim => ({
            dim,
            card: Number(row[`card_${dim}`] || 0)
        }));

        // Sort by cardinality descending
        cards.sort((a, b) => b.card - a.card);

        // Heuristic:
        // Start with the highest cardinality
        const selected = [cards[0].dim];

        // If need more spread (todo: logic implementation), add more.
        // Simple logic: if card < 4 * bucketCount, add next.
        let currentCard = cards[0].card;
        let idx = 1;
        while (currentCard < 4 * bucketCount && idx < cards.length && idx < 3) {
            selected.push(cards[idx].dim);
            // Rough estimate of combined cardinality (multiplication is upper bound)
            currentCard = currentCard * Math.max(1, cards[idx].card);
            idx++;
        }

        return selected;
    }
}
