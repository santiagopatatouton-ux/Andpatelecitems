@echo off
set PATH=C:\Program Files\nodejs;%PATH%
echo Construyendo la version de produccion de Expo Web...
call npx expo export -p web
if %errorlevel% neq 0 (
  echo Error en la construccion de Expo.
  exit /b %errorlevel%
)
echo Desplegando en Firebase Hosting...
call npx firebase deploy --only hosting
if %errorlevel% neq 0 (
  echo Error en el despliegue. Posiblemente necesites iniciar sesion.
  echo Escribe: npx firebase login
  exit /b %errorlevel%
)
echo ¡Despliegue completado con exito!
