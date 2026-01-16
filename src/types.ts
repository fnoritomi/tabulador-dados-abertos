export interface Filter {
    id: number;
    column: string;
    operator: string;
    value: string;
    granularity?: string;
}

export type QueryMode = 'dataset' | 'semantic';

export interface QueryState {
    mode: QueryMode;
    selectedDatasetId: string;
    selectedColumns: string[];
    selectedDimensions: string[];
    selectedMeasures: string[];
    limit: number;
}
