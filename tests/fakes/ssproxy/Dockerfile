# Fake ss-proxy image.
#
# IMPORTANT: the compose build context is tests/fakes/ (see E2E-CONTRACT.md),
# NOT this subdirectory. So COPY paths below are relative to tests/fakes/.
# Build (standalone) from tests/fakes/:
#   docker build -f ssproxy/Dockerfile -t fake-ssproxy .
#
# The ss-proxy stub needs no fixtures (its result block is inline in server.js).
FROM node:20-alpine

WORKDIR /app

COPY ssproxy/server.js ./server.js

ENV PORT=5555
EXPOSE 5555

CMD ["node", "server.js"]
