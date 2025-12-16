
(function(){
  window.TE = window.TE || {};
  const LS = TE.LS;

  function getSync(){
    try{
      const s = JSON.parse(localStorage.getItem(LS.sync) || '{}');
      return { url: s.url || '', key: s.key || '' };
    }catch{ return {url:'', key:''}; }
  }
  function setSync(url, key){
    localStorage.setItem(LS.sync, JSON.stringify({ url:(url||'').trim(), key:(key||'').trim() }));
  }

  async function callApi(action, payload){
    const {url, key} = getSync();
    if(!url) throw new Error('Falta configurar URL Sync (Apps Script).');
    const body = JSON.stringify({ key, action, payload: payload||{} });
    const res = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body
    });
    const txt = await res.text();
    let data;
    try{ data = JSON.parse(txt); }catch(e){ throw new Error('Respuesta no válida del servidor Sync.'); }
    if(!data.ok) throw new Error(data.error || 'Error Sync.');
    return data.data;
  }

  function normRut(rut){
    rut = (rut||'').trim().toUpperCase();
    rut = rut.replace(/\./g,'').replace(/\s+/g,'');
    if(!rut) return '';
    // keep dash if present, else add before last char
    if(!rut.includes('-') && rut.length>=2){
      rut = rut.slice(0,-1) + '-' + rut.slice(-1);
    }
    return rut;
  }

  TE.sync = { getSync, setSync, callApi, normRut };
})();
