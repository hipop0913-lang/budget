import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc,
  arrayUnion, collection, addDoc, deleteDoc, query, where, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ================= 기본 설정 =================
// 분류: [대분류, [소분류...]]  — 부부가 앱에서 소분류를 더 추가할 수 있음
const TREE = {
  out: [
    ["식비", ["식재료", "외식", "배달", "카페/간식"]],
    ["생활", ["생활용품", "미용", "세탁/수선"]],
    ["주거/통신", ["월세/관리비", "공과금", "통신비", "구독"]],
    ["교통/차량", ["대중교통", "택시", "주유", "주차/통행료", "차량정비"]],
    ["건강", ["병원", "약국", "운동"]],
    ["문화/여가", ["영화/공연", "취미", "여행", "도서"]],
    ["쇼핑", ["의류", "잡화", "가전/가구"]],
    ["경조사/선물", ["경조사비", "선물", "부모님 용돈"]],
    ["금융", ["보험", "대출이자", "세금", "저축/투자"]],
    ["육아", ["교육", "육아용품", "의료"]],
    ["기타", []]
  ],
  in: [["월급", []], ["상여", []], ["부수입", []], ["이자/배당", []], ["용돈", []], ["기타", []]]
};
const ICON = { "식비": ["🍚", "#ffe9d6"], "생활": ["🧺", "#e0f2f1"], "주거/통신": ["🏠", "#e6e3fb"], "교통/차량": ["🚌", "#dbeafe"],
  "건강": ["💊", "#fde2e4"], "문화/여가": ["🎬", "#fff3c4"], "쇼핑": ["🛍️", "#e9e3ff"], "경조사/선물": ["🎁", "#fde7f3"],
  "금융": ["🏦", "#e8eaf0"], "육아": ["🍼", "#ffe0ef"], "기타": ["📦", "#ececec"],
  "월급": ["💰", "#dcf5e6"], "상여": ["🎉", "#fff3c4"], "부수입": ["💵", "#e4f5d6"], "이자/배당": ["📈", "#dbeafe"], "용돈": ["🧧", "#ffe9e0"] };
// 예전 버전 분류 → 새 대분류/소분류
const LEGACY = { "카페/간식": ["식비", "카페/간식"], "장보기": ["식비", "식재료"], "교통": ["교통/차량", ""], "생활용품": ["생활", "생활용품"],
  "의료": ["건강", "병원"], "육아/교육": ["육아", "교육"], "경조사": ["경조사/선물", "경조사비"], "여행": ["문화/여가", "여행"],
  "보험/금융": ["금융", ""], "반려동물": ["기타", ""], "이자/투자": ["이자/배당", ""] };
const PAY_KINDS = ["신용카드", "체크카드", "간편결제", "현금", "계좌"];
const KIND_COLOR = { "신용카드": "linear-gradient(135deg,#1e3a8a,#3b82f6)", "체크카드": "linear-gradient(135deg,#0f766e,#2dd4bf)",
  "간편결제": "#fee500", "현금": "#16a36a", "계좌": "linear-gradient(135deg,#7c3aed,#c084fc)" };
const PALETTE = ["#2c56d8", "#0f7a4d", "#b45309", "#7c3aed", "#c2255c", "#0e7490", "#4d7c0f", "#64748b"];
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const $ = id => document.getElementById(id);
const won = n => Math.round(n).toLocaleString("ko-KR");
const wonU = n => (n < 0 ? "-" : "") + won(Math.abs(n)) + "원";
const man = n => n >= 10000 ? (Math.round(n / 1000) / 10) + "만" : won(n);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(cls, text, onclick) { const b = el("button", cls, text); b.type = "button"; if (onclick) b.onclick = onclick; return b; }

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// 오프라인에서 입력해도 연결되면 자동으로 동기화됩니다
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// ================= 상태 =================
let user = null, hid = null, nick = "";
let unsubs = [], unsubTx = null;
let all = [];                       // 지난달 + 이번 달 내역
let budget = null, budgetErr = null;
let pays = [];                      // 결제수단 [{id,name,kind,owner}]  owner = uid 또는 "shared"
let extraSubs = {};                 // 추가한 소분류 { "out|식비": ["야식"] }
let cur = new Date(); cur.setDate(1);
let tab = "ledger", sub = "daily", selDay = todayStr();
let personF = "all", payF = "all", stType = "out", stBy = "cat", stDrill = null;

const metaRef = name => doc(db, "households", hid, "meta", name);
const range = () => {
  const s = ymd(cur), e = ymd(new Date(cur.getFullYear(), cur.getMonth() + 1, 1));
  return { s, e, ps: ymd(new Date(cur.getFullYear(), cur.getMonth() - 1, 1)) };
};
const curItems = () => { const { s, e } = range(); return all.filter(t => t.date >= s && t.date < e); };
const prevItems = () => { const { s } = range(); return all.filter(t => t.date < s); };
const meName = () => nick || "나";
const otherName = () => all.find(t => t.uid !== user.uid && t.by)?.by || "상대";
const nameOf = t => t.by || (t.uid === user.uid ? meName() : otherName());

// 분류
const tree = type => TREE[type].map(([b, subs]) => [b, [...subs, ...(extraSubs[`${type}|${b}`] || [])]]);
function norm(t) {
  if ("sub" in t) return { big: t.category, sub: t.sub || "" };
  const l = LEGACY[t.category];
  return l ? { big: l[0], sub: l[1] } : { big: t.category, sub: "" };
}
const catLabel = t => { const { big, sub } = norm(t); return sub ? `${big} › ${sub}` : big; };
const icon = big => ICON[big] || ["📦", "#ececec"];
// 결제수단
const payLabel = t => t.payName || t.pay || "";
const ownerName = o => o === "shared" ? "공용" : o === user.uid ? meName() : otherName();

const filtered = list => list.filter(t =>
  (personF === "all" || (personF === "me") === (t.uid === user.uid)) &&
  (payF === "all" || payLabel(t) === payF));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

function show(v) { for (const x of ["login", "household", "app"]) $("view-" + x).hidden = x !== v; }
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

// ================= 로그인 / 연결 =================
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
  unsubs.forEach(f => f()); unsubs = [];
  if (unsubTx) { unsubTx(); unsubTx = null; }
  if (!u) { hid = null; return show("login"); }
  const me = await getDoc(doc(db, "users", u.uid)).catch(() => null);
  hid = me?.exists() ? me.data().householdId : null;
  nick = me?.exists() ? (me.data().nickname || "") : "";
  hid ? startApp() : show("household");
});

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

// 별명 / 초대 코드
function askNick() { $("nick-input").value = nick; $("dlg-nick").showModal(); }
$("m-nick").onclick = askNick;
$("form-nick").onsubmit = async ev => {
  ev.preventDefault();
  nick = $("nick-input").value.trim();
  $("dlg-nick").close(); render();
  await setDoc(doc(db, "users", user.uid), { nickname: nick }, { merge: true }).catch(e => alert(errText(e)));
};
$("m-code").onclick = () => {
  if (navigator.clipboard) navigator.clipboard.writeText(hid).then(() => toast("초대 코드를 복사했어요"), () => prompt("초대 코드", hid));
  else prompt("초대 코드", hid);
};

// ================= 시작 & 실시간 구독 =================
function startApp() {
  show("app");
  listenTx();
  // 예산 · 결제수단 · 추가 소분류도 실시간으로 공유
  unsubs.push(onSnapshot(metaRef("budget"),
    s => { budget = s.exists() ? s.data() : null; budgetErr = null; render(); }, e => { budgetErr = e; render(); }));
  unsubs.push(onSnapshot(metaRef("pays"),
    s => { pays = s.exists() ? (s.data().list || []) : []; render(); if ($("dlg-pays").open) drawPays(); if ($("dlg").open) drawForm(); }, () => {}));
  unsubs.push(onSnapshot(metaRef("categories"),
    s => { extraSubs = s.exists() ? (s.data().extra || {}) : {}; if ($("dlg").open) drawForm(); }, () => {}));
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

// ================= 화면 전환 =================
function setOn(container, attr, val) {
  container.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset[attr] === val));
}
const pick = (id, fn) => $(id).onclick = e => { const b = e.target.closest("button"); if (b) { fn(b); render(); } };
pick("bottom", b => { tab = b.dataset.tab; window.scrollTo(0, 0); });
pick("subtabs", b => sub = b.dataset.sub);
pick("person-chips", b => personF = b.dataset.p);
pick("stats-type", b => { stType = b.dataset.t; stDrill = null; });
pick("stats-by", b => { stBy = b.dataset.b; stDrill = null; });
$("pay-filter").onchange = e => { payF = e.target.value; render(); };

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

  // 결제수단 필터: 이번 달에 쓴 결제수단 이름들
  const names = [...new Set(curItems().map(payLabel).filter(Boolean))].sort();
  if (payF !== "all" && !names.includes(payF)) names.push(payF);
  const sel = $("pay-filter");
  sel.innerHTML = "";
  sel.append(new Option("결제수단 ▾", "all"), ...names.map(n => new Option(n, n)));
  sel.value = payF;

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
  if (tab === "budget") extra.append(btn("", "수정", openBudget));

  if (tab === "ledger") renderLedger();
  if (tab === "stats") renderStats();
  if (tab === "budget") renderBudget();
  if (tab === "more") {
    $("m-nick-v").textContent = nick || "(없음)";
    $("m-code-v").textContent = hid;
    $("m-pays-v").textContent = `${pays.filter(p => p.owner === user.uid).length}개`;
  }
}

// ================= 가계부: 목록 / 달력 =================
const budgetTotal = () => budget?.total || Object.values(budget?.cats || {}).reduce((s, v) => s + v, 0);
function sums(list) {
  let i = 0, o = 0;
  for (const t of list) t.type === "in" ? i += t.amount : o += t.amount;
  return { i, o };
}
function renderLedger() {
  const list = filtered(curItems());
  const { i, o } = sums(list);
  $("hero-label").textContent = personF === "all" ? "이번 달 지출" : `${personF === "me" ? meName() : otherName()}의 이번 달 지출`;
  $("sum-out").textContent = wonU(o);
  $("sum-in").textContent = wonU(i);
  $("sum-total").textContent = wonU(i - o);
  const tot = budgetTotal(), hb = $("hero-budget");
  hb.hidden = !(tot && personF === "all" && payF === "all" && !budgetErr);
  if (!hb.hidden) {
    const spent = sums(curItems()).o, p = spent / tot * 100;
    $("hb-text").textContent = `${Math.round(p)}% 사용 · ${tot - spent >= 0 ? won(tot - spent) + "원 남음" : won(spent - tot) + "원 초과"}`;
    $("hb-fill").style.width = Math.min(p, 100) + "%";
  }
  sub === "daily" ? renderDaily(list) : renderCal(list);
}
$("hero-budget").onclick = () => { tab = "budget"; render(); };
function dayHead(date, arr) {
  const d = new Date(date + "T00:00:00"), h = el("div", "dhead");
  h.append(el("span", "", `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})${date === todayStr() ? " · 오늘" : ""}`));
  const net = arr.reduce((s, t) => s + (t.type === "in" ? t.amount : -t.amount), 0);
  h.append(el("span", "", (net > 0 ? "+" : "") + wonU(net)));
  return h;
}
function row(t) {
  const { big, sub: sb } = norm(t), [em, bg] = icon(big);
  const r = btn("item");
  const ic = el("span", "ico", em); ic.style.background = bg;
  const mid = el("span", "mid");
  mid.append(el("div", "t1", t.memo || sb || big));
  const t2 = el("div", "t2");
  t2.append(el("i", "dot " + (t.uid === user.uid ? "me" : "other")),
    document.createTextNode([nameOf(t), catLabel(t), payLabel(t)].filter(Boolean).join(" · ")));
  mid.append(t2);
  r.append(ic, mid, el("span", "amt " + (t.type === "in" ? "in" : "out"), (t.type === "in" ? "+" : "-") + won(t.amount) + "원"));
  r.onclick = () => openForm(t);
  return r;
}
function dayBlock(date, arr) {
  const d = el("div", "day"), c = el("div", "card");
  arr.forEach(t => c.append(row(t)));
  d.append(dayHead(date, arr), c);
  return d;
}
const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
function renderDaily(list) {
  const box = $("pane-daily"); box.innerHTML = "";
  if (!list.length) return box.append(el("div", "empty", "이 달의 내역이 없어요. 오른쪽 아래 + 버튼으로 추가해 보세요."));
  const groups = new Map();
  for (const t of [...list].sort(byNewest)) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  for (const [date, arr] of groups) box.append(dayBlock(date, arr));
}
function renderCal(list) {
  const grid = $("cal-grid"); grid.innerHTML = "";
  const y = cur.getFullYear(), m = cur.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const byDay = new Map();
  for (const t of list) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); }
  let max = 0;
  for (const arr of byDay.values()) max = Math.max(max, sums(arr).o);
  for (let i = 0; i < first; i++) grid.append(el("div"));
  for (let d = 1; d <= days; d++) {
    const date = `${y}-${pad(m + 1)}-${pad(d)}`, dow = (first + d - 1) % 7;
    const c = btn("cell");
    if (date === todayStr()) c.classList.add("today");
    if (date === selDay) c.classList.add("sel");
    c.append(el("span", "n" + (dow === 0 ? " sun" : dow === 6 ? " sat" : ""), String(d)));
    const { i, o } = sums(byDay.get(date) || []);
    if (i) c.append(el("span", "i", "+" + man(i)));
    if (o) c.append(el("span", "o", "-" + man(o)));
    // 많이 쓴 날일수록 진한 빨강, 수입만 있는 날은 연한 파랑
    if (o) c.style.background = `rgba(217,45,58,${(0.07 + 0.3 * o / max).toFixed(2)})`;
    else if (i) c.style.background = "var(--pri-soft)";
    c.onclick = () => { selDay = date; render(); };
    grid.append(c);
  }
  const box = $("cal-day"); box.innerHTML = "";
  if (!selDay) return;
  const arr = (byDay.get(selDay) || []).sort(byNewest);
  if (!arr.length) { const d = el("div", "day"); d.append(dayHead(selDay, arr), el("div", "card empty", "이날은 내역이 없어요.")); return box.append(d); }
  box.append(dayBlock(selDay, arr));
}

// ================= 통계 =================
function renderStats() {
  const now = curItems(), tot = sums(now);
  $("st-out").textContent = won(tot.o);
  $("st-in").textContent = won(tot.i);
  const box = $("pane-stats"); box.innerHTML = "";
  const kind = stType === "out" ? "지출" : "수입";
  const drill = stBy === "cat" && stDrill;
  const pick = t => t.type === stType && (!drill || norm(t).big === stDrill);
  const list = now.filter(pick), prevList = prevItems().filter(pick);
  const keyOf = t => stBy === "cat" ? (drill ? (norm(t).sub || "(소분류 없음)") : norm(t).big)
    : stBy === "pay" ? (payLabel(t) || "미지정") : nameOf(t);

  if (drill) {
    const cr = el("div", "crumb");
    cr.append(btn("", "‹ 전체", () => { stDrill = null; render(); }), el("span", "", "/"), el("b", "", stDrill));
    box.append(cr);
  }
  const total = list.reduce((s, t) => s + t.amount, 0);
  if (!total) return box.append(el("div", "empty", `이 달의 ${drill ? stDrill + " " : ""}${kind} 내역이 없어요.`));

  const map = new Map(), pmap = new Map();
  for (const t of list) map.set(keyOf(t), (map.get(keyOf(t)) || 0) + t.amount);
  for (const t of prevList) pmap.set(keyOf(t), (pmap.get(keyOf(t)) || 0) + t.amount);
  const rows = [...map].sort((a, b) => b[1] - a[1]);
  const color = i => PALETTE[Math.min(i, PALETTE.length - 1)];
  const pct = v => Math.round(v / total * 100);

  // 도넛 차트
  const NS = "http://www.w3.org/2000/svg", R = 70, C = 2 * Math.PI * R;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 180 180");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${kind} 비율 도넛 차트: ` + rows.map(([k, v]) => `${k} ${pct(v)}%`).join(", "));
  const g = document.createElementNS(NS, "g"); g.setAttribute("transform", "rotate(-90 90 90)");
  let acc = 0;
  rows.forEach(([, v], i) => {
    const len = v / total * C, c = document.createElementNS(NS, "circle"), gap = rows.length > 1 ? 2 : 0;
    Object.entries({ cx: 90, cy: 90, r: R, fill: "none", stroke: color(i), "stroke-width": 26,
      "stroke-dasharray": `${Math.max(len - gap, 0.5)} ${C}`, "stroke-dashoffset": -acc }).forEach(([a, b]) => c.setAttribute(a, b));
    g.append(c); acc += len;
  });
  svg.append(g);
  const dn = el("div", "donut"); dn.append(svg);
  const center = el("div", "c");
  center.append(el("span", "", drill ? stDrill : `총 ${kind}`), el("b", "", won(total)));
  const bTot = drill && stType === "out" ? budgetOf(stDrill) : 0;
  const prev = prevList.reduce((s, t) => s + t.amount, 0);
  if (bTot) {
    const em = el("em", "", `예산의 ${Math.round(total / bTot * 100)}%`);
    if (total / bTot >= 0.9) em.style.color = "var(--out)";
    center.append(em);
  } else if (prev) {
    const diff = Math.round((total - prev) / prev * 100);
    const em = el("em", "", diff === 0 ? "지난달과 비슷" : `지난달보다 ${diff > 0 ? "+" : ""}${diff}%`);
    if (stType === "out" && diff > 0) em.style.color = "var(--out)";
    center.append(em);
  }
  dn.append(center);
  const lg = el("div", "legend");
  rows.slice(0, 6).forEach(([k, v], i) => {
    const d = el("div"), dot = el("i"); dot.style.background = color(i);
    d.append(dot, el("span", "", k), el("b", "", pct(v) + "%")); lg.append(d);
  });
  const top = el("div", "card donut-card"); top.append(dn, lg); box.append(top);

  // 순위 (대분류는 누르면 소분류 상세로)
  const canDrill = stBy === "cat" && !drill && stType === "out";
  const rk = el("div", "card mt");
  const head = el("div", "sec");
  head.style.cssText = "display:flex;justify-content:space-between";
  head.append(el("span", "", drill ? "소분류 순위" : stBy === "cat" ? (canDrill ? "분류별 순위 · 누르면 소분류" : "분류별 순위") : stBy === "pay" ? "결제수단별 순위" : "작성자별 순위"),
    el("span", "", "지난달 대비"));
  rk.append(head);
  rows.forEach(([k, v], i) => {
    const r = el("div", "rank" + (canDrill ? " tap" : "")), h = el("div", "h"), l = el("span");
    l.append(el("b", "", String(i + 1)), k);
    const right = el("span"); right.append(el("b", "", wonU(v)));
    const pv = pmap.get(k);
    if (pv) {
      const df = Math.round((v - pv) / pv * 100), sm = el("small", "", (df > 0 ? "+" : "") + df + "%");
      sm.style.color = df > 0 ? (stType === "out" ? "var(--out)" : "var(--ok-t)") : df < 0 ? (stType === "out" ? "var(--ok-t)" : "var(--out)") : "var(--sub)";
      right.append(sm);
    }
    if (canDrill) right.append(el("span", "go", "›"));
    h.append(l, right);
    const tr = el("div", "track"), f = el("i");
    f.style.cssText = `width:${v / rows[0][1] * 100}%;background:${color(i)}`; tr.append(f);
    r.append(h, tr);
    if (canDrill) r.onclick = () => { stDrill = k; window.scrollTo(0, 0); render(); };
    rk.append(r);
  });
  box.append(rk);

  if (stBy !== "who") {
    const meSum = list.filter(t => t.uid === user.uid).reduce((s, t) => s + t.amount, 0), ot = total - meSum;
    const sp = el("div", "card split");
    sp.append(el("div", "lb", stType === "out" ? "누가 얼마 썼나" : "누가 얼마 벌었나"));
    const bar = el("div", "barx"), a = el("i"), b = el("i");
    a.style.cssText = `width:${meSum / total * 100}%;background:var(--me)`;
    b.style.cssText = `width:${ot / total * 100}%;background:var(--other)`;
    bar.append(a, b);
    const r2 = el("div", "row2");
    r2.append(el("span", "", `${meName()} ${wonU(meSum)} (${pct(meSum)}%)`), el("span", "", `${otherName()} ${wonU(ot)} (${pct(ot)}%)`));
    sp.append(bar, r2); box.append(sp);
  }
  if (drill) {
    const lc = el("div", "day");
    lc.append(el("div", "dhead", `${stDrill} 내역 ${list.length}건`));
    const c = el("div", "card");
    [...list].sort(byNewest).forEach(t => c.append(row(t)));
    lc.append(c); box.append(lc);
  }
}

// ================= 예산 (대분류 기준) =================
const level = p => p > 100 ? ["var(--out)", "var(--out)"] : p >= 90 ? ["var(--warn)", "var(--warn-t)"] : ["var(--ok)", "var(--ok-t)"];
// 예전 예산 키(예: '교통')도 새 대분류로 합쳐서 계산
function budgetCats() {
  const out = {};
  for (const [k, v] of Object.entries(budget?.cats || {})) {
    const big = LEGACY[k]?.[0] || k;
    out[big] = (out[big] || 0) + v;
  }
  return out;
}
const budgetOf = big => budgetCats()[big] || 0;
function renderBudget() {
  const box = $("pane-budget"); box.innerHTML = "";
  if (budgetErr) return box.append(el("div", "empty", errText(budgetErr)));
  const cats = budgetCats();
  const total = budgetTotal();
  if (!total) {
    const e = el("div", "empty", "아직 예산이 없어요. 한 달에 얼마 쓸지 정해 보세요.");
    const b = btn("primary", "예산 설정하기", openBudget); b.style.cssText = "display:block;margin:16px auto 0;padding:12px 20px";
    e.append(b); box.append(e); return;
  }
  const outs = curItems().filter(t => t.type === "out");
  const spent = outs.reduce((s, t) => s + t.amount, 0);
  const p = spent / total * 100, left = total - spent;

  const card = el("div", "card bcard");
  const h = el("div", "h"); h.append(el("span", "sub", "한 달 예산")); card.append(h, el("div", "big", wonU(total)));
  const tr = el("div", "track"), fill = el("i");
  fill.style.cssText = `width:${Math.min(p, 100)}%;background:${level(p)[0]}`; tr.append(fill); card.append(tr);
  const r = el("div", "r");
  const a = el("span"); a.append("쓴 돈 ", el("b", "out", won(spent)), ` (${Math.round(p)}%)`);
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

  const order = TREE.out.map(x => x[0]);
  const names = Object.keys(cats).filter(k => cats[k] > 0).sort((x, y) => order.indexOf(x) - order.indexOf(y));
  if (!names.length) return;
  const listCard = el("div", "card mt"); listCard.append(el("div", "sec", "분류별 예산")); box.append(listCard);
  for (const k of names) {
    const lim = cats[k], used = outs.filter(x => norm(x).big === k).reduce((s2, x) => s2 + x.amount, 0);
    const pp = used / lim * 100, [bg, fg] = level(pp);
    const rw = el("div", "brow");
    const hh = el("div", "h"), right = el("span");
    const ub = el("b", "", won(used)); if (pp > 100) ub.style.color = "var(--out)";
    right.append(ub, ` / ${won(lim)}`);
    hh.append(el("b", "", k), right);
    const t2 = el("div", "track"), f2 = el("i"); f2.style.cssText = `width:${Math.min(pp, 100)}%;background:${bg}`; t2.append(f2);
    const st = el("div", "s", `${Math.round(pp)}% · ${lim - used >= 0 ? won(lim - used) + "원 남음" : won(used - lim) + "원 초과"}`);
    st.style.color = fg; if (pp > 100) st.style.fontWeight = "700";
    rw.append(hh, t2, st); listCard.append(rw);
  }
}
const numIn = inp => inp.oninput = () => { const n = inp.value.replace(/\D/g, ""); inp.value = n ? (+n).toLocaleString("ko-KR") : ""; };
const numOf = inp => +inp.value.replace(/\D/g, "") || 0;
function openBudget() {
  const tIn = $("b-total"); numIn(tIn);
  tIn.value = budget?.total ? won(budget.total) : "";
  const cats = budgetCats(), box = $("b-cats"); box.innerHTML = "";
  for (const [c] of TREE.out) {
    const lab = el("label", "row"); lab.append(el("span", "lab", c));
    const i = el("input"); i.inputMode = "numeric"; i.placeholder = "-"; i.dataset.cat = c;
    i.value = cats[c] ? won(cats[c]) : ""; numIn(i);
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
  setDoc(metaRef("budget"), { total: numOf($("b-total")), cats }).then(() => toast("예산을 저장했어요"), e => alert(errText(e)));
};

// ================= 결제수단 관리 =================
const savePays = list => setDoc(metaRef("pays"), { list }).catch(e => alert(errText(e)));
function payRow(p, canDelete) {
  const r = el("div", "pm");
  const chip = el("span", "cardchip"); chip.style.background = KIND_COLOR[p.kind] || "#94a3b8";
  const n = el("div", "n"); n.append(el("b", "", p.name), el("small", "", p.kind));
  r.append(chip, n);
  if (canDelete) r.append(btn("x", "✕", () => {
    if (confirm(`'${p.name}'을(를) 지울까요? (이미 입력한 내역의 이름은 그대로 남아요)`)) savePays(pays.filter(x => x.id !== p.id));
  }));
  return r;
}
function drawPays() {
  const box = $("p-list"); box.innerHTML = "";
  const groups = [
    [`내 결제수단 (${meName()}) · 입력할 때 이것만 보여요`, pays.filter(p => p.owner === user.uid), true],
    ["공용 · 둘 다 입력 가능", pays.filter(p => p.owner === "shared"), true],
    [`${otherName()}의 결제수단 · 보기만 가능`, pays.filter(p => p.owner !== user.uid && p.owner !== "shared"), false]
  ];
  for (const [title, list, mine] of groups) {
    box.append(el("div", "psec", title));
    const c = el("div", "card");
    list.forEach(p => c.append(payRow(p, mine)));
    if (!list.length && !mine) c.append(el("div", "empty", "아직 없어요"));
    if (mine) c.append(btn("addrow", "+ 결제수단 추가", () => openAddPay(title.startsWith("공용") ? "shared" : "me")));
    box.append(c);
  }
}
$("m-pays").onclick = () => { drawPays(); $("dlg-pays").showModal(); };
$("p-close").onclick = () => $("dlg-pays").close();

let apKind = "신용카드", apOwner = "me", apAfter = null;
function drawAddPay() {
  const k = $("ap-kind"); k.innerHTML = "";
  PAY_KINDS.forEach(x => k.append(btn(x === apKind ? "on" : "", x, () => { apKind = x; drawAddPay(); })));
  setOn($("ap-owner"), "o", apOwner);
}
function openAddPay(owner, after) {
  apKind = "신용카드"; apOwner = owner || "me"; apAfter = after || null;
  $("ap-name").value = ""; drawAddPay(); $("dlg-addpay").showModal();
}
$("ap-owner").onclick = e => { const b = e.target.closest("button"); if (b) { apOwner = b.dataset.o; drawAddPay(); } };
$("ap-cancel").onclick = () => $("dlg-addpay").close();
$("form-addpay").onsubmit = ev => {
  ev.preventDefault();
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: $("ap-name").value.trim(),
    kind: apKind, owner: apOwner === "shared" ? "shared" : user.uid };
  if (!p.name) return;
  pays = [...pays, p];
  savePays(pays);
  $("dlg-addpay").close();
  if (apAfter) apAfter(p);
  if ($("dlg-pays").open) drawPays();
};

// ================= 입력/수정 화면 =================
// 칸(날짜·금액·분류·결제수단)을 누르면 아래 창이 그 칸에 맞게 바뀜
let editing = null, fType = "out", fBig = "", fSub = "", fPay = null, amt = "", fDate = "";
let panel = "amt", leftBig = "", leftPay = "me", calM = null, errField = "";

function drawForm() {
  setOn($("f-type"), "t", fType);
  const d = new Date(fDate + "T00:00:00");
  $("f-date-v").textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${DOW[d.getDay()]})`;
  $("f-amount").textContent = amt ? won(+amt) : "0";
  $("f-amount").parentElement.className = "amount " + fType;
  const cv = $("f-cat-v"), pv = $("f-pay-v");
  cv.textContent = fBig ? (fSub ? `${fBig} › ${fSub}` : fBig) : "터치해서 선택";
  cv.classList.toggle("ph", !fBig);
  pv.textContent = fPay ? fPay.name : "터치해서 선택";
  pv.classList.toggle("ph", !fPay);
  document.querySelectorAll(".frow").forEach(r => {
    r.classList.toggle("on", r.dataset.p === panel);
    r.classList.toggle("err", r.dataset.p === errField && r.dataset.p !== panel);
  });
  $("keypad").hidden = panel !== "amt";
  const box = $("f-panel");
  box.hidden = !["cat", "pay", "date"].includes(panel);
  box.innerHTML = "";
  if (panel === "cat") drawCatPanel(box);
  if (panel === "pay") drawPayPanel(box);
  if (panel === "date") drawDatePanel(box);
}
function setPanel(p) {
  panel = p;
  if (p === "cat" && !leftBig) leftBig = fBig || tree(fType)[0][0];
  if (p === "date") { const d = new Date(fDate + "T00:00:00"); calM = new Date(d.getFullYear(), d.getMonth(), 1); }
  if (p !== "none") $("f-memo").blur();
  drawForm();
}
document.querySelectorAll(".frow").forEach(r => r.onclick = () => setPanel(r.dataset.p));
$("f-memo").onfocus = () => { panel = "none"; drawForm(); };

function ptop(title, actionText, action) {
  const t = el("div", "ptop"); t.append(el("b", "", title));
  if (actionText) t.append(btn("", actionText, action));
  return t;
}
function chooseCat(big, sb) {
  fBig = big; fSub = sb; if (errField === "cat") errField = "";
  setPanel(fPay ? "amt" : "pay");   // 분류를 고르면 결제수단 창으로 자동 이동
}
function drawCatPanel(box) {
  box.append(ptop("분류", fType === "out" ? "+ 소분류 추가" : "", () => {
    const name = (prompt(`'${leftBig}'에 추가할 소분류 이름`) || "").trim();
    if (!name) return;
    const key = `out|${leftBig}`, next = { ...extraSubs, [key]: [...(extraSubs[key] || []), name] };
    extraSubs = next;
    setDoc(metaRef("categories"), { extra: next }).catch(e => alert(errText(e)));
    chooseCat(leftBig, name);
  }));
  const two = el("div", "two"), L = el("div", "big"), R = el("div", "small");
  const t = tree(fType);
  for (const [big, subs] of t) {
    const [em, bg] = icon(big);
    const b = btn(big === leftBig ? "on" : "");
    const ic = el("span", "ic", em); ic.style.background = bg;
    b.append(ic, big);
    b.onclick = () => { if (!subs.length) return chooseCat(big, ""); leftBig = big; drawForm(); };
    L.append(b);
  }
  const subs = (t.find(x => x[0] === leftBig) || [, []])[1];
  if (!subs.length) R.append(el("div", "none", "왼쪽에서 바로 고르세요"));
  for (const s of subs) {
    const on = fBig === leftBig && fSub === s;
    const b = btn(on ? "on" : "", s, () => chooseCat(leftBig, s));
    if (on) b.append(el("span", "", "✓"));
    R.append(b);
  }
  if (subs.length) R.append(btn("muted" + (fBig === leftBig && !fSub ? " on" : ""), `${leftBig} (소분류 없이)`, () => chooseCat(leftBig, "")));
  two.append(L, R); box.append(two);
}
function recentPays() {
  const seen = new Set(), out = [];
  for (const t of [...all].filter(t => t.uid === user.uid && t.payId).sort(byNewest)) {
    if (seen.has(t.payId)) continue;
    const p = pays.find(x => x.id === t.payId);
    if (p) { seen.add(t.payId); out.push(p); }
    if (out.length >= 5) break;
  }
  return out;
}
function drawPayPanel(box) {
  box.append(ptop("결제수단", "관리 ›", () => { drawPays(); $("dlg-pays").showModal(); }));
  const two = el("div", "two"), L = el("div", "big"), R = el("div", "small");
  const groups = [
    ["me", "내 것", meName().slice(0, 1), "#dbe6ff", "#2c56d8", pays.filter(p => p.owner === user.uid)],
    ["shared", "공용", "🏠", "#efe3ff", "", pays.filter(p => p.owner === "shared")],
    ["other", otherName(), otherName().slice(0, 1), "#ffe0ea", "#c2255c", pays.filter(p => p.owner !== user.uid && p.owner !== "shared")],
    ["recent", "최근", "★", "#e8eaf0", "#4a5263", recentPays()]
  ];
  for (const [key, label, mark, bg, fg] of groups) {
    const b = btn(key === leftPay ? "on" : "");
    const ic = el("span", "ic" + (fg ? " t" : ""), mark); ic.style.background = bg; if (fg) ic.style.color = fg;
    b.append(ic, label);
    b.onclick = () => { leftPay = key; drawForm(); };
    L.append(b);
  }
  const list = groups.find(g => g[0] === leftPay)[5];
  if (!list.length) R.append(el("div", "none", leftPay === "recent" ? "최근에 쓴 결제수단이 없어요" : "아직 등록된 결제수단이 없어요"));
  for (const p of list) {
    const on = fPay?.id === p.id;
    const b = btn(on ? "on" : "");
    const l = el("span", "pl"), chip = el("span", "cardchip");
    chip.style.background = KIND_COLOR[p.kind] || "#94a3b8";
    l.append(chip, p.name); b.append(l);
    if (on) b.append(el("span", "", "✓"));
    b.onclick = () => { fPay = p; setPanel("amt"); };
    R.append(b);
  }
  if (leftPay === "me" || leftPay === "shared") R.append(btn("addb", "+ 결제수단 추가", () =>
    openAddPay(leftPay === "shared" ? "shared" : "me", p => { fPay = p; setPanel("amt"); })));
  if (fPay) R.append(btn("muted", "선택 안 함", () => { fPay = null; drawForm(); }));
  two.append(L, R); box.append(two);
}
function drawDatePanel(box) {
  box.append(ptop("날짜"));
  const nav = el("div", "calnav");
  nav.append(btn("", "‹", () => { calM.setMonth(calM.getMonth() - 1); drawForm(); }),
    el("b", "", `${calM.getFullYear()}년 ${calM.getMonth() + 1}월`),
    btn("", "›", () => { calM.setMonth(calM.getMonth() + 1); drawForm(); }));
  box.append(nav);
  const g = el("div", "cal7");
  DOW.forEach((w, i) => g.append(el("span", "dw" + (i === 0 ? " sun" : i === 6 ? " sat" : ""), w)));
  const y = calM.getFullYear(), m = calM.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  for (let i = 0; i < first; i++) g.append(el("span"));
  const today = todayStr();
  for (let d = 1; d <= days; d++) {
    const date = `${y}-${pad(m + 1)}-${pad(d)}`, dow = (first + d - 1) % 7;
    const cls = [dow === 0 ? "sun" : dow === 6 ? "sat" : "", date === today ? "today" : "", date > today ? "future" : "", date === fDate ? "sel" : ""];
    g.append(btn(cls.filter(Boolean).join(" "), String(d), () => { fDate = date; setPanel("amt"); }));
  }
  box.append(g);
}

function openForm(t) {
  editing = t || null;
  fType = t ? t.type : "out";
  const n = t ? norm(t) : { big: "", sub: "" };
  fBig = n.big; fSub = n.sub;
  fPay = t ? (pays.find(p => p.id === t.payId) || (payLabel(t) ? { id: t.payId || "", name: payLabel(t), legacy: !t.payId } : null)) : null;
  amt = t ? String(t.amount) : "";
  fDate = t ? t.date : (tab === "ledger" && sub === "cal" && selDay ? selDay : todayStr());
  $("f-memo").value = t ? (t.memo || "") : "";
  $("dlg-title").textContent = t ? "내역 수정" : "내역 추가";
  $("f-delete").hidden = !t;
  $("f-again").hidden = !!t;
  errField = ""; leftBig = ""; leftPay = "me";
  panel = "amt";
  $("dlg").showModal();
  drawForm();
}
$("fab").onclick = () => openForm(null);
$("f-close").onclick = () => $("dlg").close();
$("f-type").onclick = e => {
  const b = e.target.closest("button"); if (!b || b.dataset.t === fType) return;
  fType = b.dataset.t; fBig = ""; fSub = ""; leftBig = ""; drawForm();
};
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
  if (!amount) { setPanel("amt"); return toast("금액을 입력해 주세요"); }
  if (!fBig) { errField = "cat"; setPanel("cat"); return toast("분류를 골라 주세요"); }
  const data = { type: fType, amount, category: fBig, sub: fSub, memo: $("f-memo").value.trim(), date: fDate,
    payId: fPay && !fPay.legacy ? fPay.id : "", payName: fPay ? fPay.name : "", pay: "" };
  // 오프라인이면 대기했다가 연결되면 자동 전송되므로 기다리지 않음
  const col = collection(db, "households", hid, "transactions");
  (editing ? updateDoc(doc(col, editing.id), data) : addDoc(col, { ...data, uid: user.uid, by: nick, createdAt: Date.now() }))
    .catch(e => alert(errText(e)));
  if (again) { amt = ""; $("f-memo").value = ""; panel = "amt"; drawForm(); toast("저장했어요. 다음 내역을 입력하세요"); }
  else { $("dlg").close(); toast(editing ? "수정했어요" : "저장했어요"); }
}
$("form").onsubmit = ev => { ev.preventDefault(); save(false); };
$("f-again").onclick = () => save(true);
$("f-delete").onclick = () => {
  if (!editing || !confirm("이 내역을 삭제할까요?")) return;
  const id = editing.id; $("dlg").close();
  deleteDoc(doc(db, "households", hid, "transactions", id)).then(() => toast("삭제했어요"), e => alert(errText(e)));
};
