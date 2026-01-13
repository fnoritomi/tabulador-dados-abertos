import React from 'react';

interface StatusBarProps {
    dbStatus: string | null;
    version: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({ dbStatus, version }) => {
    return (
        <div style={{ marginBottom: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '4px', fontSize: '0.9em' }}>
            <strong>System Status:</strong> {dbStatus} {version && `(${version})`}
        </div>
    );
};
