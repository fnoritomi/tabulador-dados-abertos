export interface DatasetIndexItem {
    id: string;
    name: string;
    path: string;
}

export interface Dimension {
    name: string;
    type: string;
    label?: string;
    sql?: string;
}

export type WindowChoice = 'LAST_VALUE' | 'FIRST_VALUE' | 'MAX' | 'MIN';

export interface NonAdditiveDimension {
    dimension_name: string;
    window_choice: WindowChoice;
    window_groupings?: {
        dimensions?: string[];
        all_additive_used?: boolean;
    };
}

export interface Measure {
    name: string;
    sql: string;
    label?: string;
    display_decimals?: number;
    non_additive_dimension?: NonAdditiveDimension;
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

const resolveSourceUrl = (path: string): string => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${window.location.origin}/data/${cleanPath}`;
};

export const fetchDataset = async (path: string): Promise<Dataset> => {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to fetch dataset metadata from ${path}`);
    }
    const dataset = await response.json();
    return {
        ...dataset,
        sources: dataset.sources.map(resolveSourceUrl)
    };
};
