
(function(){
  const LS = {
    theme: 'lpsn-buses-theme',
    font: 'lpsn-buses-fontscale',
    lang: 'lpsn-buses-lang',
    session: 'lpsn-buses-session',
    sync: 'lpsn-buses-sync'
  };
  window.TE = window.TE || {};
  TE.LS = LS;

  function applyTheme(){
    const t = localStorage.getItem(LS.theme) || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  }
  function toggleTheme(){
    const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    localStorage.setItem(LS.theme, t); applyTheme();
  }
  function applyFont(){
    const s = parseFloat(localStorage.getItem(LS.font) || '1');
    document.documentElement.style.fontSize = (16*s) + 'px';
  }
  function bumpFont(delta){
    const cur = parseFloat(localStorage.getItem(LS.font) || '1');
    const next = Math.min(1.35, Math.max(0.85, cur + delta));
    localStorage.setItem(LS.font, String(next));
    applyFont();
    TE.toast(`Tamaño de letra: ${(next*100).toFixed(0)}%`, 'ok');
  }
  function speakAll(){
    try{
      const txt = document.body.innerText.replace(/\s+/g,' ').trim();
      if(!txt) return;
      if('speechSynthesis' in window){
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(txt);
        u.lang = (localStorage.getItem(LS.lang) || 'es-CL');
        speechSynthesis.speak(u);
        TE.toast('Narrador activado (lectura de página).','ok');
      }else{
        TE.toast('Narrador no disponible en este navegador.','warn');
      }
    }catch(e){
      TE.toast('No se pudo activar narrador.','err');
    }
  }

  function ensureToastHost(){
    let host = document.querySelector('.toast');
    if(!host){
      host = document.createElement('div');
      host.className = 'toast';
      document.body.appendChild(host);
    }
    return host;
  }
  TE.toast = function(msg, kind){
    const host = ensureToastHost();
    const item = document.createElement('div');
    item.className = 'item ' + (kind || '');
    item.innerHTML = `<b style="display:block;margin-bottom:4px">${kind==='err'?'Error':kind==='warn'?'Aviso':'OK'}</b><div>${String(msg)}</div>`;
    host.appendChild(item);
    setTimeout(()=>{ item.style.opacity='0'; item.style.transform='translateY(4px)'; }, 3500);
    setTimeout(()=>{ item.remove(); }, 4200);
  };

  TE.applyTheme = applyTheme;
  TE.toggleTheme = toggleTheme;
  TE.applyFont = applyFont;
  TE.bumpFont = bumpFont;
  TE.speakAll = speakAll;

  document.addEventListener('DOMContentLoaded', ()=>{
    applyTheme();
    applyFont();
  });
})();
