import React, { useEffect } from 'react';
import { format } from 'sql-formatter';

interface SqlPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    sql: string;
}

export const SqlPreviewModal: React.FC<SqlPreviewModalProps> = ({ isOpen, onClose, sql }) => {
    // Close on escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const formattedSql = sql && (sql.startsWith('SELECT') || sql.startsWith('WITH'))
        ? format(sql, { language: 'postgresql' })
        : sql;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-app)',
                color: 'var(--text-main)',
                width: '80%',
                maxWidth: '800px',
                height: '70vh',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: '15px 20px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--bg-panel)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>SQL Preview</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
                    <pre style={{
                        margin: 0,
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        background: 'var(--bg-input)',
                        padding: '15px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                    }}>
                        {formattedSql || '-- Nenhuma query gerada --'}
                    </pre>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '15px 20px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    background: 'var(--bg-panel)'
                }}>
                    <button onClick={() => { navigator.clipboard.writeText(formattedSql); }} style={{ marginRight: '10px' }}>
                        Copiar SQL
                    </button>
                    <button onClick={onClose} style={{ background: 'var(--primary-color)', color: 'white' }}>
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
