# C4-API-004 — Localizações e Conferentes

## Objetivo

Expor as entidades `locations` e `checkers` existentes no modelo SQLite por meio da API FastAPI, sem alterar telas, localStorage, PWA ou os fluxos já validados de produtos.

As entidades normalizam os arrays antigos de configurações do frontend:

- `settings.locations[]` → `locations`
- `settings.checkers[]` → `checkers`

## Localizações

### POST /locations

Cria uma localização. Retorna **201 Created**. O campo `code` é único; código já existente retorna **409 Conflict**.

Exemplo:

~~~json
{
  "code": "ESTOQUE",
  "name": "Estoque Principal",
  "active": true
}
~~~

### GET /locations

Lista localizações. Parâmetros: `active` (padrão `true`), `search` (código ou nome), `limit` (1–200, padrão 50) e `offset` (padrão 0).

### GET /locations/{location_id}

Consulta uma localização pelo ID. Retorna **404 Not Found** quando não existir.

### PUT /locations/{location_id}

Atualiza `code`, `name` e/ou `active`. Código duplicado retorna **409 Conflict**.

### DELETE /locations/{location_id}

Não remove fisicamente o registro. Define `active = false`, preservando referências históricas.

## Conferentes

### POST /checkers

Cria um conferente. Retorna **201 Created**. O nome é único; nome já existente retorna **409 Conflict**.

Exemplo:

~~~json
{
  "name": "Conferente Geral",
  "active": true
}
~~~

### GET /checkers

Lista conferentes. Parâmetros: `active` (padrão `true`), `search` (nome), `limit` (1–200, padrão 50) e `offset` (padrão 0).

### GET /checkers/{checker_id}

Consulta um conferente pelo ID. Retorna **404 Not Found** quando não existir.

### PUT /checkers/{checker_id}

Atualiza `name` e/ou `active`. Nome duplicado retorna **409 Conflict**.

### DELETE /checkers/{checker_id}

Não remove fisicamente o registro. Define `active = false`.

## Regras comuns

- textos são normalizados com remoção de espaços nas extremidades;
- campos desconhecidos são rejeitados;
- nomes/códigos obrigatórios não podem ficar vazios;
- exclusão física não é realizada;
- IDs são UUIDs gerados pelo SQLAlchemy;
- `created_at` e `updated_at` são mantidos pelo modelo;
- filtros padrão retornam somente entidades ativas;
- inativos podem ser consultados com `active=false`;
- nenhum dado mestre é criado automaticamente.

## Compatibilidade com o banco

O módulo usa as tabelas já existentes `locations` e `checkers`. Nenhuma alteração de modelagem SQLite é necessária. As relações existentes em `stock_items`, `movements` e `app_settings` permanecem preservadas.

## Escopo preservado

Este passo não remove localStorage, não altera telas/CSS/scanner/PWA, não migra configurações, não migra estoque, não cria movimentações e não altera a modelagem SQLite.

## Validação

Com o ambiente virtual ativo:

~~~powershell
git pull --ff-only origin main
python -m backend.app.db.init_db
python -m backend.app.main
~~~

Depois abrir `http://127.0.0.1:8000/docs`. A documentação deve exibir `/products`, `/locations` e `/checkers`.

### Sequência funcional recomendada

1. Criar uma localização de teste.
2. Listar e pesquisar a localização.
3. Alterar a localização.
4. Desativar a localização e confirmar que não aparece no filtro padrão.
5. Consultar `active=false` e confirmar que o registro permanece.
6. Testar código duplicado da localização.
7. Criar um conferente de teste.
8. Listar e pesquisar o conferente.
9. Alterar o conferente.
10. Desativar o conferente e confirmar o filtro de ativos.
11. Testar nome duplicado do conferente.

Os testes devem ser feitos no Swagger antes de iniciar qualquer integração com o frontend.
