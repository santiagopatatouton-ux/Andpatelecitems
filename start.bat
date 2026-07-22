@echo off
set PATH=C:\Program Files\nodejs;%PATH%
node -v
call npm run web -- --port 8081
