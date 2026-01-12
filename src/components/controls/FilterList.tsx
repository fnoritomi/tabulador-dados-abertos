import React from 'react';
import type { Filter } from '../../types';

interface FilterListProps {
    title: string;
    filters: Filter[];
    options: { name: string; label?: string }[];
    onAdd: () => void;
    onRemove: (id: number) => void;
    onUpdate: (id: number, field: keyof Filter, value: string) => void;
    type: 'dimension' | 'measure';
    color: string;
    bgColor: string;
}

export const FilterList: React.FC<FilterListProps> = ({
    title, filters, options, onAdd, onRemove, onUpdate, type, color, bgColor
}) => {
    return (
        <div style={{ marginBottom: '20px', padding: '10px', border: `1px solid ${color}`, borderRadius: '4px', background: bgColor }}>
            <h3 style={{ marginTop: 0, color: color }}>{title}</h3>
            {filters.map(filter => (
                <div key={filter.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                    <select
                        value={filter.column}
                        onChange={(e) => onUpdate(filter.id, 'column', e.target.value)}
                        style={{ padding: '5px' }}
                    >
                        {options.map(opt => (
                            <option key={opt.name} value={opt.name}>{opt.label || opt.name}</option>
                        ))}
                    </select>
                    <select
                        value={filter.operator}
                        onChange={(e) => onUpdate(filter.id, 'operator', e.target.value)}
                        style={{ padding: '5px' }}
                    >
                        {type === 'dimension' ? (
                            <>
                                <option value="=">=</option>
                                <option value="!=">!=</option>
                                <option value=">">&gt;</option>
                                <option value="<">&lt;</option>
                                <option value=">=">&gt;=</option>
                                <option value="<=">&lt;=</option>
                                <option value="LIKE">LIKE (Contém)</option>
                                <option value="IN">IN (Lista)</option>
                            </>
                        ) : (
                            <>
                                <option value=">">&gt;</option>
                                <option value="<">&lt;</option>
                                <option value=">=">&gt;=</option>
                                <option value="<=">&lt;=</option>
                                <option value="=">=</option>
                                <option value="!=">!=</option>
                            </>
                        )}
                    </select>
                    <input
                        type={type === 'measure' ? "number" : "text"}
                        value={filter.value}
                        onChange={(e) => onUpdate(filter.id, 'value', e.target.value)}
                        placeholder={type === 'measure' ? "Valor Numérico" : "Valor"}
                        style={{ padding: '5px' }}
                    />
                    <button onClick={() => onRemove(filter.id)} style={{ color: 'red', cursor: 'pointer' }}>X</button>
                </div>
            ))}
            <button onClick={onAdd} style={{ fontSize: '0.9em' }}>+ Adicionar Filtro</button>
        </div>
    );
};
