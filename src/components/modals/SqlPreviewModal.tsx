import React from 'react';
import { format } from 'sql-formatter';
import { BaseModal } from './BaseModal';

interface SqlPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    sql: string;
}

export const SqlPreviewModal: React.FC<SqlPreviewModalProps> = ({ isOpen, onClose, sql }) => {
    const formattedSql = sql && (sql.startsWith('SELECT') || sql.startsWith('WITH'))
        ? format(sql, { language: 'postgresql' })
        : sql;

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="SQL Preview"
            width="800px"
            height="70vh"
            footer={
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => { navigator.clipboard.writeText(formattedSql); }} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', cursor: 'pointer' }}>
                        Copiar SQL
                    </button>
                    <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--primary-color)', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>
                        Fechar
                    </button>
                </div>
            }
        >
            <pre style={{
                margin: 0,
                fontFamily: 'monospace',
                fontSize: '14px',
                background: 'var(--bg-input)',
                padding: '15px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                height: '100%',
                overflow: 'auto',
                boxSizing: 'border-box'
            }}>
                {formattedSql || '-- Nenhuma query gerada --'}
            </pre>
        </BaseModal>
    );
};
