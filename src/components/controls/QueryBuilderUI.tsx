import React from 'react';
import type { Dataset, Dimension, Measure } from '../../lib/metadata';

interface MeasureListProps {
    measures: Measure[];
    selectedMeasures: string[];
    onToggleMeasure: (meas: string) => void;
}

const MeasureList: React.FC<MeasureListProps> = ({ measures, selectedMeasures, onToggleMeasure }) => {
    // Collapsible Logic
    const [isExpanded, setIsExpanded] = React.useState(false);

    const toggleList = () => setIsExpanded(prev => !prev);

    return (
        <div style={{ marginTop: '15px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', paddingBottom: '5px', borderBottom: '1px solid var(--border-color)' }}>
                <strong style={{ color: 'var(--text-main)', cursor: 'pointer', userSelect: 'none' }} onClick={toggleList}>
                    Medidas (Agregação)
                </strong>

                <button
                    onClick={toggleList}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        color: 'var(--text-secondary)',
                        padding: '0 5px',
                        fontSize: '1.2em',
                        marginLeft: '5px'
                    }}
                    type="button"
                    title={isExpanded ? "Ocultar Medidas" : "Exibir Medidas"}
                >
                    {isExpanded ? '-' : '+'}
                </button>
            </div>

            {/* List */}
            {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {measures.map(meas => (
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
            )}
        </div>
    );
};

interface MeasureListProps {
    measures: Measure[];
    selectedMeasures: string[];
    onToggleMeasure: (meas: string) => void;
}



interface QueryBuilderUIProps {
    activeDataset: Dataset;
    selectedColumns: string[];
    selectedDimensions: string[];
    selectedMeasures: string[];
    onToggleColumn: (col: string) => void;
    onToggleDimension: (dim: string) => void;
    onSelectDimensions?: (dims: string[]) => void;
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

const DimensionList: React.FC<{
    dimensions: Dimension[];
    selectedDimensions: string[];
    onToggle: (dim: string) => void;
    onSelectDimensions: (dims: string[]) => void;
}> = ({ dimensions, selectedDimensions, onToggle, onSelectDimensions }) => {
    // 1. Separate grouped and ungrouped
    const groups: Record<string, Dimension[]> = {};
    const ungrouped: Dimension[] = [];

    // Helper to get all dimension names recursively
    const getAllNames = (dims: Dimension[]): string[] => {
        let names: string[] = [];
        dims.forEach(d => {
            names.push(d.name);
            if (d.attributes) names.push(...d.attributes.map(a => a.name));
            if (d.subDimensions) names.push(...getAllNames(d.subDimensions));
        });
        return names;
    };

    dimensions.forEach(dim => {
        if (dim.group) {
            if (!groups[dim.group]) groups[dim.group] = [];
            groups[dim.group].push(dim);
        } else {
            ungrouped.push(dim);
        }
    });

    // Expansion State
    const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
    // Main list starts collapsed (hiding groups)
    const [isMainListExpanded, setIsMainListExpanded] = React.useState(false);

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const toggleMainList = () => {
        setIsMainListExpanded(prev => !prev);
    };

    // Selection Logic
    const allDimensionNames = getAllNames(dimensions);
    const isAllSelected = allDimensionNames.length > 0 && allDimensionNames.every(d => selectedDimensions.includes(d));

    const handleSelectAll = () => {
        if (isAllSelected) {
            onSelectDimensions([]);
        } else {
            onSelectDimensions(allDimensionNames);
        }
    };

    const handleSelectGroup = (groupDims: Dimension[]) => {
        const groupNames = getAllNames(groupDims);
        const groupSelected = groupNames.every(d => selectedDimensions.includes(d));

        if (groupSelected) {
            const newSelection = selectedDimensions.filter(d => !groupNames.includes(d));
            onSelectDimensions(newSelection);
        } else {
            const newSelection = Array.from(new Set([...selectedDimensions, ...groupNames]));
            onSelectDimensions(newSelection);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>

            {/* Header: [Checkbox] Title [ExpandArrow] */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', paddingBottom: '5px', borderBottom: '1px solid var(--border-color)' }}>
                <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    style={{ marginRight: '8px', cursor: 'pointer' }}
                    title="Selecionar todas as dimensões"
                />
                <strong style={{ color: 'var(--text-main)', cursor: 'pointer', userSelect: 'none' }} onClick={toggleMainList}>
                    Dimensões (Group By)
                </strong>

                <button
                    onClick={toggleMainList}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        color: 'var(--text-secondary)',
                        padding: '0 5px',
                        fontSize: '1.2em',
                        marginLeft: '5px'
                    }}
                    type="button"
                    title={isMainListExpanded ? "Ocultar Grupos" : "Exibir Grupos"}
                >
                    {isMainListExpanded ? '-' : '+'}
                </button>
            </div>

            {isMainListExpanded && (
                <>
                    {ungrouped.map(dim => (
                        <DimensionNode
                            key={dim.name}
                            node={dim}
                            selectedDimensions={selectedDimensions}
                            onToggleDimension={onToggle}
                        />
                    ))}

                    {/* Groups */}
                    {Object.entries(groups).map(([groupName, groupDims]) => {
                        const groupNames = getAllNames(groupDims);
                        const isGroupSelected = groupNames.length > 0 && groupNames.every(d => selectedDimensions.includes(d));
                        const isOpen = !!expandedGroups[groupName];

                        return (
                            <div key={groupName} style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                marginBottom: '5px',
                                background: 'var(--bg-panel)'
                            }}>
                                <div style={{
                                    padding: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'var(--bg-panel-secondary)',
                                    borderBottom: isOpen ? '1px solid var(--border-color)' : 'none'
                                }}>
                                    {/* Checkbox Left */}
                                    <input
                                        type="checkbox"
                                        checked={isGroupSelected}
                                        onChange={() => handleSelectGroup(groupDims)}
                                        style={{ marginRight: '8px', cursor: 'pointer' }}
                                        title="Selecionar grupo"
                                    />

                                    {/* Name Center (Clickable to toggle) */}
                                    <span
                                        onClick={() => toggleGroup(groupName)}
                                        style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)', userSelect: 'none' }}
                                    >
                                        {groupName}
                                    </span>

                                    {/* Arrow Right */}
                                    <button
                                        onClick={() => toggleGroup(groupName)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            marginLeft: '5px',
                                            fontWeight: 'bold',
                                            color: 'var(--text-secondary)',
                                            padding: '0 5px'
                                        }}
                                        type="button"
                                    >
                                        {isOpen ? '-' : '+'}
                                    </button>
                                </div>

                                {isOpen && (
                                    <div style={{ padding: '8px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {groupDims.map(dim => (
                                            <DimensionNode
                                                key={dim.name}
                                                node={dim}
                                                selectedDimensions={selectedDimensions}
                                                onToggleDimension={onToggle}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>
            )}
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
    onSelectDimensions,
    onToggleMeasure
}) => {
    return (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* Raw Columns Selection - Only in Dataset Mode (no semantic model) */}
            {!activeDataset.semantic && (
                <div style={{ flex: 1, minWidth: '300px', marginBottom: '20px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-panel)' }}>
                    <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Colunas (Raw)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            )}

            {/* Semantic Selection */}
            {activeDataset.semantic && (
                <div style={{ flex: 1, minWidth: '300px', marginBottom: '20px', padding: '10px', border: '1px solid var(--border-accent)', borderRadius: '4px', background: 'var(--bg-panel-secondary)' }}>
                    <h3 style={{ marginTop: 0, color: 'var(--accent-color)' }}>Camada Semântica</h3>

                    <div style={{ marginBottom: '15px' }}>
                        {/* Title moved inside DimensionList */}
                        <div style={{ marginTop: '5px' }}>
                            <DimensionList
                                dimensions={activeDataset.semantic.dimensions}
                                selectedDimensions={selectedDimensions}
                                onToggle={onToggleDimension}
                                onSelectDimensions={onSelectDimensions || (() => { })}
                            />
                        </div>
                    </div>

                    {/* Measures (Collapsible) */}
                    <MeasureList
                        measures={activeDataset.semantic.measures}
                        selectedMeasures={selectedMeasures}
                        onToggleMeasure={onToggleMeasure}
                    />
                </div>
            )}
        </div>
    );
};
