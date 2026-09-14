#!/bin/sh
# Copy the built assets into artifact/ and print the files map for the Artifact tool (fonts included).
set -e
R="$(cd "$(dirname "$0")/.." && pwd)"; B=/scratch/ssd/doona-build/dist
rm -rf "$R/artifact/assets"; mkdir -p "$R/artifact/assets"; cp "$B"/assets/* "$R/artifact/assets/"
mk() { # $1 = dist html, $2 = artifact html, $3 = title
  { echo "<title>$3</title>"
    grep -oE '<link rel="stylesheet"[^>]*>|<link rel="modulepreload"[^>]*>|<script type="module"[^>]*></script>' "$B/$1" | sed 's|\./assets/|assets/|g'
    echo '<div id="root" lang="zh-Hant"></div>'; } > "$R/artifact/$2"; }
mk design.html doona.html doona
mk index.html panel.html "doona 面板"
cd "$R"; python3 - <<'PY'
import json, os
m = {'assets/' + f: 'artifact/assets/' + f for f in os.listdir('artifact/assets')}
m.update({'fonts/' + f: 'public/fonts/' + f for f in os.listdir('public/fonts')})
json.dump(m, open('artifact/files.json', 'w'))
print(len(m), 'entries ->', 'artifact/files.json')
PY
