/* v2 improvements:
   - Fixed escapeHtml bug (no weird spaces)
   - Stronger username & password checks + blacklist
   - Password strength meter
   - Show/hide password toggles
   - Toast notifications
   - Chat demo with timestamps + persistence (localStorage) for dev
   - Nav/page state saved in location.hash
*/

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

/* ---------- Dev storage (swap with Supabase later) ---------- */
const LS_USERS = "dev_users";          // { username: { password, recover } }
const LS_SESSION = "dev_session";      // username
const LS_CHAT = "dev_chat_general";    // [{user,text,ts}]

const getUsers = () => JSON.parse(localStorage.getItem(LS_USERS) || "{}");
const setUsers = (obj) => localStorage.setItem(LS_USERS, JSON.stringify(obj));
const getSession = () => localStorage.getItem(LS_SESSION);
const setSession = (u) => localStorage.setItem(LS_SESSION, u);
const clearSession = () => localStorage.removeItem(LS_SESSION);
const getChat = () => JSON.parse(localStorage.getItem(LS_CHAT) || "[]");
const setChat = (arr) => localStorage.setItem(LS_CHAT, JSON.stringify(arr));

/* ---------- Validation ---------- */
const BLACKLIST = ["admin","moderator","support","system","root","owner"];
const BADWORDS = ["fuck","shit","bitch","slut","whore","cunt","fag","nigger"]; // expand later
const cleanUsername = u => (u||"").toLowerCase().replace(/\s+/g,"");
const validUsername = u => /^[a-z0-9_]{3,20}$/.test(u) && !BLACKLIST.includes(u) && !BADWORDS.some(w=>u.includes(w));
const passStrength = p => {
  let s = 0;
  if ((p||"").length >= 8) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s; // 0..4
};
const strongEnough = p => passStrength(p) >= 2; // tweakable

/* ---------- DOM refs ---------- */
const views = { auth: $("#auth"), app: $("#app"), page: $("#page") };

const auth = {
  tabLogin: $("#tabLogin"), tabSignup: $("#tabSignup"),
  loginForm: $("#loginForm"), signupForm: $("#signupForm"), recoverForm: $("#recoverForm"),
  linkRecover: $("#linkRecover"), linkBack: $("#linkBackToLogin"),
  loginMsg: $("#loginMsg"), signupMsg: $("#signupMsg"), recoverMsg: $("#recoverMsg"),
  loginUsername: $("#loginUsername"), loginPassword: $("#loginPassword"),
  signupUsername: $("#signupUsername"), signupPassword: $("#signupPassword"), signupConfirm: $("#signupConfirm"),
  recoverUsername: $("#recoverUsername"), recoverCode: $("#recoverCode"), recoverNewPass: $("#recoverNewPass"),
  recoveryBox: $("#recoveryBox"), recoveryCode: $("#recoveryCode"), copyCode: $("#copyCode"),
  downloadCode: $("#downloadCode"), continueToLogin: $("#continueToLogin"),
  signupTogglePass: $("#signupTogglePass"), loginTogglePass: $("#loginTogglePass"),
  strength: $("#strength")
};

const app = {
  nav: $$(".nav-item"), page: $("#page"), btnLogout: $("#btnLogout"), search: $("#globalSearch")
};
const toastBox = $("#toast");

/* ---------- Helpers ---------- */
function showAuth(){
  views.auth.classList.remove("hide");
  views.app.classList.add("hide");
  views.app.setAttribute("aria-hidden","true");
  auth.loginUsername.focus();
}
function showApp(){
  views.auth.classList.add("hide");
  views.app.classList.remove("hide");
  views.app.removeAttribute("aria-hidden");
  const hash = location.hash.replace("#","");
  renderPage(hash || "wiki");
  views.page.focus();
}

function selectTab(which){
  const login = which === "login";
  auth.tabLogin.setAttribute("aria-selected", login);
  auth.tabSignup.setAttribute("aria-selected", !login);
  auth.loginForm.classList.toggle("hide", !login);
  auth.signupForm.classList.toggle("hide", login);
  auth.recoverForm.classList.add("hide");
  auth.recoveryBox.classList.add("hide");
}

function toast(msg, kind="ok"){
  const el = document.createElement("div");
  el.textContent = msg;
  if (kind === "err") el.style.borderColor = "var(--danger)";
  toastBox.appendChild(el);
  setTimeout(()=>{ el.style.opacity=.0; setTimeout(()=>el.remove(), 250)}, 2600);
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function saveFile(name, text){
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Tab switch ---------- */
auth.tabLogin.addEventListener("click", ()=>selectTab("login"));
auth.tabSignup.addEventListener("click", ()=>selectTab("signup"));
auth.linkRecover.addEventListener("click", (e)=>{ e.preventDefault(); auth.loginForm.classList.add("hide"); auth.signupForm.classList.add("hide"); auth.recoverForm.classList.remove("hide"); });
auth.linkBack.addEventListener("click", (e)=>{ e.preventDefault(); selectTab("login"); });

/* ---------- Password toggles ---------- */
function toggleVisibility(input, btn){
  const type = input.type === "password" ? "text" : "password";
  input.type = type;
  btn.textContent = type === "password" ? "👁" : "🙈";
}
auth.signupTogglePass.addEventListener("click", ()=>toggleVisibility(auth.signupPassword, auth.signupTogglePass));
auth.loginTogglePass.addEventListener("click", ()=>toggleVisibility(auth.loginPassword, auth.loginTogglePass));

/* ---------- Strength meter ---------- */
auth.signupPassword.addEventListener("input", ()=>{
  const lvl = passStrength(auth.signupPassword.value);
  auth.strength.className = `strength lv${lvl}`;
});

/* ---------- Sign up ---------- */
auth.signupForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  auth.signupMsg.textContent = "";
  let u = cleanUsername(auth.signupUsername.value);
  let p = auth.signupPassword.value;
  let c = auth.signupConfirm.value;

  if (!validUsername(u)) return auth.signupMsg.innerHTML = '<span class="err">Invalid username (3–20, a–z, 0–9, _; no reserved/bad words).</span>';
  if (!strongEnough(p)) return auth.signupMsg.innerHTML = '<span class="err">Password too weak. Use 8+ chars with numbers/symbols.</span>';
  if (p !== c) return auth.signupMsg.innerHTML = '<span class="err">Passwords do not match.</span>';

  const users = getUsers();
  if (users[u]) return auth.signupMsg.innerHTML = '<span class="err">That username is taken.</span>';

  const code = genRecovery();
  users[u] = { password: p, recover: code };
  setUsers(users);

  auth.recoveryCode.textContent = code;
  auth.signupForm.classList.add("hide");
  auth.recoveryBox.classList.remove("hide");
  toast("Account created");
});

function genRecovery(){
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/I/1
  let out = "";
  for (let i=0;i<24;i++) out += alphabet[Math.floor(Math.random()*alphabet.length)];
  return out.match(/.{1,4}/g).join("-");
}

auth.copyCode.addEventListener("click", async ()=>{
  await navigator.clipboard.writeText(auth.recoveryCode.textContent.trim());
  toast("Copied");
});
auth.downloadCode.addEventListener("click", ()=>{
  saveFile("recovery-code.txt", `Your recovery code:\n${auth.recoveryCode.textContent}\n`);
});
auth.continueToLogin.addEventListener("click", ()=>{ selectTab("login"); auth.signupUsername.value=""; auth.signupPassword.value=""; auth.signupConfirm.value=""; });

/* ---------- Login ---------- */
auth.loginForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  auth.loginMsg.textContent = "";
  const u = cleanUsername(auth.loginUsername.value);
  const p = auth.loginPassword.value;
  const users = getUsers();
  if (!users[u] || users[u].password !== p){
    auth.loginMsg.innerHTML = '<span class="err">Invalid username or password.</span>';
    return;
  }
  setSession(u);
  toast(`Welcome @${u}`);
  showApp();
});

/* ---------- Recovery ---------- */
auth.recoverForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  auth.recoverMsg.textContent = "";
  const u = cleanUsername(auth.recoverUsername.value);
  const code = auth.recoverCode.value.trim();
  const np = auth.recoverNewPass.value;
  const users = getUsers();
  if (!users[u]) return auth.recoverMsg.innerHTML = '<span class="err">User not found.</span>';
  if (users[u].recover !== code) return auth.recoverMsg.innerHTML = '<span class="err">Wrong recovery code.</span>';
  if (!strongEnough(np)) return auth.recoverMsg.innerHTML = '<span class="err">Password too weak.</span>';
  users[u].password = np; setUsers(users);
  auth.recoverMsg.innerHTML = '<span class="ok">Password reset. You can log in now.</span>';
  toast("Password updated");
});

/* ---------- App shell ---------- */
app.nav.forEach(el=> el.addEventListener("click", ()=>{
  const page = el.dataset.page;
  location.hash = page; // persist in URL
}));

window.addEventListener("hashchange", ()=> renderPage(location.hash.replace("#","")));

app.btnLogout.addEventListener("click", ()=>{
  clearSession();
  toast("Logged out");
  showAuth();
});

function setActiveNav(page){
  app.nav.forEach(el=> el.classList.toggle("active", el.dataset.page === page));
}

function renderPage(page){
  if (!getSession()) return showAuth();
  setActiveNav(page);
  if (page === "wiki") return renderWiki();
  if (page === "chat") return renderChat();
  if (page === "profile") return renderProfile();
  if (page === "settings") return renderSettings();
  // default
  return renderWiki();
}

/* ---------- Pages ---------- */
function renderWiki(){
  app.page.innerHTML = `
    <div class="wiki">
      <h2>Wiki</h2>
      <p class="muted">Private area. Next: connect real pages & search.</p>
      <ul>
        <li><a href="#" onclick="return false">Getting Started</a></li>
        <li><a href="#" onclick="return false">Items & Drops</a></li>
        <li><a href="#" onclick="return false">Boss Strategies</a></li>
      </ul>
    </div>`;
}

function renderChat(){
  app.page.innerHTML = `
    <div class="chat">
      <div class="chat-header"><h2>General Chat</h2><span class="muted">(local demo)</span></div>
      <div id="feed" class="chat-feed" aria-live="polite"></div>
      <div class="chat-input">
        <input id="msgInput" placeholder="Type a message…" aria-label="Message" />
        <button id="sendBtn" class="btn primary">Send</button>
      </div>
    </div>`;

  const feed = $("#feed"), input = $("#msgInput"), send = $("#sendBtn");
  const me = getSession();
  let msgs = getChat();

  const paint = () => {
    feed.innerHTML = msgs.map(m => `
      <div class="msg-bubble ${m.user===me?'msg-me':'msg-them'}">
        <div>${escapeHtml(m.text)}</div>
        <div class="msg-meta">@${m.user} • ${new Date(m.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
      </div>`).join("");
    feed.scrollTop = feed.scrollHeight;
  };

  const sendMsg = () => {
    const t = input.value.trim();
    if(!t) return;
    msgs.push({ user: me, text: t, ts: Date.now() });
    setChat(msgs);
    input.value = ""; paint();
  };

  send.addEventListener("click", sendMsg);
  input.addEventListener("keydown", e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMsg(); }});
  paint();
}

function renderProfile(){
  const u = getSession();
  app.page.innerHTML = `
    <h2>Profile</h2>
    <p class="muted">Signed in as <strong>@${u}</strong></p>
    <p>Avatar, bio, and display name settings go here.</p>`;
}

function renderSettings(){
  app.page.innerHTML = `
    <h2>Settings</h2>
    <ul>
      <li>Theme: dark (default)</li>
      <li>Security: recovery code on signup</li>
      <li>Navigation persists in URL hash</li>
    </ul>`;
}

/* ---------- Boot ---------- */
(function init(){
  const session = getSession();
  if (session) showApp(); else showAuth();
  // enter key on auth forms focuses next field
  ["loginForm","signupForm","recoverForm"].forEach(id=>{
    const form = document.getElementById(id);
    form?.addEventListener("keydown", e=>{
      if (e.key==="Enter" && e.target.tagName==="INPUT"){
        const inputs = Array.from(form.querySelectorAll("input"));
        const i = inputs.indexOf(e.target);
        if (i > -1 && i < inputs.length-1) { e.preventDefault(); inputs[i+1].focus(); }
      }
    });
  });
})();
