/* Bilibank como app: o painel é o mesmo arquivo publicado no Claude.
   Aqui trocamos só as duas portas que ele usa:
   - claude.use('db')     → Supabase (login + tabela "docs", com tempo real)
   - claude.use('sample') → CFG.interpretar (API do Claude, chave guardada no servidor); vazio = leitor do painel
   O banco guarda um documento por caminho (config/base, fixas/<id>, lanc/<id>), igual ao do Claude. */
(function () {
  const CFG = window.BILI_CONFIG || {};
  const temConfig = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
  const sb = temConfig ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

  const docs = new Map(), ouvintes = [];
  let uid = null, email = '', canal = null, prontoRes, iniciado = false, inscrito = false;
  const pronto = new Promise(r => { prontoRes = r; });
  const clone = d => JSON.parse(JSON.stringify(d));

  /* ---------- o mesmo formato de snapshot que o painel recebe no Claude ---------- */
  const snapDoc = p => { const d = docs.get(p); return { id: p.split('/').pop(), exists: !!d, data: () => d ? clone(d) : undefined }; };
  const snapCol = p => {
    const n = p.split('/').length + 1;
    const ds = [...docs.keys()].filter(k => k.startsWith(p + '/') && k.split('/').length === n).sort().map(snapDoc);
    return { docs: ds, size: ds.length, empty: !ds.length };
  };
  let avisoT = null;
  const avisar = () => { clearTimeout(avisoT); avisoT = setTimeout(() => ouvintes.forEach(o => { try { o.cb(o.tipo === 'd' ? snapDoc(o.p) : snapCol(o.p)); } catch (e) { console.error(e); } }), 0); };
  const novoId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function gravar(p, data) {
    const { error } = await sb.from('docs').upsert({ owner: uid, path: p, data }, { onConflict: 'owner,path' });
    if (error) throw { code: 'erro_gravar', message: error.message };
  }
  const docRef = p => ({
    id: p.split('/').pop(), path: p,
    get: async () => snapDoc(p),
    set: async d => { const ant = docs.get(p); docs.set(p, clone(d)); avisar(); try { await gravar(p, clone(d)); } catch (e) { if (ant) docs.set(p, ant); else docs.delete(p); avisar(); throw e; } },
    update: async d => {
      const ant = docs.get(p); if (!ant) throw { code: 'not_found', message: 'Documento não existe: ' + p };
      const novo = Object.assign(clone(ant), clone(d)); docs.set(p, novo); avisar();
      try { await gravar(p, novo); } catch (e) { docs.set(p, ant); avisar(); throw e; }
    },
    delete: async () => {
      const ant = docs.get(p); docs.delete(p); avisar();
      const { error } = await sb.from('docs').delete().eq('owner', uid).eq('path', p);
      if (error) { if (ant) docs.set(p, ant); avisar(); throw { code: 'erro_apagar', message: error.message }; }
    },
    onSnapshot: (cb, erro) => { ouvintes.push({ tipo: 'd', p, cb, erro }); setTimeout(() => cb(snapDoc(p)), 0); return () => { const i = ouvintes.findIndex(o => o.cb === cb); if (i >= 0) ouvintes.splice(i, 1); }; }
  });
  const colRef = p => ({
    path: p,
    doc: id => docRef(p + '/' + (id || novoId())),
    add: async d => { const r = docRef(p + '/' + novoId()); await r.set(d); return r; },
    get: async () => snapCol(p),
    onSnapshot: (cb, erro) => { ouvintes.push({ tipo: 'c', p, cb, erro }); setTimeout(() => cb(snapCol(p)), 0); return () => { const i = ouvintes.findIndex(o => o.cb === cb); if (i >= 0) ouvintes.splice(i, 1); }; }
  });
  const db = { doc: docRef, collection: colRef };

  /* ---------- carga inicial e tempo real ---------- */
  async function carregar() {
    const passo = 1000, novos = new Map();
    for (let de = 0; ; de += passo) {
      const { data, error } = await sb.from('docs').select('path,data').order('path').range(de, de + passo - 1);
      if (error) throw error;
      for (const r of data) novos.set(r.path, r.data);
      if (data.length < passo) break;
    }
    docs.clear(); novos.forEach((d, p) => docs.set(p, d));
  }
  function ouvirMudancas() {
    if (canal) sb.removeChannel(canal);
    inscrito = false;
    canal = sb.channel('docs-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, ev => {
        const r = ev.new && ev.new.path ? ev.new : ev.old;
        if (!r || !r.path || (r.owner && r.owner !== uid)) return;
        if (ev.eventType === 'DELETE') docs.delete(r.path); else docs.set(r.path, ev.new.data);
        avisar();
      })
      /* a 1ª inscrição vem logo depois da carga; as seguintes são reconexões: relê para não perder nada */
      .subscribe(st => { if (st !== 'SUBSCRIBED') return; if (inscrito) recarregar(); inscrito = true; });
  }
  /* ao voltar para o app (celular dormiu, rede caiu), relê tudo para não perder nada */
  async function recarregar() { try { await carregar(); avisar(); } catch (e) { console.error(e); } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && iniciado) recarregar(); });

  let iniciando = null;
  function iniciar(sessao) {
    if (iniciado || iniciando) return iniciando;
    iniciando = (async () => {
      uid = sessao.user.id; email = sessao.user.email || '';
      try { await carregar(); } catch (e) { iniciando = null; mostrarLogin('Não consegui ler seus dados: ' + (e.message || e), true); return; }
      iniciado = true;
      ouvirMudancas();
      fecharLogin();
      botaoConta();
      prontoRes(db);
    })();
    return iniciando;
  }

  /* ---------- interpretação pela API do Claude ---------- */
  async function chamar(input, json) {
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) throw { code: 'not_granted', message: 'Entre no app de novo.' };
    let r;
    try {
      r = await fetch(CFG.interpretar, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ input, json }) });
    } catch (e) { throw { code: 'rede', message: 'Sem internet agora.' }; }
    const corpo = await r.json().catch(() => ({}));
    /* sem a chave do Claude no servidor, o painel deixa de tentar e usa o leitor próprio */
    if (corpo.code === 'chave') throw { code: 'capability_disabled', message: corpo.message };
    if (!r.ok) throw { code: corpo.code || 'erro', message: corpo.message || 'A interpretação falhou.' };
    return corpo;
  }
  const sample = async input => { const c = await chamar(input, false); return { text: c.text || '', truncated: false }; };
  sample.json = async input => chamar(input, true);
  sample.limits = async () => ({ images: false });

  window.BILI_APP = true;
  /* sem endereço de interpretação (site só de arquivos), o painel usa o leitor próprio direto */
  window.claude = { use: nome => nome === 'db' ? pronto : nome === 'sample' ? pronto.then(() => CFG.interpretar ? sample : null) : Promise.resolve(null) };

  /* ---------- tela de entrada (preto e branco, como o logo) ---------- */
  const css = `
  .bl-login{position:fixed;inset:0;z-index:200;background:#000;color:#f4f4f1;display:grid;place-items:center;padding:24px;
    padding-top:max(24px,env(safe-area-inset-top));padding-bottom:max(24px,env(safe-area-inset-bottom));font-family:"Hanken Grotesk",system-ui,-apple-system,sans-serif}
  .bl-box{width:min(360px,100%);display:grid;gap:14px}
  .bl-brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
  .bl-mark{width:44px;height:44px;border-radius:12px;background:#f4f4f1;color:#000;display:grid;place-items:center;font:700 22px/1 "Sora",system-ui,sans-serif}
  .bl-name{font:600 22px/1.1 "Sora",system-ui,sans-serif;letter-spacing:-.01em}
  .bl-name span{display:block;font:500 13px/1.4 "Hanken Grotesk",system-ui,sans-serif;color:#a3a29b;letter-spacing:0;margin-top:3px}
  .bl-box label{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#76756f}
  .bl-box input{width:100%;box-sizing:border-box;background:#111113;border:1px solid #2b2b2f;border-radius:12px;padding:13px 14px;font:500 16px/1.2 "Hanken Grotesk",system-ui,-apple-system,sans-serif;color:#f4f4f1;outline:none;margin-top:6px}
  .bl-box input:focus{border-color:rgba(255,255,255,.4)}
  .bl-btn{background:#f4f4f1;color:#000;border:0;border-radius:999px;padding:14px 18px;font:700 15px/1 "Hanken Grotesk",system-ui,-apple-system,sans-serif;cursor:pointer;margin-top:6px}
  .bl-btn[disabled]{opacity:.5}
  .bl-link{background:none;border:0;color:#a3a29b;font:600 14px/1.3 "Hanken Grotesk",system-ui,-apple-system,sans-serif;cursor:pointer;padding:6px;text-decoration:underline;text-underline-offset:3px}
  .bl-msg{font-size:14px;line-height:1.45;color:#a3a29b;min-height:20px;margin:0}
  .bl-msg.erro{color:#ff6b6b}
  .bl-msg.ok{color:#7ee2a8}`;
  let el = null, criar = false;
  /* o primeiro acesso cria o login já confirmado (função primeiro-acesso no Supabase);
     depois dele o banco recusa qualquer cadastro novo */
  async function primeiroAcesso(email, senha) {
    const k = CFG.supabaseAnonKey, h = { 'Content-Type': 'application/json', apikey: k };
    if (!k.startsWith('sb_')) h.Authorization = 'Bearer ' + k;
    let r;
    try { r = await fetch(CFG.supabaseUrl + '/functions/v1/primeiro-acesso', { method: 'POST', headers: h, body: JSON.stringify({ email, senha }) }); }
    catch (e) { return { erro: 'Sem internet agora.' }; }
    const c = await r.json().catch(() => ({}));
    if (!r.ok) return { erro: c.message || 'Não consegui criar o acesso.', fechado: c.code === 'fechado' };
    return {};
  }
  function abrirTela(rotulo) {
    if (!document.getElementById('bl-css')) { const st = document.createElement('style'); st.id = 'bl-css'; st.textContent = css; document.head.appendChild(st); }
    if (!el) { el = document.createElement('div'); el.className = 'bl-login'; el.setAttribute('role', 'dialog'); document.body.appendChild(el); }
    el.setAttribute('aria-label', rotulo);
  }
  function mostrarLogin(msg, erro) {
    abrirTela('Entrar no Bilibank');
    if (!temConfig) {
      el.innerHTML = `<div class="bl-box"><div class="bl-brand"><div class="bl-mark">B</div><div class="bl-name">Bilibank<span>Falta configurar</span></div></div>
        <p class="bl-msg">O app ainda não está ligado ao banco de dados. O Claude termina essa parte e o app passa a abrir aqui.</p></div>`;
      return;
    }
    el.innerHTML = `<form class="bl-box" id="bl-form" novalidate>
      <div class="bl-brand"><div class="bl-mark">B</div><div class="bl-name">Bilibank<span>${criar ? 'Primeiro acesso: crie sua senha' : 'Entre para ver seus números'}</span></div></div>
      <div><label for="bl-email">E-mail</label><input id="bl-email" type="email" autocomplete="username" inputmode="email" required></div>
      <div><label for="bl-senha">${criar ? 'Crie uma senha' : 'Senha'}</label><input id="bl-senha" type="password" autocomplete="${criar ? 'new-password' : 'current-password'}" required></div>
      <button class="bl-btn" id="bl-ok" type="submit">${criar ? 'Criar acesso' : 'Entrar'}</button>
      <p class="bl-msg ${erro ? 'erro' : ''}" id="bl-msg" role="status" aria-live="polite"></p>
      <button class="bl-link" id="bl-troca" type="button">${criar ? 'Já tenho senha' : 'Primeiro acesso'}</button>
    </form>`;
    el.querySelector('#bl-msg').textContent = msg || (criar ? 'Use pelo menos 8 caracteres. Só o primeiro acesso pode ser criado.' : '');
    el.querySelector('#bl-troca').onclick = () => { criar = !criar; mostrarLogin(); };
    el.querySelector('#bl-form').onsubmit = async ev => {
      ev.preventDefault();
      const email = el.querySelector('#bl-email').value.trim(), senha = el.querySelector('#bl-senha').value;
      const m = el.querySelector('#bl-msg'), b = el.querySelector('#bl-ok');
      const falha = t => { b.disabled = false; m.className = 'bl-msg erro'; m.textContent = t; };
      if (!email || !senha) return falha('Preencha e-mail e senha.');
      if (criar && senha.length < 8) return falha('Use uma senha de pelo menos 8 caracteres.');
      b.disabled = true; m.className = 'bl-msg'; m.textContent = criar ? 'Criando seu acesso…' : 'Entrando…';
      if (criar) {
        const c = await primeiroAcesso(email, senha);
        if (c.fechado) { criar = false; mostrarLogin(c.erro, true); return; }
        if (c.erro) return falha(c.erro);
      }
      const r = await sb.auth.signInWithPassword({ email, password: senha });
      if (r.error) return falha(traduz(r.error.message));
      b.disabled = false;
      if (r.data.session) { criar = false; iniciar(r.data.session); }
    };
  }
  function traduz(m) {
    if (/invalid login/i.test(m)) return 'E-mail ou senha não conferem.';
    if (/not confirmed/i.test(m)) return 'Falta confirmar o e-mail: abra o link que chegou na sua caixa de entrada.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
    if (/fetch|network/i.test(m)) return 'Sem internet agora.';
    return m;
  }
  function fecharLogin() { if (el) { el.remove(); el = null; } }

  /* ---------- conta: trocar a senha e sair, no aparelho em que já está dentro ---------- */
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function botaoConta() {
    const lugar = document.querySelector('.top-actions');
    if (!lugar || document.getElementById('bl-conta')) return;
    const b = document.createElement('button');
    b.id = 'bl-conta'; b.type = 'button'; b.className = 'icon-btn'; b.setAttribute('aria-label', 'Conta: trocar senha ou sair');
    b.innerHTML = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
    b.onclick = mostrarConta;
    lugar.appendChild(b);
  }
  function mostrarConta() {
    abrirTela('Sua conta');
    el.innerHTML = `<form class="bl-box" id="bl-form" novalidate>
      <div class="bl-brand"><div class="bl-mark">B</div><div class="bl-name">Trocar senha<span>${esc(email)}</span></div></div>
      <input type="email" autocomplete="username" value="${esc(email)}" hidden readonly>
      <div><label for="bl-nova">Nova senha</label><input id="bl-nova" type="password" autocomplete="new-password" required></div>
      <div><label for="bl-rep">Repita a nova senha</label><input id="bl-rep" type="password" autocomplete="new-password" required></div>
      <button class="bl-btn" id="bl-ok" type="submit">Salvar senha</button>
      <p class="bl-msg" id="bl-msg" role="status" aria-live="polite">Use pelo menos 8 caracteres. Depois, entre com ela nos outros aparelhos.</p>
      <button class="bl-link" id="bl-volta" type="button">Voltar</button>
      <button class="bl-link" id="bl-sair" type="button">Sair deste aparelho</button>
    </form>`;
    el.querySelector('#bl-volta').onclick = fecharLogin;
    el.querySelector('#bl-sair').onclick = () => sb.auth.signOut();
    el.querySelector('#bl-form').onsubmit = async ev => {
      ev.preventDefault();
      const nova = el.querySelector('#bl-nova').value, rep = el.querySelector('#bl-rep').value;
      const m = el.querySelector('#bl-msg'), b = el.querySelector('#bl-ok');
      const falha = t => { b.disabled = false; m.className = 'bl-msg erro'; m.textContent = t; };
      if (nova.length < 8) return falha('Use uma senha de pelo menos 8 caracteres.');
      if (nova !== rep) return falha('As duas senhas não estão iguais.');
      b.disabled = true; m.className = 'bl-msg'; m.textContent = 'Salvando…';
      const r = await sb.auth.updateUser({ password: nova });
      if (r.error) {
        const t = r.error.message || '';
        return falha(/different from the old/i.test(t) ? 'Essa já é a sua senha.' : /reauth|recent/i.test(t) ? 'Por segurança, saia, entre de novo e troque a senha logo em seguida.' : traduz(t));
      }
      m.className = 'bl-msg ok'; m.textContent = 'Senha trocada. Use a nova para entrar nos outros aparelhos.';
      el.querySelector('#bl-volta').textContent = 'Fechar';
    };
    el.querySelector('#bl-nova').focus();
  }

  function comecar() {
    if (!temConfig) { mostrarLogin(); return; }
    sb.auth.getSession().then(({ data }) => { if (data.session) iniciar(data.session); else mostrarLogin(); });
    sb.auth.onAuthStateChange((ev, sessao) => {
      if (ev === 'SIGNED_OUT') { location.reload(); return; }
      if (sessao && !iniciado) iniciar(sessao);
    });
  }
  window.biliSair = () => sb && sb.auth.signOut();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comecar); else comecar();
})();
