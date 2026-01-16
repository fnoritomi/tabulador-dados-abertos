import React, { useState } from 'react';
import type { Filter } from '../../types';
import { FilterModal } from '../modals/FilterModal';

interface FilterListProps {
    title: string;
    filters: Filter[];
    options: { name: string; label?: string; groupLabel?: string }[];
    onAdd: (filter?: { column: string, operator: string, value: string }) => void;
    onRemove: (id: number) => void;
    onUpdate: (id: number, field: keyof Filter, value: string) => void;
    type: 'dimension' | 'measure';
    color: string;
    bgColor: string;
}

export const FilterList: React.FC<FilterListProps> = ({
    title, filters, options, onAdd, onRemove, onUpdate, type, color, bgColor
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFilter, setEditingFilter] = useState<Filter | undefined>(undefined);

    const toggleList = () => setIsExpanded(prev => !prev);

    const handleOpenAdd = () => {
        setEditingFilter(undefined);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (filter: Filter) => {
        setEditingFilter(filter);
        setIsModalOpen(true);
    };

    const handleSave = (filterData: Omit<Filter, 'id'>) => {
        if (editingFilter) {
            // Update existing
            if (editingFilter.column !== filterData.column) onUpdate(editingFilter.id, 'column', filterData.column);
            if (editingFilter.operator !== filterData.operator) onUpdate(editingFilter.id, 'operator', filterData.operator);
            if (editingFilter.value !== filterData.value) onUpdate(editingFilter.id, 'value', filterData.value);
        } else {
            // Add new
            onAdd(filterData);
        }
    };

    // Helper to get label
    const getLabel = (name: string) => {
        const opt = options.find(o => o.name === name);
        return opt?.label || name;
    };

    return (
        <div style={{ marginBottom: '20px', padding: '10px', border: `1px solid var(--border-color)`, borderRadius: '4px', background: bgColor }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: filters.length > 0 || isExpanded ? '10px' : '0' }}>
                <h3 style={{ margin: 0, color: color, cursor: 'pointer', userSelect: 'none' }} onClick={toggleList}>{title}</h3>
                <button
                    onClick={toggleList}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        color: 'var(--text-secondary)',
                        padding: '0 5px',
                        fontSize: '1.2em',
                        marginLeft: '5px'
                    }}
                    type="button"
                    title={isExpanded ? "Ocultar Filtros" : "Exibir Filtros"}
                >
                    {isExpanded ? '-' : '+'}
                </button>
            </div>

            {isExpanded && (
                <>
                    {filters.length === 0 && (
                        <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '10px', fontSize: '0.9em' }}>
                            Nenhum filtro definido.
                        </div>
                    )}

                    {filters.map(filter => (
                        <div key={filter.id} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px',
                            padding: '8px',
                            background: 'var(--bg-input)', // Slightly distinct background
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ fontSize: '0.9em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <strong>{getLabel(filter.column)}</strong> <span style={{ color: 'var(--primary-color)' }}>{filter.operator}</span> {filter.value}
                            </div>

                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button
                                    onClick={() => handleOpenEdit(filter)}
                                    title="Editar"
                                    style={{
                                        cursor: 'pointer',
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '1.1em'
                                    }}
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={() => onRemove(filter.id)}
                                    title="Excluir"
                                    style={{
                                        cursor: 'pointer',
                                        background: 'none',
                                        border: 'none',
                                        color: 'red',
                                        fontSize: '1.1em'
                                    }}
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={handleOpenAdd}
                        style={{
                            fontSize: '0.9em',
                            borderColor: 'var(--border-color)',
                            width: '100%',
                            padding: '8px',
                            cursor: 'pointer',
                            background: 'var(--bg-panel-secondary)',
                            color: 'var(--text-main)',
                            border: '1px dashed var(--border-color)',
                            borderRadius: '4px'
                        }}
                    >
                        + Adicionar Filtro
                    </button>
                </>
            )}

            <FilterModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialFilter={editingFilter}
                options={options}
                type={type}
            />
        </div>
    );
};
