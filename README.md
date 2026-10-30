<div align="center">

<img src="public/favicon.svg" width="72" alt="sora-to-ki logo" />

# sora-to-ki

**Nothing else here: only the night, white ink, and a faint light.**

A one-person site: notes, moments, works, a collection and a voyage log, all strung together in one night sky.<br/>
This is the source of [**宙と木 (koimsurai.com)**](https://koimsurai.com), and you can run it as your own site.

**English** · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

[**See the demo**](https://koimsurai.com/en) · [**Run your own site**](#️-run-your-own-site) · [Colophon (the design write-up)](https://koimsurai.com/en/about-site) · [Releases](https://github.com/Koimsurai/sora-to-ki/releases)

[![CI](https://img.shields.io/github/actions/workflow/status/Koimsurai/sora-to-ki/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/Koimsurai/sora-to-ki/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Koimsurai/sora-to-ki?logo=github)](https://github.com/Koimsurai/sora-to-ki/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![frontend cov](https://img.shields.io/codecov/c/github/Koimsurai/sora-to-ki/main?flag=frontend&label=frontend%20cov&logo=codecov&logoColor=white)](https://app.codecov.io/gh/Koimsurai/sora-to-ki?flags%5B0%5D=frontend)
[![e2e cov](https://img.shields.io/codecov/c/github/Koimsurai/sora-to-ki/main?flag=e2e&label=e2e%20cov&logo=playwright&logoColor=white)](https://app.codecov.io/gh/Koimsurai/sora-to-ki?flags%5B0%5D=e2e)
[![backend cov](https://img.shields.io/codecov/c/github/Koimsurai/sora-to-ki/main?flag=backend&label=backend%20cov&logo=rust&logoColor=white)](https://app.codecov.io/gh/Koimsurai/sora-to-ki?flags%5B0%5D=backend)

[![React 19](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-EF4444?logo=react&logoColor=white)](https://tanstack.com/start)
[![Rust](https://img.shields.io/badge/Rust_·_axum-000000?logo=rust&logoColor=white)](https://github.com/tokio-rs/axum)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

[![Home: moons around Saturn](.github/screenshots/home.jpg)](https://koimsurai.com/en)

</div>

## 🛰️ Run your own site

All you need is a machine with Docker and a domain pointing at it.

```bash
git clone https://github.com/Koimsurai/sora-to-ki.git
cd sora-to-ki
cp .env.example .env                  # URL, domain
cp .env.backend.example .env.backend  # JWT_SECRET, GitHub or Google sign-in
docker compose up -d
docker compose logs backend-rs | grep setup   # the first-time setup link
```

The link in the log opens the **first-time setup wizard**: sign in with GitHub or Google to claim the site, pick your
languages, name it and choose which pages to show, while the orbit on the right grows with every answer. The wizard's
first step walks you through creating the OAuth app it needs for sign-in.

![First-time setup wizard](.github/screenshots/init-wizard.jpg)

- The images are built at release time ([GHCR](https://github.com/Koimsurai?tab=packages&repo_name=sora-to-ki)), so nothing compiles on your machine; add `--build` to build from source instead
- Caddy is built in: put your domain in `CADDY_ADDRESS` in `.env` and HTTPS is set up automatically. To try it locally, use `:80` and open <http://localhost>.
  If the machine already runs nginx, switch to it with [`deploy/nginx/`](deploy/nginx/README.md) (an override and a server block are included);
  for any other reverse proxy, write a `docker-compose.override.yml` as described at the top of `docker-compose.yml`
- If `OWNER_EMAIL` is set in `.env.backend` there's no wizard: whoever signs in with that address is the owner
- The admin is at `/admin` and only takes GitHub or Google sign-in (`ADMIN_USERNAME` / `ADMIN_PASSWORD` is a machine account for MCP, not for people)
- Upgrading: `docker compose pull && docker compose up -d`. To pin a version, set `SORA_TO_KI_VERSION=0.2.0` in `.env`
- The database is backed up to `./backups` every day

### Let an AI set it up

An AI that can run commands on the server (Claude Code, Codex…) can do this too. Paste it the following, with the `<…>` filled in:

```text
Set up https://github.com/Koimsurai/sora-to-ki on this server, following "Run your own site" in the README.
The domain is <blog.example.com>, the site name is <name>, the default language is <en>.
- .env: put the domain in SITE_URL and CADDY_ADDRESS; generate JWT_SECRET in .env.backend with `openssl rand -hex 32`
- If ports 80/443 are already taken by something else, don't stop it: write a docker-compose.override.yml as described at the top of docker-compose.yml
- When it's up, give me the URL from `docker compose logs backend-rs | grep setup`; I'll sign in and claim the site myself
- Don't commit .env or .env.backend, and don't paste them anywhere
```

Signing in has to be you: the GitHub/Google OAuth app is created under your own account. What the AI can do is get the
machine ready, fill in the config, and, once you've made the OAuth app, put the two values into `.env.backend` and restart the backend.

## ✨ What you get

### One sky

Every page is one kind of thing in the same night sky. Turn off a page you don't want in the admin, and its orbit leaves the home page with it.

| Page | is, in the sky | Filled from |
|---|---|---|
| Home | moons around Saturn, one moon per section | the latest of each page |
| Notes | rings of star trails, one trail per article | articles written in the admin |
| Moments | passing comets; the newest moment is the head | short posts from the admin |
| Works | a spiral course outward; a planet's size is its code size, its moons are GitHub stars | GitHub repos picked in the admin |
| Collection | signals sent from Earth at the moment something was finished, travelling at the speed of light | bookshelf, Simkl / TMDb, Spotify (all optional) |
| Log | a launch from your launch pad; altitude is your cumulative GitHub contributions | a start date and milestones from the admin |
| About | a free fall from one year down to now | chapters, skills and experience from the admin |
| Photos | pictures downlinked from deep space, received line by line | a NAS or an uploaded folder |
| Setup | engineering sheets in a space shuttle's cargo bay | built-in sheets, or your own uploaded image |
| Friends | stars around one center | a form on the page, reviewed in the admin |
| Messages | radio waves received | readers |
| Colophon | a sextant and the stars it measured | a Q&A from the admin |

### Writing

- **MDX articles**: GFM plus twenty-odd custom blocks (code tabs, diffs, file trees, Mermaid charts, polls, hand-drawn sketches, Japanese furigana, spoilers, author's notes…),
  all compiled and highlighted on the server, so readers never download a compiler
- **Five languages**: Traditional Chinese, Simplified Chinese, English, Japanese and Korean, with the default chosen by you. Each article is translated on its own,
  Simplified Chinese can be converted automatically, and the admin flags translations that fell behind the original
- **Scheduled publishing** (the newsletter goes out then too), a **trash** with 30 days to restore, a newsletter (Resend), RSS
- **No layout shift from images**: a thumbhash and the original dimensions are computed at upload, so a blurred placeholder shows before the image loads
- **MCP server**: the 31 tools in [`packages/mcp-server`](packages/mcp-server) let an AI assistant write posts, post moments, upload images and edit pages and site settings through the admin API

### The admin

- **Now**: an overview of what needs attention and the last 28 days of Web Vitals
- **Write**: Monaco editor (Vim mode, slash commands, drag-and-drop upload) with live preview; synced records sit next to the moments composer, one click pulls one in
- **Keep**: the bookshelf, photo titles and featured picks, what the collection shows publicly
- **Reply**: comment moderation (keyboard j / k / a / s / r), **link-exchange requests** (one-click checks that the site is reachable, links back and has an RSS feed), newsletter subscribers
- **Station**: site settings (name, languages, celestial body, launch pad, each page's description), each page's content, accounts and roles
- The admin itself speaks all five languages, following you rather than the site's default

| Now | Notes |
|:---:|:---:|
| ![Admin: Now](.github/screenshots/admin-dashboard.jpg) | ![Admin: Notes](.github/screenshots/admin-posts.jpg) |

### Also

- GitHub / Google sign-in, a command palette (`Ctrl+K`), a PWA offline page, a sitemap and hreflang per language, a generated share image for every page, a strict CSP
- Third-party integrations are all optional: leave a key empty and that section simply isn't there, with no errors
- Error tracking (anything Sentry-compatible, such as GlitchTip) and Plausible analytics are optional too

## 🎛️ Customizing

You choose from a set of carefully made options rather than a wall of knobs: every site gets a little "this is mine", and the whole still holds together.

- **Celestial body**: Saturn, Neptune, a black hole or Betelgeuse, as the one readers see first; readers can switch it from the top bar
- **Launch pad**: where you are. The log's rocket lifts off there over that part of the coastline (with rivers and lakes if you're inland), and it's the amber dot on the Collection globe
- **Pages**: moments, works, collection, setup, log, messages, photos, friends and the colophon can all be turned off
- **Descriptions**: each page's description in search results, and the opening line of the About menu, written separately in each language
- **Setup sheets**: to use your own hand-drawn sheets on the setup page (with whole parts lighting up on hover), drop a sheet pack into `custom/setup/`;
  the format, and how to ask an AI to make one, are in [`custom/setup/README.md`](custom/setup/README.md)

## 🌌 Design

The whole site rests on one idea: **every page is one kind of thing in the same night sky**, all made from the dots and lines of the dotted Saturn on the home page. The full explanation, where you can also watch Saturn being drawn step by step, is the demo site's [Colophon](https://koimsurai.com/en/about-site).

### Only three materials

| | | |
|---|---|---|
| ⬛ | **Black is the paper** | the ground of every page |
| ⬜ | **White is the ink** | text, lines and dots |
| 🟧 | **Amber is the signal** | only ever on a single point: where you are, or what is happening. Never a fill colour |

### Three typefaces

- **Source Han Serif**: Chinese and every mixed sentence. Subset per page to the characters actually used, so a page downloads only a few dozen KB
- **Instrument Serif**: only large all-English display text, never bold
- **Monospace**: dates and numbers

Articles can also be read in a sans, a handwritten-style or a modern sans face, each served per language by the site.

### Three rules

1. **One signal per screen**: amber lights up one place at a time
2. **Only dots and lines**: no filled blocks, no drop shadows, no frosted glass; right angles, hairlines, dotted dividers
3. **Grown from data**: on the Works page a planet's size is its code size, its surface is its main language, and its moons are GitHub stars

## 📸 Screenshots

| Notes: rings of star trails | Article |
|:---:|:---:|
| [![Notes](.github/screenshots/notes.jpg)](https://koimsurai.com/en/blog) | [![Article](.github/screenshots/post.jpg)](https://koimsurai.com/en/blog) |
| **Works: a spiral course outward** | **Collection: signals sent from Earth** |
| [![Works](.github/screenshots/works.jpg)](https://koimsurai.com/en/portfolio) | [![Collection](.github/screenshots/collection.jpg)](https://koimsurai.com/en/watch) |
| **Log: a launch from the ground** | **Photos: pictures downlinked from deep space** |
| [![Log](.github/screenshots/log.jpg)](https://koimsurai.com/en/history) | [![Photos](.github/screenshots/photos.jpg)](https://koimsurai.com/en/photos) |
| **Friends: stars around one center** | **Setup: a space shuttle's blueprints** |
| [![Friends](.github/screenshots/friends.jpg)](https://koimsurai.com/en/friends) | [![Setup](.github/screenshots/setup.jpg)](https://koimsurai.com/en/setup) |
| **Colophon** | **Admin: comments** |
| [![Colophon](.github/screenshots/colophon.jpg)](https://koimsurai.com/en/about-site) | ![Admin: comments](.github/screenshots/admin-comments.jpg) |

## 🏗️ Architecture

```mermaid
flowchart LR
  user([Browser]) --> proxy[Caddy<br/>TLS / compression / uploaded images]
  proxy -->|pages| fe[frontend<br/>TanStack Start · Nitro<br/>SSR + ISR]
  proxy -->|/api| be[backend-rs<br/>axum · sqlx]
  fe -->|SSR data| be
  be --> db[(SQLite)]
  be -->|cached, stale on error| ext[Third-party APIs (optional)<br/>GitHub · Spotify · Steam<br/>WakaTime · TMDb · Simkl]
  be -.purges ISR cache when posts or settings change.-> fe
  backup[db-backup<br/>daily SQLite backup] --- db
```

- **Types are written once**: the backend's Rust structs generate TypeScript types with [specta](https://github.com/specta-rs/specta) ([`packages/api-types`](packages/api-types)), which the frontend imports directly; CI checks that both sides match
- **Third-party APIs go through the backend**: keys never reach the frontend. Responses are cached, and stale data is served when an upstream fails, so a section never goes blank
- **ISR**: pages are cached by Nitro, and the backend tells the frontend to purge them when a post or the site settings change
- **Design tokens are enforced**: spacing, font sizes, line heights, radii, opacity… must use the tokens in `src/index.css`; `pnpm check:css-tokens` rejects ad-hoc values

## 🛠️ Stack

| | |
|---|---|
| **Frontend** | React 19 · TanStack Start / Router / Query · Vite+ (vite, vitest, oxlint, oxfmt) · Tailwind CSS v4 · Framer Motion · three.js (WebGPU, falling back to WebGL2) · MDX · @pierre/highlights · pele · rough.js · i18next · Radix UI / shadcn |
| **Backend** | Rust 2024 · axum · tokio · sqlx (SQLite) · JWT · image / resvg / thumbhash (images and share images) · ferrous-opencc · utoipa (OpenAPI at `/api/docs`) · Sentry SDK |
| **Type** | Source Han Serif (subset per page) · Instrument Serif · monospace |
| **Infra** | Docker Compose · Caddy · GitHub Actions · GHCR · Codecov |

## 🧪 Quality gates

Every PR has to pass these before it can merge (the full list is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- **Types and lint**: `tsc`, oxlint (with type-aware rules and `@shadcn/lint`), Biome (CSS), the CSS token check, knip (unused files and exports)
- **Tests**: vitest unit tests; Playwright e2e (26 specs, including accessibility checks, admin round trips, and computed-style comparisons of 11 public routes × 3 widths plus the admin pages); backend cargo-nextest with a coverage threshold
- **API**: Schemathesis generates requests from the OpenAPI spec and checks the responses against the declared schemas
- **Backend**: `cargo clippy` (pedantic), `cargo audit`, `cargo shear`, `typos`
- **Performance**: Lighthouse CI budgets
- **Also** (manual, not in CI): mutation testing (Stryker, cargo-mutants) to find code that tests run through but don't actually check

## ⚙️ Local development

You need **Node.js ≥ 26**, **pnpm 12** and **Rust stable** (edition 2024), or just Docker.

```bash
git clone https://github.com/Koimsurai/sora-to-ki.git
cd sora-to-ki
pnpm install
```

### Run frontend and backend separately

```bash
# Backend: reads backend/.env
cp backend/.env.example backend/.env
#   set DATABASE_URL to a local path, e.g. sqlite://./dev.sqlite
#   set BIND_ADDR to 127.0.0.1:3009 (the frontend dev server's default)
cd backend && cargo run

# Frontend: http://localhost:13998
pnpm dev
```

The database is created if it doesn't exist, and the schema in [`backend/migrations/`](backend/migrations) is applied on startup.

### Environment variables

Only `DATABASE_URL` and `JWT_SECRET` are required (both are in the example file). Anything else that's unset turns the related feature off or shows an empty state.

| Purpose | Variables |
|---|---|
| Basics | `DATABASE_URL` `BIND_ADDR` `JWT_SECRET` `SITE_URL` |
| Sign-in (owner and readers) | `GITHUB_CLIENT_ID` `GITHUB_CLIENT_SECRET` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `OWNER_EMAIL` |
| MCP machine account | `ADMIN_USERNAME` `ADMIN_PASSWORD` |
| Activity page | `GITHUB_TOKEN` `WAKATIME_API_KEY` `STEAM_API_KEY` `STEAM_ID` |
| Spotify | `SPOTIFY_CLIENT_ID` `SPOTIFY_CLIENT_SECRET` `SPOTIFY_REFRESH_TOKEN` `SPOTIFY_REDIRECT_URI` |
| Film and TV | `TMDB_API_TOKEN` `SIMKL_CLIENT_ID` `SIMKL_ACCESS_TOKEN`; Taiwan's Bahamut Anime Crazy: `BAHAMUT_UID` `BAHAMUT_PASSWORD` |
| Bookshelf | `GOOGLE_BOOKS_API_KEY`; Taiwan's National Central Library ISBN data: `ENABLE_TW_ISBN_SYNC` |
| Newsletter | `RESEND_API_KEY` |
| Error tracking | `SENTRY_DSN` `SENTRY_FRONTEND_DSN` |
| Admin traffic (Plausible) | `PLAUSIBLE_API_KEY` `PLAUSIBLE_SITE_ID` |
| ISR purge | `FRONTEND_REVALIDATE_URL` `REVALIDATE_SECRET` (generated automatically under compose if left empty) |

### Common commands

```bash
pnpm dev              # frontend dev server
pnpm build            # production build
pnpm test             # unit tests
pnpm e2e              # Playwright e2e (runs the last build; run pnpm build after changing src/)
pnpm lint:css         # CSS lint (Biome)
pnpm check:css-tokens # CSS token check
pnpm export:types     # regenerate TS types from Rust

cd backend
cargo nextest run --no-fail-fast   # backend tests (use nextest, not cargo test)
cargo clippy --all-targets -- -D warnings
```

### Project layout

```
.
├── backend/                 # Rust API
│   ├── src/router.rs        # route table
│   ├── src/handlers/        # split by domain (posts, thoughts, watch, gallery, ground…)
│   ├── data/geo/            # the log's coastlines (Natural Earth, public domain)
│   └── migrations/          # SQLite schema
├── packages/
│   ├── api-types/           # TS types generated from Rust (don't edit by hand)
│   ├── mdx-core/            # MDX compile settings shared by frontend and backend
│   └── mcp-server/          # MCP server for the admin API
├── src/
│   ├── routes/              # TanStack Router file routes (including the $locale/ prefix)
│   ├── components/          # grouped by feature; each page's sky is in a matching *Sky.ts
│   ├── data/ i18n/ seo/     # API queries, locale routing, meta and JSON-LD
│   ├── hooks/ store/ lib/
│   └── locales/             # translations for the five languages (the admin's are in locales/<lang>/admin/)
├── custom/                  # yours to change: setup sheet packs
├── server/routes/           # Nitro routes: sitemap, robots, rss, llms.txt
├── tests/e2e/               # Playwright
├── Dockerfile
└── docker-compose.yml
```

Working notes for AI assistants (Claude Code and the like) live in [`CLAUDE.md`](CLAUDE.md) (in Chinese); it also records a lot of past pitfalls and the reasons behind design decisions.

## 📜 History

- **April 2025**: started, as a one-person site
- **July 2026**: the backend moved from Express to Rust in one go; all 120+ endpoints were diffed against the old ones and the switch happened only once every response matched ([`backend/STRANGLER.md`](backend/STRANGLER.md), in Chinese)
- **October 2026**: rebuilt as today's 宙と木 around "three materials, three rules". The last version before that is the tag [`v1-final`](https://github.com/Koimsurai/sora-to-ki/tree/v1-final), still running read-only at <https://archive.koimsurai.com>
- **October 2026**: the hard-coded parts taken out, open-sourced as sora-to-ki that anyone can run ([v0.2.0](https://github.com/Koimsurai/sora-to-ki/releases))

## 📄 License and contributing

- **Code**: [GNU Affero General Public License v3.0](LICENSE). If you modify it and **run it as a public website**, you have to publish your modified source under the same licence
- **Content**: the demo site's articles, photos, moments, book reviews, avatar and logo © Koimsurai, **all rights reserved**, not covered by the licence
- If you just want to run a site, follow "Run your own site" above; no fork needed
- Pull requests are not accepted; questions and bug reports are welcome as [issues](https://github.com/Koimsurai/sora-to-ki/issues)

## 🙏 Thanks

It relies on a lot of open source, with special thanks to
[TanStack](https://tanstack.com/), [axum](https://github.com/tokio-rs/axum), [sqlx](https://github.com/launchbadge/sqlx),
[three.js](https://threejs.org/), [MDX](https://mdxjs.com/), [pele](https://pele.run/), [rough.js](https://roughjs.com/),
[Excalifont](https://github.com/excalidraw/excalidraw), [Xiaolai](https://github.com/lxgw/kose-font), [Radix UI](https://www.radix-ui.com/), [shadcn/ui](https://ui.shadcn.com/),
[OpenCC](https://github.com/BYVoid/OpenCC), [thumbhash](https://github.com/evanw/thumbhash), [Natural Earth](https://www.naturalearthdata.com/),
[Source Han Serif](https://github.com/adobe-fonts/source-han-serif), [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif),
and the [Vite+](https://viteplus.dev/) and oxc toolchain.
