// Supabase project config (embedded)
const SUPABASE_URL = "https://lzrxjzrrkgxaaibwrgyj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6cnhqenJya2d4YWFpYndyZ3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyMTUxNjgsImV4cCI6MjA3NTc5MTE2OH0.fsbv3MHQ2K3wWIimCmnnIhL7cWjsYW1trFPT1Lhljv8";

// Initialize Supabase (safe)
let supabase;
try {
  const url = SUPABASE_URL || window.SUPABASE_URL;
  const key = SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
  if (window.supabase && url && key) {
    supabase = window.supabase.createClient(url, key);
    console.info("[App] Supabase client initialized");
  } else {
    console.error("[App] Supabase not ready - missing UMD library");
    // Defer showing an error until DOM elements exist (below)
  }
} catch (e) {
  console.error("[App] Supabase init failed", e);
}

// Late bootstrap helper (runs when UMD and config appear)
function bootstrapSupabase() {
  if (!supabase && window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    try {
      const url = SUPABASE_URL || window.SUPABASE_URL;
      const key = SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
      if (!(url && key)) return false;
      supabase = window.supabase.createClient(url, key);
      console.info("[App] Supabase client initialized (late)");
      const el = document.getElementById("authError");
      if (el && !el.hidden && /App not ready/i.test(el.textContent || "")) {
        el.hidden = true;
      }
      // Attempt session restore once ready
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) initWiki(); else setTab("login");
      });
      return true;
    } catch (e) {
      console.error("[App] Late Supabase init failed", e);
    }
  }
  return false;
}

// If UMD is missing, try loading from an alternate CDN automatically
if (!window.supabase) {
  const alt = document.createElement("script");
  alt.src = "https://unpkg.com/@supabase/supabase-js@2.45.3/dist/umd/supabase.min.js";
  alt.async = true;
  alt.onload = () => { bootstrapSupabase(); };
  alt.onerror = () => { console.error("[App] Failed to load Supabase from alternate CDN"); };
  document.head.appendChild(alt);
}

// Retry bootstrap a few times in case scripts/config arrive late
if (!supabase) {
  let tries = 0;
  const maxTries = 12; // ~6s total
  const timer = setInterval(() => {
    tries += 1;
    if (bootstrapSupabase() || tries >= maxTries) clearInterval(timer);
  }, 500);
}

const RESERVED_NAMES = new Set(["admin","root","support","system","null","undefined","me","you","owner","moderator","mod","help","test","operator"]);
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

// DOM shortcuts
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Auth state
let currentUser = null;

// Auth UI (tabbed)
const authOverlay = $("#authOverlay");
const wikiLayout = $("#wikiLayout");
const authError = $("#authError");
const logoutBtn = $("#logoutBtn");
const currentUserEl = $("#currentUser");

// Tabs
const tabLogin = $("#tabLogin");
const tabSignup = $("#tabSignup");
const loginPanel = $("#loginPanel");
const signupPanel = $("#signupPanel");

// Login inputs
const loginUsername = $("#loginUsername");
const loginPassword = $("#loginPassword");
const rememberMe = $("#rememberMe");
const loginSubmit = $("#loginSubmit");

// Signup inputs
const signupUsername = $("#signupUsername");
const signupPassword = $("#signupPassword");
const signupConfirm = $("#signupConfirm");
const signupSubmit = $("#signupSubmit");

// Demo database
const DB = {
  items: [
    {name:"Bronze Sword",rarity:"common",icon:"",source:"Starter (F1)",dps:6,levelReq:1,droppedBy:["Kobold"],floor:"F1",summary:"Basic weapon for new adventurers."},
    {name:"Shard of Resentment",rarity:"epic",icon:"",source:"Kobold (F1)",dps:12,levelReq:5,droppedBy:["Kobold"],floor:"F1",summary:"A dark shard rumored to empower blades."},
    {name:"Healing Potion",rarity:"common",icon:"",source:"Vendor (F1)",dps:0,levelReq:1,droppedBy:[],floor:"F1",summary:"Restores health; handy in early fights."}
  ],
  armor: [
    {name:"Novice Tunic",rarity:"common",slot:"Chest",icon:"",source:"Vendor (F1)",hp:10,defense:5,levelReq:1,droppedBy:[],floor:"F1",summary:"Light protection for beginners."},
    {name:"Novice Helm",rarity:"common",slot:"Helmet",icon:"",source:"Vendor (F1)",hp:5,defense:3,levelReq:1,droppedBy:[],floor:"F1",summary:"Simple headgear for Floor 1."},
    {name:"Explorer Armor",rarity:"rare",slot:"Chest",icon:"",source:"Chest (F1)",hp:20,defense:12,levelReq:4,droppedBy:["Frenzy Boar"],floor:"F1",summary:"Sturdy chestplate found on Floor 1."}
  ],
  enemies: [
    {name:"Frenzy Boar",type:"mob",floor:"F1",icon:"",hp:120,defense:"None",entity:"Mob",loot:["Novice Blade","Novice Tunic"],materials:["Leather"],exp:24,money:30,summary:"An aggressive boar roaming Floor 1 fields."},
    {name:"Kobold",type:"mob",floor:"F1",icon:"",hp:80,defense:"Low",entity:"Mob",loot:["Bronze Sword","Shard of Resentment"],materials:["Leather"],exp:16,money:20,summary:"Sneaky cave-dweller; travels in packs."},
    {name:"Slime",type:"mob",floor:"F1",icon:"",hp:50,defense:"Gelatinous",entity:"Mob",loot:["Healing Potion"],materials:["Slime Jelly"],exp:10,money:12,summary:"Bouncy creature; weak but numerous."}
  ]
};

// Error helper
function showAuthError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
  setTimeout(() => (authError.hidden = true), 5000);
}

// If Supabase failed to init, surface a visible message so clicks aren't "no-ops"
if (!supabase) {
  const el = document.getElementById("authError");
  if (el) {
    el.hidden = false;
    el.textContent = "App not ready: Supabase library not loaded yet. Check your internet.";
  }
}

// Tabs
function setTab(which) {
  if (which === "login") {
    tabLogin?.classList.add("active");
    tabSignup?.classList.remove("active");
    loginPanel?.classList.add("active");
    signupPanel?.classList.remove("active");
    loginUsername?.focus();
  } else {
    tabSignup?.classList.add("active");
    tabLogin?.classList.remove("active");
    signupPanel?.classList.add("active");
    loginPanel?.classList.remove("active");
    signupUsername?.focus();
  }
}
tabLogin?.addEventListener("click", () => setTab("login"));
tabSignup?.addEventListener("click", () => setTab("signup"));

// Login
loginSubmit?.addEventListener("click", async () => {
  if (!supabase) {
    return showAuthError("App is still loading Supabase. Try a hard refresh (Ctrl+F5).");
  }
  const username = (loginUsername?.value || "").trim().toLowerCase();
  const password = loginPassword?.value || "";
  if (!username || !password) return showAuthError("Please enter username and password");
  if (!USERNAME_REGEX.test(username)) return showAuthError("Username must be 3-20 characters (lowercase letters, numbers, underscores only)");
  if (RESERVED_NAMES.has(username)) return showAuthError("This username is reserved");
  const email = `${username}@app.local`;
  console.debug("Auth: signInWithPassword", { email });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn("Auth: sign-in error", error);
    return showAuthError(error.message);
  }
  // Use returned session immediately if present
  if (data?.session?.user) {
    currentUser = data.session.user.user_metadata.username || data.session.user.email.split("@")[0];
    currentUserEl.textContent = currentUser;
    authOverlay.hidden = true;
    wikiLayout.hidden = false;
    // Jump to Overview
    const overviewLink = document.querySelector('a[data-page="overview"]');
    if (overviewLink) {
      $$("#nav a").forEach((x) => x.classList.remove("active"));
      overviewLink.classList.add("active");
      $$("#page > div").forEach((div) => (div.hidden = div.id !== "overview"));
      history.replaceState(null, "", "#overview");
    }
    render();
  } else {
    // Fallback to session check
    await initWiki();
  }
});

// Signup
signupSubmit?.addEventListener("click", async () => {
  if (!supabase) {
    return showAuthError("App is still loading Supabase. Try a hard refresh (Ctrl+F5).");
  }
  const username = (signupUsername?.value || "").trim().toLowerCase();
  const password = signupPassword?.value || "";
  const confirm = signupConfirm?.value || "";
  if (!username || !password) return showAuthError("Please enter username and password");
  if (!USERNAME_REGEX.test(username)) return showAuthError("Username must be 3-20 characters (lowercase letters, numbers, underscores only)");
  if (RESERVED_NAMES.has(username)) return showAuthError("This username is reserved");
  if (password.length < 6) return showAuthError("Password must be at least 6 characters");
  if (password !== confirm) return showAuthError("Passwords do not match");

  const email = `${username}@app.local`;
  console.debug("Auth: signUp", { email });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) {
    console.warn("Auth: sign-up error", error);
    return showAuthError(error.message);
  }

  // If session exists right away (email confirmation disabled), proceed to app and create profile
  const user = data?.user || data?.session?.user;
  if (user) {
    // Try to upsert profile with the authenticated user's id
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, username, display_name: username }, { onConflict: "id" });
      if (profileError) {
        console.warn("Profile upsert warning:", profileError);
        // Don't block the flow; allow entering the app
        showAuthError("Profile not saved yet. You can update it later in Profile.");
      }
    } catch (e) {
      console.warn("Profile upsert exception:", e);
    }

    currentUser = user.user_metadata?.username || (user.email ? user.email.split("@")[0] : username);
    currentUserEl.textContent = currentUser;
    authOverlay.hidden = true;
    wikiLayout.hidden = false;

    // Navigate to Profile so the transition is obvious
    const profileLink = document.querySelector('a[data-page="profile"]');
    if (profileLink) {
      $$("#nav a").forEach((x) => x.classList.remove("active"));
      profileLink.classList.add("active");
      $$("#page > div").forEach((div) => (div.hidden = div.id !== "profile"));
      history.replaceState(null, "", "#profile");
    }
    render();
  } else {
    // No session returned (likely email confirmations enabled). Ask user to log in.
    showAuthError("Account created. Now log in with your password.");
    setTab("login");
    if (loginUsername) loginUsername.value = username;
  }
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  authOverlay.hidden = false;
  wikiLayout.hidden = true;
  if (loginUsername) loginUsername.value = "";
  if (loginPassword) loginPassword.value = "";
  currentUser = null;
  setTab("login");
});

// Session init
async function initWiki() {
  if (!supabase) return; // can't init without client
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  currentUser = session.user.user_metadata.username || session.user.email.split("@")[0];
  currentUserEl.textContent = currentUser;
  authOverlay.hidden = true;
  wikiLayout.hidden = false;
  // Ensure Overview is visible by default
  const overviewLink = document.querySelector('a[data-page="overview"]');
  if (overviewLink) {
    $$("#nav a").forEach((x) => x.classList.remove("active"));
    overviewLink.classList.add("active");
    $$("#page > div").forEach((div) => (div.hidden = div.id !== "overview"));
    history.replaceState(null, "", "#overview");
  }
  render();
}

// Check session on load (guarded)
if (supabase) {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) initWiki();
    else setTab("login");
  });
} else {
  setTab("login");
}

// Auth state changes (guarded)
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) initWiki();
    else if (event === "SIGNED_OUT") {
      authOverlay.hidden = false;
      wikiLayout.hidden = true;
      currentUser = null;
      setTab("login");
    }
  });
}

// ===== WIKI FEATURES =====

// Favorites
const favKey = (o, t) => `${t}:${o.name}`;
let favorites = [];

async function loadFavorites() {
  if (!currentUser) return;
  // TODO: Load from Supabase (for now use memory)
  return favorites;
}

function isFav(o, t) {
  return favorites.some((x) => x.key === favKey(o, t));
}

function toggleFav(o, t, btn) {
  const key = favKey(o, t);
  if (isFav(o, t)) {
    favorites = favorites.filter((x) => x.key !== key);
    btn?.classList.remove("fav");
  } else {
    favorites.unshift({ key, type: t, data: o });
    btn?.classList.add("fav");
  }
  // TODO: Save to Supabase
  if (!$("#favorites").hidden) renderFavorites();
}

// Card rendering
const rarityClass = (r) => `rarity-${(r || "common").toLowerCase()}`;

function createCard(obj, type) {
  const d = document.createElement("div");
  d.className = `card icon ${rarityClass(obj.rarity)}`;
  d.tabIndex = 0;
  const hasIcon = !!(obj.icon && obj.icon.trim());
  d.innerHTML = `
    <div class="thumb ${hasIcon ? "" : "placeholder"}">${hasIcon ? `<img loading="lazy" alt="${obj.name}" src="${obj.icon}">` : ""}</div>
    <div>
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <strong>${obj.name}</strong>
        <div class="badges">
          <span class="badge">${obj.rarity || "common"}</span>
          <span class="badge">${type}</span>
        </div>
      </div>
      <div class="small">${obj.source ? `Source: ${obj.source}` : obj.floor ? `Floor: ${obj.floor}` : ""}</div>
      <div class="quick-actions"><button class="action-btn ${isFav(obj, type) ? "fav" : ""}" title="Favorite" data-act="fav">⭐</button></div>
    </div>`;
  d.addEventListener("click", (e) => {
    if (e.target.closest(".action-btn")) return;
    openSheet(obj, type);
  });
  d.querySelector('[data-act="fav"]').addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFav(obj, type, e.currentTarget);
  });
  return d;
}

// Filters
const floorMatches = (o, w) => (w === "all" ? true : (o.floor || "") === w || (o.source || "").toUpperCase().includes(`(${w})`));
const slotMatches = (o, s) => (s === "all" ? true : (o.slot || "") === s);
const rarityMatches = (o, r) => (r === "all" ? true : (o.rarity || "").toLowerCase() === r.toLowerCase());

// Render
function render() {
  const q = ($("#q")?.value || "").toLowerCase().trim();

  // ALL
  const fAll = $(".floor[data-for=\"all\"]")?.value || "all";
  const tAll = $(".all-type[data-for=\"all\"]")?.value || "all";
  const rAll = $(".rarity[data-for=\"all\"]")?.value || "all";
  const sAll = $(".slot[data-for=\"all\"]")?.value || "all";
  let all = [
    ...DB.items.map((x) => ({ ...x, __type: "item" })),
    ...DB.armor.map((x) => ({ ...x, __type: "armor" })),
  ];
  all = all.filter((x) => {
    const hay = [x.name, x.source, x.slot, x.rarity, x.summary, (x.droppedBy || []).join(",")].join(" ").toLowerCase();
    const typeOk = tAll === "all" || x.__type === tAll;
    const slotOk = x.__type === "armor" ? slotMatches(x, sAll) : sAll === "all";
    return (!q || hay.includes(q)) && floorMatches(x, fAll) && rarityMatches(x, rAll) && typeOk && slotOk;
  });
  const allG = $("#allGrid"), allEmpty = $("#allEmpty"), allCount = $("#allCount");
  if (allG) {
    allG.innerHTML = "";
    all.forEach((o) => allG.append(createCard(o, o.__type)));
    allEmpty.hidden = all.length > 0;
  }
  if (allCount) allCount.textContent = `${all.length} found`;

  // ITEMS
  const fItems = $(".floor[data-for=\"items\"]")?.value || "all";
  const rItems = $(".rarity[data-for=\"items\"]")?.value || "all";
  const items = DB.items.filter((x) => {
    const hay = [x.name, x.source, x.rarity, x.summary, (x.droppedBy || []).join(",")].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && floorMatches(x, fItems) && rarityMatches(x, rItems);
  });
  const ig = $("#itemsGrid");
  const iEmpty = $("#itemsEmpty");
  if (ig) {
    ig.innerHTML = "";
    items.forEach((o) => ig.append(createCard(o, "item")));
    iEmpty.hidden = items.length > 0;
  }

  // ARMOR
  const fArmor = $(".floor[data-for=\"armor\"]")?.value || "all";
  const sArmor = $(".slot[data-for=\"armor\"]")?.value || "all";
  const rArmor = $(".rarity[data-for=\"armor\"]")?.value || "all";
  const armor = DB.armor.filter((x) => {
    const hay = [x.name, x.source, x.slot, x.rarity, x.summary, (x.droppedBy || []).join(",")].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && floorMatches(x, fArmor) && slotMatches(x, sArmor) && rarityMatches(x, rArmor);
  });
  const ag = $("#armorGrid");
  const aEmpty = $("#armorEmpty");
  if (ag) {
    ag.innerHTML = "";
    armor.forEach((o) => ag.append(createCard(o, "armor")));
    aEmpty.hidden = armor.length > 0;
  }

  // ENEMIES
  const tEnemies = $(".type[data-for=\"enemies\"]")?.value || "all";
  const enemies = DB.enemies.filter((x) => {
    const hay = [x.name, (x.loot || []).join(","), x.floor, x.type, x.summary, (x.materials || []).join(",")].join(" ").toLowerCase();
    const typeOk = tEnemies === "all" || x.type === tEnemies;
    return (!q || hay.includes(q)) && typeOk;
  });
  const eg = $("#enemyGrid");
  const eEmpty = $("#enemyEmpty");
  if (eg) {
    eg.innerHTML = "";
    enemies.forEach((o) => eg.append(createCard(o, "enemy")));
    eEmpty.hidden = enemies.length > 0;
  }

  if (!$("#favorites").hidden) renderFavorites();
}

// Search
$("#q")?.addEventListener("input", () => {
  const allLink = document.querySelector(`a[data-page="all"]`);
  if (allLink) {
    $$("#nav a").forEach((x) => x.classList.remove("active"));
    allLink.classList.add("active");
    $$("#page > div").forEach((div) => (div.hidden = div.id !== "all"));
    history.replaceState(null, "", "#all");
  }
  render();
});

$("#resetAll")?.addEventListener("click", () => {
  $("#q").value = "";
  $(".all-type[data-for=\"all\"]").value = "all";
  $(".floor[data-for=\"all\"]").value = "all";
  $(".rarity[data-for=\"all\"]").value = "all";
  $(".slot[data-for=\"all\"]").value = "all";
  render();
});

$$("select").forEach((sel) => sel.addEventListener("change", render));

// Navigation
$("#nav")?.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  e.preventDefault();
  $$("#nav a").forEach((x) => x.classList.remove("active"));
  a.classList.add("active");
  const page = a.dataset.page;
  $$("#page > div").forEach((div) => (div.hidden = div.id !== page));
  history.replaceState(null, "", "#" + page);
  if (page === "favorites") renderFavorites();
  render();
});

// Detail sheet
const backdrop = $("#sheetBackdrop"),
  hero = $("#sheetHero"),
  body = $("#sheetBody"),
  titleEl = $("#sheetTitle");
$("#sheetClose")?.addEventListener("click", () => (backdrop.style.display = "none"));
$("#sheetBackdrop")?.addEventListener("click", (e) => {
  if (e.target.id === "sheetBackdrop") backdrop.style.display = "none";
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") backdrop.style.display = "none";
});

function openSheet(obj, type) {
  titleEl.textContent = obj.name;
  hero.style.backgroundImage = obj.icon ? `url(${obj.icon})` : "none";
  if (type === "enemy") {
    body.innerHTML = `
      <div class="section-tag">Location</div><div class="small">Floor 1</div>
      <div class="section-tag" style="margin-top:12px">Information</div>
      <div class="kv">
        <div class="row"><span class="key">Health</span><span>${obj.hp ?? "-"}</span></div>
        <div class="row"><span class="key">Defense</span><span>${obj.defense ?? "-"}</span></div>
        <div class="row"><span class="key">Entity</span><span>${obj.entity || "Mob"}</span></div>
        <div class="row"><span class="key">Type</span><span>${obj.type || "mob"}</span></div>
      </div>
      <div class="section-tag" style="margin-top:12px">Rewards</div>
      <div class="kv">
        <div class="row" style="grid-column:1/-1"><span class="key">Loot</span><span>${(obj.loot || []).join(", ") || "-"}</span></div>
        <div class="row" style="grid-column:1/-1"><span class="key">Materials</span><span>${(obj.materials || []).join(", ") || "-"}</span></div>
        <div class="row"><span class="key">Experience</span><span>${obj.exp ?? "-"}</span></div>
        <div class="row"><span class="key">Money</span><span>${obj.money ?? "-"}</span></div>
      </div>
      <div class="section-tag" style="margin-top:12px">Summary</div>
      <p class="summary">${obj.summary || ""}</p>`;
  } else if (type === "item") {
    body.innerHTML = `
      <div class="section-tag">Overview</div>
      <div class="kv">
        <div class="row"><span class="key">Rarity</span><span>${obj.rarity || "common"}</span></div>
        <div class="row"><span class="key">Level Req</span><span>${obj.levelReq ?? "-"}</span></div>
        <div class="row"><span class="key">DPS</span><span>${obj.dps ?? "-"}</span></div>
        <div class="row"><span class="key">Floor</span><span>${obj.floor || "F1"}</span></div>
      </div>
      <div class="section-tag" style="margin-top:12px">Dropped By</div>
      <div>${(obj.droppedBy || []).map((n) => `<span class="badge">${n}</span>`).join("") || '<span class="small"></span>'}</div>
      <div class="section-tag" style="margin-top:12px">Summary</div>
      <p class="summary">${obj.summary || ""}</p>`;
  } else if (type === "armor") {
    body.innerHTML = `
      <div class="section-tag">Overview</div>
      <div class="kv">
        <div class="row"><span class="key">Rarity</span><span>${obj.rarity || "common"}</span></div>
        <div class="row"><span class="key">Level Req</span><span>${obj.levelReq ?? "-"}</span></div>
        <div class="row"><span class="key">HP</span><span>${obj.hp ?? "-"}</span></div>
        <div class="row"><span class="key">Defense</span><span>${obj.defense ?? "-"}</span></div>
        <div class="row"><span class="key">Slot</span><span>${obj.slot || "-"}</span></div>
        <div class="row"><span class="key">Floor</span><span>${obj.floor || "F1"}</span></div>
      </div>
      <div class="section-tag" style="margin-top:12px">Dropped By</div>
      <div>${(obj.droppedBy || []).map((n) => `<span class="badge">${n}</span>`).join("") || '<span class="small"></span>'}</div>
      <div class="section-tag" style="margin-top:12px">Summary</div>
      <p class="summary">${obj.summary || ""}</p>`;
  }
  backdrop.style.display = "flex";
}

// Favorites view
function renderFavorites() {
  const grid = $("#favGrid"), empty = $("#favEmpty");
  if (!grid) return;
  grid.innerHTML = "";
  if (favorites.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  favorites.forEach((f) => grid.append(createCard(f.data, f.type)));
}

// Placeholder social features
console.log("Friends, Messages, and Profile features are placeholders for now. Connect to Supabase tables next!");
console.info("[App] Auth UI ready. Click Log In or Create Account to proceed.");

// Boot
if (location.hash) {
  const link = document.querySelector(`a[data-page="${location.hash.slice(1)}"]`);
  link?.click();
}

// Enter-to-submit convenience
[loginUsername, loginPassword].forEach((el) => el?.addEventListener("keydown", (e) => { if (e.key === "Enter") loginSubmit?.click(); }));
[signupUsername, signupPassword, signupConfirm].forEach((el) => el?.addEventListener("keydown", (e) => { if (e.key === "Enter") signupSubmit?.click(); }));
