@echo off
title Manage America API Test
cd /d "%~dp0"
start /b python server.py
timeout /t 2 /nobreak >nul
start http://localhost:8080
echo Server running — close this window to stop.
pause >nul
