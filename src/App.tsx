import { useEffect, useState } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { initDuckDB } from './duckdb/db';
import { fetchDatasetIndex, fetchDataset, type DatasetIndexItem, type Dataset } from './lib/metadata';
import VirtualizedTable from './components/VirtualizedTable';

interface Filter {
  id: number;
  column: string;
  operator: string;
  value: string;
}

function App() {
  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
  const [version, setVersion] = useState<string>('');
  const [status, setStatus] = useState<string>('Initializing...');
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  // Metadata state
  const [datasets, setDatasets] = useState<DatasetIndexItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null);

  // Query Builder State
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]); // For Raw Mode
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]); // For Semantic Mode
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]); // For Semantic Mode
  const [limit, setLimit] = useState<number>(10000);
  const [generatedSql, setGeneratedSql] = useState<string>('');

  // Filters State
  const [filters, setFilters] = useState<Filter[]>([]);
  const [measureFilters, setMeasureFilters] = useState<Filter[]>([]);

  // Track which mode generated the current result
  const [resultMode, setResultMode] = useState<'raw' | 'semantic'>('raw');

  useEffect(() => {
    const loadDB = async () => {
      try {
        const database = await initDuckDB();
        setDb(database);
        const ver = await database.getVersion();
        setVersion(ver);
        setStatus('DuckDB carregado com sucesso');
      } catch (e) {
        console.error(e);
        setStatus('Erro ao carregar DuckDB');
      }
    };

    const loadMetadata = async () => {
      try {
        const index = await fetchDatasetIndex();
        setDatasets(index);
        if (index.length > 0) {
          setSelectedDatasetId(index[0].id);
        }
      } catch (e) {
        console.error(e);
        setError('Erro ao carregar catálogo de datasets');
      }
    };

    loadDB();
    loadMetadata();
  }, []);

  // Load active dataset details when selection changes
  useEffect(() => {
    const loadActiveDataset = async () => {
      if (!selectedDatasetId) return;
      const item = datasets.find(d => d.id === selectedDatasetId);
      if (!item) return;

      try {
        const ds = await fetchDataset(item.path);
        setActiveDataset(ds);
        // Reset selections
        setSelectedColumns([]);
        setSelectedDimensions([]);
        setSelectedMeasures([]);
        setFilters([]);
        setMeasureFilters([]);
        setResult(null);
        setExecutionTime(null);
      } catch (e) {
        console.error(e);
        setError(`Erro ao carregar detalhes do dataset ${item.name}`);
      }
    };
    loadActiveDataset();
  }, [selectedDatasetId, datasets]);

  const toggleColumn = (colName: string) => {
    setSelectedColumns(prev =>
      prev.includes(colName)
        ? prev.filter(c => c !== colName)
        : [...prev, colName]
    );
  };

  const toggleDimension = (dimName: string) => {
    setSelectedDimensions(prev =>
      prev.includes(dimName)
        ? prev.filter(d => d !== dimName)
        : [...prev, dimName]
    );
  };

  const toggleMeasure = (measName: string) => {
    setSelectedMeasures(prev =>
      prev.includes(measName)
        ? prev.filter(m => m !== measName)
        : [...prev, measName]
    );
  };

  const isSemanticMode = () => selectedDimensions.length > 0 || selectedMeasures.length > 0;

  const addFilter = () => {
    if (!activeDataset) return;

    let field = '';
    if (isSemanticMode() && activeDataset.semantic) {
      field = activeDataset.semantic.dimensions[0]?.name;
    } else {
      field = activeDataset.schema[0]?.name;
    }

    if (field) {
      setFilters([...filters, { id: Date.now(), column: field, operator: '=', value: '' }]);
    }
  };

  const removeFilter = (id: number) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const updateFilter = (id: number, field: keyof Filter, value: string) => {
    setFilters(filters.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  // Measure Filters (HAVING)
  const addMeasureFilter = () => {
    if (!activeDataset?.semantic) return;
    const field = activeDataset.semantic.measures[0]?.name;
    if (field) {
      setMeasureFilters([...measureFilters, { id: Date.now(), column: field, operator: '>', value: '' }]);
    }
  };

  const removeMeasureFilter = (id: number) => {
    setMeasureFilters(measureFilters.filter(f => f.id !== id));
  };

  const updateMeasureFilter = (id: number, field: keyof Filter, value: string) => {
    setMeasureFilters(measureFilters.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const getSql = (ignoreLimit: boolean = false) => {
    if (!activeDataset) return '';
    const parquetUrl = activeDataset.sources[0];

    // Build WHERE clause
    let whereClause = '';
    if (filters.length > 0) {
      const conditions = filters.map(f => {
        if (!f.value) return null;

        // Simple type check to quote strings/dates
        const colDef = activeDataset.schema.find(c => c.name === f.column);
        const isString = colDef?.type === 'VARCHAR' || colDef?.type === 'DATE';

        let val = f.value;
        if (f.operator === 'IN') {
          // Handle comma separated list
          val = `(${f.value.split(',').map(v => isString ? `'${v.trim()}'` : v.trim()).join(', ')})`;
        } else if (isString) {
          val = `'${f.value}'`;
        }

        return `${f.column} ${f.operator} ${val}`;
      }).filter(Boolean);

      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }
    }

    if (isSemanticMode()) {
      // Aggregation Mode
      const selectDims = selectedDimensions.join(', ');
      const selectMeas = selectedMeasures.map(m => {
        const measureDef = activeDataset.semantic?.measures.find(def => def.name === m);
        return measureDef ? `${measureDef.sql} AS ${measureDef.name}` : m;
      }).join(', ');

      const selectClause = [selectDims, selectMeas].filter(Boolean).join(', ');

      const groupByClause = selectedDimensions.length > 0
        ? `GROUP BY ${selectedDimensions.map((_, i) => i + 1).join(', ')}`
        : '';

      // Build HAVING clause
      let havingClause = '';
      if (measureFilters.length > 0) {
        const conditions = measureFilters.map(f => {
          if (!f.value) return null;
          // For HAVING context, we must use the aggregation expression if the alias isn't in SELECT output
          // or to be safe in all cases.
          const measureDef = activeDataset.semantic?.measures.find(m => m.name === f.column);
          const expression = measureDef ? measureDef.sql : f.column;

          return `${expression} ${f.operator} ${f.value}`;
        }).filter(Boolean);

        if (conditions.length > 0) {
          havingClause = `HAVING ${conditions.join(' AND ')}`;
        }
      }

      const limitClause = ignoreLimit ? '' : `LIMIT ${limit}`;
      return `SELECT ${selectClause || '*'} FROM read_parquet('${parquetUrl}') ${whereClause} ${groupByClause} ${havingClause} ${limitClause}`;
    }

    // Raw Mode
    const activeCols = [...selectedColumns, ...selectedDimensions];
    const cols = activeCols.length > 0 ? activeCols.join(', ') : '*';
    const limitClause = ignoreLimit ? '' : `LIMIT ${limit}`;
    return `SELECT ${cols} FROM read_parquet('${parquetUrl}') ${whereClause} ${limitClause}`;
  };

  useEffect(() => {
    setGeneratedSql(getSql());
  }, [activeDataset, selectedColumns, selectedDimensions, selectedMeasures, limit, filters, measureFilters]);

  const runQuery = async () => {
    if (!db || !activeDataset) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setExecutionTime(null);

    const mode = isSemanticMode() ? 'semantic' : 'raw';
    setResultMode(mode);
    const sql = getSql();

    try {
      const start = performance.now();
      const conn = await db.connect();
      const table = await conn.query(sql);
      const end = performance.now();

      setExecutionTime(end - start);
      setResult(table);
      await conn.close();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao executar consulta');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!db || !activeDataset) return;
    setLoading(true);

    try {
      // 1. Get SQL without limit (or very high limit)
      // We need to bypass the limit set in UI for export
      const exportSql = getSql(true);

      let fileHandle: any = null;
      let writable: any = null;

      // 2. Try File System Access API
      try {
        // @ts-ignore - Trigger 'Save As' dialog
        fileHandle = await window.showSaveFilePicker({
          suggestedName: `export_${activeDataset.id}_${Date.now()}.csv`,
          types: [{
            description: 'Comma Separated Values',
            accept: { 'text/csv': ['.csv'] },
          }],
        });
        writable = await fileHandle.createWritable();
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setLoading(false);
          return; // User cancelled
        }
        console.warn('File System Access API likely not supported, falling back to Blob download currently not fully implemented for streaming large files in this iteration.', err);
        // Fallback could be implemented here but plan focuses on FS API predominantly.
        // For now, let's proceed with just FS API or error out if critical.
        setError("Seu navegador não suporta salvamento direto ou foi bloqueado. Tente usar Chrome/Edge.");
        setLoading(false);
        return;
      }

      // 3. Streaming Execution
      const conn = await db.connect();
      const results = await conn.send(exportSql);

      // 4. Transform and Stream Write
      const { arrowBatchToCsv } = await import('./lib/csvUtils');

      let isFirstBatch = true;
      // Depending on version, conn.send might return a Table (materialized) or an AsyncIterator.
      // If it is a Table (as TS suggests by inferring StructRow on default iteration), we should iterate its batches.
      const batches = (results as any).batches || results;

      for await (const batch of batches) {
        const csvChunk = arrowBatchToCsv(batch, isFirstBatch);
        await writable.write(csvChunk);
        isFirstBatch = false;
      }

      await writable.close();
      await conn.close();

    } catch (err: any) {
      console.error(err);
      setError('Erro ao exportar CSV: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getColumnLabel = (colName: string): string => {
    if (resultMode !== 'semantic') return colName;

    if (!activeDataset?.semantic) return colName;
    const dim = activeDataset.semantic.dimensions.find(d => d.name === colName);
    if (dim?.label) return dim.label;
    const meas = activeDataset.semantic.measures.find(m => m.name === colName);
    if (meas?.label) return meas.label;
    return colName;
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>DuckDB WASM - Iteração 7</h1>
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
        <strong>Status:</strong> {status} {version && `(${version})`}
      </div>

      {/* Dataset Selection */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Dataset:</label>
        <select
          value={selectedDatasetId}
          onChange={(e) => setSelectedDatasetId(e.target.value)}
          style={{ padding: '8px', fontSize: '16px', borderRadius: '4px' }}
        >
          {!datasets.length && <option>Carregando...</option>}
          {datasets.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

        {/* Raw Columns Selection */}
        {activeDataset && (
          <div style={{ flex: 1, minWidth: '300px', marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
            <h3 style={{ marginTop: 0 }}>Colunas (Raw)</h3>
            {/* Clear/Reset logic for UI simplicity: If semantic used, uncheck raw */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {activeDataset.schema.map(col => (
                <label key={col.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col.name)}
                    onChange={() => {
                      toggleColumn(col.name);
                      // Clear semantic selections if raw is used to avoid confusion
                      if (selectedDimensions.length || selectedMeasures.length) {
                        setSelectedDimensions([]);
                        setSelectedMeasures([]);
                      }
                    }}
                    style={{ marginRight: '5px' }}
                  />
                  {col.name} <span style={{ color: '#999', fontSize: '0.8em', marginLeft: '4px' }}>({col.type})</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Semantic Selection */}
        {activeDataset?.semantic && (
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
                      onChange={() => {
                        toggleDimension(dim.name);
                        // Clear raw selections
                        if (selectedColumns.length) setSelectedColumns([]);
                      }}
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
                      onChange={() => {
                        toggleMeasure(meas.name);
                        // Clear raw selections
                        if (selectedColumns.length) setSelectedColumns([]);
                      }}
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

      {/* Filters Section (WHERE) */}
      {activeDataset && (
        <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff9e6' }}>
          <h3 style={{ marginTop: 0, color: '#b38f00' }}>
            {isSemanticMode() ? 'Filtros de Dimensão (WHERE)' : 'Filtros'}
          </h3>
          {filters.map(filter => (
            <div key={filter.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
              <select
                value={filter.column}
                onChange={(e) => updateFilter(filter.id, 'column', e.target.value)}
                style={{ padding: '5px' }}
              >
                {isSemanticMode() && activeDataset.semantic
                  ? activeDataset.semantic.dimensions.map(dim => (
                    <option key={dim.name} value={dim.name}>{dim.label || dim.name}</option>
                  ))
                  : activeDataset.schema.map(col => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))
                }
              </select>
              <select
                value={filter.operator}
                onChange={(e) => updateFilter(filter.id, 'operator', e.target.value)}
                style={{ padding: '5px' }}
              >
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&gt;=</option>
                <option value="<=">&lt;=</option>
                <option value="LIKE">LIKE (Contém)</option>
                <option value="IN">IN (Lista)</option>
              </select>
              <input
                type="text"
                value={filter.value}
                onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                placeholder="Valor"
                style={{ padding: '5px' }}
              />
              <button onClick={() => removeFilter(filter.id)} style={{ color: 'red', cursor: 'pointer' }}>X</button>
            </div>
          ))}
          <button onClick={addFilter} style={{ fontSize: '0.9em' }}>+ Adicionar Filtro</button>
        </div>
      )}

      {/* Measure Filters Section (HAVING) */}
      {activeDataset && isSemanticMode() && activeDataset.semantic && (
        <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #c3e6cb', borderRadius: '4px', background: '#d4edda' }}>
          <h3 style={{ marginTop: 0, color: '#155724' }}>Filtros de Medida (HAVING)</h3>
          {measureFilters.map(filter => (
            <div key={filter.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
              <select
                value={filter.column}
                onChange={(e) => updateMeasureFilter(filter.id, 'column', e.target.value)}
                style={{ padding: '5px' }}
              >
                {activeDataset.semantic!.measures.map(meas => (
                  <option key={meas.name} value={meas.name}>{meas.label || meas.name}</option>
                ))}
              </select>
              <select
                value={filter.operator}
                onChange={(e) => updateMeasureFilter(filter.id, 'operator', e.target.value)}
                style={{ padding: '5px' }}
              >
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&gt;=</option>
                <option value="<=">&lt;=</option>
                <option value="=">=</option>
                <option value="!=">!=</option>
              </select>
              <input
                type="number"
                value={filter.value}
                onChange={(e) => updateMeasureFilter(filter.id, 'value', e.target.value)}
                placeholder="Valor Numérico"
                style={{ padding: '5px' }}
              />
              <button onClick={() => removeMeasureFilter(filter.id)} style={{ color: 'red', cursor: 'pointer' }}>X</button>
            </div>
          ))}
          <button onClick={addMeasureFilter} style={{ fontSize: '0.9em' }}>+ Adicionar Filtro de Medida</button>
        </div>
      )}

      {/* Query Options */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{ fontWeight: 'bold' }}>Limite:</label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{ padding: '8px', width: '80px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>

      {/* Generated SQL Preview */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>SQL Gerado:</label>
        <pre style={{ background: '#333', color: '#fff', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
          {generatedSql || '-- Aguardando seleção...'}
        </pre>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={runQuery}
          disabled={!db || loading || !activeDataset}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: (!db || loading || !activeDataset) ? 'not-allowed' : 'pointer',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            marginRight: '10px'
          }}
        >
          {loading ? 'Executando...' : 'Executar consulta'}
        </button>

        <button
          onClick={handleExportCsv}
          disabled={!db || loading || !activeDataset}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: (!db || loading || !activeDataset) ? 'not-allowed' : 'pointer',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Exportar CSV (Stream)
        </button>

        {executionTime && (
          <span style={{ marginLeft: '10px', color: '#666' }}>
            Tempo: {executionTime.toFixed(2)}ms
          </span>
        )}
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px', padding: '10px', border: '1px solid red', borderRadius: '4px' }}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && (
        <div>
          <p style={{ marginTop: '10px', color: '#666', fontWeight: 'bold' }}>
            Retornou {result.numRows} linhas.
          </p>
          <VirtualizedTable
            data={result.toArray().map((row: any) => row.toJSON())}
            schema={result.schema}
            resultMode={resultMode}
            getColumnLabel={getColumnLabel}
          />
        </div>
      )}
    </div>
  );
}

export default App;
