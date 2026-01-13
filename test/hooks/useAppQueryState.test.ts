import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppQueryState } from '../../src/hooks/useAppQueryState';

describe('useAppQueryState', () => {
    it('should initialize with default values', () => {
        const { result } = renderHook(() => useAppQueryState());
        expect(result.current.state.selectedColumns).toEqual([]);
        expect(result.current.state.limit).toBe(10000);
        expect(result.current.state.isSemanticMode).toBe(false);
    });

    it('should toggle columns and clear dimensions/measures', () => {
        const { result } = renderHook(() => useAppQueryState());

        // Select a dimension first
        act(() => {
            result.current.actions.toggleDimension('dim1');
        });
        expect(result.current.state.selectedDimensions).toContain('dim1');
        expect(result.current.state.isSemanticMode).toBe(true);

        // Now select a raw column -> should clear semantic
        act(() => {
            result.current.actions.toggleColumn('col1');
        });
        expect(result.current.state.selectedColumns).toContain('col1');
        expect(result.current.state.selectedDimensions).toEqual([]);
        expect(result.current.state.isSemanticMode).toBe(false);
    });

    it('should toggle dimensions and clear raw columns', () => {
        const { result } = renderHook(() => useAppQueryState());

        // Select raw column first
        act(() => {
            result.current.actions.toggleColumn('col1');
        });
        expect(result.current.state.selectedColumns).toContain('col1');

        // Now select dimension -> should clear raw
        act(() => {
            result.current.actions.toggleDimension('dim1');
        });
        expect(result.current.state.selectedDimensions).toContain('dim1');
        expect(result.current.state.selectedColumns).toEqual([]);
        expect(result.current.state.isSemanticMode).toBe(true);
    });

    it('should manage filters', () => {
        const { result } = renderHook(() => useAppQueryState());

        act(() => {
            result.current.actions.addFilter('col1');
        });
        expect(result.current.state.filters).toHaveLength(1);
        expect(result.current.state.filters[0].column).toBe('col1');

        const filterId = result.current.state.filters[0].id;

        act(() => {
            result.current.actions.updateFilter(filterId, 'value', 'test');
        });
        expect(result.current.state.filters[0].value).toBe('test');

        act(() => {
            result.current.actions.removeFilter(filterId);
        });
        expect(result.current.state.filters).toHaveLength(0);
    });

    it('should reset state', () => {
        const { result } = renderHook(() => useAppQueryState());

        act(() => {
            result.current.actions.toggleColumn('col1');
            result.current.actions.setLimit(500);
            result.current.actions.addFilter('col1');
        });

        expect(result.current.state.selectedColumns).toHaveLength(1);

        act(() => {
            result.current.actions.reset();
        });

        expect(result.current.state.selectedColumns).toEqual([]);
        expect(result.current.state.limit).toBe(10000);
        expect(result.current.state.filters).toEqual([]);
    });
});
