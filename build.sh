#!/bin/bash

G45() {
    local FILE="${1}"
    IN_NON_G45=0
    IN_G45=0
    while IFS= read -r LINE; do
        if [[ "${LINE}" = *"/* END NON-G45 */"* ]]; then
            IN_NON_G45=0
        elif [[ "${LINE}" = *"/* END G45 */"* ]]; then
            IN_G45=0
        fi
        if [[ "${LINE}" != *"/* BEGIN "* ]] && [[ "${LINE}" != *"/* END "* ]]; then
            if (( IN_G45 == 1 )); then
                echo "${LINE}" | sed -E 's|^(\s+)?// |\1|'
            elif (( IN_NON_G45 == 0 )); then
                echo "${LINE}"
            fi
        fi
        if [[ "${LINE}" = *"/* BEGIN NON-G45 */"* ]]; then
            IN_NON_G45=1
        elif [[ "${LINE}" = *"/* BEGIN G45 */"* ]]; then
            IN_G45=1
        fi
    done < "${FILE}"
}

NON_G45() {
    local FILE="${1}"
    IN_NON_G45=0
    IN_G45=0
    while IFS= read -r LINE; do
        if [[ "${LINE}" = *"/* END NON-G45 */"* ]]; then
            IN_NON_G45=0
        elif [[ "${LINE}" = *"/* END G45 */"* ]]; then
            IN_G45=0
        fi
        if [[ "${LINE}" != *"/* BEGIN "* ]] && [[ "${LINE}" != *"/* END "* ]]; then
            if (( IN_NON_G45 == 1 )); then
                echo "${LINE}" | sed -E 's|^(\s+)?// |\1|'
            elif (( IN_G45 == 0 )); then
                echo "${LINE}"
            fi
        fi
        if [[ "${LINE}" = *"/* BEGIN NON-G45 */"* ]]; then
            IN_NON_G45=1
        elif [[ "${LINE}" = *"/* BEGIN G45 */"* ]]; then
            IN_G45=1
        fi
    done < "${FILE}"
}

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "${SCRIPT_DIR}"

rm -rf dist
mkdir -p dist/G43/build
mkdir -p dist/G45/build

glib-compile-schemas schemas/

FILES="extension.js keybindings.js prefs.js"
for FILE in ${FILES}; do
    NON_G45 ${FILE} > dist/G43/build/${FILE}
    G45 ${FILE} > dist/G45/build/${FILE}
done
cp -a settings.ui schemas dist/G43/build/
cp -a settings.ui schemas dist/G45/build/
cp -a metadata.json dist/G43/build/metadata.json
cp -a metadata-45.json dist/G45/build/metadata.json

cd dist/G43/build
zip -r9 wintile@nowsci.com.zip extension.js keybindings.js metadata.json prefs.js settings.ui schemas
mv wintile@nowsci.com.zip ..
cd ../../G45/build
zip -r9 wintile@nowsci.com.zip extension.js keybindings.js metadata.json prefs.js settings.ui schemas
mv wintile@nowsci.com.zip ..
