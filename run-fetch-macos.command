#!/bin/bash
cd "$(dirname "$0")"
python3 tools/fetch_feeds.py --all --prices --brief >fetch-log.txt 2>&1
echo '采集完成，请查看fetch-log.txt与网页来源状态。'
