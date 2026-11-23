# The directory and every game in one nginx image (README.md, Hosting), built from the repo root:
#   docker build -f hosting/Dockerfile -t games .
# Typecheck and every game's tests come first: a red test means no image.
FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
# npm ci's postinstall fetches and builds Magic House's recorded sounds (magic-house/sounds/README.md),
# so its sources and script come in first; npm run sounds then fails the image if they did not build.
COPY magic-house/sounds/ magic-house/sounds/
RUN npm ci && npm run sounds
COPY . .
RUN npm test && npm run build \
  && find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' \) -exec gzip -k9 {} +

# Stock nginx as uid 101 on port 8080: nothing to serve but files.
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY hosting/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/dist /usr/share/nginx/html
