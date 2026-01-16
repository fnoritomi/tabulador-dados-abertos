import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { StatusMessage } from '../../src/components/feedback/StatusMessage';

describe('StatusMessage', () => {
    const defaultProps = {
        warmingUp: false,
        queryLoading: false,
        queryCancelling: false,
        isExporting: false,
        statusMessage: null,
        exportStatusMessage: null,
        lastExportMessage: null,
        executionTime: null,
        warmingUpTime: null
    };

    it('should show warming up message with highest priority', () => {
        render(<StatusMessage {...defaultProps} warmingUp={true} statusMessage="Some other message" />);
        expect(screen.getByText(/Carregando estatísticas/)).toBeTruthy();
    });

    it('should show query loading message', () => {
        render(<StatusMessage {...defaultProps} queryLoading={true} />);
        expect(screen.getByText(/Executando consulta/)).toBeTruthy();
    });

    it('should show query cancelling message', () => {
        render(<StatusMessage {...defaultProps} queryLoading={true} queryCancelling={true} />);
        expect(screen.getByText(/Cancelando consulta/)).toBeTruthy();
    });

    it('should show exporting message over query result', () => {
        render(<StatusMessage {...defaultProps} isExporting={true} exportStatusMessage="Export 50%" executionTime={100} />);
        expect(screen.getByText("Export 50%")).toBeTruthy();
    });

    it('should show last export message error', () => {
        render(<StatusMessage {...defaultProps} lastExportMessage={{ text: "Export Failed", type: 'error' }} />);
        const msg = screen.getByText("Export Failed");
        expect(msg.style.color).toBe('var(--color-error)');
    });

    it('should show last export message success', () => {
        render(<StatusMessage {...defaultProps} lastExportMessage={{ text: "Export Done", type: 'success' }} />);
        const msg = screen.getByText("Export Done");
        // defined in component as #666
        expect(msg.style.color).toBe('var(--text-secondary)');
    });

    it('should show status message (cancellation) if no export', () => {
        render(<StatusMessage {...defaultProps} statusMessage="Cancelled by user" />);
        expect(screen.getByText("Cancelled by user")).toBeTruthy();
    });

    it('should show execution time if nothing else', () => {
        render(<StatusMessage {...defaultProps} executionTime={123.45} />);
        expect(screen.getByText(/Tempo: 123.45ms/)).toBeTruthy();
    });

    it('should show warmup time with lowest priority', () => {
        render(<StatusMessage {...defaultProps} warmingUpTime={500} />);
        expect(screen.getByText(/Estatísticas carregadas em 500.00ms/)).toBeTruthy();
    });
});
