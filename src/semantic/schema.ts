import { z } from 'zod';

export const DataTypeSchema = z.enum(['string', 'integer', 'double', 'boolean', 'date', 'timestamp']);
export const TimeGranularitySchema = z.enum(['day', 'month', 'year', 'quarter', 'week']);

const NumberFormatSchema = z.object({
    use_grouping: z.boolean().optional(),
    decimals: z.number().optional(),
    notation: z.enum(['standard', 'compact', 'scientific', 'engineering']).optional(),
    currency: z.string().nullable().optional(),
    percent: z.boolean().optional(),
});

const DateFormatSchema = z.object({
    pattern: z.string().optional(),
    time_pattern: z.string().optional(),
    default_granularity: TimeGranularitySchema.optional(),
});

const FormatSchema = z.object({
    date: DateFormatSchema.optional(),
    number: NumberFormatSchema.optional(),
});

// --- Defaults ---
export const LocaleConfigSchema = z.object({
    code: z.string(),
    currency: z.string().optional(),
    csv: z.object({
        separator: z.string(),
        encoding: z.string()
    }).optional()
});

export const SystemConfigSchema = z.object({
    version: z.number().optional(),
    defaults: z.object({
        locale: z.string().optional(),
        timezone: z.string().optional(),
        number_format: NumberFormatSchema.optional(),
        date_format: DateFormatSchema.optional()
    }).optional(),
    locales: z.array(LocaleConfigSchema).optional(),
    overrides: z.object({
        number_format: NumberFormatSchema.optional(),
        date_format: DateFormatSchema.optional()
    }).optional()
});

// --- Dataset ---
const DatasetColumnSchema = z.object({
    name: z.string(),
    type: DataTypeSchema,
});

export const DatasetSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    relation: z.string().optional(),
    sources: z.array(z.string()).optional(),
    primary_key: z.array(z.string()).optional(),
    columns: z.array(DatasetColumnSchema).optional().default([]),
});

export const DatasetsFileSchema = z.object({
    version: z.number().optional(),
    datasets: z.array(DatasetSchema)
});

// --- Semantic Model ---
const JoinSchema = z.object({
    name: z.string(),
    model: z.string(),
    alias: z.string().optional(),
    on: z.string(),
    relationship: z.enum(['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many']).optional().default('many_to_one'),
});

const DimensionSchema = z.object({
    name: z.string(),
    type: z.enum(['categorical', 'time', 'numerical']),
    expr: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    is_partition: z.boolean().optional(),
    format: FormatSchema.optional(),
    type_params: z.object({
        time_granularity: TimeGranularitySchema.optional(),
        available_granularities: z.array(TimeGranularitySchema).optional(),
    }).optional(),
    join: z.string().optional(),
    group: z.string().optional(),
});

const MeasureSchema = z.object({
    name: z.string(),
    type: z.enum(['sum', 'count', 'count_distinct', 'avg', 'min', 'max', 'derived']),
    expr: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    format: FormatSchema.optional(),
    agg_params: z.object({
        distinct: z.boolean().optional(),
        where: z.string().optional(),
    }).optional(),
    non_additive_dimension: z.object({
        name: z.string(),
        window_choice: z.enum(['max', 'min', 'first', 'last']),
        window_groupings: z.array(z.string()).optional()
    }).optional()
});

export const SemanticModelSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    model: z.string(),
    alias: z.string().optional(),
    grain: z.array(z.string()).optional(),
    joins: z.array(JoinSchema).optional(),
    dimensions: z.array(DimensionSchema),
    measures: z.array(MeasureSchema),
    tags: z.array(z.string()).optional(),
    high_cardinality: z.union([
        z.boolean(),
        z.object({
            enabled: z.boolean().optional(),
            target_per_bucket: z.number().optional(),
            threshold: z.number().optional(),
            limit_multiplier: z.number().optional()
        })
    ]).optional(),
});

export const SemanticModelsFileSchema = z.object({
    version: z.number().optional(),
    semantic_models: z.array(SemanticModelSchema)
});

// --- Manifest ---
const ManifestItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    path: z.string(),
});

export const MetadataManifestSchema = z.object({
    datasets: z.array(ManifestItemSchema),
    semantic_models: z.array(ManifestItemSchema),
});
