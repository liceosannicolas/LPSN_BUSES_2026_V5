
(function(){
  window.TE = window.TE || {};
  const LS = TE.LS || { session:'lpsn-buses-session' };

  const USERS = [
    { email:'belenacuna@liceosannicolas.cl', role:'digitador' },
    { email:'echeverri@liceosannicolas.cl', role:'digitador' },
    { email:'franciscopinto@liceosannicolas.cl', role:'admin' }
  ];
  const PASSWORD = 'Buses2026';

  function login(email, pass){
    email = (email||'').trim().toLowerCase();
    const u = USERS.find(x=>x.email===email);
    if(!u) throw new Error('Correo no autorizado.');
    if(pass !== PASSWORD) throw new Error('Clave incorrecta.');
    const session = { email:u.email, role:u.role, ts:Date.now() };
    localStorage.setItem(LS.session, JSON.stringify(session));
    return session;
  }
  function logout(){
    localStorage.removeItem(LS.session);
  }
  function getSession(){
    try{
      const raw = localStorage.getItem(LS.session);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s?.email) return null;
      return s;
    }catch{ return null; }
  }
  function requireRole(roles){
    const s = getSession();
    if(!s) { location.href = '../app/login.html'; return null; }
    if(roles && !roles.includes(s.role)){
      TE.toast('No tienes permisos para esta vista.','err');
      location.href = '../app/dashboard.html';
      return null;
    }
    return s;
  }

  TE.auth = { login, logout, getSession, requireRole, USERS };
})();
