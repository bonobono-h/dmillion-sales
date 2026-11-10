/* 디밀리언 영업 관리 · Supabase 연결층
 * 원래 claude.ai 아티팩트에서 쓰던 window.claude (db·user·assets·downloads) 자리를
 * Supabase 로그인·데이터베이스·파일함으로 바꿔 끼웁니다. 화면 코드는 그대로 둡니다.
 */
(function () {
  'use strict';
  const CFG = window.DM_CONFIG || {};
  const configured = CFG.url && CFG.anonKey && !/YOUR_/.test(CFG.url + CFG.anonKey);
  const sb = configured && window.supabase
    ? window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;
  window.dmSupabase = sb;

  let me = null;              // {id, login, name, role}
  let readyResolve;
  const ready = new Promise(r => { readyResolve = r; });

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const ROLE_KO = { admin: '관리자', sales: '영업담당', view: '보기 전용', pending: '승인 대기' };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ---------------------------------------------------------------- 화면 스타일
  const css = `
  .dm-login{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg,#f6f7f9);font-family:var(--font,sans-serif);color:var(--ink,#1b1f24)}
  .dm-login form,.dm-login .box{width:100%;max-width:360px;background:var(--surface,#fff);border:1px solid var(--line,#e3e7ec);border-radius:14px;padding:28px 24px;display:flex;flex-direction:column;gap:12px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
  .dm-login h1{font-size:19px;margin:0}
  .dm-login p{margin:0;color:var(--ink2,#6b7480);font-size:13px;line-height:1.5}
  .dm-login label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600}
  .dm-login input{font:inherit;font-size:15px;padding:10px 12px;border:1px solid var(--line,#e3e7ec);border-radius:8px;background:var(--surface,#fff);color:inherit}
  .dm-login input:focus{outline:2px solid var(--accent,#2f5bd7);outline-offset:0;border-color:transparent}
  .dm-login button{font:inherit;font-weight:700;font-size:15px;padding:11px;border-radius:8px;border:0;background:var(--accent,#2f5bd7);color:var(--accent-ink,#fff);cursor:pointer}
  .dm-login button:disabled{opacity:.6;cursor:default}
  .dm-login button.ghost{background:transparent;color:var(--ink2,#6b7480);font-weight:600;font-size:13px;padding:4px}
  .dm-login .msg{color:var(--bad,#b3261e);font-size:13px;min-height:1em}
  .dm-login .suffix{display:flex;align-items:center;gap:6px}.dm-login .suffix input{flex:1;min-width:0}.dm-login .suffix span{color:var(--ink2,#6b7480);font-size:13px;white-space:nowrap}
  .dm-me{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink2,#6b7480)}
  .dm-me b{color:var(--ink,#1b1f24)}
  .dm-me button{all:unset;cursor:pointer;color:var(--ink2,#6b7480);text-decoration:underline;text-underline-offset:2px;font-size:12.5px}
  .dm-me button:focus-visible{outline:2px solid var(--accent,#2f5bd7)}
  .dm-me .dm-pend{text-decoration:none;background:var(--warn-soft,#fdf1dd);color:var(--warn,#a86100);font-weight:700;border-radius:999px;padding:2px 10px}
  .dm-admin tr.pend td{background:var(--warn-soft,#fdf1dd)}
  .dm-admin{margin-top:22px;display:flex;flex-direction:column;gap:14px}
  .dm-admin h3{margin:0}
  .dm-admin table{border-collapse:collapse;width:100%;font-size:13px}
  .dm-admin th,.dm-admin td{border-bottom:1px solid var(--line,#e3e7ec);padding:7px 6px;text-align:left}
  .dm-admin td input,.dm-admin td select{font:inherit;padding:5px 7px;border:1px solid var(--line,#e3e7ec);border-radius:6px;background:var(--surface,#fff);color:inherit;max-width:160px}
  .dm-admin td .actions{display:flex;gap:6px;flex-wrap:wrap}.dm-admin td .danger{color:var(--bad,#b3261e);border-color:currentColor;background:transparent}
  .dm-admin td time{white-space:nowrap;color:var(--ink2,#6b7480)}
  .dm-admin .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .dm-admin .note{font-size:12.5px;color:var(--ink2,#6b7480);line-height:1.6}
  .dm-admin .scroll{overflow-x:auto}
  .dm-member-layer{position:fixed;inset:0;z-index:10001;background:rgba(11,23,48,.48);display:flex;align-items:center;justify-content:center;padding:16px}
  .dm-member-panel{background:#fff;color:#1b2740;border-radius:16px;padding:24px;width:min(880px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;margin:0;box-shadow:0 18px 60px rgba(0,0,0,.2)}
  .dm-member-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.dm-member-heading h2{margin:0;font-size:20px}.dm-member-panel .scroll table{min-width:590px}.dm-member-panel .btn{min-height:40px}.dm-member-panel .note{margin:0}
  @media(max-width:600px){.dm-member-panel{padding:18px}.dm-member-heading h2{font-size:18px}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------------------------------------------------------------- 로그인
  function overlay(html) {
    let o = document.querySelector('.dm-login');
    if (!o) { o = document.createElement('div'); o.className = 'dm-login'; (document.body || document.documentElement).appendChild(o); }
    o.innerHTML = html; return o;
  }
  const toEmail = id => { id = String(id || '').trim(); return id.includes('@') ? id : `${id}@${CFG.emailDomain || 'dmillions.co.kr'}`; };

  function showLogin(msg) {
    const o = overlay(`<form autocomplete="on">
      <h1>디밀리언 영업 관리</h1>
      <p>영업팀 계정으로 로그인하세요.</p>
      <label>아이디<span class="suffix"><input name="id" autocomplete="username" required autocapitalize="off" spellcheck="false"><span>@${esc(CFG.emailDomain || 'dmillions.co.kr')}</span></span></label>
      <label>비밀번호<input name="pw" type="password" autocomplete="current-password" required></label>
      <div class="msg" role="alert">${esc(msg || '')}</div>
      <button type="submit">로그인</button>
      <button type="button" class="ghost" data-dm="signup">처음이면 가입하기</button>
    </form>`);
    const f = o.querySelector('form');
    f.id.focus();
    f.querySelector('[data-dm=signup]').onclick = () => showSignup();
    f.onsubmit = async e => {
      e.preventDefault();
      const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = '확인 중…';
      const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(f.id.value), password: f.pw.value });
      if (error) { b.disabled = false; b.textContent = '로그인'; f.querySelector('.msg').textContent = /Invalid login/i.test(error.message) ? '아이디 또는 비밀번호가 맞지 않습니다.' : '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.'; return; }
      afterLogin(data.user);
    };
  }

  function showSignup() {
    const dom = esc(CFG.emailDomain || 'dmillions.co.kr');
    const o = overlay(`<form autocomplete="on">
      <h1>영업 관리 가입</h1>
      <p>회사 메일 아이디와 이름, 비밀번호를 정하세요. 가입하면 관리자가 승인한 뒤부터 볼 수 있습니다.</p>
      <label>아이디 (회사 메일 앞부분)<span class="suffix"><input name="id" autocomplete="username" required autocapitalize="off" spellcheck="false" pattern="[A-Za-z0-9._\-]+" title="영문·숫자·점·밑줄·하이픈만"><span>@${dom}</span></span></label>
      <label>이름<input name="nm" autocomplete="name" required maxlength="20"></label>
      <label>비밀번호 (8자 이상)<input name="a" type="password" autocomplete="new-password" minlength="8" required></label>
      <label>비밀번호 한 번 더<input name="b" type="password" autocomplete="new-password" minlength="8" required></label>
      <div class="msg" role="alert"></div>
      <button type="submit">가입 신청</button>
      <button type="button" class="ghost" data-dm="back">로그인으로 돌아가기</button>
    </form>`);
    const f = o.querySelector('form'); f.id.focus();
    f.querySelector('[data-dm=back]').onclick = () => showLogin();
    f.onsubmit = async e => {
      e.preventDefault(); const m = f.querySelector('.msg');
      if (f.a.value !== f.b.value) { m.textContent = '비밀번호 두 칸이 다릅니다.'; return; }
      const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = '신청 중…';
      const { data, error } = await sb.auth.signUp({ email: toEmail(f.id.value), password: f.a.value, options: { data: { name: f.nm.value.trim() } } });
      b.disabled = false; b.textContent = '가입 신청';
      if (error) {
        const t = error.message || '';
        m.textContent = /already|registered|exists/i.test(t) ? '이미 가입된 아이디입니다. 로그인으로 돌아가세요.'
          : /not allowed|disabled/i.test(t) ? '지금은 가입이 막혀 있습니다. 관리자에게 알려 주세요.'
          : /password/i.test(t) ? '비밀번호를 더 길고 복잡하게 정해 주세요.'
          : /rate|too many/i.test(t) ? '잠시 후 다시 시도해 주세요.'
          : '가입하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        return;
      }
      if (data.session && data.user) { afterLogin(data.user); return; }
      overlay(`<div class="box"><h1>가입 신청을 받았습니다</h1><p>메일 인증이 필요한 설정이라 아직 로그인할 수 없습니다. 관리자에게 알려 주세요.</p><button type="button" class="ghost">로그인으로 돌아가기</button></div>`).querySelector('button').onclick = () => showLogin();
    };
  }

  async function afterLogin(user) {
    const { data, error } = await sb.from('members').select('user_id,login,name,role').eq('user_id', user.id).maybeSingle();
    if (error || !data) {
      const o = overlay(`<div class="box"><h1>아직 명단에 없는 계정입니다</h1><p>${esc(user.email)} 계정은 로그인됐지만 영업팀 명단에 없습니다. 관리자에게 추가를 요청하세요.</p><button type="button" class="ghost">다른 계정으로 로그인</button></div>`);
      o.querySelector('button').onclick = async () => { await sb.auth.signOut(); showLogin(); };
      return;
    }
    if (data.role === 'pending') {
      const o = overlay(`<div class="box"><h1>승인 기다리는 중</h1><p><b>${esc(data.name)}</b> (${esc(data.login)}) 님, 가입 신청이 들어갔습니다. 관리자가 권한을 정하면 바로 쓸 수 있습니다.</p><button type="button" data-dm="re">승인됐는지 다시 확인</button><button type="button" class="ghost" data-dm="out">로그아웃</button></div>`);
      o.querySelector('[data-dm=re]').onclick = () => afterLogin(user);
      o.querySelector('[data-dm=out]').onclick = async () => { await sb.auth.signOut(); showLogin(); };
      return;
    }
    me = { id: user.id, login: data.login, name: data.name, role: data.role };
    document.querySelector('.dm-login')?.remove();
    mountMe();
    readyResolve();
  }

  function mountMe() {
    const host = document.querySelector('header.top .hright') || document.querySelector('header');
    if (!host || host.querySelector('.dm-me')) return;
    const s = document.createElement('span'); s.className = 'dm-me';
    s.innerHTML = `<b>${esc(me.name)}</b><button type="button" data-dm="out">로그아웃</button>`;
    host.prepend(s);
    s.querySelector('[data-dm=out]').onclick = async () => { await sb.auth.signOut(); location.reload(); };
    if (me.role === 'admin') {
      pendingChip(s);
      setInterval(() => { if (!document.hidden) pendingChip(s); }, 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) pendingChip(s); });
    }
  }
  async function pendingChip(host) {
    const { count, error } = await sb.from('members').select('user_id', { count: 'exact', head: true }).eq('role', 'pending');
    if (error || count == null) return;
    host.querySelector('.dm-pend')?.remove();
    const b = document.createElement('button'); b.type = 'button'; b.className = 'dm-pend'; b.textContent = `승인 대기 ${count}명`;
    b.onclick = openPendingMembers;
    host.prepend(b);
  }

  async function openPendingMembers() {
    if (me?.role !== 'admin' || document.querySelector('.dm-member-layer')) return;
    const trigger = document.querySelector('.dm-pend'), layer = document.createElement('div');
    layer.className = 'dm-member-layer';
    layer.innerHTML = `<section class="dm-member-panel dm-admin" role="dialog" aria-modal="true" aria-labelledby="dmPendingTitle"><div class="dm-member-heading"><h2 id="dmPendingTitle">가입 승인 대기</h2><button class="btn" type="button" data-member-close aria-label="가입 신청 목록 닫기">닫기 ×</button></div><p class="note">신청자를 확인한 뒤 권한을 선택해 승인하세요. 거절하면 해당 가입 계정이 삭제됩니다.</p><div class="row"><button class="btn" type="button" data-member-refresh>신청 목록 새로고침</button></div><div class="scroll" data-member-list aria-live="polite">신청 목록을 불러오는 중…</div></section>`;
    document.body.appendChild(layer);
    const panel = layer.querySelector('[role="dialog"]'), list = layer.querySelector('[data-member-list]');
    const close = () => { document.removeEventListener('keydown', onKey); layer.remove(); if (trigger?.isConnected) trigger.focus(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { const focusable = [...panel.querySelectorAll('button,select')].filter(x => !x.disabled), first = focusable[0], last = focusable[focusable.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', onKey);
    layer.querySelector('[data-member-close]').onclick = close;
    layer.onclick = e => { if (e.target === layer) close(); };
    layer.querySelector('[data-member-refresh]').onclick = async e => { e.currentTarget.disabled = true; try { await peopleTable(list, {pendingOnly:true}); const h = document.querySelector('.dm-me'); if (h) await pendingChip(h); } finally { layer.querySelector('[data-member-refresh]').disabled = false; } };
    layer.querySelector('[data-member-close]').focus();
    await peopleTable(list, {pendingOnly:true});
  }

  function changePw() {
    const o = overlay(`<form><h1>비밀번호 변경</h1><p>8자 이상으로 정해 주세요.</p>
      <label>새 비밀번호<input name="a" type="password" autocomplete="new-password" minlength="8" required></label>
      <label>한 번 더<input name="b" type="password" autocomplete="new-password" minlength="8" required></label>
      <div class="msg" role="alert"></div><button type="submit">바꾸기</button><button type="button" class="ghost">취소</button></form>`);
    const f = o.querySelector('form'); f.a.focus();
    f.querySelector('.ghost').onclick = () => o.remove();
    f.onsubmit = async e => {
      e.preventDefault(); const m = f.querySelector('.msg');
      if (f.a.value !== f.b.value) { m.textContent = '두 칸이 다릅니다.'; return; }
      const { error } = await sb.auth.updateUser({ password: f.a.value });
      if (error) { m.textContent = '바꾸지 못했습니다. ' + (/weak|short/i.test(error.message) ? '더 긴 비밀번호를 쓰세요.' : '다시 시도해 주세요.'); return; }
      o.remove(); alertless('비밀번호를 바꿨습니다');
    };
  }
  function alertless(t) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b1f24;color:#fff;padding:10px 16px;border-radius:8px;z-index:9999'; document.body.appendChild(d); setTimeout(() => d.remove(), 2500); }

  // ---------------------------------------------------------------- 데이터 (Firestore 비슷한 모양)
  const colls = new Map();
  const parentOf = path => path.replace(/\/[^/]+$/, '');
  const idOf = path => path.split('/').pop();

  function coll(path) {
    let s = colls.get(path);
    if (s) return s;
    s = { path, rows: new Map(), subs: new Set(), loaded: false, error: null };
    colls.set(path, s);
    s.ready = (async () => {
      s.channel = sb.channel('docs:' + path)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: `collection=eq.${path}` }, p => {
          if (p.eventType === 'DELETE') { s.rows.delete(p.old.path); }
          else put(s, p.new);
          emit(s);
        })
        .subscribe();
      try {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('docs').select('path,data,version,updated_at,updated_by').eq('collection', path).order('path').range(from, from + 999);
          if (error) throw error;
          data.forEach(r => put(s, r));
          if (data.length < 1000) break;
        }
      } catch (e) { s.error = e; }
      s.loaded = true; emit(s);
    })();
    return s;
  }
  function put(s, r) { const cur = s.rows.get(r.path); if (!cur || !(cur.version > r.version)) s.rows.set(r.path, { path: r.path, data: r.data, version: r.version, updated_at: r.updated_at, updated_by: r.updated_by }); }
  function emit(s) { if (!s.loaded) return; for (const fn of s.subs) { try { fn(); } catch (e) { console.error(e); } } }
  function applyLocal(row) { const s = colls.get(parentOf(row.path)); if (s) { put(s, row); emit(s); } }
  function dropLocal(path) { const s = colls.get(parentOf(path)); if (s && s.rows.delete(path)) emit(s); }

  const docSnap = (path, row) => ({ id: idOf(path), ref: { path }, exists: !!row, updatedAt: row?.updated_at || null, updatedBy: row?.updated_by || null, version: row?.version ?? null, data: () => row ? clone(row.data) : undefined });
  const qSnap = docs => ({ docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) });

  function query(path, order, lim) {
    const pick = () => {
      const s = colls.get(path);
      let rows = [...s.rows.values()];
      if (order) {
        const [f, dir] = order, k = r => r.data?.[f] ?? '';
        rows.sort((a, b) => { const x = k(a), y = k(b); const c = x < y ? -1 : x > y ? 1 : 0; return dir === 'desc' ? -c : c; });
      }
      if (lim) rows = rows.slice(0, lim);
      return qSnap(rows.map(r => docSnap(r.path, r)));
    };
    return {
      orderBy: (f, dir = 'asc') => query(path, [f, dir], lim),
      limit: n => query(path, order, n),
      doc: id => docRef(path + '/' + id),
      onSnapshot(next, onErr) {
        const s = coll(path); const fn = () => { if (s.error) { onErr && onErr(s.error); return; } next(pick()); };
        s.subs.add(fn); if (s.loaded) fn();
        return () => s.subs.delete(fn);
      },
      async get() { const s = coll(path); await s.ready; if (s.error) throw s.error; return pick(); },
    };
  }

  function splitPatch(patch) {
    const set = {}, remove = [];
    for (const [k, v] of Object.entries(patch || {})) {
      if (v && typeof v === 'object' && v.__delete__ === true) remove.push(k); else set[k] = v === undefined ? null : v;
    }
    return { set: JSON.parse(JSON.stringify(set)), remove };
  }
  const denied = e => err(/row-level security|permission/i.test(e?.message || '') ? 'permission-denied' : (e?.code === 'P0002' ? 'not-found' : 'unavailable'), e?.message);

  function docRef(path) {
    return {
      id: idOf(path), path,
      onSnapshot(next, onErr) {
        const s = coll(parentOf(path)); const fn = () => { if (s.error) { onErr && onErr(s.error); return; } next(docSnap(path, s.rows.get(path))); };
        s.subs.add(fn); if (s.loaded) fn();
        return () => s.subs.delete(fn);
      },
      async get() { const { data, error } = await sb.from('docs').select('path,data,version,updated_at,updated_by').eq('path', path).maybeSingle(); if (error) throw denied(error); return docSnap(path, data); },
      async set(data) {
        if (me?.role === 'view') throw err('permission-denied', '보기 전용');
        const clean = JSON.parse(JSON.stringify(data || {}));
        const { data: row, error } = await sb.from('docs').upsert({ path, data: clean }, { onConflict: 'path' }).select('path,data,version,updated_at,updated_by').single();
        if (error) throw denied(error); applyLocal(row);
      },
      async update(patch) {
        if (me?.role === 'view') throw err('permission-denied', '보기 전용');
        const { set, remove } = splitPatch(patch);
        const { data, error } = await sb.rpc('doc_merge', { p_path: path, p_patch: set, p_remove: remove });
        if (error) throw denied(error); const row = Array.isArray(data) ? data[0] : data; if (row) applyLocal(row);
      },
      async delete() {
        if (me?.role === 'view') throw err('permission-denied', '보기 전용');
        const { error } = await sb.from('docs').delete().eq('path', path);
        if (error) throw denied(error); dropLocal(path);
      },
    };
  }

  const dbCap = { collection: p => query(p), doc: p => docRef(p) };

  // ---------------------------------------------------------------- 사용자
  let profileCache = null;
  const userCap = {
    id: async () => me.id,
    can: async what => what === 'data.write' ? (me.role === 'admin' || me.role === 'sales') : false,
    isOwner: async () => me.role === 'admin',
    canEdit: async () => me.role === 'admin',
    async profiles(ids) {
      if (!profileCache) profileCache = {};
      const valid = [...new Set(ids.filter(id => UUID.test(id) && !profileCache[id]))];
      if (valid.length) {
        const { data, error } = await sb.functions.invoke('crm-member-admin', { body: { action: 'profiles', userIds: valid } });
        if (!error) (data?.profiles || []).forEach(r => { profileCache[r.user_id] = { name: r.name || '담당자' }; });
      }
      const out = {}; for (const id of ids) if (UUID.test(id) && profileCache[id]) out[id] = profileCache[id];
      return out;
    },
  };

  // ---------------------------------------------------------------- 파일함
  const assetsCap = {
    async upload(file, opts = {}) {
      const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
      const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)) + ext;
      const { error } = await sb.storage.from('files').upload(id, file, { contentType: file.type || opts.type || 'application/octet-stream', upsert: false });
      if (error) throw err(/size|large/i.test(error.message) ? 'too-large' : (/quota/i.test(error.message) ? 'quota' : 'unavailable'), error.message);
      return { id, sizeBytes: file.size, contentType: file.type || opts.type || '' };
    },
    async delete(id) { await sb.storage.from('files').remove([id]); },
  };
  // 화면 안의 '/_blob/<id>' 링크는 잠깐 쓰는 서명 주소로 열기
  document.addEventListener('click', async e => {
    const a = e.target.closest && e.target.closest('a[href*="/_blob/"]');
    if (!a || !sb) return;
    e.preventDefault();
    const id = decodeURIComponent(a.getAttribute('href').split('/_blob/')[1] || '');
    const w = window.open('about:blank', '_blank');
    const { data, error } = await sb.storage.from('files').createSignedUrl(id, 300);
    if (error || !data) { if (w) w.close(); alertless('파일을 열지 못했습니다'); return; }
    if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl;
  }, true);

  // ---------------------------------------------------------------- 내려받기
  const downloadsCap = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement('a'); a.href = url; a.download = filename || 'download'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };

  // ---------------------------------------------------------------- window.claude 자리
  window.claude = {
    async use(name) {
      if (!sb) throw err('unavailable');
      await ready;
      if (name === 'db') return dbCap;
      if (name === 'user') return userCap;
      if (name === 'assets') return assetsCap;
      if (name === 'downloads') return downloadsCap;
      throw err('unavailable', name + ' 기능은 이 서버에서 쓰지 않습니다');   // sample(AI 정리) 등
    },
  };

  // ---------------------------------------------------------------- 관리자: 사람 관리 · 데이터 가져오기 · 백업
  async function renderAdmin(box) {
    if (box.dataset.done) return; box.dataset.done = '1';
    if (!me) return;
    box.className = 'dm-admin';
    const mine = `<h3>내 계정</h3><div class="row"><span>${esc(me.name)} · ${esc(me.login)} · ${ROLE_KO[me.role] || ''}</span><button class="btn" type="button" id="dmPw">비밀번호 변경</button></div>`;
    if (me.role !== 'admin') { box.innerHTML = mine; box.querySelector('#dmPw').onclick = changePw; return; }
    box.innerHTML = mine + `<h3>가입 신청 · 회원 관리</h3><button class="btn" type="button" id="dmPeopleRefresh">신청 목록 새로고침</button><div class="scroll" id="dmPeople">불러오는 중…</div>
      <div class="note">승인 대기자는 권한을 선택한 뒤 승인하세요. <b>거절</b>하면 해당 가입 계정이 삭제됩니다. 승인된 회원은 관리자·영업담당·보기 전용 사이에서 권한을 바꿀 수 있습니다. 모든 변경은 서버에서 관리자 여부를 다시 확인합니다.</div>
      <h3>데이터</h3>
      <div class="row"><button class="btn" type="button" id="dmBackup">전체 백업 내려받기 (JSON)</button>
      <label class="btn" style="cursor:pointer">가져오기 (JSON)<input type="file" id="dmImport" accept=".json,application/json" hidden></label><span class="note" id="dmImportMsg"></span></div>
      <div class="note">가져오기는 같은 경로의 문서를 파일 내용으로 덮어씁니다. 처음 옮길 때 한 번만 쓰고, 평소엔 백업만 받아 두세요.</div>`;
    box.querySelector('#dmPw').onclick = changePw;
    box.querySelector('#dmPeopleRefresh').onclick = async () => { await peopleTable(box.querySelector('#dmPeople')); const h = document.querySelector('.dm-me'); if (h) await pendingChip(h); };
    await peopleTable(box.querySelector('#dmPeople'));
    box.querySelector('#dmBackup').onclick = backup;
    box.querySelector('#dmImport').onchange = e => importFile(e.target.files[0], box.querySelector('#dmImportMsg'));
  }
  async function memberAdmin(body) {
    const { data, error } = await sb.functions.invoke('crm-member-admin', { body });
    if (error) {
      let message = '회원관리 서버에 연결하지 못했습니다.';
      try { message = (await error.context?.clone().json())?.error || message; } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  async function peopleTable(el, {pendingOnly=false} = {}) {
    let rows;
    try { rows = (await memberAdmin({ action: 'list' })).members || []; }
    catch { el.textContent = '회원 명단을 불러오지 못했습니다.'; return; }
    const data = rows.filter(r => !pendingOnly || r.role === 'pending').sort((a, b) => (a.role === 'pending' ? 0 : 1) - (b.role === 'pending' ? 0 : 1));
    if (!data.length) { el.innerHTML = '<p class="note">승인 대기 신청이 없습니다.</p>'; return; }
    const options = r => ['sales','view','admin'].map(k => `<option value="${k}" ${r.role === k || (r.role === 'pending' && k === 'sales') ? 'selected' : ''}>${ROLE_KO[k]}</option>`).join('');
    el.innerHTML = `<p class="note">승인 대기 ${data.filter(r => r.role === 'pending').length}명${pendingOnly?'':` · 전체 ${data.length}명`}</p><table><thead><tr><th>아이디</th><th>이름</th><th>신청·가입일</th><th>권한</th><th>처리</th></tr></thead><tbody>${data.map(r => `<tr data-u="${esc(r.user_id)}" data-role="${esc(r.role)}" data-name="${esc(r.name)}" class="${r.role === 'pending' ? 'pend' : ''}">
      <td>${esc(r.login)}</td><td>${esc(r.name)}</td><td><time>${esc(new Date(r.created_at).toLocaleDateString('ko-KR'))}</time></td>
      <td>${r.user_id === me.id ? `<b>${esc(ROLE_KO[r.role])}</b>` : `<select aria-label="${esc(r.name)} 권한">${options(r)}</select>`}</td>
      <td><div class="actions">${r.user_id === me.id ? '<span class="note">내 계정</span>' : r.role === 'pending' ? '<button class="btn" type="button" data-act="approve">승인</button><button class="btn danger" type="button" data-act="reject">거절</button>' : '<button class="btn" type="button" data-act="save">권한 저장</button>'}</div></td></tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('button[data-act]').forEach(button => button.onclick = async () => {
      const tr = button.closest('tr'), action = button.dataset.act, role = tr.querySelector('select')?.value, name = tr.dataset.name;
      if (role === 'admin' && action !== 'reject' && !confirm(`${name} 님에게 관리자 권한을 부여할까요?`)) return;
      if (action === 'reject' && !confirm(`${name} 님의 가입 신청을 거절하고 계정을 삭제할까요?`)) return;
      button.disabled = true;
      try {
        await memberAdmin(action === 'reject' ? { action: 'reject', targetUserId: tr.dataset.u } : { action: 'set_role', targetUserId: tr.dataset.u, role });
        profileCache = null;
        alertless(action === 'reject' ? `${name} 님의 가입 신청을 거절했습니다` : `${name} · ${ROLE_KO[role]}로 저장했습니다`);
        await peopleTable(el, {pendingOnly}); const h = document.querySelector('.dm-me'); h && pendingChip(h);
      } catch (error) { alertless(error.message || '처리하지 못했습니다'); button.disabled = false; }
    });
  }

  async function backup() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('docs').select('path,data,version,updated_at').order('path').range(from, from + 999);
      if (error) { alertless('백업을 받지 못했습니다'); return; }
      all.push(...data); if (data.length < 1000) break;
    }
    const t = new Date(), p = n => String(n).padStart(2, '0');
    downloadsCap.save({ filename: `영업관리_백업_${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}.json`, data: new Blob([JSON.stringify({ exportedAt: t.toISOString(), docs: all }, null, 1)], { type: 'application/json' }) });
  }
  async function importFile(file, msg) {
    if (!file) return;
    let j; try { j = JSON.parse(await file.text()); } catch { msg.textContent = 'JSON 파일이 아닙니다.'; return; }
    const docs = (j.docs || []).filter(d => d && typeof d.path === 'string' && d.path.includes('/') && d.data && typeof d.data === 'object');
    if (!docs.length) { msg.textContent = '가져올 문서가 없습니다.'; return; }
    msg.textContent = `${docs.length}건 넣는 중…`;
    let done = 0;
    for (let i = 0; i < docs.length; i += 100) {
      const chunk = docs.slice(i, i + 100).map(d => ({ path: d.path, data: d.data }));
      const { error } = await sb.from('docs').upsert(chunk, { onConflict: 'path' });
      if (error) { msg.textContent = `${done}건까지 넣고 멈췄습니다: ${error.message}`; return; }
      done += chunk.length; msg.textContent = `${done} / ${docs.length}건…`;
    }
    msg.textContent = `${done}건을 넣었습니다. 새로고침하면 화면에 반영됩니다.`;
  }
  new MutationObserver(() => { const b = document.getElementById('dmAdmin'); if (b && !b.dataset.done) renderAdmin(b); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // ---------------------------------------------------------------- 시작
  async function start() {
    if (!sb) { overlay(`<div class="box"><h1>설정이 필요합니다</h1><p>js/config.js 에 Supabase 주소와 공개 키를 넣어 주세요.</p></div>`); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) afterLogin(session.user); else showLogin();
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // 예약 동기화가 로그인된 화면에서 쓰는 도우미 (관리자만 동작)
  window.dmSync = {
    whoami: () => me && { login: me.login, role: me.role },
    list: async collection => { const r = await query(collection).get(); return r.docs.map(d => ({ id: d.id, data: d.data() })); },
    get: async path => { const d = await docRef(path).get(); return d.exists ? d.data() : null; },
    set: (path, data) => docRef(path).set(data),
    update: (path, patch) => docRef(path).update(patch),
  };
})();

