
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DatePicker } from '../../../src/components/controls/DatePicker';

describe('DatePicker', () => {
    it('should format date according to locale (pt-BR)', () => {
        const date = new Date(2023, 0, 15); // Jan 15 2023
        const onChange = vi.fn();
        render(<DatePicker value={date} onChange={onChange} locale="pt-BR" />);

        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.value).toBe('15/01/2023');
    });

    it('should format date according to locale (en-US)', () => {
        const date = new Date(2023, 0, 15); // Jan 15 2023
        const onChange = vi.fn();
        render(<DatePicker value={date} onChange={onChange} locale="en-US" />);

        const input = screen.getByRole('textbox') as HTMLInputElement;
        // en-US defaults to M/D/YYYY
        expect(input.value).toBe('1/15/2023');
    });

    it('should parse typed date correctly (pt-BR)', () => {
        const onChange = vi.fn();
        render(<DatePicker value={null} onChange={onChange} locale="pt-BR" />);

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '31/12/2023' } });

        expect(onChange).toHaveBeenCalled();
        const calledDate = onChange.mock.calls[0][0] as Date;
        expect(calledDate.getFullYear()).toBe(2023);
        expect(calledDate.getMonth()).toBe(11); // Dec
        expect(calledDate.getDate()).toBe(31);
    });

    it('should show simplified calendar on button click', () => {
        const onChange = vi.fn();
        const date = new Date(2023, 0, 15);
        render(<DatePicker value={date} onChange={onChange} locale="pt-BR" />);

        const btn = screen.getByText('📅');
        fireEvent.click(btn);

        expect(screen.getByText('janeiro de 2023')).toBeTruthy(); // Check parsing month/year in header
        // Click a day
        const day20 = screen.getByText('20');
        fireEvent.click(day20);

        expect(onChange).toHaveBeenCalled();
        const calledDate = onChange.mock.calls[0][0] as Date;
        expect(calledDate.getDate()).toBe(20);
    });
});
