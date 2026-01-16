import { DuckDbSqlBuilder } from './sql_builder_duckdb';
import { registry } from './registry';
import type { QueryIR, SemanticModel } from './types';

// Mock Registry
const mockModel: SemanticModel = {
    name: 'test_model',
    model: 'source_table',
    dimensions: [
        { name: 'dim1', type: 'categorical', expr: 'd1' }
    ],
    measures: [
        { name: 'simple_count', type: 'count', expr: 'id' },
        {
            name: 'distinct_count',
            type: 'count',
            expr: 'user_id',
            agg_params: { distinct: true }
        },
        {
            name: 'conditional_sum',
            type: 'sum',
            expr: 'amount',
            agg_params: { where: "status = 'paid'" }
        },
        {
            name: 'distinct_conditional_count',
            type: 'count',
            expr: 'order_id',
            agg_params: { distinct: true, where: "region = 'US'" }
        }
    ]
};

// Inject mock
(registry as any).models.set('test_model', mockModel);
(registry as any).datasets.set('source_table', { name: 'source_table', relation: 'source_table', columns: [] });

const builder = new DuckDbSqlBuilder();

const query: QueryIR = {
    semanticModel: 'test_model',
    dimensions: ['dim1'],
    measures: ['simple_count', 'distinct_count', 'conditional_sum', 'distinct_conditional_count'],
    limit: 10
};

console.log('--- SQL Generated for agg_params ---');
console.log(builder.build(query));
