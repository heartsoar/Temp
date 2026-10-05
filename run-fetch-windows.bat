@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 tools\fetch_feeds.py --all --prices --brief >fetch-log.txt 2>&1
) else (
  python tools\fetch_feeds.py --all --prices --brief >fetch-log.txt 2>&1
)
echo 采集完成，请查看fetch-log.txt与网页来源状态。
