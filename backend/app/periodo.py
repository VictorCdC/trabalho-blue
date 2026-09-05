"""Janela de dias — o filtro de data, agora resolvido no servidor.

Antes cada tela do painel baixava o histórico inteiro e cortava por data no
navegador. Aqui a janela vira parâmetro de consulta (`?dias=`) e o corte
acontece no `WHERE`, que é onde existe índice.

`dias=0` significa "tudo", o mesmo que a aba "Tudo" do histórico do
colaborador — sem limite inferior, mas ainda paginado.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from fastapi import Query

#: O Brasil não tem mais horário de verão desde o Decreto 9.772/2019, então um
#: deslocamento fixo descreve o país inteiro exceto o fuso do Acre. Se o
#: horário de verão voltar, isto tem de virar ZoneInfo — e o backend passa a
#: depender do pacote tzdata, que não vem com o Python no Windows.
FUSO_LOCAL = timezone(timedelta(hours=-3))

#: Proporção de dias úteis num período corrido, usada no cálculo de adesão:
#: cobrar check-in de sábado e domingo afundaria o indicador sem significar
#: nada.
DIAS_UTEIS_POR_SEMANA = 5


def hoje() -> date:
    """O dia corrente no fuso da operação, não no fuso do servidor.

    Um servidor em UTC vira o dia às 21h de Brasília: sem isto, o check-in do
    fim do turno cairia no dia seguinte.
    """
    return datetime.now(FUSO_LOCAL).date()


def dias_uteis(dias: int) -> int:
    """Quantos dias úteis cabem numa janela corrida (mínimo 1, para não dividir por zero)."""
    return max(1, int(dias * DIAS_UTEIS_POR_SEMANA / 7 + 0.5))


@dataclass(frozen=True)
class Janela:
    """Intervalo fechado [inicio, fim]. `inicio` nulo em "tudo"."""

    inicio: date | None
    fim: date
    dias: int

    @property
    def tudo(self) -> bool:
        return self.inicio is None

    def anterior(self) -> Janela:
        """Janela de igual tamanho imediatamente antes — base da variação percentual."""
        if self.inicio is None:
            raise ValueError("janela 'tudo' nao tem periodo anterior para comparar")
        return Janela(
            inicio=self.inicio - timedelta(days=self.dias),
            fim=self.inicio - timedelta(days=1),
            dias=self.dias,
        )


def montar_janela(dias: int, fim: date | None = None) -> Janela:
    base = fim or hoje()
    if dias <= 0:
        return Janela(inicio=None, fim=base, dias=0)
    # janela de N dias inclui hoje: 30 dias vai de hoje-29 até hoje
    return Janela(inicio=base - timedelta(days=dias - 1), fim=base, dias=dias)


def janela(
    dias: int = Query(
        30,
        ge=0,
        le=365,
        description="Tamanho da janela em dias corridos, contando hoje. 0 = sem limite.",
    ),
) -> Janela:
    """Dependency do FastAPI: `janela: Janela = Depends(janela)`."""
    return montar_janela(dias)
