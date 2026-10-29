# C4 Gestão — pacote local para Windows

## Objetivo

Executar a interface e a API no mesmo computador, com SQLite local, sem depender de nuvem ou de outro computador como servidor. O processo local usa somente o endereço de loopback `127.0.0.1`.

## Pré-requisitos para gerar o pacote

- Windows 10/11 de 64 bits.
- Node.js LTS com npm.
- Python 3.11 ou superior.
- Acesso à internet durante a primeira instalação das dependências de build.

## Gerar o pacote de teste

Na raiz do repositório, execute no terminal:

```powershell
python scripts/build_windows.py
```

O pacote de teste será gerado em `dist\\C4Gestao\\C4Gestao.exe`.

## Dados locais

Na versão empacotada, o SQLite deve ficar na pasta de dados do usuário do Windows, fora da pasta do executável, para que atualizações não apaguem os dados. Antes de usar em produção, valide o caminho do banco e faça uma cópia de segurança.

## Estado do pacote

Este script prepara um pacote de teste. Ele não é, por si só, um instalador Setup e ainda exige testes funcionais no Windows. Não distribua como versão final antes de confirmar login, produtos, locais, estoque, movimentações, reinicialização e persistência do banco.
