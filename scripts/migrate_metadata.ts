
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Dataset, Dimension, Attribute, DataType } from '../src/lib/metadata';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const METADATA_DIR = join(__dirname, '../public/metadata/datasets');

// Helper to infer type from raw schema
function inferType(schema: any[], colName: string): DataType {
    const col = schema.find(c => c.name === colName);
    if (!col) return 'VARCHAR'; // Default fallback
    const t = col.type.toUpperCase();
    if (t.includes('INT')) return 'INTEGER';
    if (t.includes('DOUBLE') || t.includes('FLOAT') || t.includes('DECIMAL')) return 'FLOAT';
    if (t.includes('DATE')) return 'DATE';
    if (t.includes('BOOL')) return 'BOOLEAN';
    if (t.includes('TIMESTAMP')) return 'TIMESTAMP';
    return 'VARCHAR';
}

async function migrate() {
    console.log(`Scanning ${METADATA_DIR}...`);
    const files = await readdir(METADATA_DIR);

    for (const file of files) {
        if (!file.endsWith('.json')) continue;

        console.log(`Migrating ${file}...`);
        const filePath = join(METADATA_DIR, file);
        const content = await readFile(filePath, 'utf-8');
        const dataset: any = JSON.parse(content);

        if (!dataset.semantic || !dataset.semantic.dimensions) {
            console.log(`Skipping ${file} (No semantic dimensions)`);
            continue;
        }

        const newDimensions: Dimension[] = [];

        for (const oldDim of dataset.semantic.dimensions) {
            // Check if already migrated (heuristically)
            // But we want to re-run to apply optimization everywhere.

            // SPECIAL CASE: Residência
            if (oldDim.name.toLowerCase().includes('residencia') || oldDim.name.toLowerCase().includes('localizacao')) {
                console.log(`  - Transforming specialized hierarchy for: ${oldDim.name}`);

                // Construct 3-level hierarchy
                // Level 1: Residência (Group)
                //   Level 2: Estado -> UF
                //   Level 2: Município -> Código, Nome

                const ufAttr: Attribute = {
                    name: 'uf',
                    label: 'UF',
                    sql: 'SG_UF',
                    type: inferType(dataset.schema, 'SG_UF')
                };

                const codMunAttr: Attribute = {
                    name: 'cd_municipio',
                    label: 'Código Município',
                    sql: 'CD_MUNICIPIO',
                    type: inferType(dataset.schema, 'CD_MUNICIPIO')
                };

                const nomMunAttr: Attribute = {
                    name: 'municipio',
                    label: 'Município',
                    sql: 'NM_MUNICIPIO',
                    type: inferType(dataset.schema, 'NM_MUNICIPIO')
                };

                const newDim: Dimension = {
                    name: 'residencia',
                    label: 'Residência',
                    type: 'geo',
                    subDimensions: [
                        {
                            name: 'estado',
                            label: 'Estado',
                            attributes: [ufAttr],
                            // Nest Municipio under Estado
                            subDimensions: [
                                {
                                    name: 'municipio',
                                    label: 'Município',
                                    attributes: [codMunAttr, nomMunAttr]
                                }
                            ]
                        }
                    ]
                };
                newDimensions.push(newDim);

            } else {
                // STANDARD TRANSFORMATION

                // OPTIMIZATION: Simple Dimension Check
                let potentialAttributes: Attribute[] = [];

                if (oldDim.attributes && oldDim.attributes.length > 0) {
                    potentialAttributes = oldDim.attributes.map((a: any) => ({
                        name: a.name,
                        label: a.label || a.name,
                        sql: a.sql || a.name,
                        type: a.type || inferType(dataset.schema, a.sql || a.name)
                    }));
                } else if (oldDim.sql || oldDim.dataType) {
                    // Already optimized? Or old format?
                    const sqlCol = oldDim.sql || oldDim.name;
                    potentialAttributes = [{
                        name: oldDim.name,
                        label: oldDim.label || oldDim.name,
                        sql: sqlCol,
                        type: oldDim.dataType || inferType(dataset.schema, sqlCol)
                    }];
                } else {
                    // Fallback
                    const sqlCol = oldDim.name;
                    potentialAttributes = [{
                        name: oldDim.name,
                        label: oldDim.label || oldDim.name,
                        sql: sqlCol,
                        type: inferType(dataset.schema, sqlCol)
                    }];
                }

                // Decide: Simple vs Composite
                // If 1 attribute, Collapse into Simple Dimension
                if (potentialAttributes.length === 1 && (!oldDim.subDimensions || oldDim.subDimensions.length === 0)) {
                    const attr = potentialAttributes[0];
                    newDimensions.push({
                        name: oldDim.name,
                        label: oldDim.label || oldDim.name,
                        dataType: attr.type,
                        sql: attr.sql,
                        // No attributes array
                    });
                } else {
                    // Keep as Composite
                    newDimensions.push({
                        name: oldDim.name,
                        label: oldDim.label || oldDim.name,
                        attributes: potentialAttributes,
                        subDimensions: oldDim.subDimensions // Preserve if existing
                    });
                }
            }
        }

        dataset.semantic.dimensions = newDimensions;

        // Write back
        await writeFile(filePath, JSON.stringify(dataset, null, 4));
        console.log(`  - Saved ${file}`);
    }
    console.log('Migration complete.');
}

migrate().catch(e => console.error(e));
