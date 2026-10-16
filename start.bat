@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title B1H4 Workspace

echo.
echo ==========================================================
echo   B1H4 WORKSPACE
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [필요] Node.js 가 설치되어 있지 않습니다.
    echo.
    echo   https://nodejs.org 에서 LTS 버전을 설치한 뒤
    echo   이 파일을 다시 실행하세요.
    echo.
    pause
    exit /b
)

if not exist "node_modules" (
    echo   최초 실행입니다. 필요한 패키지를 설치합니다.
    echo   1~2분 정도 걸리며, 다음 실행부터는 바로 시작됩니다.
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo   패키지 설치에 실패했습니다. 인터넷 연결을 확인하세요.
        pause
        exit /b
    )
    echo.
)

set "SHAREURL="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "IP=%%A"
    set "IP=!IP: =!"
    if not "!IP!"=="127.0.0.1" (
        if "!SHAREURL!"=="" set "SHAREURL=http://!IP!:4000"
    )
)

echo   ----------------------------------------------------
echo     팀원에게 아래 주소를 공유하세요
echo   ----------------------------------------------------
if defined SHAREURL (
    echo     !SHAREURL!
) else (
    echo     네트워크 주소를 찾지 못했습니다. 와이파이 연결을 확인하세요.
)
echo   ----------------------------------------------------
echo     같은 와이파이에 연결된 팀원만 접속할 수 있습니다.
echo     서버를 끄면 접속도 함께 끊깁니다.
echo   ----------------------------------------------------
echo.

start "" http://localhost:4000

node server.js

echo.
echo   서버가 종료되었습니다.
pause
