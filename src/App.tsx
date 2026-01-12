import { useEffect, useState } from 'react';
import { useDuckDB } from './hooks/useDuckDB';
import { useDataset } from './hooks/useDataset';
import { useQueryExecutor } from './hooks/useQueryExecutor';
import { buildSql } from './services/semantic/queryBuilder';
import { DatasetSelector } from './components/controls/DatasetSelector';
import { QueryBuilderUI } from './components/controls/QueryBuilderUI';
import { FilterList } from './components/controls/FilterList';
import { ExportControls } from './components/controls/ExportControls';
import { ResultsView } from './components/data-display/ResultsView';
import type { Filter, QueryState } from './types';
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
    execute: executeQuery, result, executionTime,
    loading: queryLoading, error: queryError, resultMode
  } = useQueryExecutor(db);

  // Local State for Query
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);
  const [limit, setLimit] = useState<number>(10000);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [measureFilters, setMeasureFilters] = useState<Filter[]>([]);

  const [generatedSql, setGeneratedSql] = useState<string>('');

  // Helpers
  const isSemanticMode = () => selectedDimensions.length > 0 || selectedMeasures.length > 0;

  // Load Config
  useEffect(() => {
    fetch('/metadata/config.json')
      .then(res => res.json())
      .then((config: AppFormattingConfig) => {
        console.log('Loaded config:', config);
        setConfig(config);
      })
      .catch(err => console.warn('Failed to load config, using defaults', err));
  }, []);

  // Reset local state when dataset changes
  useEffect(() => {
    setSelectedColumns([]);
    setSelectedDimensions([]);
    setSelectedMeasures([]);
    setFilters([]);
    setMeasureFilters([]);
  }, [activeDataset]);

  // Update SQL Preview
  useEffect(() => {
    const queryState: QueryState = {
      selectedDatasetId,
      selectedColumns,
      selectedDimensions,
      selectedMeasures,
      limit
    };
    const sql = buildSql(activeDataset, queryState, filters, measureFilters);
    setGeneratedSql(sql);
  }, [activeDataset, selectedColumns, selectedDimensions, selectedMeasures, limit, filters, measureFilters, selectedDatasetId]);

  // Handlers
  const handleToggleColumn = (col: string) => {
    setSelectedColumns(prev => {
      const newState = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
      if (newState.length > 0 && (selectedDimensions.length || selectedMeasures.length)) {
        setSelectedDimensions([]);
        setSelectedMeasures([]);
      }
      return newState;
    });
  };

  const handleToggleDimension = (dim: string) => {
    setSelectedDimensions(prev => {
      const newState = prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim];
      if (newState.length > 0) setSelectedColumns([]);
      return newState;
    });
  };

  const handleToggleMeasure = (meas: string) => {
    setSelectedMeasures(prev => {
      const newState = prev.includes(meas) ? prev.filter(m => m !== meas) : [...prev, meas];
      if (newState.length > 0) setSelectedColumns([]);
      return newState;
    });
  };

  // Filter Handlers
  const handleAddFilter = () => {
    if (!activeDataset) return;
    const field = isSemanticMode() && activeDataset.semantic
      ? activeDataset.semantic.dimensions[0]?.name
      : activeDataset.schema[0]?.name;

    if (field) {
      setFilters([...filters, { id: Date.now(), column: field, operator: '=', value: '' }]);
    }
  };

  const handleAddMeasureFilter = () => {
    if (!activeDataset?.semantic) return;
    const field = activeDataset.semantic.measures[0]?.name;
    if (field) {
      setMeasureFilters([...measureFilters, { id: Date.now(), column: field, operator: '>', value: '' }]);
    }
  };

  const handleUpdateFilter = (list: Filter[], setList: Function, id: number, field: keyof Filter, value: string) => {
    setList(list.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const handleRunQuery = () => {
    if (generatedSql) {
      executeQuery(generatedSql, isSemanticMode() ? 'semantic' : 'raw');
    }
  };

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
            selectedColumns={selectedColumns}
            selectedDimensions={selectedDimensions}
            selectedMeasures={selectedMeasures}
            onToggleColumn={handleToggleColumn}
            onToggleDimension={handleToggleDimension}
            onToggleMeasure={handleToggleMeasure}
          />

          <FilterList
            title={isSemanticMode() ? 'Filtros de Dimensão (WHERE)' : 'Filtros'}
            filters={filters}
            options={filterOptions}
            onAdd={handleAddFilter}
            onRemove={(id) => setFilters(filters.filter(f => f.id !== id))}
            onUpdate={(id, f, v) => handleUpdateFilter(filters, setFilters, id, f, v)}
            type="dimension"
            color="#b38f00"
            bgColor="#fff9e6"
          />

          {isSemanticMode() && activeDataset.semantic && (
            <FilterList
              title="Filtros de Medida (HAVING)"
              filters={measureFilters}
              options={measureFilterOptions}
              onAdd={handleAddMeasureFilter}
              onRemove={(id) => setMeasureFilters(measureFilters.filter(f => f.id !== id))}
              onUpdate={(id, f, v) => handleUpdateFilter(measureFilters, setMeasureFilters, id, f, v)}
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
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
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
            <button
              onClick={handleRunQuery}
              disabled={!db || queryLoading}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                cursor: (!db || queryLoading) ? 'not-allowed' : 'pointer',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px'
              }}
            >
              {queryLoading ? 'Executando...' : 'Executar consulta'}
            </button>

            <ExportControls
              db={db}
              activeDataset={activeDataset}
              queryState={{ selectedDatasetId, selectedColumns, selectedDimensions, selectedMeasures, limit }}
              filters={filters}
              measureFilters={measureFilters}
            />

            {executionTime && (
              <span style={{ color: '#666' }}>Tempo: {executionTime.toFixed(2)}ms</span>
            )}
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
