import React from 'react';
import type { Dataset, Dimension } from '../../lib/metadata';

interface QueryBuilderUIProps {
    activeDataset: Dataset;
    selectedColumns: string[];
    selectedDimensions: string[];
    selectedMeasures: string[];
    onToggleColumn: (col: string) => void;
    onToggleDimension: (dim: string) => void;
    onToggleMeasure: (meas: string) => void;
}

interface DimensionNodeProps {
    node: Dimension;
    selectedDimensions: string[];
    onToggleDimension: (dim: string) => void;
    level?: number;
}

const DimensionNode: React.FC<DimensionNodeProps> = ({ node, selectedDimensions, onToggleDimension, level = 0 }) => {
    // Case 1: Simple Dimension (Leaf)
    // It has a SQL property or explicit DataType (and sql is usually inferred if missing in simple objects but let's check sql).
    // Or if it strictly has NO attributes/subDimensions.
    // Migration script ensures Simple Dims have `sql` and `dataType` and NO `attributes`.

    // Check strict "Simple" definition as per migration:
    const isSimple = !!node.sql || (node.attributes === undefined && node.subDimensions === undefined);

    if (isSimple) {
        return (
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '5px', marginLeft: level * 15 + 'px', color: 'var(--text-main)' }}>
                <input
                    type="checkbox"
                    checked={selectedDimensions.includes(node.name)}
                    onChange={() => onToggleDimension(node.name)}
                    style={{ marginRight: '5px' }}
                />
                {node.label || node.name}
            </label>
        );
    }

    // Case 2: Composite Dimension (Group)
    // It acts as a container.
    const hasChildren = (node.attributes && node.attributes.length > 0) || (node.subDimensions && node.subDimensions.length > 0);

    if (!hasChildren) return null;

    return (
        <div style={{ marginBottom: '10px', marginLeft: level * 15 + 'px' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {node.label || node.name}
            </div>

            <div style={{ paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {/* Render Attributes */}
                {node.attributes?.map(attr => (
                    <label key={attr.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
                        <input
                            type="checkbox"
                            checked={selectedDimensions.includes(attr.name)}
                            onChange={() => onToggleDimension(attr.name)}
                            style={{ marginRight: '5px' }}
                        />
                        {attr.label || attr.name}
                    </label>
                ))}

                {/* Recurse for SubDimensions */}
                {node.subDimensions?.map(sub => (
                    <DimensionNode
                        key={sub.name}
                        node={sub}
                        selectedDimensions={selectedDimensions}
                        onToggleDimension={onToggleDimension}
                        level={level + 1}
                    />
                ))}
            </div>
        </div>
    );
};

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
            <div style={{ flex: 1, minWidth: '300px', marginBottom: '20px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-panel)' }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Colunas (Raw)</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {activeDataset.schema.map(col => (
                        <label key={col.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
                            <input
                                type="checkbox"
                                checked={selectedColumns.includes(col.name)}
                                onChange={() => onToggleColumn(col.name)}
                                style={{ marginRight: '5px' }}
                            />
                            {col.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em', marginLeft: '4px' }}>({col.type})</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Semantic Selection */}
            {activeDataset.semantic && (
                <div style={{ flex: 1, minWidth: '300px', marginBottom: '20px', padding: '10px', border: '1px solid var(--border-accent)', borderRadius: '4px', background: 'var(--bg-panel-secondary)' }}>
                    <h3 style={{ marginTop: 0, color: 'var(--accent-color)' }}>Camada Semântica</h3>

                    <div style={{ marginBottom: '15px' }}>
                        <strong style={{ color: 'var(--text-main)' }}>Dimensões (Group By)</strong>
                        <div style={{ marginTop: '5px' }}>
                            {activeDataset.semantic.dimensions.map(dim => (
                                <DimensionNode
                                    key={dim.name}
                                    node={dim}
                                    selectedDimensions={selectedDimensions}
                                    onToggleDimension={onToggleDimension}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        <strong style={{ color: 'var(--text-main)' }}>Medidas (Agregação)</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                            {activeDataset.semantic.measures.map(meas => (
                                <label key={meas.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
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
