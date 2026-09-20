# Calibre

A self-hosted VALORANT sensitivity explorer built with Rust, React, and TypeScript.
Compare player settings, filter competitive data, and explore sensitivity recommendations.

![Calibre mechanical styles dashboard showing sensitivity distributions and player cohorts](docs/images/mechanical-styles.png)

## Development

Requires Node 24.18+, Rust 1.97.1 via rustup, and a C++ compiler for DuckDB.

```sh
npm ci --prefix frontend
cargo run --manifest-path backend/Cargo.toml
```

In another terminal:

```sh
npm run dev
```

Open http://localhost:5178. The API runs on port 3001.

The app uses bundled data by default. To persist imports with PostgreSQL:

```sh
docker compose up -d db
export DATABASE_URL=postgres://calibre:calibre_local@127.0.0.1:54329/calibre
cargo run --manifest-path backend/Cargo.toml
```

See `.env.example` for configuration. Local processes read exported environment variables.

## Docker

```sh
docker compose --profile full up --build -d
```

Open http://localhost:8080.

## Checks

```sh
npm run check
npm run fix
npm run build
npm --prefix frontend exec playwright install chromium
npm run test:e2e
```

`check` runs formatting, lint, type checks, and Rust tests. `fix` formats code and applies safe lint fixes. Browser tests start the frontend and backend automatically.

## Refresh data

With `DATABASE_URL` set:

```sh
cargo run --manifest-path backend/Cargo.toml -- import
```

Restart the API after importing.
