import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc,
  arrayUnion, collection, addDoc, deleteDoc, query, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ================= 기본 설정 =================
// 분류: [대분류, [소분류...]] — 앱의 '분류 편집'에서 추가·숨기기 가능
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
  in: [["월급", []], ["상여", []], ["부수입", []], ["이자/배당", []], ["용돈", []], ["환불/취소", []], ["기타", []]]
};
const ICON = { "식비": ["🍚", "#ffe9d6"], "생활": ["🧺", "#e0f2f1"], "주거/통신": ["🏠", "#e6e3fb"], "교통/차량": ["🚌", "#dbeafe"],
  "건강": ["💊", "#fde2e4"], "문화/여가": ["🎬", "#fff3c4"], "쇼핑": ["🛍️", "#e9e3ff"], "경조사/선물": ["🎁", "#fde7f3"],
  "금융": ["🏦", "#e8eaf0"], "육아": ["🍼", "#ffe0ef"], "기타": ["📦", "#ececec"],
  "월급": ["💰", "#dcf5e6"], "상여": ["🎉", "#fff3c4"], "부수입": ["💵", "#e4f5d6"], "이자/배당": ["📈", "#dbeafe"], "용돈": ["🧧", "#ffe9e0"],
  "환불/취소": ["↩️", "#e8eaf0"] };
// 예전 버전 분류 → 새 대분류/소분류
const LEGACY = { "카페/간식": ["식비", "카페/간식"], "장보기": ["식비", "식재료"], "교통": ["교통/차량", ""], "생활용품": ["생활", "생활용품"],
  "의료": ["건강", "병원"], "육아/교육": ["육아", "교육"], "경조사": ["경조사/선물", "경조사비"], "여행": ["문화/여가", "여행"],
  "보험/금융": ["금융", ""], "반려동물": ["기타", ""], "이자/투자": ["이자/배당", ""] };
// 가게 이름으로 분류 추측 (한 번 고쳐 주면 그 가게는 기억함)
const GUESS = [
  [/배달의민족|배민|요기요|쿠팡이츠|땡겨요/, "식비", "배달"],
  [/스타벅스|투썸|이디야|메가|빽다방|커피|카페|폴바셋|할리스|컴포즈|파리바게|뚜레쥬르|베이커리|GS25|CU|씨유|세븐일레븐|이마트24|편의점/i, "식비", "카페/간식"],
  [/이마트|홈플러스|롯데마트|코스트코|트레이더스|마트|하나로|컬리|오아시스|정육|농협/, "식비", "식재료"],
  [/주유|에너지|칼텍스|S-?OIL|오일뱅크|알뜰주유/i, "교통/차량", "주유"],
  [/택시|카카오T|카카오모빌리티|우티/, "교통/차량", "택시"],
  [/지하철|버스|코레일|SRT|티머니/, "교통/차량", "대중교통"],
  [/주차|하이패스|도로공사/, "교통/차량", "주차/통행료"],
  [/병원|의원|치과|한의원|내과|소아과|정형외과|안과|피부과/, "건강", "병원"],
  [/약국/, "건강", "약국"],
  [/넷플릭스|NETFLIX|유튜브|YOUTUBE|멜론|디즈니|티빙|웨이브|쿠팡와우|애플|APPLE|GOOGLE/i, "주거/통신", "구독"],
  [/SKT|LG ?U\+|유플러스|통신/i, "주거/통신", "통신비"],
  [/CGV|메가박스|롯데시네마|인터파크|예스24|교보/i, "문화/여가", "영화/공연"],
  [/다이소|올리브영/, "생활", "생활용품"],
  [/미용|헤어|네일/, "생활", "미용"],
  [/쿠팡|11번가|G마켓|옥션|무신사|지그재그/, "쇼핑", "잡화"],
  [/식당|김밥|국밥|치킨|피자|버거|맥도날드|롯데리아|분식|족발|고기|초밥|라멘|짬뽕|반점/, "식비", "외식"]
];
const CARD_WORDS = ["현대", "신한", "삼성", "KB", "국민", "롯데", "하나", "우리", "BC", "비씨", "NH", "농협", "카카오", "토스", "씨티", "IBK", "기업", "케이뱅크", "네이버"];
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
const dateLabel = s => { const d = new Date(s + "T00:00:00"); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${DOW[d.getDay()]})`; };
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(cls, text, onclick) { const b = el("button", cls, text); b.type = "button"; if (onclick) b.onclick = onclick; return b; }
const uid6 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// 오프라인에서 입력해도 연결되면 자동으로 동기화됩니다
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// ================= 상태 =================
let user = null, hid = null, nick = "";
let unsubs = [];
let all = [];                       // 전체 내역 (부부 둘이 쓰는 양이라 전부 불러와도 가벼움)
let budget = null, budgetErr = null;
let pays = [], catsDoc = {}, merchants = {}, favs = [];
let cur = new Date(); cur.setDate(1);
let tab = "ledger", sub = "daily", selDay = todayStr();
let personF = "all", payF = "all", stType = "out", stBy = "cat", stDrill = null;

const metaRef = name => doc(db, "households", hid, "meta", name);
const monthRange = (base, off = 0) => {
  const a = new Date(base.getFullYear(), base.getMonth() + off, 1), b = new Date(base.getFullYear(), base.getMonth() + off + 1, 1);
  return [ymd(a), ymd(b)];
};
const inRange = ([s, e]) => t => t.date >= s && t.date < e;
const curItems = () => all.filter(inRange(monthRange(cur)));
const prevItems = () => all.filter(inRange(monthRange(cur, -1)));
const meName = () => nick || "나";
const otherName = () => all.find(t => t.uid !== user.uid && t.by)?.by || "상대";
const nameOf = t => t.by || (t.uid === user.uid ? meName() : otherName());

// 분류 (편집 내용 반영)
const hiddenSet = () => new Set(catsDoc.hidden || []);
function tree(type, withHidden = false) {
  const h = hiddenSet(), extra = catsDoc.extra || {};
  return TREE[type]
    .filter(([b]) => withHidden || !h.has(`${type}|${b}`))
    .map(([b, subs]) => [b, [...subs, ...(extra[`${type}|${b}`] || [])].filter(s => withHidden || !h.has(`${type}|${b}|${s}`))]);
}
function norm(t) {
  if ("sub" in t) return { big: t.category, sub: t.sub || "" };
  const l = LEGACY[t.category];
  return l ? { big: l[0], sub: l[1] } : { big: t.category, sub: "" };
}
const catLabel = t => { const { big, sub } = norm(t); return sub ? `${big} › ${sub}` : big; };
const icon = big => ICON[big] || ["📦", "#ececec"];
const payLabel = t => t.payName || t.pay || "";
const myPays = () => pays.filter(p => p.owner === user.uid);

const filtered = list => list.filter(t =>
  (personF === "all" || (personF === "me") === (t.uid === user.uid)) &&
  (payF === "all" || payLabel(t) === payF));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

function show(v) { for (const x of ["login", "household", "app"]) $("view-" + x).hidden = x !== v; }
let toastT;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2000);
}
const errText = e => ({
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인을 눌러주세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 해요.",
  "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
  "permission-denied": "저장하지 못했어요. Firebase의 Firestore 규칙을 최신으로 바꿔 주세요."
}[e.code] || "저장하지 못했어요: " + (e.code || e.message));

// 공유 설정 저장: 실패하면 화면도 원래대로 되돌림 (저장 안 됐는데 된 것처럼 보이는 문제 방지)
function saveMeta(name, data, rollback, okMsg) {
  return setDoc(metaRef(name), data).then(() => okMsg && toast(okMsg), e => { rollback && rollback(); refreshOpen(); alert(errText(e)); });
}
function refreshOpen() {
  render();
  if ($("dlg").open) drawForm();
  if ($("dlg-pays").open) drawPays();
  if ($("dlg-cats").open) drawCats();
  if ($("dlg-favs").open) drawFavs();
}

// ================= 로그인 / 연결 =================
$("btn-login").onclick = () => authWith(signInWithEmailAndPassword);
$("btn-signup").onclick = () => authWith(createUserWithEmailAndPassword);
async function authWith(fn) {
  $("login-msg").textContent = "";
  try { await fn(auth, $("email").value.trim(), $("password").value); }
  catch (e) { $("login-msg").textContent = errText(e).replace("저장하지 못했어요: ", "오류: "); }
}
$("btn-logout-1").onclick = $("m-logout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  user = u;
  unsubs.forEach(f => f()); unsubs = [];
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

function askNick() { $("nick-input").value = nick; $("dlg-nick").showModal(); }
$("m-nick").onclick = askNick;
$("form-nick").onsubmit = async ev => {
  ev.preventDefault();
  const prev = nick;
  nick = $("nick-input").value.trim();
  $("dlg-nick").close(); render();
  await setDoc(doc(db, "users", user.uid), { nickname: nick }, { merge: true }).catch(e => { nick = prev; render(); alert(errText(e)); });
};
$("m-code").onclick = () => {
  if (navigator.clipboard) navigator.clipboard.writeText(hid).then(() => toast("초대 코드를 복사했어요"), () => prompt("초대 코드", hid));
  else prompt("초대 코드", hid);
};

// ================= 시작 & 실시간 구독 =================
function startApp() {
  show("app");
  // 상대방이 입력/수정/삭제하면 자동으로 다시 그려집니다 (실시간 연동)
  unsubs.push(onSnapshot(query(collection(db, "households", hid, "transactions"), orderBy("date", "desc")),
    snap => { all = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); if ($("dlg-search").open) drawSearch(); }));
  const listen = (name, fn) => unsubs.push(onSnapshot(metaRef(name), s => { fn(s.exists() ? s.data() : null); refreshOpen(); },
    e => { if (name === "budget") { budgetErr = e; render(); } }));
  listen("budget", d => { budget = d; budgetErr = null; });
  listen("pays", d => { pays = d?.list || []; });
  listen("categories", d => { catsDoc = d || {}; });
  listen("merchants", d => { merchants = d?.map || {}; });
  listen("favorites", d => { favs = d?.list || []; });
  render();
  if (!nick) askNick();
}
function moveMonth(n) {
  cur.setMonth(cur.getMonth() + n);
  const t = todayStr(), r = monthRange(cur);
  selDay = t >= r[0] && t < r[1] ? t : null;
  render();
}
$("prev").onclick = () => moveMonth(-1);
$("next").onclick = () => moveMonth(1);

// ================= 화면 전환 =================
function setOn(container, attr, val) {
  container.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset[attr] === val));
}
const pickBtn = (id, fn) => $(id).onclick = e => { const b = e.target.closest("button"); if (b) { fn(b); render(); } };
pickBtn("bottom", b => { tab = b.dataset.tab; window.scrollTo(0, 0); });
pickBtn("subtabs", b => sub = b.dataset.sub);
pickBtn("person-chips", b => personF = b.dataset.p);
pickBtn("stats-type", b => { stType = b.dataset.t; stDrill = null; });
pickBtn("stats-by", b => { stBy = b.dataset.b; stDrill = null; });
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
  if (tab === "ledger") { const s = btn("", "🔍", openSearch); s.setAttribute("aria-label", "검색"); extra.append(s); }

  if (tab === "ledger") renderLedger();
  if (tab === "stats") renderStats();
  if (tab === "budget") renderBudget();
  if (tab === "more") {
    $("m-nick-v").textContent = nick || "(없음)";
    $("m-code-v").textContent = hid;
    $("m-pays-v").textContent = `${myPays().length}개`;
    $("m-favs-v").textContent = `${favs.filter(f => f.owner === user.uid).length}개`;
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
function groupedInto(box, list) {
  const groups = new Map();
  for (const t of [...list].sort(byNewest)) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  for (const [date, arr] of groups) box.append(dayBlock(date, arr));
}
function renderDaily(list) {
  const box = $("pane-daily"); box.innerHTML = "";
  if (!list.length) return box.append(el("div", "empty", "이 달의 내역이 없어요. 오른쪽 아래 + 버튼으로 추가해 보세요."));
  groupedInto(box, list);
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

// ================= 검색 =================
function openSearch() { $("s-q").value = ""; drawSearch(); $("dlg-search").showModal(); setTimeout(() => $("s-q").focus(), 50); }
$("s-close").onclick = () => $("dlg-search").close();
$("s-q").oninput = () => drawSearch();
function drawSearch() {
  const box = $("s-res"); box.innerHTML = "";
  const q = $("s-q").value.trim().toLowerCase().replace(/,/g, "");
  if (!q) return box.append(el("div", "empty", "메모, 가게 이름, 분류, 결제수단, 금액으로 전체 기간을 찾아요."));
  const hits = all.filter(t => [t.memo, catLabel(t), payLabel(t), nameOf(t), String(t.amount)].join(" ").toLowerCase().replace(/,/g, "").includes(q));
  const { i, o } = sums(hits);
  box.append(el("div", "sum", `${hits.length}건 · 지출 ${wonU(o)}${i ? " · 수입 " + wonU(i) : ""}`));
  if (!hits.length) return box.append(el("div", "empty", "찾는 내역이 없어요."));
  groupedInto(box, hits.slice(0, 300));
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
  if (!total) { box.append(el("div", "empty", `이 달의 ${drill ? stDrill + " " : ""}${kind} 내역이 없어요.`)); box.append(trendCard()); return; }

  const map = new Map(), pmap = new Map();
  for (const t of list) map.set(keyOf(t), (map.get(keyOf(t)) || 0) + t.amount);
  for (const t of prevList) pmap.set(keyOf(t), (pmap.get(keyOf(t)) || 0) + t.amount);
  const rows = [...map].sort((a, b) => b[1] - a[1]);
  const color = i => PALETTE[Math.min(i, PALETTE.length - 1)];
  const pct = v => Math.round(v / total * 100);

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
  box.append(trendCard());
  if (drill) {
    const lc = el("div", "day");
    lc.append(el("div", "dhead", `${stDrill} 내역 ${list.length}건`));
    const c = el("div", "card");
    [...list].sort(byNewest).forEach(t => c.append(row(t)));
    lc.append(c); box.append(lc);
  }
}
// 월별 추이: 보고 있는 달까지 최근 6개월 (막대를 누르면 그 달로 이동)
function trendCard() {
  const kind = stType === "out" ? "지출" : "수입", drillCat = stBy === "cat" && stDrill;
  const months = [];
  for (let k = -5; k <= 0; k++) {
    const r = monthRange(cur, k);
    const v = all.filter(t => t.type === stType && t.date >= r[0] && t.date < r[1] && (!drillCat || norm(t).big === stDrill))
      .reduce((s, t) => s + t.amount, 0);
    months.push([new Date(r[0] + "T00:00:00"), v, k]);
  }
  const max = Math.max(...months.map(m => m[1]), 1);
  const c = el("div", "card mt");
  c.append(el("div", "sec", `월별 ${drillCat ? stDrill + " " : ""}${kind} 추이 · 최근 6개월 (막대를 누르면 그 달로)`));
  const tr = el("div", "trend"), xs = el("div", "trend-x");
  for (const [d, v, k] of months) {
    const b = btn(k === 0 ? "on" : "");
    b.append(el("span", "v", v ? man(v) : ""));
    const bar = el("i"); bar.style.height = Math.max(v / max * 110, v ? 4 : 2) + "px"; b.append(bar);
    b.setAttribute("aria-label", `${d.getMonth() + 1}월 ${wonU(v)}`);
    b.onclick = () => { if (k) moveMonth(k); };
    tr.append(b);
    xs.append(el("span", "", `${d.getMonth() + 1}월`));
  }
  c.append(tr, xs);
  const past = months.slice(0, 5).map(m => m[1]).filter(Boolean);
  if (past.length) {
    const a = past.reduce((s, v) => s + v, 0) / past.length, now = months[5][1];
    const t = el("div", "sec"); t.style.paddingTop = "0";
    t.textContent = `이전 ${past.length}개월 평균 ${wonU(a)} · 이번 달은 평균보다 ${wonU(Math.abs(now - a))} ${now >= a ? "많아요" : "적어요"}`;
    c.append(t);
  }
  return c;
}

// ================= 예산 (대분류 기준) + 카드값 =================
const level = p => p > 100 ? ["var(--out)", "var(--out)"] : p >= 90 ? ["var(--warn)", "var(--warn-t)"] : ["var(--ok)", "var(--ok-t)"];
function budgetCats() {
  const out = {};
  for (const [k, v] of Object.entries(budget?.cats || {})) { const big = LEGACY[k]?.[0] || k; out[big] = (out[big] || 0) + v; }
  return out;
}
const budgetOf = big => budgetCats()[big] || 0;
// 카드값: 이용기간(지난달 시작일 ~ 이번 달 시작일 전날) 사용분이 결제일에 나감
function billInfo(p) {
  const b = +p.billDay, s = +p.cycleStart || 1, T = new Date();
  const B = T.getDate() <= b ? new Date(T.getFullYear(), T.getMonth(), b) : new Date(T.getFullYear(), T.getMonth() + 1, b);
  const from = new Date(B.getFullYear(), B.getMonth() - 1, s), to = new Date(B.getFullYear(), B.getMonth(), s);
  const nto = new Date(B.getFullYear(), B.getMonth() + 1, s);
  const sumIn = (a, z) => all.filter(t => t.payId === p.id && t.date >= ymd(a) && t.date < ymd(z))
    .reduce((x, t) => x + (t.type === "out" ? t.amount : -t.amount), 0);
  const last = new Date(to); last.setDate(last.getDate() - 1);
  const today0 = new Date(T.getFullYear(), T.getMonth(), T.getDate());
  return { B, from, last, amount: sumIn(from, to), next: sumIn(to, nto), dday: Math.round((B - today0) / 864e5) };
}
function billCard() {
  const cards = pays.filter(p => p.billDay && (p.owner === user.uid || p.owner === "shared"));
  const c = el("div", "card mt");
  c.append(el("div", "sec", "카드 결제 예정 · 내 카드 + 공용"));
  if (!cards.length) {
    c.append(el("div", "empty", "결제일을 넣은 카드가 없어요. 더보기 → 결제수단 관리에서 ✎ 를 눌러 결제일을 넣어 주세요."));
    return c;
  }
  const list = cards.map(p => [p, billInfo(p)]).sort((a, b) => a[1].B - b[1].B);
  for (const [p, i] of list) {
    const r = el("div", "bill");
    const chip = el("span", "cardchip"); chip.style.background = KIND_COLOR[p.kind] || "#94a3b8";
    const n = el("div", "n");
    n.append(el("b", "", p.name), el("small", "", `${i.from.getMonth() + 1}/${i.from.getDate()}~${i.last.getMonth() + 1}/${i.last.getDate()} 사용분 · 다음 청구 쌓이는 중 ${wonU(i.next)}`));
    const a = el("div", "a");
    a.append(el("b", "", wonU(i.amount)), el("small", "", `${i.B.getMonth() + 1}/${i.B.getDate()} 결제 · ${i.dday === 0 ? "오늘" : "D-" + i.dday}`));
    r.append(chip, n, a); c.append(r);
  }
  return c;
}
function renderBudget() {
  const box = $("pane-budget"); box.innerHTML = "";
  if (budgetErr) { box.append(el("div", "empty", errText(budgetErr))); return; }
  const cats = budgetCats(), total = budgetTotal();
  const r0 = monthRange(cur), t = todayStr(), isNow = t >= r0[0] && t < r0[1];
  if (!total) {
    const e = el("div", "empty", "아직 예산이 없어요. 한 달에 얼마 쓸지 정해 보세요.");
    const b = btn("primary", "예산 설정하기", openBudget); b.style.cssText = "display:block;margin:16px auto 0;padding:12px 20px";
    e.append(b); box.append(e);
    if (isNow) box.append(billCard());
    return;
  }
  const outs = curItems().filter(x => x.type === "out");
  const spent = outs.reduce((s, x) => s + x.amount, 0);
  const p = spent / total * 100, left = total - spent;
  const card = el("div", "card bcard");
  const h = el("div", "h"); h.append(el("span", "sub", "한 달 예산")); card.append(h, el("div", "big", wonU(total)));
  const tr = el("div", "track"), fill = el("i");
  fill.style.cssText = `width:${Math.min(p, 100)}%;background:${level(p)[0]}`; tr.append(fill); card.append(tr);
  const r = el("div", "r");
  const a = el("span"); a.append("쓴 돈 ", el("b", "out", won(spent)), ` (${Math.round(p)}%)`);
  const b = el("span", "sub"); b.append(left >= 0 ? "남은 돈 " : "초과 ", el("b", "", won(Math.abs(left))));
  r.append(a, b); card.append(r);
  const now = new Date();
  let tip = "";
  if (isNow) {
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    tip = left >= 0 ? `이달은 ${daysLeft}일 남았어요. 하루 약 ${won(Math.floor(left / daysLeft / 100) * 100)}원까지 쓸 수 있어요.`
      : `예산을 ${won(-left)}원 넘었어요. 남은 ${daysLeft}일은 아껴 써요.`;
  } else if (t >= r0[1]) tip = left >= 0 ? `이 달은 예산보다 ${won(left)}원 아꼈어요.` : `이 달은 예산을 ${won(-left)}원 넘었어요.`;
  if (tip) card.append(el("div", "tip", tip));
  box.append(card);
  const order = TREE.out.map(x => x[0]);
  const names = Object.keys(cats).filter(k => cats[k] > 0).sort((x, y) => order.indexOf(x) - order.indexOf(y));
  if (names.length) {
    const listCard = el("div", "card mt"); listCard.append(el("div", "sec", "분류별 예산")); box.append(listCard);
    for (const k of names) {
      const lim = cats[k], used = outs.filter(x => norm(x).big === k).reduce((s2, x) => s2 + x.amount, 0);
      const pp = used / lim * 100, [bg, fg] = level(pp);
      const rw = el("div", "brow"), hh = el("div", "h"), right = el("span");
      const ub = el("b", "", won(used)); if (pp > 100) ub.style.color = "var(--out)";
      right.append(ub, ` / ${won(lim)}`);
      hh.append(el("b", "", k), right);
      const t2 = el("div", "track"), f2 = el("i"); f2.style.cssText = `width:${Math.min(pp, 100)}%;background:${bg}`; t2.append(f2);
      const st = el("div", "s", `${Math.round(pp)}% · ${lim - used >= 0 ? won(lim - used) + "원 남음" : won(used - lim) + "원 초과"}`);
      st.style.color = fg; if (pp > 100) st.style.fontWeight = "700";
      rw.append(hh, t2, st); listCard.append(rw);
    }
  }
  if (isNow) box.append(billCard());
}
const numIn = inp => inp.oninput = () => { const n = inp.value.replace(/\D/g, ""); inp.value = n ? (+n).toLocaleString("ko-KR") : ""; };
const numOf = inp => +inp.value.replace(/\D/g, "") || 0;
function openBudget() {
  const tIn = $("b-total"); numIn(tIn);
  tIn.value = budget?.total ? won(budget.total) : "";
  const cats = budgetCats(), box = $("b-cats"); box.innerHTML = "";
  for (const [c] of tree("out")) {
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
  const prev = budget;
  budget = { total: numOf($("b-total")), cats }; render();
  saveMeta("budget", budget, () => budget = prev, "예산을 저장했어요");
};

// ================= 결제수단 관리 =================
function setPays(list) { const prev = pays; pays = list; refreshOpen(); return saveMeta("pays", { list }, () => pays = prev); }
function payRow(p, mine) {
  const r = el("div", "pm");
  const chip = el("span", "cardchip"); chip.style.background = KIND_COLOR[p.kind] || "#94a3b8";
  const n = el("div", "n"), nb = el("b", "", p.name);
  if (p.def) nb.append(el("span", "def", "기본"));
  n.append(nb, el("small", "", p.kind + (p.billDay ? ` · 결제일 ${p.billDay}일` : "")));
  r.append(chip, n);
  if (mine) {
    const acts = el("div", "acts");
    acts.append(
      btn("", "▲", () => {   // 같은 그룹 안에서 한 칸 위로
        const i = pays.indexOf(p), j = pays.slice(0, i).map(x => x.owner).lastIndexOf(p.owner);
        if (j < 0) return;
        const list = [...pays];[list[i], list[j]] = [list[j], list[i]]; setPays(list);
      }),
      btn("", p.def ? "★" : "☆", () => setPays(pays.map(x => x.owner === p.owner ? { ...x, def: x.id === p.id ? !p.def : false } : x))),
      btn("", "✎", () => openAddPay(p.owner === "shared" ? "shared" : "me", null, p)),
      btn("", "✕", () => { if (confirm(`'${p.name}'을(를) 지울까요? (이미 입력한 내역의 이름은 그대로 남아요)`)) setPays(pays.filter(x => x.id !== p.id)); }));
    acts.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-label", ["위로", "기본으로", "수정", "삭제"][k]));
    r.append(acts);
  }
  return r;
}
function drawPays() {
  const box = $("p-list"); box.innerHTML = "";
  const groups = [
    [`내 결제수단 (${meName()}) · ★ 기본 · ▲ 순서 · ✎ 결제일`, pays.filter(p => p.owner === user.uid), "me"],
    ["공용 · 둘 다 입력 가능", pays.filter(p => p.owner === "shared"), "shared"],
    [`${otherName()}의 결제수단 · 보기만 가능`, pays.filter(p => p.owner !== user.uid && p.owner !== "shared"), null]
  ];
  for (const [title, list, own] of groups) {
    box.append(el("div", "psec", title));
    const c = el("div", "card");
    list.forEach(p => c.append(payRow(p, !!own)));
    if (!list.length && !own) c.append(el("div", "empty", "아직 없어요"));
    if (own) c.append(btn("addrow", "+ 결제수단 추가", () => openAddPay(own)));
    box.append(c);
  }
}
$("m-pays").onclick = () => { drawPays(); $("dlg-pays").showModal(); };
$("p-close").onclick = () => $("dlg-pays").close();

let apKind = "신용카드", apOwner = "me", apAfter = null, apEdit = null;
function drawAddPay() {
  const k = $("ap-kind"); k.innerHTML = "";
  PAY_KINDS.forEach(x => k.append(btn(x === apKind ? "on" : "", x, () => { apKind = x; drawAddPay(); })));
  setOn($("ap-owner"), "o", apOwner);
  $("ap-bill").hidden = apKind !== "신용카드";
}
function openAddPay(owner, after, edit) {
  apEdit = edit || null;
  apKind = edit ? edit.kind : "신용카드"; apOwner = owner || "me"; apAfter = after || null;
  $("ap-title").textContent = edit ? "결제수단 수정" : "결제수단 추가";
  $("ap-ok").textContent = edit ? "저장" : "추가";
  $("ap-name").value = edit ? edit.name : "";
  $("ap-day").value = edit?.billDay || "";
  $("ap-start").value = edit?.cycleStart || "";
  drawAddPay(); $("dlg-addpay").showModal();
}
$("ap-owner").onclick = e => { const b = e.target.closest("button"); if (b) { apOwner = b.dataset.o; drawAddPay(); } };
$("ap-cancel").onclick = () => $("dlg-addpay").close();
$("form-addpay").onsubmit = ev => {
  ev.preventDefault();
  const name = $("ap-name").value.trim(); if (!name) return;
  const day = Math.min(Math.max(+$("ap-day").value || 0, 0), 31), start = Math.min(Math.max(+$("ap-start").value || 0, 0), 28);
  const fields = { name, kind: apKind, owner: apOwner === "shared" ? "shared" : user.uid,
    billDay: apKind === "신용카드" && day ? day : 0, cycleStart: apKind === "신용카드" && day ? (start || 1) : 0 };
  let p;
  if (apEdit) { p = { ...apEdit, ...fields }; setPays(pays.map(x => x.id === p.id ? p : x)); }
  else { p = { id: uid6(), ...fields }; setPays([...pays, p]); }
  $("dlg-addpay").close();
  if (apAfter) apAfter(p);
};

// ================= 분류 편집 =================
function setCats(next) { const prev = catsDoc; catsDoc = next; refreshOpen(); saveMeta("categories", next, () => catsDoc = prev); }
function drawCats() {
  const box = $("c-list"); box.innerHTML = "";
  const h = hiddenSet(), extra = catsDoc.extra || {};
  const toggle = key => { const s = new Set(h); s.has(key) ? s.delete(key) : s.add(key); setCats({ ...catsDoc, hidden: [...s] }); };
  for (const type of ["out", "in"]) {
    box.append(el("div", "psec", type === "out" ? "지출 분류 · 숨기면 입력 창에서 안 보여요 (지난 내역은 그대로)" : "수입 분류"));
    const c = el("div", "card");
    for (const [big, subs] of tree(type, true)) {
      const bk = `${type}|${big}`, [em, bg] = icon(big);
      const r = el("div", "cbig" + (h.has(bk) ? " hidden-item" : ""));
      const ic = el("span", "ic", em); ic.style.background = bg;
      r.append(ic, el("span", "sp", big));
      if (type === "out") r.append(btn("cbtn", "+ 소분류", () => {
        const name = (prompt(`'${big}'에 추가할 소분류 이름`) || "").trim();
        if (name) setCats({ ...catsDoc, extra: { ...extra, [bk]: [...(extra[bk] || []), name] } });
      }));
      if (big !== "기타") r.append(btn("cbtn", h.has(bk) ? "보이기" : "숨기기", () => toggle(bk)));
      c.append(r);
      for (const s of subs) {
        const sk = `${bk}|${s}`, custom = (extra[bk] || []).includes(s);
        const sr = el("div", "csub" + (h.has(sk) ? " hidden-item" : ""));
        sr.append(el("span", "sp", s + (custom ? " · 추가함" : "")));
        if (custom) {
          sr.append(btn("cbtn", "이름", () => {
            const nn = (prompt("새 이름", s) || "").trim(); if (!nn || nn === s) return;
            setCats({ ...catsDoc, extra: { ...extra, [bk]: extra[bk].map(x => x === s ? nn : x) } });
          }), btn("cbtn", "삭제", () => {
            if (confirm(`'${s}' 소분류를 지울까요? (지난 내역의 이름은 그대로 남아요)`))
              setCats({ ...catsDoc, extra: { ...extra, [bk]: extra[bk].filter(x => x !== s) } });
          }));
        } else sr.append(btn("cbtn", h.has(sk) ? "보이기" : "숨기기", () => toggle(sk)));
        c.append(sr);
      }
    }
    box.append(c);
  }
}
$("m-cats").onclick = () => { drawCats(); $("dlg-cats").showModal(); };
$("c-close").onclick = () => $("dlg-cats").close();

// ================= 즐겨찾기 =================
const myFavs = () => favs.filter(f => f.owner === user.uid);
function setFavs(list, msg) { const prev = favs; favs = list; refreshOpen(); saveMeta("favorites", { list }, () => favs = prev, msg); }
function drawFavs() {
  const box = $("favs-list"); box.innerHTML = "";
  const list = myFavs();
  if (!list.length) return box.append(el("p", "sub", "아직 즐겨찾기가 없어요."));
  const c = el("div", "card");
  for (const f of list) {
    const r = el("div", "pm"), n = el("div", "n");
    n.append(el("b", "", `${f.name} ${won(f.amount)}원`), el("small", "", [f.big + (f.sub ? " › " + f.sub : ""), f.payName].filter(Boolean).join(" · ")));
    r.append(n, btn("x", "✕", () => setFavs(favs.filter(x => x.id !== f.id))));
    c.append(r);
  }
  box.append(c);
}
$("m-favs").onclick = () => { drawFavs(); $("dlg-favs").showModal(); };
$("favs-close").onclick = () => $("dlg-favs").close();

// ================= 엑셀(CSV) 내보내기 =================
function exportCsv(list, name) {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["날짜", "구분", "대분류", "소분류", "금액", "결제수단", "내용", "작성자"].join(",")];
  for (const t of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    const { big, sub: sb } = norm(t);
    lines.push([t.date, t.type === "in" ? "수입" : "지출", big, sb, t.amount, payLabel(t), t.memo, nameOf(t)].map(esc).join(","));
  }
  // 엑셀에서 한글이 안 깨지도록 BOM 추가
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => a.remove(), 1000);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`${list.length}건을 내보냈어요`);
}
$("m-csv-month").onclick = () => exportCsv(curItems(), `budget_${cur.getFullYear()}-${pad(cur.getMonth() + 1)}.csv`);
$("m-csv-all").onclick = () => exportCsv(all, `budget_all_${todayStr()}.csv`);

// ================= 결제 문자 붙여넣기 =================
function parseSms(text) {
  const raw = text.replace(/\[Web발신\]/g, " ").replace(/\r/g, "");
  const r = { cancel: /취소/.test(raw) };
  // 금액: '누적'·'잔액'·'한도' 줄은 제외
  for (const line of raw.split("\n")) {
    if (/누적|잔액|한도|포인트/.test(line)) continue;
    const m = line.match(/([\d,]{1,12})\s*원/);
    if (m) { r.amount = +m[1].replace(/,/g, ""); break; }
  }
  const d = raw.match(/(\d{1,2})[\/.\-월]\s?(\d{1,2})일?\s+(\d{1,2}):(\d{2})/) || raw.match(/(\d{1,2})\/(\d{1,2})/);
  if (d) {
    const now = new Date(); let y = now.getFullYear();
    const mo = +d[1], da = +d[2];
    if (mo - 1 > now.getMonth()) y -= 1;   // 1월에 받은 12월 문자
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) r.date = `${y}-${pad(mo)}-${pad(da)}`;
  }
  const word = CARD_WORDS.find(w => raw.toUpperCase().includes(w.toUpperCase()));
  if (word) r.card = word;
  // 가게 이름: 시간 뒤에 오는 글자, 없으면 의미 있는 마지막 줄
  const after = raw.match(/\d{1,2}:\d{2}\s+([^\n]+)/);
  let shop = after ? after[1] : "";
  if (!shop) {
    const lines = raw.split("\n").map(s => s.trim()).filter(s => s && !/원|승인|카드|\d{1,2}:\d{2}|\*|누적|일시불|할부|잔액/.test(s));
    shop = lines[lines.length - 1] || "";
  }
  r.shop = shop.replace(/(일시불|할부\S*|누적.*|잔액.*|승인|체크|신용)/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
  return r;
}
const shopKey = s => s.replace(/\s+/g, "").toLowerCase();
function guessCat(shop) {
  const m = merchants[shopKey(shop)];
  if (m) return m;
  const g = GUESS.find(([re]) => re.test(shop));
  return g ? { big: g[1], sub: g[2] } : null;
}
function applySms(text) {
  const r = parseSms(text);
  if (!r.amount) return toast("문자에서 금액을 찾지 못했어요");
  amt = String(r.amount);
  if (r.date) fDate = r.date;
  if (r.shop) $("f-memo").value = r.shop;
  fromSms = r.shop || "";
  if (r.cancel) { fType = "in"; fBig = "환불/취소"; fSub = ""; }
  else {
    fType = "out";
    const g = r.shop && guessCat(r.shop);
    if (g) { fBig = g.big; fSub = g.sub; } else { fBig = ""; fSub = ""; }
  }
  if (r.card) {
    const cand = [...myPays(), ...pays.filter(p => p.owner === "shared"), ...pays];
    const p = cand.find(x => x.name.toUpperCase().includes(r.card.toUpperCase()));
    if (p) fPay = p;
  }
  leftBig = "";
  setPanel(!fDate ? "date" : !fBig ? "cat" : !fPay ? "pay" : "amt");
  toast(r.cancel ? "취소 문자예요. 환불로 채웠어요" : "문자에서 채웠어요. 확인하고 저장하세요");
}
$("f-sms").onclick = async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (t && /원/.test(t)) return applySms(t);
  } catch {}
  $("sms-text").value = ""; $("dlg-sms").showModal();
};
$("sms-cancel").onclick = () => $("dlg-sms").close();
$("form-sms").onsubmit = ev => { ev.preventDefault(); $("dlg-sms").close(); applySms($("sms-text").value); };

// ================= 입력/수정 화면 =================
// 칸(날짜·금액·분류·결제수단)을 누르면 아래 창이 그 칸에 맞게 바뀜. 새로 입력할 땐 날짜부터.
let editing = null, fType = "out", fBig = "", fSub = "", fPay = null, amt = "", fDate = "", fromSms = "";
let panel = "date", leftBig = "", leftPay = "me", calM = null, errField = "";

function drawForm() {
  setOn($("f-type"), "t", fType);
  const dv = $("f-date-v");
  dv.textContent = fDate ? dateLabel(fDate) : "날짜 선택";
  dv.classList.toggle("ph", !fDate);
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
  const fs = $("fav-strip"), mine = myFavs();
  fs.hidden = !(panel === "amt" && !editing && mine.length);
  fs.innerHTML = "";
  for (const f of mine) {
    const b = btn("", f.name, () => useFav(f)); b.append(el("b", "", won(f.amount))); fs.append(b);
  }
  if (mine.length) fs.append(btn("more", "편집", () => { drawFavs(); $("dlg-favs").showModal(); }));
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
  if (p === "date") { const d = fDate ? new Date(fDate + "T00:00:00") : new Date(); calM = new Date(d.getFullYear(), d.getMonth(), 1); }
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
    const extra = catsDoc.extra || {}, key = `out|${leftBig}`;
    setCats({ ...catsDoc, extra: { ...extra, [key]: [...(extra[key] || []), name] } });
    chooseCat(leftBig, name);
  }));
  const two = el("div", "two"), L = el("div", "big"), R = el("div", "small");
  const t = tree(fType);
  if (!t.some(x => x[0] === leftBig)) leftBig = t[0][0];
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
  for (const t of all.filter(t => t.uid === user.uid && t.payId)) {
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
    ["me", "내 것", meName().slice(0, 1), "#dbe6ff", "#2c56d8", myPays()],
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
    g.append(btn(cls.filter(Boolean).join(" "), String(d), () => { fDate = date; if (errField === "date") errField = ""; setPanel("amt"); }));
  }
  box.append(g);
}
function useFav(f) {
  fType = f.type; fBig = f.big; fSub = f.sub || ""; amt = String(f.amount);
  fPay = pays.find(p => p.id === f.payId) || (f.payName ? { id: f.payId || "", name: f.payName, legacy: !f.payId } : null);
  $("f-memo").value = f.memo || "";
  drawForm(); toast(`'${f.name}' 채웠어요`);
}
$("f-fav").onclick = () => {
  if (!+amt || !fBig) return toast("금액과 분류를 먼저 넣어 주세요");
  const name = (prompt("즐겨찾기 이름", $("f-memo").value.trim() || fSub || fBig) || "").trim();
  if (!name) return;
  setFavs([...favs, { id: uid6(), owner: user.uid, name, type: fType, amount: +amt, big: fBig, sub: fSub,
    payId: fPay && !fPay.legacy ? fPay.id : "", payName: fPay?.name || "", memo: $("f-memo").value.trim() }], "즐겨찾기에 저장했어요");
};

function openForm(t) {
  editing = t || null;
  fType = t ? t.type : "out";
  const n = t ? norm(t) : { big: "", sub: "" };
  fBig = n.big; fSub = n.sub;
  fPay = t ? (pays.find(p => p.id === t.payId) || (payLabel(t) ? { id: t.payId || "", name: payLabel(t), legacy: !t.payId } : null))
    : (myPays().find(p => p.def) || null);
  amt = t ? String(t.amount) : "";
  const preset = !t && tab === "ledger" && sub === "cal" && selDay;
  fDate = t ? t.date : (preset ? selDay : "");
  fromSms = "";
  $("f-memo").value = t ? (t.memo || "") : "";
  $("dlg-title").textContent = t ? "내역 수정" : "내역 추가";
  $("f-delete").hidden = !t;
  $("f-again").hidden = !!t;
  errField = ""; leftBig = ""; leftPay = "me";
  $("dlg").showModal();
  setPanel(t || preset ? "amt" : "date");   // 새로 입력할 땐 날짜부터
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
  if (!fDate) { errField = "date"; setPanel("date"); return toast("날짜를 골라 주세요"); }
  if (!amount) { setPanel("amt"); return toast("금액을 입력해 주세요"); }
  if (!fBig) { errField = "cat"; setPanel("cat"); return toast("분류를 골라 주세요"); }
  const memo = $("f-memo").value.trim();
  const data = { type: fType, amount, category: fBig, sub: fSub, memo, date: fDate,
    payId: fPay && !fPay.legacy ? fPay.id : "", payName: fPay ? fPay.name : "", pay: "" };
  // 문자에서 가져온 가게는 고른 분류를 기억 → 다음부터 자동
  if (fromSms && fType === "out") {
    const k = shopKey(fromSms), prev = merchants[k];
    if (!prev || prev.big !== fBig || prev.sub !== fSub) {
      const next = { ...merchants, [k]: { big: fBig, sub: fSub } }, old = merchants;
      merchants = next; saveMeta("merchants", { map: next }, () => merchants = old);
    }
  }
  // 오프라인이면 대기했다가 연결되면 자동 전송. 규칙 오류로 거절되면 화면에서도 자동으로 빠지고 알림이 뜸
  const col = collection(db, "households", hid, "transactions");
  (editing ? updateDoc(doc(col, editing.id), data) : addDoc(col, { ...data, uid: user.uid, by: nick, createdAt: Date.now() }))
    .catch(e => alert(errText(e)));
  if (again) { amt = ""; $("f-memo").value = ""; fromSms = ""; setPanel("amt"); toast("저장했어요. 다음 내역을 입력하세요"); }
  else { $("dlg").close(); toast(editing ? "수정했어요" : "저장했어요"); }
}
$("form").onsubmit = ev => { ev.preventDefault(); save(false); };
$("f-again").onclick = () => save(true);
$("f-delete").onclick = () => {
  if (!editing || !confirm("이 내역을 삭제할까요?")) return;
  const id = editing.id; $("dlg").close();
  deleteDoc(doc(db, "households", hid, "transactions", id)).then(() => toast("삭제했어요"), e => alert(errText(e)));
};
