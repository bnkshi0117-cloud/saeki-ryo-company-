@echo off
echo タスクスケジューラーに note-checker を登録します...

set SCRIPT_DIR=%~dp0
set BAT_PATH=%SCRIPT_DIR%note-check.bat

rem --- 毎日 8:00 に実行 ---
schtasks /create /tn "SaekiRyo\NoteChecker_Daily" ^
  /tr "\"%BAT_PATH%\"" ^
  /sc daily /st 08:00 ^
  /f

rem --- ログオン時に実行（8時前なら内部でスキップ） ---
schtasks /create /tn "SaekiRyo\NoteChecker_Logon" ^
  /tr "\"%BAT_PATH%\"" ^
  /sc onlogon ^
  /f

echo.
echo ✅ 登録完了
echo   - 毎日 08:00 に自動実行
echo   - ログオン時にも実行（8時前はスキップ）
echo.
echo 結果は logs\x-posts\ に保存されます
pause
