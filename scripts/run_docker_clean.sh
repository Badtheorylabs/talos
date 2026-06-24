#!/bin/bash

SCRIPT_DIR="$(dirname $0)"
cd "$SCRIPT_DIR/.."

docker rm athena-core
docker image rm athena-ai/athena-core:latest

scripts/run_docker.sh
