#!/bin/bash

glib-compile-schemas schemas/
zip -xdemo.gif -xREADME.md -xbuild.sh wintile.zip *
