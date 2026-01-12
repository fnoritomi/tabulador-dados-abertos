export interface Filter {
    id: number;
    column: string;
    operator: string;
    value: string;
}

export interface QueryState {
    selectedDatasetId: string;
    selectedColumns: string[];
    selectedDimensions: string[];
    selectedMeasures: string[];
    limit: number;
}
