import { useEffect, useState, useMemo } from 'react';
import { useDuckDB } from './hooks/useDuckDB';
import { useSemanticLayer } from './hooks/useSemanticLayer';
import { useQueryExecutor } from './hooks/useQueryExecutor';
import { useAppQueryState } from './hooks/useAppQueryState';
import { useDuckDBWarmup } from './hooks/useDuckDBWarmup';
import { useTheme } from './hooks/useTheme';
import { useAppConfig } from './hooks/useAppConfig';
import { DuckDbSqlBuilder } from './semantic/sql_builder_duckdb';
import { ResultsView } from './components/data-display/ResultsView';

import { Toolbar } from './components/layout/Toolbar';
import { StatusMessage } from './components/feedback/StatusMessage';
import { SettingsMenu } from './components/layout/SettingsMenu';
import { SqlPreviewModal } from './components/modals/SqlPreviewModal';
import { Sidebar } from './components/layout/Sidebar';
import type { QueryIR } from './semantic/types';

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

  // Load Config
  const { effectiveConfig } = useAppConfig(registry, semanticReady, uiLocale);


  // Semantic State
  const [selectedModelId, setSelectedModelId] = useState<string>('');

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

  // Warmup Logic
  const { warmingUp, warmingUpTime } = useDuckDBWarmup(db, activeDatasetAdapter);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [lastExportMessage, setLastExportMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

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
      filters: qs.filters.map(f => ({ field: f.column, operator: f.operator as any, value: f.value, granularity: f.granularity as any })),
      measureFilters: qs.measureFilters.map(f => ({ field: f.column, operator: f.operator as any, value: f.value, granularity: f.granularity as any })),
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

      const builder = new DuckDbSqlBuilder(registry, fullBaseUrl);

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
  const handleAddFilter = (filter?: { column: string, operator: string, value: string, granularity?: string }) => {
    if (!activeDatasetAdapter) return;
    if (filter) {
      qa.addFilter(filter, 'dimension');
    } else {
      // Default to first available dimension
      const field = activeDatasetAdapter.semantic?.dimensions[0]?.name || activeDatasetAdapter.schema[0]?.name;
      if (field) qa.addFilter(field, 'dimension');
    }
  };

  const handleAddMeasureFilter = (filter?: { column: string, operator: string, value: string }) => {
    if (!activeDatasetAdapter?.semantic) return;
    if (filter) {
      qa.addFilter(filter, 'measure');
    } else {
      const field = activeDatasetAdapter.semantic.measures[0]?.name;
      if (field) qa.addFilter(field, 'measure');
    }
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
      ? activeDatasetAdapter.semantic.dimensions.map((d: any) => ({
        name: d.name,
        label: d.label,
        groupLabel: d.group,
        type: d.type || d.dataType || 'VARCHAR', // Pass type
        granularities: d.type_params?.available_granularities
      }))
      : activeDatasetAdapter.schema.map((c: any) => ({
        name: c.name,
        label: c.name,
        type: c.type // Pass schema type
      }))
  ) : [];

  const measureFilterOptions = activeDatasetAdapter?.semantic?.measures.map((m: any) => ({
    name: m.name,
    label: m.label,
    type: 'FLOAT' // Measures are almost always numbers
  })) || [];


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
        background: 'var(--bg-panel)',
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Logo Placeholder - will be replaced by img tag later if we want inline logo */}
          <h1 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: '600',
            letterSpacing: '-0.5px',
            color: 'var(--primary-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            Tabulador
          </h1>
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
        <Sidebar
          viewMode={viewMode}
          setViewMode={setViewMode}
          qs={qs}
          qa={qa}
          semanticReady={semanticReady}
          semanticError={semanticError ? semanticError.message : null}
          activeDatasetAdapter={activeDatasetAdapter}
          selectorItems={selectorItems}
          selectedModelId={selectedModelId}
          setSelectedModelId={setSelectedModelId}
          editorSql={editorSql}
          setEditorSql={setEditorSql}
          effectiveConfig={effectiveConfig}
          handleAddFilter={handleAddFilter}
          handleAddMeasureFilter={handleAddMeasureFilter}
          setSqlPreviewOpen={setSqlPreviewOpen}
          filterOptions={filterOptions}
          measureFilterOptions={measureFilterOptions}
        />

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
