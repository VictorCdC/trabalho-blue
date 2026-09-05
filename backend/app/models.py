"""Tabelas: tenant, identidade, estrutura organizacional, domínio clínico e
trilha de auditoria.

Toda tabela multi-tenant tem `empresa_id` e só deve ser lida pela
ConsultaEscopada (app/consulta.py) — inclusive as clínicas, que são
justamente as que não podem vazar entre empresas clientes.

Datas do domínio são `Date`, não `DateTime`: a unidade do negócio é o dia
(um check-in por pessoa por dia, uma queixa registrada no dia em que doeu).
Guardar hora traria fuso para dentro de toda agregação sem nada em troca.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
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


def novo_id() -> str:
    return str(uuid4())


class Empresa(Base):
    """Tenant. A tabela de empresas é da plataforma, não de nenhuma empresa."""

    __tablename__ = "empresa"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    nome: Mapped[str] = mapped_column(String(160))
    cnpj: Mapped[str] = mapped_column(String(14), unique=True)
    plano: Mapped[str] = mapped_column(String(20))
    ativa: Mapped[bool] = mapped_column(Boolean, default=True)
    colaboradores_contratados: Mapped[int] = mapped_column(Integer, default=0)
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# -------------------------- estrutura organizacional --------------------------
#
# Unidade > setor > cargo. Os três carregam `empresa_id` mesmo quando ele seria
# dedutível pelo pai: é o que permite escopar a leitura sem join, e o que faz a
# ConsultaEscopada aceitar o modelo.


class Unidade(Base):
    __tablename__ = "unidade"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    empresa_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT"), index=True
    )
    nome: Mapped[str] = mapped_column(String(120))
    cidade: Mapped[str] = mapped_column(String(120))
    uf: Mapped[str] = mapped_column(String(2))


class Setor(Base):
    __tablename__ = "setor"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    empresa_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT"), index=True
    )
    unidade_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("unidade.id", ondelete="RESTRICT"), index=True
    )
    nome: Mapped[str] = mapped_column(String(120))


class Cargo(Base):
    __tablename__ = "cargo"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    empresa_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT"), index=True
    )
    setor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("setor.id", ondelete="RESTRICT"), index=True
    )
    nome: Mapped[str] = mapped_column(String(120))


class Usuario(Base):
    """Pessoa que faz login.

    `usuario` (NOME.SOBRENOME) é único no sistema inteiro, e não por empresa,
    porque o login é só usuário + senha: sem isso a mesma credencial
    resolveria para dois tenants. Se um dia a mesma pessoa precisar de conta
    em duas empresas, isto vira (empresa_id, usuario) único e o login ganha um
    seletor de empresa.

    `cpf` continua único, mas deixou de ser credencial: é o cadastro da
    pessoa, e duas contas com o mesmo CPF seriam a mesma pessoa duplicada.
    """

    __tablename__ = "usuario"
    __table_args__ = (
        # o recorte do painel filtra por setor dentro do tenant o tempo todo
        Index("ix_usuario_empresa_setor", "empresa_id", "setor_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    #: nulo = equipe da plataforma (superuser), que não pertence a tenant algum
    empresa_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT"), index=True
    )
    nome: Mapped[str] = mapped_column(String(160))
    #: credencial de login, derivada do nome por `seguranca.nome_de_usuario`
    usuario: Mapped[str] = mapped_column(String(160), unique=True)
    cpf: Mapped[str] = mapped_column(String(11), unique=True)
    email: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(String(20))
    senha_hash: Mapped[str] = mapped_column(String(255))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    #: lotação — nula para quem não ocupa posto (equipe da plataforma)
    unidade_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("unidade.id", ondelete="RESTRICT")
    )
    setor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("setor.id", ondelete="RESTRICT")
    )
    cargo_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cargo.id", ondelete="RESTRICT")
    )
    nascimento: Mapped[date | None] = mapped_column(Date)
    admissao_em: Mapped[date | None] = mapped_column(Date)

    # controle de força bruta no login (o nome de usuário é previsível, não é segredo)
    tentativas_falhas: Mapped[int] = mapped_column(Integer, default=0)
    bloqueado_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ------------------------------ domínio clínico -------------------------------
#
# Dado pessoal sensível (LGPD, art. 11). Nada aqui sai identificado sem a
# permissão dados:identificados, e toda leitura identificada é auditada.


class Queixa(Base):
    """Um relato de desconforto, do jeito que o colaborador descreveu."""

    __tablename__ = "queixa"
    __table_args__ = (
        # o painel filtra sempre por empresa + janela de dias
        Index("ix_queixa_empresa_data", "empresa_id", "data"),
        # histórico próprio e regra de recorrência individual
        Index("ix_queixa_colaborador_data", "colaborador_id", "data"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    empresa_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT")
    )
    colaborador_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("usuario.id", ondelete="RESTRICT")
    )
    data: Mapped[date] = mapped_column(Date)
    regiao: Mapped[RegiaoId] = mapped_column(String(20))
    lado: Mapped[Lado] = mapped_column(String(10))
    intensidade: Mapped[int] = mapped_column(SmallInteger)
    tipo: Mapped[TipoDor] = mapped_column(String(20))
    inicio: Mapped[InicioDor] = mapped_column(String(20))
    agrava: Mapped[Agravante] = mapped_column(String(30))
    relacao_trabalho: Mapped[RelacaoTrabalho] = mapped_column(String(10))
    observacao: Mapped[str] = mapped_column(Text, default="")


class CheckIn(Base):
    """Presença diária: está bem, ou sente desconforto.

    Um por pessoa por dia — e a unicidade é do banco, porque a adesão e a taxa
    de desconforto são calculadas em cima da contagem de dias registrados.
    """

    __tablename__ = "checkin"
    __table_args__ = (
        UniqueConstraint("colaborador_id", "data", name="uq_checkin_colaborador_dia"),
        Index("ix_checkin_empresa_data", "empresa_id", "data"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    empresa_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT")
    )
    colaborador_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("usuario.id", ondelete="RESTRICT")
    )
    data: Mapped[date] = mapped_column(Date)
    estado: Mapped[EstadoCheckIn] = mapped_column(String(12))


class Caso(Base):
    """Acompanhamento aberto pelo SESMT a partir de um alerta.

    `alerta_id` não é chave estrangeira: alerta não é tabela, é o resultado da
    regra de recorrência aplicada às queixas (app/alertas.py). O id é derivado
    e estável, e é ele que liga o caso ao alerta que o originou.
    """

    __tablename__ = "caso"
    __table_args__ = (
        UniqueConstraint("empresa_id", "numero", name="uq_caso_numero_por_empresa"),
        # um caso por alerta: abrir o mesmo alerta duas vezes é erro de operação
        UniqueConstraint("empresa_id", "alerta_id", name="uq_caso_alerta_por_empresa"),
        Index("ix_caso_empresa_status", "empresa_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    empresa_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT")
    )
    #: sequencial por empresa — o número pelo qual o SESMT se refere ao caso
    numero: Mapped[int] = mapped_column(Integer)
    alerta_id: Mapped[str] = mapped_column(String(120))
    origem: Mapped[OrigemCaso] = mapped_column(String(12))
    regiao: Mapped[RegiaoId] = mapped_column(String(20))
    lado: Mapped[Lado] = mapped_column(String(10))
    #: preenchido no caso individual, nulo no coletivo
    colaborador_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("usuario.id", ondelete="RESTRICT")
    )
    #: preenchido no caso coletivo, nulo no individual
    setor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("setor.id", ondelete="RESTRICT")
    )
    status: Mapped[StatusCaso] = mapped_column(String(20))
    severidade: Mapped[Severidade] = mapped_column(String(10))
    responsavel_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("usuario.id", ondelete="RESTRICT")
    )
    aberto_em: Mapped[date] = mapped_column(Date)
    atualizado_em: Mapped[date] = mapped_column(Date)

    #: carregadas junto: um caso sem as ações tomadas não conta a história, e
    #: são poucas por caso — a listagem, essa sim, devolve só a contagem
    acoes: Mapped[list[AcaoCaso]] = relationship(
        back_populates="caso",
        cascade="all, delete-orphan",
        order_by="AcaoCaso.data",
        lazy="selectin",
    )


class AcaoCaso(Base):
    """Intervenção registrada dentro de um caso."""

    __tablename__ = "acao_caso"
    __table_args__ = (Index("ix_acao_caso_caso_data", "caso_id", "data"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    empresa_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("empresa.id", ondelete="RESTRICT")
    )
    caso_id: Mapped[str] = mapped_column(String(36), ForeignKey("caso.id", ondelete="CASCADE"))
    data: Mapped[date] = mapped_column(Date)
    tipo: Mapped[TipoAcao] = mapped_column(String(30))
    descricao: Mapped[str] = mapped_column(Text)
    autor_id: Mapped[str] = mapped_column(String(36), ForeignKey("usuario.id", ondelete="RESTRICT"))
    concluida: Mapped[bool] = mapped_column(Boolean, default=False)

    caso: Mapped[Caso] = relationship(back_populates="acoes")


class LogAuditoria(Base):
    """Quem fez o quê, quando. Somente inserção.

    A migration instala um trigger que recusa UPDATE e DELETE nesta tabela:
    trilha que a aplicação pode reescrever não é trilha.

    Toda leitura de dado clínico identificado precisa passar por aqui — é o
    que a LGPD chama de accountability (art. 6º, X).
    """

    __tablename__ = "log_auditoria"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=novo_id)
    ocorrido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    #: nulo quando nem houve autenticação (tentativa de login com usuário inexistente)
    ator_id: Mapped[str | None] = mapped_column(String(36), index=True)
    ator_role: Mapped[str | None] = mapped_column(String(20))
    #: tenant cujo dado foi tocado
    empresa_id: Mapped[str | None] = mapped_column(String(36), index=True)
    acao: Mapped[str] = mapped_column(String(60), index=True)
    recurso: Mapped[str] = mapped_column(String(60))
    recurso_id: Mapped[str | None] = mapped_column(String(36))
    #: por que o dado foi acessado — exigido para leitura de dado identificado
    finalidade: Mapped[str | None] = mapped_column(String(120))
    detalhe: Mapped[str | None] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
