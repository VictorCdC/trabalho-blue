"""Login, sessão e logout.

A credencial é o nome de usuário (NOME.SOBRENOME) mais a senha. O CPF ficou
sendo só cadastro.

Cuidados que valem repetir: a resposta de erro é sempre a mesma frase (não
revela se o usuário existe), a verificação de senha roda mesmo para usuário
inexistente (não vaza pelo tempo de resposta) e o bloqueio é por conta, com
prazo, porque nome de usuário derivado do nome é adivinhável.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import auditoria
from app.autorizacao import usuario_atual
from app.config import obter_config
from app.db import obter_sessao
from app.esquemas import LoginEntrada, UsuarioEu
from app.models import Cargo, Empresa, Setor, Unidade, Usuario
from app.seguranca import HASH_DESCARTAVEL, definir_cookie, limpar_cookie, senha_confere

roteador = APIRouter(prefix="/auth", tags=["auth"])

CREDENCIAL_INVALIDA = "Usuario ou senha invalidos"


@roteador.post("/login", response_model=UsuarioEu)
def login(
    entrada: LoginEntrada,
    requisicao: Request,
    resposta: Response,
    sessao: Session = Depends(obter_sessao),
) -> UsuarioEu:
    config = obter_config()
    agora = datetime.now(UTC)
    usuario = sessao.scalars(
        select(Usuario).where(Usuario.usuario == entrada.usuario)
    ).one_or_none()

    if usuario is not None and usuario.bloqueado_ate is not None and usuario.bloqueado_ate > agora:
        auditoria.registrar(
            sessao,
            acao="login:bloqueado",
            recurso="usuario",
            recurso_id=usuario.id,
            ator_id=usuario.id,
            ator_role=usuario.role,
            empresa_id=usuario.empresa_id,
            requisicao=requisicao,
        )
        sessao.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas. Tente de novo mais tarde.",
        )

    # roda o verify mesmo sem usuário para não diferenciar pelo tempo de resposta
    hash_alvo = usuario.senha_hash if usuario is not None else HASH_DESCARTAVEL
    confere = senha_confere(hash_alvo, entrada.senha)

    conta_inativa = usuario is not None and confere and not usuario.ativo

    if usuario is None or not confere or not usuario.ativo:
        if usuario is not None and not conta_inativa:
            usuario.tentativas_falhas += 1
            if usuario.tentativas_falhas >= config.login_max_tentativas:
                usuario.bloqueado_ate = agora + timedelta(minutes=config.login_bloqueio_minutos)
                usuario.tentativas_falhas = 0
        auditoria.registrar(
            sessao,
            acao="login:falha",
            recurso="usuario",
            recurso_id=usuario.id if usuario else None,
            ator_id=usuario.id if usuario else None,
            ator_role=usuario.role if usuario else None,
            empresa_id=usuario.empresa_id if usuario else None,
            detalhe="conta inativa" if conta_inativa else None,
            requisicao=requisicao,
        )
        sessao.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=CREDENCIAL_INVALIDA)

    usuario.tentativas_falhas = 0
    usuario.bloqueado_ate = None
    auditoria.registrar(
        sessao,
        acao="login:sucesso",
        recurso="usuario",
        recurso_id=usuario.id,
        ator_id=usuario.id,
        ator_role=usuario.role,
        empresa_id=usuario.empresa_id,
        requisicao=requisicao,
    )
    sessao.commit()
    definir_cookie(resposta, usuario.id)
    return _com_contexto(sessao, usuario)


def _com_contexto(sessao: Session, usuario: Usuario) -> UsuarioEu:
    """O usuário com os nomes da própria lotação resolvidos."""
    saida = UsuarioEu.model_validate(usuario)
    if usuario.empresa_id:
        empresa = sessao.get(Empresa, usuario.empresa_id)
        saida.empresa_nome = empresa.nome if empresa else None
    if usuario.unidade_id:
        unidade = sessao.get(Unidade, usuario.unidade_id)
        saida.unidade_nome = unidade.nome if unidade else None
    if usuario.setor_id:
        setor = sessao.get(Setor, usuario.setor_id)
        saida.setor_nome = setor.nome if setor else None
    if usuario.cargo_id:
        cargo = sessao.get(Cargo, usuario.cargo_id)
        saida.cargo_nome = cargo.nome if cargo else None
    return saida


@roteador.get("/eu", response_model=UsuarioEu)
def eu(
    usuario: Usuario = Depends(usuario_atual), sessao: Session = Depends(obter_sessao)
) -> UsuarioEu:
    """Quem está autenticado. Não exige permissão: todo perfil pode se ver."""
    return _com_contexto(sessao, usuario)


@roteador.post("/sair", status_code=status.HTTP_204_NO_CONTENT)
def sair(resposta: Response) -> None:
    limpar_cookie(resposta)
