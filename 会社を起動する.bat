@echo off
title 佐伯亮カンパニー サーバー

cd /d "%~dp0"

echo.
echo  =========================================
echo    佐伯亮カンパニー 起動中...
echo  =========================================
echo.

:: 古いサーバーを停止
echo  古いサーバーを停止中...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "0.0.0.0:3355"') do taskkill /PID %%a /F >nul 2>&1
timeout /t 1 /nobreak >nul

:: Node.jsの確認
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  Node.js が見つかりません。
  pause
  exit /b 1
)

echo  サーバー起動: http://localhost:3355
echo  note記事一覧: http://localhost:3355/viewer
echo.
echo  このウィンドウを閉じるとサーバーが止まります
echo  =========================================
echo.

:: 2秒後にブラウザを開く
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3355/viewer"

:: サーバー起動
node company-server.mjs

pause
