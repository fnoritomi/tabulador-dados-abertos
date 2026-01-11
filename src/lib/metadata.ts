export interface DatasetIndexItem {
    id: string;
    name: string;
    path: string;
}

export interface Dimension {
    name: string;
    type: string;
    label?: string;
}

export interface Measure {
    name: string;
    sql: string;
    label?: string;
}

export interface SemanticLayer {
    dimensions: Dimension[];
    measures: Measure[];
}

export interface Dataset {
    id: string;
    name: string;
    sources: string[];
    schema: { name: string; type: string }[];
    semantic?: SemanticLayer;
}

export const fetchDatasetIndex = async (): Promise<DatasetIndexItem[]> => {
    const response = await fetch('/metadata/datasets/index.json');
    if (!response.ok) {
        throw new Error('Failed to fetch dataset index');
    }
    return response.json();
};

export const fetchDataset = async (path: string): Promise<Dataset> => {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to fetch dataset metadata from ${path}`);
    }
    return response.json();
};
