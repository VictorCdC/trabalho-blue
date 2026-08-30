"""Gera os espelhos do contrato de permissões para o frontend e o backend.

    python rbac/gerar.py            # escreve os arquivos gerados
    python rbac/gerar.py --check    # falha se algum estiver desatualizado (CI)

Os arquivos gerados não devem ser editados à mão: edite permissoes.json.
"""

from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTE = RAIZ / "rbac" / "permissoes.json"
ALVO_TS = RAIZ / "frontend" / "src" / "lib" / "rbac-gerado.ts"
ALVO_PY = RAIZ / "backend" / "app" / "rbac_gerado.py"

AVISO = "Gerado por `python rbac/gerar.py` a partir de rbac/permissoes.json. Não edite."


def ler() -> tuple[list[str], list[str], dict[str, list[str]], str]:
    dados = json.loads(FONTE.read_text(encoding="utf-8"))
    permissoes = list(dados["permissoes"])
    papeis = dados["papeis"]
    for papel, concedidas in papeis.items():
        desconhecidas = set(concedidas) - set(permissoes)
        if desconhecidas:
            raise SystemExit(f"papel '{papel}' cita permissão inexistente: {sorted(desconhecidas)}")
    return permissoes, list(papeis), papeis, dados["_privacidade"]


def gerar_ts(permissoes: list[str], papeis: dict[str, list[str]], privacidade: str) -> str:
    linhas = [
        f"/* {AVISO} */",
        "",
        'import type { Role } from "./types";',
        "",
        "/*",
        *[f"   {linha}" for linha in textwrap.wrap(privacidade, 88)],
        "*/",
        "",
        "export type Permissao =",
    ]
    linhas += [f'  | "{p}"' for p in permissoes]
    linhas[-1] += ";"
    linhas += ["", "export const PERMISSOES: Record<Role, readonly Permissao[]> = {"]
    for papel, concedidas in papeis.items():
        linhas.append(f"  {papel}: [")
        linhas += [f'    "{p}",' for p in concedidas]
        linhas.append("  ],")
    linhas += ["};", ""]
    return "\n".join(linhas)


def gerar_py(permissoes: list[str], papeis: dict[str, list[str]], privacidade: str) -> str:
    linhas = [
        f'"""{AVISO}',
        "",
        *textwrap.wrap(privacidade, 88),
        '"""',
        "",
        "from __future__ import annotations",
        "",
        "from typing import Literal",
        "",
        "Permissao = Literal[",
    ]
    linhas += [f'    "{p}",' for p in permissoes]
    linhas += ["]", "", "Role = Literal["]
    linhas += [f'    "{r}",' for r in papeis]
    linhas += ["]", "", "PERMISSOES: dict[Role, frozenset[Permissao]] = {"]
    for papel, concedidas in papeis.items():
        linhas.append(f'    "{papel}": frozenset({{')
        linhas += [f'        "{p}",' for p in concedidas]
        linhas.append("    }),")
    linhas += [
        "}",
        "",
        "",
        "def pode(role: Role, permissao: Permissao) -> bool:",
        '    """Autorização é decidida aqui e em nenhum outro lugar."""',
        "    return permissao in PERMISSOES[role]",
        "",
    ]
    return "\n".join(linhas)


def main() -> int:
    permissoes, _papeis_nomes, papeis, privacidade = ler()
    saidas = {
        ALVO_TS: gerar_ts(permissoes, papeis, privacidade),
        ALVO_PY: gerar_py(permissoes, papeis, privacidade),
    }
    checando = "--check" in sys.argv
    desatualizados = []
    for caminho, conteudo in saidas.items():
        atual = caminho.read_text(encoding="utf-8") if caminho.exists() else None
        if atual == conteudo:
            continue
        if checando:
            desatualizados.append(caminho.relative_to(RAIZ).as_posix())
        else:
            caminho.parent.mkdir(parents=True, exist_ok=True)
            caminho.write_text(conteudo, encoding="utf-8", newline="\n")
            print(f"escrito: {caminho.relative_to(RAIZ).as_posix()}")
    if desatualizados:
        print("contrato RBAC desatualizado: " + ", ".join(desatualizados))
        print("rode `python rbac/gerar.py` e commite o resultado.")
        return 1
    if checando:
        print("contrato RBAC em dia.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
