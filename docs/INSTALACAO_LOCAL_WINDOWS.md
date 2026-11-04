# C4 Gestão — servidor local Windows e clientes na LAN

## 1. Como o sistema funciona

O computador principal da loja atua como **servidor local**. Ele executa a API FastAPI e mantém o único arquivo SQLite operacional. Os demais computadores e tablets acessam a aplicação pelo navegador usando HTTP; eles **não** abrem, copiam, sincronizam ou compartilham o arquivo SQLite.

```text
[Servidor Windows]
  FastAPI + frontend empacotado
  SQLite: %LOCALAPPDATA%\C4Gestao\data\c4gestao.db
              ▲
              │ HTTP somente na rede privada da loja
              ├── PC cliente
              └── tablet / notebook
```

A autenticação protege os endpoints operacionais. A configuração inicial do primeiro administrador deve ser feita no próprio servidor, usando `127.0.0.1`, antes de liberar o uso pelos clientes.

## 2. Escolha o modo de execução

### Modo individual

Use `127.0.0.1` quando apenas o computador local usará o sistema. É o padrão seguro:

```powershell
$env:C4_API_HOST = "127.0.0.1"
$env:C4_API_PORT = "8000"
```

Abra `http://127.0.0.1:8000` no próprio computador.

### Modo servidor LAN

Use `0.0.0.0` somente no computador servidor, para aceitar conexões na rede privada:

```powershell
$env:C4_API_HOST = "0.0.0.0"
$env:C4_API_PORT = "8000"
$env:C4_BROWSER_HOST = "127.0.0.1"
```

O endereço `0.0.0.0` é apenas um endereço de escuta; os usuários não devem digitá-lo no navegador. Descubra o IPv4 do servidor com `ipconfig` e, nos clientes, abra:

```text
http://IP_DO_SERVIDOR:8000
```

Exemplo: `http://192.168.1.10:8000`.

O frontend servido pelo backend usa a mesma origem e, nesse modo, não precisa de CORS para o acesso normal. O cliente deve abrir a URL do servidor; não deve iniciar uma API própria nem executar o banco local.

## 3. CORS: liberar somente o necessário

Por padrão, o CORS aceita somente as origens locais listadas em `C4_CORS_ORIGINS` e **não** usa uma regex ampla para toda a rede privada. No pacote empacotado, frontend e API usam a mesma origem na porta 8000, portanto não há necessidade de adicionar origens LAN.

Durante desenvolvimento com Vite, no servidor, informe somente a origem que será aberta pelos usuários:

```powershell
$env:C4_CORS_ORIGINS = "http://192.168.1.10:3000"
$env:C4_CORS_ORIGIN_REGEX = ""
```

Se for realmente necessário aceitar uma faixa de endereços para o Vite, defina uma regex específica para a sub-rede e a porta da loja. Não use `.*`, não inclua portas públicas e não habilite uma faixa maior que a rede necessária. Exemplo para `192.168.1.0/24` na porta 3000:

```powershell
$env:C4_CORS_ORIGIN_REGEX = "^https?://192\.168\.1\.(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4]):3000$"
```

## 4. Firewall do Windows

Não exponha a porta no roteador nem use o endereço público da internet. Configure a rede do servidor como **Privada** e permita somente a porta necessária no perfil `Private`.

### Pacote empacotado: somente API na porta 8000

```powershell
New-NetFirewallRule -DisplayName "C4 Gestao API LAN" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 `
  -Action Allow -Profile Private
```

### Desenvolvimento com Vite: porta 3000 opcional

Crie esta regra somente enquanto o Vite estiver sendo usado por outros dispositivos:

```powershell
New-NetFirewallRule -DisplayName "C4 Gestao Vite LAN (desenvolvimento)" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 `
  -Action Allow -Profile Private
```

A porta 5173 só deve ser liberada se a execução realmente usar essa porta. Para remover as regras quando não forem mais necessárias:

```powershell
Remove-NetFirewallRule -DisplayName "C4 Gestao API LAN"
Remove-NetFirewallRule -DisplayName "C4 Gestao Vite LAN (desenvolvimento)"
```

Não compartilhe a pasta `%LOCALAPPDATA%\C4Gestao` na rede e não crie regras de firewall para o arquivo SQLite. O único acesso dos clientes deve ser HTTP para a API.

## 5. Execução durante desenvolvimento

Na máquina servidor, na raiz do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-desktop.txt
npm ci
$env:C4_API_HOST = "0.0.0.0"
$env:C4_API_PORT = "8000"
$env:C4_CORS_ORIGINS = "http://IP_DO_SERVIDOR:3000"
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Em outro terminal do mesmo servidor:

```powershell
npm run dev -- --host 0.0.0.0 --port 3000
```

Abra nos clientes `http://IP_DO_SERVIDOR:3000`. O frontend usa o hostname da página e consulta a API na porta 8000. Para fixar explicitamente a API, configure `VITE_API_URL=http://IP_DO_SERVIDOR:8000` antes do build/desenvolvimento.

O arquivo `Iniciar-C4-Gestao.bat` mantém o modo de desenvolvimento anterior: API em `0.0.0.0:8000` e Vite em `0.0.0.0:3000`. Use a regra de firewall da porta 3000 somente nesse cenário.

## 6. Pacote Windows

Para gerar o pacote de teste:

```powershell
python scripts/build_windows.py
```

O resultado é `build\desktop\C4Gestao\C4Gestao.exe`. O script executa lint, build do frontend e empacotamento com PyInstaller. Ele ainda não é um instalador Setup nem um serviço Windows.

No pacote, o frontend compilado é servido pelo próprio FastAPI. Para uso como servidor, configure `C4_API_HOST=0.0.0.0` no ambiente do processo e mantenha `C4_BROWSER_HOST=127.0.0.1`. Os clientes acessam `http://IP_DO_SERVIDOR:8000`.

Para uso individual, use `127.0.0.1`; o sistema continua acessível somente no próprio computador.

## 7. Banco, persistência e backup

O banco operacional do pacote fica fora da pasta do executável, em `%LOCALAPPDATA%\C4Gestao\data\c4gestao.db`. Reiniciar a API não cria outro banco: o mesmo processo do servidor reabre esse arquivo. Atualizar o executável não deve substituí-lo.

O backup deve ser executado no servidor:

```powershell
.\.venv\Scripts\python.exe -m backend.app.tools.backup backup
.\.venv\Scripts\python.exe -m backend.app.tools.backup verify
```

A restauração exige confirmação explícita e preserva uma cópia do banco substituído. Encerre a API antes da restauração:

```powershell
.\.venv\Scripts\python.exe -m backend.app.tools.backup restore `
  --backup-file "C:\caminho\c4gestao-AAAAMMDD-HHMMSS.db" `
  --confirm RESTAURAR
```

Nunca execute testes contra o banco operacional. Os testes automatizados usam bancos temporários e os descartam ao final. Clientes nunca devem receber acesso ao caminho do SQLite.

## 8. Roteiro de teste com dois computadores Windows

Este roteiro é obrigatório antes de declarar a rede pronta. Use dados de teste e uma rede privada controlada.

1. No computador A, confirme o IPv4 com `ipconfig`, reserve/anote o endereço do servidor e inicie a API em `0.0.0.0:8000`.
2. No computador A, abra `http://127.0.0.1:8000/health` e confirme `status: ok`.
3. No computador B, abra `http://IP_DO_SERVIDOR:8000/health`. O resultado deve ser o mesmo; não abra `localhost` no computador B.
4. No computador A, abra o sistema pela URL do servidor e faça a configuração inicial do administrador. Essa etapa deve ser local ao servidor.
5. No computador A, faça login e cadastre um produto de teste, por exemplo código `LAN-001`, nome `Produto Rede`, estoque mínimo `5`.
6. No computador B, faça login com um usuário autorizado, consulte o produto `LAN-001` e confirme que ele veio da mesma base.
7. No computador B, registre uma entrada ou movimentação de estoque para o produto.
8. No computador A, atualize a tela e confirme a movimentação e o saldo registrados pelo computador B.
9. Feche e reinicie somente a API no computador A, sem apagar o arquivo de dados.
10. No computador B, faça login novamente e confirme que produto, movimentação e saldo continuam disponíveis.
11. Repita uma consulta simultânea simples nos dois computadores e confirme que ambos exibem o mesmo saldo.
12. Remova os dados de teste conforme o procedimento operacional e registre data, IP do servidor, portas liberadas e resultado.

Registre separadamente falhas de firewall, falhas de login, falhas de conexão e divergências de dados. Não declare o teste aprovado se o computador B tiver executado uma API própria ou se o servidor tiver criado um segundo arquivo SQLite.

## 9. Atualização sem perda de dados

1. Faça e verifique um backup no servidor.
2. Encerre o processo do C4 Gestão.
3. Substitua somente o executável e arquivos do pacote; preserve `%LOCALAPPDATA%\C4Gestao\data` e `backups`.
4. Inicie o servidor e valide `/health`, login, consulta de produto e movimentações.
5. Não copie o SQLite para cada cliente e não execute migrações manuais sem uma alteração versionada no projeto.

## 10. Estado e limitações

A validação automatizada cobre API, autenticação, estoque, conferência NF-e, backup e banco temporário. A validação de dois dispositivos, firewall, IP reservado, execução real do `.exe`, reinicialização do Windows e acesso simultâneo ainda depende de uma rede Windows real.

O sistema foi desenhado para uma rede local confiável. O pacote atual não é um instalador com serviço Windows e não substitui HTTPS, VPN ou controles de exposição para acesso pela internet. Não declare o sistema pronto para produção antes de concluir e registrar o roteiro da seção 8.
