# C4-API-002 — Health/diagnóstico

## Objetivo

Adicionar um diagnóstico explícito do backend e do SQLite para validar a infraestrutura antes da criação dos endpoints de domínio.

## Implementado

- pacote backend/app/api;
- pacote backend/app/api/routes;
- rota GET /health;
- verificação de conectividade com o banco configurado;
- identificação do engine utilizado;
- validação das 7 tabelas esperadas do C4 Gestão;
- validação do PRAGMA foreign_keys;
- resposta HTTP 200 quando a infraestrutura está íntegra;
- resposta HTTP 503 quando o diagnóstico detecta falha;
- diagnóstico compartilhado entre o inicializador SQLite e a API.

## Resposta esperada

Com o banco SQLite inicializado corretamente:

    GET /health

deve retornar HTTP 200 com estrutura semelhante a:

    {
      "status": "ok",
      "api": {
        "status": "ok",
        "name": "C4 Gestão API",
        "version": "2.5.0"
      },
      "database": {
        "status": "ok",
        "engine": "sqlite",
        "table_count": 7,
        "expected_table_count": 7,
        "tables": [
          "admin_credentials",
          "app_settings",
          "checkers",
          "locations",
          "movements",
          "products",
          "stock_items"
        ],
        "missing_tables": [],
        "foreign_keys_enabled": true
      }
    }

## Segurança e escopo

O endpoint não expõe o caminho físico do arquivo SQLite, credenciais ou dados de negócio.

Este commit não:

- remove localStorage;
- altera telas;
- altera CSS;
- altera scanner;
- altera PWA;
- migra produtos;
- migra estoque;
- cria endpoints de produtos;
- cria endpoints de estoque;
- cria endpoints de movimentações;
- altera a modelagem SQLite;
- cria dados mestres.

## Validação

Com o ambiente virtual ativo:

    python -m backend.app.db.init_db

deve continuar sendo idempotente.

Depois:

    python -m backend.app.main

e acessar:

    http://127.0.0.1:8000/health

A documentação automática também deve exibir a operação GET /health em:

    http://127.0.0.1:8000/docs

## Próximo passo

**C4-API-003 — Produtos**

Criar o primeiro endpoint de domínio para consulta e manutenção do cadastro de produtos, mantendo a interface atual intacta até a validação do backend.
