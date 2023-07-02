#!/bin/bash

rm wintile@nowsci.com.zip
glib-compile-schemas schemas/
zip -r9 wintile@nowsci.com.zip extension.js keybindings.js metadata.json prefs.js schemas
