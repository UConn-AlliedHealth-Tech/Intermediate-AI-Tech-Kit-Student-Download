@echo off
REM Medical AI Learning Lab - Quick Start Script (Windows)

echo =========================================
echo Medical AI Learning Lab - Quick Start
echo =========================================
echo.

echo Checking prerequisites...

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo X Node.js not found. Please install from https://nodejs.org/
    pause
    exit /b 1
)
echo √ Node.js installed

REM Check npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo X npm not found. Please install npm
    pause
    exit /b 1
)
echo √ npm installed

REM Check Kaggle CLI
where kaggle >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ! Kaggle CLI not found. Installing...
    pip install kaggle
    if %ERRORLEVEL% NEQ 0 (
        echo X Failed to install Kaggle CLI. Please run: pip install kaggle
        pause
        exit /b 1
    )
)
echo √ Kaggle CLI installed

echo.
echo Installing backend dependencies...
cd backend
call npm install

echo.
echo =========================================
echo Starting backend server...
echo =========================================
call npm start

@echo off
REM Use bundled Node.js to start the server
set "NODE_DIR=%~dp0\node-win"  && REM path to embedded Node for Windows
"%NODE_DIR%\node.exe" server.js  || goto :error

REM On successful server start, open the app in default browser
start http://localhost:3001
exit /b

:error
echo Failed to start the Medical AI Learning Lab server.
pause