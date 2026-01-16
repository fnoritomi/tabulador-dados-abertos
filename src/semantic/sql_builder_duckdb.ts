import type { SemanticRegistry } from './registry';
import type { QueryIR, SemanticModel, FilterCnd, OrderBy, Join, Measure } from './types';

export class DuckDbSqlBuilder {
    private baseUrl: string;
    private registry: SemanticRegistry;

    constructor(registry: SemanticRegistry, baseUrl: string = '/') {
        this.registry = registry;
        // Normalize baseUrl to not end with slash? Or ensure it does?
        // Let's ensure it has trailing slash if it's not empty/root
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    }

    build(query: QueryIR, extraWhere?: string): string {
        // Explicit Mode Check
        if (query.mode === 'dataset') {
            const dataset = this.registry.getDataset(query.semanticModel);
            if (!dataset) throw new Error(`Dataset ${query.semanticModel} not found`);
            return this.buildRawQuery(dataset, query, extraWhere);
        }

        const model = this.registry.getModel(query.semanticModel);
        if (!model) {
            // Fallback for compatibility if mode not set (or if semantic requested but not found)
            throw new Error(`Semantic Model ${query.semanticModel} not found`);
        }

        // Semantic Mode Logic
        const mainDataset = this.registry.getDataset(model.model);
        let mainRelation = model.model;

        if (mainDataset) {
            if (mainDataset.sources && mainDataset.sources.length > 0) {
                const quotedSources = mainDataset.sources.map(s => {
                    // Check if absolute or relative
                    if (s.startsWith('http') || s.startsWith('/')) {
                        return `'${s}'`;
                    }
                    return `'${this.baseUrl}${s}'`;
                }).join(', ');
                mainRelation = `read_parquet([${quotedSources}])`;
            } else if (mainDataset.relation) {
                mainRelation = mainDataset.relation;
            }
        }

        // --- PHASE 1: Dependency Resolution ---
        // We need to know which PRIMARY measures and dimensions are needed.
        // Derived measures need to be expanded to their base dependencies.

        const usedJoins = new Map<string, Join>();
        const joinTypes = new Map<string, 'LEFT' | 'INNER'>();

        const requiredDimensions = new Set<string>(query.dimensions);
        const requiredBaseMeasures = new Set<string>();
        const derivedMeasureDefinitions = new Map<string, string>(); // name -> raw_expr (with ${} placeholders)

        // 1.1 Helper to register dimensions/joins
        const registerDimension = (dimName: string, isFilter: boolean) => {
            const dim = model.dimensions.find(d => d.name === dimName);
            if (!dim) return; // Skip if not found (or throw in strict)

            // Check Join
            if (dim.join) {
                const joinDef = model.joins?.find(j => j.name === dim.join);
                if (joinDef) {
                    if (!usedJoins.has(dim.join)) {
                        usedJoins.set(dim.join, joinDef);
                        joinTypes.set(dim.join, 'LEFT');
                    }
                    if (isFilter) joinTypes.set(dim.join, 'INNER');
                }
            }
        };

        // 1.2 Scan Dimensions and Filters
        query.dimensions.forEach(d => registerDimension(d, false));
        query.filters?.forEach(f => registerDimension(f.field, true));

        // 1.3 Scan Measures and Resolve Derived
        query.measures.forEach(measName => {
            const meas = model.measures.find(m => m.name === measName);
            if (!meas) throw new Error(`Measure ${measName} not found`);

            if (meas.type === 'derived') {
                derivedMeasureDefinitions.set(measName, meas.expr);
                // Extract dependencies from expression "${name}"
                const matches = meas.expr.match(/\$\{([^}]+)\}/g);
                if (matches) {
                    matches.forEach(m => {
                        const baseName = m.slice(2, -1); // remove ${ and }
                        // Recursive check? For MVP assume 1 level of depth or handled by DB references if logical.
                        // Ideally checking if baseName is another derived measure or base. 
                        // For MVP, assume baseName is a valid measure in the model.
                        // We must add it to requiredBaseMeasures if it's not derived. 
                        // If it IS derived, we need recursion. Let's stick to 1 level for now: derived depends on base.
                        const baseMeas = model.measures.find(bm => bm.name === baseName);
                        if (baseMeas && baseMeas.type !== 'derived') {
                            requiredBaseMeasures.add(baseName);
                        } else if (baseMeas && baseMeas.type === 'derived') {
                            // Support nested derived? 
                            // Would be nice. Let's add it to derived map and recurse. 
                            // But for simple CTE, we need all base aggregations in the CTE.
                            // Let's assume for now derived only references base measures.
                            console.warn("Nested derived measures not fully supported in simple dependency scan yet.");
                        }
                    });
                }
            } else {
                requiredBaseMeasures.add(measName);
            }
        });

        // Also add measures used in Having clauses to the requirement list
        query.measureFilters?.forEach(f => {
            // If filter is on a derived measure on base?
            // If filter on derived, we need to calculate it.
            // If filter on base, we need it in CTE.
            const meas = model.measures.find(m => m.name === f.field);
            if (meas?.type === 'derived') {
                // handled by outer query
                derivedMeasureDefinitions.set(f.field, meas.expr);
                // extracting deps... (copy logic from above or refactor)
                const matches = meas.expr.match(/\$\{([^}]+)\}/g);
                matches?.forEach(m => {
                    const baseName = m.slice(2, -1);
                    const baseMeas = model.measures.find(bm => bm.name === baseName);
                    if (baseMeas?.type !== 'derived') requiredBaseMeasures.add(baseName);
                });
            } else {
                requiredBaseMeasures.add(f.field);
            }
        });

        // --- PHASE 1.5: Detect Non-Additive Logic ---

        let nonAdditiveSpec: { measure: string, spec: NonNullable<Measure['non_additive_dimension']> } | null = null;

        // Scan for measures that need semi-additive handling
        // Condition: Measure has non_additive_dimension AND that dimension is NOT in the query.dimensions
        for (const measName of requiredBaseMeasures) {
            const meas = model.measures.find(m => m.name === measName)!;
            if (meas.non_additive_dimension) {
                const dimName = meas.non_additive_dimension.name;
                // If the dimension is NOT in the active query dimensions, we trigger non-additive logic
                if (!query.dimensions.includes(dimName)) {
                    if (nonAdditiveSpec && nonAdditiveSpec.spec.name !== dimName) {
                        throw new Error("Multi-dimensional non-additive logic not yet supported (multiple conflicting dimensions)");
                    }
                    nonAdditiveSpec = { measure: measName, spec: meas.non_additive_dimension };
                    // Also we MUST register the non-additive dimension as required for the inner CTEs
                    // But NOT for the final output
                    registerDimension(dimName, true); // Treat as filter requirement (inner)
                }
            }
        }

        // Must include window groupings dimensions if defined
        if (nonAdditiveSpec?.spec.window_groupings) {
            nonAdditiveSpec.spec.window_groupings.forEach((g: string) => registerDimension(g, false));
        }

        // --- PHASE 2: Build CTEs ---

        const cteSelectParts: string[] = [];

        // If non-additive, we build a different chain:
        // filtered -> chosen_window -> windowed -> base_metrics

        const baseFrom = `FROM ${mainRelation} AS ${model.alias || 't'}`;
        const baseJoins: string[] = [];
        usedJoins.forEach((join, joinName) => {
            let joinRelation = join.model;
            const refModel = this.registry.getModel(join.model);
            if (refModel) {
                const refDataset = this.registry.getDataset(refModel.model);
                if (refDataset) {
                    if (refDataset.sources && refDataset.sources.length > 0) {
                        const quoted = refDataset.sources.map(s => {
                            if (s.startsWith('http') || s.startsWith('/')) return `'${s}'`;
                            return `'${this.baseUrl}${s}'`;
                        }).join(', ');
                        joinRelation = `read_parquet([${quoted}])`;
                    } else {
                        joinRelation = refDataset.relation || refModel.model;
                    }
                } else {
                    joinRelation = refModel.model;
                }
            } else {
                // Fallback
                const refDataset = this.registry.getDataset(join.model);
                if (refDataset) joinRelation = refDataset.relation || '';
            }

            const type = joinTypes.get(joinName) || 'LEFT';
            baseJoins.push(`${type} JOIN ${joinRelation} AS ${join.alias || join.name} ON ${join.on}`);
        });

        const whereClause = this.buildWhere(query.filters, model, extraWhere);
        const cteName = 'base_metrics';
        let cteBody = '';

        if (nonAdditiveSpec) {
            // --- SEMI-ADDITIVE STRATEGY ---
            const spec = nonAdditiveSpec.spec;
            const targetDim = model.dimensions.find(d => d.name === spec.name)!;
            const choiceFunc = (spec.window_choice === 'min' || spec.window_choice === 'first') ? 'MIN' : 'MAX';

            // 1. Filtered Base (apply global filters)
            // const cols = ['*']; // Simply carry all? Or optimization: only required columns.
            // For simplicity, select * from main table, but strictly we should be explicit.
            // Let's rely on standard SQL scope. 
            // Better: Select required dims + targetDim + all measures involved.
            // Optimization TODO. For now, let's use the FROM/JOIN structure for 'filtered'.

            // Issue: 'filtered' CTE above uses `SELECT *`. 
            // If we have joins, we have ambiguity.
            // Strategy refinement:
            // CTE 1 `filtered`: Select ALL required columns explicitly with full qualification.

            // Let's produce the `chosen_window` directly from the source tables + filters.

            const groupingsExprs = (spec.window_groupings || []).map((g: string) => {
                const d = model.dimensions.find(x => x.name === g)!;
                return d.expr;
            });

            // Build `chosen_window` selection
            const cwSelect = groupingsExprs.map((expr: string, i: number) => `${expr} AS g_${i}`).concat(
                `${choiceFunc}(${targetDim.expr}) AS chosen_val`
            ).join(', ');

            const cwBody = `
                 SELECT ${cwSelect}
                 ${baseFrom}
                 ${baseJoins.join('\n')}
                 ${whereClause}
                 GROUP BY ALL
             `;

            // Now build the main `base_metrics` CTE, but adding the Inner Join to `chosen_window`
            const cwJoinOn = [
                `${targetDim.expr} = cw.chosen_val`
            ];
            groupingsExprs.forEach((expr: string, i: number) => {
                cwJoinOn.push(`${expr} = cw.g_${i}`);
            });

            const semiAdditiveJoin = `INNER JOIN chosen_window AS cw ON ${cwJoinOn.join(' AND ')}`;

            // Standard CTE generation but with extra JOIN
            requiredDimensions.forEach(dimName => {
                const dim = model.dimensions.find(d => d.name === dimName)!;
                let expr = dim.expr;
                if (dim.type === 'time' && query.timeGranularity && query.timeGranularity[dimName]) {
                    const gran = query.timeGranularity[dimName];
                    expr = `date_trunc('${gran}', ${dim.expr})`;
                }
                cteSelectParts.push(`${expr} AS "${dimName}"`);
            });

            requiredBaseMeasures.forEach(measName => {
                const meas = model.measures.find(m => m.name === measName)!;
                const expr = this.emitAggregate(meas);
                cteSelectParts.push(`${expr} AS "${measName}"`);
            });

            const cteGroupBy = requiredDimensions.size > 0 ? 'GROUP BY ALL' : '';

            // Output Structure
            return `WITH chosen_window AS (
${cwBody}
),
${cteName} AS (
    SELECT ${cteSelectParts.join(', ')}
    ${baseFrom}
    ${baseJoins.join('\n')}
    ${semiAdditiveJoin}
    ${whereClause}
    ${cteGroupBy}
)
SELECT ${this.buildFinalSelect(query, derivedMeasureDefinitions)}
FROM ${cteName}
${this.buildHaving(query.measureFilters)}
${this.buildOrderBy(query.orderBy)}
${query.limit ? `LIMIT ${query.limit}` : ''}`;

        } else {
            // --- STANDARD GENERATION (Legacy logic) ---

            requiredDimensions.forEach(dimName => {
                const dim = model.dimensions.find(d => d.name === dimName)!;
                let expr = dim.expr;
                if (dim.type === 'time' && query.timeGranularity && query.timeGranularity[dimName]) {
                    const gran = query.timeGranularity[dimName];
                    expr = `date_trunc('${gran}', ${dim.expr})`;
                }
                cteSelectParts.push(`${expr} AS "${dimName}"`);
            });

            requiredBaseMeasures.forEach(measName => {
                const meas = model.measures.find(m => m.name === measName)!;
                const expr = this.emitAggregate(meas);
                cteSelectParts.push(`${expr} AS "${measName}"`);
            });

            const cteGroupBy = (requiredBaseMeasures.size > 0 && requiredDimensions.size > 0) ? 'GROUP BY ALL' : '';

            cteBody = [
                `SELECT ${cteSelectParts.join(', ')}`,
                baseFrom,
                ...baseJoins,
                whereClause,
                cteGroupBy
            ].filter(Boolean).join('\n');

            return `WITH ${cteName} AS (
${cteBody}
)
SELECT ${this.buildFinalSelect(query, derivedMeasureDefinitions)}
FROM ${cteName}
${this.buildHaving(query.measureFilters)}
${this.buildOrderBy(query.orderBy)}
${query.limit ? `LIMIT ${query.limit}` : ''}`;
        }
    }

    buildEstimationQuery(query: QueryIR): string {
        const model = this.registry.getModel(query.semanticModel);
        if (!model) throw new Error(`Model ${query.semanticModel} not found`);

        const relevantDims = new Set([...query.dimensions]);
        query.filters?.forEach(f => relevantDims.add(f.field));

        const { fromClause, joinClauses, whereClause } = this.buildContext(query, model, relevantDims);

        const dimExprs = query.dimensions.map(dName => {
            const dim = model.dimensions.find(d => d.name === dName);
            if (!dim) throw new Error(`Dimension ${dName} not found`);
            return `CAST(${dim.expr} AS VARCHAR)`;
        });

        const concatExpr = `concat_ws('||', ${dimExprs.join(', ')})`;
        const approxGroupsExpr = `approx_count_distinct(${concatExpr}) AS approx_groups`;

        const cardExprs = query.dimensions.map(dName => {
            const dim = model.dimensions.find(d => d.name === dName);
            return `approx_count_distinct(${dim!.expr}) AS "card_${dName}"`;
        });

        const selection = [approxGroupsExpr, ...cardExprs].join(',\n    ');

        return `
SELECT
    ${selection}
${fromClause}
${joinClauses.join('\n')}
${whereClause}
        `.trim();
    }

    private buildContext(query: QueryIR, model: SemanticModel, requiredDims: Set<string>): { fromClause: string, joinClauses: string[], whereClause: string } {
        const usedJoins = new Map<string, Join>();
        const joinTypes = new Map<string, string>();

        requiredDims.forEach(dimName => {
            const dim = model.dimensions.find(d => d.name === dimName);
            if (dim?.join) {
                const joinDef = model.joins?.find(j => j.name === dim.join);
                if (joinDef) {
                    if (!usedJoins.has(dim.join)) {
                        usedJoins.set(dim.join, joinDef);
                        joinTypes.set(dim.join, 'LEFT');
                    }
                }
            }
        });

        const mainDataset = this.registry.getDataset(model.model);
        const mainRelation = this.resolveRelation(model.model, mainDataset);
        const fromClause = `FROM ${mainRelation} AS ${model.alias || 't'}`;

        const joinClauses: string[] = [];
        usedJoins.forEach((join, joinName) => {
            const joinModel = this.registry.getModel(join.model);
            const joinDataset = this.registry.getDataset(joinModel?.model || join.model);
            const relation = this.resolveRelation(joinModel?.model || join.model, joinDataset);
            const type = joinTypes.get(joinName) || 'LEFT';
            joinClauses.push(`${type} JOIN ${relation} AS ${join.alias || join.name} ON ${join.on}`);
        });

        const whereClause = this.buildWhere(query.filters, model);

        return { fromClause, joinClauses, whereClause };
    }

    private resolveRelation(name: string, dataset?: import('./types').Dataset): string {
        if (dataset) {
            if (dataset.sources?.length) {
                const quoted = dataset.sources.map(s => {
                    const u = (s.startsWith('http') || s.startsWith('/')) ? s : `${this.baseUrl}${s}`;
                    return `'${u}'`;
                }).join(', ');
                return `read_parquet([${quoted}])`;
            }
            return dataset.relation || name;
        }
        return name;
    }

    buildPartitionedQuery(query: QueryIR, bucketConfig: { bucketCount: number, bucketKeys: string[], bucketIndex: number }): string {
        const model = this.registry.getModel(query.semanticModel);
        if (!model) throw new Error("Model not found");

        const keyExprs = bucketConfig.bucketKeys.map(k => {
            const d = model.dimensions.find(dm => dm.name === k);
            return d ? `CAST(${d.expr} AS VARCHAR)` : "''";
        });

        const concat = `concat_ws('||', ${keyExprs.join(', ')})`;
        const bucketExpr = `(hash(${concat}) % ${bucketConfig.bucketCount}) = ${bucketConfig.bucketIndex}`;

        return this.build(query, bucketExpr);
    }

    private buildFinalSelect(query: QueryIR, derivedMacros: Map<string, string>): string {
        const parts: string[] = [];
        query.dimensions.forEach(d => parts.push(`"${d}"`));
        query.measures.forEach(m => {
            if (derivedMacros.has(m)) {
                let expr = derivedMacros.get(m)!;
                expr = expr.replace(/\$\{([^}]+)\}/g, '"$1"');
                parts.push(`${expr} AS "${m}"`);
            } else {
                parts.push(`"${m}"`);
            }
        });
        return parts.join(', ');
    }


    private buildWhere(filters: FilterCnd[] | undefined, model: SemanticModel, extraWhere?: string): string {
        if ((!filters || filters.length === 0) && !extraWhere) return '';
        const conditions = filters ? this.buildConditions(filters, model) : [];
        if (extraWhere) conditions.push(extraWhere);
        return `WHERE ${conditions.join(' AND ')}`;
    }

    private buildGranularCondition(fieldExpr: string, operator: string, value: string, granularity: string): string {
        // Parse Value
        // Expected formats: YYYY (Year), YYYY-MM (Month/Quarter), YYYY-MM-DD (Day)
        const parts = value.split('-').map(Number);
        const year = parts[0];

        let startDate: string = '';
        let nextStart: string = '';

        if (granularity === 'year') {
            startDate = `${year}-01-01`;
            nextStart = `${year + 1}-01-01`;
        } else if (granularity === 'quarter') {
            const startMonth = parts[1];
            let nextMonthVal = startMonth + 3;
            let nextYear = year;

            if (nextMonthVal > 12) {
                nextMonthVal = 1;
                nextYear = year + 1;
            }

            const startMonthStr = String(startMonth).padStart(2, '0');
            const nextMonthStr = String(nextMonthVal).padStart(2, '0');

            startDate = `${year}-${startMonthStr}-01`;
            nextStart = `${nextYear}-${nextMonthStr}-01`;

        } else if (granularity === 'month') {
            const month = parts[1];
            let nextMonthVal = month + 1;
            let nextYear = year;

            if (nextMonthVal > 12) {
                nextMonthVal = 1;
                nextYear = year + 1;
            }

            const monthStr = String(month).padStart(2, '0');
            const nextMonthStr = String(nextMonthVal).padStart(2, '0');

            startDate = `${year}-${monthStr}-01`;
            nextStart = `${nextYear}-${nextMonthStr}-01`;
        } else {
            // Day or fallback
            return `${fieldExpr} ${operator} '${value}'`;
        }

        if (operator === '=') {
            return `(${fieldExpr} >= '${startDate}' AND ${fieldExpr} < '${nextStart}')`;
        } else if (operator === '!=') {
            return `(${fieldExpr} < '${startDate}' OR ${fieldExpr} >= '${nextStart}')`;
        } else if (operator === '>') {
            return `${fieldExpr} >= '${nextStart}'`;
        } else if (operator === '>=') {
            return `${fieldExpr} >= '${startDate}'`;
        } else if (operator === '<') {
            return `${fieldExpr} < '${startDate}'`;
        } else if (operator === '<=') {
            return `${fieldExpr} < '${nextStart}'`;
        }

        return `${fieldExpr} ${operator} '${value}'`;
    }

    private buildHaving(filters?: FilterCnd[]): string {
        if (!filters || filters.length === 0) return '';
        const conditions = this.buildConditions(filters);
        return `HAVING ${conditions.join(' AND ')}`;
    }

    private buildConditions(filters: FilterCnd[], model?: SemanticModel): string[] {
        return filters.map(f => {
            let fieldExpr = f.field;

            if (model) {
                const dim = model.dimensions.find(d => d.name === f.field);
                if (dim) fieldExpr = dim.expr;
            }

            if (f.operator === 'IN') {
                let values: unknown[] = [];
                if (Array.isArray(f.value)) {
                    values = f.value;
                } else if (typeof f.value === 'string') {
                    // Split by comma and trim
                    values = f.value.split(',').map(v => v.trim()).filter(v => v.length > 0);
                }

                if (values.length > 0) {
                    const quotedList = values.map((v: unknown) =>
                        typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v)
                    ).join(', ');
                    return `${fieldExpr} IN (${quotedList})`;
                } else {
                    // Empty IN usually results in false, or ignore. 
                    // Valid SQL for empty list is IN (NULL) or 1=0.
                    return '1=0';
                }
            }

            let val = f.value;

            // Granularity Handling
            if (f.granularity && f.granularity !== 'day' && typeof val === 'string') {
                return this.buildGranularCondition(fieldExpr, f.operator, val, f.granularity);
            }

            if (typeof val === 'string') {
                val = `'${val.replace(/'/g, "''")}'`;
            }
            return `${fieldExpr} ${f.operator} ${val}`;
        });
    }

    private buildOrderBy(orderBy?: OrderBy[]): string {
        if (!orderBy || orderBy.length === 0) return '';
        const parts = orderBy.map(o => `"${o.field}" ${o.direction.toUpperCase()}`);
        return `ORDER BY ${parts.join(', ')}`;
    }

    private emitAggregate(meas: Measure): string {
        let expr = meas.expr;

        const hasFunction = /^\w+\(.*\)$/.test(expr.trim());
        const isDerived = meas.type === 'derived';

        if (isDerived) return expr;

        if (!hasFunction) {
            const distinct = meas.agg_params?.distinct ? 'DISTINCT ' : '';

            switch (meas.type) {
                case 'sum': expr = `SUM(${distinct}${expr})`; break;
                case 'count_distinct': expr = `COUNT(DISTINCT ${expr})`; break;
                case 'count': expr = `COUNT(${distinct}${expr})`; break;
                case 'avg': expr = `AVG(${distinct}${expr})`; break;
                case 'min': expr = `MIN(${expr})`; break;
                case 'max': expr = `MAX(${expr})`; break;
                default: break;
            }
        }

        if (meas.agg_params?.where) {
            expr = `${expr} FILTER (WHERE ${meas.agg_params.where})`;
        }

        return expr;
    }

    private buildRawQuery(dataset: import('./types').Dataset, query: QueryIR, extraWhere?: string): string {
        let relation = dataset.relation || dataset.name;

        if (dataset.sources && dataset.sources.length > 0) {
            const quotedSources = dataset.sources.map(s => {
                const url = s.startsWith('http') || s.startsWith('/') ? s : `${this.baseUrl}${s}`;
                return `'${url}'`;
            }).join(', ');
            relation = `read_parquet([${quotedSources}])`;
        }

        const cols = query.columns && query.columns.length > 0
            ? query.columns.map(c => `"${c}"`).join(', ')
            : '*';

        const whereClause = this.buildRawWhere(query.filters, extraWhere);
        const limitClause = query.limit ? `LIMIT ${query.limit}` : '';

        return `SELECT ${cols}
FROM ${relation}
${whereClause}
${limitClause}`;
    }

    private buildRawWhere(filters: FilterCnd[] | undefined, extraWhere?: string): string {
        if ((!filters || filters.length === 0) && !extraWhere) return '';

        const conditions = filters ? filters.map(f => {
            let val = f.value;

            // Raw Granularity Handling (Assume raw columns are quoted fields)
            if (f.granularity && f.granularity !== 'day' && typeof val === 'string') {
                return this.buildGranularCondition(`"${f.field}"`, f.operator, val, f.granularity);
            }

            if (typeof val === 'string') {
                val = `'${val.replace(/'/g, "''")}'`;
            }
            return `"${f.field}" ${f.operator} ${val}`;
        }) : [];

        if (extraWhere) conditions.push(extraWhere);

        return `WHERE ${conditions.join(' AND ')}`;
    }
}

