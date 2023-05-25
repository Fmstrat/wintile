#!/bin/bash

rm wintile@nowsci.com.zip
glib-compile-schemas schemas/
zip -r9 wintile@nowsci.com.zip . -x '.git*' demo.gif README.md 'node_modules/*' build.sh .eslintrc.yml
