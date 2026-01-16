
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppQueryState } from '../../src/hooks/useAppQueryState';

describe('useAppQueryState', () => {
    it('should add a filter with granularity', () => {
        const { result } = renderHook(() => useAppQueryState());

        act(() => {
            result.current.actions.addFilter({
                column: 'date_col',
                operator: '=',
                value: '2023',
                granularity: 'year'
            });
        });

        const filters = result.current.state.filters;
        expect(filters).toHaveLength(1);
        expect(filters[0].column).toBe('date_col');
        expect(filters[0].granularity).toBe('year');
    });

    it('should update filter granularity', () => {
        const { result } = renderHook(() => useAppQueryState());

        act(() => {
            result.current.actions.addFilter({
                column: 'date_col',
                operator: '=',
                value: '2023',
                granularity: 'year'
            });
        });

        const id = result.current.state.filters[0].id;

        act(() => {
            result.current.actions.updateFilter(id, 'granularity', 'quarter');
        });

        const filters = result.current.state.filters;
        expect(filters[0].granularity).toBe('quarter');
    });

    it('should handle addFilter without granularity', () => {
        const { result } = renderHook(() => useAppQueryState());

        act(() => {
            result.current.actions.addFilter({
                column: 'other_col',
                operator: '=',
                value: 'foo'
            });
        });

        const filters = result.current.state.filters;
        expect(filters[0].granularity).toBeUndefined();
    });
});
