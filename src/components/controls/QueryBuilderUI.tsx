import React from 'react';
import type { Dataset } from '../../lib/metadata';

interface QueryBuilderUIProps {
    activeDataset: Dataset;
    selectedColumns: string[];
    selectedDimensions: string[];
    selectedMeasures: string[];
    onToggleColumn: (col: string) => void;
    onToggleDimension: (dim: string) => void;
    onToggleMeasure: (meas: string) => void;
}

export const QueryBuilderUI: React.FC<QueryBuilderUIProps> = ({
    activeDataset,
    selectedColumns,
    selectedDimensions,
    selectedMeasures,
    onToggleColumn,
    onToggleDimension,
    onToggleMeasure
}) => {
    return (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* Raw Columns Selection */}
            <div style={{ flex: 1, minWidth: '300px', marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
                <h3 style={{ marginTop: 0 }}>Colunas (Raw)</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {activeDataset.schema.map(col => (
                        <label key={col.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={selectedColumns.includes(col.name)}
                                onChange={() => onToggleColumn(col.name)}
                                style={{ marginRight: '5px' }}
                            />
                            {col.name} <span style={{ color: '#999', fontSize: '0.8em', marginLeft: '4px' }}>({col.type})</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Semantic Selection */}
            {activeDataset.semantic && (
                <div style={{ flex: 1, minWidth: '300px', marginBottom: '20px', padding: '10px', border: '1px solid #d0e1f9', borderRadius: '4px', background: '#f0f7ff' }}>
                    <h3 style={{ marginTop: 0, color: '#0056b3' }}>Camada Semântica</h3>

                    <div style={{ marginBottom: '15px' }}>
                        <strong>Dimensões (Group By)</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                            {activeDataset.semantic.dimensions.map(dim => (
                                <label key={dim.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedDimensions.includes(dim.name)}
                                        onChange={() => onToggleDimension(dim.name)}
                                        style={{ marginRight: '5px' }}
                                    />
                                    {dim.label || dim.name}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <strong>Medidas (Agregação)</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                            {activeDataset.semantic.measures.map(meas => (
                                <label key={meas.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedMeasures.includes(meas.name)}
                                        onChange={() => onToggleMeasure(meas.name)}
                                        style={{ marginRight: '5px' }}
                                    />
                                    {meas.label || meas.name}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
