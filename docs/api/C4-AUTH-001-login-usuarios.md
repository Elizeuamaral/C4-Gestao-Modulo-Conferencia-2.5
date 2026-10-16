# C4-AUTH-001 — Login e gerenciamento de usuários

## Situação da etapa

**Backend corrigido e validado na porta 8000; falta apenas o teste manual do
primeiro cadastro no navegador (ver abaixo).**

Causa do HTTP 404 em `GET /auth/setup-status`: o processo que ocupava a porta
8000 (PID 8164) foi iniciado em 14/10/2026 às 11:10, antes de as rotas de
autenticação serem commitadas (14/10/2026 às 23:17). O uvicorn roda sem
`--reload`, então continuou servindo o código antigo, cujo OpenAPI não tinha
rotas `/auth/*`. O código da branch sempre registrou as rotas corretamente. A
correção foi reiniciar somente esse PID e iniciar o backend atual. Após o
reinício, `GET /auth/setup-status` responde 200 (`{"setup_required":true}`
enquanto não houver usuários), `/docs` responde 200 e o OpenAPI lista as 11
rotas `/auth/*`.

Se o backend for alterado novamente, é preciso reiniciá-lo (sem `--reload`).

O frontend agora mostra uma mensagem clara, com botão "Tentar novamente", quando
a API está indisponível ou não possui as rotas de autenticação, em vez de exibir
o formulário de login com "Not Found".

## O que está implementado

- Senhas armazenadas com PBKDF2-HMAC-SHA256 e salt aleatório.
- Tokens bearer aleatórios, persistidos somente como hash e com expiração por inatividade de 5 minutos (janela deslizante) e limite absoluto de 12 horas.
- Respostas de usuário sem senha ou hash.
- Bloqueio de login para contas inativas, sem distinguir conta inexistente,
  senha inválida ou conta inativa na mensagem de erro.
- Criação do primeiro administrador apenas quando ainda não há usuários e
  quando a chamada vem de loopback.
- Perfis `ADMIN` e `CONFERENTE`.
- CRUD administrativo de usuários, ativação/inativação e redefinição de senha.
- Alteração da própria senha, revogando as sessões existentes.
- Logout autenticado que invalida a sessão apresentada.
- Proteção contra inativar a própria conta ou remover/inativar o último
  administrador ativo.
- As APIs operacionais de produtos, locais, conferentes, estoque e
  movimentações exigem autenticação.
- `Base.metadata.create_all()` cria tabelas ausentes na inicialização; não
  altera o esquema de tabelas já existentes.

## Endpoints

| Método | Caminho | Autorização | Uso |
|---|---|---|---|
| `GET` | `/auth/setup-status` | Pública | Informa se a configuração inicial é necessária. |
| `POST` | `/auth/setup-admin` | Loopback; somente antes do primeiro usuário | Cria o primeiro administrador e inicia sessão. |
| `POST` | `/auth/login` | Pública | Autentica usuário e senha e inicia sessão. |
| `GET` | `/auth/me` | Bearer válido | Consulta o usuário autenticado. |
| `POST` | `/auth/logout` | Bearer válido | Invalida a sessão apresentada. |
| `PUT` | `/auth/me/password` | Bearer válido | Altera a senha própria e revoga as sessões do usuário. |
| `GET` | `/auth/users` | Administrador | Lista usuários; `include_inactive` é falso por padrão e `search` é opcional. |
| `POST` | `/auth/users` | Administrador | Cria usuário com perfil `ADMIN` ou `CONFERENTE`. |
| `PUT` | `/auth/users/{user_id}` | Administrador | Atualiza nome e/ou perfil. |
| `POST` | `/auth/users/{user_id}/reset-password` | Administrador | Redefine a senha e revoga as sessões do usuário. |
| `POST` | `/auth/users/{user_id}/deactivate` | Administrador | Inativa usuário e revoga suas sessões. |
| `POST` | `/auth/users/{user_id}/activate` | Administrador | Reativa usuário; sessões anteriores não voltam a valer. |

As APIs operacionais continuam disponíveis nos caminhos existentes, mas exigem
token bearer. A autorização administrativa das operações de usuários é aplicada
no backend; a interface não é a única barreira.

## Primeiro administrador

1. No computador que hospeda a API, inicie o backend e o frontend.
2. Abra `http://localhost:3000` nesse mesmo computador.
3. Crie a primeira conta administrativa. O nome de usuário é normalizado para
   minúsculas e a senha deve ter entre 8 e 128 caracteres.
4. Depois da configuração, `/auth/setup-admin` passa a retornar HTTP 409.
   Chamadas que não vêm de `127.0.0.1`, `::1` ou `localhost` são recusadas com
   HTTP 403.
5. Crie as demais contas pela área de usuários autenticada como administrador.

## Banco de dados e compatibilidade

O banco configurado por padrão é `backend/data/c4gestao.db`, podendo ser
substituído por `C4_DATABASE_URL`. A inspeção não mutável do banco local
encontrou as nove tabelas esperadas, incluindo `users` e `auth_sessions`, sem
tabelas ausentes e com chaves estrangeiras habilitadas. Na inspeção, as tabelas
de autenticação não continham usuários nem sessões.

Os testes usam bancos SQLite temporários criados em diretórios temporários e
removidos ao final. Nenhum usuário, sessão ou dado operacional foi criado no
banco local do projeto. `create_all()` cria tabelas ausentes, mas não é uma
ferramenta de migração para alterações futuras em tabelas antigas.

## Iniciar e validar localmente

Execute a partir da raiz do repositório.

Backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Frontend, em outro terminal:

```powershell
npm run dev
```

URLs de validação:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/openapi.json`
- `http://127.0.0.1:8000/auth/setup-status`
- `http://127.0.0.1:3000/`

Se a porta 8000 já estiver ocupada, identifique o processo e confirme seu
executável/comando antes de encerrá-lo:

```powershell
$listeners = Get-NetTCPConnection -LocalPort 8000 -State Listen
$listeners | ForEach-Object {
  Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)"
}
```

Encerre somente o PID confirmado como a instância que deseja substituir (ou
interrompa-a pelo terminal em que foi iniciada) e então execute o comando do
backend acima. Se usar `Stop-Process`, informe o PID numérico confirmado.
Não finalize processos por nome nem encerre uma instância sem confirmar sua
origem.

## Testes automatizados

Instale as dependências de runtime e teste a partir da raiz:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r backend\requirements-test.txt
.\.venv\Scripts\python.exe -m pytest -q
```

A suíte em `backend/tests/test_auth_api.py` usa SQLite temporário e cobre estado
inicial, criação e bloqueio de segundo administrador, restrição local,
credenciais válidas/inválidas, usuário inativo, consulta autenticada, token
ausente/inválido, autorização administrativa, CRUD, unicidade, ativação,
desativação, redefinição e alteração de senha, último administrador, logout,
hash de tokens e proteção/regressão das rotas operacionais.

Resultados obtidos nesta execução:

- `python -m pytest -q`: **15 testes aprovados**, 16 subtestes aprovados; um
  aviso de depreciação de `anyio` vindo do `TestClient`/Starlette.
- `python -m unittest discover -s backend\tests -q`: **15 testes aprovados**.
- `npm run lint`: aprovado.
- `npm run build`: aprovado; Vite emitiu um aviso de chunk
  JavaScript maior que 500 kB.
- Backend iniciado em uma porta livre alternativa com SQLite descartável:
  `/`, `/openapi.json` e `/auth/setup-status` responderam corretamente; setup,
  bloqueio do segundo administrador, login, autorização, rotas protegidas,
  gerenciamento de usuário, logout e invalidação da sessão foram exercitados
  em 21 verificações HTTP com os status esperados.

O teste em porta alternativa valida o código atual, mas não substitui o
reinício controlado da instância antiga que ocupa a porta 8000.

## Sessão, fechamento e reabertura (C4-AUTH-003)

- O token fica em `sessionStorage` (por aba/janela), não mais em `localStorage`.
  Fechar a aba/janela/app descarta o token; atualizar a página (F5) mantém a
  sessão. Um token legado em `localStorage` é removido e ignorado.
- No servidor, a sessão expira após 5 minutos sem requisições autenticadas
  (`SESSION_IDLE_MINUTES`) e nunca passa de 12 horas desde o login
  (`SESSION_MAX_HOURS`). Cada requisição autenticada renova a janela. O
  frontend chama `GET /auth/me` a cada 60 s enquanto está aberto; ao fechar,
  o heartbeat para e a sessão antiga se torna inválida em até 5 minutos, mesmo
  que o armazenamento do navegador seja restaurado.
- Não se usa `beforeunload`/`unload`, pois não são garantidos.
- Um `401` em rota protegida limpa o token e devolve a interface ao login.
- Cada aba tem sua própria sessão; novas abas pedem login e o logout em uma
  aba não encerra a outra.

## Conferente em "Registrar Entrada"

O campo de digitação foi removido; a tela mostra o nome do usuário autenticado
(somente leitura). Ao confirmar a entrada, a interface revalida a sessão em
`GET /auth/me` e usa o `full_name` devolvido pelo backend. Sem sessão válida, a
entrada é bloqueada e o usuário volta ao login. Limitação: estoque e
movimentações ainda são gravados no `localStorage` do navegador, então o nome
é registrado pelo frontend; o backend (`/movements`, tabela `checkers`) não
participa desse fluxo. O campo de conferente da tela de Consulta de Estoque
(edição) não foi alterado.

### Resultados da validação (C4-AUTH-003)

- `python -m pytest -q`: **19 testes aprovados**, 16 subtestes; novos testes de
  janela por inatividade, expiração sem heartbeat, limite de 12 h e dois
  usuários com sessões e identidades independentes.
- `npm run lint` e `npm run build`: aprovados (aviso de chunk > 500 kB).
- E2E no navegador (backend com SQLite temporário e Vite em portas alternativas):
  setup do primeiro admin; token em `sessionStorage` e `localStorage` vazio;
  F5 mantém a sessão; nova aba exibe login sem conteúdo protegido; entrada
  registrada com o nome do admin; logout, login como segundo usuário e nova
  entrada gravada com o nome dele; com a sessão expirada no servidor, a
  confirmação da entrada foi bloqueada e o app voltou ao login (nenhum registro
  novo). Não foi testado o fechamento real do navegador/PWA instalado nem a
  expiração temporal real de 5 minutos (coberta apenas por teste automatizado).
## Pendências

- Criar o primeiro administrador pelo navegador e validar login,
  gerenciamento de usuários e logout no banco real (nenhum usuário foi criado
  no banco real durante os testes; a tela de configuração inicial foi
  verificada e está sendo exibida).

## Limite desta etapa

Estoque e histórico que ainda vivem no `localStorage` continuam locais ao
navegador/dispositivo. Esta etapa autentica a aplicação e protege as APIs
existentes, mas não transforma automaticamente os dados locais em dados
compartilhados nem associa o usuário autenticado a cada movimento local. Esse
vínculo pertence à etapa de rastreabilidade/auditoria.
