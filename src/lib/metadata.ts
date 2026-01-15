export interface DatasetIndexItem {
    id: string;
    name: string;
    path: string;
}

export type DataType = 'VARCHAR' | 'INTEGER' | 'FLOAT' | 'DATE' | 'TIMESTAMP' | 'BOOLEAN';

export interface Attribute {
    name: string;
    type: DataType;
    label: string;
    sql: string;
    description?: string;
}

export interface Dimension {
    name: string;
    label: string;
    description?: string;
    type?: string; // semantic type (e.g. 'geo', 'time') - optional

    // Simple Dimension (Leaf) properties
    dataType?: DataType;
    sql?: string;

    // Composite Dimension (Node) properties
    attributes?: Attribute[];
    subDimensions?: Dimension[];
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
    const baseUrl = import.meta.env.BASE_URL;
    const response = await fetch(`${baseUrl}metadata/datasets/index.json`);
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
    const baseUrl = import.meta.env.BASE_URL;
    return `${window.location.origin}${baseUrl}data/${cleanPath}`;
};

export const fetchDataset = async (path: string): Promise<Dataset> => {
    // If path is relative (starts with / or no slash), prepend base url
    let url = path;
    if (!path.startsWith('http') && !path.startsWith(import.meta.env.BASE_URL)) {
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        url = `${import.meta.env.BASE_URL}${cleanPath}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch dataset metadata from ${path}`);
    }
    const dataset = await response.json();
    return {
        ...dataset,
        sources: dataset.sources.map(resolveSourceUrl)
    };
};
