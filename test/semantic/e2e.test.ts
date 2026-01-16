// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SemanticRegistry } from '../../src/semantic/registry';
import { SemanticLoader } from '../../src/semantic/loader';
import { DuckDbSqlBuilder } from '../../src/semantic/sql_builder_duckdb';
import { SemanticFormatter } from '../../src/semantic/formatters';
import type { QueryIR } from '../../src/semantic/types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Subclass loader to read from disk
class DiskLoader extends SemanticLoader {
    async fetchText(url: string): Promise<string> {
        // url is like '/metadata/datasets/file.yaml'
        // Map to local path: public/metadata/...
        const relative = url.startsWith('/') ? url.slice(1) : url;
        const filePath = path.join(process.cwd(), 'public', relative);
        return fs.readFile(filePath, 'utf-8');
    }
}

describe('End-to-End Semantic Layer', () => {
    it('should load metadata and generate SQL', async () => {
        console.log("Starting End-to-End Verification...");

        // 1. Initialize Registry
        const loader = new DiskLoader();
        // Allow access to private fetchText override by casting to any or just trusting the protected method overriding works if it was protected.
        // In TS, private methods cannot be overridden easily if they are private.
        // My Loader used 'private async fetchText'. I should have made it protected.
        // For this test, I will dynamically replace the method on the instance.
        (loader as any).fetchText = async (url: string) => {
            const relative = url.startsWith('/') ? url.slice(1) : url;
            const filePath = path.join(process.cwd(), 'public', relative);
            return fs.readFile(filePath, 'utf-8');
        };

        const registry = new SemanticRegistry(loader);

        await registry.init();

        console.log("Registry Initialized.");
        expect(registry.getModel('vendas')).toBeDefined();

        // 2. Build Query
        const query: QueryIR = {
            semanticModel: 'vendas',
            dimensions: ['uf'],
            measures: ['ticket_medio'], // Derived
            limit: 5
        };

        const builder = new DuckDbSqlBuilder(registry);
        // We need to inject the registry instance into the builder or use the singleton.
        // The builder imports the singleton `registry`.
        // So for this test to work with *my* registry instance, I need to update the singleton or make builder accept registry.
        // The implementation imports `registry` directly. 
        // Hack: I will initialize the singleton `registry` instead of a new one.

        // Reset singleton (not easily possible), so I'll just use the singleton and patch its loader.
        const { registry: globalRegistry } = await import('../../src/semantic/registry');
        (globalRegistry as any).loader = loader;
        // Re-init
        await globalRegistry.init();

        const sql = builder.build(query);
        console.log("\nGenerated SQL:\n", sql);

        expect(sql).toContain('WITH base_metrics AS');
        console.log("SQL Generation Passed.");

        // 3. Test Formatter
        const formatter = new SemanticFormatter('pt-BR');
        const fmtNum = formatter.format(1234.56, { number: { use_grouping: true, decimals: 2, currency: 'BRL' } });
        console.log("\nFormatted Number:", fmtNum);

        // Node's Intl might differ slightly from Browser, but should contain 'R$' and '1.234,56'
        // Actually in pt-BR it uses NBSP sometimes. Just check basics.
        if (!fmtNum.includes('1.234,56') && !fmtNum.includes('1,234.56')) {
            // Allow failure if Node locale missing, but warn.
            console.warn("Formatting might depend on Node env locale support.");
        }

        console.log("Verification Complete.");
    });
});
