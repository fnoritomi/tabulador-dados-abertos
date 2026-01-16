import React from 'react';

interface SqlEditorProps {
    value: string;
    onChange: (value: string) => void;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '300px' }}>
            <label style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>
                Editor SQL
            </label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Digite sua consulta SQL aqui..."
                style={{
                    flex: 1,
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    backgroundColor: 'var(--bg-input)', // #1e1e1e in dark, #fff in light usually
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    resize: 'none',
                    outline: 'none',
                    minHeight: '200px'
                }}
                spellCheck={false}
            />
            <div style={{ marginTop: '5px', fontSize: '0.85rem', color: 'gray' }}>
                Use <strong>Ctrl+Enter</strong> para executar.
            </div>
        </div>
    );
};
