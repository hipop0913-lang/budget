import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc,
  arrayUnion, collection, addDoc, deleteDoc, query, where, orderBy, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const CATS = { out: ["식비","카페/간식","교통","주거/통신","생활용품","의료","문화/여가","경조사","기타"],
               in: ["월급","용돈","부수입","기타"] };
const won = n => n.toLocaleString("ko-KR") + "원";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// 오프라인에서 입력해도 나중에 자동으로 동기화됩니다
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

let user = null, hid = null, unsub = null;
let cur = new Date(); cur.setDate(1);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

function show(v) { for (const x of ["login","household","main"]) $("view-" + x).hidden = x !== v; }
const errText = e => ({
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인을 눌러주세요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 해요.",
  "auth/invalid-email": "이메일 형식이 올바르지 않아요."
}[e.code] || "오류: " + (e.code || e.message));

// ---- 로그인 ----
$("btn-login").onclick = () => auth_(signInWithEmailAndPassword);
$("btn-signup").onclick = () => auth_(createUserWithEmailAndPassword);
async function auth_(fn) {
  $("login-msg").textContent = "";
  try { await fn(auth, $("email").value.trim(), $("password").value); }
  catch (e) { $("login-msg").textContent = errText(e); }
}
const logout = () => signOut(auth);
$("btn-logout-1").onclick = $("btn-logout-2").onclick = logout;

onAuthStateChanged(auth, async u => {
  user = u;
  if (unsub) { unsub(); unsub = null; }
  if (!u) { hid = null; return show("login"); }
  const me = await getDoc(doc(db, "users", u.uid)).catch(() => null);
  hid = me?.exists() ? me.data().householdId : null;
  hid ? startMain() : show("household");
});

// ---- 가구 만들기/참여 ----
function newCode() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
$("btn-create").onclick = async () => {
  try {
    const code = newCode();
    await setDoc(doc(db, "households", code), { members: [user.uid], createdAt: Date.now() });
    await setDoc(doc(db, "users", user.uid), { householdId: code });
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
    await setDoc(doc(db, "users", user.uid), { householdId: code });
    hid = code; startMain();
  } catch (e) { $("hh-msg").textContent = errText(e); }
};

// ---- 메인: 실시간 목록 ----
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const monthRange = () => {
  const e = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  return [ymd(cur), ymd(e)];
};
function startMain() {
  show("main");
  $("code-info").textContent = "초대 코드: " + hid;
  listen();
}
function listen() {
  if (unsub) unsub();
  $("month-label").textContent = `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`;
  const [s, e] = monthRange();
  const q = query(collection(db, "households", hid, "transactions"),
    where("date", ">=", s), where("date", "<", e), orderBy("date", "desc"));
  // 상대방이 입력하면 이 함수가 자동으로 다시 실행됩니다 (실시간 연동)
  unsub = onSnapshot(q, snap => render(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
function render(items) {
  let inn = 0, out = 0;
  const ul = $("list"); ul.innerHTML = "";
  items.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  for (const t of items) {
    t.type === "in" ? inn += t.amount : out += t.amount;
    const li = document.createElement("li");
    const mine = t.uid === user.uid ? "나" : "상대";
    li.innerHTML = `<div class="mid"><div class="cat"></div><div class="meta"></div></div><div class="amt"></div><button class="del">✕</button>`;
    li.querySelector(".cat").textContent = t.category;
    li.querySelector(".meta").textContent = `${t.date.slice(5).replace("-", "/")} · ${mine}${t.memo ? " · " + t.memo : ""}`;
    const a = li.querySelector(".amt");
    a.textContent = (t.type === "in" ? "+" : "-") + won(t.amount);
    a.className = "amt " + (t.type === "in" ? "in" : "out");
    li.querySelector(".del").onclick = () => confirm("삭제할까요?") && deleteDoc(doc(db, "households", hid, "transactions", t.id));
    ul.append(li);
  }
  $("sum-in").textContent = won(inn); $("sum-out").textContent = won(out);
  const tot = inn - out; $("sum-total").textContent = (tot < 0 ? "-" : "") + won(Math.abs(tot));
  $("empty").hidden = items.length > 0;
}
$("prev").onclick = () => { cur.setMonth(cur.getMonth() - 1); listen(); };
$("next").onclick = () => { cur.setMonth(cur.getMonth() + 1); listen(); };

// ---- 입력 창 ----
const type = () => document.querySelector('input[name="type"]:checked').value;
function fillCats() { $("f-cat").innerHTML = CATS[type()].map(c => `<option>${c}</option>`).join(""); }
document.querySelectorAll('input[name="type"]').forEach(r => r.onchange = fillCats);
$("fab").onclick = () => {
  $("form").reset(); fillCats(); $("f-date").value = ymd(new Date()); $("dlg").showModal();
};
$("f-cancel").onclick = () => $("dlg").close();
$("form").onsubmit = async ev => {
  ev.preventDefault();
  const data = { type: type(), amount: Math.round(+$("f-amount").value), category: $("f-cat").value,
    memo: $("f-memo").value.trim(), date: $("f-date").value, uid: user.uid, createdAt: Date.now() };
  $("dlg").close();
  // 오프라인이면 대기했다가 연결되면 자동 전송되므로 await 하지 않음
  addDoc(collection(db, "households", hid, "transactions"), data).catch(e => alert(errText(e)));
};
