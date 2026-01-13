import { useState, useCallback } from 'react';
import type { Filter } from '../types';

export function useAppQueryState() {
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
    const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);
    const [limit, setLimit] = useState<number>(10000);
    const [filters, setFilters] = useState<Filter[]>([]);
    const [measureFilters, setMeasureFilters] = useState<Filter[]>([]);

    const isSemanticMode = selectedDimensions.length > 0 || selectedMeasures.length > 0;

    const reset = useCallback(() => {
        setSelectedColumns([]);
        setSelectedDimensions([]);
        setSelectedMeasures([]);
        setFilters([]);
        setMeasureFilters([]);
        setLimit(10000);
    }, []);

    const toggleColumn = useCallback((col: string) => {
        setSelectedColumns(prev => {
            const newState = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
            // If we select a raw column, clear semantic selections
            if (newState.length > 0) {
                setSelectedDimensions([]);
                setSelectedMeasures([]);
                setMeasureFilters([]); // Measure filters only make sense in semantic mode
            }
            return newState;
        });
    }, []);

    const toggleDimension = useCallback((dim: string) => {
        setSelectedDimensions(prev => {
            const newState = prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim];
            // If we select a dimension, clear raw columns
            if (newState.length > 0) {
                setSelectedColumns([]);
            }
            return newState;
        });
    }, []);

    const toggleMeasure = useCallback((meas: string) => {
        setSelectedMeasures(prev => {
            const newState = prev.includes(meas) ? prev.filter(m => m !== meas) : [...prev, meas];
            // If we select a measure, clear raw columns
            if (newState.length > 0) {
                setSelectedColumns([]);
            }
            return newState;
        });
    }, []);

    const addFilter = useCallback((initialColumn: string, type: 'dimension' | 'measure' = 'dimension') => {
        const newFilter: Filter = {
            id: Date.now(),
            column: initialColumn,
            operator: type === 'measure' ? '>' : '=',
            value: ''
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
            selectedColumns,
            selectedDimensions,
            selectedMeasures,
            limit,
            filters,
            measureFilters,
            isSemanticMode
        },
        actions: {
            toggleColumn,
            toggleDimension,
            toggleMeasure,
            setLimit,
            addFilter,
            removeFilter,
            updateFilter,
            reset
        }
    };
}
