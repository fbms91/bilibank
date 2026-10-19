#!/usr/bin/env bash
# Publica o app no GitHub Pages: monta public/ e envia para a branch gh-pages.
# O endereço é https://fbms91.github.io/bilibank/ e o iPhone pega a versão nova na próxima abertura.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
cd "$raiz"
node scripts/montar.mjs
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -r public/. "$tmp/"
touch "$tmp/.nojekyll"
msg="Publica $(git rev-parse --short HEAD)"
git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -q -m "$msg"
git -C "$tmp" push -q -f "$(git remote get-url origin)" gh-pages
echo "publicado: $msg"
