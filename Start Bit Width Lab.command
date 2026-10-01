#!/bin/bash
# Double-click on a Mac to open Bit Width Lab at http://127.0.0.1:7171
cd "$(dirname "$0")" || exit 1
exec python3 serve.py --open
