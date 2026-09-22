# C4-API-003 — Produtos

## Objetivo

Criar o primeiro endpoint de domínio do C4 Gestão para manutenção do cadastro de produtos, usando a tabela `products` existente no SQLite.

## Endpoints

### POST /products

Cria um produto.

Payload:

```json
{
  "code": "789000000001",
  "name": "Coca-Cola 350ml",
  "category": "Refrigerantes",
  "min_stock": 10,
  "active": true
}
```

Retorna **201 Created**.

O campo `code` é único. Tentativa de cadastrar código já existente retorna **409 Conflict**.

### GET /products

Lista produtos.

Parâmetros:

- `active`: filtra ativos/inativos. O padrão é `true`.
- `search`: pesquisa por código ou nome.
- `limit`: de 1 a 200; padrão 50.
- `offset`: deslocamento; padrão 0.

Para consultar ativos e inativos juntos, usar `active=null` diretamente na chamada HTTP.

Retorna total, paginação e itens.

### GET /products/{product_id}

Consulta um produto pelo ID.

Retorna **404 Not Found** quando não existir.

### PUT /products/{product_id}

Atualiza os campos enviados:

- `code`
- `name`
- `category`
- `min_stock`
- `active`

Campos não enviados permanecem inalterados.

Código duplicado retorna **409 Conflict**.

### DELETE /products/{product_id}

Não remove fisicamente o registro.

A operação apenas define:

```text
active = false
```

Isso preserva o histórico e mantém compatibilidade com futuras movimentações e referências ao produto.

## Regras

- `code` obrigatório, entre 1 e 255 caracteres;
- `name` obrigatório, entre 1 e 255 caracteres;
- `category` opcional, até 255 caracteres;
- `min_stock` não pode ser negativo;
- campos textuais são normalizados com remoção de espaços nas extremidades;
- campos desconhecidos no payload são rejeitados;
- exclusão física de produtos não é realizada;
- a API usa SQLAlchemy e a sessão FastAPI existente;
- nenhum dado de negócio inicial é criado automaticamente.

## Escopo preservado

Este passo não:

- remove localStorage;
- altera telas;
- altera CSS;
- altera scanner;
- altera PWA;
- migra produtos do localStorage;
- migra estoque;
- cria movimentações;
- altera a modelagem SQLite;
- cria localização ou conferente.

## Validação

Com o ambiente virtual ativo:

```powershell
git pull --ff-only origin main
python -m backend.app.db.init_db
python -m backend.app.main
```

Depois validar no Swagger:

```
http://127.0.0.1:8000/docs
```

A documentação deve exibir:

- `GET /products`
- `POST /products`
- `GET /products/{product_id}`
- `PUT /products/{product_id}`
- `DELETE /products/{product_id}`

### Sequência funcional recomendada

1. `POST /products` com um produto de teste.
2. `GET /products` e confirmar o produto.
3. `GET /products/{id}`.
4. `PUT /products/{id}` alterando um campo.
5. `DELETE /products/{id}`.
6. `GET /products` com `active=true` e confirmar que o produto não aparece.
7. Consultar com `active=false` e confirmar que o registro permanece.
8. Repetir `DELETE` para confirmar que a operação é idempotente do ponto de vista do estado.
