# syntax=docker/dockerfile:1
# mi-bolt-web: the storefront, the admin and the demo payment app behind one NGINX.
# The demo catalogue comes in as the named build context `catalog`, copied to
# /data/catalog so the admin mock seed's `../../../../../data/catalog/catalog.json`
# resolves here as it does in the repository. Only Compose supplies it
# (deploy/compose.yaml), so a plain `docker build frontend/` cannot build this file.
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# The admin mock seed imports the root catalogue (projects/admin/src/mocks/seed.ts).
COPY --from=catalog catalog.json /data/catalog/catalog.json
RUN npx ng build storefront --configuration production \
 && npx ng build demo-payment --configuration production \
 && npx ng build admin --configuration production
RUN node scripts/check-dist-free-of.mjs dist/storefront/browser setupWorker mockServiceWorker \
 && node scripts/check-dist-free-of.mjs dist/demo-payment/browser setupWorker mockServiceWorker \
 && node scripts/check-dist-free-of.mjs dist/admin/browser setupWorker mockServiceWorker

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:4714e0b1b2577eaa1a6131d07c958b67f0eb68e6d0521e90c6e5287db8cf0bc5
USER root
RUN rm -rf /usr/share/nginx/html/*
USER 101
ENV BACKEND_ORIGIN=http://commerce:8080
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/storefront/browser/ /usr/share/nginx/html/
COPY --from=build /app/dist/admin/browser/ /usr/share/nginx/html/admin/
COPY --from=build /app/dist/demo-payment/browser/ /usr/share/nginx/html/demo-fizetes/
EXPOSE 8080
