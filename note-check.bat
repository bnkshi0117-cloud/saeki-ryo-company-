@echo off
cd /d "%~dp0note-generator"
node scripts/note-checker.mjs
pause
