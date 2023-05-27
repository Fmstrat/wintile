#!/bin/bash

rm wintile@nowsci.com.zip
glib-compile-schemas schemas/
zip -r9 wintile@nowsci.com.zip . -x '.git*' build.sh demo.gif .eslintrc.yml 'node_modules/*' .package.json README.md 
