# C4-API-007 — Correção e Estorno de Movimentações

## Objetivo

Implementar correções e estornos de movimentações sem alterar ou excluir o registro histórico original.

O C4-API-007 mantém a movimentação original como registro de auditoria e cria uma nova movimentação derivada para representar a operação de ajuste.

Tipos derivados:

- CORRECAO
- ESTORNO

As movimentações operacionais originais continuam sendo:

- ENTRADA
- SAIDA
- TRANSFERENCIA

## Princípio de auditoria

Movimentações históricas não são editadas nem excluídas.

Quando uma operação precisa ser desfeita ou corrigida:

1. a movimentação original permanece intacta;
2. o saldo atual é ajustado;
3. uma nova movimentação é criada;
4. a nova movimentação registra a relação com a operação original;
5. os dados de auditoria informam o motivo e, quando aplicável, o conferente responsável.

Relacionamentos:

- \`reversal_of_id\`: identifica a movimentação original estornada;
- \`correction_of_id\`: identifica a movimentação original corrigida.

## ESTORNO

O estorno desfaz integralmente uma movimentação operacional.

Endpoint:

\`POST /movements/{movement_id}/reverse\`

### ENTRADA

Se a movimentação original adicionou quantidade ao estoque, o estorno remove exatamente a mesma quantidade.

Exemplo conceitual:

- ENTRADA original: +10 UN
- ESTORNO: -10 UN

O sistema verifica se existe saldo suficiente para realizar o estorno. Caso contrário, a operação é rejeitada e o saldo permanece inalterado.

### SAIDA

Se a movimentação original retirou quantidade do estoque, o estorno devolve exatamente a mesma quantidade.

Exemplo conceitual:

- SAIDA original: -10 UN
- ESTORNO: +10 UN

### TRANSFERENCIA

O estorno inverte a transferência original:

- a quantidade é retirada do estoque que recebeu a transferência;
- a mesma quantidade é devolvida ao estoque de origem.

Exemplo conceitual:

- TRANSFERENCIA: origem → destino, 4 UN
- ESTORNO: destino → origem, 4 UN

## CORRECAO

A correção ajusta a quantidade efetivamente movimentada sem alterar o registro original.

Endpoint:

\`POST /movements/{movement_id}/correct\`

O cliente informa a quantidade correta por meio de \`correct_quantity\`. O backend calcula automaticamente a diferença entre a quantidade original e a quantidade correta.

### Aumento da quantidade

Exemplo:

- ENTRADA original: 10 UN
- quantidade correta: 13 UN
- CORRECAO: +3 UN

Para SAIDA, o aumento da quantidade representa uma retirada adicional do estoque.

Para TRANSFERENCIA, o aumento representa uma quantidade adicional transferida da origem para o destino.

### Redução da quantidade

Exemplo:

- ENTRADA original: 10 UN
- quantidade correta: 8 UN
- CORRECAO: -2 UN

Para SAIDA, a redução devolve ao estoque a quantidade que havia sido retirada a mais.

Para TRANSFERENCIA, a redução devolve 2 UN do destino para a origem.

## Regras de integridade

A API valida:

- movimentação original existente;
- tipo da movimentação compatível com correção ou estorno;
- conferente ativo, quando informado;
- produto e unidade compatíveis;
- estoque de origem/destino existente;
- saldo suficiente quando a operação exigir redução de estoque;
- quantidade correta maior que zero;
- motivo obrigatório;
- relações de origem e destino coerentes.

Não é permitido:

- estornar uma movimentação que já seja um estorno;
- corrigir uma movimentação que já seja um estorno;
- criar uma segunda correção para a mesma movimentação original;
- criar uma correção sem alteração efetiva de quantidade;
- editar ou excluir diretamente uma movimentação histórica.

## Idempotência

Os endpoints de correção e estorno aceitam \`idempotency_key\`.

Quando uma mesma chave já tiver sido processada, a API retorna a movimentação derivada anteriormente e não aplica o ajuste novamente.

Comportamento:

- primeira execução: HTTP 201;
- repetição idempotente: HTTP 200.

## Payload — ESTORNO

Exemplo:

\`\`\`json
{
  "checker_id": "UUID-DO-CONFERENTE",
  "reason": "Estorno de entrada lançada incorretamente",
  "idempotency_key": "C4-API-007-ESTORNO-001"
}
\`\`\`

Campos:

| Campo | Obrigatório | Descrição |
|---|---|---|
| \`checker_id\` | Não | UUID do conferente responsável |
| \`reason\` | Sim | Motivo do estorno, de 1 a 500 caracteres |
| \`idempotency_key\` | Não | Chave para impedir processamento duplicado |

## Payload — CORRECAO

Exemplo:

\`\`\`json
{
  "correct_quantity": 13,
  "checker_id": "UUID-DO-CONFERENTE",
  "reason": "Quantidade conferida novamente",
  "idempotency_key": "C4-API-007-CORRECAO-001"
}
\`\`\`

Campos:

| Campo | Obrigatório | Descrição |
|---|---|---|
| \`correct_quantity\` | Sim | Quantidade correta, maior que zero |
| \`checker_id\` | Não | UUID do conferente responsável |
| \`reason\` | Sim | Motivo da correção, de 1 a 500 caracteres |
| \`idempotency_key\` | Não | Chave para impedir processamento duplicado |

## Códigos HTTP

| Código | Situação |
|---|---|
| \`201\` | Correção ou estorno criado com sucesso |
| \`200\` | Requisição repetida com idempotência reconhecida |
| \`404\` | Movimentação original não encontrada |
| \`409\` | Conflito operacional, saldo insuficiente ou operação não permitida |
| \`422\` | Dados inválidos ou regra de validação não atendida |

## Atomicidade

A atualização do saldo e a criação da movimentação de correção ou estorno são realizadas na mesma transação SQLAlchemy.

Se a operação falhar, a alteração de saldo não deve permanecer aplicada.

## Auditoria

As movimentações derivadas registram:

- relação com a movimentação original;
- quantidade ajustada;
- snapshots do produto e do estoque;
- conferente, quando informado;
- motivo da alteração;
- data/hora da operação;
- chave de idempotência, quando informada.

A movimentação original permanece preservada para permitir rastreamento do histórico.

## Endpoints do módulo

O C4-API-007 adiciona:

- \`POST /movements/{movement_id}/reverse\`
- \`POST /movements/{movement_id}/correct\`

Os endpoints de consulta existentes no C4-API-006 permanecem disponíveis:

- \`POST /movements\`
- \`GET /movements\`
- \`GET /movements/{movement_id}\`

Não existem endpoints PUT ou DELETE para alteração direta do histórico.

## Escopo

O C4-API-007 não altera a estrutura do banco de dados. Utiliza os campos de relacionamento e auditoria já existentes no modelo de movimentações.

A validação funcional de correção e estorno será realizada após a revisão técnica do módulo.
