#!/bin/bash
cd "$(dirname "$0")"
python3 server.py
read -r -p '按回车关闭' radar_answer
