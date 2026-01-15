import { useEffect, useState } from 'react';
import { useDuckDB } from './hooks/useDuckDB';
import { useDataset } from './hooks/useDataset';
import { useQueryExecutor } from './hooks/useQueryExecutor';
import { useAppQueryState } from './hooks/useAppQueryState';
import { useDuckDBWarmup } from './hooks/useDuckDBWarmup';
import { useTheme } from './hooks/useTheme';
import { buildSql } from './services/semantic/queryBuilder';
import { MetadataService } from './services/semantic/MetadataService';
import { DatasetSelector } from './components/controls/DatasetSelector';
import { QueryBuilderUI } from './components/controls/QueryBuilderUI';
import { FilterList } from './components/controls/FilterList';
import { ResultsView } from './components/data-display/ResultsView';
import { StatusBar } from './components/layout/StatusBar';
import { ExecutionBar } from './components/controls/ExecutionBar';
import { StatusMessage } from './components/feedback/StatusMessage';
import type { QueryState } from './types';
import { format } from 'sql-formatter';
import { setConfig, type AppFormattingConfig } from './lib/formatting';

function App() {
  // Theme Hook
  const { theme, setTheme } = useTheme();

  // Hooks
  const { db, status: dbStatus, version } = useDuckDB();
  const {
    datasets, selectedDatasetId, setSelectedDatasetId,
    activeDataset, loading: datasetLoading, error: datasetError
  } = useDataset();

  const {
    execute: executeQuery, cancel: cancelQuery, reset: resetQuery, result, executionTime,
    loading: queryLoading, cancelling: queryCancelling, error: queryError, resultMode
  } = useQueryExecutor(db);

  // App Query State
  const { state: qs, actions: qa } = useAppQueryState();

  const [generatedSql, setGeneratedSql] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Warmup Logic
  const { warmingUp, warmingUpTime } = useDuckDBWarmup(db, activeDataset);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  const [lastExportMessage, setLastExportMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);

  // Helpers
  const isSemanticMode = () => qs.isSemanticMode;

  // Load Config
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}metadata/config.json`)
      .then(res => res.json())
      .then((config: AppFormattingConfig) => {
        console.log('Loaded config:', config);
        setConfig(config);
      })
      .catch(err => console.warn('Failed to load config, using defaults', err));
  }, []);

  // Reset local state when dataset changes
  useEffect(() => {
    cancelQuery();
    qa.reset();
    setStatusMessage(null);
    setIsExporting(false);
    setExportStatusMessage(null);
    setLastExportMessage(null);
    resetQuery();
  }, [activeDataset]);

  // Update SQL Preview
  useEffect(() => {
    const queryState: QueryState = {
      selectedDatasetId,
      selectedColumns: qs.selectedColumns,
      selectedDimensions: qs.selectedDimensions,
      selectedMeasures: qs.selectedMeasures,
      limit: qs.limit
    };
    const sql = buildSql(activeDataset, queryState, qs.filters, qs.measureFilters);
    setGeneratedSql(sql);
  }, [activeDataset, qs.selectedColumns, qs.selectedDimensions, qs.selectedMeasures, qs.limit, qs.filters, qs.measureFilters, selectedDatasetId]);

  // Filter Handlers
  const handleAddFilter = () => {
    if (!activeDataset) return;
    const field = isSemanticMode() && activeDataset.semantic
      ? activeDataset.semantic.dimensions[0]?.name
      : activeDataset.schema[0]?.name;

    if (field) qa.addFilter(field, 'dimension');
  };

  const handleAddMeasureFilter = () => {
    if (!activeDataset?.semantic) return;
    const field = activeDataset.semantic.measures[0]?.name;
    if (field) qa.addFilter(field, 'measure');
  };

  const handleRunQuery = () => {
    setStatusMessage(null);
    setLastExportMessage(null);
    if (generatedSql) {
      executeQuery(generatedSql, isSemanticMode() ? 'semantic' : 'raw');
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
  const filterOptions = activeDataset ? (
    isSemanticMode() && activeDataset.semantic
      ? MetadataService.getFlatDimensions(activeDataset)
      : activeDataset.schema
  ) : [];

  const measureFilterOptions = activeDataset?.semantic?.measures || [];

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>DuckDB WASM - Refatorado</h1>

        {/* Theme Toggle */}
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as any)}
          style={{ padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
          aria-label="Selecionar tema"
        >
          <option value="system">Sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </div>

      <StatusBar dbStatus={dbStatus} version={version} />

      <DatasetSelector
        datasets={datasets}
        selectedId={selectedDatasetId}
        onSelect={setSelectedDatasetId}
        loading={datasetLoading}
      />

      {datasetError && <div style={{ color: 'red' }}>{datasetError}</div>}

      {activeDataset && (
        <>
          <QueryBuilderUI
            activeDataset={activeDataset}
            selectedColumns={qs.selectedColumns}
            selectedDimensions={qs.selectedDimensions}
            selectedMeasures={qs.selectedMeasures}
            onToggleColumn={qa.toggleColumn}
            onToggleDimension={qa.toggleDimension}
            onToggleMeasure={qa.toggleMeasure}
          />

          <FilterList
            title={isSemanticMode() ? 'Filtros de Dimensão (WHERE)' : 'Filtros'}
            filters={qs.filters}
            options={filterOptions}
            onAdd={handleAddFilter}
            onRemove={(id) => qa.removeFilter(id, 'dimension')}
            onUpdate={(id, f, v) => qa.updateFilter(id, f, v, 'dimension')}
            type="dimension"
            color="var(--text-main)"
            bgColor="var(--bg-panel-secondary)"
          />

          {isSemanticMode() && activeDataset.semantic && (
            <FilterList
              title="Filtros de Medida (HAVING)"
              filters={qs.measureFilters}
              options={measureFilterOptions}
              onAdd={handleAddMeasureFilter}
              onRemove={(id) => qa.removeFilter(id, 'measure')}
              onUpdate={(id, f, v) => qa.updateFilter(id, f, v, 'measure')}
              type="measure"
              color="var(--text-main)"
              bgColor="var(--bg-panel-secondary)"
            />
          )}

          {/* Limit & Preview */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold', marginRight: '5px' }}>Limite:</label>
              <input
                type="number"
                value={qs.limit}
                onChange={(e) => qa.setLimit(Number(e.target.value))}
                style={{ padding: '5px', width: '80px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
              />
            </div>
            <label style={{ fontWeight: 'bold' }}>SQL Preview:</label>
            <pre style={{ background: '#333', color: '#fff', padding: '10px', borderRadius: '4px', overflowX: 'auto', marginTop: '5px' }}>
              {format(generatedSql, { language: 'postgresql' })}
            </pre>
          </div>

          <ExecutionBar
            db={db}
            activeDataset={activeDataset}
            queryLoading={queryLoading}
            queryCancelling={queryCancelling}
            warmingUp={warmingUp}
            isExporting={isExporting}
            queryState={{
              selectedDatasetId,
              selectedColumns: qs.selectedColumns,
              selectedDimensions: qs.selectedDimensions,
              selectedMeasures: qs.selectedMeasures,
              limit: qs.limit
            }}
            filters={qs.filters}
            measureFilters={qs.measureFilters}
            onRunQuery={handleRunQuery}
            onCancelQuery={handleCancelQuery}
            onExportStart={handleExportStart}
            onExportEnd={handleExportEnd}
            onExportStatus={setExportStatusMessage}
          />

          {/* Status Message Display */}
          <div style={{ marginBottom: '20px', minHeight: '24px' }}>
            <StatusMessage
              warmingUp={warmingUp}
              queryLoading={queryLoading}
              queryCancelling={queryCancelling}
              isExporting={isExporting}
              statusMessage={statusMessage}
              exportStatusMessage={exportStatusMessage}
              lastExportMessage={lastExportMessage}
              executionTime={executionTime}
              warmingUpTime={warmingUpTime}
            />
          </div>

          {queryError && (
            <div style={{ color: 'red', marginBottom: '20px', padding: '10px', border: '1px solid red', borderRadius: '4px' }}>
              <strong>Erro na execução:</strong> {queryError}
            </div>
          )}

          <ResultsView
            result={result}
            resultMode={resultMode}
            activeDataset={activeDataset}
          />
        </>
      )}
    </div>
  );
}

export default App;
