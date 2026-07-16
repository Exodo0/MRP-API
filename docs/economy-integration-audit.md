# Auditoría e integración económica

Este documento registra cambios locales. No contiene secretos ni confirma ninguna ejecución contra servicios reales.

## Build A — Base económica y autenticación

- Se hizo explícita y perezosa la conexión `webConn`; importar modelos ya no abre una conexión MongoDB.
- Se añadieron helpers monetarios en centavos, modelos compatibles `EconomyOperation` y `EconomyLedgerEntry`, adaptador legacy y servicio transaccional durable.
- `dashboardAuth` exige issuer, audience, subject, guild configurada y token de vida corta.
- La autenticación de administración de mercado ya no degrada silenciosamente a una API key cuando falta o falla el actor.
- Se creó `scripts/economy-preflight.js`, bloqueado por opt-in y estrictamente read-only. No fue ejecutado.
- Índices nuevos se declaran en schemas con `autoIndex: false`; deben verificarse y crearse manualmente antes de habilitar escrituras.

### Consumidores confirmados al iniciar la auditoría

| Proyecto | Flujo                      | Clasificación inicial                                            |
| -------- | -------------------------- | ---------------------------------------------------------------- |
| API      | dashboard tienda           | escritura económica insegura y conexión transaccional incorrecta |
| API      | dashboard lavado           | escritura económica insegura y conexión transaccional incorrecta |
| API      | SEMOVI/licencias           | escritura económica insegura y efecto Discord no durable         |
| API      | administración de catálogo | escritura administrativa con autorización degradable             |
| Web      | tienda                     | escritura económica directa                                      |
| Web      | lavado y deudas            | escritura económica directa sin ledger/idempotencia              |
| Web      | licencias y matrícula      | escritura económica directa                                      |
| Web      | divisas                    | escritura económica directa sin transacción completa             |

### Pruebas y validaciones

- `node test/economyFoundation.test.js`: 5/5 casos aprobados.
- `node --test`: 2/2 archivos de prueba aprobados, 0 fallos.
- ESLint sobre archivos de Build A: aprobado, 0 errores.
- Prettier check sobre archivos de Build A: aprobado.
- `git diff --check`: aprobado.
- Búsqueda estática: los escritores inseguros restantes están identificados en controladores legacy y se migrarán en Builds B–G.

### Riesgos y pasos manuales

- MongoDB debe ser replica set o mongos.
- Los índices únicos deben pasar el preflight de duplicados y crearse manualmente; la aplicación no ejecutará `syncIndexes()`.
- Builds B–G migrarán los consumidores enumerados. Hasta entonces siguen siendo flujos pendientes.

## Build B — Tienda, órdenes, stock e inventario

- Se añadió `StoreOrder` durable con claves únicas por orden e idempotencia, precios fijados en centavos, estado, inventario y efectos.
- La ruta legacy `POST /v1/dashboard/tienda/comprar` delega al mismo controlador que `POST /v1/dashboard/store/orders`; requiere `orderId` o `Idempotency-Key` estable.
- La compra usa el servicio económico y confirma débito, ledger, stock, inventario consolidado y orden dentro de una sola transacción.
- Stock finito usa condición `Stock >= cantidad`; inventario usa `Revision` compare-and-set y consolida entradas duplicables del mismo item.
- Los roles de item quedan como efectos durables posteriores al commit; un retry no repite cobro ni inventario.
- Items nuevos/editados conservan `Precio` legacy y añaden `PrecioCents`, `DiscountBasisPoints` y `MoneyVersion: 2`.

### Pruebas y validaciones

- `node test/storeOrderService.test.js`: 6/6 aprobadas.
- `node --test`: 13/13 aprobadas, 0 fallos.
- ESLint sobre archivos de Build B: aprobado, 0 errores.
- Prettier check sobre archivos de Build B: aprobado.
- `git diff --check`: aprobado.
- Búsqueda estática: no queda el escritor de tienda antiguo; la única coincidencia económica directa restante en `dashboardController` corresponde a lavado y se migra en Build E.

### Riesgos y pendientes

- Los índices declarados no se crean automáticamente; requieren preflight y alta manual.
- La web todavía llama a su escritor Mongo directo hasta completar Build C.

## Build D — Reembolsos

- Se añadió `StoreRefund` durable con índices únicos por refund e idempotencia.
- `POST /v1/store-admin/orders/:orderId/refunds` exige API key, CLI JWT y pertenencia actual al grupo `store_refund`; si el grupo no existe falla cerrado.
- Un reembolso parcial acredita las cuentas originales, reduce inventario, restaura stock finito, actualiza la orden y crea ledger inverso dentro de una transacción.
- La distribución acumulada evita perder o crear centavos al dividir una compra pagada desde varias cuentas.
- Solo se reembolsan órdenes `completed`; no se borra ni modifica el ledger original.

### Pruebas y validaciones

- `node test/storeRefundService.test.js`: 3/3 aprobadas.
- `node --test`: 16/16 aprobadas, 0 fallos.
- ESLint y Prettier check sobre Build D: aprobados.
- `git diff --check`: aprobado.
- Búsqueda estática: las escrituras de reembolso están confinadas a `storeRefundService`.

### Riesgos y pendientes

- El grupo `store_refund` debe configurarse manualmente antes de usar la ruta.
- Los índices de `storerefunds` requieren preflight y creación manual.

## Build E — Lavado, deudas y licencias

- Las rutas API de lavado, deuda y licencias delegan a `dashboardEconomyService` y exigen autorización de guild actual e idempotencia durable.
- Lavado calcula comisión 30/20/10 % directamente en centavos y registra el diferencial como sumidero.
- Pago de deuda debita las cuentas seleccionadas y reduce el pasivo con un ledger balanceado.
- Compra, renovación y cancelación de licencias usan catálogo servidor, transacción y ledger; la cancelación conserva el reembolso actual del 50 % redondeado hacia abajo.
- Las licencias restringidas fallan cerrado si el rol requerido no está configurado o no está presente en la membresía revalidada.
- El escritor legacy de lavado fue eliminado; `/economy/lavar` se conserva como alias seguro.

### Pruebas y validaciones

- `node --test`: 20/20 aprobadas al cierre funcional de E; la suite acumulada tras F aprobó 23/23.
- ESLint sobre controladores, servicios, rutas y pruebas de E: aprobado.
- Prettier check sobre archivos de E: aprobado tras corregir el formato del controlador.
- `git diff --check`: aprobado.
- El build estático de la web que consume estas rutas compiló 46 páginas con endpoints de prueba no accesibles.

## Build F — SEMOVI y matrículas personalizadas

- SEMOVI ya no acepta `price`, `costo`, vigencia ni número de licencia como autoridad del cliente. El catálogo `SEMOVI_LICENSE_CATALOG_JSON` fija precio, vigencia, modos y rol; si falta, la escritura falla cerrada.
- Las escrituras SEMOVI exigen API key, CLI JWT y el grupo actual `semovi_license`. El actor y guild proceden del servidor.
- Cobro, IVA (16 %), ingreso SEMOVI, deuda opcional, licencia y ledger confirman en una transacción. El efecto de rol se ejecuta después del commit con estado durable, lease e idempotencia.
- La ruta legacy `/v1/semovi/licenses` conserva su URL, pero delega al servicio seguro y ya no intenta rollback compensatorio después de Discord.
- El registro de vehículos se movió a `/v1/dashboard/vehiculos/register`. Para placas normales el servidor genera la matrícula; las personalizadas cuestan exactamente 5,000,000 centavos.
- Inventario, límite de registros, saldo, matrícula, ledger y vehículo se verifican/confirman en la misma transacción. El inventario usa `Revision` compare-and-set.

### Pruebas y validaciones

- `node --test test/semoviVehicleEconomy.test.js`: 3/3 aprobadas.
- `node --test`: 23/23 aprobadas, 0 fallos.
- ESLint y Prettier check sobre archivos de F: aprobados.
- Typecheck y suite web: aprobados (3/3).
- Build Next de producción sin servidor: aprobado, 46 páginas.
- `git diff --check`: aprobado en ambos proyectos.

### Riesgos y pasos manuales

- Configurar `SEMOVI_LICENSE_CATALOG_JSON`, `SEMOVI_ID`, `SAT_ID` y el grupo `semovi_license` antes de habilitar las escrituras.
- Ejecutar el preflight y crear manualmente los índices de operación/licencia/deuda/vehículo; no se ejecutó `syncIndexes()`.
- Los efectos `manual_review` requieren procedimiento administrativo; el retry normal solo retoma efectos `pending` o `failed`.

## Build G — Divisas

- Compra/venta de USD y BTC se ejecuta en `fxEconomyService`; la web ya no modifica `economyusers`.
- `FxQuote` fija de forma durable cotización, unidades, escala, valor MXN y expiración. Reutilizar el mismo ID con otro payload falla con conflicto.
- USD usa centavos de USD y BTC usa micro-BTC como unidades enteras. No se mezclan unidades de activos con centavos MXN.
- El MXN usa `EconomyOperation`/ledger: comprar es un sumidero explícito; vender es una fuente explícita. El saldo del activo y `FxControl` cambian dentro de la misma transacción.
- `EconomyAssetLedgerEntry` registra de forma inmutable saldos anterior/posterior en unidades del activo y referencia la cotización.
- Los límites diarios y cooldown usan `America/Mexico_City`; el estado nuevo conserva campos legacy en pesos y añade acumulados exactos en centavos.

### Pruebas y validaciones

- `node --test test/fxEconomyService.test.js`: 4/4 aprobadas.
- `node --test`: 27/27 aprobadas, 0 fallos.
- ESLint y Prettier focalizados: aprobados.
- Suite web: 3/3; TypeScript, ESLint focalizado, Prettier y `git diff --check`: aprobados.
- Build Next de producción sin servidor: aprobado, 46 páginas.

### Riesgos y pasos manuales

- Los índices de `fxquotes` y `economyassetledgerentries` deben pasar preflight y crearse manualmente.
- Los saldos legacy con precisión superior a 2 decimales USD o 6 BTC fallan cerrados y requieren revisión; no se ejecutó conversión.

## Build H — Auditoría final y frontera económica

### Arquitectura resultante

| Entrada                | Autoridad | Servicio/estado durable              | Escrituras confirmadas juntas                   |
| ---------------------- | --------- | ------------------------------------ | ----------------------------------------------- |
| Web tienda             | MRP-API   | `StoreOrder` + `EconomyOperation`    | saldo, ledger, stock, inventario, orden         |
| Refund staff           | MRP-API   | `StoreRefund` + `EconomyOperation`   | ledger inverso, saldo, inventario, stock, orden |
| Lavado/deuda/licencias | MRP-API   | `EconomyOperation`                   | cuentas, deuda/licencia y ledger                |
| SEMOVI                 | MRP-API   | `EconomyOperation` + `SemoviLicense` | cuentas gobierno, deuda/licencia y ledger       |
| Matrícula              | MRP-API   | `EconomyOperation`                   | cargo, inventario CAS, vehículo y ledger        |
| Divisas                | MRP-API   | `FxQuote` + `EconomyOperation`       | MXN, activo, límites y ambos ledgers            |

Los controladores solo validan/transfieren contexto. Las mutaciones económicas están en `src/services/*EconomyService.js`, `storeOrderService`, `storeRefundService` y `legacyEconomyAccountStore`.

### Idempotencia y reintentos

- El núcleo expone consulta durable por guild/clave. Antes de reconstruir un débito, lavado, deuda, licencias, SEMOVI, matrícula y FX consultan el resultado existente.
- Un resultado `committed` se devuelve sin leer saldo ya consumido ni repetir Mongo/Discord; `processing` y `manual_review` tienen respuestas diferenciadas.
- El payload se contrasta con actor, objetivo y metadata durable. La misma clave con otro item, placa, licencia, cuenta, activo o cantidad falla con conflicto.

### Escrituras restantes clasificadas

- `marketController`: administración de catálogo, no saldo; conserva precios legacy y centavos de servidor.
- `dashboardController.updateViviendaAlmacen`: almacenamiento de vivienda, no modifica inventario ni dinero. Sigue siendo una ruta legacy fuera de la frontera económica.
- Tickets, auth, permisos, records y webhooks escriben sus propios estados no económicos.
- No se encontró un escritor directo de `EconomyUser`, `StoreOrder`, `StoreRefund`, ledger o deuda en controladores activos fuera de los servicios autorizados.

### Preflight y operación

- `scripts/economy-preflight.js` ahora inspecciona soporte transaccional, duplicados e índices de operaciones, ledgers, órdenes, refunds, inventario, FX, SEMOVI, deuda y vehículos.
- El script sigue requiriendo `ALLOW_READONLY_ECONOMY_PREFLIGHT=1` y URI aislada explícita. No crea índices, no muta datos y no fue ejecutado.
- `.env.example` documenta el catálogo servidor SEMOVI sin valores secretos.

### Validaciones y límites conocidos

- Las pruebas estáticas verifican que controladores SEMOVI legacy no escriban economía, que rutas dashboard usen autorización económica y que preflight no contenga creación/sincronización de índices.
- ESLint focalizado sobre todos los archivos económicos modificados: aprobado. El lint completo del repositorio conserva 3 errores legacy fuera de alcance (`ChannelType`, `describeEvent`, argumento `encoding`).
- Las lecturas y pruebas usaron fakes; no se abrió ninguna conexión.
- Los índices, replica set y configuración de roles/cuentas siguen siendo requisitos manuales antes de producción.
- Validación final: ESLint focalizado y Prettier aprobaron; `node --test` aprobó 42/42; `git diff --check` aprobó.
- No existe script de build/typecheck en `MRP-API`; no se ejecutó `start` ni se importó el entrypoint para evitar cargar credenciales locales.
