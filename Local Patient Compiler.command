#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Starting Patient Compiler on this Mac."
echo "Open http://127.0.0.1:3210 in your browser."
echo "This uses your configured Supabase database. Press Control-C to stop."
exec npm run local
