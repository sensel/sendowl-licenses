#!/usr/bin/env bash
DOCKER_PATH=`dirname "$0"`
DOCKER_PATH=`( cd "$DOCKER_PATH" && pwd )`
docker-compose -p sensel_software_licenses -f "$DOCKER_PATH"/docker-compose.yml exec node bash
# docker-compose -p sensel_software_licenses -f "$DOCKER_PATH"/docker-compose.yml run --rm node npm start