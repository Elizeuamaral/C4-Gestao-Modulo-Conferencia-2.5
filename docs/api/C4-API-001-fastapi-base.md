# C4-API-001 — FastAPI base

## Objetivo

Criar a camada inicial do backend FastAPI do C4 Gestão — Módulo Conferência 2.5, sem alterar a interface React/PWA ou migrar dados do localStorage.

## Implementado

- pacote raiz backend;
- pacote de configuração backend/app/core;
- configuração de runtime com pydantic-settings;
- aplicação FastAPI em backend/app/main.py;
- factory create_app();
- CORS configurável por variável de ambiente;
- endpoint raiz GET / para identificação básica da API;
- execução direta com Uvicorn.

## Configuração

Variáveis suportadas:

| Variável | Padrão |
|---|---|
| C4_API_NAME | C4 Gestão API |
| API_HOST | 127.0.0.1 |
| API_PORT | 8000 |
| CORS_ORIGINS | http://localhost:5173,http://127.0.0.1:5173 |

A configuração também aceita valores definidos em .env, quando esse arquivo existir.

> Observação: a configuração atual mantém CORS explícito e não utiliza *.

## Execução

Com o ambiente virtual ativo:

    python -m backend.app.main

Ou:

    uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

A API estará disponível localmente em:

    http://127.0.0.1:8000

A documentação automática do FastAPI ficará em:

    http://127.0.0.1:8000/docs

## Escopo preservado

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
- altera o banco SQLite já validado pelo C4-DB-003.

## Próximo passo

**C4-API-002 — Health/diagnóstico**

O próximo módulo deverá adicionar diagnóstico explícito da API e da conexão com SQLite, permitindo validar o backend antes da criação dos endpoints de domínio.
