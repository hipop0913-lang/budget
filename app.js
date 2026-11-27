import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc,
  arrayUnion, collection, addDoc, deleteDoc, query, where, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ---------- 기본 설정 ----------
const CATS = {
  out: ["식비","카페/간식","장보기","교통","주거/통신","생활용품","의료","문화/여가","육아/교육","경조사","쇼핑","여행","보험/금융","반려동물","기타"],
  in:  ["월급","용돈","부수입","이자/투자","기타"]
};
const PAYS = ["신용카드","체크카드","현금","계좌이체","기타"];
const PALETTE = ["#2c56d8","#0f7a4d","#b45309","#7c3aed","#c2255c","#0e7490","#4d7c0f","#64748b"];
const DOW = ["일","월","화","수","목","금","토"];

const $ = id => document.getElementById(id);
const won = n => Math.round(n).toLocaleString("ko-KR");
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// 오프라인에서 입력해도 연결되면 자동으로 동기화됩니다
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// ---------- 상태 ----------
let user = null, hid = null, nick = "";
let unsubTx = null, unsubBudget = null;
let all = [];                 // 지난달 + 이번 달 내역
let budget = null, budgetErr = null;
let cur = new Date(); cur.setDate(1);
let tab = "ledger", sub = "daily", selDay = todayStr();
let personF = "all", payF = "all", stType = "out", stBy = "cat";

const range = () => {
  const s = ymd(cur), e = ymd(new Date(cur.getFullYear(), cur.getMonth() + 1, 1));
  const ps = ymd(new Date(cur.getFullYear(), cur.getMonth() - 1, 1));
  return { s, e, ps };
};
const curItems = () => { const { s, e } = range(); return all.filter(t => t.date >= s && t.date < e); };
const prevItems = () => { const { s } = range(); return all.filter(t => t.date < s); };
const meName = () => nick || "나";
const otherName = () => all.find(t => t.uid !== user.uid && t.by)?.by || "상대";
const nameOf = t => t.by || (t.uid === user.uid ? meName() : otherName());
const filtered = list => list.filter(t =>
  (personF === "all" || (personF === "me") === (t.uid === user.uid)) &&
  (payF === "all" || (t.pay || "") === payF));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

function show(v) { for (const x of ["login","household","app"]) $("view-" + x).hidden = x !== v; }
let toastT;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 1800);
}
const errText = e => ({
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인을 눌러주세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 해요.",
  "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
  "permission-denied": "권한이 없어요. Firebase의 Firestore 규칙을 최신으로 바꿔 주세요."
}[e.code] || "오류: " + (e.code || e.message));

// ---------- 로그인 ----------
$("btn-login").onclick = () => authWith(signInWithEmailAndPassword);
$("btn-signup").onclick = () => authWith(createUserWithEmailAndPassword);
async function authWith(fn) {
  $("login-msg").textContent = "";
  try { await fn(auth, $("email").value.trim(), $("password").value); }
  catch (e) { $("login-msg").textContent = errText(e); }
}
$("btn-logout-1").onclick = $("m-logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  user = u;
  if (unsubTx) { unsubTx(); unsubTx = null; }
  if (unsubBudget) { unsubBudget(); unsubBudget = null; }
  if (!u) { hid = null; return show("login"); }
  const me = await getDoc(doc(db, "users", u.uid)).catch(() => null);
  hid = me?.exists() ? me.data().householdId : null;
  nick = me?.exists() ? (me.data().nickname || "") : "";
  hid ? startApp() : show("household");
});

// ---------- 부부 연결 ----------
function newCode() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
$("btn-create").onclick = async () => {
  try {
    const code = newCode();
    await setDoc(doc(db, "households", code), { members: [user.uid], createdAt: Date.now() });
    await setDoc(doc(db, "users", user.uid), { householdId: code }, { merge: true });
    hid = code; startApp();
  } catch (e) { $("hh-msg").textContent = errText(e); }
};
$("btn-join").onclick = async () => {
  const code = $("join-code").value.trim().toUpperCase();
  $("hh-msg").textContent = "";
  try {
    const ref = doc(db, "households", code);
    const snap = await getDoc(ref);
    if (!snap.exists()) return $("hh-msg").textContent = "코드를 찾을 수 없어요.";
    const m = snap.data().members;
    if (!m.includes(user.uid)) {
      if (m.length >= 2) return $("hh-msg").textContent = "이미 두 명이 연결된 가계부예요.";
      await updateDoc(ref, { members: arrayUnion(user.uid) });
    }
    await setDoc(doc(db, "users", user.uid), { householdId: code }, { merge: true });
    hid = code; startApp();
  } catch (e) { $("hh-msg").textContent = errText(e); }
};

// ---------- 별명 ----------
function askNick() { $("nick-input").value = nick; $("dlg-nick").showModal(); }
$("m-nick").onclick = askNick;
$("form-nick").onsubmit = async ev => {
  ev.preventDefault();
  nick = $("nick-input").value.trim();
  $("dlg-nick").close();
  render();
  await setDoc(doc(db, "users", user.uid), { nickname: nick }, { merge: true }).catch(e => alert(errText(e)));
};
$("m-code").onclick = () => {
  navigator.clipboard?.writeText(hid).then(() => toast("초대 코드를 복사했어요"), () => prompt("초대 코드", hid))
    ?? prompt("초대 코드", hid);
};

// ---------- 시작 & 실시간 구독 ----------
function startApp() {
  show("app");
  $("pay-filter").innerHTML = `<option value="all">결제수단 ▾</option>` + PAYS.map(p => `<option>${p}</option>`).join("");
  $("pay-filter").value = payF;
  listenTx();
  unsubBudget = onSnapshot(doc(db, "households", hid, "meta", "budget"),
    s => { budget = s.exists() ? s.data() : null; budgetErr = null; render(); },
    e => { budgetErr = e; render(); });
  if (!nick) askNick();
}
function listenTx() {
  if (unsubTx) unsubTx();
  const { e, ps } = range();
  const q = query(collection(db, "households", hid, "transactions"),
    where("date", ">=", ps), where("date", "<", e), orderBy("date", "desc"));
  // 상대방이 입력/수정/삭제하면 이 함수가 자동으로 다시 실행됩니다 (실시간 연동)
  unsubTx = onSnapshot(q, snap => { all = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
  render();
}
function moveMonth(n) {
  cur.setMonth(cur.getMonth() + n);
  const { s, e } = range(), t = todayStr();
  selDay = t >= s && t < e ? t : null;
  listenTx();
}
$("prev").onclick = () => moveMonth(-1);
$("next").onclick = () => moveMonth(1);

// ---------- 화면 전환 ----------
function setOn(container, attr, val) {
  container.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset[attr] === val));
}
$("bottom").onclick = e => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.tab; window.scrollTo(0, 0); render(); };
$("subtabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; sub = b.dataset.sub; render(); };
$("person-chips").onclick = e => { const b = e.target.closest("button"); if (!b) return; personF = b.dataset.p; render(); };
$("pay-filter").onchange = e => { payF = e.target.value; render(); };
$("stats-type").onclick = e => { const b = e.target.closest("button"); if (!b) return; stType = b.dataset.t; render(); };
$("stats-by").onclick = e => { const b = e.target.closest("button"); if (!b) return; stBy = b.dataset.b; render(); };

function render() {
  if (!user || !hid) return;
  $("month-label").textContent = `${cur.getFullYear()}.${pad(cur.getMonth() + 1)}`;
  setOn($("bottom"), "tab", tab);
  setOn($("subtabs"), "sub", sub);
  setOn($("person-chips"), "p", personF);
  setOn($("stats-type"), "t", stType);
  setOn($("stats-by"), "b", stBy);
  $("lbl-me").textContent = meName();
  $("lbl-other").textContent = otherName();

  $("ledger-top").hidden = tab !== "ledger";
  $("stats-top").hidden = tab !== "stats";
  $("pane-daily").hidden = !(tab === "ledger" && sub === "daily");
  $("pane-cal").hidden = !(tab === "ledger" && sub === "cal");
  $("pane-stats").hidden = tab !== "stats";
  $("pane-budget").hidden = tab !== "budget";
  $("pane-more").hidden = tab !== "more";
  $("fab").hidden = tab !== "ledger";
  $("prev").hidden = $("next").hidden = tab === "more";
  if (tab === "more") $("month-label").textContent = "더보기";

  const extra = $("bar-extra"); extra.innerHTML = "";
  if (tab === "budget") {
    const b = el("button", "", "수정"); b.type = "button"; b.onclick = openBudget; extra.append(b);
  }

  if (tab === "ledger") renderLedger();
  if (tab === "stats") renderStats();
  if (tab === "budget") renderBudget();
  if (tab === "more") { $("m-nick-v").textContent = nick || "(없음)"; $("m-code-v").textContent = hid; }
}

// ---------- 가계부: 일일 / 달력 ----------
function sums(list) {
  let i = 0, o = 0;
  for (const t of list) t.type === "in" ? i += t.amount : o += t.amount;
  return { i, o };
}
function renderLedger() {
  const list = filtered(curItems());
  const { i, o } = sums(list);
  $("sum-in").textContent = won(i);
  $("sum-out").textContent = won(o);
  $("sum-total").textContent = won(i - o);
  sub === "daily" ? renderDaily(list) : renderCal(list);
}
function dayHead(date, arr) {
  const d = new Date(date + "T00:00:00");
  const h = el("div", "dhead");
  h.append(el("span", "d", String(d.getDate())));
  const isToday = date === todayStr();
  h.append(el("span", "badge" + (isToday ? " today" : ""), isToday ? "오늘" : DOW[d.getDay()]));
  h.append(el("span", "ym", `${d.getFullYear()}.${pad(d.getMonth() + 1)}${isToday ? " · " + DOW[d.getDay()] : ""}`));
  const { i, o } = sums(arr);
  const s = el("span", "sums");
  if (i) s.append(el("span", "in", won(i)));
  if (o) s.append(el("span", "out", won(o)));
  h.append(s);
  return h;
}
function row(t) {
  const r = el("button", "item"); r.type = "button";
  r.append(el("span", "cat", t.category));
  const mid = el("span", "mid");
  mid.append(el("div", "t1", t.memo || t.category));
  const t2 = el("div", "t2");
  t2.append(el("i", "dot " + (t.uid === user.uid ? "me" : "other")));
  t2.append(document.createTextNode([nameOf(t), t.pay].filter(Boolean).join(" · ")));
  mid.append(t2);
  r.append(mid, el("span", "amt " + (t.type === "in" ? "in" : "out"), won(t.amount)));
  r.onclick = () => openForm(t);
  return r;
}
const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
function renderDaily(list) {
  const box = $("pane-daily"); box.innerHTML = "";
  if (!list.length) return box.append(el("div", "empty", "이 달의 내역이 없어요. 오른쪽 아래 + 버튼으로 추가해 보세요."));
  const groups = new Map();
  for (const t of [...list].sort(byNewest)) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  for (const [date, arr] of groups) { box.append(dayHead(date, arr)); arr.forEach(t => box.append(row(t))); }
}
function renderCal(list) {
  const grid = $("cal-grid"); grid.innerHTML = "";
  const y = cur.getFullYear(), m = cur.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const byDay = new Map();
  for (const t of list) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); }
  for (let i = 0; i < first; i++) grid.append(el("div", "cell blank"));
  for (let d = 1; d <= days; d++) {
    const date = `${y}-${pad(m + 1)}-${pad(d)}`, dow = (first + d - 1) % 7;
    const c = el("button", "cell"); c.type = "button";
    if (date === todayStr()) c.classList.add("today");
    if (date === selDay) c.classList.add("sel");
    c.append(el("span", "n" + (dow === 0 ? " sun" : dow === 6 ? " sat" : ""), String(d)));
    const { i, o } = sums(byDay.get(date) || []);
    if (i) c.append(el("span", "i", won(i)));
    if (o) c.append(el("span", "o", won(o)));
    c.onclick = () => { selDay = date; render(); };
    grid.append(c);
  }
  const rest = (7 - (first + days) % 7) % 7;
  for (let i = 0; i < rest; i++) grid.append(el("div", "cell blank"));

  const box = $("cal-day"); box.innerHTML = "";
  if (!selDay) return box.append(el("div", "empty", "날짜를 누르면 그날 내역이 보여요."));
  const arr = (byDay.get(selDay) || []).sort(byNewest);
  box.append(dayHead(selDay, arr));
  if (!arr.length) box.append(el("div", "empty", "이날은 내역이 없어요."));
  arr.forEach(t => box.append(row(t)));
}

// ---------- 통계 ----------
function renderStats() {
  const now = curItems();
  const tot = sums(now);
  $("st-out").textContent = won(tot.o);
  $("st-in").textContent = won(tot.i);
  const box = $("pane-stats"); box.innerHTML = "";
  const list = now.filter(t => t.type === stType);
  const total = list.reduce((s, t) => s + t.amount, 0);
  if (!total) return box.append(el("div", "empty", `이 달의 ${stType === "out" ? "지출" : "수입"} 내역이 없어요.`));

  const keyOf = t => stBy === "cat" ? t.category : stBy === "pay" ? (t.pay || "미지정") : nameOf(t);
  const map = new Map();
  for (const t of list) map.set(keyOf(t), (map.get(keyOf(t)) || 0) + t.amount);
  const rows = [...map].sort((a, b) => b[1] - a[1]);
  const color = i => PALETTE[Math.min(i, PALETTE.length - 1)];

  // 원그래프
  const NS = "http://www.w3.org/2000/svg", C = 2 * Math.PI * 25;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "비율 원그래프: " + rows.map(([k, v]) => `${k} ${Math.round(v / total * 100)}%`).join(", "));
  const g = document.createElementNS(NS, "g");
  g.setAttribute("transform", "rotate(-90 50 50)");
  let acc = 0;
  rows.forEach(([, v], i) => {
    const len = v / total * C, c = document.createElementNS(NS, "circle");
    Object.entries({ cx: 50, cy: 50, r: 25, fill: "none", stroke: color(i), "stroke-width": 50,
      "stroke-dasharray": `${len} ${C}`, "stroke-dashoffset": -acc }).forEach(([a, b]) => c.setAttribute(a, b));
    g.append(c); acc += len;
  });
  svg.append(g);
  const wrap = el("div", "pie-wrap"); wrap.append(svg);

  // 지난달 비교
  const prev = prevItems().filter(t => t.type === stType).reduce((s, t) => s + t.amount, 0);
  if (prev) {
    const diff = Math.round((total - prev) / prev * 100);
    const word = stType === "out" ? (diff >= 0 ? "더 썼어요" : "덜 썼어요") : (diff >= 0 ? "늘었어요" : "줄었어요");
    wrap.append(el("div", "cmp", diff === 0 ? "지난달과 비슷해요" : `지난달보다 ${Math.abs(diff)}% ${word}`));
  }
  box.append(wrap);

  rows.forEach(([k, v], i) => {
    const r = el("div", "srow");
    const p = el("span", "pct", Math.round(v / total * 100) + "%"); p.style.background = color(i);
    r.append(p, el("span", "nm", k), el("b", "", won(v)));
    box.append(r);
  });

  if (stBy !== "who") {
    const meSum = list.filter(t => t.uid === user.uid).reduce((s, t) => s + t.amount, 0), ot = total - meSum;
    const sp = el("div", "split");
    sp.append(el("div", "lb", stType === "out" ? "누가 얼마 썼나" : "누가 얼마 벌었나"));
    const bar = el("div", "barx");
    const a = el("i"); a.style.cssText = `width:${meSum / total * 100}%;background:var(--me)`;
    const b = el("i"); b.style.cssText = `width:${ot / total * 100}%;background:var(--other)`;
    bar.append(a, b);
    const r2 = el("div", "row2");
    r2.append(el("span", "", `${meName()} ${won(meSum)} (${Math.round(meSum / total * 100)}%)`),
              el("span", "", `${otherName()} ${won(ot)} (${Math.round(ot / total * 100)}%)`));
    sp.append(bar, r2); box.append(sp);
  }
}

// ---------- 예산 ----------
const level = p => p > 100 ? ["var(--out)", "var(--out)"] : p >= 90 ? ["var(--warn)", "var(--warn-t)"] : ["var(--ok)", "var(--ok-t)"];
function renderBudget() {
  const box = $("pane-budget"); box.innerHTML = "";
  if (budgetErr) return box.append(el("div", "empty", errText(budgetErr)));
  const cats = budget?.cats || {};
  const catSum = Object.values(cats).reduce((s, v) => s + v, 0);
  const total = budget?.total || catSum;
  if (!total) {
    const e = el("div", "empty", "아직 예산이 없어요. 한 달에 얼마 쓸지 정해 보세요.");
    const b = el("button", "primary", "예산 설정하기"); b.type = "button"; b.style.cssText = "display:block;margin:16px auto 0;padding:12px 20px";
    b.onclick = openBudget; e.append(b); box.append(e); return;
  }
  const outs = curItems().filter(t => t.type === "out");
  const spent = outs.reduce((s, t) => s + t.amount, 0);
  const p = spent / total * 100, left = total - spent;

  const card = el("div", "bcard");
  const h = el("div", "h"); h.append(el("span", "sub", "한 달 예산"), el("b", "", won(total))); card.append(h);
  const tr = el("div", "track"), fill = el("i");
  fill.style.cssText = `width:${Math.min(p, 100)}%;background:${level(p)[0]}`; tr.append(fill); card.append(tr);
  const r = el("div", "r");
  const a = el("span"); a.append("쓴 돈 ", Object.assign(el("b", "out", won(spent))), ` (${Math.round(p)}%)`);
  const b = el("span", "sub"); b.append(left >= 0 ? "남은 돈 " : "초과 ", el("b", "", won(Math.abs(left))));
  r.append(a, b); card.append(r);

  const now = new Date(), { s, e } = range(), t = todayStr();
  let tip = "";
  if (t >= s && t < e) {
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    tip = left >= 0
      ? `이달은 ${daysLeft}일 남았어요. 하루 약 ${won(Math.floor(left / daysLeft / 100) * 100)}원까지 쓸 수 있어요.`
      : `예산을 ${won(-left)}원 넘었어요. 남은 ${daysLeft}일은 아껴 써요.`;
  } else if (t >= e) {
    tip = left >= 0 ? `이 달은 예산보다 ${won(left)}원 아꼈어요.` : `이 달은 예산을 ${won(-left)}원 넘었어요.`;
  }
  if (tip) card.append(el("div", "tip", tip));
  box.append(card);

  const names = Object.keys(cats).filter(k => cats[k] > 0);
  if (!names.length) return;
  box.append(el("div", "bsec", "분류별 예산"));
  names.sort((x, y) => CATS.out.indexOf(x) - CATS.out.indexOf(y));
  for (const k of names) {
    const lim = cats[k], used = outs.filter(t => t.category === k).reduce((s2, t2) => s2 + t2.amount, 0);
    const pp = used / lim * 100, [bg, fg] = level(pp);
    const rw = el("div", "brow");
    const hh = el("div", "h"); const right = el("span");
    const ub = el("b", "", won(used)); if (pp > 100) ub.style.color = "var(--out)";
    right.append(ub, ` / ${won(lim)}`);
    hh.append(el("b", "", k), right);
    const t2 = el("div", "track sm"), f2 = el("i"); f2.style.cssText = `width:${Math.min(pp, 100)}%;background:${bg}`; t2.append(f2);
    const st = el("div", "s", `${Math.round(pp)}% · ${lim - used >= 0 ? won(lim - used) + "원 남음" : won(used - lim) + "원 초과"}`);
    st.style.color = fg; if (pp > 100) st.style.fontWeight = "700";
    rw.append(hh, t2, st); box.append(rw);
  }
}
const numIn = inp => inp.oninput = () => { const n = inp.value.replace(/\D/g, ""); inp.value = n ? (+n).toLocaleString("ko-KR") : ""; };
const numOf = inp => +inp.value.replace(/\D/g, "") || 0;
function openBudget() {
  const tIn = $("b-total"); numIn(tIn);
  tIn.value = budget?.total ? won(budget.total) : "";
  const box = $("b-cats"); box.innerHTML = "";
  for (const c of CATS.out) {
    const lab = el("label", "row"); lab.append(el("span", "lab", c));
    const i = el("input"); i.inputMode = "numeric"; i.placeholder = "-"; i.dataset.cat = c;
    i.value = budget?.cats?.[c] ? won(budget.cats[c]) : ""; numIn(i);
    lab.append(i); box.append(lab);
  }
  $("dlg-budget").showModal();
}
$("b-close").onclick = () => $("dlg-budget").close();
$("form-budget").onsubmit = ev => {
  ev.preventDefault();
  const cats = {};
  $("b-cats").querySelectorAll("input").forEach(i => { const v = numOf(i); if (v) cats[i.dataset.cat] = v; });
  $("dlg-budget").close();
  setDoc(doc(db, "households", hid, "meta", "budget"), { total: numOf($("b-total")), cats })
    .then(() => toast("예산을 저장했어요"), e => alert(errText(e)));
};

// ---------- 입력/수정 화면 ----------
let editing = null, fType = "out", fCat = "", fPay = "", amt = "";
function drawForm() {
  setOn($("f-type"), "t", fType);
  if (!CATS[fType].includes(fCat)) fCat = CATS[fType][0];
  const cats = $("f-cats"); cats.innerHTML = "";
  for (const c of CATS[fType]) {
    const b = el("button", c === fCat ? "on" : "", c); b.type = "button";
    b.onclick = () => { fCat = c; drawForm(); };
    cats.append(b);
  }
  const pays = $("f-pays"); pays.innerHTML = "";
  for (const p of PAYS) {
    const b = el("button", p === fPay ? "on" : "", p); b.type = "button";
    b.onclick = () => { fPay = fPay === p ? "" : p; drawForm(); };   // 다시 누르면 선택 해제
    pays.append(b);
  }
  $("f-amount").textContent = amt ? won(+amt) : "0";
  $("f-amount").parentElement.className = "amount " + fType;
}
function openForm(t) {
  editing = t || null;
  fType = t ? t.type : "out";
  fCat = t ? t.category : "";
  let last = ""; try { last = localStorage.getItem("lastPay") || ""; } catch {}
  fPay = t ? (t.pay || "") : last;
  amt = t ? String(t.amount) : "";
  $("f-date").value = t ? t.date : (tab === "ledger" && sub === "cal" && selDay ? selDay : todayStr());
  $("f-memo").value = t ? (t.memo || "") : "";
  $("dlg-title").textContent = t ? "내역 수정" : "내역 추가";
  $("f-who").textContent = t ? nameOf(t) : meName();
  $("f-delete").hidden = !t;
  $("f-again").hidden = !!t;
  drawForm();
  $("dlg").showModal();
}
$("fab").onclick = () => openForm(null);
$("f-close").onclick = () => $("dlg").close();
$("f-type").onclick = e => { const b = e.target.closest("button"); if (!b) return; fType = b.dataset.t; drawForm(); };
$("keypad").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const k = b.dataset.k || b.textContent;
  if (k === "del") amt = amt.slice(0, -1);
  else if (k[0] === "+") amt = String((+amt || 0) + +k.slice(1));
  else amt = (amt + k).replace(/^0+/, "");
  if (amt.length > 11) amt = amt.slice(0, 11);
  drawForm();
};
$("f-memo").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } };
function save(again) {
  const amount = +amt;
  if (!amount) return toast("금액을 입력해 주세요");
  if (!$("f-date").value) return toast("날짜를 골라 주세요");
  const data = { type: fType, amount, category: fCat, pay: fPay, memo: $("f-memo").value.trim(), date: $("f-date").value };
  try { localStorage.setItem("lastPay", fPay); } catch {}
  // 오프라인이면 대기했다가 연결되면 자동 전송되므로 기다리지 않음
  const col = collection(db, "households", hid, "transactions");
  (editing ? updateDoc(doc(col, editing.id), data) : addDoc(col, { ...data, uid: user.uid, by: nick, createdAt: Date.now() }))
    .catch(e => alert(errText(e)));
  if (again) { amt = ""; $("f-memo").value = ""; drawForm(); toast("저장했어요. 다음 내역을 입력하세요"); }
  else { $("dlg").close(); toast(editing ? "수정했어요" : "저장했어요"); }
}
$("form").onsubmit = ev => { ev.preventDefault(); save(false); };
$("f-again").onclick = () => save(true);
$("f-delete").onclick = () => {
  if (!editing || !confirm("이 내역을 삭제할까요?")) return;
  const id = editing.id; $("dlg").close();
  deleteDoc(doc(db, "households", hid, "transactions", id)).then(() => toast("삭제했어요"), e => alert(errText(e)));
};
