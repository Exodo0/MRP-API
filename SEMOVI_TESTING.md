# Pruebas SEMOVI

Endpoints agregados para que el bot de SEMOVI consulte identidad civil, genere su propia imagen de licencia y emita licencias digitales con pago o deuda.

## Requisitos

Variables necesarias en `.env`:

```env
DATABASE_URL="mongodb+srv://..."
MONGO_URI_WEB="mongodb+srv://..."
MONGO_DB_WEB_NAME="MXRP"
GUILD_ID="1193021133981765632"
SEMOVI_ID="1273023106868445302"
SAT_ID="1318397611329454162"
DISCORD_TOKEN="your-discord-bot-token"
PORT=3000
```

También necesitas un API key activo en la colección `apikeys`.

```bash
pnpm start
```

Usa estos valores en los ejemplos:

```bash
export API_URL="https://api.egologic.cloud"
export API_KEY="TU_API_KEY"
export DISCORD_ID="123456789012345678"
```

## 1. Consultar Identidad Civil

```bash
curl "$API_URL/v1/semovi/identity/$DISCORD_ID" \
  -H "x-api-key: $API_KEY"
```

Respuesta esperada:

```json
{
  "discordId": "123456789012345678",
  "roblox": {
    "id": "987654321",
    "username": "RobloxUser",
    "verified": true
  },
  "identity": {
    "documentType": "ine",
    "nombres": "Juan",
    "apellidos": "Perez Hernandez",
    "nacionalidad": "MEXICANA",
    "curp": "PEHJ950515HDFRRN09"
  }
}
```

Notas:

- Si el usuario tiene INE, `nacionalidad` regresa `MEXICANA`.
- Si el usuario tiene pasaporte, `nacionalidad` sale de `Pasaporte.Pais`.
- `roblox.id` sale de `verificados`; si no hay verificación activa, puede venir `null`.

## 2. Emitir Licencia Gratis

```bash
curl -X POST "$API_URL/v1/semovi/digital-licenses" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$DISCORD_ID'",
    "type": "A",
    "price": 0,
    "paymentMode": "free",
    "expiresInDays": 365
  }'
```

## 3. Emitir Licencia Pagada

Este modo cobra en cascada: `Efectivo`, luego `CuentaCorriente`, luego `CuentaSalario`.

```bash
curl -X POST "$API_URL/v1/semovi/digital-licenses" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$DISCORD_ID'",
    "type": "A",
    "price": 5000,
    "paymentMode": "paid",
    "expiresInDays": 365
  }'
```

Efectos:

- Descuenta `price` al usuario.
- Suma 16% a la cuenta SAT.
- Suma 84% a la cuenta SEMOVI.
- Crea documento en `semovilicenses`.

## 4. Emitir Licencia Con Deuda

```bash
curl -X POST "$API_URL/v1/semovi/digital-licenses" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$DISCORD_ID'",
    "type": "A",
    "price": 5000,
    "paymentMode": "debt",
    "expiresInDays": 365
  }'
```

Efectos:

- No descuenta efectivo ni bancos al usuario.
- Incrementa `EconomyUser.Deuda` por `price`.
- Crea deuda detallada en `debts` con `Institution: "SEMOVI"`.
- Suma 16% a SAT y 84% a SEMOVI.
- Crea documento en `semovilicenses`.

## 5. Consultar Licencia Para Generar Imagen

```bash
curl "$API_URL/v1/semovi/digital-licenses/$DISCORD_ID" \
  -H "x-api-key: $API_KEY"
```

Respuesta esperada:

```json
{
  "discordId": "123456789012345678",
  "roblox": {
    "id": "987654321",
    "username": "RobloxUser",
    "verified": true
  },
  "identity": {
    "documentType": "ine",
    "nombres": "Juan",
    "apellidos": "Perez Hernandez",
    "nacionalidad": "MEXICANA",
    "curp": "PEHJ950515HDFRRN09"
  },
  "license": {
    "id": "665f...",
    "active": true,
    "type": "A",
    "number": "SEMOVI-A-20260603-123456",
    "issuedAt": "2026-06-03T00:00:00.000Z",
    "expiresAt": "2027-06-03T00:00:00.000Z",
    "price": 5000,
    "paymentStatus": "debt",
    "debtId": "665f..."
  }
}
```

El bot de SEMOVI debe usar esta respuesta para renderizar su plantilla. La API no genera imagen.

## Errores Comunes

- `401`: falta `x-api-key`.
- `403`: API key invalida o inactiva.
- `404 Identity document not found for user`: el usuario no tiene INE ni pasaporte en la DB de MXRP.
- `400 paid or debt licenses require price greater than 0`: `paymentMode` no coincide con `price`.
- `400 Insufficient funds across all valid accounts`: el usuario no tiene saldo suficiente para `paymentMode: "paid"`.
- `500 SEMOVI_ID or SAT_ID is not set`: faltan cuentas de gobierno en `.env`.
