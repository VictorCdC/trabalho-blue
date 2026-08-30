# base: dependências e código. dev acrescenta --reload; prod não.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# usuário sem privilégio: um RCE no processo não vira root no container
RUN adduser --system --group --no-create-home blue

COPY requirements.txt ./
# --require-hashes: recusa qualquer pacote que não seja exatamente o do lock
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

COPY . .
USER blue

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/saude')"

FROM base AS dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS prod
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
