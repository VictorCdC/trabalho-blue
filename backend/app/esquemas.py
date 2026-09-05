"""Contratos de entrada e saída da API.

Cada esquema devolve o mínimo que a tela precisa. O CPF, por exemplo, sai em
/auth/eu (o próprio dado do usuário) e não na listagem de colegas.

Duas convenções valem para o arquivo inteiro:

  - **Nada de letra colada em número.** `queixas30d` viraria `queixas30D` no
    camelCase (o gerador maiusculiza o que vem depois de um dígito), e o
    contrato do frontend deixaria de bater. Por isso `queixas_30_dias`, que
    sai como `queixas30Dias`.
  - **JSON em camelCase.** `frontend/src/lib/types.ts` diz de si mesmo que é o
    contrato, e é camelCase. Em vez de traduzir campo a campo no cliente, o
    alias_generator faz a conversão de uma vez — os nomes continuam em
    português dos dois lados, que é o que o CLAUDE.md exige.
  - **Data de domínio sai como `YYYY-MM-DDT00:00:00`.** Sem a parte da hora,
    `new Date("2026-08-30")` no navegador seria meia-noite UTC, que em Brasília
    é o dia 29 — e o histórico do colaborador apareceria deslocado em um dia.
    Com a hora e sem sufixo de fuso, o JavaScript interpreta como meia-noite
    local, que é o que a data significa aqui.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, PlainSerializer, field_validator
from pydantic.alias_generators import to_camel

from app.dominio import (
    Agravante,
    EstadoCheckIn,
    InicioDor,
    Lado,
    OrigemCaso,
    RegiaoId,
    RelacaoTrabalho,
    Severidade,
    StatusCaso,
    TipoAcao,
    TipoDor,
)
from app.rbac_gerado import Role

SO_DIGITOS = re.compile(r"\D")

DataISO = Annotated[
    date, PlainSerializer(lambda d: f"{d.isoformat()}T00:00:00", return_type=str, when_used="json")
]


class Esquema(BaseModel):
    """Base de todo contrato: camelCase na saída, snake_case no Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


def mascarar_cpf(digitos: str) -> str:
    """`***.***.123-45` — o suficiente para a pessoa se reconhecer na lista.

    A tela de colaboradores mostra o CPF ocultado. Ocultar aqui, e não no
    navegador, é o que impede o CPF inteiro de trafegar para desenhar isso.
    """
    return f"***.***.{digitos[6:9]}-{digitos[9:]}"


# --------------------------------- entrada -----------------------------------


class LoginEntrada(Esquema):
    cpf: str
    senha: str

    @field_validator("cpf")
    @classmethod
    def _normalizar_cpf(cls, valor: str) -> str:
        digitos = SO_DIGITOS.sub("", valor)
        if len(digitos) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return digitos


class CheckInEntrada(Esquema):
    estado: EstadoCheckIn


class QueixaEntrada(Esquema):
    """O colaborador registra sempre por si — o autor vem da sessão, não do corpo."""

    regiao: RegiaoId
    lado: Lado
    intensidade: int
    tipo: TipoDor
    inicio: InicioDor
    agrava: Agravante
    relacao_trabalho: RelacaoTrabalho
    observacao: str = ""

    @field_validator("intensidade")
    @classmethod
    def _escala_de_um_a_cinco(cls, valor: int) -> int:
        if not 1 <= valor <= 5:
            raise ValueError("intensidade vai de 1 a 5")
        return valor


class CasoEntrada(Esquema):
    """Abre um caso a partir de um alerta. O alerta é derivado, então vem o id."""

    alerta_id: str


class CasoStatusEntrada(Esquema):
    status: StatusCaso


class AcaoEntrada(Esquema):
    tipo: TipoAcao
    descricao: str
    concluida: bool = False


class AcaoConclusaoEntrada(Esquema):
    concluida: bool


class UsuarioEntrada(Esquema):
    nome: str
    cpf: str
    email: str | None = None
    role: Role
    unidade_id: str | None = None
    setor_id: str | None = None
    cargo_id: str | None = None
    nascimento: date | None = None
    admissao_em: date | None = None

    @field_validator("cpf")
    @classmethod
    def _normalizar_cpf(cls, valor: str) -> str:
        digitos = SO_DIGITOS.sub("", valor)
        if len(digitos) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return digitos


class UsuarioPatch(Esquema):
    nome: str | None = None
    email: str | None = None
    role: Role | None = None
    unidade_id: str | None = None
    setor_id: str | None = None
    cargo_id: str | None = None
    ativo: bool | None = None


class UnidadeEntrada(Esquema):
    nome: str
    cidade: str
    uf: str


class SetorEntrada(Esquema):
    unidade_id: str
    nome: str


class CargoEntrada(Esquema):
    setor_id: str
    nome: str


class EmpresaEntrada(Esquema):
    nome: str
    cnpj: str
    plano: str
    colaboradores_contratados: int = 0

    @field_validator("cnpj")
    @classmethod
    def _normalizar_cnpj(cls, valor: str) -> str:
        digitos = SO_DIGITOS.sub("", valor)
        if len(digitos) != 14:
            raise ValueError("CNPJ deve ter 14 dígitos")
        return digitos


class EmpresaPatch(Esquema):
    nome: str | None = None
    plano: str | None = None
    ativa: bool | None = None
    colaboradores_contratados: int | None = None


# ------------------------------ identidade ------------------------------------


class UsuarioEu(Esquema):
    """Dados do próprio usuário autenticado."""

    id: str
    empresa_id: str | None
    nome: str
    cpf: str
    email: str | None
    role: Role
    unidade_id: str | None = None
    setor_id: str | None = None
    cargo_id: str | None = None
    admissao_em: DataISO | None = None
    #: nomes já resolvidos — é o próprio cadastro de quem pergunta, e evita que
    #: o colaborador precise da estrutura inteira da empresa para ver o dele
    empresa_nome: str | None = None
    unidade_nome: str | None = None
    setor_nome: str | None = None
    cargo_nome: str | None = None


class UsuarioListado(Esquema):
    """Linha da administração de acessos. Sem CPF: a tela não precisa dele."""

    id: str
    nome: str
    email: str | None
    role: Role
    ativo: bool
    unidade_id: str | None = None
    setor_id: str | None = None
    cargo_id: str | None = None


class EmpresaPublica(Esquema):
    id: str
    nome: str
    cnpj: str
    plano: str
    ativa: bool
    colaboradores_contratados: int
    criada_em: datetime | None = None


class ResumoEmpresa(Esquema):
    """Cartão da tela da plataforma: a empresa e o tamanho da operação dela."""

    empresa: EmpresaPublica
    colaboradores: int
    queixas_30_dias: int
    casos_abertos: int


# --------------------------- estrutura organizacional -------------------------


class UnidadePublica(Esquema):
    id: str
    empresa_id: str
    nome: str
    cidade: str
    uf: str
    #: efetivo lotado. É cadastral (organograma), não clínico: nada aqui diz
    #: quem relatou o quê, e é o que a tela de estrutura mostra.
    colaboradores: int = 0


class SetorPublico(Esquema):
    id: str
    unidade_id: str
    nome: str
    colaboradores: int = 0


class CargoPublico(Esquema):
    id: str
    setor_id: str
    nome: str


class Estrutura(Esquema):
    """O contexto do tenant ativo numa chamada só.

    São poucas dezenas de linhas, e toda tela do painel precisa das três
    listas juntas para montar os filtros e trocar id por nome. A empresa vem
    junto porque o cabeçalho mostra a dela — e para o superuser é a empresa
    que ele escolheu olhar, não a dele.
    """

    empresa: EmpresaPublica
    #: efetivo ativo, para o cabeçalho dizer o tamanho da operação
    colaboradores: int
    unidades: list[UnidadePublica]
    setores: list[SetorPublico]
    cargos: list[CargoPublico]


# ------------------------------ domínio clínico -------------------------------


class QueixaPublica(Esquema):
    id: str
    colaborador_id: str
    data: DataISO
    regiao: RegiaoId
    lado: Lado
    intensidade: int
    tipo: TipoDor
    inicio: InicioDor
    agrava: Agravante
    relacao_trabalho: RelacaoTrabalho
    observacao: str


class CheckInPublico(Esquema):
    id: str
    colaborador_id: str
    data: DataISO
    estado: EstadoCheckIn


class AlertaIndividual(Esquema):
    kind: Literal["individual"] = "individual"
    id: str
    #: nulo para quem não tem `dados:identificados` — o alerta existe, a pessoa não sai
    colaborador_id: str | None
    colaborador_nome: str | None
    setor_id: str | None
    regiao: RegiaoId
    lado: Lado
    ocorrencias: int
    intensidade_media: float
    janela_dias: int
    ultima_em: DataISO
    severidade: Severidade
    #: caso já aberto para este alerta, quando existe
    caso_id: str | None = None


class AlertaColetivo(Esquema):
    kind: Literal["coletivo"] = "coletivo"
    id: str
    unidade_id: str
    setor_id: str
    regiao: RegiaoId
    afetados: int
    total_setor: int
    percentual: float
    janela_dias: int
    ultima_em: DataISO
    severidade: Severidade
    caso_id: str | None = None


Alerta = AlertaIndividual | AlertaColetivo


class RegrasAlerta(Esquema):
    """Os limiares que disparam alerta.

    A tela explica a regra ao usuário ("3+ registros da mesma região..."). O
    servidor é quem a aplica, então é ele quem diz quais são os números — sem
    isto o texto da interface seria uma segunda cópia, livre para divergir.
    """

    janela_dias: int
    individual_min_ocorrencias: int
    coletivo_min_percentual: float
    coletivo_min_pessoas: int


class AcaoPublica(Esquema):
    id: str
    data: DataISO
    tipo: TipoAcao
    descricao: str
    autor_id: str
    concluida: bool


class CasoPublico(Esquema):
    id: str
    numero: int
    alerta_id: str
    origem: OrigemCaso
    regiao: RegiaoId
    lado: Lado
    colaborador_id: str | None
    #: nome já resolvido pelo servidor; nulo sem `dados:identificados`
    colaborador_nome: str | None = None
    setor_id: str | None
    status: StatusCaso
    severidade: Severidade
    responsavel_id: str
    responsavel_nome: str | None = None
    aberto_em: DataISO
    atualizado_em: DataISO
    acoes: list[AcaoPublica] = []
    #: contagem pronta para a listagem, que não carrega as ações
    acoes_totais: int = 0
    acoes_concluidas: int = 0


class ContagemCasos(Esquema):
    """Contagem por status — o rodapé das abas, sem baixar os casos todos."""

    todos: int
    aberto: int
    em_andamento: int
    resolvido: int


# --------------------------------- agregados ----------------------------------


class Kpis(Esquema):
    colaboradores_ativos: int
    checkins: int
    adesao: float
    queixas: int
    pessoas_com_queixa: int
    percentual_afetado: float
    intensidade_media: float
    relacao_trabalho_sim: float
    #: variação percentual contra o período anterior de igual duração
    variacao_queixas: float
    taxa_desconforto: float
    pessoas_recorrentes: int
    percentual_recorrente: float


class PontoSerie(Esquema):
    data: DataISO
    queixas: int
    checkins: int
    bem: int
    intensidade_media: float


class ContagemRegiao(Esquema):
    regiao: RegiaoId
    total: int
    pessoas: int
    intensidade_media: float


class ContagemRegiaoLado(ContagemRegiao):
    lado: Lado


class FatiaIntensidade(Esquema):
    intensidade: int
    total: int


class ContagemRotulada(Esquema):
    """Contagem de um valor de vocabulário fechado (tipo de dor, agravante...)."""

    chave: str
    total: int


class ResumoSetor(Esquema):
    setor_id: str
    #: quando true, todo o resto vem nulo: o grupo é pequeno demais para divulgar
    suprimido: bool = False
    total_colaboradores: int | None = None
    pessoas_com_queixa: int | None = None
    queixas: int | None = None
    intensidade_media: float | None = None
    adesao: float | None = None
    regiao_top: RegiaoId | None = None
    percentual_afetado: float | None = None
    taxa_desconforto: float | None = None
    pessoas_recorrentes: int | None = None
    percentual_recorrente: float | None = None
    alertas: int = 0


class ResumoCargo(Esquema):
    cargo_id: str
    setor_id: str | None
    suprimido: bool = False
    efetivo: int | None = None
    pessoas: int | None = None
    total: int | None = None
    intensidade_media: float | None = None
    percentual: float | None = None


class ContagemAlertas(Esquema):
    todos: int
    individuais: int
    coletivos: int
    alta: int


class PainelResumo(Esquema):
    """Tudo que o painel desenha, num JSON só.

    A tela fazia seis agregações em `useMemo` sobre o histórico inteiro da
    empresa. Aqui elas já vêm somadas, e o navegador só as desenha.
    """

    #: recorte com menos de K_MINIMO_AGREGACAO pessoas: nada é divulgado
    suprimido: bool
    dias: int
    #: nulo quando suprimido: o tamanho do grupo tambem estreita
    colaboradores: int | None
    kpis: Kpis | None = None
    serie: list[PontoSerie] = []
    #: a série vem semanal em janelas longas, onde o gráfico diário fica ilegível
    por_semana: bool = False
    regioes: list[ContagemRegiao] = []
    calor: list[ContagemRegiaoLado] = []
    intensidades: list[FatiaIntensidade] = []
    tipos: list[ContagemRotulada] = []
    agravantes: list[ContagemRotulada] = []
    relacoes: list[ContagemRotulada] = []
    alertas: ContagemAlertas | None = None


class ResumoColaborador(Esquema):
    """A ficha que o SESMT abre. Leitura auditada, sempre."""

    colaborador: ColaboradorLinha
    queixas_30_dias: int
    queixas_janela: int
    checkins_30_dias: int
    checkins_bem_30_dias: int
    intensidade_media_30_dias: float
    sequencia_checkin: int
    janela_dias: int
    regioes: list[ContagemRegiao]
    calor: list[ContagemRegiaoLado]
    serie: list[PontoSerie]
    alertas: list[AlertaIndividual]
    casos: list[CasoPublico]


class ColaboradorLinha(Esquema):
    """Linha da lista de colaboradores.

    O bloco cadastral sai para quem tem `colaboradores:ver_lista`. O bloco
    clínico (as quatro últimas) só é preenchido com `dados:identificados` —
    para os demais perfis vem nulo, e não zero: zero seria uma afirmação.
    """

    id: str
    nome: str
    cpf_mascarado: str
    unidade_id: str | None
    setor_id: str | None
    cargo_id: str | None
    admissao_em: DataISO | None
    ativo: bool

    queixas: int | None = None
    intensidade_media: float | None = None
    regiao_top: RegiaoId | None = None
    ultima_queixa_em: DataISO | None = None
    alertas: int | None = None


class MeuResumo(Esquema):
    """A tela inicial do colaborador, pronta.

    Ela mostrava contagens calculadas em cima do snapshot da empresa inteira —
    inclusive das queixas dos colegas, que nunca deveriam ter chegado ali.
    """

    checkin_hoje: CheckInPublico | None
    sequencia: int
    checkins_30_dias: int
    queixas_30_dias: int
    regioes_60_dias: list[ContagemRegiao]
    calor_60_dias: list[ContagemRegiaoLado]
    caso_ativo: CasoPublico | None


ResumoColaborador.model_rebuild()
