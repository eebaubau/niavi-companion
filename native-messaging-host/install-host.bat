@echo off
REM Install Chrome native messaging host manifest for Niavi Companion (Windows)

set HOST_NAME=com.niavi.companion
set MANIFEST_DIR=%LOCALAPPDATA%\Google\Chrome\User Data\NativeMessagingHosts
set SCRIPT_DIR=%~dp0

if not exist "%MANIFEST_DIR%" mkdir "%MANIFEST_DIR%"
copy "%SCRIPT_DIR%%HOST_NAME%.json" "%MANIFEST_DIR%\"

echo Native messaging host installed to: %MANIFEST_DIR%\%HOST_NAME%.json
pause
