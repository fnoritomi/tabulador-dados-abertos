# SPA Frontend DuckDB-WASM

## Sobre
Este é um projeto de Single Page Application (SPA) utilizando React, TypeScript e DuckDB-WASM.
O objetivo é executar consultas SQL analíticas diretamente no navegador sobre arquivos Parquet, sem necessidade de backend.

## Como rodar
1.  Instalar dependências:
    ```bash
    npm install
    ```
2.  Rodar servidor de desenvolvimento:
    ```bash
    npm run dev
    ```

## Iteração 0: Bootstrap
- Inicialização do projeto.
- Configuração do DuckDB-WASM.

## Iteração 1: SQL fixa (PoC)
- Execução de consulta SQL fixa em arquivo Parquet remoto.
- Renderização de resultados em tabela.

## Iteração 2: Catálogo simples de datasets
- Estrutura de metadados JSON.
- UI para seleção de datasets.
- Carregamento dinâmico de fontes de dados.

## Iteração 3: Seleção de colunas
- Seleção de colunas via checkboxes.
- Definição dinâmica de `LIMIT`.
- Preview da SQL gerada.

## Iteração 4: Camada semântica básica
- Definição de Dimensões e Medidas nos metadados.
- Geração automática de consultas com `GROUP BY`.
- Interface seletiva para exploração de dados agregados.

## Iteração 5: Filtros (WHERE)
- UI para construção de filtros dinâmicos.
- Suporte a operadores (`=`, `>`, `LIKE`, `IN`, etc.).
- Tratamento automático de tipos (aspas para strings/datas).

## Iteração 6: Filtros em Medidas (HAVING)
- Seção dedicada para filtros de agregação.
- Geração automática cláusula `HAVING`.
- Visibilidade condicional (apenas modo semântico).
