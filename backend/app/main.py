"""Aplicação FastAPI.

Convenções que o resto do backend segue:
  - toda rota declara a permissão que exige (app/autorizacao.requer);
  - leitura de tabela multi-tenant passa pela ConsultaEscopada;
  - leitura de dado identificado e acesso da plataforma são auditados.
Os testes em tests/ falham se alguma dessas três for burlada.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import obter_config
from app.rotas import (
    alertas,
    auth,
    casos,
    colaboradores,
    empresas,
    estrutura,
    meu,
    painel,
    usuarios,
)

#: Rotas que não exigem autenticação. Qualquer acréscimo aqui é decisão de
#: segurança e o teste de cobertura obriga a passar por esta lista.
ROTAS_PUBLICAS = frozenset({"/saude", "/auth/login", "/auth/sair"})

#: Rotas autenticadas que não exigem permissão específica.
ROTAS_SEM_PERMISSAO = frozenset({"/auth/eu"})


def criar_app() -> FastAPI:
    config = obter_config()
    app = FastAPI(
        title="BLUE",
        # o schema interativo não vai para produção
        docs_url=None if config.producao else "/docs",
        redoc_url=None,
        openapi_url=None if config.producao else "/openapi.json",
    )
    # Adicionado antes do CORS de propósito: o último a entrar é o mais
    # externo, e o preflight precisa ser respondido pelo CORS. O piso de 1 kB
    # deixa passar resposta curta (/auth/eu, /casos/contagem), onde comprimir
    # custa mais do que economiza; o painel, que é o payload grande, entra.
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.origens,
        allow_credentials=True,  # o cookie de sessão depende disto
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-Empresa-Id"],
    )
    app.include_router(auth.roteador)
    app.include_router(usuarios.roteador)
    app.include_router(empresas.roteador)
    app.include_router(estrutura.roteador)
    app.include_router(painel.roteador)
    app.include_router(alertas.roteador)
    app.include_router(colaboradores.roteador)
    app.include_router(casos.roteador)
    app.include_router(meu.roteador)

    @app.get("/saude", tags=["infra"])
    def saude() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = criar_app()
