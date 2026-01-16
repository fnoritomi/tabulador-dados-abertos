import { useState, useCallback } from 'react';
import type { Filter, QueryMode } from '../types';

export function useAppQueryState() {
    const [mode, setMode] = useState<QueryMode>('semantic');
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
    const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);
    const [limit, setLimit] = useState<number>(10000);
    const [filters, setFilters] = useState<Filter[]>([]);
    const [measureFilters, setMeasureFilters] = useState<Filter[]>([]);

    const reset = useCallback(() => {
        setSelectedColumns([]);
        setSelectedDimensions([]);
        setSelectedMeasures([]);
        setFilters([]);
        setMeasureFilters([]);
        setLimit(10000);
        // Mode persists or reset to default? Let's keep current mode or default to semantic.
        // If dataset changes, App logic typically resets everything. 
    }, []);

    const toggleColumn = useCallback((col: string) => {
        setSelectedColumns(prev => {
            const newState = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
            if (newState.length > 0) {
                setMode('dataset');
                setSelectedDimensions([]);
                setSelectedMeasures([]);
                setMeasureFilters([]);
            }
            return newState;
        });
    }, []);

    const toggleDimension = useCallback((dim: string) => {
        setSelectedDimensions(prev => {
            const newState = prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim];
            if (newState.length > 0) {
                setMode('semantic');
                setSelectedColumns([]);
            }
            return newState;
        });
    }, []);

    const setDimensions = useCallback((dims: string[]) => {
        setSelectedDimensions(dims);
        if (dims.length > 0) {
            setMode('semantic');
            setSelectedColumns([]);
        }
    }, []);

    const toggleMeasure = useCallback((meas: string) => {
        setSelectedMeasures(prev => {
            const newState = prev.includes(meas) ? prev.filter(m => m !== meas) : [...prev, meas];
            if (newState.length > 0) {
                setMode('semantic');
                setSelectedColumns([]);
            }
            return newState;
        });
    }, []);

    const addFilter = useCallback((input: string | { column: string, operator: string, value: string, granularity?: string }, type: 'dimension' | 'measure' = 'dimension') => {
        const column = typeof input === 'object' ? input.column : input;
        const operator = typeof input === 'object' ? input.operator : (type === 'measure' ? '>' : '=');
        const value = typeof input === 'object' ? input.value : '';
        const granularity = (typeof input === 'object' && 'granularity' in input) ? (input as any).granularity : undefined;

        const newFilter: Filter = {
            id: Date.now(),
            column,
            operator,
            value,
            granularity
        };

        if (type === 'measure') {
            setMeasureFilters(prev => [...prev, newFilter]);
        } else {
            setFilters(prev => [...prev, newFilter]);
        }
    }, []);

    const removeFilter = useCallback((id: number, type: 'dimension' | 'measure' = 'dimension') => {
        if (type === 'measure') {
            setMeasureFilters(prev => prev.filter(f => f.id !== id));
        } else {
            setFilters(prev => prev.filter(f => f.id !== id));
        }
    }, []);

    const updateFilter = useCallback((id: number, field: keyof Filter, value: string, type: 'dimension' | 'measure' = 'dimension') => {
        const updater = (prev: Filter[]) => prev.map(f => f.id === id ? { ...f, [field]: value } : f);
        if (type === 'measure') {
            setMeasureFilters(updater);
        } else {
            setFilters(updater);
        }
    }, []);

    return {
        state: {
            mode,
            selectedColumns,
            selectedDimensions,
            selectedMeasures,
            limit,
            filters,
            measureFilters,
            isSemanticMode: mode === 'semantic'
        },
        actions: {
            setMode,
            toggleColumn,
            toggleDimension,
            setDimensions,
            toggleMeasure,
            setLimit,
            addFilter,
            removeFilter,
            updateFilter,
            reset
        }
    };
}
