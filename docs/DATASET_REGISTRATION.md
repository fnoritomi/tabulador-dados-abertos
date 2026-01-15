# Guia de Registro de Datasets (Modelo Semântico v2)

Este documento descreve como registrar novos datasets no Tabulador de Dados Abertos, utilizando o modelo semântico hierárquico (v2).

## Estrutura do Arquivo de Metadados

Cada dataset é definido por um arquivo JSON localizado em `public/metadata/datasets/`.
O arquivo deve conter:
- Identificação (`id`, `name`)
- Fontes de dados (`sources`)
- Schema físico (`schema`)
- Camada Semântica (`semantic`)

### Exemplo Base

```json
{
    "id": "exemplo",
    "name": "Dataset Exemplo",
    "sources": ["dados/arquivo.parquet"],
    "schema": [
        { "name": "coluna_a", "type": "VARCHAR" },
        { "name": "coluna_b", "type": "INTEGER" }
    ],
    "semantic": {
        "dimensions": [],
        "measures": []
    }
}
```

## Requisitos de Dados Externos (CORS)

O aplicativo roda inteiramente no navegador (Client-Side) utilizando DuckDB-WASM. Isso impõe restrições de segurança do navegador ao acessar arquivos externos.

Se os arquivos listados em `sources` estiverem em um domínio diferente do aplicativo (ex: `https://meu-bucket-s3.com/dados.parquet`), o servidor de origem **DEVE permitir CORS (Cross-Origin Resource Sharing)**.

O servidor deve retornar o cabeçalho:
`Access-Control-Allow-Origin: *` (ou o domínio onde o Tabulador está hospedado)

**Notas Importantes:**
- **Buckets S3 / GCS / Azure**: Precisam de configuração explícita de CORS para permitir métodos `GET` e `HEAD` da origem do aplicativo.
- **GitHub Raw / Gist**: Geralmente possuem CORS habilitado por padrão.
- **Arquivos Locais**: Arquivos hospedados junto com o aplicativo (na pasta `public/data`) funcionam sempre, pois estão na mesma origem.

## Definindo Dimensões

As dimensões podem ser **Simples** (seleção direta) ou **Compostas** (agrupamentos hierárquicos).

### 1. Dimensão Simples (Leaf)
Use para colunas que devem aparecer diretamente na lista de opções (ex: Sexo, Ano).
**Obrigatório**: `sql` e `dataType`.

```json
{
    "name": "TP_SEXO",
    "label": "Sexo",
    "sql": "TP_SEXO",      // Coluna física ou expressão SQL
    "dataType": "VARCHAR"   // Tipo de dado (importante para filtros)
}
```

### 2. Dimensão Composta (Hierárquica)
Use para agrupar atributos ou criar hierarquias (ex: Localização > Estado > Município).
**Obrigatório**: `attributes` e/ou `subDimensions`.

```json
{
    "name": "localizacao",
    "label": "Localização",
    "type": "geo",          // Tipo semântico opcional
    "subDimensions": [
        {
            "name": "estado",
            "label": "Estado",
            "attributes": [
                {
                    "name": "uf",
                    "label": "UF",
                    "sql": "SG_UF",
                    "type": "VARCHAR"
                }
            ],
            "subDimensions": [
                {
                    "name": "municipio",
                    "label": "Município",
                    "attributes": [
                        { "name": "cod_mun", "label": "Código", "sql": "CD_MUN", "type": "VARCHAR" },
                        { "name": "nom_mun", "label": "Nome", "sql": "NM_MUN", "type": "VARCHAR" }
                    ]
                }
            ]
        }
    ]
}
```

## Definindo Medidas (Métricas)

As medidas definem como os dados são agregados.

```json
{
    "name": "total_vendas",
    "label": "Total de Vendas",
    "sql": "SUM(VLR_VENDA)",
    "format": { "type": "number", "decimals": 2 }
}
```

### Medidas Semi-Aditivas
Para medidas que não podem ser somadas em todas as dimensões (ex: Estoque, Saldo), use `non_additive_dimension`.

- `dimension_name`: Nome da dimensão onde a agregação padrão (SUM) **não** deve ser aplicada diretamente.
- `window_choice`: Operação de janela para obter o valor correto (`LAST_VALUE` para saldo final, `FIRST_VALUE` para saldo inicial, `MAX`, `MIN`).
- `window_groupings` (Opcional): Configurações avançadas para o particionamento da janela SQL (`OVER (PARTITION BY ...)`).

#### Exemplo Completo

```json
{
    "name": "estoque_final",
    "label": "Estoque Final",
    "sql": "SUM(QTD_ESTOQUE)",
    "non_additive_dimension": {
        "dimension_name": "COMPETENCIA", 
        "window_choice": "LAST_VALUE",
        "window_groupings": {
            // Opção A: Usa todas as dimensões aditivas selecionadas na query para particionar (recomendado)
            "all_additive_used": true,
            
            // Opção B: Define explicitamente quais dimensões usar no particionamento
            // "dimensions": ["CD_OPERADORA", "SG_UF"] 
        }
    }
}
```

**Nota sobre `window_groupings`**:
- Se `all_additive_used: true`, o sistema particiona a janela por TODAS as dimensões selecionadas pelo usuário, exceto a dimensão não-aditiva (`COMPETENCIA`). Isso garante que o cálculo de "Último Valor" respeite o agrupamento visualizado.- Se `dimensions` for fornecido, a janela será particionada fixamente por essas colunas, independentemente do que o usuário selecionou. Útil quando o saldo é calculado em um grão fixo.

## Formatação de Dados

É possível definir regras de formatação específicas para Medidas, Dimensões Simples e Atributos usando a propriedade opcional `format`.

As opções disponíveis são:
- `type`: Tipo de formatação (`number`, `currency`, `percent`, `date`, `datetime`).
- `decimals`: Número de casas decimais (para tipos numéricos).
- `currency`: Código da moeda (ex: `BRL`, `USD`) - padrão `BRL`.
- `locale`: Localidade para formatação (ex: `pt-BR`, `en-US`) - padrão: configuração do navegador ou `config.json`.
- `useThousandsSeparator`: Se deve usar separador de milhar (ex: `1.000` vs `1000`) - padrão `true`.
- `pattern`: Padrão de formatação para datas (ex: `dd/MM/yyyy HH:mm`).

### Exemplos de Formatação

#### 1. Moeda (R$)
```json
{
    "name": "valor_venda",
    "label": "Valor Venda",
    "sql": "SUM(VLR_VENDA)",
    "format": {
        "type": "currency",
        "currency": "BRL"
    }
}
```

#### 2. Número Inteiro (sem decimais e sem separador)
Útil para códigos numéricos ou IDs.
```json
{
    "name": "id_pedido",
    "label": "ID Pedido",
    "sql": "ID_PEDIDO",
    "format": {
        "type": "number",
        "decimals": 0,
        "useThousandsSeparator": false
    }
}
```

#### 3. Porcentagem
Multiplica por 100 e adiciona o símbolo %.
```json
{
    "name": "margem_lucro",
    "label": "Margem de Lucro",
    "sql": "AVG(MARGEM)",
    "format": {
        "type": "percent",
        "decimals": 1
    }
}
```

#### 4. Data Customizada
```json
{
    "name": "data_hora",
    "label": "Data/Hora",
    "sql": "DT_REGISTRO",
    "format": {
        "type": "datetime",
        "pattern": "dd/MM/yyyy HH:mm"
    }
}
```

## Validação

Ao criar um novo JSON:
1. Verifique se o JSON é válido (sem vírgulas extras, chaves fechadas).
2. Certifique-se de que os campos `sql` referenciam colunas existentes no `schema` ou expressões válidas em DuckDB.
3. Use o script de migração apenas se estiver convertendo do formato antigo (v1). Para novos, escreva diretamente no formato v2.
