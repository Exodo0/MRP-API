# MXRP API Docs

## Base URL
`http://localhost:3000`

## Auth
All protected routes require `x-api-key`.

## Licenses
These are the valid values for `license` (from `src/config.js`):
- `SEPARADOR`
- `LicenciaA0`
- `LicenciaA1`
- `LicenciaA2`
- `LicenciaB1`
- `LicenciaC1`
- `LicenciaC2`
- `LicenciaE1`
- `Licencia4x4`

## Update License Role
**POST** `/v1/saf/licenses`

Headers:
- `x-api-key: <your_api_key>`
- `Content-Type: application/json`

Body:
```json
{
  "userId": "123456789012345678",
  "license": "LicenciaA1",
  "action": "add"
}
```

Rules:
- `license` must be one of the values listed above.
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

## Examples

### curl
Add role:
```bash
curl -X POST "http://localhost:3000/v1/saf/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "add" }'
```

Remove role:
```bash
curl -X POST "http://localhost:3000/v1/saf/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "remove" }'
```

### Node.js (fetch)
Add role:
```js
const res = await fetch("http://localhost:3000/v1/saf/licenses", {
  method: "POST",
  headers: {
    "x-api-key": "YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    userId: "123456789012345678",
    license: "LicenciaA1",
    action: "add"
  })
});

const data = await res.json();
console.log(data);
```

Remove role:
```js
const res = await fetch("http://localhost:3000/v1/saf/licenses", {
  method: "POST",
  headers: {
    "x-api-key": "YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    userId: "123456789012345678",
    license: "LicenciaA1",
    action: "remove"
  })
});

const data = await res.json();
console.log(data);
```

### Python (requests)
Add role:
```python
import requests

res = requests.post(
    "http://localhost:3000/v1/saf/licenses",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={"userId": "123456789012345678", "license": "LicenciaA1", "action": "add"},
)

print(res.status_code, res.json())
```

Remove role:
```python
import requests

res = requests.post(
    "http://localhost:3000/v1/saf/licenses",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={"userId": "123456789012345678", "license": "LicenciaA1", "action": "remove"},
)

print(res.status_code, res.json())
```

## Setup
Required env vars:
- `DATABASE_URL` MongoDB connection string
- `PORT` API port (default 3000)
- `DISCORD_TOKEN` Bot token

## Create API Key
```bash
node scripts/create-key.js "Owner Name"
```

Optional custom key:
```bash
node scripts/create-key.js "Owner Name" "custom_key"
```

## Create API Key (Manual)
You can also create keys directly in MongoDB (collection: `apikeys`):
```javascript
db.apikeys.insertOne({
  key: "YOUR_API_KEY",
  owner: "Owner Name",
  isActive: true,
  createdAt: new Date()
});
```
