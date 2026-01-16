import { describe, it, expect } from 'vitest';
import { registry } from '../../src/semantic/registry';
import { DuckDbSqlBuilder } from '../../src/semantic/sql_builder_duckdb';
import type { QueryIR, SemanticModel } from '../../src/semantic/types';

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


const builder = new DuckDbSqlBuilder(registry);

// --- TESTS ---

describe('DuckDbSqlBuilder Manual Tests', () => {
    it('should generate correct Join Query', () => {
        const query: QueryIR = {
            semanticModel: 'vendas',
            dimensions: ['uf', 'produto_nome'], // produto_nome triggers join
            measures: ['receita'],
            limit: 10
        };

        const sql = builder.build(query);
        expect(sql).toContain('LEFT JOIN main.dim_produto AS p ON v.id_produto = p.id_produto');
        expect(sql).toContain('p.nome AS "produto_nome"');
    });

    it('should handle Time Granularity', () => {
        const query: QueryIR = {
            semanticModel: 'vendas',
            dimensions: ['dt_venda'],
            measures: ['receita'],
            timeGranularity: {
                'dt_venda': 'month'
            }
        };

        const sql = builder.build(query);
        expect(sql).toContain("date_trunc('month', v.dt_venda) AS \"dt_venda\"");
    });

    it('should generate Having Clause', () => {
        const query: QueryIR = {
            semanticModel: 'vendas',
            dimensions: ['uf'],
            measures: ['receita'],
            measureFilters: [
                { field: 'receita', operator: '>', value: 1000 }
            ]
        };

        const sql = builder.build(query);
        // We expect 'HAVING receita > 1000'
        expect(sql).toContain("HAVING receita > 1000");
    });

    it('should generate Filter Join (INNER)', () => {
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
        expect(sql).toContain('INNER JOIN main.dim_produto AS p');
    });

    it('should handle Derived Measure (CTE)', () => {
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
        expect(sql).toContain('WITH base_metrics AS (');
        expect(sql).toContain('SUM(v.valor) AS "receita"');
        expect(sql).toContain('"receita" / 100 AS "ticket_medio"');
    });
});
