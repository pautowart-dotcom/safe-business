@echo off
cd /d "%~dp0"
echo Checking 30 questions via YandexGPT, wait 1-2 minutes...
node cli-chat.js --batch test\voprosy.txt > check.txt 2>&1
echo.
echo DONE. You can close this window and turn VPN back on.
pause
