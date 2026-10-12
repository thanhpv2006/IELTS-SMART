# Fake OpenAI image.
#
# IMPORTANT: the compose build context is tests/fakes/ (see E2E-CONTRACT.md),
# NOT this subdirectory. So COPY paths below are relative to tests/fakes/.
# Build (standalone) from tests/fakes/:
#   docker build -f openai/Dockerfile -t fake-openai .
#
# Fixtures are baked into the image at /app/fixtures and server.js reads them
# from FIXTURES_DIR (defaults to /app/fixtures here via ENV below). Compose may
# instead MOUNT tests/fakes/fixtures over /app/fixtures — either works since the
# server only reads them at request time.
FROM node:20-alpine

WORKDIR /app

COPY openai/server.js ./server.js
COPY fixtures ./fixtures

ENV PORT=6000
ENV FIXTURES_DIR=/app/fixtures
EXPOSE 6000

CMD ["node", "server.js"]
