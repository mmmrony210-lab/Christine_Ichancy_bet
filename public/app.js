/* Christine_Ichancy_bet - user app */
const app = $('#app');
const S = {pub: null, me: null, plan: 'week', ref: ''};
try {
  const q = new URLSearchParams(location.search).get('ref');
  if (q) localStorage.setItem('ref', q.slice(0, 20));
  S.ref = localStorage.getItem('ref') || '';
} catch (e) {}

const NAV = [['home', 'الرئيسية', 'home'], ['earn', 'كسب المال', 'gift'], ['promo', 'ترويج', 'megaphone'], ['ads', 'إعلان ممول', 'zap'], ['history', 'طلباتي', 'list']];
const totalReach = () => S.pub.channels.reduce((a, c) => a + c.count, 0);
const refLink = () => `${location.origin}/?ref=${S.me.ref_code}`;

async function boot() {
  try { S.pub = await api('/api/public'); } catch (e) { app.innerHTML = '<div class="empty">تعذر الاتصال بالخادم</div>'; return; }
  if (token()) { try { S.me = await api('/api/me'); } catch (e) { setToken(''); } }
  render();
}

async function refreshMe() { try { S.me = await api('/api/me'); } catch (e) {} }

function render() {
  const h = location.hash.replace(/^#\/?/, '');
  window.scrollTo(0, 0);
  if (!S.me) return (h === 'login' || h === 'register') ? authView(h) : landing();
  if (S.me.is_admin) { location.replace('/admin.html'); return; }
  const v = {home: homeView, earn: earnView, promo: promoView, ads: adsView, history: historyView, notifs: notifView}[h] || homeView;
  v();
}
window.addEventListener('hashchange', render);

/* ---------------- landing ---------------- */
function landing() {
  const p = S.pub;
  app.innerHTML = `
  <div class="land-nav">
    <a class="brand" href="#/"><img src="/logo.svg" alt=""><span>${esc(p.site_name)}</span></a>
    <a class="btn sm" href="#/login">${ic('logout')} دخول</a>
  </div>
  <section class="hero">
    <img class="logo-big" src="/logo.svg" alt="">
    <h1>روّج لبوتك وقناتك ومشروعك <em>أمام آلاف المتابعين</em></h1>
    <p>أنشئ حسابك، اشحن رصيدك، واختر باقة الترويج. يُنشر إعلانك عبر جميع قنوات تلجرام لدينا في وقت واحد.</p>
    <a class="btn lg" href="#/login">${ic('zap')} الدخول إلى ${esc(p.site_name)}</a>
    <div class="kpis">
      <div class="kpi"><b>${fmt(totalReach())}+</b><small>إجمالي المتابعين</small></div>
      <div class="kpi"><b>${p.channels.length}</b><small>قنوات تلجرام</small></div>
      <div class="kpi"><b>${fmt(p.promo_week)}</b><small>ل.س / أسبوع</small></div>
    </div>
  </section>
  <section class="section">
    <h2>خدماتنا</h2><p class="lead">كل ما تحتاجه لنشر مشروعك وزيادة وصولك</p>
    <div class="cards3">
      <div class="feat"><div class="fic">${ic('megaphone')}</div><h3>ترويج القنوات والبوتات</h3><p>أدخل رابط البوت أو القناة أو المشروع، وسيُروَّج لك عبر جميع القنوات المتاحة معاً لمدة أسبوع أو شهر.</p></div>
      <div class="feat"><div class="fic">${ic('zap')}</div><h3>إعلان ممول مستهدف</h3><p>اكتب نصاً قصيراً حتى ${p.ad_max_chars} حرفاً، وحدد البوتات التي تريد استهدافها، وأنت تختار الميزانية.</p></div>
      <div class="feat"><div class="fic">${ic('gift')}</div><h3>اكسب من الإحالات</h3><p>شارك رابط دعوتك واحصل على ${p.ref_bonus} ل.س عن كل شخص ينضم، ثم اسحب أرباحك.</p></div>
    </div>
  </section>
  <section class="section">
    <h2>كيف تبدأ؟</h2><p class="lead">أربع خطوات فقط</p>
    <div class="steps">
      <div class="step"><b>أنشئ حساباً</b><p class="muted">اسم مستخدم وكلمة سر، وحساب واحد لكل مستخدم.</p></div>
      <div class="step"><b>اشحن رصيدك</b><p class="muted">اختر طريقة الدفع وأرسل رقم العملية.</p></div>
      <div class="step"><b>اختر الخدمة</b><p class="muted">ترويج بباقة أسبوعية/شهرية أو إعلان ممول.</p></div>
      <div class="step"><b>نراجع وننشر</b><p class="muted">يصلك إشعار فور الموافقة أو الرفض.</p></div>
    </div>
  </section>
  <section class="section">
    <h2>الباقات</h2><p class="lead">الإعلان يُنشر في جميع القنوات (${fmt(totalReach())} متابع)</p>
    <div class="plans">
      <div class="plan"><small>باقة</small><b>أسبوع</b><div class="pr">${fmt(p.promo_week)}<small> ل.س</small></div></div>
      <div class="plan sel"><small>باقة</small><b>شهر</b><div class="pr">${fmt(p.promo_month)}<small> ل.س</small></div></div>
    </div>
  </section>
  <section class="section"><div class="band">
    <h2 style="color:#fff">هويتنا البصرية</h2>
    <div class="palette"><i style="background:#ff7cc0"></i><i style="background:#ff2e93"></i><i style="background:#c2185b"></i><i style="background:#ffd6ea"></i><i style="background:#2a0f22"></i></div>
    <p style="opacity:.85;margin:0">وردي حيوي، خطوط واضحة، وأيقونات مصممة للترويج.</p>
    <a class="btn" href="/brand.html">${ic('eye')} استعرض الهوية</a>
  </div></section>
  <div class="foot">© ${new Date().getFullYear()} ${esc(p.site_name)}</div>`;
}

/* ---------------- auth ---------------- */
function authView(mode) {
  const reg = mode === 'register';
  app.innerHTML = `
  <div class="auth">
    <a href="#/"><img class="logo-big" src="/logo.svg" alt=""></a>
    <h2 style="text-align:center;margin:6px 0 0" class="brand-name">${esc(S.pub.site_name)}</h2>
    <div class="tabs"><a href="#/login" class="${reg ? '' : 'on'}">تسجيل الدخول</a><a href="#/register" class="${reg ? 'on' : ''}">حساب جديد</a></div>
    <div class="card" style="margin-top:12px">
      <label class="label">اسم المستخدم</label>
      <input id="u" class="input" dir="ltr" autocomplete="username" autocapitalize="off" placeholder="username">
      <label class="label">كلمة السر</label>
      <input id="pw" class="input" dir="ltr" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="••••••">
      ${reg ? `<label class="label">كود الدعوة (اختياري)</label><input id="rf" class="input" dir="ltr" value="${esc(S.ref)}" placeholder="ABC123">` : ''}
      <button class="btn block" style="margin-top:18px" id="go">${reg ? 'إنشاء الحساب' : 'دخول'}</button>
      ${reg ? '<p class="muted" style="font-size:.85rem;margin:12px 0 0">حساب واحد لكل مستخدم. اسم المستخدم 3-24 حرفاً إنجليزياً.</p>' : ''}
    </div>
  </div>`;
  const go = async () => busy($('#go'), async () => {
    const body = {username: $('#u').value.trim(), password: $('#pw').value};
    if (reg) body.ref = ($('#rf').value || '').trim();
    const r = await api(reg ? '/api/register' : '/api/login', body);
    setToken(r.token);
    if (r.is_admin) { location.href = '/admin.html'; return; }
    await refreshMe();
    location.hash = '#/home';
    render();
  });
  $('#go').onclick = go;
  $('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

/* ---------------- shell ---------------- */
function shell(inner, active) {
  app.innerHTML = `
  <div class="topbar">
    <a class="brand" href="#/home"><img src="/logo.svg" alt=""><span>${esc(S.pub.site_name)}</span></a>
    <div class="top-actions">
      <span class="balchip">${fmt(S.me.balance)} ل.س</span>
      <a class="iconbtn" href="#/notifs" aria-label="الإشعارات">${ic('bell')}${S.me.unread ? `<i class="dot">${S.me.unread}</i>` : ''}</a>
      <button class="iconbtn" data-a="logout" aria-label="خروج">${ic('logout')}</button>
    </div>
  </div>
  <main class="wrap">${inner}</main>
  <nav class="bnav">${NAV.map(([k, t, i]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}">${ic(i)}<span>${t}</span></a>`).join('')}</nav>`;
}

/* ---------------- home ---------------- */
function homeView() {
  shell(`
  <div class="bal">
    <small>رصيدك الحالي</small>
    <div class="amt">${fmt(S.me.balance)}<span>ل.س</span></div>
    <button class="btn" data-a="deposit">${ic('plus')} إضافة رصيد</button>
  </div>
  <div class="tiles">
    <a class="tile" href="#/earn"><div class="tic">${ic('gift')}</div><b>كسب المال</b><small>رابط الإحالة وسحب الأرباح</small></a>
    <a class="tile" href="#/promo"><div class="tic">${ic('megaphone')}</div><b>ترويج</b><small>روّج لبوتك أو قناتك</small></a>
    <a class="tile" href="#/ads"><div class="tic">${ic('zap')}</div><b>إعلان ممول</b><small>استهدف بوتات محددة</small></a>
    <a class="tile" href="#/history"><div class="tic">${ic('list')}</div><b>طلباتي</b><small>تابع حالة طلباتك</small></a>
  </div>`, 'home');
}

/* ---------------- earn ---------------- */
function earnView() {
  const p = S.pub;
  shell(`
  <h2 class="h">كسب المال</h2>
  <p class="sub">اربح ${p.ref_bonus} ل.س عن كل شخص تدعوه للانضمام عبر رابطك</p>
  <div class="card">
    <b>رابط الإحالة الخاص بك</b>
    <div class="refbox"><span class="mono">${esc(refLink())}</span></div>
    <div class="row">
      <button class="btn grow" data-a="copyRef">${ic('copy')} نسخ</button>
      <button class="btn ghost grow" data-a="shareRef">${ic('share')} مشاركة</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${fmt(S.me.ref_count)}</b><small>عدد المدعوين</small></div>
      <div class="stat"><b>${fmt(S.me.ref_earned)}</b><small>أرباح الإحالة (ل.س)</small></div>
    </div>
  </div>
  <button class="btn block lg" data-a="withdraw">${ic('arrowdown')} سحب الأرباح</button>
  <div class="note">${ic('shield')}<span>الحد الأدنى للسحب ${fmt(p.min_withdraw)} ل.س. تتم مراجعة طلبات السحب يدوياً.</span></div>`, 'earn');
}

/* ---------------- promo ---------------- */
function promoView() {
  const p = S.pub;
  shell(`
  <h2 class="h">ترويج لبوتك • قناتك • مشروعك</h2>
  <p class="sub">ادخل الرابط المراد الترويج له</p>
  <label class="label">رابط البوت / القناة / المشروع</label>
  <input id="plink" class="input" dir="ltr" placeholder="https://t.me/your_bot">
  <div class="sect"><span>القنوات المتوفرة للترويج</span><span class="pill">${fmt(totalReach())} متابع</span></div>
  <div class="scroller">${p.channels.map(c => `<div class="chan"><div class="cic">${ic('send')}</div><small>${esc(c.name)}</small><b>${fmt(c.count)}</b><small>متابع</small></div>`).join('')}</div>
  <div class="note">${ic('zap')}<span>يتم الترويج لإعلانك عبر <b>جميع القنوات</b> المذكورة أعلاه في الوقت نفسه.</span></div>
  <div class="sect"><span>اختر مدة الترويج</span></div>
  <div class="plans">
    <div class="plan ${S.plan === 'week' ? 'sel' : ''}" data-a="plan" data-plan="week"><small>لمدة</small><b>أسبوع</b><div class="pr">${fmt(p.promo_week)}<small> ل.س</small></div></div>
    <div class="plan ${S.plan === 'month' ? 'sel' : ''}" data-a="plan" data-plan="month"><small>لمدة</small><b>شهر</b><div class="pr">${fmt(p.promo_month)}<small> ل.س</small></div></div>
  </div>
  <button class="btn block lg" data-a="doPromo">${ic('megaphone')} ترويج</button>
  <p class="muted" style="text-align:center;font-size:.88rem">رصيدك: ${fmt(S.me.balance)} ل.س — يُخصم المبلغ عند الإرسال ويُعاد إليك إن رُفض الطلب</p>`, 'promo');
}

/* ---------------- ads ---------------- */
function adsView() {
  const p = S.pub;
  shell(`
  <h2 class="h">إعلان ممول</h2>
  <p class="sub">اكتب نص إعلانك واستهدف البوتات التي تريدها</p>
  <label class="label">نص الإعلان (حتى ${p.ad_max_chars} حرفاً)</label>
  <textarea id="adt" class="input" maxlength="${p.ad_max_chars}" placeholder="اكتب نص الإعلان هنا"></textarea>
  <div class="counter" id="cnt">0 / ${p.ad_max_chars}</div>
  <div class="note warn">${ic('ban')}<div><b>ممنوع كتابة الكلمات التالية في النص:</b><div class="chips">${p.banned_words.map(w => `<span class="chip">${esc(w)}</span>`).join('')}</div></div></div>
  <label class="label">أسماء البوتات المراد استهدافها (كل بوت في سطر)</label>
  <textarea id="adg" class="input" dir="ltr" placeholder="@bot_one&#10;@bot_two"></textarea>
  <label class="label">المبلغ الذي تريد الترويج به (ل.س) — الحد الأدنى ${fmt(p.ad_min)}</label>
  <input id="ada" class="input" type="number" inputmode="numeric" min="${p.ad_min}" placeholder="${p.ad_min}">
  <label class="label">رابط المراد الترويج له</label>
  <input id="adl" class="input" dir="ltr" placeholder="https://t.me/your_bot">
  <button class="btn block lg" style="margin-top:18px" data-a="doAd">${ic('zap')} إرسال الإعلان</button>
  <p class="muted" style="text-align:center;font-size:.88rem">رصيدك: ${fmt(S.me.balance)} ل.س — يُعاد المبلغ إن رُفض الإعلان</p>`, 'ads');
  const t = $('#adt');
  t.addEventListener('input', () => {
    const c = $('#cnt'); c.textContent = `${t.value.length} / ${p.ad_max_chars}`;
    c.classList.toggle('over', t.value.length >= p.ad_max_chars);
  });
}

/* ---------------- history ---------------- */
function reqDesc(r) {
  const e = r.extra || {};
  if (r.kind === 'deposit') return `${esc(r.method_name)} • رقم العملية: <span class="mono">${esc(r.detail)}</span>`;
  if (r.kind === 'withdraw') return `${esc(r.method_name)} • <span class="mono">${esc(r.detail)}</span>`;
  if (r.kind === 'promo') return `ترويج ${esc(r.method_name)} • <span class="mono">${esc(r.detail)}</span>`;
  return `${esc((e.text || '').slice(0, 70))}${(e.text || '').length > 70 ? '…' : ''}`;
}
const KIC = {deposit: 'plus', withdraw: 'arrowdown', promo: 'megaphone', ad: 'zap'};
async function historyView() {
  shell('<h2 class="h">طلباتي</h2><p class="sub">جميع عملياتك وحالتها</p><div id="hl"><div class="empty">جارٍ التحميل…</div></div>', 'history');
  try {
    const rows = await api('/api/history');
    $('#hl').innerHTML = rows.length ? rows.map(r => `
      <div class="item"><div class="ico">${ic(KIC[r.kind])}</div>
        <div class="grow"><div class="t">${KIND[r.kind]} — ${fmt(r.amount)} ل.س</div>
          <div class="d">${reqDesc(r)}</div>
          <div class="d">${dt(r.created)}${r.admin_note ? ' • ' + esc(r.admin_note) : ''}</div></div>
        ${statusBadge(r.status)}</div>`).join('') : '<div class="empty">لا توجد طلبات بعد</div>';
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- notifications ---------------- */
async function notifView() {
  shell('<h2 class="h">الإشعارات</h2><div id="nl"><div class="empty">جارٍ التحميل…</div></div>', '');
  try {
    const rows = await api('/api/notifications');
    $('#nl').innerHTML = rows.length ? rows.map(n => `
      <div class="item ${n.read ? '' : 'unread'}"><div class="ico">${ic('bell')}</div>
        <div class="grow"><div class="t" style="font-weight:700">${esc(n.text)}</div><div class="d">${dt(n.created)}</div></div></div>`).join('') : '<div class="empty">لا توجد إشعارات</div>';
    if (S.me.unread) { await api('/api/notifications/read', {}); S.me.unread = 0; $$('.dot').forEach(d => d.remove()); }
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- deposit modal ---------------- */
async function openDeposit() {
  let ms;
  try { ms = await api('/api/methods?for=deposit'); } catch (e) { return toast(e.message, 'err'); }
  const m = modal('<h3>إضافة رصيد</h3><div id="mb"></div>');
  const body = $('#mb', m.el);
  const list = () => {
    body.innerHTML = ms.length ? `<p class="muted">اختر طريقة الإيداع • الحد الأدنى ${fmt(S.pub.min_deposit)} ل.س</p><div class="mlist">${ms.map(x => `
      <button class="mcard" data-i="${x.id}">${x.image ? `<img src="${esc(x.image)}" alt="">` : `<span class="mico">${ic('wallet')}</span>`}
      <div class="grow"><b>${esc(x.name)}</b><small>${x.currency === 'SYP' ? 'ليرة سورية' : 'عملة: ' + esc(x.currency)}</small></div>${ic('chev')}</button>`).join('')}</div>` : '<div class="empty">لا توجد طرق إيداع متاحة حالياً</div>';
    $$('.mcard', body).forEach(b => b.onclick = () => detail(ms.find(z => z.id == b.dataset.i)));
  };
  const detail = x => {
    const usd = x.currency !== 'SYP';
    body.innerHTML = `
      <button class="btn ghost sm" id="back">${ic('chev')} رجوع</button>
      <div class="sect"><span>${esc(x.name)}</span></div>
      ${x.image ? `<img class="qr" src="${esc(x.image)}" alt="">` : ''}
      ${x.address ? `<label class="label">عنوان الإيداع</label><div class="addr"><span class="mono">${esc(x.address)}</span><button class="btn sm" data-copy="${esc(x.address)}">${ic('copy')} نسخ</button></div>` : ''}
      ${usd ? `<div class="note">${ic('dollar')}<span>سعر الصرف: 1 ${esc(x.currency)} = <b>${fmt(x.rate)}</b> ل.س — يُضاف الرصيد بالليرة حسب هذا السعر</span></div>` : ''}
      ${x.note ? `<div class="note">${ic('shield')}<span>${esc(x.note)}</span></div>` : ''}
      <label class="label">المبلغ المُحوَّل ${usd ? '(' + esc(x.currency) + ')' : '(ل.س)'}${x.min_amount ? ' — الحد الأدنى ' + x.min_amount : ''}</label>
      <input id="da" class="input" type="number" inputmode="decimal" min="0" step="any">
      ${usd ? '<div class="counter" id="prev"></div>' : ''}
      <label class="label">رقم العملية / معرّف التحويل</label>
      <input id="dt" class="input" dir="ltr" placeholder="رقم العملية">
      <button class="btn block" style="margin-top:16px" id="sub">إرسال طلب الإيداع</button>`;
    $('#back', body).onclick = list;
    if (usd) $('#da', body).addEventListener('input', e => { $('#prev', body).textContent = `سيُضاف: ${fmt(Math.round((+e.target.value || 0) * x.rate))} ل.س`; });
    $('#sub', body).onclick = ev => busy(ev.currentTarget, async () => {
      await api('/api/deposit', {method_id: x.id, amount: $('#da', body).value, txid: $('#dt', body).value});
      m.close(); toast('تم إرسال الطلب، بانتظار الموافقة ✓', 'ok'); location.hash = '#/history'; render();
    });
  };
  list();
}

/* ---------------- withdraw modal ---------------- */
async function openWithdraw() {
  let ms;
  try { ms = await api('/api/methods?for=withdraw'); } catch (e) { return toast(e.message, 'err'); }
  const m = modal(`<h3>سحب الأرباح</h3><p class="muted">رصيدك: ${fmt(S.me.balance)} ل.س • الحد الأدنى للسحب ${fmt(S.pub.min_withdraw)} ل.س</p>
    ${ms.length ? `<label class="label">طريقة السحب</label>
    <select id="wm" class="select input">${ms.map(x => `<option value="${x.id}">${esc(x.name)}${x.currency !== 'SYP' ? ' (' + esc(x.currency) + ')' : ''}</option>`).join('')}</select>
    <div id="wrate" class="counter"></div>
    <label class="label">المبلغ (ل.س)</label><input id="wa" class="input" type="number" inputmode="numeric" min="${S.pub.min_withdraw}">
    <label class="label">عنوان السحب / رقم المحفظة</label><input id="wd" class="input" dir="ltr" placeholder="ضع عنوانك هنا">
    <button class="btn block" style="margin-top:16px" id="wsub">إرسال طلب السحب</button>` : '<div class="empty">لا توجد طرق سحب متاحة حالياً</div>'}`);
  if (!ms.length) return;
  const el = m.el, cur = () => ms.find(x => x.id == $('#wm', el).value);
  const upd = () => { const x = cur(), a = +$('#wa', el).value || 0; $('#wrate', el).textContent = x.currency !== 'SYP' ? `1 ${x.currency} = ${fmt(x.rate)} ل.س${a ? ' • ستستلم ≈ ' + (a / x.rate).toFixed(2) + ' ' + x.currency : ''}` : ''; };
  $('#wm', el).onchange = upd; $('#wa', el).oninput = upd; upd();
  $('#wsub', el).onclick = ev => busy(ev.currentTarget, async () => {
    await api('/api/withdraw', {method_id: cur().id, amount: $('#wa', el).value, address: $('#wd', el).value});
    m.close(); await refreshMe(); toast('تم إرسال طلب السحب، بانتظار الموافقة ✓', 'ok'); location.hash = '#/history'; render();
  });
}

/* ---------------- actions ---------------- */
async function shareRef() {
  const data = {title: S.pub.site_name, text: `انضم إلى ${S.pub.site_name} وروّج لمشروعك`, url: refLink()};
  if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const m = modal(`<h3>مشاركة الرابط</h3><div class="mlist">
    <a class="btn" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(data.url)}&text=${encodeURIComponent(data.text)}">${ic('send')} تلجرام</a>
    <a class="btn ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(data.text + ' ' + data.url)}">${ic('share')} واتساب</a>
    <button class="btn ghost" data-copy="${esc(data.url)}">${ic('copy')} نسخ الرابط</button></div>`);
}

const actions = {
  logout: async () => { try { await api('/api/logout', {}); } catch (e) {} setToken(''); S.me = null; location.hash = '#/'; render(); },
  deposit: openDeposit,
  withdraw: openWithdraw,
  copyRef: () => copyText(refLink()),
  shareRef,
  plan: el => { S.plan = el.dataset.plan; $$('.plan[data-plan]').forEach(p => p.classList.toggle('sel', p.dataset.plan === S.plan)); },
  doPromo: el => busy(el, async () => {
    const price = S.plan === 'week' ? S.pub.promo_week : S.pub.promo_month;
    if (S.me.balance < price) { toast('رصيدك غير كافي', 'err'); return; }
    if (!confirm(`سيتم خصم ${fmt(price)} ل.س من رصيدك. متابعة؟`)) return;
    await api('/api/promo', {link: $('#plink').value, plan: S.plan});
    await refreshMe(); toast('تم إرسال طلب الترويج، بانتظار الموافقة ✓', 'ok'); location.hash = '#/history'; render();
  }),
  doAd: el => busy(el, async () => {
    const amt = +$('#ada').value || 0;
    if (amt >= S.pub.ad_min && S.me.balance < amt) { toast('رصيدك غير كافي', 'err'); return; }
    await api('/api/ad', {text: $('#adt').value, targets: $('#adg').value, amount: amt, link: $('#adl').value});
    await refreshMe(); toast('تم إرسال الإعلان، بانتظار الموافقة ✓', 'ok'); location.hash = '#/history'; render();
  })
};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]');
  if (a && actions[a.dataset.a]) actions[a.dataset.a](a, e);
});

boot();
