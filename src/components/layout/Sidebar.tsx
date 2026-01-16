import type { Dispatch, SetStateAction } from 'react';
import { DatasetSelector } from '../controls/DatasetSelector';
import { QueryBuilderUI } from '../controls/QueryBuilderUI';
import { FilterList } from '../controls/FilterList';
import { SqlEditor } from '../controls/SqlEditor';
import type { AppFormattingConfig } from '../../lib/formatting';

interface SidebarProps {
    viewMode: 'builder' | 'editor';
    setViewMode: Dispatch<SetStateAction<'builder' | 'editor'>>;
    qs: any;
    qa: any;
    semanticReady: boolean;
    semanticError: string | null;
    activeDatasetAdapter: any;
    selectorItems: any[];
    selectedModelId: string;
    setSelectedModelId: Dispatch<SetStateAction<string>>;
    editorSql: string;
    setEditorSql: Dispatch<SetStateAction<string>>;
    effectiveConfig: AppFormattingConfig;
    handleAddFilter: (filter?: any) => void;
    handleAddMeasureFilter: (filter?: any) => void;
    setSqlPreviewOpen: Dispatch<SetStateAction<boolean>>;
    filterOptions: any[];
    measureFilterOptions: any[];
}

export function Sidebar({
    viewMode,
    setViewMode,
    qs,
    qa,
    semanticReady,
    semanticError,
    activeDatasetAdapter,
    selectorItems,
    selectedModelId,
    setSelectedModelId,
    editorSql,
    setEditorSql,
    effectiveConfig,
    handleAddFilter,
    handleAddMeasureFilter,
    setSqlPreviewOpen,
    filterOptions,
    measureFilterOptions
}: SidebarProps) {
    return (
        <aside style={{
            width: '400px',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-panel)',
            flexShrink: 0,
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
        }}>
            {/* View Mode Tabs (Builder vs Editor) */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                <button
                    onClick={() => setViewMode('builder')}
                    style={{
                        flex: 1,
                        padding: '15px',
                        background: viewMode === 'builder' ? 'var(--bg-panel)' : 'var(--bg-app)',
                        border: 'none',
                        borderBottom: viewMode === 'builder' ? '2px solid var(--primary-color)' : 'none',
                        color: viewMode === 'builder' ? 'var(--text-main)' : 'gray',
                        cursor: 'pointer',
                        fontWeight: viewMode === 'builder' ? 'bold' : 'normal',
                        borderRadius: 0
                    }}
                >
                    Query Builder
                </button>
                <button
                    onClick={() => setViewMode('editor')}
                    style={{
                        flex: 1,
                        padding: '15px',
                        background: viewMode === 'editor' ? 'var(--bg-panel)' : 'var(--bg-app)',
                        border: 'none',
                        borderBottom: viewMode === 'editor' ? '2px solid var(--primary-color)' : 'none',
                        color: viewMode === 'editor' ? 'var(--text-main)' : 'gray',
                        cursor: 'pointer',
                        fontWeight: viewMode === 'editor' ? 'bold' : 'normal',
                        borderRadius: 0
                    }}
                >
                    SQL Editor
                </button>
            </div>

            {/* Sidebar Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>

                {/* Dataset Selector (common) */}
                {viewMode === 'builder' && (
                    <div style={{ marginBottom: '20px' }}>
                        <DatasetSelector
                            mode={qs.mode}
                            onModeChange={qa.setMode}
                            items={selectorItems}
                            selectedId={selectedModelId}
                            onSelect={setSelectedModelId}
                            loading={!semanticReady}
                        />
                    </div>
                )}

                {semanticError && <div style={{ color: 'red', marginBottom: '10px' }}>Erro: {String(semanticError)}</div>}

                {activeDatasetAdapter && (
                    <>
                        {viewMode === 'builder' ? (
                            <>
                                <QueryBuilderUI
                                    activeDataset={activeDatasetAdapter as any}
                                    selectedColumns={qs.selectedColumns}
                                    selectedDimensions={qs.selectedDimensions}
                                    selectedMeasures={qs.selectedMeasures}
                                    onToggleColumn={qa.toggleColumn}
                                    onToggleDimension={qa.toggleDimension}
                                    onSelectDimensions={qa.setDimensions}
                                    onToggleMeasure={qa.toggleMeasure}
                                />

                                <FilterList
                                    title={'Filtros de Dimensão (WHERE)'}
                                    filters={qs.filters}
                                    options={filterOptions as any}
                                    onAdd={handleAddFilter}
                                    onRemove={(id) => qa.removeFilter(id, 'dimension')}
                                    onUpdate={(id, f, v) => qa.updateFilter(id, f, v, 'dimension')}
                                    type="dimension"
                                    color="var(--text-main)"
                                    bgColor="var(--bg-app)"
                                    locale={effectiveConfig.locale}
                                />

                                {activeDatasetAdapter.semantic && (
                                    <FilterList
                                        title="Filtros de Medida (HAVING)"
                                        filters={qs.measureFilters}
                                        options={measureFilterOptions as any}
                                        onAdd={handleAddMeasureFilter}
                                        onRemove={(id) => qa.removeFilter(id, 'measure')}
                                        onUpdate={(id, f, v) => qa.updateFilter(id, f, v, 'measure')}
                                        type="measure"
                                        color="var(--text-main)"
                                        bgColor="var(--bg-app)"
                                        locale={effectiveConfig.locale}
                                    />
                                )}

                                {/* Limit & Preview Button */}
                                <div style={{ marginTop: '20px', padding: '15px', background: 'var(--bg-panel-secondary)', borderRadius: '8px' }}>
                                    <div style={{ marginBottom: '15px' }}>
                                        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Limite de Linhas</label>
                                        <input
                                            type="number"
                                            value={qs.limit}
                                            onChange={(e) => qa.setLimit(Number(e.target.value))}
                                            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <button
                                        onClick={() => setSqlPreviewOpen(true)}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                                    >
                                        Ver SQL Gerado
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '100%' }}>
                                <SqlEditor value={editorSql} onChange={setEditorSql} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </aside>
    );
}
