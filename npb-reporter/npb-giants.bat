@echo off
cd /d "%~dp0"
echo [%date% %time%] NPB巨人戦レポート起動 >> data\run.log
node npb-report.mjs --team 巨人 >> data\run.log 2>&1
echo [%date% %time%] 完了 >> data\run.log
