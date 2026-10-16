@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title B1H4 Workspace - 인터넷 공유

echo.
echo ==========================================================
echo   B1H4 WORKSPACE - 인터넷으로 공유하기
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [필요] Node.js 가 설치되어 있지 않습니다.
    echo   https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
    echo.
    pause
    exit /b
)

if not exist "node_modules" (
    echo   최초 실행입니다. 필요한 패키지를 설치합니다. 1~2분 걸립니다.
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo   패키지 설치에 실패했습니다. 인터넷 연결을 확인하세요.
        pause
        exit /b
    )
    echo.
)

REM 로그인 세션 키를 한 번 만들어 파일에 보관합니다.
REM 이 파일이 유지되는 한 서버를 껐다 켜도 팀원이 다시 로그인하지 않아도 됩니다.
if not exist ".session-secret" (
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > .session-secret
)
set /p SESSION_SECRET=<.session-secret
set TRUST_PROXY=1

REM 터널 프로그램이 없으면 내려받습니다. 한 번만 받으면 됩니다.
if not exist "cloudflared.exe" (
    echo   터널 프로그램을 내려받습니다. 잠시 기다려주세요.
    curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    if errorlevel 1 (
        echo   내려받기에 실패했습니다. 인터넷 연결을 확인하세요.
        pause
        exit /b
    )
    echo.
)

echo   서버를 켭니다...
start "B1H4 서버" cmd /c "node server.js & pause"
timeout /t 5 /nobreak >nul

if exist tunnel.log del tunnel.log
echo   인터넷 주소를 만드는 중입니다...
start "B1H4 터널" /min cmd /c "cloudflared.exe tunnel --url http://localhost:4000 --logfile tunnel.log"

set "TURL="
for /f "tokens=*" %%A in ('node tools\tunnel-url.js') do set "TURL=%%A"

echo.
echo   ----------------------------------------------------
if "!TURL!"=="TIMEOUT" (
    echo     주소를 만들지 못했습니다.
    echo     tunnel.log 파일을 열어 내용을 확인하세요.
) else (
    echo     팀원에게 아래 주소를 공유하세요
    echo   ----------------------------------------------------
    echo     !TURL!
    echo   ----------------------------------------------------
    echo     인터넷이 되는 곳이면 어디서든 접속됩니다.
    echo     이 창을 닫거나 PC를 끄면 접속이 끊깁니다.
    echo     다시 켜면 주소가 새로 바뀌니 그때 다시 공유하세요.
)
echo   ----------------------------------------------------
echo.

if not "!TURL!"=="TIMEOUT" start "" "!TURL!"

echo   종료하려면 이 창에서 아무 키나 누르세요.
pause >nul

echo   정리 중입니다...
taskkill /f /im cloudflared.exe >nul 2>nul
taskkill /f /fi "WINDOWTITLE eq B1H4 서버*" >nul 2>nul
