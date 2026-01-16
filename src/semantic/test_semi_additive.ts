import { DuckDbSqlBuilder } from './sql_builder_duckdb';
import { registry } from './registry';
import type { QueryIR, SemanticModel } from './types';

// Mock Registry
const mockModel: SemanticModel = {
    name: 'inventory',
    model: 'fact_inventory',
    alias: 'inv',
    dimensions: [
        { name: 'date_day', type: 'time', expr: 'inv.date_day' },
        { name: 'warehouse_id', type: 'categorical', expr: 'inv.warehouse_id' },
        { name: 'product_id', type: 'categorical', expr: 'inv.product_id' }
    ],
    measures: [
        {
            name: 'stock_level',
            type: 'sum',
            expr: 'quantity',
            non_additive_dimension: {
                name: 'date_day',
                window_choice: 'max',
                window_groupings: [] // Global window (e.g. inventory at end of period)
            }
        }
    ]
};

// Inject mock
(registry as any).models.set('inventory', mockModel);
(registry as any).datasets.set('fact_inventory', { name: 'fact_inventory', relation: 'fact_inventory', columns: [] });

const builder = new DuckDbSqlBuilder();

console.log('--- TEST 1: Semi-Additive Active (Global Window) ---');
console.log('Scenario: Query stock_level by warehouse, without date_day in Group By.');
// Expected: Should auto-filter to max(date_day)
const query1: QueryIR = {
    semanticModel: 'inventory',
    dimensions: ['warehouse_id'],
    measures: ['stock_level'],
    limit: 10
};
console.log(builder.build(query1));

console.log('\n--- TEST 2: Semi-Additive Inactive (Standard Aggregation) ---');
console.log('Scenario: Query stock_level BY date_day.');
// Expected: Standard aggregation, no special CTEs
const query2: QueryIR = {
    semanticModel: 'inventory',
    dimensions: ['warehouse_id', 'date_day'],
    measures: ['stock_level'],
    limit: 10
};
console.log(builder.build(query2));


console.log('\n--- TEST 3: Semi-Additive with Window Grouping ---');
console.log('Scenario: stock_level per warehouse, semi-additive on date_day, but LAST per product_id.');

// Add measure with groupings
(registry as any).models.get('inventory').measures.push({
    name: 'stock_per_product_last',
    type: 'sum',
    expr: 'quantity',
    non_additive_dimension: {
        name: 'date_day',
        window_choice: 'max',
        window_groupings: ['product_id']
    }
});

const query3: QueryIR = {
    semanticModel: 'inventory',
    dimensions: ['warehouse_id', 'product_id'],
    measures: ['stock_per_product_last'],
    limit: 10
};
console.log(builder.build(query3));

