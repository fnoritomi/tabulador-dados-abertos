import { useState, useEffect } from 'react';
import { fetchDatasetIndex, fetchDataset, type DatasetIndexItem, type Dataset } from '../lib/metadata';

export const useDataset = () => {
    const [datasets, setDatasets] = useState<DatasetIndexItem[]>([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
    const [activeDataset, setActiveDataset] = useState<Dataset | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    // Load Index
    useEffect(() => {
        const loadIndex = async () => {
            try {
                const index = await fetchDatasetIndex();
                setDatasets(index);
                if (index.length > 0) {
                    setSelectedDatasetId(index[0].id);
                }
            } catch (e) {
                console.error(e);
                setError('Erro ao carregar catálogo de datasets');
            }
        };
        loadIndex();
    }, []);

    // Load Active Dataset
    useEffect(() => {
        const loadActive = async () => {
            if (!selectedDatasetId) return;
            setLoading(true);
            const item = datasets.find(d => d.id === selectedDatasetId);
            if (!item) return;

            try {
                const ds = await fetchDataset(item.path);
                setActiveDataset(ds);
                setError(null);
            } catch (e) {
                console.error(e);
                setError(`Erro ao carregar detalhes do dataset ${item.name}`);
            } finally {
                setLoading(false);
            }
        };
        loadActive();
    }, [selectedDatasetId, datasets]);

    return {
        datasets,
        selectedDatasetId,
        setSelectedDatasetId,
        activeDataset,
        loading,
        error
    };
};
