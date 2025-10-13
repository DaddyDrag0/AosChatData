const auth = {
if(page === "settings") return renderSettings();
}


app.nav.forEach(el=> el.addEventListener("click", ()=> renderPage(el.dataset.page)));


app.btnLogout.addEventListener("click", ()=>{
clearSession(); showAuth();
});


function renderWiki(){
app.page.innerHTML = `
<div class="wiki">
<h2>Wiki (locked area)</h2>
<p class="muted">Placeholder content. We’ll wire real pages & search next.</p>
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
const msgs = [];
const paint = () => {
feed.innerHTML = msgs.map(m => `
<div class="msg-bubble ${m.user===me?'msg-me':'msg-them'}">
<div class="small" style="opacity:.9">@${m.user}</div>
<div>${escapeHtml(m.text)}</div>
</div>`).join("");
feed.scrollTop = feed.scrollHeight;
};
const sendMsg = () => {
const t = input.value.trim();
if(!t) return; msgs.push({ user: me, text: t, ts: Date.now() });
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
<p>Avatar, bio, and display name settings go here.</p>
`;
}


function renderSettings(){
app.page.innerHTML = `
<h2>Settings</h2>
<ul>
<li>Theme: dark (default)</li>
<li>Security: recovery code available on signup</li>
<li>Log out clears the local session</li>
</ul>
`;
}


// ---------- Helpers ----------
function escapeHtml(s){
return s.replace(/[&<>\"] /g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',' ':"&nbsp;"}[c]));
}


// ---------- Boot ----------
(function init(){
const session = getSession();
if(session){ showApp(); }
else { showAuth(); }
})();


/*
NEXT (when you’re ready to wire Supabase):
- Replace dev auth with Supabase Auth using username→synthetic email mapping.
- Replace local chat with Supabase Realtime (messages table + subscription).
- Add RLS so only authenticated users can read/write.
*/
