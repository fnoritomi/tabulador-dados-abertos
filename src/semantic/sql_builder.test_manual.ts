import { DuckDbSqlBuilder } from './sql_builder_duckdb';
import { registry } from './registry';
import type { QueryIR, SemanticModel } from './types';

// --- MOCK DATA ---
const mockProductDim: SemanticModel = {
    name: 'dim_produto',
    model: 'dim_produto',
    alias: 'p',
    dimensions: [
        { name: 'nome', type: 'categorical', expr: 'p.nome' }
    ],
    measures: [],
    joins: [] // Assuming dimensions don't usually have joins in this simple model
};

const mockSalesFact: SemanticModel = {
    name: 'vendas',
    model: 'fato_vendas',
    alias: 'v',
    dimensions: [
        {
            name: 'dt_venda',
            type: 'time',
            expr: 'v.dt_venda',
            type_params: { time_granularity: 'day' }
        },
        { name: 'uf', type: 'categorical', expr: 'v.uf' },
        { name: 'produto_nome', type: 'categorical', expr: 'p.nome', join: 'produto' }
    ],
    measures: [
        { name: 'receita', type: 'sum', expr: 'SUM(v.valor)' }
    ],
    joins: [
        {
            name: 'produto',
            model: 'dim_produto',
            alias: 'p',
            on: 'v.id_produto = p.id_produto',
            relationship: 'many_to_one'
        }
    ]
};

// Inject mocks
(registry as any).models.set('vendas', mockSalesFact);
(registry as any).models.set('dim_produto', mockProductDim);
// We don't strictly need datasets if the model.model logic falls back to using the string as relation,
// but let's add them for completeness of the logic path 'model refers to dataset'.
(registry as any).datasets.set('fato_vendas', { relation: 'main.fato_vendas' });
(registry as any).datasets.set('dim_produto', { relation: 'main.dim_produto' });


const builder = new DuckDbSqlBuilder();

// --- TESTS ---

const testJoinQuery = () => {
    console.log("\n[TEST] Join Query");
    const query: QueryIR = {
        semanticModel: 'vendas',
        dimensions: ['uf', 'produto_nome'], // produto_nome triggers join
        measures: ['receita'],
        limit: 10
    };

    const sql = builder.build(query);
    console.log(sql);

    if (!sql.includes('LEFT JOIN main.dim_produto AS p ON v.id_produto = p.id_produto')) throw new Error("Join clause missing");
    if (!sql.includes('p.nome AS "produto_nome"')) throw new Error("Joined column selection missing");
    console.log("PASS");
};

const testTimeGranularity = () => {
    console.log("\n[TEST] Time Granularity");
    const query: QueryIR = {
        semanticModel: 'vendas',
        dimensions: ['dt_venda'],
        measures: ['receita'],
        timeGranularity: {
            'dt_venda': 'month'
        }
    };

    const sql = builder.build(query);
    console.log(sql);

    if (!sql.includes("date_trunc('month', v.dt_venda) AS \"dt_venda\"")) throw new Error("date_trunc missing or incorrect");
    console.log("PASS");
};

const testHavingClause = () => {
    console.log("\n[TEST] Having Clause");
    const query: QueryIR = {
        semanticModel: 'vendas',
        dimensions: ['uf'],
        measures: ['receita'],
        measureFilters: [
            { field: 'receita', operator: '>', value: 1000 }
        ]
    };

    // Note: In our builder logic, the filter field is currently put raw into the clause.
    // Ideally, for HAVING, we should probably use the Alias or the Expr.
    // Current implementation: uses 'field' (e.g. 'receita') directly.
    // In DuckDB/Postgres, referring to the output alias in HAVING is allowed.
    // let's verifying that.

    const sql = builder.build(query);
    console.log(sql);

    if (!sql.includes("HAVING recipe > 1000") && !sql.includes("HAVING receita > 1000")) {
        // We expect 'HAVING receita > 1000'
    }
    if (!sql.includes("HAVING receita > 1000")) throw new Error("HAVING clause incorrect");
    console.log("PASS");
};

const testFilterJoin = () => {
    console.log("\n[TEST] Filter Join (Should be INNER)");
    const query: QueryIR = {
        semanticModel: 'vendas',
        dimensions: ['uf'], // No join dimension selected
        measures: ['receita'],
        filters: [
            { field: 'produto_nome', operator: '=', value: 'Bicicleta' } // Filter on joined dim
        ],
        limit: 10
    };

    const sql = builder.build(query);
    console.log(sql);

    // Should include the join, and it should be INNER
    if (!sql.includes('INNER JOIN main.dim_produto AS p')) throw new Error("INNER JOIN mismatch");
    console.log("PASS");
};

const testDerivedMeasure = () => {
    console.log("\n[TEST] Derived Measure (CTE)");

    // Add derived measure to mock
    (registry as any).models.get('vendas').measures.push({
        name: 'ticket_medio',
        type: 'derived',
        expr: '${receita} / 100' // Simple mock calc
    });

    const query: QueryIR = {
        semanticModel: 'vendas',
        dimensions: ['uf'],
        measures: ['ticket_medio', 'receita'],
        limit: 5
    };

    const sql = builder.build(query);
    console.log(sql);

    if (!sql.includes('WITH base_metrics AS (')) throw new Error("CTE missing");
    if (!sql.includes('SUM(v.valor) AS "receita"')) throw new Error("Base measure calculation missing");
    if (!sql.includes('"receita" / 100 AS "ticket_medio"')) throw new Error("Derived calculation missing");
    console.log("PASS");
};

// Run tests
try {
    testJoinQuery();
    testTimeGranularity();
    testHavingClause();
    testFilterJoin();
    testDerivedMeasure();
    console.log("\nAll Iteration 2 & 3 Tests Passed!");
} catch (e) {
    console.error("\nTEST FAILED:", e);
    process.exit(1);
}
