import React from 'react';

interface StatusMessageProps {
    // Status states
    warmingUp: boolean;
    queryLoading: boolean;
    queryCancelling: boolean;
    isExporting: boolean;

    // Messages
    statusMessage: string | null;
    exportStatusMessage: string | null;
    lastExportMessage: { text: string; type: 'success' | 'error' | 'info' } | null;

    // Stats
    executionTime: number | null;
    warmingUpTime: number | null;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
    warmingUp,
    queryLoading,
    queryCancelling,
    isExporting,
    statusMessage,
    exportStatusMessage,
    lastExportMessage,
    executionTime,
    warmingUpTime
}) => {
    if (warmingUp) {
        return <span style={{ color: '#e67e22', fontWeight: 'bold' }}>Carregando estatísticas dos conjuntos de dados...</span>;
    }
    if (queryLoading) {
        return <span style={{ color: '#007bff', fontWeight: 'bold' }}>{queryCancelling ? 'Cancelando consulta...' : 'Executando consulta...'}</span>;
    }
    // Exporting status takes precedence over old results
    if (isExporting) {
        return <span style={{ color: '#28a745', fontWeight: 'bold' }}>{exportStatusMessage || "Exportando..."}</span>;
    }
    // Last Export Result (Success or Error/Cancelled) gets high priority visibility after export ends
    if (lastExportMessage) {
        return (
            <span style={{ color: lastExportMessage.type === 'error' ? 'red' : ((lastExportMessage.type === 'success') ? '#666' : '#007bff') }}>
                {lastExportMessage.text}
            </span>
        );
    }
    // Query Status/Cancellation
    if (statusMessage) {
        return <span style={{ color: '#666' }}>{statusMessage}</span>;
    }
    // Query Time (only if no export msg)
    if (executionTime) {
        return <span style={{ color: '#666' }}>Tempo: {executionTime.toFixed(2)}ms</span>;
    }
    // Warmup Time (lowest priority)
    if (warmingUpTime) {
        return <span style={{ color: '#666' }}>Estatísticas carregadas em {warmingUpTime.toFixed(2)}ms</span>;
    }
    return null;
}
