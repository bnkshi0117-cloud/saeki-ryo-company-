@echo off
powershell -Command "Get-NetTCPConnection -LocalPort 3366 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
cd /d "C:\Users\BENOKI\Desktop\saeki-ryo-company\x-dashboard"
start http://localhost:3366
node server.mjs
pause
