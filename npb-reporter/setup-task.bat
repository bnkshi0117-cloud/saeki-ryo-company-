@echo off
echo NPB巨人戦レポート タスクスケジューラー登録

set TASK_NAME=NPB_Giants_Report
set BAT_PATH=%~dp0npb-giants.bat

schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%BAT_PATH%\"" ^
  /sc DAILY ^
  /st 22:30 ^
  /f

if %errorlevel% == 0 (
  echo ✅ タスク登録完了: 毎日22:30に実行
  echo タスク名: %TASK_NAME%
) else (
  echo ❌ 登録失敗。管理者権限で実行してください。
)
pause
