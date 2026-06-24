#!/bin/bash

set -e

SCRIPT_DIR="$(dirname $0)"
cd "$SCRIPT_DIR/.."

if [ "$(docker images -q athena-ai/athena-core:latest 2> /dev/null)" == "" ]; then
    scripts/build_docker.sh
fi

if [ "$(docker ps -a -q -f name=athena-core)" ]; then
    docker start -ai athena-core
    exit 0
fi

if [ -z "${TZ}" ]; then
    TZ="America/Los_Angeles"
fi

docker run --name athena-core -v "$(pwd)/configs:/app/configs" -e TZ="${TZ}" -it athena-ai/athena-core:latest
