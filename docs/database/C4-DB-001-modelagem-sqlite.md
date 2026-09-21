# C4-DB-001 — Modelagem SQLite

## Objetivo

Definir o modelo de dados relacional do C4 Gestão — Módulo Conferência 2.5 antes da implementação do backend.

Este documento é a referência para o próximo passo, **C4-DB-002 — Implementação dos modelos SQLAlchemy**.

> **Escopo deste commit:** modelagem. Nenhuma tela React, regra visual ou fluxo de conferência foi alterado.

## Arquitetura de persistência

A persistência planejada é:

```text
React / PWA
    │ HTTP / JSON
    ▼
FastAPI
    │
    ▼
SQLite (arquivo no computador que executa o FastAPI)
```

Em operação LAN, tablets e outros computadores não abrirão o arquivo `.db` diretamente. Eles acessarão a API HTTP do computador servidor. Isso mantém o SQLite em um único host e evita o uso do arquivo SQLite em compartilhamento de rede.

O uso futuro de WAL fica reservado à configuração do backend. O SQLite documenta que WAL melhora a concorrência, mas não funciona quando os processos acessam o banco através de um filesystem de rede. citeturn0search0turn0search8

## Entidades

| Tabela | Responsabilidade |
|---|---|
| `products` | Cadastro mestre de produtos |
| `locations` | Endereços/localizações de estoque |
| `checkers` | Conferentes/usuários operacionais identificados nas operações |
| `stock_items` | Saldo físico por produto, lote, unidade e localização |
| `movements` | Histórico imutável das movimentações e auditoria |
| `app_settings` | Configurações gerais da aplicação |
| `admin_credentials` | Credencial administrativa armazenada como hash, nunca senha em texto puro |

## 1. products

Chave primária técnica: `id` (UUID armazenado como TEXT).

Campos principais:

- `id`
- `code` — código de barras/código empresarial, UNIQUE
- `name`
- `category`
- `min_stock`
- `active`
- `created_at`
- `updated_at`

### Decisão

O código do produto continua sendo identificador de negócio, mas não será a chave estrangeira das demais tabelas. Isso permite alterar o código sem quebrar o histórico relacional.

Produtos não devem ser apagados fisicamente durante a operação normal; devem ser desativados com `active = 0`.

## 2. locations

Substitui o array `settings.locations` do frontend.

Campos:

- `id`
- `code` — código curto da localização
- `name`
- `active`
- `created_at`
- `updated_at`

Exemplo:

```text
PR-A1-N2
```

A localização passa a ser uma entidade própria para permitir filtros, transferências e futuras regras de estoque.

## 3. checkers

Substitui o array `settings.checkers`.

Campos:

- `id`
- `name`
- `active`
- `created_at`
- `updated_at`

O histórico referencia o conferente por ID, evitando depender somente do texto digitado na interface.

## 4. stock_items

Representa o **saldo atual** do estoque.

Campos:

- `id`
- `product_id` → `products.id`
- `location_id` → `locations.id`
- `quantity`
- `received_quantity`
- `unit` — FD, UN, CX ou PCT
- `lot`
- `manufacturing_date`
- `expiration_date`
- `no_expiration_date`
- `supplier`
- `invoice_number`
- `checker_id` → `checkers.id`
- `received_date`
- `entry_method`
- `notes`
- `created_at`
- `updated_at`

### Regra de identidade do saldo

A aplicação deve considerar como identidade operacional de um item de estoque a combinação dos dados que definem fisicamente aquele saldo:

- produto
- unidade
- lote
- localização
- fabricação/validade
- fornecedor
- nota
- data de recebimento
- demais metadados definidos pela regra de entrada

A consolidação dessa identidade será implementada no serviço de estoque, não no frontend.

## 5. movements

Representa o histórico operacional.

Tipos previstos:

- `ENTRADA`
- `SAIDA`
- `TRANSFERENCIA`
- `BAIXA`
- `CORRECAO`
- `ESTORNO`

Campos principais:

- `id`
- `product_id`
- `type`
- `quantity`
- `unit`
- `source_stock_item_id`
- `destination_stock_item_id`
- `source_location_id`
- `destination_location_id`
- `product_code_snapshot`
- `product_name_snapshot`
- `lot_snapshot`
- `manufacturing_date`
- `expiration_date`
- `no_expiration_date`
- `supplier`
- `invoice_number`
- `checker_id`
- `received_date`
- `timestamp`
- `entry_method`
- `updated_by_checker_id`
- `updated_at`
- `update_reason`
- `notes`
- `reversal_of_id`
- `correction_of_id`
- `idempotency_key`

### Histórico

O movimento mantém snapshots de código, descrição e lote para preservar o contexto histórico mesmo que o cadastro do produto seja alterado posteriormente.

### Transferência

Transferência não será tratada definitivamente como uma simples saída. O modelo possui origem e destino para permitir que o serviço registre a operação de forma explícita e atômica.

### Estorno/correção

O movimento original não deve ser apagado para corrigir histórico. A correção/estorno deverá gerar um novo movimento relacionado ao original por:

- `reversal_of_id`
- `correction_of_id`

A alteração do saldo e o registro do movimento deverão ocorrer na mesma transação.

## 6. app_settings

Tabela de configuração geral, com uma linha lógica principal.

Campos:

- `id` — valor fixo 1
- `company_name`
- `default_location_id`
- `sound_beep_enabled`
- `sound_alert_enabled`
- `critical_expiry_days`
- `warning_expiry_days`
- `safe_expiry_days`
- `created_at`
- `updated_at`

Os arrays atuais de locais e conferentes não serão armazenados nessa tabela; foram normalizados nas tabelas `locations` e `checkers`.

## 7. admin_credentials

A propriedade atual `adminPassword` do frontend não será migrada como texto puro.

Campos:

- `id`
- `password_hash`
- `created_at`
- `updated_at`

O frontend não deverá receber o hash como parte de `AppSettings`. A autenticação administrativa será implementada em etapa própria do backend.

## Relacionamentos

```text
products
   │
   ├──────────────< stock_items >──────────── locations
   │                      │
   │                      └──────────── checkers
   │
   └──────────────< movements
                         │
                         ├── source_stock_item
                         ├── destination_stock_item
                         ├── source_location
                         ├── destination_location
                         ├── checker
                         └── updated_by_checker
```

## Índices planejados

Índices serão criados para:

- `products.code`
- `products.active`
- `stock_items.product_id`
- `stock_items.location_id`
- `stock_items.expiration_date`
- `movements.product_id`
- `movements.timestamp`
- `movements.type`
- `movements.source_location_id`
- `movements.destination_location_id`
- `movements.idempotency_key`

As chaves estrangeiras devem ser efetivamente habilitadas em cada conexão SQLite com `PRAGMA foreign_keys = ON`; o SQLite informa que a verificação de foreign keys fica desativada por padrão. citeturn0search1

## Regras de integridade

1. Quantidades de estoque e movimentos devem ser maiores que zero.
2. Produto deve existir para qualquer movimentação.
3. Unidade deve ser uma das unidades suportadas.
4. Entrada usa destino; saída usa origem.
5. Transferência usa origem e destino.
6. Estorno/correção não apaga o movimento original.
7. `idempotency_key`, quando informado, deve ser único.
8. Produto e localização usados no histórico não devem depender de exclusão física.
9. Operações de movimento + alteração de estoque devem ocorrer dentro de uma única transação.
10. Foreign keys serão ativadas explicitamente no backend.

## Mapeamento do frontend atual

| Frontend atual | Modelo SQLite |
|---|---|
| `Product` | `products` |
| `StockItem` | `stock_items` |
| `Movement` | `movements` |
| `AppSettings.companyName` | `app_settings.company_name` |
| `AppSettings.defaultAddress` | `app_settings.default_location_id` |
| `AppSettings.locations[]` | `locations` |
| `AppSettings.checkers[]` | `checkers` |
| `AppSettings.adminPassword` | `admin_credentials.password_hash` |
| `fast_stock_products` | será migrado para `products` |
| `fast_stock_inventory` | será migrado para `stock_items` |
| `fast_stock_movements` | será migrado para `movements` |
| `fast_stock_settings` | será migrado seletivamente para `app_settings` |

## O que NÃO será feito neste commit

- Não remover localStorage.
- Não alterar telas.
- Não alterar CSS.
- Não alterar scanner.
- Não alterar PWA.
- Não alterar exportação/importação Excel.
- Não criar endpoints FastAPI.
- Não executar migração dos dados existentes.
- Não criar o arquivo de banco de produção.

Esses itens serão tratados nos módulos posteriores.

## Próximo passo

**C4-DB-002 — Implementação dos modelos SQLAlchemy**

O próximo commit deverá transformar este modelo em:

- `backend/app/db/database.py`
- `backend/app/db/models.py`
- configuração de conexão SQLite
- ativação de foreign keys
- estrutura de sessão/transação

Sem alterar ainda os fluxos da interface React.
