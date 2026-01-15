import React from 'react';

interface StatusBarProps {
    dbStatus: string | null;
    version: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({ dbStatus, version }) => {
    return (
        <div style={{ marginBottom: '20px', padding: '10px', background: 'var(--bg-panel)', color: 'var(--text-secondary)', borderRadius: '4px', fontSize: '0.9em', border: '1px solid var(--border-color)' }}>
            <strong style={{ color: 'var(--text-main)' }}>System Status:</strong> {dbStatus} {version && `(${version})`}
        </div>
    );
};
