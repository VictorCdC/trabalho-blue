# BLUE

## Estrutura

```
BLUE/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── next.config.js
│   └── Dockerfile
├── backend/
│   ├── app/
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── rbac/                   # compartilhado por enquanto
├── deploy/
├── docker-compose.yml
└── README.md
```

## Stack

- **frontend/** — Next.js 15 + React 19
- **backend/** — FastAPI + SQLAlchemy + Alembic
- **db** — PostgreSQL 16
- **rbac/** — controle de acesso, compartilhado entre frontend e backend por enquanto
- **deploy/** — artefatos de deploy

## Subir o ambiente

```bash
docker compose up --build
```

- frontend: http://localhost:3000
- backend: http://localhost:8000
- db: localhost:5432
