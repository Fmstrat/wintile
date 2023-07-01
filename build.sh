#!/bin/bash

name=WinTile
url=https://github.com/fmstrat/wintile
uuid=wintile
branch=$(git branch | awk '{print $2}')

# all other branches get compiled as bleeding edge
if [[ $branch != "master"  ]]; then
    uuid+=-bleeding-edge
    name+=-bleeding-edge
    url+="/tree/develop"
fi

# change json data 
sed -i -E "s#(\t\"name\": \")WinTile.*?:#\1${name}:#" metadata.json
sed -i -E "s#(\t\"uuid\": \").*#\1${uuid}\@nowsci.com\",#" metadata.json
sed -i -E "s#(\t\"url\": \").*#\1${url}\",#" metadata.json
rm ${uuid}@nowsci.com.zip
glib-compile-schemas schemas/
zip -r9 ${uuid}@nowsci.com.zip extension.js keybindings.js metadata.json prefs.js schemas

# revert metadata.json back so it doesn't get changed forever
git checkout -- metadata.json
