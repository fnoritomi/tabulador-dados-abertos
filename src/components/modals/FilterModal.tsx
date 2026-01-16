import React, { useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';
import type { Filter } from '../../types';

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (filter: Omit<Filter, 'id'>) => void;
    initialFilter?: Filter;
    options: { name: string; label?: string; groupLabel?: string }[];
    type: 'dimension' | 'measure';
}

export const FilterModal: React.FC<FilterModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialFilter,
    options,
    type
}) => {
    const [column, setColumn] = useState('');
    const [operator, setOperator] = useState('=');
    const [value, setValue] = useState('');

    // Initialize state when modal opens or initialFilter changes
    useEffect(() => {
        if (isOpen) {
            if (initialFilter) {
                setColumn(initialFilter.column);
                setOperator(initialFilter.operator);
                setValue(initialFilter.value);
            } else {
                // Default to first option
                setColumn(options[0]?.name || '');
                setOperator(type === 'dimension' ? '=' : '>');
                setValue('');
            }
        }
    }, [isOpen, initialFilter, options, type]);

    const handleSave = () => {
        if (!column) return;
        onSave({ column, operator, value });
        onClose();
    };

    // Group options logic
    const groupedOptions = options.reduce((acc, opt) => {
        const group = opt.groupLabel || 'Outros';
        if (!acc[group]) acc[group] = [];
        acc[group].push(opt);
        return acc;
    }, {} as Record<string, typeof options>);

    const hasGroups = options.some(o => o.groupLabel);

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={initialFilter ? 'Editar Filtro' : 'Adicionar Filtro'}
            width="500px"
            footer={
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} style={{ padding: '8px 16px', background: 'var(--primary-color)', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>Salvar</button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* Field Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontWeight: 'bold' }}>Campo</label>
                    <select
                        value={column}
                        onChange={(e) => setColumn(e.target.value)}
                        style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    >
                        {hasGroups ? (
                            Object.entries(groupedOptions).map(([group, opts]) => {
                                if (group === 'Outros') {
                                    return opts.map(opt => (
                                        <option key={opt.name} value={opt.name}>{opt.label || opt.name}</option>
                                    ));
                                }
                                return (
                                    <optgroup key={group} label={group}>
                                        {opts.map(opt => (
                                            <option key={opt.name} value={opt.name}>{opt.label || opt.name}</option>
                                        ))}
                                    </optgroup>
                                );
                            })
                        ) : (
                            options.map(opt => (
                                <option key={opt.name} value={opt.name}>{opt.label || opt.name}</option>
                            ))
                        )}
                    </select>
                </div>

                {/* Operator Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontWeight: 'bold' }}>Operador</label>
                    <select
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                        style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
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
                </div>

                {/* Value Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontWeight: 'bold' }}>Valor</label>
                    <input
                        type={type === 'measure' ? "number" : "text"}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={type === 'measure' ? "Valor Numérico" : "Valor"}
                        style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    />
                </div>
            </div>
        </BaseModal>
    );
};
