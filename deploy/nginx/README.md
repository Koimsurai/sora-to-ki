# Using your own nginx (instead of the bundled Caddy)

If nginx already owns ports 80/443 on the machine, there's no need for a second proxy: expose the frontend and
backend on localhost only and let nginx proxy to them. This is how koimsurai.com itself runs.

1. Copy `docker-compose.override.yml` from this folder to the repo root (merge it in if you already have one):

   ```bash
   cp deploy/nginx/docker-compose.override.yml .
   mkdir -p storage/uploads storage/gallery
   ```

   Caddy won't start; the frontend listens on `127.0.0.1:13579` and the backend on `127.0.0.1:3002`.
   Admin uploads and photo thumbnails live in `storage/` under the repo, where nginx serves them directly.

2. Set `SITE_URL` in `.env` to the public URL (`https://example.com`); `CADDY_ADDRESS` isn't used. Then:

   ```bash
   docker compose up -d
   ```

3. nginx config:

   ```bash
   sudo cp deploy/nginx/security-headers.conf /etc/nginx/snippets/sora-to-ki-security.conf
   sudo cp deploy/nginx/sora-to-ki.conf /etc/nginx/sites-available/sora-to-ki
   # replace example.com and /srv/sora-to-ki (the repo's real path) in sora-to-ki
   sudo ln -s /etc/nginx/sites-available/sora-to-ki /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d example.com   # HTTPS
   ```

Files in `storage/` are written by the backend container. If nginx gets a 403 there, make sure every directory
from `/` down to `storage/uploads` is traversable (`x`) by nginx's user (usually `www-data`).

To change the CSP: edit `scripts/csp.mjs` first, then paste the line `node scripts/csp.mjs` prints into
`sora-to-ki.conf` (same as for `.config/Caddyfile`).

## Other reverse proxies (Traefik, HAProxy, …)

Use the same override to turn Caddy off and publish the two ports, then route like `sora-to-ki.conf` does:
`/api/` and `/rss` to the backend, `/uploads/` and `/nas-images/` as static files from `storage/uploads` and
`storage/gallery`, everything else to the frontend. Set `X-Forwarded-For` to the client address rather than appending
to it, or readers can spoof their IP.
