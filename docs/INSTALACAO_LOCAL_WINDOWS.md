# C4 Gestão — servidor local Windows e clientes na LAN

## Arquitetura

O computador principal da loja atua como **servidor local**. Ele executa a API FastAPI e mantém o único arquivo SQLite operacional. Os demais computadores e tablets acessam a aplicação pelo navegador usando HTTP; eles **não** abrem, copiam ou compartilham o arquivo SQLite.

```text
[Servidor Windows]
  FastAPI + frontend empacotado
  SQLite: %LOCALAPPDATA%\C4Gestao\data\c4gestao.db
              ▲
              │ HTTP na rede local
              ├── PC cliente
              └── tablet / notebook
```

A autenticação continua protegendo os endpoints operacionais. A configuração inicial do primeiro administrador só pode ser feita no próprio servidor, em loopback, antes de liberar o uso pelos clientes.

## Configuração do servidor

O backend usa `127.0.0.1` por padrão, para não expor uma instalação nova na rede. Para o computador servidor aceitar clientes na LAN, defina explicitamente as variáveis de ambiente antes de iniciar:

```powershell
$env:C4_API_HOST = "0.0.0.0"
$env:C4_API_PORT = "8000"
$env:C4_BROWSER_HOST = "127.0.0.1"
$env:C4_CORS_ORIGINS = "http://192.168.1.10:3000"
```

Substitua `192.168.1.10` pelo endereço IPv4 fixo ou reservado do servidor. Se o frontend for servido pelo backend empacotado na porta 8000, o acesso será pela mesma origem e `C4_CORS_ORIGINS` normalmente não precisa incluir essa URL. Durante desenvolvimento com Vite, inclua somente as origens realmente utilizadas.

Nunca use o endereço público da internet para este servidor e não faça encaminhamento da porta 8000 no roteador. O firewall deve permitir a porta TCP 8000 apenas no perfil **Privado** da rede local:

```powershell
New-NetFirewallRule -DisplayName "C4 Gestao API LAN" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
```

Para remover a regra criada acima:

```powershell
Remove-NetFirewallRule -DisplayName "C4 Gestao API LAN"
```

## Execução durante desenvolvimento

Na máquina servidor, na raiz do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
npm ci
$env:C4_API_HOST = "0.0.0.0"
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Em outro terminal, inicie o frontend:

```powershell
npm run dev
```

O frontend de desenvolvimento usa a porta 3000 e, por padrão, monta a URL da API com o hostname do navegador e a porta 8000. Portanto, no cliente, abra `http://IP_DO_SERVIDOR:3000`. Se for necessário fixar a URL, configure `VITE_API_URL=http://IP_DO_SERVIDOR:8000` antes do `npm run dev`.

O arquivo `Iniciar-C4-Gestao.bat` mantém o modo de desenvolvimento anterior: API em `0.0.0.0:8000` e Vite em `0.0.0.0:3000`. Isso é uma abertura explícita para a LAN, não o padrão seguro do backend.

## Pacote Windows

Para gerar o pacote de teste:

```powershell
python scripts/build_windows.py
```

O resultado é `dist\\C4Gestao\\C4Gestao.exe`. O script executa lint, build do frontend e empacotamento com PyInstaller. Ele ainda não é um instalador Setup.

No pacote, o frontend compilado é servido pelo próprio FastAPI. Para uso como servidor, configure `C4_API_HOST=0.0.0.0` no ambiente do processo e mantenha `C4_BROWSER_HOST=127.0.0.1` para que o navegador aberto automaticamente no servidor use loopback. Os clientes acessam `http://IP_DO_SERVIDOR:8000`.

Para uso individual, não defina `C4_API_HOST` ou use `127.0.0.1`; o sistema continua acessível somente no próprio computador.

## Dados, persistência e backup

O banco operacional do pacote fica fora da pasta do executável, em `%LOCALAPPDATA%\C4Gestao\data\c4gestao.db`. Atualizar o executável não deve substituir esse arquivo. Clientes nunca devem receber permissão de compartilhamento de arquivos para essa pasta.

O backup deve ser executado no servidor:

```powershell
.\.venv\Scripts\python.exe -m backend.app.tools.backup backup
.\.venv\Scripts\python.exe -m backend.app.tools.backup verify
```

A restauração exige confirmação explícita e preserva uma cópia de segurança do banco substituído:

```powershell
.\.venv\Scripts\python.exe -m backend.app.tools.backup restore `
  --backup-file "C:\caminho\c4gestao-AAAAMMDD-HHMMSS.db" `
  --confirm RESTAURAR
```

Nunca execute os testes contra o banco operacional. Os testes deste projeto criam bancos temporários e os descartam ao final. Para restaurar, encerre a API e faça o procedimento somente no servidor.

## Atualização sem perda de dados

1. Faça e verifique um backup no servidor.
2. Encerre o processo do C4 Gestão.
3. Substitua somente o executável e arquivos do pacote; preserve `%LOCALAPPDATA%\C4Gestao\data` e `backups`.
4. Inicie o servidor e valide `/health`, login, consulta de produto e movimentações.
5. Não copie o SQLite para cada cliente e não execute migrações manuais sem uma alteração versionada no projeto.

## Validação funcional

A validação automatizada cobre API, autenticação, estoque, conferência NF-e, backup e banco temporário. A validação manual necessária para declarar a solução pronta inclui: servidor iniciado, acesso local, acesso por outro dispositivo, login remoto, produto consultado/cadastrado, movimentação persistida, reinício com dados preservados e conferência NF-e sem regressão.

Essa validação multi-dispositivo depende de uma rede Windows real e não é declarada aprovada apenas por testes executados neste ambiente. Também é necessário testar firewall, endereço IP reservado, execução do `.exe` e o comportamento após reinicialização do Windows antes de distribuir para produção.

## Limitações conhecidas

O pacote atual é um pacote de teste, não um instalador com serviço Windows. O endereço IP do servidor precisa ser estável ou divulgado aos clientes. O sistema foi desenhado para uma rede local confiável; não substitui HTTPS, VPN ou controles de exposição para acesso pela internet.
