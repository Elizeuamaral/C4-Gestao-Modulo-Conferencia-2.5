# C4-API-006 — Movimentações

## Objetivo

Registrar alterações de saldo em `stock_items` por meio de um histórico transacional em `movements`.

C4-API-006 implementa somente:

- ENTRADA
- SAIDA
- TRANSFERENCIA

CORRECAO e ESTORNO permanecem para C4-API-007.

## Regra de saldo

- ENTRADA: soma a quantidade ao `destination_stock_item_id`.
- SAIDA: subtrai a quantidade do `source_stock_item_id`.
- TRANSFERENCIA: subtrai da origem e soma no destino na mesma transação.
- O saldo nunca pode ficar negativo.
- A API de estoque continua sem alteração direta de quantidade.

## Integridade

A movimentação exige:

- produto ativo;
- stock item existente;
- produto e unidade compatíveis;
- conferente ativo, quando informado;
- origem e destino coerentes com o tipo;
- origem e destino diferentes em transferência;
- quantidade positiva.

O movimento recebe snapshots do produto e do estoque no momento do registro.

## Idempotência

`idempotency_key` é única.

Se a mesma chave for enviada novamente, a API retorna o movimento já registrado com HTTP 200 e não altera o saldo novamente.

## Endpoints

- `POST /movements`
- `GET /movements`
- `GET /movements/{movement_id}`

Não existe PUT/DELETE de movimento histórico.

## Atomicidade

A alteração do saldo e o registro do movimento são confirmados na mesma transação SQLAlchemy. Se a gravação falhar, a alteração de saldo também é revertida.

## Observação

C4-API-005 continua sendo responsável pelo cadastro/consulta e metadados do saldo atual. C4-API-006 passa a ser o caminho operacional para alterar quantidade.
