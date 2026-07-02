# MXRP API

API for managing Discord license roles in the MXRP server.

## Deploy with Nixpacks

The repo includes `nixpacks.toml`. Nixpacks installs with `pnpm install --frozen-lockfile` and starts the API with `pnpm start`.

Required environment variables:

- `PORT` provided by the platform; local default is `3000`
- `DATABASE_URL` MongoDB connection string for core API data
- `MONGO_URI_WEB` MongoDB connection string for market/dashboard data
- `GUILD_ID` Discord guild id
- `DISCORD_TOKEN` Discord bot token

## Discord OAuth para MXRP Manager CLI

En Discord Developer Portal, abre la aplicación y registra en **OAuth2 → Redirects** exactamente:

```text
https://api.egologic.cloud/v1/cli-auth/callback
```

La API debe tener `CLIENT_ID`, `CLIENT_SECRET`, `DISCORD_REDIRECT_URI`,
`CLI_JWT_SECRET` y `CLI_ALLOWED_ROLE_IDS`. El redirect configurado en el entorno debe coincidir
carácter por carácter con el registrado en Discord.

Health check:

- `GET /health`

Docs:
- `docs/README.md`
