# C4-API-005 — Estoque

## Objetivo

Expor a API do saldo atual de estoque usando a tabela existente `stock_items`, sem alterar a modelagem SQLite validada anteriormente.

## Regra central

`stock_items` representa o saldo atual. O histórico operacional permanece em `movements`.

A identidade operacional usada para impedir duplicação considera:

- produto;
- localização;
- unidade;
- lote;
- fabricação;
- validade;
- indicador de sem validade;
- fornecedor;
- nota fiscal;
- data de recebimento.

**Observações (`notes`) não fazem parte da identidade operacional.** Elas são metadados descritivos e podem ser diferentes entre registros sem tornar o saldo operacionalmente diferente.

Essa regra é aplicada no serviço, conforme a modelagem definida em C4-DB-001.

## Endpoints

### POST /stock

Cria um saldo atual inicial.

Esse endpoint **não cria um movimento**. A entrada operacional será responsabilidade do C4-API-006.

### GET /stock

Lista saldos atuais.

Filtros:

- `product_id`
- `location_id`
- `unit`
- `lot`
- `limit`
- `offset`

### GET /stock/{stock_item_id}

Consulta um saldo específico.

### PUT /stock/{stock_item_id}

Atualiza somente metadados do saldo. A quantidade não é alterada diretamente por este endpoint.

Alterações de quantidade serão feitas pelas operações de movimentação do C4-API-006, mantendo saldo e histórico na mesma transação.

## Validações

- produto deve existir e estar ativo;
- localização deve existir e estar ativa;
- conferente informado deve existir e estar ativo;
- unidade deve ser FD, UN, CX ou PCT;
- quantidade inicial deve ser maior que zero;
- quantidade recebida não pode ser negativa;
- validade é obrigatória quando `no_expiration_date=false`;
- validade deve ser nula quando `no_expiration_date=true`;
- identidade operacional duplicada retorna HTTP 409;
- alterações somente em `notes` não criam uma nova identidade operacional.

## Regra de reconciliação dos testes

Os dois registros criados durante a validação anterior possuem a mesma identidade operacional e diferem apenas em `notes`. Eles são considerados dados de teste duplicados após a correção da regra.

A limpeza desses registros deve ser executada de forma controlada antes do C4-API-006, sem alterar a quantidade por meio do PUT e sem criar movimentações artificiais.

## Escopo preservado

Este ajuste não altera:

- modelagem SQLite;
- produtos;
- localizações;
- conferentes;
- movimentações existentes;
- frontend;
- localStorage;
- PWA;
- scanner.

A quantidade do estoque não pode ser alterada diretamente pelo PUT para evitar divergência entre saldo e histórico.
