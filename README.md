# BLUE

Plataforma preventiva de saúde ocupacional. O colaborador registra desconforto
pelo celular; o SESMT acompanha queixas e casos; o RH vê números por setor,
sem nome.

## Estrutura

```
BLUE/
├── frontend/               # Next.js 15 — telas completas, hoje sobre API mock
├── backend/                # FastAPI — fundações (auth, RBAC, tenant, auditoria)
│   ├── app/
│   ├── alembic/
│   ├── tests/
│   └── requirements*.in    # locks gerados por scripts/compilar-deps.sh
├── rbac/permissoes.json    # fonte única do contrato de permissões
├── scripts/
├── deploy/
├── .github/workflows/ci.yml
├── docker-compose.yml
├── CLAUDE.md               # convenções do projeto — leia antes de codar
└── .env.example
```

## Stack

- **frontend/** — Next.js 15 + React 19 + TypeScript + Tailwind v4 + shadcn/ui (ver `frontend/README.md`)
- **backend/** — FastAPI + SQLAlchemy 2 + Alembic, sessão por cookie httpOnly
- **db** — PostgreSQL 16
- **rbac/** — matriz de permissões; gera os espelhos de frontend e backend

## Subir o ambiente

```bash
cp .env.example .env        # obrigatório — o compose recusa subir sem
docker compose up --build
```

- frontend: http://localhost:3000
- backend: http://localhost:8000 (`/docs` fora de produção)
- db: localhost:5433 — porta configurável em `DB_PORTA_HOST`, já que 5432
  costuma estar tomada por um Postgres instalado na máquina

As migrations rodam num serviço próprio (`migracoes`) que executa
`alembic upgrade head` e sai; o backend só sobe depois que ele termina bem.

## Estado atual

O frontend está completo sobre a API mock em `frontend/src/lib/api/mock.ts` —
nenhuma tela depende do backend ainda.

O backend tem as fundações e três rotas que as exercitam (`/auth/login`,
`/auth/eu`, `/usuarios`, `/empresas`). O domínio clínico (queixa, check-in,
caso, estrutura organizacional) ainda não foi modelado: ele entra junto com os
endpoints que o expõem.

Para ligar o frontend no backend, implemente `BlueApi` em
`frontend/src/lib/api/http.ts` e troque a linha do export em
`frontend/src/lib/api/index.ts`. Nenhum componente muda.

## Como o projeto se protege

Regras em `CLAUDE.md`, cobertas por teste:

- toda rota declara a permissão que exige;
- tabela multi-tenant só é lida pela `ConsultaEscopada`;
- leitura de dado identificado vai para uma trilha que nem a aplicação
  consegue reescrever;
- agregado de grupo pequeno demais não é divulgado (`K_MINIMO_AGREGACAO`);
- o espelho do contrato de permissões não pode divergir de `rbac/`.

## Verificar

```bash
python rbac/gerar.py --check

cd backend && pytest -q && ruff check . && mypy
cd frontend && npm run lint && npm run typecheck && npm run build
```

A CI roda isso tudo, mais o ciclo `upgrade → check → downgrade` das migrations.
