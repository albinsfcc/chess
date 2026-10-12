@echo off
title Chess Review Launcher

:: Navigate to project directory
cd /d "C:\Users\albin\projects\chess-review"

:: Build the project
echo Building Chess Review...
call npm run build

if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

:: Start the server in a separate window
echo Starting server...
start "Chess Review Server" cmd /k "npm start"

:: Wait for localhost:3000 to become available
echo Waiting for server...

for /L %%i in (1,1,30) do (
    curl -s -o NUL --max-time 2 http://localhost:3000 >NUL 2>&1
    if not errorlevel 1 goto ready
    timeout /t 2 /nobreak >NUL
)

echo Server failed to start within the expected time.
pause
exit /b 1

:ready
echo Server is ready!

:: Open application in default browser
start "" "http://localhost:3000"

echo Chess Review launched successfully!
exit /b 0