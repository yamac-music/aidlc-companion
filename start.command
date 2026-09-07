#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  export PATH="${HOME}/.nodebrew/current/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"
fi
npm start
