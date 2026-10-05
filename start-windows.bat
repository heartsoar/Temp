@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 投资观点研究台 4.0 - 保留此窗口以运行本地服务
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 server.py
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo 需要Python 3.9或更新版本。也可直接打开index.html使用免安装模式。
    pause
    exit /b 1
  )
  python server.py
)
pause
