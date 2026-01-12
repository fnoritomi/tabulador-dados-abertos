import React from 'react';
import type { DatasetIndexItem } from '../../lib/metadata';

interface DatasetSelectorProps {
    datasets: DatasetIndexItem[];
    selectedId: string;
    onSelect: (id: string) => void;
    loading?: boolean;
}

export const DatasetSelector: React.FC<DatasetSelectorProps> = ({ datasets, selectedId, onSelect, loading }) => {
    return (
        <div style={{ marginBottom: '20px' }}>
            <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Dataset:</label>
            <select
                value={selectedId}
                onChange={(e) => onSelect(e.target.value)}
                style={{ padding: '8px', fontSize: '16px', borderRadius: '4px' }}
                disabled={loading}
            >
                {!datasets.length && <option>Carregando...</option>}
                {datasets.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </select>
        </div>
    );
};
