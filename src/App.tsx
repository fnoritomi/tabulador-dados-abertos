import { useEffect, useState, useRef } from 'react';
import { useDuckDB } from './hooks/useDuckDB';
import { useDataset } from './hooks/useDataset';
import { useQueryExecutor } from './hooks/useQueryExecutor';
import { useAppQueryState } from './hooks/useAppQueryState';
import { buildSql } from './services/semantic/queryBuilder';
import { DatasetSelector } from './components/controls/DatasetSelector';
import { QueryBuilderUI } from './components/controls/QueryBuilderUI';
import { FilterList } from './components/controls/FilterList';
import { ExportControls } from './components/controls/ExportControls';
import { ResultsView } from './components/data-display/ResultsView';
import type { QueryState } from './types';
import { format } from 'sql-formatter';
import { setConfig, type AppFormattingConfig } from './lib/formatting';

function App() {
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

  // Warm-up State
  const [warmingUp, setWarmingUp] = useState(false);
  const [warmingUpTime, setWarmingUpTime] = useState<number | null>(null);
  const warmupConnRef = useRef<any>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string | null>(null);
  // lastExportResult now holds both SUCCESS and ERROR/CANCEL messages from export
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
    // 1. Cancel running user query
    cancelQuery();

    // 2. Clear state
    qa.reset();
    setWarmingUpTime(null);
    setStatusMessage(null);
    setIsExporting(false);
    setExportStatusMessage(null);
    setLastExportMessage(null);
    resetQuery();
  }, [activeDataset]);

  // Warm-up Effect
  useEffect(() => {
    const performWarmup = async () => {
      if (!db || !activeDataset || !activeDataset.sources || activeDataset.sources.length === 0) return;

      setWarmingUp(true);
      const start = performance.now();

      try {
        const conn = await db.connect();
        warmupConnRef.current = conn;

        // Execute count on metadata for each source file to warn up DuckDB cache
        for (const source of activeDataset.sources) {
          // Check if cancelled (e.g. by cleanup)
          if (!warmupConnRef.current) break;

          try {
            // We use count(*) on parquet_metadata to force reading file footer/metadata without reading all data
            await conn.query(`SELECT count(*) FROM parquet_metadata('${source}')`);
          } catch (err) {
            console.warn(`Failed to warm up source ${source}`, err);
          }
        }

        if (warmupConnRef.current) {
          await conn.close();
          // Ref clearing moved to finally
          const end = performance.now();
          setWarmingUpTime(end - start);
          console.log(`Warm-up completed in ${(end - start).toFixed(2)}ms`);
        }
      } catch (err) {
        console.error("Warm-up failed", err);
      } finally {
        if (warmupConnRef.current) { // Only set false if we weren't cancelled (ref still exists)
          warmupConnRef.current = null;
          setWarmingUp(false);
        }
      }
    };

    performWarmup();

    return () => {
      // Cleanup: Cancel warmup if in progress
      if (warmupConnRef.current) {
        console.log("Cancelling warm-up due to effect cleanup");
        warmupConnRef.current.cancelSent().catch(console.warn);
        warmupConnRef.current.close().catch(console.warn);
        warmupConnRef.current = null;
        setWarmingUp(false);
      }
    };
  }, [activeDataset, db]);


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

  // Handlers - Simplified by useAppQueryState

  // Filter Handlers
  const handleAddFilter = () => {
    if (!activeDataset) return;
    const field = isSemanticMode() && activeDataset.semantic
      ? activeDataset.semantic.dimensions[0]?.name
      : activeDataset.schema[0]?.name;

    if (field) {
      qa.addFilter(field, 'dimension');
    }
  };

  const handleAddMeasureFilter = () => {
    if (!activeDataset?.semantic) return;
    const field = activeDataset.semantic.measures[0]?.name;
    if (field) {
      qa.addFilter(field, 'measure');
    }
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

  const handleExportStatus = (msg: string) => {
    setExportStatusMessage(msg);
  }

  // Preparation for UI options
  const filterOptions = activeDataset ? (
    isSemanticMode() && activeDataset.semantic
      ? activeDataset.semantic.dimensions
      : activeDataset.schema
  ) : [];

  const measureFilterOptions = activeDataset?.semantic?.measures || [];

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>DuckDB WASM - Refatorado</h1>

      {/* Footer / Status Bar */}
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '4px', fontSize: '0.9em' }}>
        <strong>System Status:</strong> {dbStatus} {version && `(${version})`}
      </div>

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
            color="#b38f00"
            bgColor="#fff9e6"
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
              color="#155724"
              bgColor="#d4edda"
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
                style={{ padding: '5px', width: '80px' }}
              />
            </div>
            <label style={{ fontWeight: 'bold' }}>SQL Preview:</label>
            <pre style={{ background: '#333', color: '#fff', padding: '10px', borderRadius: '4px', overflowX: 'auto', marginTop: '5px' }}>
              {format(generatedSql, { language: 'postgresql' })}
            </pre>
          </div>

          {/* Execution Controls */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            {queryLoading && !warmingUp && (
              <button
                onClick={handleCancelQuery}
                disabled={queryCancelling}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  cursor: queryCancelling ? 'not-allowed' : 'pointer',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  opacity: queryCancelling ? 0.7 : 1
                }}
              >
                Cancelar
              </button>
            )}

            {!queryLoading && (
              <button
                onClick={handleRunQuery}
                disabled={!db || warmingUp || isExporting}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  cursor: (!db || warmingUp || isExporting) ? 'not-allowed' : 'pointer',
                  backgroundColor: (!db || warmingUp || isExporting) ? '#e0e0e0' : '#007bff',
                  color: (!db || warmingUp || isExporting) ? '#888' : 'white',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                {warmingUp ? 'Carregando estatísticas...' : 'Executar consulta'}
              </button>
            )}

            <ExportControls
              db={db}
              activeDataset={activeDataset}
              queryState={{
                selectedDatasetId,
                selectedColumns: qs.selectedColumns,
                selectedDimensions: qs.selectedDimensions,
                selectedMeasures: qs.selectedMeasures,
                limit: qs.limit
              }}
              filters={qs.filters}
              measureFilters={qs.measureFilters}
              disabled={warmingUp || queryLoading || isExporting}
              onExportStart={handleExportStart}
              onExportEnd={handleExportEnd}
              onExportStatus={handleExportStatus}
            />

            {/* UNIFIED STATUS DISPLAY */}
            {(() => {
              if (warmingUp) {
                return <span style={{ color: '#e67e22', fontWeight: 'bold' }}>Carregando estatísticas dos conjuntos de dados...</span>;
              }
              if (queryLoading) {
                return <span style={{ color: '#007bff', fontWeight: 'bold' }}>{queryCancelling ? 'Cancelando consulta...' : 'Executando consulta...'}</span>;
              }
              // Exporting status takes precedence over old results
              if (isExporting) {
                return <span style={{ color: '#28a745', fontWeight: 'bold' }}>{exportStatusMessage || "Exportando..."}</span>;
              }
              // Last Export Result (Success or Error/Cancelled) gets high priority visibility after export ends
              if (lastExportMessage) {
                return (
                  <span style={{ color: lastExportMessage.type === 'error' ? 'red' : ((lastExportMessage.type === 'success') ? '#666' : '#007bff') }}>
                    {lastExportMessage.text}
                  </span>
                );
              }
              // Query Status/Cancellation
              if (statusMessage) {
                return <span style={{ color: '#666' }}>{statusMessage}</span>;
              }
              // Query Time (only if no export msg)
              if (executionTime) {
                return <span style={{ color: '#666' }}>Tempo: {executionTime.toFixed(2)}ms</span>;
              }
              // Warmup Time (lowest priority)
              if (warmingUpTime) {
                return <span style={{ color: '#666' }}>Estatísticas carregadas em {warmingUpTime.toFixed(2)}ms</span>;
              }
              return null;
            })()}
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
