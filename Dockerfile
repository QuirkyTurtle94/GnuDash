FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14 AS build
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
# Force static export: this image serves the build output through nginx and
# has no Node runtime. The default build target (standalone) is used by the
# Postgres-backend deployment path instead — see docs/deployment.md.
ENV NEXT_OUTPUT=export
RUN npm run build

FROM nginx:alpine@sha256:8b1e78743a03dbb2c95171cc58639fef29abc8816598e27fb910ed2e621e589a
COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
