@echo off
setlocal
title C4 Gestao - Inicializador
cd /d "%~dp0"

echo ============================================
echo       C4 GESTAO - MODULO CONFERENCIA 2.5
echo ============================================
echo.

if not exist ".venv\Scripts\python.exe" (
  echo ERRO: ambiente Python .venv nao encontrado.
  echo Confira se este arquivo esta na pasta principal do projeto.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo ERRO: dependencias do frontend nao encontradas.
  echo Execute npm install na pasta principal do projeto e tente novamente.
  pause
  exit /b 1
)

echo Iniciando a API na porta 8000...
start "C4 Gestao - API (mantenha aberto)" cmd /k "cd /d ""%~dp0"" && ""%~dp0.venv\Scripts\python.exe"" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000"

echo Iniciando o frontend na porta 3000...
start "C4 Gestao - Frontend (mantenha aberto)" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo Inicializacao solicitada.
echo Mantenha abertas as duas janelas: API e Frontend.
echo Para abrir o sistema, acesse http://localhost:3000
echo Para verificar a API, acesse http://localhost:8000/docs
echo.
timeout /t 3 >nul
start "" "http://localhost:3000"
endlocal
