"""Administração de acessos da empresa ativa.

A listagem é paginada como as demais: uma empresa grande tem centenas de
contas, e a tela mostra vinte por vez.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import ColumnElement, or_
from sqlalchemy.exc import IntegrityError

from app import auditoria
from app.autorizacao import requer
from app.consulta import ConsultaEscopada, consulta_escopada
from app.esquemas import UsuarioEntrada, UsuarioListado, UsuarioPatch
from app.models import Cargo, Setor, Unidade, Usuario
from app.paginacao import Pagina, Paginacao, paginacao
from app.rbac_gerado import Role
from app.seguranca import hash_senha

roteador = APIRouter(tags=["usuarios"])


def _senha_inicial(entrada: UsuarioEntrada) -> str:
    """Data de nascimento em ddmmaaaa — é o que a tela de login promete.

    Senha fraca por desenho, e por isso provisória: a troca no primeiro acesso
    ainda não existe e está anotada como pendência no README.
    """
    if entrada.nascimento is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe a data de nascimento: ela e a senha do primeiro acesso",
        )
    return entrada.nascimento.strftime("%d%m%Y")


def _validar_lotacao(consulta: ConsultaEscopada, entrada: UsuarioEntrada | UsuarioPatch) -> None:
    """Unidade, setor e cargo têm de ser da própria empresa."""
    pares = (
        (Unidade, entrada.unidade_id, "Unidade"),
        (Setor, entrada.setor_id, "Setor"),
        (Cargo, entrada.cargo_id, "Cargo"),
    )
    for modelo, valor, rotulo in pares:
        if valor and consulta.obter(modelo, valor) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"{rotulo} nao encontrado"
            )


@roteador.get("/usuarios", response_model=Pagina[UsuarioListado])
def listar_usuarios(
    requisicao: Request,
    papel: Role | None = Query(None, alias="role"),
    busca: str | None = Query(None, description="Trecho do nome ou início do CPF."),
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    p: Paginacao = Depends(paginacao),
    usuario: Usuario = requer("usuarios:gerenciar"),
) -> Pagina[UsuarioListado]:
    """Lista cadastral do tenant ativo — nunca de outro, nunca dado clínico."""
    base = consulta.selecionar(Usuario)
    if papel is not None:
        base = base.where(Usuario.role == papel)
    if busca and busca.strip():
        termo = busca.strip()
        digitos = "".join(c for c in termo if c.isdigit())
        alternativas: list[ColumnElement[bool]] = [Usuario.nome.ilike(f"%{termo}%")]
        if digitos:
            alternativas.append(Usuario.cpf.startswith(digitos))
        base = base.where(or_(*alternativas))

    total = consulta.contar(base)
    encontrados = consulta.sessao.scalars(
        base.order_by(Usuario.nome).limit(p.limit).offset(p.offset)
    ).all()
    auditoria.registrar(
        consulta.sessao,
        acao="usuarios:listar",
        recurso="usuario",
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        requisicao=requisicao,
    )
    consulta.sessao.commit()
    return Pagina.montar([UsuarioListado.model_validate(u) for u in encontrados], total, p)


@roteador.post("/usuarios", response_model=UsuarioListado, status_code=status.HTTP_201_CREATED)
def criar_usuario(
    entrada: UsuarioEntrada,
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("usuarios:gerenciar"),
) -> Usuario:
    _validar_lotacao(consulta, entrada)
    novo = Usuario(
        empresa_id=consulta.empresa_id,
        nome=entrada.nome,
        cpf=entrada.cpf,
        email=entrada.email,
        role=entrada.role,
        senha_hash=hash_senha(_senha_inicial(entrada)),
        ativo=True,
        unidade_id=entrada.unidade_id,
        setor_id=entrada.setor_id,
        cargo_id=entrada.cargo_id,
        nascimento=entrada.nascimento,
        admissao_em=entrada.admissao_em,
        tentativas_falhas=0,
    )
    consulta.sessao.add(novo)
    auditoria.registrar(
        consulta.sessao,
        acao="usuario:criar",
        recurso="usuario",
        recurso_id=novo.id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        detalhe=f"perfil {entrada.role}",
        requisicao=requisicao,
    )
    try:
        consulta.sessao.commit()
    except IntegrityError as erro:
        consulta.sessao.rollback()
        # o CPF e unico no sistema inteiro: ver o comentario em models.Usuario
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ja existe um usuario com este CPF."
        ) from erro
    return novo


@roteador.patch("/usuarios/{usuario_id}", response_model=UsuarioListado)
def atualizar_usuario(
    usuario_id: str,
    patch: UsuarioPatch,
    requisicao: Request,
    consulta: ConsultaEscopada = Depends(consulta_escopada),
    usuario: Usuario = requer("usuarios:gerenciar"),
) -> Usuario:
    alvo = consulta.obter(Usuario, usuario_id)
    if alvo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    _validar_lotacao(consulta, patch)

    campos = patch.model_dump(exclude_unset=True)
    for campo, valor in campos.items():
        setattr(alvo, campo, valor)

    auditoria.registrar(
        consulta.sessao,
        acao="usuario:alterar",
        recurso="usuario",
        recurso_id=alvo.id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=consulta.empresa_id,
        # mudanca de acesso e o que a trilha precisa mostrar depois
        detalhe=", ".join(sorted(campos)),
        requisicao=requisicao,
    )
    consulta.sessao.commit()
    return alvo
