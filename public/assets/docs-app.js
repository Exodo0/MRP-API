const { createApp, computed, ref } = Vue;

const BASE_URL = "https://api.egologic.cloud";

createApp({
  setup() {
    const activeTab = ref("semovi");
    const activeRecordTab = ref("summary");
    const copied = ref("");

    const nav = [
      ["overview", "General"],
      ["auth", "Autenticacion"],
      ["semovi", "SEMOVI"],
      ["records", "Records"],
      ["errors", "Errores"],
    ];

    const semoviEndpoints = [
      {
        method: "GET",
        path: "/v1/semovi/identity/{userId}",
        title: "Identidad civil",
        description: "Devuelve INE o Pasaporte, CURP, nombre, apellidos, nacionalidad y vinculacion Roblox.",
      },
      {
        method: "GET",
        path: "/v1/semovi/digital-licenses/{userId}",
        title: "Licencia digital",
        description: "Devuelve identidad civil y licencia activa.",
      },
      {
        method: "POST",
        path: "/v1/semovi/digital-licenses",
        title: "Emitir licencia",
        description: "Crea licencia gratis, pagada o con deuda.",
      },
      {
        method: "POST",
        path: "/v1/semovi/licenses",
        title: "Rol de licencia",
        description: "Asigna o remueve rol de Discord y gestiona cobro.",
      },
    ];

    const recordEndpoints = [
      {
        method: "GET",
        path: "/v1/records/{userId}",
        title: "Resumen completo",
        description: "Contadores y ultimos 5 registros de multas, arrestos y antecedentes.",
        auth: true,
      },
      {
        method: "GET",
        path: "/v1/records/{userId}/multas",
        title: "Multas",
        description: "Multas de un usuario con paginacion.",
        auth: true,
      },
      {
        method: "GET",
        path: "/v1/records/{userId}/arrestos",
        title: "Arrestos",
        description: "Arrestos de un usuario con paginacion.",
        auth: true,
      },
      {
        method: "GET",
        path: "/v1/records/{userId}/antecedentes",
        title: "Antecedentes",
        description: "Antecedentes penales con paginacion.",
        auth: true,
      },
    ];

    const recordParams = [
      ["page", "integer", "1", "Pagina actual."],
      ["limit", "integer", "20", "Registros por pagina (max 100)."],
    ];

    const recordSummaryResponse = `{
  "userId": "123456789",
  "guildId": "1193021133981765632",
  "counts": {
    "multas": 12,
    "arrestos": 3,
    "antecedentes": 5
  },
  "recentMultas": [
    {
      "UserId": "123456789",
      "Razon": "Exceso de velocidad",
      "Cantidad": 2000,
      "AplicadoPor": "987654321",
      "FechaMulta": "2026-06-15T10:30:00.000Z"
    }
  ],
  "recentArrestos": [
    {
      "UserId": "123456789",
      "ArrestadoPor": "987654321",
      "Motivo": "Robo agravado",
      "Estado": "sentenciado",
      "FechaArresto": "2026-05-10T08:00:00.000Z"
    }
  ],
  "recentAntecedentes": [
    {
      "UserId": "123456789",
      "Motivo": "Robo agravado",
      "ArrestadoPor": "987654321",
      "Duracion": 1440,
      "Activo": true,
      "FechaArresto": "2026-05-10T08:00:00.000Z"
    }
  ]
}`;

    const recordPaginatedResponse = `{
  "userId": "123456789",
  "guildId": "1193021133981765632",
  "multas": [
    {
      "UserId": "123456789",
      "Razon": "Exceso de velocidad",
      "Cantidad": 2000,
      "AplicadoPor": "987654321",
      "FechaMulta": "2026-06-15T10:30:00.000Z",
      "createdAt": "2026-06-15T10:30:00.000Z",
      "updatedAt": "2026-06-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}`;

    const examples = {
      summary: {
        label: "Resumen",
        language: "bash",
        code: `curl "${BASE_URL}/v1/records/123456789012345678" \\
  -H "x-api-key: YOUR_API_KEY"`,
      },
      multas: {
        label: "Multas",
        language: "bash",
        code: `curl "${BASE_URL}/v1/records/123456789012345678/multas?page=1&limit=10" \\
  -H "x-api-key: YOUR_API_KEY"`,
      },
      arrestos: {
        label: "Arrestos",
        language: "bash",
        code: `curl "${BASE_URL}/v1/records/123456789012345678/arrestos" \\
  -H "x-api-key: YOUR_API_KEY"`,
      },
      antecedentes: {
        label: "Antecedentes",
        language: "bash",
        code: `curl "${BASE_URL}/v1/records/123456789012345678/antecedentes?page=1&limit=5" \\
  -H "x-api-key: YOUR_API_KEY"`,
      },
      identity: {
        label: "Identidad",
        language: "bash",
        code: `curl "${BASE_URL}/v1/semovi/identity/123456789012345678" \\
  -H "x-api-key: YOUR_API_KEY"`,
      },
      license: {
        label: "Emitir licencia",
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
    };

    const currentExample = computed(() => examples[activeTab.value] || examples.summary);

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
      activeTab,
      activeRecordTab,
      copied,
      copyText,
      currentExample,
      nav,
      semoviEndpoints,
      recordEndpoints,
      recordParams,
      recordSummaryResponse,
      recordPaginatedResponse,
      examples,
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
        <a class="nav-link" href="/docs/openapi.yaml">OpenAPI YAML</a>
      </aside>

      <main class="main">
        <div class="topbar">
          <div>
            <div class="topbar-title">MXRP API</div>
            <div class="topbar-subtitle">v3.0.0</div>
          </div>
          <div class="topbar-actions">
            <button class="button" @click="copyText('base', BASE_URL)">
              {{ copied === 'base' ? 'Copiado' : 'Copiar URL' }}
            </button>
          </div>
        </div>

        <header class="hero" id="overview">
          <div class="hero-grid">
            <div class="hero-panel">
              <p class="eyebrow">API REST</p>
              <h1>MXRP API</h1>
              <p class="hero-copy">
                Endpoints para SEMOVI, Records y integraciones externas.
              </p>
              <div class="hero-actions">
                <a class="button primary" href="#semovi">SEMOVI</a>
                <a class="button" href="#records">Records</a>
              </div>
            </div>

            <div class="quick-panel">
              <p class="quick-title">Endpoints</p>
              <div class="quick-list">
                <div v-for="ep in semoviEndpoints.slice(0, 2)" :key="'q-' + ep.path" class="quick-item">
                  <span class="method quick-method" :class="{ post: ep.method === 'POST' }">{{ ep.method }}</span>
                  <code>{{ ep.path }}</code>
                </div>
                <div v-for="ep in recordEndpoints.slice(0, 2)" :key="'q-' + ep.path" class="quick-item">
                  <span class="method quick-method">{{ ep.method }}</span>
                  <code>{{ ep.path }}</code>
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
                Rutas protegidas usan API key por header. Rutas publicas no requieren auth.
              </p>
            </div>
            <div class="section-body">
              <div class="stat-grid">
                <div class="stat">
                  <strong>Base URL</strong>
                  <span>{{ BASE_URL }}</span>
                </div>
                <div class="stat">
                  <strong>Header</strong>
                  <span>x-api-key: YOUR_API_KEY</span>
                </div>
                <div class="stat">
                  <strong>Rate limit</strong>
                  <span>60 req/min por IP</span>
                </div>
              </div>
            </div>
          </section>

          <section class="section" id="semovi">
            <div class="section-header">
              <h2>SEMOVI</h2>
              <p class="section-lead">
                Identidad civil, licencias digitales y roles de Discord.
              </p>
            </div>
            <div class="section-body">
              <div class="endpoint-grid">
                <article v-for="ep in semoviEndpoints" :key="ep.path" class="endpoint">
                  <div class="endpoint-top">
                    <span class="method" :class="{ post: ep.method === 'POST' }">{{ ep.method }}</span>
                  </div>
                  <h3>{{ ep.title }}</h3>
                  <code class="endpoint-path">{{ ep.path }}</code>
                  <p>{{ ep.description }}</p>
                </article>
              </div>
            </div>
          </section>

          <section class="section" id="records">
            <div class="section-header">
              <h2>Records</h2>
              <p class="section-lead">
                Multas, arrestos y antecedentes de usuarios. Requiere API key.
              </p>
            </div>
            <div class="section-body">
              <div class="endpoint-grid">
                <article v-for="ep in recordEndpoints" :key="ep.path" class="endpoint">
                  <div class="endpoint-top">
                    <span class="method">{{ ep.method }}</span>
                    <span v-if="ep.auth" class="badge badge-auth">API Key</span>
                  </div>
                  <h3>{{ ep.title }}</h3>
                  <code class="endpoint-path">{{ ep.path }}</code>
                  <p>{{ ep.description }}</p>
                </article>
              </div>

              <h3 class="response-title">Parametros de paginacion</h3>
              <table class="schema-table">
                <thead>
                  <tr>
                    <th>Parametro</th>
                    <th>Tipo</th>
                    <th>Default</th>
                    <th>Descripcion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="[param, type, def, desc] in recordParams" :key="param">
                    <td><code class="inline-code">{{ param }}</code></td>
                    <td>{{ type }}</td>
                    <td>{{ def }}</td>
                    <td>{{ desc }}</td>
                  </tr>
                </tbody>
              </table>

              <h3 class="response-title">Respuesta - Resumen</h3>
              <div class="code-shell">
                <div class="code-head">
                  <span>GET /v1/records/:userId</span>
                  <button class="copy" @click="copyText('summary-resp', recordSummaryResponse)">
                    {{ copied === 'summary-resp' ? 'Copiado' : 'Copiar' }}
                  </button>
                </div>
                <div class="code-block">
                  <pre><code>{{ recordSummaryResponse }}</code></pre>
                </div>
              </div>

              <h3 class="response-title">Respuesta - Paginada</h3>
              <div class="code-shell">
                <div class="code-head">
                  <span>GET /v1/records/:userId/multas</span>
                  <button class="copy" @click="copyText('paged-resp', recordPaginatedResponse)">
                    {{ copied === 'paged-resp' ? 'Copiado' : 'Copiar' }}
                  </button>
                </div>
                <div class="code-block">
                  <pre><code>{{ recordPaginatedResponse }}</code></pre>
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
                <div class="status-item"><span class="status-code">400</span><span>Parametros invalidos o payload mal formado.</span></div>
                <div class="status-item"><span class="status-code">401</span><span>Falta header <code class="inline-code">x-api-key</code> en ruta protegida.</span></div>
                <div class="status-item"><span class="status-code">403</span><span>API key invalida o inactiva.</span></div>
                <div class="status-item"><span class="status-code">404</span><span>Recurso no encontrado.</span></div>
                <div class="status-item"><span class="status-code">500</span><span>Error interno del servidor.</span></div>
              </div>
            </div>
          </section>
        </div>

        <footer class="footer">
          MXRP API v3.0.0
        </footer>
      </main>
    </div>
  `,
}).mount("#app");
