# BLUE

Plataforma preventiva de saúde ocupacional. O colaborador registra desconforto
pelo celular; o SESMT acompanha queixas e casos; o RH vê números por setor,
sem nome.

## Estrutura

```
BLUE/
├── frontend/               # Next.js 15 — telas completas, sobre a API do backend
├── backend/                # FastAPI — auth, RBAC, tenant, auditoria e domínio clínico
│   ├── app/
│   ├── alembic/
│   ├── scripts/semear.py   # dados de demonstração no Postgres
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
- **db** — PostgreSQL 17 na máquina, fora do compose
- **rbac/** — matriz de permissões; gera os espelhos de frontend e backend

## Subir o ambiente

O banco fica fora do compose: é o PostgreSQL da máquina, em
`localhost:5432`, com `blue_dev` para desenvolver e `blue_teste` para os
testes. Crie papel e banco antes da primeira subida — o `.env.example` traz os
dois comandos.

```bash
cp .env.example .env        # obrigatório — o compose recusa subir sem
docker compose up --build
```

- frontend: http://localhost:3000
- backend: http://localhost:8000 (`/docs` fora de produção)
- db: localhost:5432, na máquina. O contêiner o alcança por
  `host.docker.internal`, e é só por isso que existem duas URLs no `.env`
  apontando para o mesmo banco.

Um Postgres em contêiner ao lado do da máquina virava dois "bancos de dev"
divergindo em silêncio — migration aplicada num, seed rodado no outro.

As migrations rodam num serviço próprio (`migracoes`) que executa
`alembic upgrade head` e sai; o backend só sobe depois que ele termina bem.

## Estado atual

Frontend e backend estão ligados: não há mais API mock. Cada tela pede ao
servidor o recorte de que precisa, já filtrado, já agregado e já paginado.

O que isso mudou, além de desempenho:

- **O RH deixou de receber dado identificado.** Antes o navegador baixava o
  histórico inteiro da empresa e a tela escondia o que o perfil não podia ver.
  Agora o servidor não envia: um alerta individual chega ao RH sem a pessoa.
- **O k-mínimo passou a existir de fato.** `app/agregacao.py` estava escrito e
  testado, mas não havia agregado no servidor para suprimir. Agora todo recorte
  com menos de `K_MINIMO_AGREGACAO` pessoas volta vazio, por qualquer rota.
- **A sessão saiu do localStorage.** O cookie httpOnly já existia; o frontend é
  que guardava o id do usuário em paralelo. Quem responde "quem está logado"
  agora é `/auth/eu`.

Onde a conta acontece:

| Antes (navegador) | Agora (servidor) |
|---|---|
| `lib/analytics.ts` | `backend/app/indicadores.py` (SQL) |
| `useMemo` de alertas em `sessao.tsx` | `backend/app/alertas.py` |
| `filter` por unidade/setor/cargo em `lib/filtros.ts` | `backend/app/recorte.py` (`WHERE`) |
| `slice` de listas | `LIMIT`/`OFFSET` (`backend/app/paginacao.py`) |

## Dados de demonstração

O banco sobe vazio. Para plantar a demonstração:

```bash
cd backend && python -m scripts.semear
```

São nove contas: quatro de painel (admin, RH, SESMT e plataforma) e cinco
colaboradores. Oito entram com `NOME.SOBRENOME` e a senha `blue1234`; a equipe
da plataforma entra com `admin` / `admin123`. O script imprime a credencial de
cada uma e recusa rodar com `AMBIENTE=producao`.

Cinco colaboradores é pouca gente de propósito, e o painel mostra isso: nenhum
recorte alcança `K_MINIMO_AGREGACAO`, então os agregados saem suprimidos e não
há alerta coletivo. O que resta é o alerta individual e o caso aberto dele.

## Como o projeto se protege

Regras em `CLAUDE.md`, cobertas por teste:

- toda rota declara a permissão que exige;
- tabela multi-tenant só é lida pela `ConsultaEscopada`;
- leitura de dado identificado vai para uma trilha que nem a aplicação
  consegue reescrever;
- agregado de grupo pequeno demais não é divulgado (`K_MINIMO_AGREGACAO`);
- o espelho do contrato de permissões não pode divergir de `rbac/`;
- toda listagem é paginada, e o `total` vem do banco.

## Verificar

```bash
python rbac/gerar.py --check

cd backend && pytest -q && ruff check . && mypy
cd frontend && npm run lint && npm run typecheck && npm run build
```

A CI roda isso tudo, mais o ciclo `upgrade → check → downgrade` das migrations.
