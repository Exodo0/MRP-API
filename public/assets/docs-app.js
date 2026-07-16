const { createApp, ref, computed } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

const BASE_URL = "https://api.egologic.cloud";

// ── Shared state ─────────────────────────────────────────────────────────────

const copied = ref('');
const copyText = async (key, text) => {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = key;
    setTimeout(() => { if (copied.value === key) copied.value = ''; }, 1400);
  } catch { copied.value = ''; }
};

// ── Home Page ────────────────────────────────────────────────────────────────

const HomePage = {
  template: `
    <div>
      <header class="hero" id="overview">
        <div class="hero-grid">
          <div class="hero-panel">
            <p class="eyebrow">API REST</p>
            <h1>MXRP API</h1>
            <p class="hero-copy">Endpoints para SEMOVI, Records y integraciones externas.</p>
            <div class="hero-actions">
              <router-link class="button primary" to="/semovi">SEMOVI</router-link>
              <router-link class="button" to="/records">Records</router-link>
              <router-link class="button" to="/examples">Ejemplos</router-link>
            </div>
          </div>
          <div class="quick-panel">
            <p class="quick-title">Endpoints</p>
            <div class="quick-list">
              <router-link to="/semovi" class="quick-item">
                <span class="method quick-method">GET</span>
                <code>/v1/semovi/identity/{userId}</code>
              </router-link>
              <router-link to="/records" class="quick-item">
                <span class="method quick-method">GET</span>
                <code>/v1/records/{userId}</code>
              </router-link>
            </div>
          </div>
        </div>
      </header>
      <section class="section" id="auth">
        <div class="section-header">
          <h2>Autenticacion</h2>
          <p class="section-lead">Rutas protegidas usan API key por header.</p>
        </div>
        <div class="section-body">
          <div class="stat-grid">
            <div class="stat"><strong>Base URL</strong><span>https://api.egologic.cloud</span></div>
            <div class="stat"><strong>Header</strong><span>x-api-key: YOUR_API_KEY</span></div>
            <div class="stat"><strong>Rate limit</strong><span>60 req/min por IP</span></div>
          </div>
        </div>
      </section>
    </div>
  `
};

// ── SEMOVI Page ──────────────────────────────────────────────────────────────

const SemoviPage = {
  setup() {
    const endpoints = [
      { method: 'GET', path: '/v1/semovi/identity/{userId}', title: 'Identidad civil', description: 'Devuelve INE o Pasaporte, CURP, nombre, apellidos, nacionalidad y vinculacion Roblox.' },
      { method: 'GET', path: '/v1/semovi/digital-licenses/{userId}', title: 'Licencia digital', description: 'Devuelve identidad civil y licencia activa.' },
      { method: 'POST', path: '/v1/semovi/digital-licenses', title: 'Emitir licencia', description: 'Crea licencia gratis, pagada o con deuda.' },
      { method: 'POST', path: '/v1/semovi/licenses', title: 'Rol de licencia', description: 'Asigna o remueve rol de Discord y gestiona cobro.' },
    ];

    const identityResp = '{\n  "discordId": "123456789012345678",\n  "roblox": {\n    "id": "987654321",\n    "username": "RobloxUser",\n    "verified": true\n  },\n  "identity": {\n    "documentType": "ine",\n    "nombres": "Juan",\n    "apellidos": "Perez Hernandez",\n    "nacionalidad": "MEXICANA",\n    "curp": "PEHJ950515HDFRRN09"\n  }\n}';

    const licenseResp = '{\n  "discordId": "123456789012345678",\n  "roblox": { "id": "987654321", "username": "RobloxUser", "verified": true },\n  "identity": { "documentType": "ine", "nombres": "Juan", "apellidos": "Perez Hernandez", "nacionalidad": "MEXICANA", "curp": "PEHJ950515HDFRRN09" },\n  "license": {\n    "id": "665f00000000000000000000",\n    "active": true,\n    "type": "B1",\n    "number": "SEMOVI-B1-20260708-004251",\n    "issuedAt": "2026-07-08T00:00:00.000Z",\n    "expiresAt": "2027-07-08T00:00:00.000Z",\n    "price": 5000,\n    "paymentStatus": "paid",\n    "debtId": null\n  }\n}';

    const curlIdentity = 'curl "' + BASE_URL + '/v1/semovi/identity/123456789012345678" \\\n  -H "x-api-key: YOUR_API_KEY"';
    const curlIssue = 'curl -X POST "' + BASE_URL + '/v1/semovi/digital-licenses" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"userId":"123456789012345678","type":"B1","price":5000,"paymentMode":"debt","expiresInDays":365}\'';
    const curlRole = 'curl -X POST "' + BASE_URL + '/v1/semovi/licenses" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"userId":"123456789012345678","license":"LicenciaB1","action":"add","costo":5000}\'';

    const licenseCategories = [
      ['LicenciaA0', 'A0', 'Motocicletas <125cc'],
      ['LicenciaA1', 'A1', 'Motocicletas'],
      ['LicenciaA2', 'A2', 'Motocicletas >400cc'],
      ['LicenciaB1', 'B1', 'Automoviles'],
      ['LicenciaC1', 'C1', 'Camionetas'],
      ['LicenciaC2', 'C2', 'Camiones'],
      ['LicenciaE1', 'E1', 'Autobuses'],
      ['Licencia4x4', '4x4', 'Todo terreno'],
    ];

    const paymentModes = [
      ['free', 'Gratis', 'Price debe ser 0. Sin cobro.'],
      ['paid', 'Pago directo', 'Descuenta de cuentas del jugador inmediatamente.'],
      ['debt', 'Deuda', 'Crea registro de deuda pendiente.'],
    ];

    return { copied, copyText, endpoints, identityResp, licenseResp, curlIdentity, curlIssue, curlRole, licenseCategories, paymentModes };
  },
  template: `
    <div>
      <header class="hero">
        <div class="hero-panel" style="max-width:100%">
          <p class="eyebrow">Secretaria de Movilidad</p>
          <h1>SEMOVI</h1>
          <p class="hero-copy">Identidad civil, licencias digitales y roles de Discord.</p>
          <div class="hero-actions">
            <a class="button primary" href="#endpoints">Endpoints</a>
            <a class="button" href="#flow">Flujo</a>
          </div>
        </div>
      </header>
      <div class="content">
        <section class="section" id="endpoints">
          <div class="section-header"><h2>Endpoints</h2><p class="section-lead">4 rutas para gestionar identidad y licencias.</p></div>
          <div class="section-body">
            <div class="endpoint-grid">
              <article v-for="ep in endpoints" :key="ep.path" class="endpoint">
                <div class="endpoint-top"><span class="method" :class="{post:ep.method==='POST'}">{{ep.method}}</span></div>
                <h3>{{ep.title}}</h3><code class="endpoint-path">{{ep.path}}</code><p>{{ep.description}}</p>
              </article>
            </div>
          </div>
        </section>
        <section class="section" id="identity">
          <div class="section-header"><h2>Identidad civil</h2><p class="section-lead">Consulta la identidad verificada de un jugador.</p></div>
          <div class="section-body">
            <div class="note"><h3>Que consulta</h3><p>Busca en 3 colecciones: Verificado (Discord-Roblox), INE (elector) y Pasaporte (extranjeros).</p></div>
            <div class="note"><h3>Prioridad</h3><p>INE tiene prioridad sobre Pasaporte. Sin ninguno retorna 404.</p></div>
            <h3 class="response-title">Ejemplo</h3>
            <div class="code-shell"><div class="code-head"><span>bash</span><button class="copy" @click="copyText('id-curl',curlIdentity)">{{copied==='id-curl'?'Copiado':'Copiar'}}</button></div><div class="code-block"><pre><code>{{curlIdentity}}</code></pre></div></div>
            <h3 class="response-title">Response</h3>
            <div class="code-shell"><div class="code-head"><span>json</span><button class="copy" @click="copyText('id-resp',identityResp)">{{copied==='id-resp'?'Copiado':'Copiar'}}</button></div><div class="code-block"><pre><code>{{identityResp}}</code></pre></div></div>
          </div>
        </section>
        <section class="section" id="digital-license">
          <div class="section-header"><h2>Licencia digital</h2><p class="section-lead">Identidad + licencia activa mas reciente.</p></div>
          <div class="section-body">
            <div class="note"><h3>Filtro</h3><p>Solo licencias con Active:true y ExpiresAt mayor a ahora.</p></div>
            <h3 class="response-title">Response</h3>
            <div class="code-shell"><div class="code-head"><span>json</span><button class="copy" @click="copyText('lic-resp',licenseResp)">{{copied==='lic-resp'?'Copiado':'Copiar'}}</button></div><div class="code-block"><pre><code>{{licenseResp}}</code></pre></div></div>
          </div>
        </section>
        <section class="section" id="flow">
          <div class="section-header"><h2>Flujo de licencias</h2><p class="section-lead">Proceso completo de emision.</p></div>
          <div class="section-body">
            <div class="flow-diagram">
              <div class="flow-step"><div class="flow-number">1</div><div class="flow-content"><h4>Validar identidad</h4><p>INE o Pasaporte registrado.</p></div></div>
              <div class="flow-arrow">&rarr;</div>
              <div class="flow-step"><div class="flow-number">2</div><div class="flow-content"><h4>Desactivar anteriores</h4><p>Licencias activas se desactivan.</p></div></div>
              <div class="flow-arrow">&rarr;</div>
              <div class="flow-step"><div class="flow-number">3</div><div class="flow-content"><h4>Procesar pago</h4><p>Cobro directo, deuda o gratis.</p></div></div>
              <div class="flow-arrow">&rarr;</div>
              <div class="flow-step"><div class="flow-number">4</div><div class="flow-content"><h4>Crear licencia</h4><p>Numero auto-generado en BD.</p></div></div>
            </div>
            <h3 class="response-title">Modos de pago</h3>
            <table class="schema-table"><thead><tr><th>Modo</th><th>Descripcion</th><th>Requisito</th></tr></thead><tbody>
              <tr v-for="r in paymentModes" :key="r[0]"><td><code class="inline-code">{{r[0]}}</code></td><td>{{r[1]}}</td><td>{{r[2]}}</td></tr>
            </tbody></table>
            <h3 class="response-title">Cascada de cobro</h3>
            <div class="note"><h3>Orden</h3><p>Efectivo &rarr; CuentaCorriente &rarr; CuentaSalario. Sin fondos = error 400.</p></div>
            <h3 class="response-title">Distribucion</h3>
            <div class="stat-grid"><div class="stat"><strong>16% SAT</strong><span>IVA.</span></div><div class="stat"><strong>84% SEMOVI</strong><span>Ingreso operativo.</span></div></div>
            <h3 class="response-title">Ejemplo</h3>
            <div class="code-shell"><div class="code-head"><span>bash</span><button class="copy" @click="copyText('issue',curlIssue)">{{copied==='issue'?'Copiado':'Copiar'}}</button></div><div class="code-block"><pre><code>{{curlIssue}}</code></pre></div></div>
          </div>
        </section>
        <section class="section" id="discord-roles">
          <div class="section-header"><h2>Roles de Discord</h2><p class="section-lead">Asignar/remover roles de categorias de licencia.</p></div>
          <div class="section-body">
            <h3 class="response-title">Categorias</h3>
            <table class="schema-table"><thead><tr><th>Key</th><th>Categoria</th><th>Tipo</th></tr></thead><tbody>
              <tr v-for="r in licenseCategories" :key="r[0]"><td><code class="inline-code">{{r[0]}}</code></td><td>{{r[1]}}</td><td>{{r[2]}}</td></tr>
            </tbody></table>
            <h3 class="response-title">Ejemplo</h3>
            <div class="code-shell"><div class="code-head"><span>bash</span><button class="copy" @click="copyText('role',curlRole)">{{copied==='role'?'Copiado':'Copiar'}}</button></div><div class="code-block"><pre><code>{{curlRole}}</code></pre></div></div>
            <div class="note"><h3>Rollback</h3><p>Si Discord falla despues del cobro, revierte todo automaticamente.</p></div>
          </div>
        </section>
      </div>
    </div>
  `
};

// ── Records Page ─────────────────────────────────────────────────────────────

const RecordsPage = {
  setup() {
    const endpoints = [
      { method: 'GET', path: '/v1/records/{userId}', title: 'Resumen completo', description: 'Contadores y ultimos 5 registros.' },
      { method: 'GET', path: '/v1/records/{userId}/multas', title: 'Multas', description: 'Multas con paginacion.' },
      { method: 'GET', path: '/v1/records/{userId}/arrestos', title: 'Arrestos', description: 'Arrestos con paginacion.' },
      { method: 'GET', path: '/v1/records/{userId}/antecedentes', title: 'Antecedentes', description: 'Antecedentes penales con paginacion.' },
    ];
    const params = [['page','integer','1','Pagina actual.'],['limit','integer','20','Registros por pagina (max 100).']];
    const summaryResp = '{\n  "userId": "123456789",\n  "guildId": "1193021133981765632",\n  "counts": { "multas": 12, "arrestos": 3, "antecedentes": 5 },\n  "recentMultas": [{"UserId":"123456789","Razon":"Exceso de velocidad","Cantidad":2000,"AplicadoPor":"987654321","FechaMulta":"2026-06-15T10:30:00.000Z"}],\n  "recentArrestos": [{"UserId":"123456789","ArrestadoPor":"987654321","Motivo":"Robo agravado","Estado":"sentenciado","FechaArresto":"2026-05-10T08:00:00.000Z"}],\n  "recentAntecedentes": [{"UserId":"123456789","Motivo":"Robo agravado","ArrestadoPor":"987654321","Duracion":1440,"Activo":true,"FechaArresto":"2026-05-10T08:00:00.000Z"}]\n}';
    const pagedResp = '{\n  "userId": "123456789",\n  "guildId": "1193021133981765632",\n  "multas": [{"UserId":"123456789","Razon":"Exceso de velocidad","Cantidad":2000,"AplicadoPor":"987654321","FechaMulta":"2026-06-15T10:30:00.000Z","createdAt":"2026-06-15T10:30:00.000Z","updatedAt":"2026-06-15T10:30:00.000Z"}],\n  "pagination": { "total": 12, "page": 1, "limit": 20, "totalPages": 1 }\n}';
    return { copied, copyText, endpoints, params, summaryResp, pagedResp };
  },
  template: `
    <div>
      <header class="hero">
        <div class="hero-panel" style="max-width:100%">
          <p class="eyebrow">Historial del jugador</p>
          <h1>Records</h1>
          <p class="hero-copy">Multas, arrestos y antecedentes. Requiere API key.</p>
          <div class="hero-actions"><a class="button primary" href="#endpoints">Endpoints</a><a class="button" href="#examples">Ejemplos</a></div>
        </div>
      </header>
      <div class="content">
        <section class="section" id="endpoints">
          <div class="section-header"><h2>Endpoints</h2><p class="section-lead">4 rutas para consultar historial.</p></div>
          <div class="section-body"><div class="endpoint-grid">
            <article v-for="ep in endpoints" :key="ep.path" class="endpoint">
              <div class="endpoint-top"><span class="method">{{ep.method}}</span><span class="badge badge-auth">API Key</span></div>
              <h3>{{ep.title}}</h3><code class="endpoint-path">{{ep.path}}</code><p>{{ep.description}}</p>
            </article>
          </div></div>
        </section>
        <section class="section" id="pagination">
          <div class="section-header"><h2>Paginacion</h2><p class="section-lead">Parametros de paginacion.</p></div>
          <div class="section-body"><table class="schema-table"><thead><tr><th>Param</th><th>Tipo</th><th>Default</th><th>Desc</th></tr></thead><tbody>
            <tr v-for="r in params" :key="r[0]"><td><code class="inline-code">{{r[0]}}</code></td><td>{{r[1]}}</td><td>{{r[2]}}</td><td>{{r[3]}}</td></tr>
          </tbody></table></div>
        </section>
        <section class="section" id="examples">
          <div class="section-header"><h2>Ejemplos</h2></div>
          <div class="section-body">
            <h3 class="response-title">Resumen</h3>
            <div class="code-shell"><div class="code-head"><span>GET /v1/records/:userId</span><button class="copy" @click="copyText('sum',summaryResp)">{{copied==='sum'?'Copiado':'Copiar'}}</button></div><div class="code-block"><pre><code>{{summaryResp}}</code></pre></div></div>
            <h3 class="response-title">Paginado</h3>
            <div class="code-shell"><div class="code-head"><span>GET /v1/records/:userId/multas</span><button class="copy" @click="copyText('pag',pagedResp)">{{copied==='pag'?'Copiado':'Copiar'}}</button></div><div class="code-block"><pre><code>{{pagedResp}}</code></pre></div></div>
          </div>
        </section>
      </div>
    </div>
  `
};

// ── Errors Page ──────────────────────────────────────────────────────────────

const ErrorsPage = {
  setup() {
    const errors = [
      ['400','Parametros invalidos, fondos insuficientes o modo de pago incorrecto.'],
      ['401','Falta header x-api-key en ruta protegida.'],
      ['403','API key invalida o inactiva.'],
      ['404','Recurso no encontrado.'],
      ['409','Conflicto: usuario o key ya existe.'],
      ['500','Error interno del servidor.'],
    ];
    return { errors };
  },
  template: `
    <div>
      <header class="hero"><div class="hero-panel" style="max-width:100%"><p class="eyebrow">Codigos de respuesta</p><h1>Errores</h1><p class="hero-copy">Codigos HTTP que retorna la API.</p></div></header>
      <div class="content"><section class="section"><div class="section-header"><h2>Estados HTTP</h2></div><div class="section-body"><div class="status-list">
        <div v-for="e in errors" :key="e[0]" class="status-item"><span class="status-code">{{e[0]}}</span><span>{{e[1]}}</span></div>
      </div></div></section></div>
    </div>
  `
};

// ── Examples Page ────────────────────────────────────────────────────────────

const ExamplesPage = {
  setup() {
    const activeTab = Vue.ref('identity');

    const examples = {
      identity: {
        label: 'Identidad',
        code: 'curl "' + BASE_URL + '/v1/semovi/identity/123456789012345678" \\\n  -H "x-api-key: YOUR_API_KEY"',
      },
      queryLicense: {
        label: 'Consultar licencia',
        code: 'curl "' + BASE_URL + '/v1/semovi/digital-licenses/123456789012345678" \\\n  -H "x-api-key: YOUR_API_KEY"',
      },
      issueDebt: {
        label: 'Emitir con deuda',
        code: 'curl -X POST "' + BASE_URL + '/v1/semovi/digital-licenses" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"userId":"123456789012345678","type":"B1","price":5000,"paymentMode":"debt","expiresInDays":365}\'',
      },
      issuePaid: {
        label: 'Emitir pagada',
        code: 'curl -X POST "' + BASE_URL + '/v1/semovi/digital-licenses" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"userId":"123456789012345678","type":"B1","price":5000,"paymentMode":"paid","expiresInDays":365}\'',
      },
      oldLicense: {
        label: 'Rol existente',
        code: 'curl -X POST "' + BASE_URL + '/v1/semovi/licenses" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"userId":"123456789012345678","license":"LicenciaB1","action":"add","costo":500}\'',
      },
      recordSummary: {
        label: 'Resumen records',
        code: 'curl "' + BASE_URL + '/v1/records/123456789012345678" \\\n  -H "x-api-key: YOUR_API_KEY"',
      },
      recordMultas: {
        label: 'Multas',
        code: 'curl "' + BASE_URL + '/v1/records/123456789012345678/multas?page=1&limit=10" \\\n  -H "x-api-key: YOUR_API_KEY"',
      },
      recordArrestos: {
        label: 'Arrestos',
        code: 'curl "' + BASE_URL + '/v1/records/123456789012345678/arrestos" \\\n  -H "x-api-key: YOUR_API_KEY"',
      },
    };

    const currentExample = Vue.computed(() => examples[activeTab.value]);

    return { copied, copyText, activeTab, examples, currentExample };
  },
  template: `
    <div>
      <header class="hero"><div class="hero-panel" style="max-width:100%"><p class="eyebrow">Pruebas rapidas</p><h1>Ejemplos</h1><p class="hero-copy">Copia y pega directo en tu terminal o Postman.</p></div></header>
      <div class="content">
        <section class="section">
          <div class="section-header"><h2>Peticiones</h2><p class="section-lead">Selecciona un ejemplo. Todos usan la base URL de produccion.</p></div>
          <div class="section-body">
            <div class="code-tabs">
              <button v-for="(ex, key) in examples" :key="key" class="tab" :class="{active:activeTab===key}" @click="activeTab=key">{{ex.label}}</button>
            </div>
            <div class="code-shell">
              <div class="code-head"><span>bash</span><button class="copy" @click="copyText('ex-'+activeTab, currentExample.code)">{{copied==='ex-'+activeTab?'Copiado':'Copiar'}}</button></div>
              <div class="code-block"><pre><code>{{currentExample.code}}</code></pre></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `
};

// ── Router ───────────────────────────────────────────────────────────────────

const routes = [
  { path: '/', component: HomePage },
  { path: '/semovi', component: SemoviPage },
  { path: '/records', component: RecordsPage },
  { path: '/examples', component: ExamplesPage },
  { path: '/errors', component: ErrorsPage },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});

// ── App ──────────────────────────────────────────────────────────────────────

const App = {
  setup() {
    const nav = [
      { path: '/', label: 'General' },
      { path: '/semovi', label: 'SEMOVI' },
      { path: '/records', label: 'Records' },
      { path: '/examples', label: 'Ejemplos' },
      { path: '/errors', label: 'Errores' },
    ];
    return { BASE_URL, nav };
  },
  template: `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="mark">MX</div><div><h2 class="brand-title">MXRP API</h2><p class="brand-url">{{BASE_URL}}</p></div></div>
        <div class="sidebar-card"><span>Auth</span><strong>x-api-key</strong></div>
        <p class="nav-title">Documentacion</p>
        <router-link v-for="item in nav" :key="item.path" :to="item.path" class="nav-link">{{item.label}}</router-link>
        <p class="nav-title">Recursos</p>
        <a class="nav-link" href="/health">Health check</a>
        <a class="nav-link" href="/docs/openapi.yaml">OpenAPI YAML</a>
      </aside>
      <main class="main">
        <div class="topbar"><div><div class="topbar-title">MXRP API</div><div class="topbar-subtitle">v3.0.0</div></div><div class="topbar-actions"><a class="button" href="/health">Health</a></div></div>
        <router-view></router-view>
        <footer class="footer">MXRP API v3.0.0</footer>
      </main>
    </div>
  `
};

const app = createApp(App);
app.use(router);
app.mount('#app');
