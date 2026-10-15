# C4-AUTH-001 — Login e gerenciamento de usuários

## O que esta etapa adiciona

- Login com usuário e senha.
- Criação do primeiro administrador apenas durante a configuração inicial.
- Senhas armazenadas com hash PBKDF2-HMAC-SHA256 e salt aleatório; a senha original não é gravada.
- Sessões bearer aleatórias, armazenadas no banco apenas como hash e com validade de 12 horas.
- CRUD administrativo: criar usuário, editar nome/perfil, redefinir senha, inativar e reativar.
- Perfis `ADMIN` e `CONFERENTE`.
- Bloqueio de login para usuários inativos.
- Proteção das APIs operacionais para exigir login e proteção de cadastros administrativos para exigir administrador.
- Proteção contra inativar a própria conta ou remover/inativar o último administrador ativo.
- A aba passa a se chamar **Configurações** e inclui o gerenciamento de usuários.
- A tabela de usuários e sessões é criada sem alterar as tabelas de estoque existentes.

## Primeira configuração

1. Atualize o projeto e inicie o C4 no computador que hospeda a API.
2. No próprio computador servidor, abra `http://localhost:3000`.
3. Crie o primeiro administrador com nome, usuário e senha de pelo menos 8 caracteres.
4. Depois disso, outros computadores/tablets da rede podem entrar com as contas criadas pelo administrador.

A criação inicial é bloqueada quando a chamada vem de outro dispositivo da rede. Isso evita que alguém na LAN tente registrar a primeira conta administrativa antes do responsável.

## Endpoints principais

- `GET /auth/setup-status`
- `POST /auth/setup-admin` — somente loopback e somente quando ainda não há usuários.
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `PUT /auth/me/password`
- `GET /auth/users?include_inactive=true` — administrador.
- `POST /auth/users` — administrador.
- `PUT /auth/users/{id}` — administrador.
- `POST /auth/users/{id}/reset-password` — administrador.
- `POST /auth/users/{id}/deactivate` e `POST /auth/users/{id}/activate` — administrador.

## Validação manual necessária

O conector GitHub não executa o projeto local nem substitui a validação com o banco real. Antes de incorporar esta etapa à versão principal, validar no computador do projeto:

1. `npm run lint`
2. Iniciar a API e confirmar `http://localhost:8000/health`.
3. Abrir `http://localhost:3000` no computador servidor e criar o primeiro administrador.
4. Tentar abrir `http://localhost:8000/products` sem token e confirmar HTTP 401.
5. Entrar como administrador e criar um usuário Conferente.
6. Entrar como Conferente e confirmar que a aba Configurações não libera acesso.
7. Confirmar que operações de consulta/estoque continuam funcionando após login.
8. Inativar o Conferente e confirmar que a próxima tentativa de login é recusada.
9. Confirmar que o sistema não permite inativar o último administrador ativo.

## Limite desta etapa

O estoque e o histórico que ainda vivem no `localStorage` continuam locais ao navegador/dispositivo. Esta etapa autentica a aplicação e protege as APIs já existentes; não transforma automaticamente o estoque local em banco compartilhado e ainda não grava o usuário autenticado em cada movimento local. Esse vínculo será tratado na etapa de rastreabilidade/auditoria.
