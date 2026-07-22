@echo off
set PATH=C:\Program Files\nodejs;%PATH%
node -v
call npm install -g firebase-tools
call firebase login:ci
