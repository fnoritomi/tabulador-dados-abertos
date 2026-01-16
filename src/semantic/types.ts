export type DataType = 'string' | 'integer' | 'double' | 'boolean' | 'date' | 'timestamp';
export type TimeGranularity = 'day' | 'month' | 'year' | 'quarter' | 'week';

export interface DateFormatConfig {
    pattern?: string;
    time_pattern?: string;
    default_granularity?: TimeGranularity;
}

export interface NumberFormatConfig {
    use_grouping?: boolean;
    decimals?: number;
    notation?: 'standard' | 'compact' | 'scientific' | 'engineering';
    currency?: string; // ISO code e.g. BRL
    percent?: boolean;
}

export interface FormatConfig {
    date?: DateFormatConfig;
    number?: NumberFormatConfig;
}

// --- Defaults ---
export interface ManifestItem {
    id: string;
    name: string;
    description?: string;
    path: string;
}

export interface MetadataManifest {
    datasets: ManifestItem[];
    semantic_models: ManifestItem[];
}

export interface SystemConfig {
    version?: number;
    defaults?: {
        locale?: string;
        timezone?: string;
        number_format?: FormatConfig['number'];
        date_format?: FormatConfig['date'];
    };
    locales?: Array<{
        code: string;
        currency?: string;
        csv?: {
            separator: string;
            encoding: string;
        };
    }>;
    overrides?: {
        number_format?: FormatConfig['number'];
        date_format?: FormatConfig['date'];
    };
}

// --- Dataset ---
export interface DatasetColumn {
    name: string;
    type: DataType;
}

export interface Dataset {
    name: string;
    description?: string;
    relation?: string; // DuckDB table/view name (optional if sources provided)
    sources?: string[]; // List of file paths (e.g. parquet)
    primary_key?: string[];
    columns: DatasetColumn[];
}

// --- Semantic Model ---
export interface Join {
    name: string;
    model: string;
    alias?: string;
    on: string;
    relationship?: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
}

export interface Dimension {
    name: string;
    type: 'categorical' | 'time' | 'numerical';
    expr: string;
    label?: string;
    description?: string;
    is_partition?: boolean;
    format?: FormatConfig;
    type_params?: {
        time_granularity?: TimeGranularity;
        available_granularities?: TimeGranularity[];
    };
    join?: string; // Reference to a join name
    group?: string;
}

export interface Measure {
    name: string;
    type: 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max' | 'derived';
    expr: string;
    label?: string;
    description?: string;
    format?: FormatConfig;
    agg_params?: {
        distinct?: boolean;
        where?: string; // SQL Filter condition
    };
    non_additive_dimension?: {
        name: string; // Dimension name (e.g. 'competencia')
        window_choice: 'max' | 'min' | 'first' | 'last';
        window_groupings?: string[]; // Dimensions to group by for the window
    };
}

export interface SemanticModel {
    name: string;
    description?: string;
    model: string; // Physical relation (source)
    alias?: string;
    grain?: string[];
    joins?: Join[];
    dimensions: Dimension[];
    measures: Measure[];
    tags?: string[];
    high_cardinality?: boolean | {
        enabled?: boolean;
        target_per_bucket?: number;
        threshold?: number;
        limit_multiplier?: number;
    };
}

// --- Query IR ---
// Intermediate Representation independent of SQL dialect
export interface QueryIR {
    mode?: 'dataset' | 'semantic'; // Explicit mode to resolve ID collisions
    semanticModel: string;
    columns?: string[]; // Raw columns for dataset mode
    dimensions: string[]; // Names of dimensions
    measures: string[];   // Names of measures
    filters?: FilterCnd[];
    measureFilters?: FilterCnd[]; // HAVING
    orderBy?: OrderBy[];
    limit?: number;
    offset?: number;
    timeGranularity?: Record<string, TimeGranularity>; // dimName -> granularity
}

export interface FilterCnd {
    field: string;
    operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'LIKE';
    value: any;
}

export interface OrderBy {
    field: string;
    direction: 'asc' | 'desc';
}
