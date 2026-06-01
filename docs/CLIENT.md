# MXRP API (Client Guide)

Base URL:
`https://YOUR_API_DOMAIN`

## Auth

All requests require your API key (provided separately).

Header:

- `x-api-key: <your_api_key>`

## Notes

- `userId` must be the Discord User ID (numeric string).
- Default rate limit: up to 60 requests per minute per IP.

## Licenses

Valid values for `license`:

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

**POST** `/v1/semovi/licenses`

Headers:

- `x-api-key: <your_api_key>`
- `Content-Type: application/json`

Body:

```json
{
  "userId": "123456789012345678",
  "license": "LicenciaA1",
  "action": "add",
  "costo": 500
}
```

_(Nota: `costo` es opcional y por defecto es 0. Si se proporciona un valor mayor a 0, se procesará el cobro automático de la cuenta del usuario, distribuyendo 16% al SAT y 84% a SEMOVI)._

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
curl -X POST "https://YOUR_API_DOMAIN/v1/semovi/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "add" }'
```

Remove role:

```bash
curl -X POST "https://YOUR_API_DOMAIN/v1/semovi/licenses" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "123456789012345678", "license": "LicenciaA1", "action": "remove" }'
```

### Node.js (fetch)

Add role:

```js
const res = await fetch("https://YOUR_API_DOMAIN/v1/semovi/licenses", {
  method: "POST",
  headers: {
    "x-api-key": "YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    userId: "123456789012345678",
    license: "LicenciaA1",
    action: "add",
    costo: 150,
  }),
});

const data = await res.json();
console.log(data);
```

Remove role:

```js
const res = await fetch("https://YOUR_API_DOMAIN/v1/semovi/licenses", {
  method: "POST",
  headers: {
    "x-api-key": "YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    userId: "123456789012345678",
    license: "LicenciaA1",
    action: "remove",
  }),
});

const data = await res.json();
console.log(data);
```

### Python (requests)

Add role:

```python
import requests

res = requests.post(
    "https://YOUR_API_DOMAIN/v1/semovi/licenses",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={"userId": "123456789012345678", "license": "LicenciaA1", "action": "add"},
)

print(res.status_code, res.json())
```

Remove role:

```python
import requests

res = requests.post(
    "https://YOUR_API_DOMAIN/v1/semovi/licenses",
    headers={"x-api-key": "YOUR_API_KEY"},
    json={"userId": "123456789012345678", "license": "LicenciaA1", "action": "remove"},
)

print(res.status_code, res.json())
```

---

## Market — Categorías & Items

Todos los endpoints de market requieren `x-api-key`.
Base: `https://YOUR_API_DOMAIN/v1/market`

---

### Categorías

#### GET `/v1/market/categorias`

Lista categorías del guild.

Query params opcionales:

- `activa=true|false` — filtrar por estado

Response `200`:

```json
[
  { "_id": "...", "Nombre": "Armas", "Emoji": "🔫", "Orden": 0, "Activa": true, ... }
]
```

---

#### POST `/v1/market/categorias`

Crea una nueva categoría.

Body:

```json
{
  "Nombre": "Armas",
  "Descripcion": "Armamento del mercado negro",
  "Emoji": "🔫",
  "Orden": 0
}
```

`Orden` es opcional (se pone al final si se omite).

Response `201`: el documento creado.

---

#### PUT `/v1/market/categorias/:id`

Actualiza campos de una categoría.

Body (mínimo 1 campo):

```json
{ "Nombre": "Armas Pesadas", "Emoji": "💣" }
```

---

#### PATCH `/v1/market/categorias/:id/toggle`

Activa / desactiva una categoría.

Response `200`: documento actualizado con el nuevo valor de `Activa`.

---

#### DELETE `/v1/market/categorias/:id`

Elimina la categoría **y todos sus items**.

Response `200`:

```json
{ "ok": true, "deletedItems": 4 }
```

---

#### POST `/v1/market/categorias/reorder`

Reordena categorías. Envía el array de IDs en el nuevo orden.

Body:

```json
["id1", "id2", "id3"]
```

---

### Items

#### GET `/v1/market/items`

Lista items del guild.

Query params opcionales:

- `categoriaId=<ObjectId>` — filtrar por categoría
- `activo=true|false` — filtrar por estado

---

#### POST `/v1/market/items`

Crea un nuevo item.

Body:

```json
{
  "CategoriaId": "<ObjectId de la categoria>",
  "Subcategoria": "Classic",
  "Nombre": "AK-47",
  "Descripcion": "Fusil de asalto",
  "Precio": 15000,
  "Descuento": 10,
  "Stock": -1,
  "LimitePorUsuario": 1,
  "RolId": null,
  "ImagenURL": "https://cdn.supabase.../ak47.webp"
}
```

- `Stock: -1` = infinito
- `Subcategoria`: opcional, permite sub-agrupar items dentro de una categoría (ej. `Classic`, `Deportivo`, `Offroad`)
- `Descuento`: 0–100 (porcentaje)
- `ImagenURL`: la URL pública de Supabase (la sube la app Electron antes de llamar este endpoint)

---

#### PUT `/v1/market/items/:id`

Actualiza campos de un item. Si cambia `CategoriaId`, se actualiza `CategoriaNombre` automáticamente.

---

#### PATCH `/v1/market/items/:id/toggle`

Activa / desactiva un item.

---

#### DELETE `/v1/market/items/:id`

Elimina un item.

Response `200`: `{ "ok": true }`
