import React from 'react';
import type { QueryMode } from '../../types';

export interface SelectorItem {
    id: string;
    name: string;
}

interface DatasetSelectorProps {
    mode: QueryMode;
    onModeChange: (mode: QueryMode) => void;
    items: SelectorItem[];
    selectedId: string;
    onSelect: (id: string) => void;
    loading?: boolean;
}

export const DatasetSelector: React.FC<DatasetSelectorProps> = ({
    mode,
    onModeChange,
    items,
    selectedId,
    onSelect,
    loading
}) => {
    return (
        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
                <button
                    onClick={() => onModeChange('dataset')}
                    style={{
                        fontWeight: mode === 'dataset' ? 'bold' : 'normal',
                        backgroundColor: mode === 'dataset' ? '#eee' : 'transparent',
                        border: '1px solid #ccc',
                        padding: '5px 10px',
                        cursor: 'pointer'
                    }}
                >
                    Datasets (Raw)
                </button>
                <button
                    onClick={() => onModeChange('semantic')}
                    style={{
                        fontWeight: mode === 'semantic' ? 'bold' : 'normal',
                        backgroundColor: mode === 'semantic' ? '#eee' : 'transparent',
                        border: '1px solid #ccc',
                        padding: '5px 10px',
                        cursor: 'pointer'
                    }}
                >
                    Semantic Models
                </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
                <label style={{ marginRight: '10px', fontWeight: 'bold' }}>
                    {mode === 'dataset' ? 'Dataset:' : 'Model:'}
                </label>
                <select
                    value={selectedId}
                    onChange={(e) => onSelect(e.target.value)}
                    style={{ padding: '8px', fontSize: '16px', borderRadius: '4px', flex: 1 }}
                    disabled={loading}
                >
                    {!items.length && <option>Carregando...</option>}
                    {items.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};
