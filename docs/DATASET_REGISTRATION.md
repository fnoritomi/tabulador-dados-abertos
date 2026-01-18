# Guia de Registro de Metadados v2

O Tabulador de Dados Abertos utiliza uma arquitetura de metadados em duas camadas:
1.  **Datasets** (Camada Física): Define onde os dados estão e quais são as colunas.
2.  **Semantic Models** (Camada Lógica): Define conceitos de negócio (Dimensões e Medidas) sobre os datasets.

---

## 1. Registro de Datasets (Camada Física)

Os datasets são definidos em arquivos **YAML** na pasta `public/metadata/datasets/`.
Eles representam a tabela bruta.

### Estrutura do Arquivo (`public/metadata/datasets/meu_dataset.yaml`)

```yaml
version: 1
datasets:
  - name: vendas_2023              # ID único do dataset
    description: Vendas Consolidadas de 2023
    
    # Lista de arquivos Parquet (pode ser local ou URL remota)
    sources:
      - data/vendas/janeiro.parquet
      - https://bucket-s3.com/vendas/fevereiro.parquet
    
    # Esquema Físico das colunas
    columns:
      - name: dt_venda
        type: date
      - name: id_produto
        type: integer
      - name: valor
        type: double
      - name: uf_loja
        type: string
```

**Requisitos de CORS:**
Se utilizar URLs remotas (S3, GCS, etc.), certifique-se de configurar o CORS (`Access-Control-Allow-Origin: *`) no servidor de origem.

---

## 2. Modelos Semânticos (Camada Lógica)

Os modelos semânticos são definidos em arquivos **YAML** na pasta `public/metadata/semantic_models/`.
Eles mapeiam a tabela física para conceitos analíticos.

### Estrutura do Arquivo (`public/metadata/semantic_models/meu_modelo.yaml`)

```yaml
version: 1
semantic_models:
  - name: vendas_analise         # ID do modelo semântico
    description: Análise de Vendas
    model: vendas_2023           # Referência ao 'name' do dataset definido na etapa anterior
    
    # Configuração de Performance (Safety Planner)
    high_cardinality:
      enabled: true
      target_per_bucket: 1000000        # Alvo de linhas por partição
      threshold: 1500000                # Limite para ativar particionamento
      limit_target_multiplier: 10       # Multiplicador se houver LIMIT na query
      limit_threshold_multiplier: 15    # Multiplicador do threshold se houver LIMIT

    # Definição de Dimensões (Eixos de análise)
    dimensions:
      - name: data
        label: Data da Venda
        expr: dt_venda
        type: time
        type_params:
          time_granularity: day
          
      - name: uf
        label: Estado
        expr: uf_loja
        type: categorical

    # Definição de Medidas (Agregações)
    measures:
      - name: total_vendas
        label: Total Vendido
        expr: valor
        type: sum
        format:
          type: currency
          currency: BRL

      # Exemplo com Filtro (Where) e Distinct
      - name: qtd_clientes_ativos
        label: Clientes Ativos
        expr: id_cliente
        type: count
        agg_params:
          distinct: true
          where: "status_cliente = 'ATIVO'"
```

---

## Guia de Referência

### Tipos de Dimensão
- `categorical`: Texto ou categorias discretas.
- `time`: Datas ou timestamps. Use `type_params` para definir granularidade.
- `numerical`: Valores numéricos usados como eixos (ex: Ano, Idade).

### Tipos de Medida
- `sum`: Soma.
- `count`: Contagem de linhas.
- `count_distinct`: Contagem distinta (alternativa ao `agg_params.distinct`).
- `avg`, `min`, `max`: Média, Mínimo, Máximo.

### Parâmetros de Agregação (`agg_params`)
Para customizar como a agregação é calculada.

- **`distinct`** (`boolean`): Aplica `DISTINCT` na agregação (ex: `COUNT(DISTINCT col)`).
- **`where`** (`string`): Aplica um filtro SQL específico para essa medida (ex: `SUM(CASE WHEN status='pago' THEN valor END)`). A string deve ser uma expressão SQL válida para a cláusula WHERE.

### Medidas Semi-Aditivas
Para medidas que não podem ser somadas em todas as dimensões (ex: Estoque, Saldo), use a configuração `non_additive_dimension`.

- **`dimension_name`**: A dimensão onde a soma não faz sentido (ex: Data/Tempo).
- **`window_choice`**: Qual valor pegar dentro da janela:
    - `LAST_VALUE`: Último valor (Saldo Final).
    - `FIRST_VALUE`: Primeiro valor (Saldo Inicial).
    - `MAX` / `MIN`: Maior ou menor valor.
- **`window_groupings`**: (Opcional) Define como particionar a janela.
    - Se omitido ou vazio, a medida será calculada com base no **contexto global** dos filtros (ex: O "Último Valor" será o último dia disponível em todo o conjunto de dados filtrado, independentemente do agrupamento visual). Isso é ideal para snapshots globais.
    - Para calcular o "Último Valor" *por grupo* (ex: Última data de cada Estado), você deve listar explicitamente as dimensões de agrupamento aqui.

```yaml
    - name: estoque_final
      label: Estoque Final
      expr: qtd_estoque
      type: sum
      non_additive_dimension:
        dimension_name: data
        window_choice: LAST_VALUE
```

### Configurações de Performance (`high_cardinality`)
O **Safety Planner** protege o navegador contra travamentos (OOM) ao executar queries pesadas, dividindo-as em partes menores (particionamento).

- **`enabled`**: Ativa o Safety Planner para este modelo.
- **`target_per_bucket`** (Default: 75.000): Quantidade alvo de grupos/linhas por partição (balde).
- **`threshold`** (Default: 150.000): Quantidade estimada de grupos que dispara o particionamento.
- **`limit_target_multiplier`**: Se a consulta tiver um `LIMIT`, define o tamanho do balde como `LIMIT * multiplier`. Isso geralmente **reduz** o tamanho do balde (gerando mais partições menores), otimizando a responsividade para visualizar os primeiros resultados rapidamente.
- **`limit_threshold_multiplier`**: Se a consulta tiver um `LIMIT`, redefine o `threshold` para `LIMIT * multiplier`. Isso geralmente **reduz** o limiar de ativação, forçando o particionamento acontecer mais cedo (mesmo em resultados menores), para garantir que queries limitadas sejam processadas em fatias gerenciáveis.

### Formatação (`format`)
- `type`: `number`, `currency`, `percent`, `date`, `datetime`.
- `decimals`: Inteiro definindo casas decimais.
- `currency`: Código da moeda (ex: `BRL`).
- `use_grouping`: `true`/`false` para separadores de milhar.
