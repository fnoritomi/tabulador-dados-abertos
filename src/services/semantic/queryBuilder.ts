import type { Dataset } from '../../lib/metadata';
import type { Filter, QueryState } from '../../types';

export const buildSql = (
    activeDataset: Dataset | null,
    queryState: QueryState,
    filters: Filter[],
    measureFilters: Filter[],
    ignoreLimit: boolean = false
): string => {
    if (!activeDataset) return '';
    const parquetUrl = activeDataset.sources[0];
    const { selectedColumns, selectedDimensions, selectedMeasures, limit } = queryState;

    // Helper to determine mode
    const isSemanticMode = selectedDimensions.length > 0 || selectedMeasures.length > 0;

    // Build Dimension WHERE clause (Applied Early)
    let whereClause = '';
    if (filters.length > 0) {
        const conditions = filters.map(f => {
            if (!f.value) return null;
            const colDef = activeDataset.schema.find(c => c.name === f.column);
            const isString = colDef?.type === 'VARCHAR' || colDef?.type === 'DATE';
            let val = f.value;
            if (f.operator === 'IN') {
                val = `(${f.value.split(',').map(v => isString ? `'${v.trim()}'` : v.trim()).join(', ')})`;
            } else if (isString) {
                val = `'${f.value}'`;
            }
            return `${f.column} ${f.operator} ${val}`;
        }).filter(Boolean);

        if (conditions.length > 0) {
            whereClause = `WHERE ${conditions.join(' AND ')}`;
        }
    }

    if (isSemanticMode) {
        // 1. Identify Measures
        // Include both selected measures AND measures used in filters
        const allMeasuresToCheck = new Set([...selectedMeasures, ...measureFilters.map(f => f.column)]);

        const semiAdditiveMeasures = Array.from(allMeasuresToCheck).filter(m => {
            const def = activeDataset.semantic?.measures.find(d => d.name === m);
            return !!def?.non_additive_dimension;
        });

        // Optimization: Check optimization for QUALIFY
        // Use QUALIFY if we have semi-additive measures. 
        // We previously disabled it if mixed, but user wants correct logic. 
        // Logic: QUALIFY if useful. 
        const hasAdditive = selectedMeasures.some(m => !semiAdditiveMeasures.includes(m));

        // 2. Build Layer 1: Source CTE (Window Functions)
        const windowSelects = semiAdditiveMeasures.map(m => {
            const def = activeDataset.semantic?.measures.find(d => d.name === m);
            if (!def?.non_additive_dimension) return null;

            const nad = def.non_additive_dimension;
            const winDim = nad.dimension_name;
            let partitionDims: string[] = [];
            if (nad.window_groupings?.all_additive_used) {
                partitionDims = selectedDimensions;
            } else if (nad.window_groupings?.dimensions) {
                partitionDims = nad.window_groupings.dimensions;
            }
            const partitionClause = partitionDims.length > 0 ? `PARTITION BY ${partitionDims.join(', ')}` : '';

            let orderClause = '';
            if (nad.window_choice === 'LAST_VALUE') orderClause = `ORDER BY ${winDim} DESC`;
            else if (nad.window_choice === 'FIRST_VALUE') orderClause = `ORDER BY ${winDim} ASC`;

            let func = 'FIRST_VALUE';
            if (nad.window_choice === 'MAX') func = 'MAX';
            if (nad.window_choice === 'MIN') func = 'MIN';

            return `${winDim} = ${func}(${winDim}) OVER (${partitionClause} ${orderClause}) AS ${m}_flag`;
        }).filter(Boolean);

        const cteSelects = ['*'].concat(windowSelects as string[]);

        let qualifyClause = '';
        if (!hasAdditive && semiAdditiveMeasures.length > 0) {
            const flags = semiAdditiveMeasures.map(m => `${m}_flag`);
            qualifyClause = `QUALIFY ${flags.join(' OR ')}`;
        }

        const sourceCteName = 'source_cte';
        const sourceCte = `
        ${sourceCteName} AS (
            SELECT ${cteSelects.join(', ')}
            FROM read_parquet('${parquetUrl}')
            ${whereClause}
            ${qualifyClause}
        )`;

        // 3. Build Layer 2: Aggregation CTE
        // Must calculate ALL measures needed (Displayed + Filtered)
        const allMeasuresToCalc = new Set([...selectedMeasures]);
        measureFilters.forEach(f => allMeasuresToCalc.add(f.column));

        const aggMeasures = Array.from(allMeasuresToCalc).map(m => {
            const def = activeDataset.semantic?.measures.find(d => d.name === m);
            let finalSql = m;

            if (def?.non_additive_dimension) {
                const simpleCol = def.sql.replace(/SUM\((.*)\)/i, '$1');
                finalSql = `SUM(CASE WHEN ${m}_flag THEN ${simpleCol} END)`;
            } else if (def) {
                finalSql = def.sql;
            }

            // Apply rounding if configured
            if (def?.display_decimals !== undefined) {
                finalSql = `ROUND(${finalSql}, ${def.display_decimals})`;
            }

            return `${finalSql} AS ${def?.name || m}`;
        });

        // Dimensions to select in aggregation (from `selectedDimensions`)
        // Ensure we handle aliases for dimensions if they have SQL definitions
        const aggDims = selectedDimensions.map(d => {
            const dimDef = activeDataset.semantic?.dimensions.find(def => def.name === d);
            return dimDef?.sql ? `${dimDef.sql} AS ${dimDef.name}` : d;
        });

        const aggSelects = [...aggDims, ...aggMeasures].join(', ');
        const aggGroupBy = aggDims.length > 0 ? `GROUP BY ALL` : '';

        const aggCteName = 'agregacao';
        const aggCte = `
        ${aggCteName} AS (
            SELECT ${aggSelects}
            FROM ${sourceCteName}
            ${aggGroupBy}
        )`;

        // 4. Build Layer 3: Final Query
        // Projection (only selected)
        const finalCols = [...selectedDimensions, ...selectedMeasures].join(', ');

        // Measure Filters -> WHERE
        let finalWhere = '';
        if (measureFilters.length > 0) {
            const conditions = measureFilters.map(f => {
                if (!f.value) return null;
                return `${f.column} ${f.operator} ${f.value}`;
            }).filter(Boolean);
            if (conditions.length > 0) finalWhere = `WHERE ${conditions.join(' AND ')}`;
        }

        const limitClause = ignoreLimit ? '' : `LIMIT ${limit}`;

        return `WITH ${sourceCte}, ${aggCte} SELECT ${finalCols} FROM ${aggCteName} ${finalWhere} ${limitClause}`;
    }

    // Raw Mode
    const activeCols = [...selectedColumns, ...selectedDimensions];
    const cols = activeCols.length > 0 ? activeCols.join(', ') : '*';
    const limitClause = ignoreLimit ? '' : `LIMIT ${limit}`;
    return `SELECT ${cols} FROM read_parquet('${parquetUrl}') ${whereClause} ${limitClause}`;
};
