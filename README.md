# MXRP API

## Overview
API for managing Discord license roles in the MXRP server.

## Base URL
`http://localhost:3000`

## Auth
All protected routes require `x-api-key`.

## Routes

### Update License Role
**POST** `/v1/saf/licenses`

Headers:
- `x-api-key: <your_api_key>`
- `Content-Type: application/json`

Example (curl):
```bash
curl -X POST "http://localhost:3000/v1/saf/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "add" }'
```

Remove role (curl):
```bash
curl -X POST "http://localhost:3000/v1/saf/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "remove" }'
```

Body:
```json
{
  "userId": "123456789012345678",
  "license": "LicenciaA1",
  "action": "add"
}
```

Rules:
- `license` must exist in `src/config.js` as a key in `ROLES`.
- `action` must be `add` or `remove`.

Success `200`:
```json
{ "message": "Role LicenciaA1 added to user 123456789012345678." }
```

Errors:
- `400` Invalid payload or license not configured
- `401` Missing API key
- `403` Invalid/inactive API key
- `404` User not found in Discord server
- `500` Discord or server error

## Setup
Required env vars:
- `DATABASE_URL` MongoDB connection string
- `PORT` API port (default 3000)
- `JWT_SECRET` Secret for signing JWTs
- `DISCORD_TOKEN` Bot token

## Create API Key
```bash
node scripts/create-key.js "Owner Name"
```

Optional custom key:
```bash
node scripts/create-key.js "Owner Name" "custom_key"
```

## Full Example (Create Key → Add/Remove)

1. Create API key:
```bash
node scripts/create-key.js "SAF System"
```

2. Add license role:
```bash
curl -X POST "http://localhost:3000/v1/saf/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "add" }'
```

3. Remove license role:
```bash
curl -X POST "http://localhost:3000/v1/saf/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "remove" }'
```
