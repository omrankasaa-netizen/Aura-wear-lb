# Security Policy

## Reporting a vulnerability

If you discover a security issue, please open a private report to the repository
owner rather than filing a public issue. Do not include exploit details or live
secrets in public channels.

## Secrets: never commit them

- **Never** commit API keys, tokens, passwords, or connection strings to the repo —
  in code, docs, or config. This includes README/deploy guides and example files.
- Store all secrets as **platform environment variables** (e.g. Railway → Service →
  Variables). Application code reads them via `process.env` / `Deno.env.get()`.
- The only key-shaped values allowed in the repo are **placeholders** in
  `.env.example` (e.g. `RESEND_API_KEY=your_resend_api_key_here`). Real values must
  never replace these.

## Rotating a leaked key

If a secret is ever committed or otherwise exposed:

1. **Revoke/rotate immediately** in the provider dashboard (e.g. Resend → API Keys →
   delete the exposed key, create a new one). Assume any exposed key is compromised.
2. Update the new value in the platform environment variables (Railway), not the repo.
3. Scrub the value from the working tree and, if it was committed, from git history
   (`git filter-repo --replace-text`), then force-push and have all collaborators
   re-clone.

## Prevention tooling

This repo uses [gitleaks](https://github.com/gitleaks/gitleaks) to detect secrets:

- **CI:** `.github/workflows/secret-scan.yml` runs gitleaks on every push and pull
  request and fails the build if a secret is detected.
- **Local (optional):** `.pre-commit-config.yaml` provides a gitleaks pre-commit hook.
  Enable with `pip install pre-commit && pre-commit install`.
- **Config:** `.gitleaks.toml` extends the default ruleset and allowlists documented
  placeholder values in `.env.example`.

## Push protection

Enable **GitHub Push Protection** (Settings → Code security and analysis → Secret
scanning → Push protection) so GitHub blocks pushes that contain known secret
patterns before they reach the remote — a defense-in-depth layer on top of gitleaks.
