#!/usr/bin/env bash

set -e

gnome-extensions uninstall wintile@nowsci.com
./bin/build.sh
gnome-extensions install dist/G45/wintile@nowsci.com.zip