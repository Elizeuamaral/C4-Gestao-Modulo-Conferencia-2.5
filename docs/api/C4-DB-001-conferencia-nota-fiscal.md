# C4-DB-001 — Modelo de dados para conferência por nota fiscal

Prepara a estrutura para a futura tela de conferência por NF e para as colunas
QTD. NF / QTD. CONF. / QTD. EST. **Não há alteração de interface nesta etapa**; a
conferência manual atual (`localStorage`) segue intacta.

## Modelo

| Tabela | Papel |
| --- | --- |
| `invoices` | Nota fiscal: `number` (obrigatório), `series`, `access_key` (44 dígitos), `supplier`, `received_date` opcionais; `status` (`PENDENTE`, `EM_CONFERENCIA`, `CONFERIDA`, `CONFERIDA_COM_DIVERGENCIA`), usuário criador e usuário/data da conferência. |
| `invoice_items` | Itens da nota (N por nota): `product_code`, `product_id` (opcional até o produto existir), `unit`, **`invoice_quantity` (QTD. NF)**, **`conferred_quantity` (QTD. CONF.)**, `divergence_quantity` (conferida − NF), `status`, `conferred_by_user_id`, `conferred_at`, `stock_item_id` (lote que recebeu a entrada) e `entry_movement_id`. |
| `stock_items` (existente) | **QTD. EST.** = `quantity` do lote (produto + local + unidade + lote + validade). Só muda por movimentação. `received_quantity` acumula o total recebido. |
| `movements` (existente) | Ganhou `user_id`, `invoice_id`, `invoice_item_id`, `quantity_before`, `quantity_after`. |

Decisões:

- NF e CONF. ficam no item da nota e não são alterados depois da conferência; o saldo
  vive somente em `stock_items`, então saídas não reescrevem o histórico da nota.
- O saldo "da linha" (`current_stock_quantity` na API) é o saldo do lote em que a linha
  entrou; um mesmo lote pode somar entradas de várias notas.
- Unicidade: (`number`, `series`, `supplier`) com NULL tratado como vazio, e
  `access_key` único quando presente.
- Idempotência: a entrada usa `idempotency_key = invoice-item-entry:<id do item>`
  (único no banco). Repetir a mesma conferência retorna 200 sem nova entrada; dados
  diferentes retornam 409.
- Item conferido com quantidade 0 registra a divergência e não cria lote/movimentação
  (`movements.quantity > 0` é regra existente).
- `quantity_before/after` referem-se ao lote afetado (origem, em transferências).
  Estornos e correções também registram usuário e saldos. Movimentos antigos ficam
  com esses campos nulos.
- `movements.checker_id` (tabela `checkers`) não foi alterado; a identidade vem do
  usuário autenticado (`user_id`).

## Migração

`backend/app/db/migrations.py` (`apply_schema_upgrades`) é executada na inicialização
da API e em `init_db`, após `create_all()` (que cria `invoices` e `invoice_items`).
Adiciona as 5 colunas nulas em `movements` com `ALTER TABLE ADD COLUMN` e índices
`IF NOT EXISTS`; é idempotente e não apaga nem recria nada. Validada em uma **cópia**
do banco real: contagens idênticas antes/depois (1561 produtos, 22 movimentações,
4 itens de estoque etc.), `foreign_key_check` vazio, segunda execução sem alterações.
O banco real não foi tocado; será atualizado quando o backend for reiniciado.

## API (todas exigem token; sem token/inválido → 401)

- `POST /invoices` — cria nota com itens (409 se duplicada).
- `GET /invoices?status=&limit=&offset=` e `GET /invoices/{id}`.
- `POST /invoices/{id}/items/{item_id}/confer` — corpo: `conferred_quantity`,
  `location_id`, `lot`, `expiration_date` ou `no_expiration_date`, `manufacturing_date`,
  `notes`. 201 na primeira vez, 200 em repetição idêntica, 409 em dados diferentes.
- `/movements` (existente) passa a gravar usuário e saldos antes/depois.

## Testes

`.\.venv\Scripts\python.exe -m pytest -q` — ver resultados no relatório do commit.
Cobertura nova em `backend/tests/test_invoice_conference.py`: nota com vários itens,
NF/CONF/EST separados, divergência, lotes/validades distintos, saída parcial,
histórico preservado, duplicidade (API e banco), autenticação, compatibilidade com
banco antigo e regressão de movimentações.

## Pendências

- Interface de conferência por NF e colunas da consulta (próxima etapa).
- Leitura de XML/chave de acesso não implementada (apenas campos).
- Sem perfis específicos por operação: qualquer usuário autenticado pode criar e
  conferir notas.
