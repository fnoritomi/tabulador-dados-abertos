import React, { useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';
import { DatePicker } from '../controls/DatePicker';
import type { Filter } from '../../types';

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (filter: Omit<Filter, 'id'>) => void;
    initialFilter?: Filter;
    options: { name: string; label?: string; groupLabel?: string; type?: string; granularities?: string[] }[];
    type: 'dimension' | 'measure';
    locale: string;
}

export const FilterModal: React.FC<FilterModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialFilter,
    options,
    type,
    locale
}) => {
    const [column, setColumn] = useState('');
    const [operator, setOperator] = useState('=');
    const [value, setValue] = useState('');
    const [granularity, setGranularity] = useState('day');
    const [error, setError] = useState<string | null>(null);

    // Helper to get type of selected column
    const getColumnType = (colName: string) => {
        const opt = options.find(o => o.name === colName);
        return opt?.type?.toLowerCase() || 'string';
    };

    const validate = (val: string, type: string): string | null => {
        if (!val) return null; // Allow empty for now, or handle required?

        // Date validation
        if (type === 'date' || type === 'timestamp' || type === 'time') {
            // Basic check if it's a valid date string YYYY-MM-DD
            const d = new Date(val);
            if (isNaN(d.getTime())) return 'Data inválida';
            return null;
        }

        // Number validation
        if (type === 'integer' || type === 'bigint') {
            if (!/^-?\d+$/.test(val)) return 'Valor deve ser um número inteiro';
            return null;
        }
        if (type === 'float' || type === 'double' || type === 'decimal' || type === 'number') {
            if (isNaN(Number(val))) return 'Valor deve ser um número';
            return null;
        }

        return null;
    };

    const getSelectedColumnOption = () => options.find(o => o.name === column);

    const colType = getColumnType(column);
    const inputType = (colType === 'date' || colType === 'timestamp' || colType === 'time') ? 'date'
        : (['integer', 'bigint', 'float', 'double', 'decimal', 'number'].includes(colType)) ? 'number'
            : 'text';

    // Helper to converting ISO string to Date for DatePicker
    const getDateValue = (): Date | null => {
        if (!value) return null;
        const parts = value.split('-');

        // Handle varying lengths based on granularity (approx)
        if (parts.length >= 1) {
            const y = parseInt(parts[0]);
            const m = parts.length >= 2 ? parseInt(parts[1]) - 1 : 0;
            const d = parts.length >= 3 ? parseInt(parts[2]) : 1;
            return new Date(y, m, d);
        }
        return null;
    };

    // Helper to convert Date back to ISO string
    const handleDateChange = (date: Date | null) => {
        if (!date) {
            setValue('');
            return;
        }
        // Format to YYYY-MM-DD or YYYY-MM or YYYY based on granularity
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');

        if (granularity === 'year') {
            setValue(`${y}`);
        } else if (granularity === 'month' || granularity === 'quarter') {
            setValue(`${y}-${m}`);
        } else {
            setValue(`${y}-${m}-${d}`);
        }
    };

    // Initialize state when modal opens or initialFilter changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        if (isOpen) {
            if (initialFilter) {
                setColumn(initialFilter.column);
                setOperator(initialFilter.operator);
                setValue(initialFilter.value);
                setGranularity(initialFilter.granularity || 'day');
            } else {
                // Default to first option
                const first = options[0];
                setColumn(first?.name || '');
                setOperator(type === 'dimension' ? '=' : '>');
                setValue('');

                // Initialize granularity based on first option
                if (first?.granularities && first.granularities.length > 0) {
                    setGranularity(first.granularities[0]);
                } else {
                    setGranularity('day');
                }
            }
        }
    }, [isOpen, initialFilter, options, type]); // options is dependency, assuming stable or memoized parent

    // Update granularity when column changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        // If we are editing (initialFilter present) AND the column is the same, keep existing granularity
        if (initialFilter && initialFilter.column === column) {
            return;
        }

        const option = options.find(o => o.name === column);
        if (option?.granularities && option.granularities.length > 0) {
            setGranularity(option.granularities[0]);
        } else {
            setGranularity('day');
        }
    }, [column, options, initialFilter]);

    // Update value format when granularity changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        if (!value) return;

        const colType = getColumnType(column);
        if (colType !== 'date' && colType !== 'timestamp' && colType !== 'time') return;

        // Parse current value
        let date: Date | null = null;
        const parts = value.split('-');
        if (parts.length >= 1) {
            const y = parseInt(parts[0]);
            const m = parts.length >= 2 ? parseInt(parts[1]) - 1 : 0;
            const d = parts.length >= 3 ? parseInt(parts[2]) : 1;
            date = new Date(y, m, d);
        }

        if (date && !isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');

            let newValue = value;
            if (granularity === 'year') {
                if (value.length !== 4) newValue = `${y}`;
            } else if (granularity === 'month' || granularity === 'quarter') {
                if (value.length !== 7) newValue = `${y}-${m}`;
            } else {
                if (value.length !== 10) newValue = `${y}-${m}-${d}`;
            }

            if (newValue !== value) {
                setValue(newValue);
            }
        }
    }, [granularity, value]);

    const handleSave = () => {
        if (!column) return;

        const colType = getColumnType(column);
        const validationError = validate(value, colType);
        if (validationError) {
            setError(validationError);
            return;
        }

        onSave({ column, operator, value, granularity });
        onClose();
    };

    // Reset error on change
    useEffect(() => {
        setError(null);
    }, [column, value]);



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
                    <label htmlFor="filter-column" style={{ fontWeight: 'bold' }}>Campo</label>
                    <select
                        id="filter-column"
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
                    <label htmlFor="filter-operator" style={{ fontWeight: 'bold' }}>Operador</label>
                    <select
                        id="filter-operator"
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                        style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    >
                        {type === 'dimension' ? (
                            inputType === 'date' ? (
                                <>
                                    <option value="=">em (=)</option>
                                    <option value="!=">não está em (!=)</option>
                                    <option value=">">após (&gt;)</option>
                                    <option value="<">antes de (&lt;)</option>
                                    <option value=">=">a partir de (&gt;=)</option>
                                    <option value="<=">até (&lt;=)</option>
                                </>
                            ) : (
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
                            )
                        ) : (
                            // Measures
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
                    <label htmlFor="filter-value" style={{ fontWeight: 'bold' }}>Valor</label>

                    {inputType === 'date' ? (
                        <>
                            {/* Granularity Selector */}
                            <div style={{ marginBottom: '5px' }}>
                                <label style={{ fontSize: '0.8em', color: 'var(--text-secondary)' }}>Granularidade</label>
                                <select
                                    value={granularity}
                                    onChange={(e) => setGranularity(e.target.value)}
                                    style={{ marginLeft: '10px', padding: '4px', borderRadius: '4px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                                >
                                    {getSelectedColumnOption()?.granularities ? (
                                        getSelectedColumnOption()!.granularities!.map(g => <option key={g} value={g}>{g}</option>)
                                    ) : (
                                        <>
                                            <option value="day">Day</option>
                                            <option value="month">Month</option>
                                            <option value="quarter">Quarter</option>
                                            <option value="year">Year</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            <DatePicker
                                value={getDateValue()}
                                onChange={handleDateChange}
                                locale={locale}
                                granularity={granularity as any}
                            />
                        </>
                    ) : (
                        <input
                            id="filter-value"
                            type={inputType}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={inputType === 'number' ? "Valor Numérico" : "Valor"}
                            style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: error ? '1px solid var(--color-error)' : '1px solid var(--border-color)', borderRadius: '4px' }}
                        />
                    )}

                    {error && <span style={{ color: 'var(--color-error)', fontSize: '0.8em', marginTop: '4px' }}>{error}</span>}
                </div>
            </div>
        </BaseModal>
    );
};
