const { createApp, computed, ref } = Vue;

const BASE_URL = "https://api.egologic.cloud";

createApp({
  setup() {
    const activeExample = ref("identity");
    const copied = ref("");

    const nav = [
      ["overview", "Resumen"],
      ["auth", "Autenticacion"],
      ["semovi", "SEMOVI"],
      ["schemas", "Responses"],
      ["examples", "Ejemplos"],
      ["errors", "Errores"],
      ["ops", "Operacion"],
    ];

    const endpoints = [
      {
        method: "GET",
        path: "/v1/semovi/identity/{userId}",
        title: "Consultar identidad civil",
        tag: "Nuevo",
        description:
          "Devuelve INE o Pasaporte, CURP, nombre, apellidos, nacionalidad y vinculacion Roblox.",
      },
      {
        method: "GET",
        path: "/v1/semovi/digital-licenses/{userId}",
        title: "Consultar licencia digital",
        tag: "Nuevo",
        description:
          "Devuelve identidad civil y la licencia activa para que el bot de SEMOVI genere la imagen.",
      },
      {
        method: "POST",
        path: "/v1/semovi/digital-licenses",
        title: "Emitir licencia digital",
        tag: "Nuevo",
        description:
          "Crea licencia gratis, pagada o con deuda. Guarda registro en semovilicenses.",
      },
      {
        method: "POST",
        path: "/v1/semovi/licenses",
        title: "Asignar o remover rol de licencia",
        tag: "Existente",
        description:
          "Endpoint existente. Mantiene roles de Discord y cobro automatizado por costo.",
      },
    ];

    const fields = [
      ["discordId", "string", "Discord user ID consultado."],
      ["roblox.id", "string | null", "Roblox ID desde verificados."],
      ["roblox.username", "string | null", "Username Roblox verificado o del documento."],
      ["identity.documentType", "ine | pasaporte", "Documento fuente usado."],
      ["identity.nombres", "string", "Nombre del personaje."],
      ["identity.apellidos", "string", "Apellidos del personaje."],
      ["identity.nacionalidad", "string | null", "MEXICANA para INE, Pais para pasaporte."],
      ["identity.curp", "string | null", "CURP guardada por el bot MXRP."],
      ["license.paymentStatus", "free | paid | debt", "Modo de pago de la licencia digital."],
      ["license.debtId", "string | null", "ID de deuda cuando paymentStatus es debt."],
    ];

    const examples = {
      identity: {
        label: "Identidad",
        language: "bash",
        code: `curl "${BASE_URL}/v1/semovi/identity/123456789012345678" \\
  -H "x-api-key: YOUR_API_KEY"`,
      },
      queryLicense: {
        label: "Consultar licencia",
        language: "bash",
        code: `curl "${BASE_URL}/v1/semovi/digital-licenses/123456789012345678" \\
  -H "x-api-key: YOUR_API_KEY"`,
      },
      issueDebt: {
        label: "Emitir con deuda",
        language: "bash",
        code: `curl -X POST "${BASE_URL}/v1/semovi/digital-licenses" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "123456789012345678",
    "type": "A",
    "price": 5000,
    "paymentMode": "debt",
    "expiresInDays": 365
  }'`,
      },
      issuePaid: {
        label: "Emitir pagada",
        language: "javascript",
        code: `const response = await fetch("${BASE_URL}/v1/semovi/digital-licenses", {
  method: "POST",
  headers: {
    "x-api-key": "YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    userId: "123456789012345678",
    type: "A",
    price: 5000,
    paymentMode: "paid",
    expiresInDays: 365
  })
});

const data = await response.json();`,
      },
      oldLicense: {
        label: "Rol existente",
        language: "bash",
        code: `curl -X POST "${BASE_URL}/v1/semovi/licenses" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "123456789012345678",
    "license": "LicenciaA1",
    "action": "add",
    "costo": 500
  }'`,
      },
    };

    const responseExample = `{
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
    "id": "665f00000000000000000000",
    "active": true,
    "type": "A",
    "number": "SEMOVI-A-20260603-123456",
    "issuedAt": "2026-06-03T00:00:00.000Z",
    "expiresAt": "2027-06-03T00:00:00.000Z",
    "price": 5000,
    "paymentStatus": "debt",
    "debtId": "665f00000000000000000001"
  }
}`;

    const currentExample = computed(() => examples[activeExample.value]);

    const copyText = async (key, text) => {
      try {
        await navigator.clipboard.writeText(text);
        copied.value = key;
        setTimeout(() => {
          if (copied.value === key) copied.value = "";
        }, 1400);
      } catch {
        copied.value = "";
      }
    };

    return {
      BASE_URL,
      activeExample,
      copied,
      copyText,
      currentExample,
      endpoints,
      examples,
      fields,
      nav,
      responseExample,
    };
  },
  template: `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">MX</div>
          <div>
            <h2 class="brand-title">MXRP API</h2>
            <p class="brand-url">{{ BASE_URL }}</p>
          </div>
        </div>

        <div class="sidebar-card">
          <span>Auth</span>
          <strong>x-api-key</strong>
        </div>

        <p class="nav-title">Documentacion</p>
        <a v-for="[id, label] in nav" :key="id" class="nav-link" :href="'#' + id">{{ label }}</a>

        <p class="nav-title">Recursos</p>
        <a class="nav-link" href="/health">Health check</a>
        <a class="nav-link" href="/webhook-logs.html">Webhook logs</a>
        <a class="nav-link" href="/docs/openapi.yaml">OpenAPI YAML</a>
      </aside>

      <main class="main">
        <div class="topbar">
          <div>
            <div class="topbar-title">MXRP Public API</div>
            <div class="topbar-subtitle">Referencia operativa para integraciones externas</div>
          </div>
          <div class="topbar-actions">
            <button class="button" @click="copyText('base-top', BASE_URL)">
              {{ copied === 'base-top' ? 'Copiado' : 'Copiar URL' }}
            </button>
            <a class="button primary" href="#examples">Ejemplos</a>
          </div>
        </div>

        <header class="hero" id="overview">
          <div class="hero-grid">
            <div class="hero-panel">
              <p class="eyebrow">API publica para integraciones MXRP</p>
              <h1>Contratos claros para bots, paneles y servicios externos.</h1>
              <p class="hero-copy">
                Documentacion de endpoints SEMOVI, autenticacion, responses y ejemplos listos para consumir desde produccion.
              </p>
              <div class="hero-actions">
                <a class="button primary" href="#semovi">Ver endpoints</a>
                <button class="button" @click="copyText('base', BASE_URL)">
                  {{ copied === 'base' ? 'Copiado' : 'Copiar Base URL' }}
                </button>
              </div>
            </div>

            <div class="quick-panel">
              <p class="quick-title">Rutas SEMOVI</p>
              <div class="quick-list">
                <div v-for="endpoint in endpoints" :key="'quick-' + endpoint.path" class="quick-item">
                  <span class="method quick-method" :class="{ post: endpoint.method === 'POST' }">{{ endpoint.method }}</span>
                  <code>{{ endpoint.path }}</code>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div class="content">
          <section class="section" id="auth">
            <div class="section-header">
              <h2>Autenticacion</h2>
              <p class="section-lead">
                Todas las rutas protegidas usan API key por header. No mandes la key en query params.
              </p>
            </div>
            <div class="section-body">
              <div class="stat-grid">
                <div class="stat">
                  <strong>Base URL</strong>
                  <span>{{ BASE_URL }}</span>
                </div>
                <div class="stat">
                  <strong>Header requerido</strong>
                  <span>x-api-key: YOUR_API_KEY</span>
                </div>
                <div class="stat">
                  <strong>Rate limit</strong>
                  <span>60 requests por minuto por IP bajo /v1</span>
                </div>
              </div>
            </div>
          </section>

          <section class="section" id="semovi">
            <div class="section-header">
              <h2>SEMOVI</h2>
              <p class="section-lead">
                Identidad civil, licencia digital y flujo economico quedan separados. El endpoint de roles existente se conserva sin cambios.
              </p>
            </div>
            <div class="section-body">
              <div class="endpoint-grid">
                <article v-for="endpoint in endpoints" :key="endpoint.path" class="endpoint">
                  <div class="endpoint-top">
                    <span class="method" :class="{ post: endpoint.method === 'POST' }">{{ endpoint.method }}</span>
                    <span class="badge">{{ endpoint.tag }}</span>
                  </div>
                  <h3>{{ endpoint.title }}</h3>
                  <code class="endpoint-path">{{ endpoint.path }}</code>
                  <p>{{ endpoint.description }}</p>
                </article>
              </div>
            </div>
          </section>

          <section class="section" id="schemas">
            <div class="section-header">
              <h2>Campos Principales</h2>
              <p class="section-lead">
                Campos que el bot de SEMOVI debe consumir para generar la plantilla de licencia.
              </p>
            </div>
            <div class="section-body">
              <table class="schema-table">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Tipo</th>
                    <th>Uso</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="[field, type, usage] in fields" :key="field">
                    <td><code class="inline-code">{{ field }}</code></td>
                    <td>{{ type }}</td>
                    <td>{{ usage }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="section" id="examples">
            <div class="section-header">
              <h2>Ejemplos</h2>
              <p class="section-lead">
                Selecciona una peticion. Todos los ejemplos usan la base URL de produccion.
              </p>
            </div>
            <div class="section-body">
              <div class="code-tabs">
                <button
                  v-for="(example, key) in examples"
                  :key="key"
                  class="tab"
                  :class="{ active: activeExample === key }"
                  @click="activeExample = key"
                >
                  {{ example.label }}
                </button>
              </div>
              <div class="code-shell">
                <div class="code-head">
                  <span>{{ currentExample.language }}</span>
                  <button class="copy" @click="copyText(activeExample, currentExample.code)">
                    {{ copied === activeExample ? 'Copiado' : 'Copiar' }}
                  </button>
                </div>
                <div class="code-block">
                  <pre><code>{{ currentExample.code }}</code></pre>
                </div>
              </div>

              <h3 class="response-title">Response de licencia digital</h3>
              <div class="code-shell">
                <div class="code-head">
                  <span>json</span>
                  <button class="copy" @click="copyText('response', responseExample)">
                    {{ copied === 'response' ? 'Copiado' : 'Copiar' }}
                  </button>
                </div>
                <div class="code-block">
                  <pre><code>{{ responseExample }}</code></pre>
                </div>
              </div>
            </div>
          </section>

          <section class="section" id="errors">
            <div class="section-header">
              <h2>Errores</h2>
            </div>
            <div class="section-body">
              <div class="status-list">
                <div class="status-item"><span class="status-code">400</span><span>Payload invalido, modo de pago incorrecto o fondos insuficientes.</span></div>
                <div class="status-item"><span class="status-code">401</span><span>Falta el header <code class="inline-code">x-api-key</code>.</span></div>
                <div class="status-item"><span class="status-code">403</span><span>API key invalida o inactiva.</span></div>
                <div class="status-item"><span class="status-code">404</span><span>Usuario sin INE/Pasaporte, sin economia para pago directo, o recurso inexistente.</span></div>
                <div class="status-item"><span class="status-code">500</span><span>Error interno, configuracion faltante o fallo de Discord/MongoDB.</span></div>
              </div>
            </div>
          </section>

          <section class="section" id="ops">
            <div class="section-header">
              <h2>Operacion</h2>
            </div>
            <div class="section-body">
              <div class="endpoint-grid">
                <div class="note">
                  <h3>Imagen de licencia</h3>
                  <p>La API no genera imagen. El bot de SEMOVI debe renderizar su plantilla usando la respuesta JSON.</p>
                </div>
                <div class="note">
                  <h3>Deuda</h3>
                  <p><code class="inline-code">paymentMode: debt</code> incrementa <code class="inline-code">EconomyUser.Deuda</code> y crea registro detallado en <code class="inline-code">debts</code>.</p>
                </div>
                <div class="note">
                  <h3>Ingresos</h3>
                  <p>Los pagos y deudas distribuyen 16% a SAT y 84% a SEMOVI usando las cuentas configuradas en variables de entorno.</p>
                </div>
                <div class="note">
                  <h3>Compatibilidad</h3>
                  <p><code class="inline-code">POST /v1/semovi/licenses</code> sigue funcionando igual para roles de Discord.</p>
                </div>
              </div>
              <div class="badge-row">
                <span class="badge">Node.js</span>
                <span class="badge">Express</span>
                <span class="badge">Mongoose</span>
                <span class="badge">Vue</span>
                <span class="badge">x-api-key</span>
              </div>
            </div>
          </section>
        </div>

        <footer class="footer">
          MXRP API Docs. Produccion: {{ BASE_URL }}
        </footer>
      </main>
    </div>
  `,
}).mount("#app");
