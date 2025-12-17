
/**
 * LPSN Transporte Escolar 2026 - Sync Backend (Apps Script)
 * - Stores roster in Google Sheets
 * - Provides API endpoints for:
 *   ping, init, stats, importStudentsFromDrive, listBuses, listBusesWithLoad, upsertBus, deleteBus,
 *   getStudentByRut, assignBus, getBusDashboard, getCursoDashboard, exportCsv
 *
 * Security:
 * - simple API_KEY check via Script Properties
 */

const SHEETS = {
  STUDENTS: 'Estudiantes',
  BUSES: 'Buses',
  ASSIGN: 'Asignaciones',
  WAIT: 'En_espera'
};

function doPost(e){
  try{
    const body = e && e.postData && e.postData.contents ? e.postData.contents : '';
    const req = JSON.parse(body || '{}');
    const apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY') || '';
    if(apiKey && req.key !== apiKey) return out(false, null, 'API key inválida.');
    const action = req.action || '';
    const payload = req.payload || {};
    const data = route(action, payload);
    return out(true, data, null);
  }catch(err){
    return out(false, null, String(err && err.message ? err.message : err));
  }
}

function out(ok, data, error){
  return ContentService
    .createTextOutput(JSON.stringify({ ok: ok, data: data || null, error: error || null }))
    .setMimeType(ContentService.MimeType.JSON);
}

function route(action, p){
  switch(action){
    case 'ping': return { now: new Date().toISOString() };
    case 'init': return initSheets_();
    case 'stats': return stats_();
    case 'importStudentsFromDrive': return importStudentsFromDrive_(p.fileId, p.sheetName);
    case 'listBuses': return listBuses_();
    case 'listBusesWithLoad': return listBusesWithLoad_();
    case 'upsertBus': return upsertBus_(p);
    case 'deleteBus': return deleteBus_(p.id);
    case 'getStudentByRut': return getStudentByRut_(p.rut);
    case 'assignBus': return assignBus_(p.rut, p.busId, p.digitador);
    case 'getBusDashboard': return getBusDashboard_(p.busId);
    case 'getCursoDashboard': return getCursoDashboard_(p.curso);
    case 'exportCsv': return exportCsv_();
    default: throw new Error('Acción no soportada: ' + action);
  }
}

function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function getOrCreateSheet_(name, headers){
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
  }
  if(headers && headers.length){
    const first = sh.getRange(1,1,1,headers.length).getValues()[0];
    const empty = first.every(v => !v);
    if(empty){
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function initSheets_(){
  getOrCreateSheet_(SHEETS.STUDENTS, ['rut','nombre','curso','email','domicilio','comuna']);
  getOrCreateSheet_(SHEETS.BUSES, ['id','name','capacity','route']);
  getOrCreateSheet_(SHEETS.ASSIGN, ['rut','busId','route','status','digitador','updatedAt']);
  getOrCreateSheet_(SHEETS.WAIT, ['rut','busId','route','status','digitador','updatedAt','motivo']);
  return { ok:true };
}

function stats_(){
  initSheets_();
  const ss = ss_();
  const st = ss.getSheetByName(SHEETS.STUDENTS);
  const buses = ss.getSheetByName(SHEETS.BUSES);
  const asg = ss.getSheetByName(SHEETS.ASSIGN);
  const wait = ss.getSheetByName(SHEETS.WAIT);

  const students = Math.max(0, st.getLastRow()-1);
  const busesN = Math.max(0, buses.getLastRow()-1);

  const aVals = asg.getLastRow()>1 ? asg.getRange(2,1,asg.getLastRow()-1,6).getValues() : [];
  const assigned = aVals.filter(r=>String(r[3])==='ASIGNADO').length;

  const wVals = wait.getLastRow()>1 ? wait.getRange(2,1,wait.getLastRow()-1,7).getValues() : [];
  const waiting = wVals.filter(r=>String(r[3])==='EN_ESPERA').length;

  return { students, buses: busesN, assigned, waiting };
}

function normalizeRut_(rut){
  rut = String(rut||'').trim().toUpperCase();
  rut = rut.replace(/\./g,'').replace(/\s+/g,'');
  if(!rut) return '';
  if(rut.indexOf('-')<0 && rut.length>=2){
    rut = rut.substring(0, rut.length-1) + '-' + rut.substring(rut.length-1);
  }
  return rut;
}

function listBuses_(){
  initSheets_();
  const sh = ss_().getSheetByName(SHEETS.BUSES);
  const rows = sh.getLastRow()>1 ? sh.getRange(2,1,sh.getLastRow()-1,4).getValues() : [];
  const buses = rows.map(r=>({
    id: String(r[0]||'').trim(),
    name: String(r[1]||'').trim(),
    capacity: Number(r[2]||0),
    route: String(r[3]||'').trim()
  })).filter(b=>b.id);
  return { buses };
}

function listBusesWithLoad_(){
  const buses = listBuses_().buses;
  const asg = ss_().getSheetByName(SHEETS.ASSIGN);
  const rows = asg.getLastRow()>1 ? asg.getRange(2,1,asg.getLastRow()-1,6).getValues() : [];
  const counts = {};
  rows.forEach(r=>{
    const busId = String(r[1]||'').trim();
    const status = String(r[3]||'').trim();
    if(busId && status==='ASIGNADO'){
      counts[busId] = (counts[busId]||0) + 1;
    }
  });
  buses.forEach(b=> b.assigned = counts[b.id] || 0);
  return { buses };
}

function upsertBus_(b){
  initSheets_();
  const sh = ss_().getSheetByName(SHEETS.BUSES);
  const id = String(b.id||'').trim();
  if(!id) throw new Error('Falta id.');
  const name = String(b.name||('Bus '+id)).trim();
  const capacity = Number(b.capacity||0);
  const route = String(b.route||'').trim();

  const last = sh.getLastRow();
  const rows = last>1 ? sh.getRange(2,1,last-1,4).getValues() : [];
  let rowIdx = -1;
  for(let i=0;i<rows.length;i++){
    if(String(rows[i][0]).trim()===id){ rowIdx = i+2; break; }
  }
  if(rowIdx<0){
    sh.appendRow([id,name,capacity,route]);
  }else{
    sh.getRange(rowIdx,1,1,4).setValues([[id,name,capacity,route]]);
  }
  return { id };
}

function deleteBus_(id){
  initSheets_();
  id = String(id||'').trim();
  if(!id) throw new Error('Falta id.');
  const sh = ss_().getSheetByName(SHEETS.BUSES);
  const last = sh.getLastRow();
  if(last<=1) return { ok:true };
  const rows = sh.getRange(2,1,last-1,1).getValues();
  for(let i=0;i<rows.length;i++){
    if(String(rows[i][0]).trim()===id){
      sh.deleteRow(i+2);
      break;
    }
  }
  return { ok:true };
}

/**
 * Import students from an Excel file located in Drive.
 * Implementation:
 * - Copies file to a temporary Google Sheet via Drive API conversion
 * - Reads first sheet (or specified) into array
 * - Maps columns by header name heuristics
 * - Writes to Estudiantes (replaces content)
 *
 * Requires Advanced Drive Service enabled:
 * - Services > Advanced Google services > Drive API (on)
 * And in Google Cloud project: Drive API enabled.
 *
 * If not enabled, we throw a clear error.
 */
function importStudentsFromDrive_(fileId, sheetName){
  initSheets_();
  fileId = String(fileId||'').trim();
  if(!fileId) throw new Error('Falta fileId.');

  // Try use Drive Advanced Service
  if(typeof Drive === 'undefined' || !Drive.Files){
    throw new Error('Drive API no habilitada en Apps Script. Activa: Servicios avanzados → Drive API.');
  }

  const file = Drive.Files.get(fileId);
  const blob = DriveApp.getFileById(fileId).getBlob();
  const resource = { title: 'TMP_IMPORT_LPSN_BUSES_2026_' + new Date().getTime(), mimeType: MimeType.GOOGLE_SHEETS };

  // Insert with conversion
  const tmp = Drive.Files.insert(resource, blob, { convert: true });
  const tmpSs = SpreadsheetApp.openById(tmp.id);

  const sh = sheetName ? tmpSs.getSheetByName(sheetName) : tmpSs.getSheets()[0];
  if(!sh) throw new Error('No se encontró la hoja indicada.');
  const values = sh.getDataRange().getValues();
  if(values.length < 2) throw new Error('La hoja importada no contiene datos.');

  const headers = values[0].map(h=>String(h||'').trim().toLowerCase());
  const rows = values.slice(1);

  function findCol(cands){
    for(let i=0;i<headers.length;i++){
      const h = headers[i];
      for(const c of cands){
        if(h === c) return i;
        if(h.includes(c)) return i;
      }
    }
    return awarenessFallback_(cands);
  }
  // fallback: if no header match, try exact known positions? keep -1
  function awarenessFallback_(cands){ return -1; }

  const iRut = findCol(['rut','r.u.t','run','run alumno','rut alumno','rut_estudiante']);
  const iNom = findCol(['nombre','nombres','nombre alumno','estudiante','alumno']);
  const iCur = findCol(['curso','nivel','curso actual','curso_2026']);
  const iMail = findCol(['correo','email','mail','correo apoderado','correo alumno']);
  const iDom = findCol(['domicilio','direccion','dirección','direccion hogar','domicilio hogar']);
  const iCom = findCol(['comuna','ciudad','localidad']);

  // Build normalized list
  const outRows = [];
  rows.forEach(r=>{
    const rut = normalizeRut_(iRut>=0 ? r[iRut] : r[0]);
    if(!rut) return;
    outRows.push([
      rut,
      String(iNom>=0 ? r[iNom] : '').trim(),
      String(iCur>=0 ? r[iCur] : '').trim(),
      String(iMail>=0 ? r[iMail] : '').trim(),
      String(iDom>=0 ? r[iDom] : '').trim(),
      String(iCom>=0 ? r[iCom] : '').trim()
    ]);
  });

  const st = ss_().getSheetByName(SHEETS.STUDENTS);
  // Replace content (keep header)
  if(st.getLastRow()>1) st.getRange(2,1,st.getLastRow()-1,6).clearContent();
  if(outRows.length){
    st.getRange(2,1,outRows.length,6).setValues(outRows);
  }

  // Cleanup temp sheet file
  try{ Drive.Files.remove(tmp.id); }catch(e){}

  return { rows: outRows.length };
}

function getStudentByRut_(rut){
  initSheets_();
  rut = normalizeRut_(rut);
  if(!rut) throw new Error('RUT inválido.');

  const st = ss_().getSheetByName(SHEETS.STUDENTS);
  const data = st.getLastRow()>1 ? st.getRange(2,1,st.getLastRow()-1,6).getValues() : [];
  let student = null;
  for(let i=0;i<data.length;i++){
    if(normalizeRut_(data[i][0]) === rut){
      student = {
        rut,
        nombre: String(data[i][1]||'').trim(),
        curso: String(data[i][2]||'').trim(),
        email: String(data[i][3]||'').trim(),
        domicilio: String(data[i][4]||'').trim(),
        comuna: String(data[i][5]||'').trim()
      };
      break;
    }
  }
  if(!student) throw new Error('Alumno no encontrado en Estudiantes.');

  const asg = getAssignment_(rut);
  student.asignacion = asg;
  return student;
}

function getAssignment_(rut){
  const sh = ss_().getSheetByName(SHEETS.ASSIGN);
  const last = sh.getLastRow();
  if(last<=1) return null;
  const vals = sh.getRange(2,1,last-1,6).getValues();
  for(let i=0;i<vals.length;i++){
    if(normalizeRut_(vals[i][0])===rut){
      return { rut, busId:String(vals[i][1]||'').trim(), route:String(vals[i][2]||'').trim(), status:String(vals[i][3]||'').trim(), digitador:String(vals[i][4]||'').trim(), updatedAt:String(vals[i][5]||'') };
    }
  }
  return null;
}

function setAssignment_(rut, busId, route, status, digitador){
  const sh = ss_().getSheetByName(SHEETS.ASSIGN);
  const last = sh.getLastRow();
  const now = new Date().toISOString();
  if(last<=1){
    sh.appendRow([rut,busId,route,status,digitador,now]);
    return;
  }
  const vals = sh.getRange(2,1,last-1,6).getValues();
  for(let i=0;i<vals.length;i++){
    if(normalizeRut_(vals[i][0])===rut){
      sh.getRange(i+2,1,1,6).setValues([[rut,busId,route,status,digitador,now]]);
      return;
    }
  }
  sh.appendRow([rut,busId,route,status,digitador,now]);
}

function appendWait_(rut, busId, route, digitador, motivo){
  const sh = ss_().getSheetByName(SHEETS.WAIT);
  const now = new Date().toISOString();
  sh.appendRow([rut,busId,route,'EN_ESPERA',digitador,now,motivo||'SIN_CUPO']);
}

function ensureBusSheet_(busId){
  const name = 'BUS_' + busId;
  const sh = getOrCreateSheet_(name, ['rut','nombre','curso','email','route','digitador','updatedAt']);
  return sh;
}

function removeRutFromBusSheets_(rut){
  const ss = ss_();
  const sheets = ss.getSheets();
  for(const sh of sheets){
    const n = sh.getName();
    if(n.indexOf('BUS_')===0){
      const last = sh.getLastRow();
      if(last<=1) continue;
      const vals = sh.getRange(2,1,last-1,1).getValues();
      for(let i=0;i<vals.length;i++){
        if(normalizeRut_(vals[i][0])===rut){
          sh.deleteRow(i+2);
          return;
        }
      }
    }
  }
}

function addRutToBusSheet_(busId, student, route, digitador){
  const sh = ensureBusSheet_(busId);
  const rut = student.rut;
  const now = new Date().toISOString();
  const last = sh.getLastRow();
  if(last>1){
    const vals = sh.getRange(2,1,last-1,1).getValues();
    for(let i=0;i<vals.length;i++){
      if(normalizeRut_(vals[i][0])===rut){
        sh.getRange(i+2,1,1,7).setValues([[rut,student.nombre,student.curso,student.email,route,digitador,now]]);
        return;
      }
    }
  }
  sh.appendRow([rut,student.nombre,student.curso,student.email,route,digitador,now]);
}

function getBus_(busId){
  const buses = listBuses_().buses;
  const b = buses.find(x=>String(x.id)===String(busId));
  if(!b) throw new Error('Bus no existe: ' + busId);
  return b;
}

function countAssignedForBus_(busId){
  const sh = ss_().getSheetByName(SHEETS.ASSIGN);
  const last = sh.getLastRow();
  if(last<=1) return 0;
  const vals = sh.getRange(2,1,last-1,6).getValues();
  let c=0;
  vals.forEach(r=>{
    if(String(r[1]||'').trim()===String(busId).trim() && String(r[3]||'')==='ASIGNADO') c++;
  });
  return c;
}

function assignBus_(rut, busId, digitador){
  initSheets_();
  rut = normalizeRut_(rut);
  busId = String(busId||'').trim();
  digitador = String(digitador||'').trim() || 'digitador';
  if(!rut) throw new Error('RUT inválido.');
  if(!busId) throw new Error('Bus inválido.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const student = getStudentByRut_(rut); // also validates existence
    const bus = getBus_(busId);
    const route = bus.route || '';

    // If already assigned elsewhere, remove from bus sheets
    removeRutFromBusSheets_(rut);

    // Capacity control
    const cap = Number(bus.capacity||0);
    const used = countAssignedForBus_(busId);
    if(cap>0 && used >= cap){
      // mark as wait
      setAssignment_(rut, busId, route, 'EN_ESPERA', digitador);
      appendWait_(rut, busId, route, digitador, 'SIN_CUPO');
      return { status:'EN_ESPERA', busId, route };
    }

    // Assign
    setAssignment_(rut, busId, route, 'ASIGNADO', digitador);
    addRutToBusSheet_(busId, student, route, digitador);
    return { status:'ASIGNADO', busId, route };
  } finally {
    lock.releaseLock();
  }
}

function getBusDashboard_(busId){
  initSheets_();
  busId = String(busId||'').trim();
  const bus = getBus_(busId);
  const asgSh = ss_().getSheetByName(SHEETS.ASSIGN);
  const stSh = ss_().getSheetByName(SHEETS.STUDENTS);
  const wSh = ss_().getSheetByName(SHEETS.WAIT);

  const stMap = buildStudentMap_(stSh);
  const asg = asgSh.getLastRow()>1 ? asgSh.getRange(2,1,asgSh.getLastRow()-1,6).getValues() : [];
  const asignados = [];
  asg.forEach(r=>{
    if(String(r[1]||'').trim()===busId && String(r[3]||'')==='ASIGNADO'){
      const rut = normalizeRut_(r[0]);
      const st = stMap[rut] || {rut, nombre:'', curso:'', email:''};
      asignados.push(st);
    }
  });

  const wait = wSh.getLastRow()>1 ? wSh.getRange(2,1,wSh.getLastRow()-1,7).getValues() : [];
  const espera = [];
  wait.forEach(r=>{
    if(String(r[1]||'').trim()===busId){
      const rut = normalizeRut_(r[0]);
      const st = stMap[rut] || {rut, nombre:'', curso:'', email:''};
      espera.push({ rut, nombre: st.nombre, curso: st.curso, motivo: String(r[6]||'SIN_CUPO') });
    }
  });

  return { bus, asignados, espera };
}

function getCursoDashboard_(curso){
  initSheets_();
  curso = String(curso||'').trim().toLowerCase();
  if(!curso) throw new Error('Curso vacío.');
  const stSh = ss_().getSheetByName(SHEETS.STUDENTS);
  const asgSh = ss_().getSheetByName(SHEETS.ASSIGN);

  const students = stSh.getLastRow()>1 ? stSh.getRange(2,1,stSh.getLastRow()-1,6).getValues() : [];
  const asg = asgSh.getLastRow()>1 ? asgSh.getRange(2,1,asgSh.getLastRow()-1,6).getValues() : [];
  const asgMap = {};
  asg.forEach(r=>{
    const rut = normalizeRut_(r[0]);
    asgMap[rut] = { busId:String(r[1]||'').trim(), route:String(r[2]||'').trim(), status:String(r[3]||'').trim() };
  });

  const rows = [];
  students.forEach(r=>{
    const c = String(r[2]||'').trim().toLowerCase();
    if(c === curso || c.includes(curso) || curso.includes(c)){
      const rut = normalizeRut_(r[0]);
      const a = asgMap[rut] || {};
      rows.push({
        rut,
        nombre:String(r[1]||'').trim(),
        email:String(r[3]||'').trim(),
        curso:String(r[2]||'').trim(),
        busId:a.busId||'',
        route:a.route||'',
        status:a.status||'SIN_ASIGNAR'
      });
    }
  });
  return { rows };
}

function buildStudentMap_(stSh){
  const map = {};
  const vals = stSh.getLastRow()>1 ? stSh.getRange(2,1,stSh.getLastRow()-1,6).getValues() : [];
  vals.forEach(r=>{
    const rut = normalizeRut_(r[0]);
    if(!rut) return;
    map[rut] = {
      rut,
      nombre:String(r[1]||'').trim(),
      curso:String(r[2]||'').trim(),
      email:String(r[3]||'').trim(),
      domicilio:String(r[4]||'').trim(),
      comuna:String(r[5]||'').trim()
    };
  });
  return map;
}

function exportCsv_(){
  initSheets_();
  const ss = ss_();
  const st = ss.getSheetByName(SHEETS.STUDENTS);
  const asg = ss.getSheetByName(SHEETS.ASSIGN);
  const buses = ss.getSheetByName(SHEETS.BUSES);

  const stMap = buildStudentMap_(st);
  const asgVals = asg.getLastRow()>1 ? asg.getRange(2,1,asg.getLastRow()-1,6).getValues() : [];
  const busVals = buses.getLastRow()>1 ? buses.getRange(2,1,buses.getLastRow()-1,4).getValues() : [];
  const busMap = {};
  busVals.forEach(r=> busMap[String(r[0]||'').trim()] = { route:String(r[3]||'').trim(), name:String(r[1]||'').trim() });

  const rows = [];
  asgVals.forEach(r=>{
    const rut = normalizeRut_(r[0]);
    const st = stMap[rut] || {rut,nombre:'',curso:'',email:'',domicilio:'',comuna:''};
    const busId = String(r[1]||'').trim();
    const route = String(r[2]||'').trim() || (busMap[busId]?.route || '');
    rows.push([
      st.rut, st.nombre, st.curso, st.email, st.domicilio, st.comuna,
      busId, route, String(r[3]||'').trim(), String(r[4]||'').trim(), String(r[5]||'')
    ]);
  });

  const header = ['rut','nombre','curso','email','domicilio','comuna','busId','recorrido','status','digitador','updatedAt'];
  const csv = [header].concat(rows).map(line=> line.map(v=>{
    const s=String(v??'').replace(/"/g,'""');
    return '"'+s+'"';
  }).join(',')).join('\n');

  const filename = 'export_transporte_escolar_' + Utilities.formatDate(new Date(), 'America/Santiago', 'yyyyMMdd_HHmm') + '.csv';
  return { filename, csv };
}
