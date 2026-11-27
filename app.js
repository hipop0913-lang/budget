import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc,
  arrayUnion, collection, addDoc, deleteDoc, query, where, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const won = n => n.toLocaleString("ko-KR") + "원";

// 카테고리: [이름, 이모지, 아이콘 배경색]
const CATS = {
  out: [["식비","🍚","#ffe9d6"],["카페/간식","☕","#f3e6da"],["장보기","🛒","#e3f4dd"],["교통","🚌","#dbeafe"],["주거/통신","🏠","#e6e3fb"],
        ["생활용품","🧺","#e0f2f1"],["의료","💊","#fde2e4"],["문화/여가","🎬","#fff3c4"],["육아/교육","🍼","#ffe0ef"],["경조사","🎁","#fde7f3"],
        ["쇼핑","🛍️","#e9e3ff"],["여행","✈️","#d9f1ff"],["보험/금융","🏦","#e8eaf0"],["반려동물","🐶","#fbe9d0"],["기타","📦","#ececec"]],
  in:  [["월급","💰","#dcf5e6"],["용돈","🧧","#ffe9e0"],["부수입","💵","#e4f5d6"],["이자/투자","📈","#dbeafe"],["기타","📦","#ececec"]]
};
const PAYS = ["신용카드","체크카드","현금","계좌이체","기타"];
const catInfo = (type, name) => CATS[type].find(c => c[0] === name) || ["기타","📦","#ececec"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

let user = null, hid = null, nick = "", unsub = null;
let cur = new Date(); cur.setDate(1);
let items = [];
let personF = "all", payF = "all";
let editing = null;          // 수정 중인 내역 (없으면 새 입력)
let selCat = "", selPay = "";

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

function show(v) { for (const x of ["login","household","main"]) $("view-" + x).hidden = x !== v; }
const errText = e => ({
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인을 눌러주세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 해요.",
  "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
  "permission-denied": "권한이 없어요. (Firestore 규칙을 확인해 주세요)"
}[e.code] || "오류: " + (e.code || e.message));

// ---------- 로그인 ----------
$("btn-login").onclick = () => auth_(signInWithEmailAndPassword);
$("btn-signup").onclick = () => auth_(createUserWithEmailAndPassword);
async function auth_(fn) {
  $("login-msg").textContent = "";
  try { await fn(auth, $("email").value.trim(), $("password").value); }
  catch (e) { $("login-msg").textContent = errText(e); }
}
$("btn-logout-1").onclick = $("btn-logout-2").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  user = u;
  if (unsub) { unsub(); unsub = null; }
  if (!u) { hid = null; return show("login"); }
  const me = await getDoc(doc(db, "users", u.uid)).catch(() => null);
  hid = me?.exists() ? me.data().householdId : null;
  nick = me?.exists() ? (me.data().nickname || "") : "";
  hid ? startMain() : show("household");
});

// ---------- 가구 만들기/참여 ----------
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
    hid = code; startMain();
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
    hid = code; startMain();
  } catch (e) { $("hh-msg").textContent = errText(e); }
};

// ---------- 별명 ----------
function askNick() { $("nick-input").value = nick; $("dlg-nick").showModal(); }
$("btn-nick").onclick = askNick;
$("form-nick").onsubmit = async ev => {
  ev.preventDefault();
  nick = $("nick-input").value.trim();
  $("dlg-nick").close();
  await setDoc(doc(db, "users", user.uid), { nickname: nick }, { merge: true }).catch(e => alert(errText(e)));
  render();
};

// ---------- 메인 ----------
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOW = ["일","월","화","수","목","금","토"];

function startMain() {
  show("main");
  $("code-info").textContent = "초대 코드 " + hid;
  const sel = $("pay-filter");
  sel.innerHTML = `<option value="all">결제수단 전체</option>` + PAYS.map(p => `<option>${p}</option>`).join("");
  sel.value = payF;
  listen();
  if (!nick) askNick();
}
function listen() {
  if (unsub) unsub();
  $("month-label").textContent = `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`;
  const s = ymd(cur), e = ymd(new Date(cur.getFullYear(), cur.getMonth() + 1, 1));
  const q = query(collection(db, "households", hid, "transactions"),
    where("date", ">=", s), where("date", "<", e), orderBy("date", "desc"));
  // 상대방이 입력/수정/삭제하면 이 함수가 자동으로 다시 실행됩니다 (실시간 연동)
  unsub = onSnapshot(q, snap => { items = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); });
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function render() {
  if (!user || !hid) return;
  const list = items.filter(t =>
    (personF === "all" || (personF === "me") === (t.uid === user.uid)) &&
    (payF === "all" || t.pay === payF));
  let inn = 0, out = 0;
  for (const t of list) t.type === "in" ? inn += t.amount : out += t.amount;

  const who = personF === "all" ? "이번 달" : personF === "me" ? "내가 쓴" : "상대가 쓴";
  $("hero-label").textContent = `${who} 지출`;
  $("sum-out").textContent = won(out);
  $("sum-in").textContent = won(inn);
  const bal = inn - out;
  $("sum-total").textContent = (bal < 0 ? "-" : "") + won(Math.abs(bal));

  list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const box = $("list"); box.innerHTML = "";
  const groups = new Map();
  for (const t of list) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }

  for (const [date, arr] of groups) {
    const d = new Date(date + "T00:00:00");
    const sum = arr.reduce((s, t) => s + (t.type === "in" ? t.amount : -t.amount), 0);
    const day = el("div", "day");
    const head = el("div", "day-head");
    head.append(el("span", "", `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`),
                el("span", "", (sum < 0 ? "-" : sum > 0 ? "+" : "") + won(Math.abs(sum))));
    const card = el("div", "card");
    for (const t of arr) card.append(row(t));
    day.append(head, card); box.append(day);
  }
  $("empty").hidden = list.length > 0;
}
function row(t) {
  const [, emoji, bg] = catInfo(t.type, t.category);
  const mine = t.uid === user.uid;
  const name = t.by || (mine ? "나" : "상대");
  const r = el("div", "item");
  const ico = el("div", "ico", emoji); ico.style.background = bg;
  const mid = el("div", "mid");
  mid.append(el("div", "t1", t.memo || t.category));
  const t2 = el("div", "t2");
  const w = el("span", "who", name.slice(0, 1)); w.style.background = mine ? "var(--me)" : "var(--other)";
  t2.append(w, el("span", "", [name, t.memo ? t.category : "", t.pay || ""].filter(Boolean).join(" · ")));
  mid.append(t2);
  const amt = el("div", "amt " + (t.type === "in" ? "in" : "out"), (t.type === "in" ? "+" : "-") + won(t.amount));
  r.append(ico, mid, amt);
  r.onclick = () => openForm(t);
  return r;
}

$("prev").onclick = () => { cur.setMonth(cur.getMonth() - 1); listen(); };
$("next").onclick = () => { cur.setMonth(cur.getMonth() + 1); listen(); };
$("person-chips").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  personF = b.dataset.p;
  document.querySelectorAll("#person-chips button").forEach(x => x.classList.toggle("on", x === b));
  render();
};
$("pay-filter").onchange = e => { payF = e.target.value; render(); };

// ---------- 입력/수정 창 ----------
const typeNow = () => document.querySelector('input[name="type"]:checked').value;
function drawCats() {
  const g = $("cat-grid"); g.innerHTML = "";
  if (!CATS[typeNow()].some(c => c[0] === selCat)) selCat = CATS[typeNow()][0][0];
  for (const [name, emoji] of CATS[typeNow()]) {
    const b = el("button", name === selCat ? "on" : ""); b.type = "button";
    b.append(el("span", "", emoji), document.createTextNode(name));
    b.onclick = () => { selCat = name; drawCats(); };
    g.append(b);
  }
}
function drawPays() {
  const g = $("pay-chips"); g.innerHTML = "";
  for (const p of PAYS) {
    const b = el("button", p === selPay ? "on" : "", p); b.type = "button";
    b.onclick = () => { selPay = selPay === p ? "" : p; drawPays(); };   // 다시 누르면 선택 해제
    g.append(b);
  }
}
document.querySelectorAll('input[name="type"]').forEach(r => r.onchange = drawCats);
$("f-amount").oninput = e => {
  const n = e.target.value.replace(/\D/g, "");
  e.target.value = n ? (+n).toLocaleString("ko-KR") : "";
};
function openForm(t) {
  editing = t || null;
  $("form").reset();
  $("dlg-title").textContent = t ? "내역 수정" : "내역 추가";
  document.querySelector(`input[name="type"][value="${t ? t.type : "out"}"]`).checked = true;
  selCat = t ? t.category : "";
  selPay = t ? (t.pay || "") : (localStorage.getItem("lastPay") || "");
  $("f-amount").value = t ? t.amount.toLocaleString("ko-KR") : "";
  $("f-date").value = t ? t.date : ymd(new Date());
  $("f-memo").value = t ? (t.memo || "") : "";
  $("f-delete").hidden = !t;
  drawCats(); drawPays();
  $("dlg").showModal();
  if (!t) $("f-amount").focus();
}
$("fab").onclick = () => openForm(null);
$("f-cancel").onclick = () => $("dlg").close();
$("f-delete").onclick = () => {
  if (!editing || !confirm("이 내역을 삭제할까요?")) return;
  const id = editing.id; $("dlg").close();
  deleteDoc(doc(db, "households", hid, "transactions", id)).catch(e => alert(errText(e)));
};
$("form").onsubmit = ev => {
  ev.preventDefault();
  const amount = +$("f-amount").value.replace(/\D/g, "");
  if (!amount) return alert("금액을 입력해 주세요.");
  const data = { type: typeNow(), amount, category: selCat, pay: selPay,
    memo: $("f-memo").value.trim(), date: $("f-date").value };
  $("dlg").close();
  try { localStorage.setItem("lastPay", selPay); } catch {}
  // 오프라인이면 대기했다가 연결되면 자동 전송되므로 await 하지 않음
  const col = collection(db, "households", hid, "transactions");
  const p = editing
    ? updateDoc(doc(col, editing.id), data)
    : addDoc(col, { ...data, uid: user.uid, by: nick, createdAt: Date.now() });
  p.catch(e => alert(errText(e)));
};
