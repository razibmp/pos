@echo off
echo.
echo  Installing dependencies...
cd server
call npm install
cd ..

echo.
echo  Building frontend...
cd frontend
call npm install
call npm run build
cd ..

echo.
echo  Copying frontend build to server...
xcopy /E /I /Y frontend\dist server\public

echo.
echo  Starting The Hobby Center...
cd server
node index.js
