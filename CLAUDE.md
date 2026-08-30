# Convenções do BLUE

Plataforma de saúde ocupacional: colaborador registra desconforto, SESMT
acompanha, RH vê números. Dado de saúde é dado pessoal **sensível** (LGPD,
art. 11) — quase toda regra abaixo existe por causa disso.

## Idioma

Domínio, identificadores e comentários em **português**: `queixa`, `caso`,
`alerta`, `setor`, `empresa`. Não traduza na fronteira entre frontend e
backend. Única exceção herdada: `role` (o perfil do usuário), que já é assim
em `frontend/src/lib/types.ts`.

## Permissões

`rbac/permissoes.json` é a fonte. `frontend/src/lib/rbac-gerado.ts` e
`backend/app/rbac_gerado.py` são **gerados** — não edite:

```bash
python rbac/gerar.py            # regenera
python rbac/gerar.py --check    # o que a CI roda
```

## Regras do backend que os testes obrigam

1. **Toda rota declara permissão**: `usuario: Usuario = requer("casos:ver")`.
   Exceção só entrando em `ROTAS_PUBLICAS`/`ROTAS_SEM_PERMISSAO` (`app/main.py`).
2. **Tabela multi-tenant só pela `ConsultaEscopada`** (`app/consulta.py`).
   `select(Modelo)` direto num handler reprova em `tests/test_escopo_tenant.py`.
3. **Leitura de dado identificado é auditada** (`app/auditoria.py`). A tabela
   é somente-inserção: o banco recusa UPDATE e DELETE.
4. **Agregado abaixo de `K_MINIMO_AGREGACAO` não sai** (`app/agregacao.py`).
   Sem isso, filtrar unidade+setor+cargo reidentifica uma pessoa.
5. **Sessão é cookie httpOnly**, nunca localStorage.

A guarda de rota do frontend (`components/protegido.tsx`) é conveniência de
navegação. A autorização acontece no backend.

## Rodar

```bash
cp .env.example .env            # obrigatório: o compose recusa subir sem
docker compose up --build       # frontend :3000, backend :8000, db :5433

cd backend
docker compose up -d db && pytest    # testes precisam do Postgres
ruff check . && ruff format . && mypy

cd frontend
npm run lint && npm run typecheck && npm run build
```

## Migrations

Uma por PR, nunca editar uma já aplicada. `alembic revision --autogenerate`
**sempre revisado à mão** — ele erra tipos, índices e constraints. A CI roda
`upgrade head`, `alembic check` (drift modelo × migration) e `downgrade base`.

## Dependências

Python: edite `backend/requirements*.in` e rode `./scripts/compilar-deps.sh`
(compila em container Linux, para o lock bater com a imagem de deploy).
Node: `npm install`, e commite o `package-lock.json`.

## Segredos

Nada de credencial no repositório. `.env.example` é o modelo; `.env` é local
e ignorado. Em `AMBIENTE=producao` o backend recusa subir com chave de
desenvolvimento ou cookie sem TLS.
