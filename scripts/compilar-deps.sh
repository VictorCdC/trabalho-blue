#!/usr/bin/env bash
# Recompila os locks do backend a partir dos .in.
# Roda em container Linux para o lock bater com a imagem de deploy.
#
# requirements.txt sai com hashes: é o que vai para a imagem, e é Linux.
# requirements-dev.txt sai sem hashes de propósito — pip-tools não gera lock
# multiplataforma, e com hashes o pytest não instala no Windows (falta o
# colorama, que só é dependência em win32). Sem hashes o pip resolve o que
# falta para a plataforma de quem está instalando.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
raiz="$(pwd -W 2>/dev/null || pwd)"   # pwd -W: caminho nativo no Git Bash

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${raiz}/backend:/w" -w /w python:3.12-slim bash -c '
    set -e
    pip install --quiet --root-user-action=ignore pip-tools
    pip-compile --quiet --generate-hashes --strip-extras --output-file=requirements.txt requirements.in
    pip-compile --quiet --strip-extras --output-file=requirements-dev.txt requirements-dev.in
  '
echo "locks atualizados: backend/requirements.txt, backend/requirements-dev.txt"
