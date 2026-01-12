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

    // Build WHERE clause
    let whereClause = '';
    if (filters.length > 0) {
        const conditions = filters.map(f => {
            if (!f.value) return null;

            // Simple type check to quote strings/dates
            const colDef = activeDataset.schema.find(c => c.name === f.column);
            const isString = colDef?.type === 'VARCHAR' || colDef?.type === 'DATE';

            let val = f.value;
            if (f.operator === 'IN') {
                // Handle comma separated list
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
        // Separete measures
        const semiAdditiveMeasures = measureFilters.length > 0
            ? []
            : selectedMeasures.filter(m => {
                const def = activeDataset.semantic?.measures.find(d => d.name === m);
                return !!def?.non_additive_dimension;
            });

        // Use simple path if no semi-additive
        if (semiAdditiveMeasures.length === 0) {
            const selectDims = selectedDimensions.map(d => {
                const dimDef = activeDataset.semantic?.dimensions.find(def => def.name === d);
                return dimDef?.sql ? `${dimDef.sql} AS ${dimDef.name}` : d;
            }).join(', ');

            const selectMeas = selectedMeasures.map(m => {
                const measureDef = activeDataset.semantic?.measures.find(def => def.name === m);
                return measureDef ? `${measureDef.sql} AS ${measureDef.name}` : m;
            }).join(', ');

            const selectClause = [selectDims, selectMeas].filter(Boolean).join(', ');

            const groupByClause = selectedDimensions.length > 0
                ? `GROUP BY ${selectedDimensions.map((_, i) => i + 1).join(', ')}`
                : '';

            // Build HAVING clause
            let havingClause = '';
            if (measureFilters.length > 0) {
                const conditions = measureFilters.map(f => {
                    if (!f.value) return null;
                    const measureDef = activeDataset.semantic?.measures.find(m => m.name === f.column);
                    const expression = measureDef ? measureDef.sql : f.column;
                    return `${expression} ${f.operator} ${f.value}`;
                }).filter(Boolean);
                if (conditions.length > 0) havingClause = `HAVING ${conditions.join(' AND ')}`;
            }

            const limitClause = ignoreLimit ? '' : `LIMIT ${limit}`;
            return `SELECT ${selectClause || '*'} FROM read_parquet('${parquetUrl}') ${whereClause} ${groupByClause} ${havingClause} ${limitClause}`;
        }

        // SEMI-ADDITIVE LOGIC
        // 1. Build CTE with Window Functions

        const windowSelects = semiAdditiveMeasures.map(m => {
            const def = activeDataset.semantic?.measures.find(d => d.name === m);
            if (!def?.non_additive_dimension) return null;

            const nad = def.non_additive_dimension;
            const winDim = nad.dimension_name;
            // Partitioning
            let partitionDims: string[] = [];
            if (nad.window_groupings?.all_additive_used) {
                // Use all selected dimensions as partition
                partitionDims = selectedDimensions;
            } else if (nad.window_groupings?.dimensions) {
                partitionDims = nad.window_groupings.dimensions;
            }

            const partitionClause = partitionDims.length > 0 ? `PARTITION BY ${partitionDims.join(', ')}` : '';

            // Order
            let orderClause = '';
            if (nad.window_choice === 'LAST_VALUE') {
                orderClause = `ORDER BY ${winDim} DESC`;
            } else if (nad.window_choice === 'FIRST_VALUE') {
                orderClause = `ORDER BY ${winDim} ASC`;
            }

            let func = 'FIRST_VALUE';
            if (nad.window_choice === 'MAX') func = 'MAX';
            if (nad.window_choice === 'MIN') func = 'MIN';

            return `${winDim} = ${func}(${winDim}) OVER (${partitionClause} ${orderClause}) AS ${m}_flag`;
        }).filter(Boolean);

        const cteSelects = ['*'].concat(windowSelects as string[]);

        // Optimize: QUALIFY if ONLY semi-additive measures
        const hasAdditive = selectedMeasures.some(m => !semiAdditiveMeasures.includes(m));

        let qualifyClause = '';
        if (!hasAdditive && semiAdditiveMeasures.length > 0) {
            const flags = semiAdditiveMeasures.map(m => `${m}_flag`);
            qualifyClause = `QUALIFY ${flags.join(' OR ')}`;
        }

        const cte = `
        WITH filtro_nao_aditivo AS (
            SELECT ${cteSelects.join(', ')}
            FROM read_parquet('${parquetUrl}')
            ${whereClause}
            ${qualifyClause}
        )`;

        // 2. Main Select
        const outerDims = selectedDimensions; // Just names now

        const outerMeasures = selectedMeasures.map(m => {
            const def = activeDataset.semantic?.measures.find(d => d.name === m);
            if (def?.non_additive_dimension) {
                const simpleCol = def.sql.replace(/SUM\((.*)\)/i, '$1');
                return `SUM(CASE WHEN ${m}_flag THEN ${simpleCol} END) AS ${def.name}`;
            } else {
                return def ? `${def.sql} AS ${def.name}` : m;
            }
        });

        const outerSelect = [...outerDims, ...outerMeasures].join(', ');
        const outerGroupBy = outerDims.length > 0 ? `GROUP BY ALL` : '';
        const limitClause = ignoreLimit ? '' : `LIMIT ${limit}`;

        return `${cte} SELECT ${outerSelect} FROM filtro_nao_aditivo ${outerGroupBy} ${limitClause}`;
    }

    // Raw Mode
    const activeCols = [...selectedColumns, ...selectedDimensions];
    const cols = activeCols.length > 0 ? activeCols.join(', ') : '*';
    const limitClause = ignoreLimit ? '' : `LIMIT ${limit}`;
    return `SELECT ${cols} FROM read_parquet('${parquetUrl}') ${whereClause} ${limitClause}`;
};
