/**
 * Transporte Escolar Sync (Apps Script)
 * WebApp endpoint: doPost(e)
 *
 * Seguridad (práctica):
 * - apiKey (Script Property API_KEY)
 * - whitelist de emails permitidos (ALLOWED_EMAILS)
 *
 * Requerido en Script Properties:
 * - API_KEY  : string (ej. LPSN-BUSES2026-KEY-001)
 * - SHEET_ID : ID del Google Sheet (entre /d/ y /edit)
 *
 * Payload JSON (POST): { action, apiKey, email, ... }
 */

// Digitadores permitidos (whitelist)
const ALLOWED_EMAILS = [
  "belenacuna@liceosannicolas.cl",
  "franciscopinto@liceosannicolas.cl",
  "echeverri@liceosannicolas.cl",
];

// Nombres de hojas core
const SHEETS = {
  ESTUDIANTES: "Estudiantes",
  BUSES: "Buses",
  ASIGNACIONES: "Asignaciones",
  ESPERA: "En_espera",
  ZONAS: "Zonas",
};

// Encabezados recomendados
const HEADERS = {
  // Estudiantes: (carga única)
  ESTUDIANTES: [
    "RUT",
    "NOMBRE",
    "CURSO",
    "DOMICILIO",
    "COMUNA",
    "CORREO",
    "ZONA",
  ],
  // Buses
  BUSES: [
    "BUS_ID",          // ej: 1, 2, A, B
    "NOMBRE",          // ej: BUS 1
    "RECORRIDO",       // texto
    "CAPACIDAD",       // número
    "ZONAS",           // lista separada por coma
    "ACTIVO",          // SI/NO
  ],
  // Asignaciones
  ASIGNACIONES: [
    "TS",
    "RUT",
    "NOMBRE",
    "CURSO",
    "CORREO",
    "DOMICILIO",
    "COMUNA",
    "ZONA",
    "BUS_ID",
    "BUS_NOMBRE",
    "RECORRIDO",
    "ESTADO",          // ASIGNADO / EN_ESPERA / REASIGNADO
    "DIGITADOR",
    "OBS",
  ],
  // En espera
  ESPERA: [
    "TS",
    "RUT",
    "NOMBRE",
    "CURSO",
    "CORREO",
    "DOMICILIO",
    "COMUNA",
    "ZONA",
    "MOTIVO",          // SIN_CUPO / SIN_BUS / OTRO
    "DIGITADOR",
    "OBS",
  ],
  // Hoja por Bus: BUS_<BUS_ID>
  BUS_SHEET: [
    "TS",
    "RUT",
    "NOMBRE",
    "CURSO",
    "CORREO",
    "ZONA",
    "RECORRIDO",
    "DIGITADOR",
    "ESTADO",
    "OBS",
  ],
  // Zonas (opcional)
  ZONAS: [
    "ZONA",
    "PATRONES",        // palabras clave separadas por coma
  ],
};

/**
 * Punto de entrada principal (POST)
 */
function doPost(e) {
  try {
    const body = safeParse_(e);
    const action = String(body.action || body.ACTION || "").trim();

    // Soportar variaciones de clave que podrían enviar distintas versiones del frontend
    const apiKeyRaw = (
      body.apiKey ?? body.apikey ?? body.API_KEY ?? body.api_key ?? body.key ?? ""
    );
    const apiKey = String(apiKeyRaw || "").trim();

    if (!checkApiKey_(apiKey)) return json_(false, null, "API key inválida.");

    // Acciones que requieren email autorizado
    const needsEmail = [
      "ping",
      "getStudent",
      "listBuses",
      "assignBus",
      "uploadStudents",
      "getBusDashboard",
      "getCursoDashboard",
      "exportXlsx",
      "getMeta",
    ];

    if (needsEmail.indexOf(action) !== -1) {
      const email = String(body.email || body.digitador || body.user || "").toLowerCase().trim();
      if (!email) return json_(false, null, "Email requerido.");
      if (ALLOWED_EMAILS.indexOf(email) === -1) return json_(false, null, "Correo no autorizado.");
    }

    ensureCoreSheets_();

    // Router
    if (action === "ping") return json_(true, { ts: new Date().toISOString() });
    if (action === "getMeta") return json_(true, getMeta_());
    if (action === "getStudent") return json_(true, getStudent_(body.rut));
    if (action === "listBuses") return json_(true, listBuses_());
    if (action === "assignBus") return assignBus_(body);
    if (action === "uploadStudents") return uploadStudents_(body.rows || []);
    if (action === "getBusDashboard") return json_(true, getBusDashboard_(String(body.busId || "")));
    if (action === "getCursoDashboard") return json_(true, getCursoDashboard_(String(body.curso || "")));

    return json_(false, null, "Acción no soportada: " + action);
  } catch (err) {
    return json_(false, null, "Error: " + (err && err.message ? err.message : String(err)));
  }
}

/**
 * Compatibilidad: algunos frontends prueban por GET\.
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: "GET OK. Use POST JSON.", ts: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================
//  Core / Seguridad
// =====================

function checkApiKey_(k) {
  const expected = String(PropertiesService.getScriptProperties().getProperty("API_KEY") || "").trim();
  const got = String(k || "").trim();
  return expected && got === expected;
}

function safeParse_(e) {
  const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
  try {
    return JSON.parse(raw);
  } catch (_err) {
    throw new Error("JSON inválido en body.");
  }
}

function json_(ok, data, errorMsg) {
  const payload = {
    ok: !!ok,
    data: data === undefined ? null : data,
    error: ok ? null : (errorMsg || "Error"),
  };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss_() {
  const id = String(PropertiesService.getScriptProperties().getProperty("SHEET_ID") || "").trim();
  if (!id) throw new Error("Falta Script Property SHEET_ID.");
  return SpreadsheetApp.openById(id);
}

function ensureCoreSheets_() {
  const ss = ss_();

  // Estudiantes
  ensureSheet_(ss, SHEETS.ESTUDIANTES, HEADERS.ESTUDIANTES);
  // Buses
  ensureSheet_(ss, SHEETS.BUSES, HEADERS.BUSES);
  // Asignaciones
  ensureSheet_(ss, SHEETS.ASIGNACIONES, HEADERS.ASIGNACIONES);
  // En espera
  ensureSheet_(ss, SHEETS.ESPERA, HEADERS.ESPERA);
  // Zonas (opcional)
  ensureSheet_(ss, SHEETS.ZONAS, HEADERS.ZONAS);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const lastCol = sh.getLastColumn();
  const firstRow = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  // Si está vacío, pone headers
  if (!firstRow || firstRow.filter(String).length === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, Math.min(headers.length, 12));
  }
  return sh;
}

function getMeta_() {
  return {
    sheetId: PropertiesService.getScriptProperties().getProperty("SHEET_ID") || null,
    version: "transportesync-v4-v5-backend",
    allowedEmails: ALLOWED_EMAILS,
    sheets: SHEETS,
    now: new Date().toISOString(),
  };
}

// =====================
//  Estudiantes
// =====================

function normalizeRut_(rut) {
  // Normaliza para búsqueda: elimina puntos/espacios, deja guión si existe
  let r = String(rut || "").toUpperCase().trim();
  r = r.replace(/\s+/g, "");
  r = r.replace(/\./g, "");
  return r;
}

function getStudent_(rut) {
  const ss = ss_();
  const sh = ss.getSheetByName(SHEETS.ESTUDIANTES);
  const r = normalizeRut_(rut);
  if (!r) return { found: false, reason: "RUT vacío" };

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { found: false, reason: "Hoja Estudiantes vacía" };

  const header = values[0].map(h => String(h).trim().toUpperCase());
  const idxRut = header.indexOf("RUT");
  if (idxRut === -1) return { found: false, reason: "No existe columna RUT" };

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rr = normalizeRut_(row[idxRut]);
    if (rr === r) {
      return {
        found: true,
        rowIndex: i + 1,
        student: rowToObj_(header, row),
      };
    }
  }

  return { found: false, reason: "No encontrado" };
}

function rowToObj_(header, row) {
  const o = {};
  for (let i = 0; i < header.length; i++) {
    const key = header[i];
    if (!key) continue;
    o[key] = row[i];
  }
  return o;
}

/**
 * Carga masiva de estudiantes (carga única por Admin).
 * Espera rows como array de objetos con claves compatibles:
 * { RUT, NOMBRE, CURSO, DOMICILIO, COMUNA, CORREO, ZONA }
 */
function uploadStudents_(rows) {
  const ss = ss_();
  const sh = ss.getSheetByName(SHEETS.ESTUDIANTES);

  if (!Array.isArray(rows) || rows.length === 0) {
    return json_(false, null, "No hay filas para cargar.");
  }

  // Limpia y reescribe todo (carga única)
  sh.clearContents();
  sh.getRange(1, 1, 1, HEADERS.ESTUDIANTES.length).setValues([HEADERS.ESTUDIANTES]);

  const out = rows.map(r => {
    const obj = r || {};
    return [
      normalizeRut_(obj.RUT || obj.rut),
      obj.NOMBRE || obj.nombre || "",
      obj.CURSO || obj.curso || "",
      obj.DOMICILIO || obj.domicilio || "",
      obj.COMUNA || obj.comuna || "",
      obj.CORREO || obj.correo || "",
      obj.ZONA || obj.zona || "",
    ];
  });

  sh.getRange(2, 1, out.length, HEADERS.ESTUDIANTES.length).setValues(out);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, Math.min(HEADERS.ESTUDIANTES.length, 12));

  return json_(true, { inserted: out.length });
}

// =====================
//  Buses
// =====================

function listBuses_() {
  const ss = ss_();
  const sh = ss.getSheetByName(SHEETS.BUSES);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const header = values[0].map(h => String(h).trim().toUpperCase());

  const idx = {
    BUS_ID: header.indexOf("BUS_ID"),
    NOMBRE: header.indexOf("NOMBRE"),
    RECORRIDO: header.indexOf("RECORRIDO"),
    CAPACIDAD: header.indexOf("CAPACIDAD"),
    ZONAS: header.indexOf("ZONAS"),
    ACTIVO: header.indexOf("ACTIVO"),
  };

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const busId = String(row[idx.BUS_ID] || "").trim();
    if (!busId) continue;
    const activo = String(row[idx.ACTIVO] || "SI").trim().toUpperCase();
    if (activo === "NO" || activo === "0" || activo === "FALSE") continue;

    out.push({
      busId,
      nombre: row[idx.NOMBRE] || ("BUS " + busId),
      recorrido: row[idx.RECORRIDO] || "",
      capacidad: Number(row[idx.CAPACIDAD] || 0) || 0,
      zonas: String(row[idx.ZONAS] || "").split(",").map(s => s.trim()).filter(Boolean),
    });
  }
  return out;
}

function getBusById_(busId) {
  const buses = listBuses_();
  const id = String(busId || "").trim();
  return buses.find(b => String(b.busId) === id) || null;
}

function busSheetName_(busId) {
  return "BUS_" + String(busId).trim();
}

function ensureBusSheet_(busId) {
  const ss = ss_();
  const name = busSheetName_(busId);
  return ensureSheet_(ss, name, HEADERS.BUS_SHEET);
}

function countAssignedInBus_(busId) {
  // Cuenta filas en BUS_<id> (excluye header)
  const ss = ss_();
  const sh = ss.getSheetByName(busSheetName_(busId));
  if (!sh) return 0;
  const last = sh.getLastRow();
  return Math.max(0, last - 1);
}

// =====================
//  Asignación con cupos
// =====================

/**
 * assignBus body:
 * {
 *  rut, busId, digitador, obs, email
 * }
 */
function assignBus_(body) {
  const rut = normalizeRut_(body.rut || body.RUT);
  const busId = String(body.busId || body.BUS_ID || "").trim();
  const digitador = String(body.digitador || body.email || "").toLowerCase().trim();
  const obs = String(body.obs || "");

  // Validación fuerte del digitador
  if (!digitador) return json_(false, null, "Digitador requerido.");
  if (ALLOWED_EMAILS.indexOf(digitador) === -1) return json_(false, null, "Digitador no autorizado.");

  if (!rut) return json_(false, null, "RUT requerido.");
  if (!busId) return json_(false, null, "Bus requerido.");

  const studentRes = getStudent_(rut);
  if (!studentRes.found) return json_(false, null, "Alumno no encontrado por RUT.");

  const bus = getBusById_(busId);
  if (!bus) return json_(false, null, "Bus no existe o no está activo.");

  // Control cupos
  if (bus.capacidad > 0) {
    ensureBusSheet_(busId);
    const used = countAssignedInBus_(busId);
    if (used >= bus.capacidad) {
      // En espera
      pushEspera_(studentRes.student, digitador, "SIN_CUPO", obs);
      return json_(true, {
        status: "EN_ESPERA",
        reason: "SIN_CUPO",
        busId,
        busNombre: bus.nombre,
        capacidad: bus.capacidad,
        ocupados: used,
      });
    }
  }

  // Si ya estaba asignado antes, marcamos REASIGNADO y registramos de nuevo
  // (simple: no borramos histórico)

  // Escribe en Asignaciones
  const s = studentRes.student;
  const now = new Date();

  pushAsignacion_(s, bus, digitador, "ASIGNADO", obs, now);
  pushBusSheet_(s, bus, digitador, "ASIGNADO", obs, now);

  return json_(true, {
    status: "ASIGNADO",
    busId: bus.busId,
    busNombre: bus.nombre,
    recorrido: bus.recorrido,
  });
}

function pushAsignacion_(studentObj, bus, digitador, estado, obs, now) {
  const ss = ss_();
  const sh = ss.getSheetByName(SHEETS.ASIGNACIONES);

  const row = [
    now.toISOString(),
    normalizeRut_(studentObj.RUT),
    studentObj.NOMBRE || "",
    studentObj.CURSO || "",
    studentObj.CORREO || "",
    studentObj.DOMICILIO || "",
    studentObj.COMUNA || "",
    studentObj.ZONA || "",
    bus.busId,
    bus.nombre,
    bus.recorrido,
    estado,
    digitador,
    obs,
  ];

  sh.appendRow(row);
}

function pushBusSheet_(studentObj, bus, digitador, estado, obs, now) {
  const sh = ensureBusSheet_(bus.busId);

  const row = [
    now.toISOString(),
    normalizeRut_(studentObj.RUT),
    studentObj.NOMBRE || "",
    studentObj.CURSO || "",
    studentObj.CORREO || "",
    studentObj.ZONA || "",
    bus.recorrido || "",
    digitador,
    estado,
    obs,
  ];

  sh.appendRow(row);
}

function pushEspera_(studentObj, digitador, motivo, obs) {
  const ss = ss_();
  const sh = ss.getSheetByName(SHEETS.ESPERA);
  const now = new Date();

  const row = [
    now.toISOString(),
    normalizeRut_(studentObj.RUT),
    studentObj.NOMBRE || "",
    studentObj.CURSO || "",
    studentObj.CORREO || "",
    studentObj.DOMICILIO || "",
    studentObj.COMUNA || "",
    studentObj.ZONA || "",
    motivo,
    digitador,
    obs,
  ];

  sh.appendRow(row);
}

// =====================
//  Dashboards
// =====================

function getBusDashboard_(busId) {
  const id = String(busId || "").trim();
  if (!id) throw new Error("busId requerido");

  const bus = getBusById_(id);
  if (!bus) return { busId: id, exists: false };

  ensureBusSheet_(id);
  const ss = ss_();
  const sh = ss.getSheetByName(busSheetName_(id));
  const values = sh.getDataRange().getValues();
  const header = values[0].map(h => String(h).trim().toUpperCase());

  const data = [];
  for (let i = 1; i < values.length; i++) {
    data.push(rowToObj_(header, values[i]));
  }

  const ocupados = Math.max(0, values.length - 1);
  return {
    exists: true,
    bus,
    ocupados,
    cupos: bus.capacidad,
    disponibles: bus.capacidad > 0 ? Math.max(0, bus.capacidad - ocupados) : null,
    rows: data,
  };
}

function getCursoDashboard_(curso) {
  const target = String(curso || "").trim().toUpperCase();
  if (!target) throw new Error("curso requerido");

  // Leemos Asignaciones y filtramos por curso (último estado por RUT)
  const ss = ss_();
  const sh = ss.getSheetByName(SHEETS.ASIGNACIONES);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { curso: target, rows: [] };

  const header = values[0].map(h => String(h).trim().toUpperCase());
  const idx = {
    TS: header.indexOf("TS"),
    RUT: header.indexOf("RUT"),
    CURSO: header.indexOf("CURSO"),
  };

  // Tomamos el último registro por RUT
  const lastByRut = new Map();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const c = String(row[idx.CURSO] || "").trim().toUpperCase();
    if (c !== target) continue;
    const r = normalizeRut_(row[idx.RUT]);
    if (!r) continue;

    // Compara timestamp
    const ts = new Date(String(row[idx.TS] || ""));
    const prev = lastByRut.get(r);
    if (!prev || ts > prev.ts) {
      lastByRut.set(r, { ts, obj: rowToObj_(header, row) });
    }
  }

  return {
    curso: target,
    count: lastByRut.size,
    rows: Array.from(lastByRut.values()).sort((a,b)=>a.ts-b.ts).map(x=>x.obj),
  };
}

// =====================
//  Utilidades / Setup
// =====================

/**
 * Ejecuta una sola vez para configurar Script Properties.
 * - Ajusta API_KEY y SHEET_ID según corresponda.
 */
function SETUP_KEYS_ONCE() {
  PropertiesService.getScriptProperties().setProperties(
    {
      API_KEY: "LPSN-BUSES2026-KEY-001",
      SHEET_ID: "1F_0K_CXoHOc_FWe-MYoeSXZGvaXFCwA-Ae1RmrC3PZI",
    },
    true
  );
  Logger.log("OK");
}

/**
 * (Opcional) Crea hojas core si no existen.
 */
function INIT_SHEETS() {
  ensureCoreSheets_();
  Logger.log("Sheets OK");
}
