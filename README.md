# 📊 Tabulador de Dados Abertos

**SPA frontend-only para tabulação e visualização de dados abertos via DuckDB-WASM**

---

## 1. Visão Geral

Este projeto é uma **Single Page Application (SPA)** que permite consultar, tabular e visualizar conjuntos de dados abertos (formato Parquet) publicados na Internet.

**Ele roda 100% no navegador**, eliminando a necessidade de servidores de backend ou bancos de dados dedicados. A mágica acontece através do **DuckDB-WASM**, que executa consultas SQL OLAP de alta performance diretamente no cliente.

### Diferenciais
*   **Zero Backend**: Basta hospedar os arquivos estáticos (app + dados).
*   **Privacy-First**: Seus dados não saem do seu computador (exceto o download inicial do arquivo público).
*   **Camada Semântica**: Define conceitos de negócio (Dimensões/Medidas) sobre os dados brutos.

---

## 2. Motivação e Casos de Uso

O projeto nasceu para facilitar o acesso e a análise de **Dados Abertos Governamentais** que frequentemente são disponibilizados apenas como arquivos gigantes (CSV/Json), exigindo conhecimento técnico (Python/SQL) para serem consumidos.

### Quem se beneficia?
*   **Jornalistas de Dados**: Exploração rápida sem setup complexo.
*   **Pesquisadores**: Criação de tabelas e gráficos para relatórios.
*   **Desenvolvedores**: Exemplo de implementação moderna de "Data Apps" no browser (WASM).

---

## 3. Principais Funcionalidades

*   📁 **Catálogo de Datasets**: Seleção via metadados configuráveis.
*   🧠 **Camada Semântica**: Seleção de "Dimensões" (ex: Estado, Ano) e "Medidas" (ex: Qtde Beneficiários) ao invés de escrever SQL.
*   🔍 **Filtros Dinâmicos**: Interfaces intuitivas para filtrar dados.
*   📊 **Visualização**: Tabelas dinâmicas e gráficos interativos.
*   💾 **Exportação**: Download dos resultados filtrados em CSV/Parquet.

---

## 4. Arquitetura Geral

O sistema utiliza uma arquitetura moderna baseada em WebAssembly.

1.  **Metadados** definem onde estão os dados e como eles se relacionam.
2.  **Interface (React)** captura a intenção do usuário.
3.  **SQL Builder** traduz a intenção para SQL Dialeto DuckDB.
4.  **DuckDB-WASM** executa a consulta lendo apenas os bytes necessários do arquivo Parquet remoto (HTTP Range Requests).

👉 **[Ver Detalhes de Arquitetura e Stack Tecnológica](docs/ARCHITECTURE.md)**

---

## 5. Organização do Repositório

```text
├─ docs/               # Documentação detalhada
├─ public/
│  ├─ data/            # Dados locais (para dev/demo)
│  └─ metadata/        
│     ├─ datasets/             # Definições de Dataset (Source/Schema)
│     ├─ semantic_models/      # Modelos Semânticos (Dimensões/Medidas)
│     ├─ config.yaml           # Configuração Global
│     └─ manifest.yaml         # Manifesto de Datasets (auto-discovery)
├─ src/
│  ├─ components/      # Componentes UI (React)
│  ├─ hooks/           # Hooks customizados (Lógica e Estado)
│  ├─ lib/             # Utilitários Core (SafetyPlanner, QueryRunner)
│  ├─ semantic/        # Lógica da Camada Semântica (SQL Builder, Registry)
│  ├─ services/        # Serviços de Infraestrutura (DuckDB, IO, Helpers)
│  └─ App.tsx          # Ponto de entrada
└─ test/               # Testes automatizados (Vitest)
   ├─ components/      # Testes de componentes UI
   ├─ hooks/           # Testes de hooks customizados
   ├─ semantic/        # Testes da lógica de negócio e SQL
   └─ services/        # Testes de serviços
```

---

## 6. Metadados e Camada Semântica

A grande força do Tabulador é sua capacidade de abstrair a complexidade do SQL através de arquivos de metadados YAML.

*   **Dimensões**: Representam os eixos de análise (Group By). Podem ser simples ou hierárquicas.
*   **Medidas**: Representam os valores agregados (Sum, Count). Suportam lógica semi-aditiva (ex: Saldos).

👉 **[Guia Completo de Registro de Datasets e Modelo Semântico](docs/DATASET_REGISTRATION.md)**

---

## 7. Geração de SQL e Performance

O sistema gera SQL otimizado para OLAP, utilizando CTEs (Common Table Expressions) e Window Functions quando necessário.

A execução no navegador depende de:
1.  **Memória do Dispositivo** (limite do WASM).
2.  **Velocidade da Rede** (para baixar os chunks do Parquet).
3.  **CORS**: O servidor de dados precisa permitir acesso cross-origin.

👉 **[Detalhes sobre SQL e Performance](docs/ARCHITECTURE.md#2-geração-de-sql)**

---

## 8. Desenvolvimento Iterativo

O projeto segue uma abordagem de desenvolvimento iterativo e incremental. Cada "fase" foca em entregar valor completo (ex: "Suporte a hierarquias", "Exportação", "Correção de Bugs").

Consulte o histórico de commits para ver o progresso.

---

## 9. Como Executar Localmente

Você precisará do **Node.js** (v18+) instalado.

1.  Clone o repositório:
    ```bash
    git clone https://github.com/seu-usuario/tabulador-dados-abertos.git
    cd tabulador-dados-abertos
    ```

2.  Instale as dependências:
    ```bash
    npm install
    ```

3.  Rode o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```

4.  Acesse `http://localhost:5173`.

---

## 10. Como Adicionar um Novo Dataset

O processo é simples e não requer alteração de código, apenas configuração YAML.

1.  Crie um arquivo YAML em `public/metadata/datasets/`.
2.  Defina a `source` (URL do Parquet) e o `schema`.
3.  Configure as `dimensions` e `measures`.
4.  O sistema carregará o dataset automaticamente (se configurado no manifest ou auto-discovery).

👉 **[Passo-a-passo para Adicionar Datasets](docs/DATASET_REGISTRATION.md)**

---

## 11. Roadmap

*   [ ] Suporte a múltiplos arquivos (Hive Partitioning) transparente.
*   [ ] Melhorias de interface e experiência do usuário.
*   [ ] Persistência de configurações (Salvar Query/Dashboard).
*   [ ] Modo "Dark Mode" completo.
*   [ ] Pesquisa avançada de datasets.
*   [ ] Visualização de metadados e documentação rica dos datasets 
---

## 12. Licença

Este projeto é distribuído sob a licença **MIT**. Sinta-se livre para usar, modificar e distribuir.

**Nota sobre Dados**: Os datasets acessados pelo aplicativo possuem suas próprias licenças e termos de uso. Verifique a fonte original dos dados.

---

## 13. Créditos e Referências

*   **[DuckDB](https://duckdb.org/)**: A incrível engine que torna isso possível.
*   **[React](https://react.dev/)**: Biblioteca de UI.
*   **[Recharts](https://recharts.org/)**: Biblioteca de gráficos.
