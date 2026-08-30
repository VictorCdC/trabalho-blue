"""O espelho do contrato tem de estar em dia com /rbac/permissoes.json."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def test_rbac_gerado_esta_em_dia() -> None:
    resultado = subprocess.run(  # noqa: S603
        [sys.executable, str(RAIZ / "rbac" / "gerar.py"), "--check"],
        capture_output=True,
        text=True,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
