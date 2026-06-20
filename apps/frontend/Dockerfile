# Packaging-only image. Build the SPA on the host before building this image:
#   pnpm --filter @mono/frontend build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY build/client/ /usr/share/nginx/html/

EXPOSE 80
