/* Christine_Ichancy_bet - admin panel */
const app = $('#app');
const TABS = [['overview', 'نظرة عامة', 'chart'], ['deposit', 'الإيداعات', 'plus'], ['withdraw', 'السحوبات', 'arrowdown'], ['promo', 'طلبات الترويج', 'megaphone'], ['ad', 'الإعلانات الممولة', 'zap'], ['users', 'المستخدمون', 'users'], ['methods', 'طرق الدفع والسحب', 'wallet'], ['settings', 'الإعدادات', 'settings']];
const A = {tab: (location.hash.slice(1) || 'overview'), status: 'pending', stats: null};
const SYP = n => fmt(n) + ' ل.س';

async function boot() {
  if (!token()) { location.replace('/#/login'); return; }
  try {
    const me = await api('/api/me');
    if (!me.is_admin) { location.replace('/'); return; }
  } catch (e) { location.replace('/#/login'); return; }
  go(A.tab);
}

async function go(tab) {
  A.tab = TABS.some(t => t[0] === tab) ? tab : 'overview';
  location.hash = A.tab;
  try { A.stats = await api('/api/admin/stats'); } catch (e) { toast(e.message, 'err'); }
  const pend = A.stats ? A.stats.pending : {};
  app.innerHTML = `
  <div class="topbar">
    <a class="brand" href="/admin.html"><img src="/logo.svg" alt=""><span>لوحة التحكم</span></a>
    <div class="top-actions"><a class="iconbtn" href="/" title="الموقع">${ic('home')}</a><button class="iconbtn" data-a="logout">${ic('logout')}</button></div>
  </div>
  <main class="wrap wide">
    <div class="atabs">${TABS.map(([k, t, i]) => `<button data-tab="${k}" class="${A.tab === k ? 'on' : ''}">${ic(i)} ${t}${pend[k] ? `<span class="cnt">${pend[k]}</span>` : ''}</button>`).join('')}</div>
    <div id="view"><div class="empty">جارٍ التحميل…</div></div>
  </main>`;
  try {
    const v = {overview, deposit: () => requests('deposit'), withdraw: () => requests('withdraw'), promo: () => requests('promo'), ad: () => requests('ad'), users, methods, settings}[A.tab];
    await v();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- overview ---------------- */
function overview() {
  const s = A.stats;
  $('#view').innerHTML = `
  <div class="kgrid">
    <div class="kcard"><small>المستخدمون</small><b>${fmt(s.users)}</b></div>
    <div class="kcard"><small>إجمالي أرصدة المستخدمين</small><b>${SYP(s.balance)}</b></div>
    <div class="kcard"><small>الإيداعات المقبولة</small><b>${SYP(s.deposits)}</b></div>
    <div class="kcard"><small>السحوبات المقبولة</small><b>${SYP(s.withdraws)}</b></div>
    <div class="kcard"><small>إيرادات الترويج والإعلانات</small><b>${SYP(s.revenue)}</b></div>
  </div>
  <div class="sect"><span>طلبات بانتظار المراجعة</span></div>
  <div class="kgrid">${Object.entries(s.pending).map(([k, n]) => `<div class="kcard" style="cursor:pointer" data-tab="${k}"><small>${KIND[k]}</small><b>${n}</b></div>`).join('')}</div>`;
}

/* ---------------- requests ---------------- */
function det(r) {
  const e = r.extra || {};
  const cp = t => `<button class="mini" data-copy="${esc(t)}">${ic('copy')}</button>`;
  const link = u => /^https?:\/\//i.test(u) ? `<a class="mono" style="color:var(--deep)" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : `<span class="mono">${esc(u)}</span>`;
  if (r.kind === 'deposit') return `<div><b>${esc(r.method_name)}</b></div><div>رقم العملية: <span class="mono">${esc(r.detail)}</span>${cp(r.detail)}</div>${e.currency && e.currency !== 'SYP' ? `<div class="muted">${r.amount_orig} ${esc(e.currency)} × ${fmt(e.rate)}</div>` : ''}`;
  if (r.kind === 'withdraw') return `<div><b>${esc(r.method_name)}</b></div><div>العنوان: <span class="mono">${esc(r.detail)}</span>${cp(r.detail)}</div>${e.currency && e.currency !== 'SYP' ? `<div class="muted">يُحوَّل ≈ ${r.amount_orig} ${esc(e.currency)}</div>` : ''}`;
  if (r.kind === 'promo') return `<div><b>ترويج ${esc(r.method_name)}</b></div><div>${link(r.detail)}</div>`;
  return `<div class="pre">${esc(e.text || '')}</div><div class="muted">الأهداف: <span class="mono">${esc((e.targets || []).join(' ، '))}</span></div><div>${link(r.detail)}</div>`;
}

async function requests(kind) {
  const rows = await api(`/api/admin/requests?kind=${kind}${A.status ? '&status=' + A.status : ''}`);
  const f = [['pending', 'قيد المراجعة'], ['approved', 'المقبولة'], ['rejected', 'المرفوضة'], ['', 'الكل']];
  $('#view').innerHTML = `
  <div class="filters">${f.map(([k, t]) => `<button data-st="${k}" class="${A.status === k ? 'on' : ''}">${t}</button>`).join('')}</div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>المستخدم</th><th>التفاصيل</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>
  ${rows.length ? rows.map(r => `<tr><td>${r.id}</td><td class="mono">${esc(r.username)}</td><td>${det(r)}</td><td><b>${SYP(r.amount)}</b></td><td>${dt(r.created)}</td>
    <td>${statusBadge(r.status)}${r.admin_note ? `<div class="muted">${esc(r.admin_note)}</div>` : ''}</td>
    <td>${r.status === 'pending' ? `<div class="acts"><button class="btn ok sm" data-act="approve" data-id="${r.id}" data-kind="${kind}">${ic('check')} موافقة</button><button class="btn bad sm" data-act="reject" data-id="${r.id}" data-kind="${kind}">${ic('x')} رفض</button></div>` : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">لا توجد طلبات</td></tr>'}
  </tbody></table></div>`;
}

/* ---------------- users ---------------- */
async function users() {
  const rows = await api('/api/admin/users');
  $('#view').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>المستخدم</th><th>الرصيد</th><th>المدعوون</th><th>التسجيل</th><th>IP</th><th>إجراء</th></tr></thead><tbody>
  ${rows.map(u => `<tr><td>${u.id}</td><td class="mono">${esc(u.username)} ${u.is_admin ? '<span class="pill">مدير</span>' : ''} ${u.banned ? '<span class="badge rejected">موقوف</span>' : ''}</td>
    <td><b>${SYP(u.balance)}</b></td><td>${u.ref_count}</td><td>${dt(u.created)}</td><td class="mono">${esc(u.ip || '')}</td>
    <td>${u.is_admin ? '' : `<div class="acts"><button class="btn ghost sm" data-adj="${u.id}" data-name="${esc(u.username)}">${ic('dollar')} رصيد</button><button class="btn ${u.banned ? 'ok' : 'bad'} sm" data-ban="${u.id}" data-v="${u.banned ? 0 : 1}">${ic('ban')} ${u.banned ? 'رفع الحظر' : 'حظر'}</button></div>`}</td></tr>`).join('')}
  </tbody></table></div>`;
}

/* ---------------- methods ---------------- */
async function methods() {
  const rows = await api('/api/admin/methods');
  window._methods = rows;
  $('#view').innerHTML = `
  <div class="row" style="margin-bottom:12px"><button class="btn" data-a="newMethod">${ic('plus')} إضافة طريقة</button><span class="muted">تُستخدم للإيداع والسحب، مع صورة باركود وعنوان قابل للنسخ</span></div>
  <div class="mgrid">${rows.map(m => `<div class="mbox">
    ${m.image ? `<img src="${esc(m.image)}" alt="">` : ''}
    <div class="row"><b class="grow">${esc(m.name)}</b>${m.active ? '<span class="badge approved">مفعّلة</span>' : '<span class="badge rejected">معطّلة</span>'}</div>
    <div class="muted">${m.currency === 'SYP' ? 'ليرة سورية' : esc(m.currency) + ' • 1 = ' + fmt(m.rate) + ' ل.س'} • حد أدنى ${m.min_amount}</div>
    <div class="muted">${m.for_deposit ? 'إيداع ' : ''}${m.for_deposit && m.for_withdraw ? '+ ' : ''}${m.for_withdraw ? 'سحب' : ''}</div>
    ${m.address ? `<div class="mono" style="font-size:.85rem;margin:6px 0">${esc(m.address)}</div>` : ''}
    <div class="row"><button class="btn ghost sm grow" data-editm="${m.id}">${ic('edit')} تعديل</button><button class="btn bad sm" data-delm="${m.id}">${ic('trash')}</button></div></div>`).join('')}</div>`;
}

function methodForm(m = {}) {
  let img = null, removeImg = false;
  const box = modal(`<h3>${m.id ? 'تعديل الطريقة' : 'إضافة طريقة'}</h3>
  <label class="label">الاسم (يظهر للمستخدم)</label><input id="mn" class="input" value="${esc(m.name || '')}" placeholder="مثال: شام كاش">
  <div class="fgrid">
    <div><label class="label">العملة</label><select id="mc" class="select input"><option value="SYP">ليرة سورية (SYP)</option><option value="USD">دولار (USD)</option></select></div>
    <div id="rw"><label class="label">سعر الصرف: ل.س لكل 1 دولار</label><input id="mr" class="input" type="number" step="any" value="${m.rate && m.currency !== 'SYP' ? m.rate : ''}"></div>
    <div><label class="label">الحد الأدنى (بعملة الطريقة)</label><input id="mmin" class="input" type="number" step="any" value="${m.min_amount ?? 0}"></div>
  </div>
  <label class="label">عنوان الإيداع (قابل للنسخ بضغطة)</label><input id="ma" class="input" dir="ltr" value="${esc(m.address || '')}">
  <label class="label">ملاحظة تظهر للمستخدم</label><input id="mnote" class="input" value="${esc(m.note || '')}">
  <label class="label">صورة الباركود / الطريقة</label>
  <div id="ip">${m.image ? `<img class="qr" src="${esc(m.image)}" alt="">` : ''}</div>
  <div class="row wrapr"><label class="btn ghost sm" style="cursor:pointer">${ic('upload')} اختر صورة<input id="mf" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${m.image ? `<button class="btn ghost sm" id="mrm">${ic('trash')} إزالة الصورة</button>` : ''}</div>
  <div class="row wrapr" style="margin:14px 0"><label class="switch"><input id="md" type="checkbox" ${m.for_deposit ?? 1 ? 'checked' : ''}> للإيداع</label><label class="switch"><input id="mw" type="checkbox" ${m.for_withdraw ?? 1 ? 'checked' : ''}> للسحب</label><label class="switch"><input id="mact" type="checkbox" ${m.active ?? 1 ? 'checked' : ''}> مفعّلة</label></div>
  <button class="btn block" id="msave">حفظ</button>`);
  const el = box.el;
  $('#mc', el).value = m.currency || 'SYP';
  const sync = () => { $('#rw', el).style.display = $('#mc', el).value === 'SYP' ? 'none' : ''; };
  $('#mc', el).onchange = sync; sync();
  $('#mf', el).onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast('الحد الأقصى 3MB', 'err'); return; }
    const rd = new FileReader();
    rd.onload = () => { img = rd.result; removeImg = false; $('#ip', el).innerHTML = `<img class="qr" src="${img}" alt="">`; };
    rd.readAsDataURL(f);
  };
  const rm = $('#mrm', el); if (rm) rm.onclick = () => { removeImg = true; img = null; $('#ip', el).innerHTML = ''; };
  $('#msave', el).onclick = ev => busy(ev.currentTarget, async () => {
    await api('/api/admin/methods', {id: m.id, name: $('#mn', el).value, currency: $('#mc', el).value, rate: $('#mr', el).value, min_amount: $('#mmin', el).value || 0, address: $('#ma', el).value, note: $('#mnote', el).value, for_deposit: $('#md', el).checked, for_withdraw: $('#mw', el).checked, active: $('#mact', el).checked, image_data: img, remove_image: removeImg});
    box.close(); toast('تم الحفظ ✓', 'ok'); methods();
  });
}

/* ---------------- settings ---------------- */
async function settings() {
  const s = await api('/api/admin/settings');
  const n = (id, label, v) => `<div><label class="label">${label}</label><input id="${id}" class="input" type="number" min="0" value="${v}"></div>`;
  $('#view').innerHTML = `
  <div class="card"><h3 style="margin:0 0 4px">الحدود والأسعار</h3>
    <div class="fgrid">
      ${n('s_min_deposit', 'أقل مبلغ للإيداع (ل.س)', s.min_deposit)}${n('s_min_withdraw', 'أقل مبلغ للسحب (ل.س)', s.min_withdraw)}
      ${n('s_ref_bonus', 'مكافأة كل دعوة (ل.س)', s.ref_bonus)}${n('s_promo_week', 'سعر ترويج أسبوع (ل.س)', s.promo_week)}
      ${n('s_promo_month', 'سعر ترويج شهر (ل.س)', s.promo_month)}${n('s_ad_min', 'أقل مبلغ للإعلان الممول (ل.س)', s.ad_min)}
      ${n('s_ad_max_chars', 'أقصى عدد أحرف للإعلان', s.ad_max_chars)}${n('s_max_accounts_per_ip', 'أقصى عدد حسابات لكل IP (0 = بدون حد)', s.max_accounts_per_ip)}
    </div></div>
  <div class="card"><h3 style="margin:0 0 4px">الكلمات الممنوعة في الإعلان الممول</h3><p class="muted" style="margin:0">كلمة أو عبارة في كل سطر</p>
    <textarea id="s_words" class="input" dir="auto" style="min-height:110px">${esc(s.banned_words.join('\n'))}</textarea></div>
  <div class="card"><h3 style="margin:0 0 8px">قنوات الترويج</h3><div id="chs"></div>
    <button class="btn ghost sm" id="addch">${ic('plus')} إضافة قناة</button></div>
  <button class="btn block lg" id="ssave">${ic('check')} حفظ الإعدادات</button>
  <div class="card" style="margin-top:18px"><h3 style="margin:0 0 4px">تغيير كلمة سر المدير</h3>
    <div class="fgrid"><div><label class="label">الحالية</label><input id="p_old" type="password" class="input" dir="ltr" autocomplete="current-password"></div>
    <div><label class="label">الجديدة (8 أحرف على الأقل)</label><input id="p_new" type="password" class="input" dir="ltr" autocomplete="new-password"></div></div>
    <button class="btn dark sm" style="margin-top:12px" id="psave">تغيير كلمة السر</button></div>`;
  const chs = $('#chs');
  const addRow = (c = {name: 'قناة تلجرام', count: 0}) => {
    const d = document.createElement('div'); d.className = 'chrow';
    d.innerHTML = `<input class="input cn" value="${esc(c.name)}" placeholder="اسم القناة"><input class="input cc" type="number" min="0" value="${c.count}" placeholder="عدد المتابعين"><button class="btn bad sm" type="button">${ic('trash')}</button>`;
    $('button', d).onclick = () => d.remove(); chs.appendChild(d);
  };
  s.channels.forEach(addRow);
  $('#addch').onclick = () => addRow();
  $('#ssave').onclick = ev => busy(ev.currentTarget, async () => {
    const body = {};
    ['min_deposit', 'min_withdraw', 'ref_bonus', 'promo_week', 'promo_month', 'ad_min', 'ad_max_chars', 'max_accounts_per_ip'].forEach(k => body[k] = $('#s_' + k).value || 0);
    body.banned_words = $('#s_words').value.split('\n').map(x => x.trim()).filter(Boolean);
    body.channels = $$('.chrow', chs).map(r => ({name: $('.cn', r).value, count: $('.cc', r).value || 0}));
    await api('/api/admin/settings', body); toast('تم حفظ الإعدادات ✓', 'ok');
  });
  $('#psave').onclick = ev => busy(ev.currentTarget, async () => {
    await api('/api/admin/password', {old: $('#p_old').value, new: $('#p_new').value});
    $('#p_old').value = $('#p_new').value = ''; toast('تم تغيير كلمة السر ✓', 'ok');
  });
}

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab]'); if (t) return go(t.dataset.tab);
  const st = e.target.closest('[data-st]'); if (st) { A.status = st.dataset.st; return go(A.tab); }
  const act = e.target.closest('[data-act]');
  if (act) {
    const approve = act.dataset.act === 'approve';
    const note = approve ? (confirm('تأكيد الموافقة على الطلب؟') ? '' : null) : prompt('سبب الرفض (اختياري):', '');
    if (note === null) return;
    return busy(act, async () => { await api(`/api/admin/requests/${act.dataset.id}/${act.dataset.act}`, {note}); toast(approve ? 'تمت الموافقة وأُرسل إشعار للمستخدم ✓' : 'تم الرفض وأُرسل إشعار للمستخدم ✓', 'ok'); go(A.tab); });
  }
  const ban = e.target.closest('[data-ban]');
  if (ban) return busy(ban, async () => { await api(`/api/admin/users/${ban.dataset.ban}/ban`, {banned: +ban.dataset.v}); go('users'); });
  const adj = e.target.closest('[data-adj]');
  if (adj) {
    const v = prompt(`تعديل رصيد ${adj.dataset.name}\nاكتب مبلغاً موجباً للإضافة أو سالباً للخصم (ل.س):`);
    if (!v) return;
    return busy(adj, async () => { await api(`/api/admin/users/${adj.dataset.adj}/adjust`, {amount: v, note: 'تعديل من الإدارة'}); toast('تم تعديل الرصيد ✓', 'ok'); go('users'); });
  }
  const em = e.target.closest('[data-editm]'); if (em) return methodForm(window._methods.find(m => m.id == em.dataset.editm));
  const dm = e.target.closest('[data-delm]');
  if (dm && confirm('حذف هذه الطريقة نهائياً؟')) return busy(dm, async () => { await api(`/api/admin/methods/${dm.dataset.delm}/delete`, {}); methods(); });
  const a = e.target.closest('[data-a]');
  if (a && a.dataset.a === 'newMethod') return methodForm();
  if (a && a.dataset.a === 'logout') { try { await api('/api/logout', {}); } catch (x) {} setToken(''); location.replace('/'); }
});

boot();
