#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
  echo "node_modules not found — run setup.sh first"
  exit 1
fi
node server.js
