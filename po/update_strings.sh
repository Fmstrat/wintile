#!/bin/sh
SCRIPTDIR=`dirname $0`
xgettext  --from-code=UTF-8 -k_ -kN_  -o wintile.pot "$SCRIPTDIR"/../*.js "$SCRIPTDIR"/../schemas/*.xml

for fn in *.po; do
	msgmerge -U "$fn" wintile.pot
done
