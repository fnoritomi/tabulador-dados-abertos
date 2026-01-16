import { useEffect, useState, useMemo } from 'react';
import { useDuckDB } from './hooks/useDuckDB';
import { useSemanticLayer } from './hooks/useSemanticLayer';
import { useQueryExecutor } from './hooks/useQueryExecutor';
import { useAppQueryState } from './hooks/useAppQueryState';
import { useDuckDBWarmup } from './hooks/useDuckDBWarmup';
import { useTheme } from './hooks/useTheme';
import { DuckDbSqlBuilder } from './semantic/sql_builder_duckdb';
import { DatasetSelector } from './components/controls/DatasetSelector';
import { QueryBuilderUI } from './components/controls/QueryBuilderUI';
import { FilterList } from './components/controls/FilterList';
import { ResultsView } from './components/data-display/ResultsView';

import { Toolbar } from './components/layout/Toolbar';
import { StatusMessage } from './components/feedback/StatusMessage';
import { SqlEditor } from './components/controls/SqlEditor';
import { SettingsMenu } from './components/layout/SettingsMenu';
import { SqlPreviewModal } from './components/modals/SqlPreviewModal';
import type { QueryIR } from './semantic/types';
import { setConfig, DEFAULT_CONFIG, type AppFormattingConfig } from './lib/formatting';

// Adapter to match existing UI interfaces
const adaptSelectionToContext = (id: string, registry: any, mode: 'dataset' | 'semantic') => {
  if (mode === 'semantic') {
    const model = registry.getModel(id);
    if (!model) return null;
    const dataset = registry.getDataset(model.model);
    return {
      id: model.name,
      name: model.description || model.name,
      schema: dataset?.columns || [],
      semantic: model,
      sources: dataset?.sources,
      relation: dataset?.relation
    };
  } else {
    // Dataset Mode
    const dataset = registry.getDataset(id);
    if (!dataset) return null;
    return {
      id: dataset.name, // The dataset name is its ID in the registry map
      name: dataset.description || dataset.name,
      schema: dataset.columns || [],
      semantic: undefined, // No semantic model in raw mode
      sources: dataset.sources,
      relation: dataset.relation || dataset.name // fallback to name if relation not specified
    };
  }
};

function App() {
  // Theme Hook
  const { theme, setTheme } = useTheme();

  // Hooks
  const { db } = useDuckDB();
  const { isReady: semanticReady, registry, error: semanticError } = useSemanticLayer();

  const {
    execute: executeQuery, cancel: cancelQuery, reset: resetQuery, result, executionTime,
    loading: queryLoading, cancelling: queryCancelling, error: queryError, resultMode, statusMessage: executorStatus
  } = useQueryExecutor(db, { baseUrl: import.meta.env.BASE_URL });

  // App Query State
  const { state: qs, actions: qa } = useAppQueryState();

  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [editorSql, setEditorSql] = useState<string>('');
  const [viewMode, setViewMode] = useState<'builder' | 'editor'>('builder');

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Locale State
  const [uiLocale, setUiLocale] = useState<string>('system');
  const [loadedConfig, setLoadedConfig] = useState<AppFormattingConfig | null>(null);

  // Semantic State
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  // UI State
  // UI State
  const [sqlPreviewOpen, setSqlPreviewOpen] = useState(false);

  // Items List based on Mode
  const selectorItems = useMemo(() => {
    if (!semanticReady || !registry) return [];
    if (qs.mode === 'semantic') {
      return registry.getAllModels().map((m: any) => ({
        id: m.name,
        name: m.description || m.name
      }));
    } else {
      return registry.listDatasets().map((d: any) => ({
        id: d.name,
        name: d.description || d.name
      }));
    }
  }, [semanticReady, registry, qs.mode]);

  // Initialize Selection or Update on Mode Change
  useEffect(() => {
    if (selectorItems.length > 0) {
      // If current selection is invalid for the new list, pick the first one
      const exists = selectorItems.find(item => item.id === selectedModelId);
      if (!exists) {
        setSelectedModelId(selectorItems[0].id);
      }
    }
  }, [selectorItems, selectedModelId]);

  const activeDatasetAdapter = useMemo(() => {
    if (!semanticReady || !registry || !selectedModelId) return null;
    return adaptSelectionToContext(selectedModelId, registry, qs.mode);
  }, [semanticReady, registry, selectedModelId, qs.mode]);


  // Update Config when UI Locale changes
  useEffect(() => {
    if (!loadedConfig) return; // Wait for load

    // Priority: UI (if not system) > Config > Browser
    const newLocale = uiLocale === 'system'
      ? (loadedConfig.locale || navigator.language)
      : uiLocale;

    setConfig({
      ...loadedConfig,
      locale: newLocale
    });
  }, [uiLocale, loadedConfig]);

  // Warmup Logic
  const { warmingUp, warmingUpTime } = useDuckDBWarmup(db, activeDatasetAdapter);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [lastExportMessage, setLastExportMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  // Helpers
  // Removed unused isSemanticMode

  // Load Config from Semantic Registry
  useEffect(() => {
    if (!semanticReady || !registry) return;

    const systemConfig = registry.getConfig();
    const defaults = systemConfig.defaults || {};
    const overrides = systemConfig.overrides || {};

    // 1. Resolve Locale Config
    const localeCode = uiLocale === 'system' ? navigator.language : uiLocale;
    let localeConfig = null;
    if (systemConfig.locales) {
      localeConfig = systemConfig.locales.find((l: any) => l.code === localeCode)
        || systemConfig.locales.find((l: any) => l.code.split('-')[0] === localeCode.split('-')[0])
        || systemConfig.locales[0];
    }

    // 2. Base Configuration (Global Defaults + Locale)
    const baseConfig: AppFormattingConfig = {
      locale: localeConfig ? localeConfig.code : (defaults.locale || 'pt-BR'),
      currency: localeConfig?.currency || (defaults.number_format?.currency || 'BRL'),
      csv: (localeConfig?.csv as any) || { separator: ';', encoding: 'UTF-8' as const },
      defaults: {
        date: {
          pattern: defaults.date_format?.pattern
        },
        timestamp: {
          pattern: defaults.date_format?.time_pattern // Map time_pattern to timestamp.pattern
        },
        number: {
          ...defaults.number_format
        }
      }
    };

    // 3. Apply Overrides (Mandatory)
    if (overrides.date_format?.pattern) {
      if (!baseConfig.defaults!.date) baseConfig.defaults!.date = {};
      baseConfig.defaults!.date!.pattern = overrides.date_format.pattern;
    }
    if (overrides.date_format?.time_pattern) {
      if (!baseConfig.defaults!.timestamp) baseConfig.defaults!.timestamp = {};
      baseConfig.defaults!.timestamp!.pattern = overrides.date_format.time_pattern;
    }
    if (overrides.number_format) {
      baseConfig.defaults!.number = {
        ...baseConfig.defaults!.number,
        ...overrides.number_format
      };
    }

    setLoadedConfig(baseConfig);

  }, [semanticReady, registry, uiLocale]);
  // Reset local state when dataset changes
  useEffect(() => {
    cancelQuery();
    qa.reset();
    setStatusMessage(null);
    setIsExporting(false);
    setExportStatusMessage(null);
    setLastExportMessage(null);
    resetQuery();
  }, [selectedModelId, qs.mode]); // Also reset on mode change

  // Construct QueryIR Memoized
  const queryIR = useMemo<QueryIR | undefined>(() => {
    if (!activeDatasetAdapter) return undefined;
    return {
      mode: qs.mode,
      semanticModel: selectedModelId,
      columns: qs.selectedColumns,
      dimensions: qs.selectedDimensions,
      measures: qs.selectedMeasures,
      filters: qs.filters.map(f => ({ field: f.column, operator: f.operator as any, value: f.value })),
      measureFilters: qs.measureFilters.map(f => ({ field: f.column, operator: f.operator as any, value: f.value })),
      limit: qs.limit
    };
  }, [activeDatasetAdapter, qs, selectedModelId]);


  // Update SQL Preview
  useEffect(() => {
    if (!activeDatasetAdapter) return;

    // New Builder Logic
    try {
      // DuckDB WASM needs full URL for parquet files
      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL || '/';
      // Ensure we don't double slash if base is just '/' and we append it
      const fullBaseUrl = `${origin}${base.endsWith('/') ? base : base + '/'}`;

      const builder = new DuckDbSqlBuilder(fullBaseUrl);

      // Build if we have selection OR if we are in dataset mode (default to *)
      if (qs.mode === 'dataset' || (queryIR && ((queryIR.columns && queryIR.columns.length > 0) || queryIR.dimensions.length > 0 || queryIR.measures.length > 0))) {
        if (queryIR) {
          const sql = builder.build(queryIR);
          setGeneratedSql(sql);
        }
      } else {
        setGeneratedSql('-- Selecione colunas, dimensões ou medidas');
      }
    } catch (e) {
      setGeneratedSql(`-- Erro ao gerar SQL: ${e}`);
    }
  }, [activeDatasetAdapter, queryIR]);

  // Filter Handlers
  const handleAddFilter = () => {
    if (!activeDatasetAdapter) return;
    // Default to first available dimension
    const field = activeDatasetAdapter.semantic?.dimensions[0]?.name || activeDatasetAdapter.schema[0]?.name;
    if (field) qa.addFilter(field, 'dimension');
  };

  const handleAddMeasureFilter = () => {
    if (!activeDatasetAdapter?.semantic) return;
    const field = activeDatasetAdapter.semantic.measures[0]?.name;
    if (field) qa.addFilter(field, 'measure');
  };

  const handleRunQuery = () => {
    // Legacy: setStatusMessage(null);
    setLastExportMessage(null);

    const sqlToRun = viewMode === 'builder' ? generatedSql : editorSql;

    if (sqlToRun && !sqlToRun.startsWith('--')) {
      const ir = viewMode === 'builder' ? queryIR : undefined;
      executeQuery(sqlToRun, qs.mode === 'dataset' ? 'raw' : 'semantic', ir);
    }
  };

  const handleCancelQuery = async () => {
    await cancelQuery();
    setStatusMessage("Consulta cancelada pelo usuário.");
  };

  // Export Handlers
  const handleExportStart = () => {
    setIsExporting(true);
    setExportStatusMessage("Exportando resultado para arquivo CSV...");
    setStatusMessage(null);
    setLastExportMessage(null);
  };

  const handleExportEnd = (result: { success: boolean; message?: string; details?: { time: number; sizeMB: number } }) => {
    setIsExporting(false);
    setExportStatusMessage(null);

    if (result.success && result.details) {
      setLastExportMessage({
        text: `Exportação concluída. Tempo: ${result.details.time.toFixed(1)} segundos. Tamanho: ${result.details.sizeMB.toFixed(2)} MB.`,
        type: 'success'
      });
    } else {
      setLastExportMessage({
        text: result.message || "Exportação falhou.",
        type: 'error'
      });
    }
  };

  // Options
  const filterOptions = activeDatasetAdapter ? (
    activeDatasetAdapter.semantic
      ? activeDatasetAdapter.semantic.dimensions // Already flat enough for simple usage, or flattened by adapter?
      : activeDatasetAdapter.schema
  ) : [];

  const measureFilterOptions = activeDatasetAdapter?.semantic?.measures || [];

  // Calculate Config
  const currentLocale = uiLocale === 'system' ? (loadedConfig?.locale || navigator.language) : uiLocale;

  // Find locale definition in registry
  const localeDef = loadedConfig?.locales?.find((l: any) =>
    l.code === currentLocale ||
    (currentLocale.includes('-') && l.code === currentLocale) || // exact match
    l.code.startsWith(currentLocale.split('-')[0]) // lazy match pt-BR matches pt
  );

  const effectiveConfig: AppFormattingConfig = {
    ...DEFAULT_CONFIG,
    ...(loadedConfig || {}), // Global overrides
    ...(localeDef || {}),    // Locale-specific overrides (currency, csv)
    locale: currentLocale    // Ensure effective locale is current
  };

  // Combine executor status with local status message
  // Priority: Executor Status > Local Status (Cancel/Export)
  const displayStatus = executorStatus || statusMessage;




  // Ctrl+Enter to Run Query
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunQuery();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRunQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-app)', color: 'var(--text-main)' }}>


      {/* Header */}
      <header style={{
        height: '60px',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'var(--bg-panel)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>DuckDB WASM</h1>
          <span style={{ marginLeft: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Semantic Layer</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Toolbar
            db={db}
            queryLoading={queryLoading}
            isExporting={isExporting}
            queryState={{
              selectedDatasetId: selectedModelId,
              selectedColumns: qs.selectedColumns,
              selectedDimensions: qs.selectedDimensions,
              selectedMeasures: qs.selectedMeasures,
              limit: qs.limit,
              mode: qs.mode
            }}
            filters={qs.filters}
            measureFilters={qs.measureFilters}
            onRunQuery={handleRunQuery}
            onCancelQuery={handleCancelQuery}
            onExportStart={handleExportStart}
            onExportEnd={handleExportEnd}
            activeDataset={activeDatasetAdapter}
            formattingConfig={effectiveConfig}
          />

          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 10px' }} />

          {/* Settings */}
          <SettingsMenu
            theme={theme}
            setTheme={setTheme}
            uiLocale={uiLocale}
            setUiLocale={setUiLocale}
          />
        </div>
      </header>

      {/* Main Layout (Sidebar + Content) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '20px', padding: '20px', background: 'var(--bg-app)' }}>

        {/* Sidebar */}
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

        {/* Main Content (Results) */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}>



          <div style={{ flex: 1, overflow: 'hidden', padding: '0' }}>
            <ResultsView
              result={result}
              resultMode={resultMode}
              activeDataset={activeDatasetAdapter as any}
              formattingConfig={effectiveConfig}
            />
          </div>

          {/* Global Footer / System Status */}
          <div style={{
            padding: '5px 20px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            background: 'var(--bg-panel)'
          }}>
            {/* Active Status Display in Footer */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(warmingUp || queryLoading || isExporting || displayStatus || lastExportMessage || queryError) && (
                <div style={{ fontSize: '0.9em' }}>
                  {/* We reuse StatusMessage but might need to style it horizontally or compact */}
                  <StatusMessage
                    warmingUp={warmingUp}
                    queryLoading={queryLoading}
                    queryCancelling={queryCancelling}
                    isExporting={isExporting}
                    statusMessage={displayStatus}
                    exportStatusMessage={exportStatusMessage}
                    lastExportMessage={lastExportMessage}
                    executionTime={executionTime}
                    warmingUpTime={warmingUpTime}
                  />
                  {queryError && <span style={{ color: 'var(--color-error)', marginLeft: '10px' }}>Erro: {queryError}</span>}
                </div>
              )}
            </div>

            {result && <div>{result.numRows} linhas</div>}
          </div>
        </main>
      </div>

      {/* Modals */}
      <SqlPreviewModal
        isOpen={sqlPreviewOpen}
        onClose={() => setSqlPreviewOpen(false)}
        sql={generatedSql}
      />

    </div>
  );
}

export default App;
