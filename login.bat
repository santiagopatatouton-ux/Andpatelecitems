@echo off
set PATH=C:\Program Files\nodejs;%PATH%
call npx firebase login --no-localhost --reauth
