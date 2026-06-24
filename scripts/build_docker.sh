#!/bin/bash

set -e

SCRIPT_DIR="$(dirname $0)"
cd "$SCRIPT_DIR/.."

docker build -t athena-ai/athena-core:latest .
