
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterModal } from '../../../src/components/modals/FilterModal';

describe('FilterModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        onSave: vi.fn(),
        type: 'dimension' as const,
        locale: 'pt-BR',
        options: [
            { name: 'str_col', label: 'String Column', type: 'VARCHAR' },
            { name: 'int_col', label: 'Integer Column', type: 'INTEGER' },
            { name: 'date_col', label: 'Date Column', type: 'DATE' },
        ]
    };

    it('should render correct input type for String', () => {
        render(<FilterModal {...defaultProps} />);
        // Default select is first -> str_col
        const input = screen.getByPlaceholderText('Valor');
        expect(input.getAttribute('type')).toBe('text');
    });

    it('should render DatePicker for Date column', () => {
        render(<FilterModal {...defaultProps} />);

        // Change column to date_col
        const select = screen.getByRole('combobox', { name: /campo/i });
        fireEvent.change(select, { target: { value: 'date_col' } });

        // DatePicker renders a text input with today's date placeholder or empty value
        // Its placeholder depends on locale, e.g. "DD/MM/YYYY" or similar format of today
        // We can just check it exists and is Type="text" (because DatePicker uses text input)
        // Adjust locator if DatePicker has specific label or role
        const input = screen.getAllByRole('textbox')[0]; // First textbox is FilterValue (if text) or DatePicker input
        // Since column is Date, the "Value" input is the DatePicker input
        expect(input).toBeTruthy();
        expect(input.getAttribute('type')).toBe('text');

        // Check for calendar button
        expect(screen.getByText('📅')).toBeTruthy();
    });

    it('should render correct input type for Integer', () => {
        render(<FilterModal {...defaultProps} />);
        const select = screen.getByRole('combobox', { name: /campo/i });
        fireEvent.change(select, { target: { value: 'int_col' } });

        const input = screen.getByPlaceholderText('Valor Numérico');
        expect(input.getAttribute('type')).toBe('number');
    });

    it('should validate Integer input', () => {
        render(<FilterModal {...defaultProps} />);
        const select = screen.getByRole('combobox', { name: /campo/i });
        fireEvent.change(select, { target: { value: 'int_col' } });

        const input = screen.getByPlaceholderText('Valor Numérico');
        fireEvent.change(input, { target: { value: '12.5' } }); // Invalid integer (float is usually not int in our strict check)

        const saveBtn = screen.getByText('Salvar');
        fireEvent.click(saveBtn);

        expect(screen.getByText('Valor deve ser um número inteiro')).toBeTruthy();
        expect(defaultProps.onSave).not.toHaveBeenCalled();

        // Fix it
        fireEvent.change(input, { target: { value: '12' } });
        fireEvent.click(saveBtn);
        expect(defaultProps.onSave).toHaveBeenCalledWith({ column: 'int_col', operator: '=', value: '12', granularity: 'day' });
    });
});
