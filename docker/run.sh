#!/usr/bin/env bash
export SRC_DIR="$PWD"/../
export DEST_DIR='/usr/src/app'
docker run --rm -it -v "$SRC_DIR":"$DEST_DIR" -w "$DEST_DIR" sensel-software-licenses '/bin/bash'