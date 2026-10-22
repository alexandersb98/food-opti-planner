# Stage 1: build the frontend.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npx vite build

# Stage 2: the Python server, which also serves the built frontend.
FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml ./
COPY meal_planner/ meal_planner/
COPY server/ server/
RUN pip install --no-cache-dir ".[server]"
COPY --from=web /web/dist web/dist
ENV WEB_DIST=/app/web/dist
# Cloud Run sets PORT; migrations run on startup (one instance only).
CMD ["sh", "-c", "exec uvicorn --factory server.app:create_app --host 0.0.0.0 --port ${PORT:-8080}"]
