# 用主機上的 nginx（不用內建的 Caddy）

主機上已經有 nginx 在管 80／443 的話，不必再起一個 Caddy：讓前後端只對本機開 port，nginx 轉進來就好。
koimsurai.com 自己就是這樣跑的。

1. 把這個資料夾的 `docker-compose.override.yml` 複製到 repo 根目錄（已經有 override 的話把內容併進去）：

   ```bash
   cp deploy/nginx/docker-compose.override.yml .
   mkdir -p storage/uploads storage/gallery
   ```

   內建的 Caddy 不會啟動；前端開在 `127.0.0.1:13579`、後端在 `127.0.0.1:3002`；
   後台上傳的檔案與照片的縮圖改放在 repo 底下的 `storage/`，nginx 直接讀。

2. `.env` 的 `SITE_URL` 填對外的網址（`https://example.com`），`CADDY_ADDRESS` 用不到。然後：

   ```bash
   docker compose up -d
   ```

3. nginx 設定：

   ```bash
   sudo cp deploy/nginx/security-headers.conf /etc/nginx/snippets/sora-to-ki-security.conf
   sudo cp deploy/nginx/sora-to-ki.conf /etc/nginx/sites-available/sora-to-ki
   # 改掉 sora-to-ki 裡的 example.com，以及 /srv/sora-to-ki（換成這個 repo 的實際路徑）
   sudo ln -s /etc/nginx/sites-available/sora-to-ki /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d example.com   # HTTPS
   ```

`storage/` 裡的檔案是後端的容器寫的。nginx 讀不到（403）的話，檢查從 `/` 一路到 `storage/uploads` 的每一層資料夾，
nginx 的使用者（多半是 `www-data`）都要能進去（`x` 權限）。

改 CSP 的話：先改 `scripts/csp.mjs`，再把 `node scripts/csp.mjs` 印出來的那一行貼進 `sora-to-ki.conf`（跟 `.config/Caddyfile` 一樣）。

---

## Using your own nginx (instead of the built-in Caddy)

If nginx already owns ports 80/443 on the machine, there's no need for Caddy: expose the frontend and backend on
localhost only and let nginx proxy to them. This is how koimsurai.com itself runs.

1. Copy `docker-compose.override.yml` from this folder to the repo root (merge it in if you already have one),
   then `mkdir -p storage/uploads storage/gallery`. Caddy won't start; the frontend listens on `127.0.0.1:13579`
   and the backend on `127.0.0.1:3002`; uploads and photo thumbnails live in `storage/` for nginx to serve directly.
2. Set `SITE_URL` in `.env` to the public URL (`https://example.com`); `CADDY_ADDRESS` isn't used. Then `docker compose up -d`.
3. Copy `security-headers.conf` to `/etc/nginx/snippets/sora-to-ki-security.conf` and `sora-to-ki.conf` to
   `/etc/nginx/sites-available/`, replace `example.com` and `/srv/sora-to-ki` (the repo's real path), enable the site,
   `nginx -t && systemctl reload nginx`, and run `certbot --nginx -d example.com` for HTTPS.

If nginx gets a 403 on `storage/`, make sure every directory from `/` down to `storage/uploads` is traversable (`x`)
by nginx's user (usually `www-data`).
