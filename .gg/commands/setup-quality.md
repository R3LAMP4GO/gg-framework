# /setup-quality — Auto-Configure Code Quality

Detect project type, install missing linting/typechecking tools, and configure them.

## Step 1: Detect Project Type and Package Manager

Use `find` and `read` to identify:

**Detect package manager first** (for JS/TS projects):
- `bun.lockb` or `bun.lock` → use `bun`
- `pnpm-lock.yaml` → use `pnpm`
- `yarn.lock` → use `yarn`
- `package-lock.json` → use `npm`

Replace all install commands below with the detected package manager.

| File | Type | Expected Tools |
|------|------|----------------|
| `package.json` | JS/TS | eslint, prettier, typescript |
| `pyproject.toml` | Python | ruff, mypy, black |
| `go.mod` | Go | go vet, gofmt, staticcheck |
| `Cargo.toml` | Rust | clippy, rustfmt |
| `composer.json` | PHP | phpstan, php-cs-fixer |

## Step 2: Check What's Already Installed

For each expected tool, check if it's already configured:
- Read dependency files for installed packages
- Use `find` to check for config files (`.eslintrc.*`, `tsconfig.json`, `ruff.toml`, etc.)
- Read `package.json` scripts (or equivalent) for existing commands

## Step 3: Install Missing Tools

Only install what's missing. Use `bash`:

### JS/TS
```bash
npm install --save-dev eslint prettier typescript @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### Python
```bash
pip install ruff mypy black
```

### Go
```bash
go install honnef.co/go/tools/cmd/staticcheck@latest
```

### Rust
```bash
rustup component add clippy rustfmt
```

Add missing scripts to package.json (JS/TS):
```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write ."
  }
}
```

## Step 4: Create Config Files (if missing)

Generate sensible defaults for any missing config files. Use `web_search` to verify current recommended configs if unsure.

## Step 5: Verify Setup

Run all quality commands via `bash`. Ensure they execute without config errors (code errors are fine — the tools work).

## Step 6: Report

```
✅ Code quality configured
  Project: [type]
  Already had: [tools]
  Installed: [tools]
  Lint: [command]
  Typecheck: [command]
  Format: [command]
```
