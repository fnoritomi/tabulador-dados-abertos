# Arquitetura e Detalhes Técnicos

Este documento detalha o funcionamento interno do **Tabulador de Dados Abertos**, cobrindo a arquitetura, geração de SQL, execução no DuckDB-WASM e estratégias de visualização.

## 1. Arquitetura Geral

### 1.1 Visão de Alto Nível

O sistema segue um fluxo unidirecional de dados:

1.  **Metadados**: A aplicação carrega definições de datasets (`JSON`) que descrevem schema físico e camada semântica.
2.  **Estado da Aplicação**: O usuário seleciona dimensões e medidas na UI, atualizando o `QueryState`.
3.  **SQL Builder**: Um serviço converte o `QueryState` + Metadados em uma query SQL otimizada.
4.  **DuckDB-WASM**: A query é executada no navegador, lendo arquivos Parquet remotos via HTTP Range Requests (ou arquivos locais).
5.  **Renderização**: Os resultados (JSON/Arrow) são passados para componentes de Tabela (virtualizada) e Gráficos.

### 1.2 Stack Tecnológica

*   **Frontend**: React 18, TypeScript, Vite.
*   **Engine Analítico**: [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview) (executa SQL OLAP no browser).
*   **Visualização**: Recharts (gráficos) e componentes customizados.
*   **Armazenamento**: Arquivos Parquet estáticos (hospedados em qualquer servidor web/CDN com suporte a CORS básico).

---

## 2. Geração de SQL

O coração da aplicação é o `src/services/semantic/queryBuilder.ts`. Ele traduz intenções de negócio em SQL compatível com DuckDB.

### Regras de Construção
1.  **Dimensões**: Mapeadas para a cláusula `SELECT` e `GROUP BY`.
    *   Suporta dimensões simples (`t.coluna`) e hierárquicas.
2.  **Medidas**: Mapeadas para agregações (`SUM`, `COUNT`, `AVG`).
    *   **Semi-Aditividade**: Medidas de estoque/saldo utilizam Window Functions (`LAST_VALUE`) particionadas automaticamente.
3.  **Filtros**:
    *   Filtros de Dimensão -> `WHERE`.
    *   Filtros de Medida -> `HAVING` (ou subquery wrapper).
    *   Quoting automático de strings e datas com base nos metadados (`dataType`).

### Exemplo de SQL Gerado
```sql
WITH source_cte AS (
    SELECT *, 
           col_estoque = LAST_VALUE(col_estoque) OVER (PARTITION BY cd_filial ORDER BY dt_referencia) as estoque_flag 
    FROM read_parquet('dados.parquet')
    WHERE uf = 'SP'
),
agregacao AS (
    SELECT 
        uf,
        SUM(CASE WHEN estoque_flag THEN col_estoque END) as saldo_final
    FROM source_cte
    GROUP BY ALL
)
SELECT uf, saldo_final FROM agregacao LIMIT 1000
```

---

## 3. Execução no Navegador (DuckDB-WASM)

O DuckDB-WASM é inicializado como um Web Worker para não bloquear a thread principal da UI.

### Estratégias de Performance
*   **Lazy Loading**: Apenas os bytes necessários dos arquivos Parquet são baixados (via HTTP Range Headers), graças ao formato colunar.
*   **Async Connection**: Todas as consultas são assíncronas.
*   **Virtual File System**: Mapeamento de URLs remotas para tabelas virtuais.

---

## 4. Visualização de Dados

*   **Tabela**: Implementação customizada com virtualização (renderiza apenas o que está visível na tela) para suportar milhares de linhas sem travar o DOM.

---

## 5. Exportação

*   **CSV**: Gera um arquivo CSV diretamente do resultado da query no navegador.
*   **Observação**: A exportação não respeita o limite de linhas definido na visualização em tela, portanto, pode gerar arquivos muito grandes. De toda forma, ela foi desenhada para evitar erro OOM, com a exportação sendo feita em streaming direto para arquivo, ou em partes de até 100MB.

---

## 6. Performance e Limitações

1.  **Memória do Navegador**: O DuckDB-WASM é limitado pela memória alocada ao WebAssembly (geralmente 2GB a 4GB). Datasets muito grandes devem ser pré-agregados ou particionados em múltiplos arquivos Parquet (suporte a *hive partitioning* planejado).
2.  **CORS**: Servidores de arquivo DEVEM habilitar CORS (`Access-Control-Allow-Origin`).
3.  **Rede**: A performance inicial depende da velocidade de download dos metadados e headers do Parquet.
