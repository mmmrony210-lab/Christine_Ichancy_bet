#!/usr/bin/env python3
"""Christine_Ichancy_bet - promotion platform server (Python 3.8+, standard library only).

Run:  python3 app.py
Env:  PORT (default 8000), ADMIN_USER, ADMIN_PASS (used only on first run), TRUST_PROXY=1 behind nginx
"""
import base64, hashlib, hmac, json, math, mimetypes, os, re, secrets, sqlite3, threading, time, traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
UP = os.path.join(DATA, "uploads")
PUB = os.path.realpath(os.path.join(BASE, "public"))
os.makedirs(UP, exist_ok=True)
DB_PATH = os.path.join(DATA, "site.db")
ADMIN_USER = os.environ.get("ADMIN_USER", "Christine_Ichancy_bet")
ADMIN_PASS = os.environ.get("ADMIN_PASS")  # if unset, a random password is generated on first run
PORT = int(os.environ.get("PORT", "8000"))
TRUST_PROXY = os.environ.get("TRUST_PROXY") == "1"
MAX_BODY = 6 * 1024 * 1024
SESSION_DAYS = 30
lock = threading.Lock()


class ApiError(Exception):
    def __init__(self, code, msg):
        self.code, self.msg = code, msg


def now():
    return int(time.time())


# ---------------------------------------------------------------- database
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, salt TEXT, pw TEXT,
  balance INTEGER DEFAULT 0, ref_code TEXT UNIQUE, referred_by INTEGER,
  ref_count INTEGER DEFAULT 0, ref_earned INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0, banned INTEGER DEFAULT 0, ip TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS methods(
  id INTEGER PRIMARY KEY, name TEXT, currency TEXT DEFAULT 'SYP', rate REAL DEFAULT 1,
  address TEXT, image TEXT, min_amount REAL DEFAULT 0, note TEXT,
  for_deposit INTEGER DEFAULT 1, for_withdraw INTEGER DEFAULT 1, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS requests(
  id INTEGER PRIMARY KEY, kind TEXT, user_id INTEGER, amount INTEGER, amount_orig REAL,
  method_id INTEGER, method_name TEXT, detail TEXT, extra TEXT,
  status TEXT DEFAULT 'pending', admin_note TEXT, created INTEGER, updated INTEGER);
CREATE INDEX IF NOT EXISTS ix_req_kind ON requests(kind, status);
CREATE INDEX IF NOT EXISTS ix_req_user ON requests(user_id);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY, user_id INTEGER, text TEXT, read INTEGER DEFAULT 0, created INTEGER);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, amount INTEGER, note TEXT, created INTEGER);
"""

DEFAULTS = {
    "site_name": "Christine_Ichancy_bet",
    "min_deposit": "1000",
    "min_withdraw": "5000",
    "ref_bonus": "10",
    "promo_week": "3500",
    "promo_month": "8000",
    "ad_min": "2000",
    "ad_max_chars": "160",
    "max_accounts_per_ip": "0",
    "banned_words": json.dumps(["bet", "بونص", "ربح مضمون"], ensure_ascii=False),
    "channels": json.dumps(
        [{"name": "قناة تلجرام", "count": n} for n in (18000, 36000, 36000, 11000, 10000)],
        ensure_ascii=False),
}


def db():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    return c


def settings(c):
    s = dict(DEFAULTS)
    for r in c.execute("SELECT k,v FROM settings"):
        s[r["k"]] = r["v"]
    out = {}
    for k, v in s.items():
        if k in ("banned_words", "channels"):
            out[k] = json.loads(v)
        elif k == "site_name":
            out[k] = v
        else:
            out[k] = int(float(v))
    return out


def hpw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 150000).hex()


def mkuser(c, username, pw, admin=0, ref_by=None, ip=""):
    salt = secrets.token_hex(16)
    cur = c.execute(
        "INSERT INTO users(username,salt,pw,ref_code,referred_by,is_admin,ip,created) VALUES(?,?,?,?,?,?,?,?)",
        (username, salt, hpw(pw, salt), secrets.token_hex(4), ref_by, admin, ip, now()))
    return cur.lastrowid


def init_db():
    c = db()
    c.executescript(SCHEMA)
    if not c.execute("SELECT 1 FROM users WHERE is_admin=1").fetchone():
        pw = ADMIN_PASS
        if not pw:
            pw = secrets.token_urlsafe(12)
            print("=" * 60)
            print(f"First run: admin account created.\n  user: {ADMIN_USER}\n  pass: {pw}")
            print("Save this password now; it is shown only once. Change it from the admin panel.")
            print("=" * 60)
        elif len(pw) < 8:
            raise SystemExit("ADMIN_PASS must be at least 8 characters")
        mkuser(c, ADMIN_USER, pw, admin=1)
    if not c.execute("SELECT 1 FROM methods").fetchone():
        # Disabled examples so nobody pays to a placeholder address. Edit them in the admin panel.
        c.execute("INSERT INTO methods(name,currency,rate,address,min_amount,note,active) VALUES(?,?,?,?,?,?,0)",
                  ("مثال: تحويل بالليرة السورية", "SYP", 1, "ضع العنوان هنا", 1000, "عدّل هذه الطريقة وفعّلها"))
        c.execute("INSERT INTO methods(name,currency,rate,address,min_amount,note,active) VALUES(?,?,?,?,?,?,0)",
                  ("مثال: USDT", "USD", 15000, "ضع العنوان هنا", 1, "عدّل سعر الصرف وفعّلها"))
    c.commit()
    c.close()


# ---------------------------------------------------------------- helpers
RL = {}


def rate(key, name, n, win):
    k, t = (key, name), now()
    L = [x for x in RL.get(k, []) if x > t - win]
    if len(L) >= n:
        raise ApiError(429, "محاولات كثيرة، حاول لاحقاً")
    L.append(t)
    RL[k] = L


def notify(c, uid, text):
    c.execute("INSERT INTO notifications(user_id,text,created) VALUES(?,?,?)", (uid, text, now()))


def ledger(c, uid, typ, amt, note=""):
    c.execute("INSERT INTO ledger(user_id,type,amount,note,created) VALUES(?,?,?,?,?)", (uid, typ, amt, note, now()))


def credit(c, uid, amt, typ, note=""):
    c.execute("UPDATE users SET balance=balance+? WHERE id=?", (amt, uid))
    ledger(c, uid, typ, amt, note)


def debit(c, uid, amt, typ, note=""):
    cur = c.execute("UPDATE users SET balance=balance-? WHERE id=? AND balance>=?", (amt, uid, amt))
    if cur.rowcount != 1:
        raise ApiError(400, "رصيدك غير كافي")
    ledger(c, uid, typ, -amt, note)


def new_session(c, uid):
    t = secrets.token_urlsafe(32)
    c.execute("INSERT INTO sessions(token,user_id,created) VALUES(?,?,?)", (t, uid, now()))
    return t


def num(v, name="القيمة", integer=False, lo=None, hi=1e10):
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ApiError(400, f"{name} غير صالحة")
    if not math.isfinite(x) or x > hi or (lo is not None and x < lo):
        raise ApiError(400, f"{name} غير صالحة")
    return int(round(x)) if integer else x


def clean_url(u):
    u = str(u or "").strip()
    if re.fullmatch(r"@[A-Za-z0-9_]{4,64}", u):
        u = "https://t.me/" + u[1:]
    if not re.fullmatch(r"(https?|tg)://[^\s<>\"']{3,300}", u, re.I):
        raise ApiError(400, "أدخل رابطاً صحيحاً (مثال: https://t.me/your_bot)")
    return u


def norm(t):
    return re.sub(r"[\s\u0640\u200b-\u200f_\-\.]+", "", str(t).lower())


def save_image(data):
    if isinstance(data, str) and data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception:
        raise ApiError(400, "صورة غير صالحة")
    if len(raw) > 3 * 1024 * 1024:
        raise ApiError(400, "حجم الصورة أكبر من 3MB")
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = "png"
    elif raw[:3] == b"\xff\xd8\xff":
        ext = "jpg"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        ext = "webp"
    else:
        raise ApiError(400, "الصيغ المسموحة: PNG / JPG / WEBP")
    name = secrets.token_hex(12) + "." + ext
    with open(os.path.join(UP, name), "wb") as f:
        f.write(raw)
    return "/uploads/" + name


def drop_image(path):
    if path and re.fullmatch(r"/uploads/[a-f0-9]{24}\.(png|jpg|webp)", path):
        try:
            os.remove(os.path.join(UP, path[9:]))
        except OSError:
            pass


def rq(r):
    d = dict(r)
    try:
        d["extra"] = json.loads(d.get("extra") or "{}")
    except Exception:
        d["extra"] = {}
    return d


# ---------------------------------------------------------------- API
def route(h, c, m, p, q):
    tok = (h.headers.get("Authorization") or "")[7:]
    user = None
    if tok:
        user = c.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.created>?",
            (tok, now() - SESSION_DAYS * 86400)).fetchone()
    b = h.body() if m == "POST" else {}
    if not isinstance(b, dict):
        raise ApiError(400, "طلب غير صالح")
    ip = h.ip()

    # ---- public
    if m == "GET" and p == "/api/public":
        s = settings(c)
        return {k: s[k] for k in ("site_name", "min_deposit", "min_withdraw", "ref_bonus", "promo_week",
                                  "promo_month", "ad_min", "ad_max_chars", "banned_words", "channels")}

    if m == "POST" and p == "/api/register":
        rate(ip, "reg", 8, 3600)
        un, pw = str(b.get("username", "")).strip(), str(b.get("password", ""))
        if not re.fullmatch(r"[A-Za-z0-9_.]{3,24}", un):
            raise ApiError(400, "اسم المستخدم: 3-24 حرفاً إنجليزياً أو أرقاماً أو _ .")
        if not 6 <= len(pw) <= 100:
            raise ApiError(400, "كلمة السر يجب أن تكون 6 أحرف على الأقل")
        s = settings(c)
        mx = s["max_accounts_per_ip"]
        if mx and c.execute("SELECT COUNT(*) FROM users WHERE ip=?", (ip,)).fetchone()[0] >= mx:
            raise ApiError(403, "تم الوصول للحد الأقصى من الحسابات على هذا الاتصال")
        if c.execute("SELECT 1 FROM users WHERE username=?", (un,)).fetchone():
            raise ApiError(409, "اسم المستخدم مأخوذ، اختر اسماً آخر")
        ref = None
        code = str(b.get("ref", "")).strip()[:20]
        if code:
            ref = c.execute("SELECT * FROM users WHERE ref_code=? AND banned=0", (code,)).fetchone()
        uid = mkuser(c, un, pw, ref_by=ref["id"] if ref else None, ip=ip)
        if ref and ref["ip"] != ip and s["ref_bonus"] > 0:
            c.execute("UPDATE users SET ref_count=ref_count+1, ref_earned=ref_earned+? WHERE id=?",
                      (s["ref_bonus"], ref["id"]))
            credit(c, ref["id"], s["ref_bonus"], "referral", f"دعوة {un}")
            notify(c, ref["id"], f"انضم مستخدم جديد عبر رابطك وتمت إضافة {s['ref_bonus']} ل.س إلى رصيدك")
        notify(c, uid, "أهلاً بك! تم إنشاء حسابك بنجاح")
        return {"token": new_session(c, uid), "is_admin": 0}

    if m == "POST" and p == "/api/login":
        rate(ip, "login", 15, 600)
        un, pw = str(b.get("username", "")).strip(), str(b.get("password", ""))
        u = c.execute("SELECT * FROM users WHERE username=?", (un,)).fetchone()
        if not u or not hmac.compare_digest(hpw(pw, u["salt"]), u["pw"]):
            raise ApiError(401, "اسم المستخدم أو كلمة السر غير صحيحة")
        if u["banned"]:
            raise ApiError(403, "هذا الحساب موقوف")
        return {"token": new_session(c, u["id"]), "is_admin": u["is_admin"]}

    # ---- authenticated
    if not user:
        raise ApiError(401, "سجّل الدخول أولاً")
    if user["banned"]:
        raise ApiError(403, "هذا الحساب موقوف")
    uid = user["id"]

    if m == "POST" and p == "/api/logout":
        c.execute("DELETE FROM sessions WHERE token=?", (tok,))
        return {"ok": 1}

    if m == "GET" and p == "/api/me":
        unread = c.execute("SELECT COUNT(*) FROM notifications WHERE user_id=? AND read=0", (uid,)).fetchone()[0]
        return {"id": uid, "username": user["username"], "balance": user["balance"], "ref_code": user["ref_code"],
                "ref_count": user["ref_count"], "ref_earned": user["ref_earned"],
                "is_admin": user["is_admin"], "unread": unread}

    if m == "GET" and p == "/api/methods":
        f = "for_withdraw" if q.get("for", [""])[0] == "withdraw" else "for_deposit"
        rows = c.execute(f"SELECT * FROM methods WHERE active=1 AND {f}=1 ORDER BY id").fetchall()
        out = []
        for r in rows:
            d = {k: r[k] for k in ("id", "name", "currency", "rate", "min_amount", "note")}
            if f == "for_deposit":
                d["address"], d["image"] = r["address"], r["image"]
            out.append(d)
        return out

    if m == "GET" and p == "/api/notifications":
        rows = c.execute("SELECT id,text,read,created FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60",
                         (uid,)).fetchall()
        return [dict(r) for r in rows]

    if m == "POST" and p == "/api/notifications/read":
        c.execute("UPDATE notifications SET read=1 WHERE user_id=?", (uid,))
        return {"ok": 1}

    if m == "GET" and p == "/api/history":
        rows = c.execute("SELECT * FROM requests WHERE user_id=? ORDER BY id DESC LIMIT 100", (uid,)).fetchall()
        return [rq(r) for r in rows]

    if m == "POST" and p == "/api/deposit":
        rate(str(uid), "dep", 20, 3600)
        s = settings(c)
        mth = c.execute("SELECT * FROM methods WHERE id=? AND active=1 AND for_deposit=1",
                        (int(num(b.get("method_id"), "الطريقة", True, 0)),)).fetchone()
        if not mth:
            raise ApiError(400, "طريقة الإيداع غير متاحة")
        amount = num(b.get("amount"), "المبلغ", lo=0.000001)
        txid = str(b.get("txid", "")).strip()[:120]
        if not txid:
            raise ApiError(400, "أدخل رقم العملية أو معرّف التحويل")
        if amount < mth["min_amount"]:
            raise ApiError(400, f"أقل مبلغ لهذه الطريقة {mth['min_amount']:g} {mth['currency']}")
        syp = int(round(amount * mth["rate"])) if mth["currency"] != "SYP" else int(round(amount))
        if syp < s["min_deposit"]:
            raise ApiError(400, f"أقل مبلغ للإيداع {s['min_deposit']} ل.س")
        if c.execute("SELECT 1 FROM requests WHERE kind='deposit' AND method_id=? AND detail=? AND status IN('pending','approved')",
                     (mth["id"], txid)).fetchone():
            raise ApiError(400, "رقم العملية هذا مستخدم من قبل")
        if c.execute("SELECT COUNT(*) FROM requests WHERE kind='deposit' AND user_id=? AND status='pending'",
                     (uid,)).fetchone()[0] >= 5:
            raise ApiError(400, "لديك طلبات إيداع كثيرة قيد المراجعة")
        c.execute("INSERT INTO requests(kind,user_id,amount,amount_orig,method_id,method_name,detail,extra,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  ("deposit", uid, syp, amount, mth["id"], mth["name"], txid,
                   json.dumps({"currency": mth["currency"], "rate": mth["rate"]}), now(), now()))
        return {"ok": 1}

    if m == "POST" and p == "/api/withdraw":
        rate(str(uid), "wd", 20, 3600)
        s = settings(c)
        mth = c.execute("SELECT * FROM methods WHERE id=? AND active=1 AND for_withdraw=1",
                        (int(num(b.get("method_id"), "الطريقة", True, 0)),)).fetchone()
        if not mth:
            raise ApiError(400, "طريقة السحب غير متاحة")
        amount = num(b.get("amount"), "المبلغ", True, 1)
        addr = str(b.get("address", "")).strip()[:300]
        if not addr:
            raise ApiError(400, "أدخل عنوان السحب")
        if amount < s["min_withdraw"]:
            raise ApiError(400, f"أقل مبلغ للسحب {s['min_withdraw']} ل.س")
        debit(c, uid, amount, "withdraw", mth["name"])
        orig = round(amount / mth["rate"], 4) if mth["currency"] != "SYP" and mth["rate"] > 0 else amount
        c.execute("INSERT INTO requests(kind,user_id,amount,amount_orig,method_id,method_name,detail,extra,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)",
                  ("withdraw", uid, amount, orig, mth["id"], mth["name"], addr,
                   json.dumps({"currency": mth["currency"], "rate": mth["rate"]}), now(), now()))
        return {"ok": 1}

    if m == "POST" and p == "/api/promo":
        s = settings(c)
        plan = b.get("plan")
        if plan not in ("week", "month"):
            raise ApiError(400, "اختر مدة الترويج")
        link = clean_url(b.get("link"))
        price = s["promo_" + plan]
        debit(c, uid, price, "promo", plan)
        c.execute("INSERT INTO requests(kind,user_id,amount,amount_orig,method_name,detail,extra,created,updated) VALUES(?,?,?,?,?,?,?,?,?)",
                  ("promo", uid, price, price, "أسبوع" if plan == "week" else "شهر", link,
                   json.dumps({"plan": plan, "channels": s["channels"]}, ensure_ascii=False), now(), now()))
        return {"ok": 1}

    if m == "POST" and p == "/api/ad":
        s = settings(c)
        text = str(b.get("text", "")).strip()
        if not text:
            raise ApiError(400, "اكتب نص الإعلان")
        if len(text) > s["ad_max_chars"]:
            raise ApiError(400, f"النص يتجاوز {s['ad_max_chars']} حرفاً")
        nt = norm(text)
        for w in s["banned_words"]:
            if norm(w) and norm(w) in nt:
                raise ApiError(400, f"النص يحتوي على كلمة ممنوعة: {w}")
        targets = [t.strip() for t in str(b.get("targets", "")).splitlines() if t.strip()]
        if not targets:
            raise ApiError(400, "اكتب اسم بوت واحد على الأقل للاستهداف")
        if len(targets) > 30 or any(len(t) > 64 for t in targets):
            raise ApiError(400, "قائمة البوتات غير صالحة (حد أقصى 30 سطراً)")
        amount = num(b.get("amount"), "المبلغ", True, 1)
        if amount < s["ad_min"]:
            raise ApiError(400, f"أقل مبلغ للإعلان {s['ad_min']} ل.س")
        link = clean_url(b.get("link"))
        debit(c, uid, amount, "ad")
        c.execute("INSERT INTO requests(kind,user_id,amount,amount_orig,method_name,detail,extra,created,updated) VALUES(?,?,?,?,?,?,?,?,?)",
                  ("ad", uid, amount, amount, "إعلان ممول", link,
                   json.dumps({"text": text, "targets": targets}, ensure_ascii=False), now(), now()))
        return {"ok": 1}

    # ---- admin
    if not p.startswith("/api/admin/"):
        raise ApiError(404, "غير موجود")
    if not user["is_admin"]:
        raise ApiError(403, "غير مسموح")

    if m == "GET" and p == "/api/admin/stats":
        one = lambda sql, *a: c.execute(sql, a).fetchone()[0] or 0
        pend = {k: one("SELECT COUNT(*) FROM requests WHERE kind=? AND status='pending'", k)
                for k in ("deposit", "withdraw", "promo", "ad")}
        return {"users": one("SELECT COUNT(*) FROM users WHERE is_admin=0"),
                "balance": one("SELECT SUM(balance) FROM users WHERE is_admin=0"),
                "pending": pend,
                "deposits": one("SELECT SUM(amount) FROM requests WHERE kind='deposit' AND status='approved'"),
                "withdraws": one("SELECT SUM(amount) FROM requests WHERE kind='withdraw' AND status='approved'"),
                "revenue": one("SELECT SUM(amount) FROM requests WHERE kind IN('promo','ad') AND status='approved'")}

    if m == "GET" and p == "/api/admin/requests":
        kind, st = q.get("kind", [""])[0], q.get("status", [""])[0]
        sql, args = "SELECT r.*,u.username FROM requests r JOIN users u ON u.id=r.user_id WHERE 1=1", []
        if kind:
            sql += " AND r.kind=?"
            args.append(kind)
        if st:
            sql += " AND r.status=?"
            args.append(st)
        sql += " ORDER BY (r.status='pending') DESC, r.id DESC LIMIT 300"
        return [rq(r) for r in c.execute(sql, args)]

    mm = re.fullmatch(r"/api/admin/requests/(\d+)/(approve|reject)", p)
    if m == "POST" and mm:
        r = c.execute("SELECT * FROM requests WHERE id=?", (int(mm.group(1)),)).fetchone()
        if not r:
            raise ApiError(404, "الطلب غير موجود")
        if r["status"] != "pending":
            raise ApiError(400, "تمت معالجة هذا الطلب مسبقاً")
        act, note = mm.group(2), str(b.get("note", ""))[:300]
        k, tu, amt = r["kind"], r["user_id"], r["amount"]
        label = {"deposit": "إيداعك", "withdraw": "طلب السحب", "promo": "طلب الترويج", "ad": "إعلانك الممول"}[k]
        if act == "approve":
            if k == "deposit":
                if b.get("amount") not in (None, ""):
                    amt = num(b.get("amount"), "المبلغ", True, 1)
                    c.execute("UPDATE requests SET amount=? WHERE id=?", (amt, r["id"]))
                credit(c, tu, amt, "deposit", r["method_name"] or "")
                notify(c, tu, f"تمت الموافقة على {label} وأُضيف {amt:,} ل.س إلى رصيدك")
            else:
                notify(c, tu, f"تمت الموافقة على {label}" + (" وسيصلك المبلغ قريباً" if k == "withdraw" else ""))
            st = "approved"
        else:
            if k == "deposit":
                notify(c, tu, f"تم رفض {label}" + (f" - السبب: {note}" if note else ""))
            else:
                credit(c, tu, amt, "refund", f"رفض {k} #{r['id']}")
                notify(c, tu, f"تم رفض {label} وأُعيد {amt:,} ل.س إلى رصيدك" + (f" - السبب: {note}" if note else ""))
            st = "rejected"
        c.execute("UPDATE requests SET status=?, admin_note=?, updated=? WHERE id=?", (st, note, now(), r["id"]))
        return {"ok": 1}

    if m == "GET" and p == "/api/admin/users":
        rows = c.execute("SELECT id,username,balance,ref_count,ref_earned,banned,is_admin,created,ip FROM users ORDER BY id DESC LIMIT 500").fetchall()
        return [dict(r) for r in rows]

    mm = re.fullmatch(r"/api/admin/users/(\d+)/(ban|adjust)", p)
    if m == "POST" and mm:
        t = c.execute("SELECT * FROM users WHERE id=?", (int(mm.group(1)),)).fetchone()
        if not t or t["is_admin"]:
            raise ApiError(400, "لا يمكن تعديل هذا الحساب")
        if mm.group(2) == "ban":
            ban = 1 if b.get("banned") else 0
            c.execute("UPDATE users SET banned=? WHERE id=?", (ban, t["id"]))
            if ban:
                c.execute("DELETE FROM sessions WHERE user_id=?", (t["id"],))
        else:
            amt = num(b.get("amount"), "المبلغ", True, -1e9)
            if amt == 0:
                raise ApiError(400, "المبلغ صفر")
            if amt > 0:
                credit(c, t["id"], amt, "admin_adjust", str(b.get("note", ""))[:200])
            else:
                debit(c, t["id"], -amt, "admin_adjust", str(b.get("note", ""))[:200])
            notify(c, t["id"], f"تم {'إضافة' if amt > 0 else 'خصم'} {abs(amt):,} ل.س {'إلى' if amt > 0 else 'من'} رصيدك من الإدارة")
        return {"ok": 1}

    if m == "GET" and p == "/api/admin/settings":
        return settings(c)

    if m == "POST" and p == "/api/admin/settings":
        ints = {"min_deposit": 1, "min_withdraw": 1, "ref_bonus": 0, "promo_week": 1, "promo_month": 1,
                "ad_min": 1, "ad_max_chars": 1, "max_accounts_per_ip": 0}
        for k, lo in ints.items():
            if k in b:
                v = num(b[k], k, True, lo, 1e9)
                c.execute("INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)", (k, str(v)))
        if "banned_words" in b:
            ws = [str(w).strip()[:40] for w in (b["banned_words"] or []) if str(w).strip()][:100]
            c.execute("INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)", ("banned_words", json.dumps(ws, ensure_ascii=False)))
        if "channels" in b:
            ch = [{"name": str(x.get("name", "قناة تلجرام")).strip()[:60] or "قناة تلجرام",
                   "count": num(x.get("count"), "عدد المتابعين", True, 0, 1e9)} for x in (b["channels"] or [])][:12]
            c.execute("INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)", ("channels", json.dumps(ch, ensure_ascii=False)))
        return settings(c)

    if m == "GET" and p == "/api/admin/methods":
        return [dict(r) for r in c.execute("SELECT * FROM methods ORDER BY id")]

    if m == "POST" and p == "/api/admin/methods":
        name = str(b.get("name", "")).strip()[:80]
        cur_ = re.sub(r"[^A-Za-z]", "", str(b.get("currency", "SYP")).upper())[:6] or "SYP"
        if not name:
            raise ApiError(400, "اسم الطريقة مطلوب")
        rt = 1.0 if cur_ == "SYP" else num(b.get("rate"), "سعر الصرف", lo=0.000001)
        vals = dict(name=name, currency=cur_, rate=rt, address=str(b.get("address", "")).strip()[:300],
                    min_amount=num(b.get("min_amount", 0), "الحد الأدنى", lo=0),
                    note=str(b.get("note", "")).strip()[:300],
                    for_deposit=1 if b.get("for_deposit") else 0, for_withdraw=1 if b.get("for_withdraw") else 0,
                    active=1 if b.get("active") else 0)
        mid = b.get("id")
        old = c.execute("SELECT * FROM methods WHERE id=?", (int(mid),)).fetchone() if mid else None
        img = old["image"] if old else None
        if b.get("remove_image") and img:
            drop_image(img)
            img = None
        if b.get("image_data"):
            new = save_image(b["image_data"])
            drop_image(img)
            img = new
        vals["image"] = img
        if old:
            c.execute("UPDATE methods SET " + ",".join(f"{k}=?" for k in vals) + " WHERE id=?", [*vals.values(), old["id"]])
        else:
            c.execute("INSERT INTO methods(" + ",".join(vals) + ") VALUES(" + ",".join("?" * len(vals)) + ")", list(vals.values()))
        return {"ok": 1}

    mm = re.fullmatch(r"/api/admin/methods/(\d+)/delete", p)
    if m == "POST" and mm:
        old = c.execute("SELECT * FROM methods WHERE id=?", (int(mm.group(1)),)).fetchone()
        if old:
            drop_image(old["image"])
            c.execute("DELETE FROM methods WHERE id=?", (old["id"],))
        return {"ok": 1}

    if m == "POST" and p == "/api/admin/password":
        old, new = str(b.get("old", "")), str(b.get("new", ""))
        if not hmac.compare_digest(hpw(old, user["salt"]), user["pw"]):
            raise ApiError(400, "كلمة السر الحالية غير صحيحة")
        if len(new) < 8:
            raise ApiError(400, "كلمة السر الجديدة يجب ألا تقل عن 8 أحرف")
        salt = secrets.token_hex(16)
        c.execute("UPDATE users SET salt=?, pw=? WHERE id=?", (salt, hpw(new, salt), uid))
        c.execute("DELETE FROM sessions WHERE user_id=? AND token<>?", (uid, tok))
        return {"ok": 1}

    raise ApiError(404, "غير موجود")


# ---------------------------------------------------------------- HTTP
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def ip(self):
        if TRUST_PROXY:
            xf = self.headers.get("X-Forwarded-For")
            if xf:
                return xf.split(",")[0].strip()
        return self.client_address[0]

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ApiError(413, "الحجم كبير جداً")
        raw = self.rfile.read(n) if n else b"{}"
        try:
            return json.loads(raw or b"{}")
        except Exception:
            raise ApiError(400, "طلب غير صالح")

    def out(self, code, data, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy", CSP)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, code, obj):
        self.out(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8",
                 {"Cache-Control": "no-store"})

    def handle_any(self, method):
        u = urlparse(self.path)
        if u.path.startswith("/api/"):
            try:
                with lock:
                    c = db()
                    try:
                        res = route(self, c, method, u.path, parse_qs(u.query))
                        c.commit()
                    finally:
                        c.close()
                self.send_json(200, res)
            except ApiError as e:
                self.send_json(e.code, {"error": e.msg})
            except Exception:
                traceback.print_exc()
                self.send_json(500, {"error": "خطأ في الخادم"})
        elif method == "GET":
            self.static(u.path)
        else:
            self.send_json(405, {"error": "غير مسموح"})

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        elif path in ("/admin", "/brand"):
            path += ".html"
        if path.startswith("/uploads/"):
            name = path[9:]
            if not re.fullmatch(r"[a-f0-9]{24}\.(png|jpg|webp)", name):
                return self.out(404, b"Not found", "text/plain")
            fp = os.path.join(UP, name)
        else:
            fp = os.path.realpath(os.path.join(PUB, path.lstrip("/")))
            if not fp.startswith(PUB + os.sep):
                return self.out(404, b"Not found", "text/plain")
        if not os.path.isfile(fp):
            return self.out(404, b"Not found", "text/plain")
        with open(fp, "rb") as f:
            data = f.read()
        ct = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if ct.startswith("text/") or ct in ("application/javascript", "image/svg+xml"):
            ct += "; charset=utf-8"
        self.out(200, data, ct, {"Cache-Control": "no-cache"})


if __name__ == "__main__":
    init_db()
    print(f"Server running on http://0.0.0.0:{PORT}  (admin user: {ADMIN_USER})")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
