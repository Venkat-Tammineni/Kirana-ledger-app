# Kirana POS

## Local development (Windows)

### 1) Configure environment

This app requires Postgres. The server reads `DATABASE_URL` at startup.

- Copy `env.example` to a new file named `.env` (same folder as `package.json`)
- Fill in:
  - `DATABASE_URL=postgres://...`

> Note: this repo may block committing dotfiles, but you can still create a local `.env` on your machine for development.

### 2) Install and run

```bash
npm install
npm run dev
```

### 3) Typecheck

```bash
npm run check
```


