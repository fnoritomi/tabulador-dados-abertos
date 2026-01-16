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
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Modo:</label>
                <select
                    value={mode}
                    onChange={(e) => onModeChange(e.target.value as QueryMode)}
                    style={{ padding: '8px', fontSize: '16px', borderRadius: '4px', flex: 1, width: '100%', maxWidth: '100%' }}
                >
                    <option value="dataset">Datasets (Raw)</option>
                    <option value="semantic">Modelos Semânticos</option>
                </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
                <label style={{ marginRight: '10px', fontWeight: 'bold' }}>
                    {mode === 'dataset' ? 'Dataset:' : 'Model:'}
                </label>
                <select
                    value={selectedId}
                    onChange={(e) => onSelect(e.target.value)}
                    style={{ padding: '8px', fontSize: '16px', borderRadius: '4px', flex: 1, width: '100%', maxWidth: '100%' }}
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
