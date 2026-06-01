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

Health check:

- `GET /health`

Docs:
- `docs/README.md`
