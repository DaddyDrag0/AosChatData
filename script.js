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
  if (!supabase && window.supabase) {
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

// Owner/Admin system - checked from database
let userRole = null; // Will be loaded from admin_roles table

async function loadUserRole() {
  if (!currentUser || !supabase) return;
  const lookupUsername = (currentUser || "").toLowerCase();
  
  try {
    const { data, error } = await supabase
      .from('admin_roles')
      .select('role, permissions')
      .eq('username', lookupUsername)
      .single();
    
    if (data) {
      userRole = data;
      console.log('✅ Admin role loaded:', currentUser, userRole);
    } else {
      userRole = null;
      console.log('❌ No admin role found for:', currentUser);
    }
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error loading admin role:', error);
    }
  } catch (e) {
    userRole = null;
    console.error('Exception loading admin role:', e);
  }
}

function isOwner() {
  return userRole && userRole.role === 'owner';
}

function isAdmin() {
  return userRole && (userRole.role === 'owner' || userRole.role === 'admin');
}

// DOM shortcuts
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Toast notification system
function showToast(message, type = 'info', duration = 4000) {
  const container = $("#toastContainer");
  if (!container) return;
  
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close">×</button>
  `;
  
  container.appendChild(toast);
  
  const closeBtn = toast.querySelector('.toast-close');
  const remove = () => {
    toast.style.animation = 'toastSlide .3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  };
  
  closeBtn.addEventListener('click', remove);
  
  if (duration > 0) {
    setTimeout(remove, duration);
  }
}

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

// Demo database - Hardcoded starter content (for immediate display)
// Will be merged with database content
const HARDCODED_DB = {
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
    {name:"Frenzy Boar",type:"mob",floor:"F1",icon:"",hp:120,defense:"None",loot:["Novice Blade","Novice Tunic"],materials:["Leather"],exp:24,money:30,summary:"An aggressive boar roaming Floor 1 fields."},
    {name:"Kobold",type:"mob",floor:"F1",icon:"",hp:80,defense:"Low",loot:["Bronze Sword","Shard of Resentment"],materials:["Leather"],exp:16,money:20,summary:"Sneaky cave-dweller; travels in packs."},
    {name:"Slime",type:"mob",floor:"F1",icon:"",hp:50,defense:"Gelatinous",loot:["Healing Potion"],materials:["Slime Jelly"],exp:10,money:12,summary:"Bouncy creature; weak but numerous."}
  ]
};

// Active database - Merged hardcoded + database items
const DB = {
  items: [...HARDCODED_DB.items],
  armor: [...HARDCODED_DB.armor],
  enemies: [...HARDCODED_DB.enemies]
};

// Load items/armor/enemies from Supabase and merge with hardcoded content
async function loadWikiContent() {
  if (!supabase) return;
  
  try {
    // Load items from database
    const { data: dbItems, error: itemsError } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!itemsError && dbItems) {
      // Convert database format to app format
      const formattedItems = dbItems.map(item => ({
        name: item.name,
        rarity: item.rarity,
        icon: item.icon || "",
        source: item.source || "",
        dps: item.dps || 0,
        levelReq: item.level_req || 1,
        droppedBy: item.dropped_by || [],
        floor: item.floor || "",
        summary: item.summary || ""
      }));
      
      // Merge with hardcoded items (avoid duplicates)
      const itemNames = new Set(HARDCODED_DB.items.map(i => i.name));
      const newItems = formattedItems.filter(i => !itemNames.has(i.name));
      DB.items = [...HARDCODED_DB.items, ...newItems];
    }
    
    // Load armor from database
    const { data: dbArmor, error: armorError } = await supabase
      .from('armor')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!armorError && dbArmor) {
      const formattedArmor = dbArmor.map(armor => ({
        name: armor.name,
        rarity: armor.rarity,
        slot: armor.slot,
        icon: armor.icon || "",
        source: armor.source || "",
        hp: armor.hp || 0,
        defense: armor.defense || 0,
        levelReq: armor.level_req || 1,
        droppedBy: armor.dropped_by || [],
        floor: armor.floor || "",
        summary: armor.summary || ""
      }));
      
      const armorNames = new Set(HARDCODED_DB.armor.map(a => a.name));
      const newArmor = formattedArmor.filter(a => !armorNames.has(a.name));
      DB.armor = [...HARDCODED_DB.armor, ...newArmor];
    }
    
    // Load enemies from database
    const { data: dbEnemies, error: enemiesError } = await supabase
      .from('enemies')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!enemiesError && dbEnemies) {
      const formattedEnemies = dbEnemies.map(enemy => ({
        name: enemy.name,
        type: enemy.enemy_type || enemy.type,
        floor: enemy.floor,
        icon: enemy.icon || "",
        hp: enemy.hp || 0,
        defense: enemy.defense || "",
        loot: enemy.loot || [],
        materials: enemy.materials || [],
        exp: enemy.exp || 0,
        money: enemy.money || 0,
        summary: enemy.summary || ""
      }));
      
      const enemyNames = new Set(HARDCODED_DB.enemies.map(e => e.name));
      const newEnemies = formattedEnemies.filter(e => !enemyNames.has(e.name));
      DB.enemies = [...HARDCODED_DB.enemies, ...newEnemies];
    }
    
    // Re-render after loading
    render();
  } catch (e) {
    console.error('Error loading wiki content:', e);
  }
}

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

// (diagnostics removed)

// Force-show app layout and optional target page
function showApp(target = "overview") {
  try {
    // Hide auth overlay (belt + suspenders)
    if (authOverlay) { authOverlay.hidden = true; authOverlay.style.display = "none"; }
    // Show wiki layout
    if (wikiLayout) { wikiLayout.hidden = false; wikiLayout.style.display = "block"; }
    // Navigate
    const link = document.querySelector(`a[data-page="${target}"]`);
    if (link) {
      $$("#nav a").forEach((x) => x.classList.remove("active"));
      link.classList.add("active");
      $$("#page > div").forEach((div) => (div.hidden = div.id !== target));
      history.replaceState(null, "", `#${target}`);
    }
    // Remove focus ring from button
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  } catch (e) {
    console.error("UI: showApp failed", e);
  }
}

// Force-show auth and hide app layout (used on logout)
function showAuth() {
  try {
    if (wikiLayout) { wikiLayout.hidden = true; wikiLayout.style.display = "none"; }
    if (authOverlay) { authOverlay.hidden = false; authOverlay.style.display = "flex"; }
    // Reset to login tab if using tabs
    const tabLogin = document.getElementById("tabLogin");
    tabLogin?.click();
  } catch (e) {
    console.error("UI: showAuth failed", e);
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
tabLogin?.addEventListener("click", () => { setTab("login"); });
tabSignup?.addEventListener("click", () => { setTab("signup"); });

// Login
loginSubmit?.addEventListener("click", async () => {
  if (!supabase) {
    return showAuthError("App is still loading Supabase. Try a hard refresh (Ctrl+F5).");
  }
  const username = (loginUsername?.value || "").trim().toLowerCase();
  const password = loginPassword?.value || "";
  if (!username || !password) return showAuthError("Please enter username and password");
  if (!USERNAME_REGEX.test(username)) return showAuthError("Username must be 3-20 characters (lowercase letters, numbers, underscores only)");
  // Don't check RESERVED_NAMES on login - allow existing accounts to log in
  const email = `${username}@app.local`;
  console.debug("Auth: signInWithPassword", { email });
  let data, error;
  try {
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch (e) {
    console.error("Auth: sign-in exception", e);
    return showAuthError("Network error signing in. Check your connection.");
  }
  console.log("Auth: sign-in result", { data, error });
  if (error) {
    console.warn("Auth: sign-in error", error);
    return showAuthError(error.message);
  }
  // Use returned session immediately if present
  if (data?.session?.user) {
    // Don't call initWiki here - let onAuthStateChange handle it to avoid duplicates
    // onAuthStateChange will fire automatically after successful login
  } else {
    // Fallback to session check
    const { data: s } = await supabase.auth.getSession();
    if (s?.session?.user) await initWiki();
    else showAuthError("Login did not return a session. If email confirmations are enabled, confirm your email or disable confirmations in Supabase Auth settings.");
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

  const rawSignupName = user.user_metadata?.username || (user.email ? user.email.split("@")[0] : username);
  currentUser = (rawSignupName || "").toLowerCase();
  currentUserEl.textContent = rawSignupName || currentUser;
    showApp("profile");
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
  // Sign out from Supabase first
  await supabase.auth.signOut();
  
  // Clear all state
  currentUser = null;
  userRole = null;
  isWikiInitialized = false;
  mySubmissions = [];
  pendingSubmissions = [];
  
  // Clear localStorage to prevent auto-login
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear all form inputs
  if (loginUsername) loginUsername.value = "";
  if (loginPassword) loginPassword.value = "";
  
  // Clear contribute forms
  try {
    clearContributeForm('item');
    clearContributeForm('armor');
    clearContributeForm('enemy');
  } catch (e) {
    // Forms might not exist yet
  }
  
  // Show auth screen
  showAuth();
  showToast('Logged out successfully', 'info');
  
  // Prevent immediate re-login by reloading after a short delay
  setTimeout(() => location.reload(), 100);
});

// Theme toggle
const themeToggle = $("#themeToggle");
const root = document.documentElement;

function setTheme(theme) {
  root.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  if (themeToggle) {
    themeToggle.textContent = theme === "light" ? "🌙" : "☀️";
    themeToggle.title = `Switch to ${theme === "light" ? "dark" : "light"} mode`;
  }
}

function toggleTheme() {
  const current = root.getAttribute("data-theme") || "dark";
  setTheme(current === "dark" ? "light" : "dark");
}

// Load saved theme on init
const savedTheme = localStorage.getItem("theme") || "dark";
setTheme(savedTheme);

themeToggle?.addEventListener("click", toggleTheme);

// Profile button navigation
$("#profileBtn")?.addEventListener("click", () => {
  const profileLink = document.querySelector('a[data-page="profile"]');
  if (profileLink) {
    profileLink.click();
  }
});

// Notification system
let notifications = [];

async function loadNotifications() {
  if (!currentUser || !supabase) return;
  
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('username', currentUser)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('Failed to load notifications:', error);
      return;
    }
    
    notifications = (data || []).map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      icon: n.icon || '📬',
      type: n.type || 'info',
      time: new Date(n.created_at),
      unread: !n.read
    }));
    
    updateNotificationBadge();
    renderNotifications();
  } catch (e) {
    console.error('Error loading notifications:', e);
  }
}

async function addNotification(title, message, icon = '📬', type = 'info') {
  const notif = {
    id: Date.now(),
    title,
    message,
    icon,
    type,
    time: new Date(),
    unread: true
  };
  notifications.unshift(notif);
  updateNotificationBadge();
  
  // Save to database
  if (supabase && currentUser) {
    await supabase
      .from('notifications')
      .insert([{
        username: currentUser,
        title,
        message,
        icon,
        type,
        read: false
      }]);
  }
  
  // Also show toast for important notifications
  if (type === 'friend-request' || type === 'message') {
    showToast(title, 'info');
    // Send browser notification for messages and friend requests
    sendBrowserNotification(title, message, icon);
  }
}

function updateNotificationBadge() {
  const badge = $("#notifBadge");
  if (!badge) return;
  
  const unreadCount = notifications.filter(n => n.unread).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function renderNotifications() {
  const list = $("#notifList");
  const empty = $("#notifEmpty");
  if (!list || !empty) return;
  
  list.innerHTML = "";
  
  if (notifications.length === 0) {
    empty.hidden = false;
    return;
  }
  
  empty.hidden = true;
  notifications.forEach(notif => {
    const div = document.createElement('div');
    div.className = `notif-item ${notif.unread ? 'unread' : ''}`;
    div.innerHTML = `
      <span class="notif-icon">${notif.icon}</span>
      <div class="notif-content">
        <div class="notif-title">${notif.title}</div>
        <div class="notif-message">${notif.message}</div>
        <div class="notif-time">${formatTimeAgo(notif.time)}</div>
      </div>
    `;
    div.addEventListener('click', () => {
      notif.unread = false;
      updateNotificationBadge();
      renderNotifications();
    });
    list.appendChild(div);
  });
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

$("#notifBtn")?.addEventListener("click", () => {
  const link = document.querySelector('a[data-page="notifications"]');
  if (link) {
    link.click();
    // Mark all as read when opening
    notifications.forEach(n => n.unread = false);
    updateNotificationBadge();
    renderNotifications();
  }
});

$("#clearNotifs")?.addEventListener("click", () => {
  notifications = [];
  updateNotificationBadge();
  renderNotifications();
  showToast('All notifications cleared', 'info');
});

// Add some sample notifications for demonstration
setTimeout(() => {
  if (currentUser) {
    addNotification('Welcome!', 'Check out the new notification center', '🎉', 'info');
  }
}, 2000);

// Browser Push Notifications
let browserNotificationsEnabled = false;

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Browser notifications not supported', 'error');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    browserNotificationsEnabled = true;
    showToast('Browser notifications already enabled', 'success');
    return true;
  }
  
  if (Notification.permission === 'denied') {
    showToast('Notification permission denied. Enable in browser settings.', 'error');
    return false;
  }
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      browserNotificationsEnabled = true;
      showToast('Browser notifications enabled!', 'success');
      // Test notification
      sendBrowserNotification('Notifications Enabled', 'You will now receive message alerts', '🔔');
      return true;
    } else {
      showToast('Notification permission denied', 'error');
      return false;
    }
  } catch (error) {
    console.error('Notification permission error:', error);
    showToast('Error requesting notification permission', 'error');
    return false;
  }
}

function sendBrowserNotification(title, message, icon = '🔔') {
  if (!browserNotificationsEnabled || Notification.permission !== 'granted') return;
  
  try {
    const notification = new Notification(title, {
      body: message,
      icon: icon,
      badge: icon,
      tag: 'epic-wiki-notification',
      requireInteraction: false,
      silent: false
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch (error) {
    console.error('Browser notification error:', error);
  }
}

// Check notification permission on load
if ('Notification' in window && Notification.permission === 'granted') {
  browserNotificationsEnabled = true;
}

// Comparison Mode
let compareSlots = [null, null];

function addToCompare(obj, type) {
  // Find first empty slot
  let slotIndex = compareSlots[0] === null ? 0 : compareSlots[1] === null ? 1 : -1;
  
  if (slotIndex === -1) {
    // Both slots full, replace first
    slotIndex = 0;
    showToast('Replaced first item in comparison', 'info');
  }
  
  compareSlots[slotIndex] = { obj, type };
  renderComparison();
  showToast(`Added ${obj.name} to compare slot ${slotIndex + 1}`, 'success');
  
  // Navigate to compare page if both slots filled
  if (compareSlots[0] && compareSlots[1]) {
    const link = document.querySelector('a[data-page="compare"]');
    if (link) {
      setTimeout(() => link.click(), 500);
    }
  }
}

function renderComparison() {
  const slot1 = $("#compareSlot1");
  const slot2 = $("#compareSlot2");
  if (!slot1 || !slot2) return;
  
  renderCompareSlot(slot1, compareSlots[0], 0);
  renderCompareSlot(slot2, compareSlots[1], 1);
}

function renderCompareSlot(slotEl, item, index) {
  if (!item) {
    slotEl.innerHTML = `
      <div class="empty" style="min-height:200px;display:flex;align-items:center;justify-content:center;">
        Click ⚖️ on an item card
      </div>`;
    slotEl.classList.remove('filled');
    return;
  }
  
  slotEl.classList.add('filled');
  const { obj, type } = item;
  
  let statsHtml = '';
  if (type === 'item') {
    const otherItem = compareSlots[1 - index];
    statsHtml = `
      <div class="compare-stat ${getBetter('dps', obj.dps, otherItem)}">
        <span class="compare-stat-label">DPS</span>
        <span class="compare-stat-value">${obj.dps ?? '-'}</span>
      </div>
      <div class="compare-stat ${getBetter('levelReq', obj.levelReq, otherItem, true)}">
        <span class="compare-stat-label">Level Req</span>
        <span class="compare-stat-value">${obj.levelReq ?? '-'}</span>
      </div>
      <div class="compare-stat">
        <span class="compare-stat-label">Rarity</span>
        <span class="compare-stat-value">${obj.rarity || 'common'}</span>
      </div>
      <div class="compare-stat">
        <span class="compare-stat-label">Floor</span>
        <span class="compare-stat-value">${obj.floor || 'F1'}</span>
      </div>
    `;
  } else if (type === 'armor') {
    const otherItem = compareSlots[1 - index];
    statsHtml = `
      <div class="compare-stat ${getBetter('hp', obj.hp, otherItem)}">
        <span class="compare-stat-label">HP</span>
        <span class="compare-stat-value">${obj.hp ?? '-'}</span>
      </div>
      <div class="compare-stat ${getBetter('defense', obj.defense, otherItem)}">
        <span class="compare-stat-label">Defense</span>
        <span class="compare-stat-value">${obj.defense ?? '-'}</span>
      </div>
      <div class="compare-stat ${getBetter('levelReq', obj.levelReq, otherItem, true)}">
        <span class="compare-stat-label">Level Req</span>
        <span class="compare-stat-value">${obj.levelReq ?? '-'}</span>
      </div>
      <div class="compare-stat">
        <span class="compare-stat-label">Slot</span>
        <span class="compare-stat-value">${obj.slot || '-'}</span>
      </div>
      <div class="compare-stat">
        <span class="compare-stat-label">Rarity</span>
        <span class="compare-stat-value">${obj.rarity || 'common'}</span>
      </div>
    `;
  }
  
  slotEl.innerHTML = `
    <div class="compare-item">
      <h3>${obj.name}</h3>
      <div class="compare-stats">
        ${statsHtml}
      </div>
    </div>
  `;
}

function getBetter(stat, value, otherItem, lowerIsBetter = false) {
  if (!otherItem || !otherItem.obj) return '';
  const otherValue = otherItem.obj[stat];
  if (value == null || otherValue == null) return '';
  
  const numValue = parseFloat(value);
  const numOther = parseFloat(otherValue);
  
  if (isNaN(numValue) || isNaN(numOther)) return '';
  
  if (lowerIsBetter) {
    return numValue < numOther ? 'better' : '';
  } else {
    return numValue > numOther ? 'better' : '';
  }
}

$("#clearCompare")?.addEventListener("click", () => {
  compareSlots = [null, null];
  renderComparison();
  showToast('Comparison cleared', 'info');
});

// Session init
// Track if wiki is already initialized to prevent duplicate toasts
let isWikiInitialized = false;

async function initWiki() {
  if (!supabase) return; // can't init without client
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  
  const previousUser = currentUser;
  const rawUsername = session.user.user_metadata.username || session.user.email.split("@")[0] || "";
  currentUser = rawUsername.toLowerCase();
  currentUserEl.textContent = rawUsername;
  
  // Load user role from database (for admin permissions)
  await loadUserRole();
  
  // Ensure Overview is visible by default
  showApp("overview");
  render();
  
  // Only show welcome toast if this is a new login (not already initialized or different user)
  if (!isWikiInitialized || previousUser !== currentUser) {
    showToast(`Welcome back, ${currentUser}!`, 'success');
    isWikiInitialized = true;
  }
  
  // Load wiki content from database
  await loadWikiContent();
  
  // Load user data from database
  await loadFavorites();
  await loadFriends();
  await loadGroups();
  await loadNotifications();
  await loadMessages();
  
  // Load contributions
  await loadMySubmissions();
  if (isAdmin()) {
    await loadPendingSubmissions();
  }
  
  // Always render the admin panel visibility (will hide if not admin)
  renderPendingApprovals();
  
  // Initialize real-time features
  initRealtimePresence();
  initRealtimeMessages();
  
  // Initialize emoji picker
  initEmojiPicker();
  
  // Initialize group chat
  initGroupChat();
  
  // Populate DPS calculator weapons
  populateDpsWeapons();
}

// ===== REAL-TIME FEATURES =====
let presenceChannel = null;
let messagesChannel = null;
let onlineUsers = new Set();
let typingUsers = new Map(); // Map of username -> timeout

// Real-time Presence (Online/Offline tracking)
function initRealtimePresence() {
  if (!supabase || !currentUser) return;
  
  presenceChannel = supabase.channel('online-users', {
    config: {
      presence: {
        key: currentUser,
      },
    },
  });
  
  // Track presence state
  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      onlineUsers.clear();
      
      for (const userId in state) {
        state[userId].forEach(presence => {
          if (presence.user) {
            onlineUsers.add(presence.user);
          }
        });
      }
      
      // Update friend list UI
      updateFriendOnlineStatus();
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      newPresences.forEach(presence => {
        if (presence.user && presence.user !== currentUser) {
          showToast(`${presence.user} is now online`, 'info');
        }
      });
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      leftPresences.forEach(presence => {
        if (presence.user) {
          onlineUsers.delete(presence.user);
        }
      });
      updateFriendOnlineStatus();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track this user as online
        await presenceChannel.track({
          user: currentUser,
          online_at: new Date().toISOString(),
        });
      }
    });
}

// Real-time Messages
function initRealtimeMessages() {
  if (!supabase || !currentUser) return;
  
  messagesChannel = supabase.channel('messages');
  
  messagesChannel
    .on('broadcast', { event: 'message' }, ({ payload }) => {
      if (payload.to === currentUser) {
        // Received a new message
        messages.push(payload);
        
        // Show notification
        addNotification(
          `New message from ${payload.from}`,
          payload.text.substring(0, 50),
          '💬',
          'message'
        );
        
        // Update chat if it's the active conversation
        if (activeChat === payload.from) {
          renderMessages();
        }
      }
    })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.to === currentUser && payload.from !== currentUser) {
        handleTypingIndicator(payload.from, payload.typing);
      }
    })
    .on('broadcast', { event: 'read' }, ({ payload }) => {
      if (payload.from === currentUser) {
        // Mark messages as read
        markMessagesAsRead(payload.to);
      }
    })
    .on('broadcast', { event: 'reaction' }, ({ payload }) => {
      // Update message reactions
      const msg = messages.find(m => m.id === payload.msgId);
      if (msg) {
        msg.reactions = payload.reactions;
        if (activeChat === payload.user || msg.from === currentUser || msg.to === currentUser) {
          renderMessages();
        }
      }
    })
    .subscribe();
}

// Update friend online status
function updateFriendOnlineStatus() {
  friends.forEach(friend => {
    friend.online = onlineUsers.has(friend.username);
  });
  
  // Re-render friends list if visible
  if (!$('#friends').hidden) {
    renderFriends();
  }
}

// Typing indicator
let typingTimeout = null;

function handleTypingIndicator(username, isTyping) {
  if (isTyping) {
    typingUsers.set(username, Date.now());
    
    // Show typing indicator
    if (activeChat === username) {
      showTypingIndicator(username);
    }
    
    // Auto-clear after 3 seconds
    setTimeout(() => {
      typingUsers.delete(username);
      hideTypingIndicator(username);
    }, 3000);
  } else {
    typingUsers.delete(username);
    hideTypingIndicator(username);
  }
}

function showTypingIndicator(username) {
  const chatLog = $("#chatLog");
  if (!chatLog) return;
  
  // Remove existing typing indicator
  const existing = chatLog.querySelector('.typing-indicator');
  if (existing) existing.remove();
  
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = `
    <div class="typing-dots">
      <span>${username} is typing</span>
      <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
    </div>
  `;
  chatLog.appendChild(indicator);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function hideTypingIndicator(username) {
  const chatLog = $("#chatLog");
  if (!chatLog) return;
  
  const indicator = chatLog.querySelector('.typing-indicator');
  if (indicator) indicator.remove();
}

// Read receipts
function markMessagesAsRead(otherUser) {
  messages.forEach(msg => {
    if (msg.from === otherUser && msg.to === currentUser) {
      msg.read = true;
    }
  });
  renderMessages();
}

// ===== EMOJI REACTIONS =====

const emojis = ['😀','😂','😍','🥰','😎','😢','😡','👍','👎','❤️','🔥','⭐','🎉','💯','👏','🙏','💪','✨','🎯','🚀'];
let selectedMessageForReaction = null;

function initEmojiPicker() {
  const emojiGrid = $('#emojiGrid');
  if (!emojiGrid) return;
  
  emojiGrid.innerHTML = emojis.map(emoji => 
    `<button class="emoji-btn" data-emoji="${emoji}">${emoji}</button>`
  ).join('');
  
  emojiGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (!btn) return;
    
    const emoji = btn.dataset.emoji;
    if (selectedMessageForReaction !== null) {
      addReaction(selectedMessageForReaction, emoji);
      closeEmojiPicker();
    } else if (selectedGroupMessageForReaction !== null) {
      addGroupReaction(selectedGroupMessageForReaction, emoji);
      closeEmojiPicker();
    } else {
      // Insert emoji into chat input (DM or Group)
      const chatText = $('#chatText');
      const groupChatText = $('#groupChatText');
      
      if (chatText && !$('#messages').hidden) {
        chatText.value += emoji;
        chatText.focus();
      } else if (groupChatText && !$('#groups').hidden) {
        groupChatText.value += emoji;
        groupChatText.focus();
      }
      closeEmojiPicker();
    }
  });
  
  $('#chatEmoji')?.addEventListener('click', () => {
    selectedMessageForReaction = null;
    selectedGroupMessageForReaction = null;
    openEmojiPicker();
  });
  
  $('#emojiClose')?.addEventListener('click', closeEmojiPicker);
  $('#emojiPicker')?.addEventListener('click', (e) => {
    if (e.target.id === 'emojiPicker') closeEmojiPicker();
  });
}

function openEmojiPicker() {
  const picker = $('#emojiPicker');
  if (picker) picker.hidden = false;
}

function closeEmojiPicker() {
  const picker = $('#emojiPicker');
  if (picker) picker.hidden = true;
  selectedMessageForReaction = null;
  selectedGroupMessageForReaction = null;
}

function addReaction(msgId, emoji) {
  const msg = messages.find(m => m.id === msgId);
  if (!msg) return;
  
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  
  const userIndex = msg.reactions[emoji].indexOf(currentUser);
  if (userIndex === -1) {
    msg.reactions[emoji].push(currentUser);
  } else {
    msg.reactions[emoji].splice(userIndex, 1);
    if (msg.reactions[emoji].length === 0) {
      delete msg.reactions[emoji];
    }
  }
  
  renderMessages();
  
  // Broadcast reaction via Supabase Realtime
  if (messagesChannel) {
    messagesChannel.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { msgId, emoji, user: currentUser, reactions: msg.reactions }
    });
  }
}

function openReactionPicker(msgId) {
  selectedMessageForReaction = msgId;
  openEmojiPicker();
}

// ===== GROUP CHAT SYSTEM =====

let groups = [];
let activeGroup = null;
let groupMessages = [];
let groupsChannel = null;

async function loadGroups() {
  if (!currentUser || !supabase) return;
  
  try {
    // Load groups where user is a member
    const { data: memberData, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('username', currentUser);
    
    if (memberError) {
      console.error('Failed to load group memberships:', memberError);
      return;
    }
    
    if (!memberData || memberData.length === 0) {
      groups = [];
      renderGroups();
      return;
    }
    
    const groupIds = memberData.map(m => m.group_id);
    
    // Load full group details
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds);
    
    if (groupError) {
      console.error('Failed to load groups:', groupError);
      return;
    }
    
    // Load members for each group
    const { data: allMembers, error: membersError } = await supabase
      .from('group_members')
      .select('*')
      .in('group_id', groupIds);
    
    if (membersError) {
      console.error('Failed to load group members:', membersError);
      return;
    }
    
    // Combine data
    groups = (groupData || []).map(g => ({
      id: g.id,
      name: g.name,
      members: allMembers.filter(m => m.group_id === g.id).map(m => m.username),
      createdBy: g.created_by,
      createdAt: g.created_at
    }));
    
    // Load recent group messages
    const { data: messages, error: messagesError } = await supabase
      .from('group_messages')
      .select('*')
      .in('group_id', groupIds)
      .order('created_at', { ascending: true });
    
    if (!messagesError) {
      groupMessages = (messages || []).map(m => ({
        id: m.id,
        groupId: m.group_id,
        from: m.from_user,
        text: m.text,
        reactions: m.reactions || {},
        timestamp: new Date(m.created_at).getTime()
      }));
    }
    
    renderGroups();
  } catch (e) {
    console.error('Error loading groups:', e);
  }
}

function initGroupChat() {
  if (!supabase || !currentUser) return;
  
  // Subscribe to group messages channel
  groupsChannel = supabase.channel('group-messages');
  
  groupsChannel
    .on('broadcast', { event: 'group-message' }, ({ payload }) => {
      if (payload.groupId && groups.some(g => g.id === payload.groupId && g.members.includes(currentUser))) {
        groupMessages.push(payload);
        
        if (activeGroup === payload.groupId) {
          renderGroupMessages();
        }
        
        // Show notification
        const group = groups.find(g => g.id === payload.groupId);
        if (group && payload.from !== currentUser) {
          addNotification(
            `New message in ${group.name}`,
            `${payload.from}: ${payload.text.substring(0, 40)}`,
            '👨‍👩‍👧‍👦',
            'group'
          );
        }
      }
    })
    .subscribe();
  
  renderGroups();
  renderFriendsSelector();
  
  // Add Member button handler
  $('#addMemberBtn')?.addEventListener('click', () => {
    if (!activeGroup) {
      showToast('No group selected', 'error');
      return;
    }
    
    const group = groups.find(g => g.id === activeGroup);
    if (!group) return;
    
    renderAddMemberSelector(group.members);
    const modal = $('#addMemberModal');
    if (modal) modal.hidden = false;
  });
  
  // Close add member modal
  $('#addMemberClose')?.addEventListener('click', () => {
    const modal = $('#addMemberModal');
    if (modal) modal.hidden = true;
  });
  
  // Confirm add members
  $('#confirmAddMembers')?.addEventListener('click', async () => {
    if (!activeGroup) return;
    
    const selectedFriends = Array.from(document.querySelectorAll('#addMemberSelector input[type="checkbox"]:checked'))
      .map(cb => cb.value);
    
    if (selectedFriends.length === 0) {
      showToast('Please select at least one friend to add', 'error');
      return;
    }
    
    const group = groups.find(g => g.id === activeGroup);
    if (!group) return;
    
    // Insert new members into database
    const membersToInsert = selectedFriends.map(username => ({
      group_id: activeGroup,
      username
    }));
    
    const { error } = await supabase
      .from('group_members')
      .insert(membersToInsert);
    
    if (error) {
      console.error('Failed to add members:', error);
      showToast('Failed to add members', 'error');
      return;
    }
    
    // Add new members locally
    group.members.push(...selectedFriends);
    
    // Clear selections
    document.querySelectorAll('#addMemberSelector input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.closest('.friend-checkbox').classList.remove('selected');
    });
    
    // Close modal
    const modal = $('#addMemberModal');
    if (modal) modal.hidden = true;
    
    // Update UI
    renderGroups();
    renderGroupMessages(); // Update header
    
    showToast(`Added ${selectedFriends.length} member(s) to ${group.name}!`, 'success');
  });
}

function renderFriendsSelector() {
  const selector = $('#friendsSelector');
  if (!selector) return;
  
  if (friends.length === 0) {
    selector.innerHTML = '<div class="empty" style="padding:12px;">Add friends first to create groups!</div>';
    return;
  }
  
  selector.innerHTML = friends.map(friend => `
    <div class="friend-checkbox">
      <input type="checkbox" id="friend-${friend.username}" value="${friend.username}">
      <label for="friend-${friend.username}">${friend.username}</label>
    </div>
  `).join('');
  
  // Add change listeners
  selector.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const parent = e.target.closest('.friend-checkbox');
      if (e.target.checked) {
        parent.classList.add('selected');
      } else {
        parent.classList.remove('selected');
      }
    });
  });
}

function renderAddMemberSelector(existingMembers = []) {
  const selector = $('#addMemberSelector');
  if (!selector) return;
  
  // Filter out friends who are already in the group
  const availableFriends = friends.filter(friend => !existingMembers.includes(friend.username));
  
  if (availableFriends.length === 0) {
    selector.innerHTML = '<div class="empty" style="padding:12px;">All your friends are already in this group!</div>';
    return;
  }
  
  selector.innerHTML = availableFriends.map(friend => `
    <div class="friend-checkbox">
      <input type="checkbox" id="add-friend-${friend.username}" value="${friend.username}">
      <label for="add-friend-${friend.username}">${friend.username}</label>
    </div>
  `).join('');
  
  // Add change listeners
  selector.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const parent = e.target.closest('.friend-checkbox');
      if (e.target.checked) {
        parent.classList.add('selected');
      } else {
        parent.classList.remove('selected');
      }
    });
  });
}

function renderGroups() {
  const groupsList = $('#groupsList');
  const groupsEmpty = $('#groupsEmpty');
  
  if (!groupsList) return;
  
  if (groups.length === 0) {
    groupsList.innerHTML = '';
    if (groupsEmpty) groupsEmpty.hidden = false;
    return;
  }
  
  if (groupsEmpty) groupsEmpty.hidden = true;
  
  groupsList.innerHTML = groups.map(group => `
    <div class="group-item" data-group-id="${group.id}">
      <div class="group-info">
        <div class="group-name">${group.name}</div>
        <div class="group-members">${group.members.length} members: ${group.members.join(', ')}</div>
      </div>
      <div class="group-actions">
        <button class="btn" data-action="open" data-group-id="${group.id}">Open</button>
        <button class="btn btn-secondary" data-action="leave" data-group-id="${group.id}">Leave</button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  groupsList.querySelectorAll('[data-action="open"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = parseInt(btn.dataset.groupId);
      openGroupChat(groupId);
    });
  });
  
  groupsList.querySelectorAll('[data-action="leave"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = parseInt(btn.dataset.groupId);
      leaveGroup(groupId);
    });
  });
}

function openGroupChat(groupId) {
  activeGroup = groupId;
  const panel = $('#groupChatPanel');
  if (panel) panel.hidden = false;
  renderGroupMessages();
}

function renderGroupMessages() {
  const groupChatWith = $('#groupChatWith');
  const groupChatLog = $('#groupChatLog');
  
  if (!activeGroup) {
    if (groupChatWith) groupChatWith.textContent = 'No group selected';
    if (groupChatLog) groupChatLog.innerHTML = '';
    return;
  }
  
  const group = groups.find(g => g.id === activeGroup);
  if (!group) return;
  
  if (groupChatWith) groupChatWith.textContent = group.name;
  if (groupChatLog) {
    groupChatLog.innerHTML = groupMessages
      .filter(m => m.groupId === activeGroup)
      .map(m => {
        const reactionsHtml = m.reactions && Object.keys(m.reactions).length > 0 
          ? `<div class="msg-reactions">
               ${Object.entries(m.reactions).map(([emoji, users]) => {
                 const isActive = users.includes(currentUser);
                 return `<div class="reaction ${isActive ? 'active' : ''}" data-msg-id="${m.id}" data-emoji="${emoji}">
                   <span class="reaction-emoji">${emoji}</span>
                   <span class="reaction-count ${isActive ? 'active' : ''}">${users.length}</span>
                 </div>`;
               }).join('')}
             </div>`
          : '';
        
        return `
          <div class="msg ${m.from === currentUser ? 'me' : ''}">
            <div class="bubble">
              <button class="bubble-react-btn" data-msg-id="${m.id}">😀</button>
              ${m.from !== currentUser ? `<strong>${m.from}:</strong> ` : ''}${m.text}
            </div>
            ${reactionsHtml}
          </div>
        `;
      }).join('');
    
    // Add reaction button listeners
    groupChatLog.querySelectorAll('.bubble-react-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const msgId = parseInt(btn.dataset.msgId);
        openGroupReactionPicker(msgId);
      });
    });
    
    // Add reaction click listeners
    groupChatLog.querySelectorAll('.reaction').forEach(reaction => {
      reaction.addEventListener('click', () => {
        const msgId = parseInt(reaction.dataset.msgId);
        const emoji = reaction.dataset.emoji;
        addGroupReaction(msgId, emoji);
      });
    });
    
    groupChatLog.scrollTop = groupChatLog.scrollHeight;
  }
}

function addGroupReaction(msgId, emoji) {
  const msg = groupMessages.find(m => m.id === msgId);
  if (!msg) return;
  
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  
  const userIndex = msg.reactions[emoji].indexOf(currentUser);
  if (userIndex === -1) {
    msg.reactions[emoji].push(currentUser);
  } else {
    msg.reactions[emoji].splice(userIndex, 1);
    if (msg.reactions[emoji].length === 0) {
      delete msg.reactions[emoji];
    }
  }
  
  renderGroupMessages();
}

let selectedGroupMessageForReaction = null;

function openGroupReactionPicker(msgId) {
  selectedGroupMessageForReaction = msgId;
  openEmojiPicker();
}

$('#createGroupBtn')?.addEventListener('click', async () => {
  const nameInput = $('#groupName');
  const name = nameInput?.value.trim();
  
  if (!name) {
    showToast('Please enter a group name', 'error');
    return;
  }
  
  // Get selected friends from checkboxes
  const selectedFriends = Array.from(document.querySelectorAll('#friendsSelector input[type="checkbox"]:checked'))
    .map(cb => cb.value);
  
  if (selectedFriends.length === 0) {
    showToast('Please select at least one friend to add', 'error');
    return;
  }
  
  if (!supabase) {
    showToast('Database not connected', 'error');
    return;
  }
  
  try {
    // Create group in database
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .insert([{
        name,
        created_by: currentUser
      }])
      .select()
      .single();
    
    if (groupError) {
      console.error('Failed to create group:', groupError);
      showToast('Failed to create group', 'error');
      return;
    }
    
    const groupId = groupData.id;
    const members = [currentUser, ...selectedFriends];
    
    // Add members to group_members table
    const membersToInsert = members.map(username => ({
      group_id: groupId,
      username
    }));
    
    const { error: membersError } = await supabase
      .from('group_members')
      .insert(membersToInsert);
    
    if (membersError) {
      console.error('Failed to add group members:', membersError);
      showToast('Group created but failed to add members', 'error');
      return;
    }
    
    // Add to local groups array
    const newGroup = {
      id: groupId,
      name,
      members,
      createdBy: currentUser,
      createdAt: groupData.created_at
    };
    
    groups.push(newGroup);
    
    if (nameInput) nameInput.value = '';
    
    // Uncheck all checkboxes
    document.querySelectorAll('#friendsSelector input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.closest('.friend-checkbox').classList.remove('selected');
    });
    
    renderGroups();
    showToast(`Group "${name}" created with ${selectedFriends.length} member(s)!`, 'success');
  } catch (e) {
    console.error('Error creating group:', e);
    showToast('Failed to create group', 'error');
  }
});

function leaveGroup(groupId) {
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  
  if (confirm(`Are you sure you want to leave "${group.name}"?`)) {
    groups = groups.filter(g => g.id !== groupId);
    groupMessages = groupMessages.filter(m => m.groupId !== groupId);
    
    if (activeGroup === groupId) {
      activeGroup = null;
      const panel = $('#groupChatPanel');
      if (panel) panel.hidden = true;
    }
    
    renderGroups();
    showToast(`You left the group "${group.name}"`, 'info');
  }
}

$('#groupChatSend')?.addEventListener('click', async () => {
  const input = $('#groupChatText');
  const text = input?.value.trim();
  if (!text || !activeGroup) return;
  
  const message = {
    id: Date.now(),
    groupId: activeGroup,
    from: currentUser,
    text,
    timestamp: Date.now(),
    reactions: {}
  };
  
  groupMessages.push(message);
  if (input) input.value = '';
  renderGroupMessages();
  
  // Broadcast via Supabase Realtime
  if (groupsChannel) {
    await groupsChannel.send({
      type: 'broadcast',
      event: 'group-message',
      payload: message
    });
  }
});

$('#groupChatText')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    $('#groupChatSend')?.click();
  }
});

$('#groupChatEmoji')?.addEventListener('click', () => {
  selectedMessageForReaction = null;
  selectedGroupMessageForReaction = null;
  openEmojiPicker();
});

$('#groupInfoBtn')?.addEventListener('click', () => {
  if (!activeGroup) return;
  
  const group = groups.find(g => g.id === activeGroup);
  if (!group) return;
  
  // Populate modal
  $("#groupInfoTitle").textContent = `${group.name} Settings`;
  $("#groupNameEdit").value = group.name;
  
  // Render members list
  const membersList = $("#groupMembersList");
  membersList.innerHTML = group.members.map(member => {
    const isCreator = member === group.created_by;
    const canKick = currentUser === group.created_by && member !== currentUser;
    
    return `
      <div class="friend" style="margin-bottom:8px;">
        <div>
          <span class="username-link" data-username="${member}" style="cursor:pointer;color:var(--accent);font-weight:600;">${member}</span>
          ${isCreator ? '<span class="badge" style="margin-left:8px;">Creator</span>' : ''}
        </div>
        ${canKick ? `<button class="btn ghost" style="color:#dc2626;margin-left:auto;" data-kick="${member}">Kick</button>` : ''}
      </div>
    `;
  }).join('');
  
  // Add username click handlers
  membersList.querySelectorAll('.username-link').forEach(link => {
    link.addEventListener('click', (e) => {
      viewUserProfile(e.target.dataset.username);
    });
  });
  
  // Add kick handlers
  membersList.querySelectorAll('[data-kick]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const member = e.target.dataset.kick;
      if (confirm(`Kick ${member} from the group?`)) {
        await kickGroupMember(activeGroup, member);
      }
    });
  });
  
  // Show modal
  $("#groupInfoModal").hidden = false;
});

// Close group info modal
$("#groupInfoClose")?.addEventListener("click", () => {
  $("#groupInfoModal").hidden = true;
});

// Save group name
$("#saveGroupName")?.addEventListener("click", async () => {
  if (!activeGroup || !supabase) return;
  
  const newName = $("#groupNameEdit").value.trim();
  if (!newName) {
    showToast("Group name cannot be empty", 'error');
    return;
  }
  
  const group = groups.find(g => g.id === activeGroup);
  if (!group) return;
  
  // Only creator can rename
  if (group.created_by !== currentUser) {
    showToast("Only the group creator can change the name", 'error');
    return;
  }
  
  try {
    const { error } = await supabase
      .from('groups')
      .update({ name: newName })
      .eq('id', activeGroup);
    
    if (error) {
      console.error('Failed to update group name:', error);
      showToast('Failed to update group name', 'error');
      return;
    }
    
    // Update local
    group.name = newName;
    showToast(`Group renamed to "${newName}"`, 'success');
    renderGroups();
    renderGroupMessages();
    $("#groupInfoTitle").textContent = `${newName} Settings`;
  } catch (e) {
    console.error('Error updating group name:', e);
    showToast('Error updating group name', 'error');
  }
});

// Leave group button
$("#leaveGroupBtn")?.addEventListener("click", async () => {
  if (!activeGroup) return;
  
  const group = groups.find(g => g.id === activeGroup);
  if (!group) return;
  
  if (confirm(`Leave ${group.name}?`)) {
    await leaveGroup(activeGroup);
    $("#groupInfoModal").hidden = true;
  }
});

// Kick member from group
async function kickGroupMember(groupId, username) {
  if (!supabase || !currentUser) return;
  
  const group = groups.find(g => g.id === groupId);
  if (!group) return;
  
  // Only creator can kick
  if (group.created_by !== currentUser) {
    showToast("Only the group creator can kick members", 'error');
    return;
  }
  
  try {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('username', username);
    
    if (error) {
      console.error('Failed to kick member:', error);
      showToast('Failed to kick member', 'error');
      return;
    }
    
    // Update local
    group.members = group.members.filter(m => m !== username);
    showToast(`${username} has been removed from the group`, 'success');
    
    // Refresh group info modal
    $('#groupInfoBtn')?.click();
    renderGroups();
  } catch (e) {
    console.error('Error kicking member:', e);
    showToast('Error kicking member', 'error');
  }
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
      currentUser = null;
      showAuth();
    }
  });
}

// ===== WIKI FEATURES =====

// Favorites
const favKey = (o, t) => `${t}:${o.name}`;
let favorites = [];

async function loadFavorites() {
  if (!currentUser) return;
  
  try {
    // Load from localStorage
    const storageKey = `favorites_${currentUser}`;
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      const favData = JSON.parse(stored);
      favorites = favData.map(f => ({
        key: f.key,
        type: f.type,
        data: findItemByName(f.name, f.type)
      })).filter(f => f.data); // Filter out items that no longer exist
    }
    
    if (!$("#favorites").hidden) renderFavorites();
  } catch (e) {
    console.error('Error loading favorites:', e);
  }
}

function findItemByName(name, type) {
  if (type === 'item') return DB.items.find(i => i.name === name);
  if (type === 'armor') return DB.armor.find(a => a.name === name);
  if (type === 'enemy') return DB.enemies.find(e => e.name === name);
  return null;
}

function isFav(o, t) {
  return favorites.some((x) => x.key === favKey(o, t));
}

async function toggleFav(o, t, btn) {
  if (!currentUser) {
    showToast('Please log in to save favorites', 'error');
    return;
  }
  
  const key = favKey(o, t);
  const isCurrentlyFav = isFav(o, t);
  
  if (isCurrentlyFav) {
    // Remove favorite
    favorites = favorites.filter((x) => x.key !== key);
    btn?.classList.remove("fav");
    saveFavoritesToStorage();
    showToast(`Removed from favorites`, 'info');
  } else {
    // Add favorite
    favorites.unshift({ key, type: t, data: o });
    btn?.classList.add("fav");
    saveFavoritesToStorage();
    showToast(`Added to favorites`, 'success');
  }
  
  if (!$("#favorites").hidden) renderFavorites();
}

// Save favorites to localStorage
function saveFavoritesToStorage() {
  if (!currentUser) return;
  const storageKey = `favorites_${currentUser}`;
  const favData = favorites.map(f => ({
    key: f.key,
    type: f.type,
    name: f.data.name
  }));
  localStorage.setItem(storageKey, JSON.stringify(favData));
}

// Card rendering
const rarityClass = (r) => `rarity-${(r || "common").toLowerCase()}`;

function createCard(obj, type) {
  const d = document.createElement("div");
  d.className = `card icon ${rarityClass(obj.rarity)}`;
  d.tabIndex = 0;
  const hasIcon = !!(obj.icon && obj.icon.trim());
  const canCompare = type === 'item' || type === 'armor';
  
  // Build quick-view stats based on type
  let quickStats = '';
  if (type === 'item') {
    const stats = [];
    if (obj.dps) stats.push(`⚔️ ${obj.dps} DPS`);
    if (obj.levelReq) stats.push(`Lv${obj.levelReq}`);
    quickStats = stats.join(' • ');
  } else if (type === 'armor') {
    const stats = [];
    if (obj.hp) stats.push(`❤️ ${obj.hp} HP`);
    if (obj.defense) stats.push(`🛡️ ${obj.defense} DEF`);
    if (obj.levelReq) stats.push(`Lv${obj.levelReq}`);
    quickStats = stats.join(' • ');
  } else if (type === 'enemy') {
    const stats = [];
    if (obj.hp) stats.push(`❤️ ${obj.hp} HP`);
    if (obj.exp) stats.push(`✨ ${obj.exp} EXP`);
    quickStats = stats.join(' • ');
  }
  
  d.innerHTML = `
    <div class="thumb ${hasIcon ? "" : "placeholder"}">${hasIcon ? `<img loading="lazy" alt="${obj.name}" src="${obj.icon}">` : ""}</div>
    <div class="card-content">
      <div class="card-header">
        <strong class="card-title">${obj.name}</strong>
        <div class="quick-actions">
          <button class="action-btn ${isFav(obj, type) ? "fav" : ""}" title="Favorite" data-act="fav">⭐</button>
          ${canCompare ? '<button class="action-btn" title="Add to Compare" data-act="compare">⚖️</button>' : ''}
        </div>
      </div>
      <div class="card-stats">${quickStats || '—'}</div>
      <div class="card-source">${obj.source || obj.floor || '—'}</div>
    </div>`;
  d.addEventListener("click", (e) => {
    if (e.target.closest(".action-btn")) return;
    openSheet(obj, type);
  });
  d.querySelector('[data-act="fav"]').addEventListener("click", async (e) => {
    e.stopPropagation();
    await toggleFav(obj, type, e.currentTarget);
  });
  const compareBtn = d.querySelector('[data-act="compare"]');
  if (compareBtn) {
    compareBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addToCompare(obj, type);
    });
  }
  return d;
}

// Filters
const floorMatches = (o, w) => (w === "all" ? true : (o.floor || "") === w || (o.source || "").toUpperCase().includes(`(${w})`));
const rarityMatches = (o, r) => (r === "all" ? true : (o.rarity || "").toLowerCase() === r.toLowerCase());

// Render
function render() {
  const q = ($("#q")?.value || "").toLowerCase().trim();

  // ALL
  const fAll = $(".floor[data-for=\"all\"]")?.value || "all";
  const tAll = $(".all-type[data-for=\"all\"]")?.value || "all";
  const rAll = $(".rarity[data-for=\"all\"]")?.value || "all";
  let all = [
    ...DB.items.map((x) => ({ ...x, __type: "item" })),
    ...DB.armor.map((x) => ({ ...x, __type: "armor" })),
  ];
  all = all.filter((x) => {
    const hay = [x.name, x.source, x.rarity, x.summary, (x.droppedBy || []).join(",")].join(" ").toLowerCase();
    const typeOk = tAll === "all" || x.__type === tAll;
    return (!q || hay.includes(q)) && floorMatches(x, fAll) && rarityMatches(x, rAll) && typeOk;
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
  const rArmor = $(".rarity[data-for=\"armor\"]")?.value || "all";
  const armor = DB.armor.filter((x) => {
    const hay = [x.name, x.source, x.rarity, x.summary, (x.droppedBy || []).join(",")].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && floorMatches(x, fArmor) && rarityMatches(x, rArmor);
  });
  const ag = $("#armorGrid");
  const aEmpty = $("#armorEmpty");
  if (ag) {
    ag.innerHTML = "";
    armor.forEach((o) => ag.append(createCard(o, "armor")));
    aEmpty.hidden = armor.length > 0;
  }

  // ENEMIES
  const fEnemies = $(".floor[data-for=\"enemies\"]")?.value || "all";
  const tEnemies = $(".type[data-for=\"enemies\"]")?.value || "all";
  const enemies = DB.enemies.filter((x) => {
    const hay = [x.name, (x.loot || []).join(","), x.floor, x.type, x.summary, (x.materials || []).join(",")].join(" ").toLowerCase();
    const typeOk = tEnemies === "all" || x.type === tEnemies;
    return (!q || hay.includes(q)) && floorMatches(x, fEnemies) && typeOk;
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
  render();
});

$$("select").forEach((sel) => sel.addEventListener("change", render));

// Navigation
$$("nav").forEach((nav) => {
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    $$("nav a").forEach((x) => x.classList.remove("active"));
    a.classList.add("active");
    const page = a.dataset.page;
    $$("#page > div").forEach((div) => (div.hidden = div.id !== page));
    history.replaceState(null, "", "#" + page);
    if (page === "favorites") renderFavorites();
    if (page === "profile") loadProfileData();
    if (page === "notifications") renderNotifications();
    if (page === "compare") renderComparison();
    if (page === "archive") loadArchivedSubmissions();
    render();
  });
});

// Load profile data
function loadProfileData() {
  const profileUsername = $("#profileUsername");
  if (profileUsername && currentUser) {
    profileUsername.value = currentUser;
  }
  
  // Load profile data from Supabase
  if (supabase && currentUser) {
    supabase
      .from("profiles")
      .select("equipped_chestplate, equipped_sword")
      .eq("username", currentUser)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const chestplateSelect = $("#profileChestplate");
          const swordSelect = $("#profileSword");
          
          if (chestplateSelect) chestplateSelect.value = data.equipped_chestplate || "";
          if (swordSelect) swordSelect.value = data.equipped_sword || "";
        }
      });
  }
}

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

// ===== LIST/GRID VIEW TOGGLE =====
$$(".btn.view").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const target = e.currentTarget;
    const view = target.dataset.view; // "grid" or "list"
    const forSection = target.dataset.for; // "all", "items", "armor", "enemies"
    
    // Update button states
    $$(`[data-for="${forSection}"].btn.view`).forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.view === view ? "true" : "false");
    });
    
    // Update section class
    const section = $(`#${forSection}`);
    if (section) {
      if (view === "list") {
        section.classList.add("list");
      } else {
        section.classList.remove("list");
      }
    }
  });
});

// ===== FRIENDS FUNCTIONALITY =====
let friendRequests = { incoming: [], outgoing: [] };
let friends = [];
let blockedUsers = [];

async function loadFriends() {
  if (!currentUser || !supabase) return;
  
  try {
    // Load all friend relationships
    const { data, error } = await supabase
      .from('friends')
      .select('*')
      .or(`user1.eq.${currentUser},user2.eq.${currentUser}`);
    
    if (error) {
      console.error('Failed to load friends:', error);
      return;
    }
    
    // Reset arrays
    friends = [];
    friendRequests.incoming = [];
    friendRequests.outgoing = [];
    blockedUsers = [];
    
    // Process each relationship
    (data || []).forEach(rel => {
      const otherUser = rel.user1 === currentUser ? rel.user2 : rel.user1;
      
      if (rel.status === 'accepted') {
        friends.push({ username: otherUser, online: onlineUsers.has(otherUser) });
      } else if (rel.status === 'pending') {
        if (rel.requested_by === currentUser) {
          friendRequests.outgoing.push({ username: otherUser });
        } else {
          friendRequests.incoming.push({ username: otherUser });
        }
      } else if (rel.status === 'blocked') {
        if (rel.requested_by === currentUser) {
          blockedUsers.push(otherUser);
        }
      }
    });
    
    renderFriends();
  } catch (e) {
    console.error('Error loading friends:', e);
  }
}

function renderFriends() {
  const incomingEl = $("#incoming");
  const outgoingEl = $("#outgoing");
  const friendsListEl = $("#friendsList");
  const emptyEl = $("#friendsEmpty");
  
  if (incomingEl) {
    incomingEl.innerHTML = friendRequests.incoming.length === 0
      ? '<div class="small" style="padding:10px">No incoming requests</div>'
      : friendRequests.incoming.map(req => `
          <div class="request">
            <span class="username-link" data-username="${req.username}" style="cursor:pointer;color:var(--accent);font-weight:600;">${req.username}</span>
            <div style="margin-left:auto;display:flex;gap:6px">
              <button class="btn" data-accept="${req.username}">Accept</button>
              <button class="btn ghost" data-reject="${req.username}">Decline</button>
            </div>
          </div>
        `).join("");
        
    // Add username click handlers
    incomingEl.querySelectorAll('.username-link').forEach(link => {
      link.addEventListener('click', (e) => {
        viewUserProfile(e.target.dataset.username);
      });
    });
  }
  
  if (outgoingEl) {
    outgoingEl.innerHTML = friendRequests.outgoing.length === 0
      ? '<div class="small" style="padding:10px">No outgoing requests</div>'
      : friendRequests.outgoing.map(req => `
          <div class="request">
            <span class="username-link" data-username="${req.username}" style="cursor:pointer;color:var(--accent);font-weight:600;">${req.username}</span>
            <div style="margin-left:auto">
              <button class="btn ghost" data-cancel="${req.username}">Cancel</button>
            </div>
          </div>
        `).join("");
        
    // Add username click handlers
    outgoingEl.querySelectorAll('.username-link').forEach(link => {
      link.addEventListener('click', (e) => {
        viewUserProfile(e.target.dataset.username);
      });
    });
  }
  
  if (friendsListEl && emptyEl) {
    if (friends.length === 0) {
      friendsListEl.innerHTML = "";
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      friendsListEl.innerHTML = friends.map(f => `
        <div class="friend">
          <div>
            <div class="username-link" data-username="${f.username}" style="cursor:pointer;color:var(--accent);font-weight:600;">${f.username}</div>
            <div class="small">${f.online ? '🟢 Online' : '⚫ Offline'}</div>
          </div>
          <div class="friend-actions" style="margin-left:auto;display:flex;gap:6px">
            <button class="btn ghost" data-message="${f.username}">💬</button>
            <button class="btn ghost" data-unfriend="${f.username}">Unfriend</button>
            <button class="btn ghost" style="color:#dc2626" data-block="${f.username}">Block</button>
          </div>
        </div>
      `).join("");
      
      // Wire up username clicks
      friendsListEl.querySelectorAll('.username-link').forEach(link => {
        link.addEventListener('click', (e) => {
          viewUserProfile(e.target.dataset.username);
        });
      });
      
      // Wire up message buttons
      friendsListEl.querySelectorAll('[data-message]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const username = e.target.dataset.message;
          const messagesLink = document.querySelector('a[data-page="messages"]');
          messagesLink?.click();
          openChat(username);
        });
      });
      
      // Wire up unfriend/block buttons
      friendsListEl.querySelectorAll('[data-unfriend]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const username = e.target.dataset.unfriend;
          if (confirm(`Remove ${username} from friends?`)) {
            unfriend(username);
          }
        });
      });
      
      friendsListEl.querySelectorAll('[data-block]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const username = e.target.dataset.block;
          if (confirm(`Block ${username}? They won't be able to send you messages or friend requests.`)) {
            blockUser(username);
          }
        });
      });
    }
  }
  
  // Render blocked users
  const blockedListEl = $("#blockedList");
  const blockedEmptyEl = $("#blockedEmpty");
  
  if (blockedListEl && blockedEmptyEl) {
    if (blockedUsers.length === 0) {
      blockedListEl.innerHTML = "";
      blockedEmptyEl.hidden = false;
    } else {
      blockedEmptyEl.hidden = true;
      blockedListEl.innerHTML = blockedUsers.map(username => `
        <div class="friend">
          <span class="username-link" data-username="${username}" style="cursor:pointer;color:var(--accent);font-weight:600;">${username}</span>
          <button class="btn ghost" style="margin-left:auto" data-unblock="${username}">Unblock</button>
        </div>
      `).join("");
      
      // Wire up username clicks
      blockedListEl.querySelectorAll('.username-link').forEach(link => {
        link.addEventListener('click', (e) => {
          viewUserProfile(e.target.dataset.username);
        });
      });
      
      // Wire up unblock buttons
      blockedListEl.querySelectorAll('[data-unblock]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const username = e.target.dataset.unblock;
          if (confirm(`Unblock ${username}?`)) {
            unblockUser(username);
          }
        });
      });
    }
  }
}

async function unfriend(username) {
  const [user1, user2] = [currentUser, username].sort();
  
  // Delete the friendship
  const { error } = await supabase
    .from('friends')
    .delete()
    .eq('user1', user1)
    .eq('user2', user2);
  
  if (error) {
    console.error('Failed to unfriend:', error);
    showToast('Failed to unfriend user', 'error');
    return;
  }
  
  friends = friends.filter(f => f.username !== username);
  renderFriends();
  showToast(`Removed ${username} from friends`, 'success');
  addNotification('Friend Removed', `You unfriended ${username}`, '👋', 'info');
}

async function blockUser(username) {
  const [user1, user2] = [currentUser, username].sort();
  
  // Update or insert blocked status
  const { error } = await supabase
    .from('friends')
    .upsert({
      user1,
      user2,
      status: 'blocked',
      requested_by: currentUser
    }, {
      onConflict: 'user1,user2'
    });
  
  if (error) {
    console.error('Failed to block user:', error);
    showToast('Failed to block user', 'error');
    return;
  }
  
  // Remove from friends if they were friends
  friends = friends.filter(f => f.username !== username);
  
  // Add to blocked list
  if (!blockedUsers.includes(username)) {
    blockedUsers.push(username);
  }
  
  renderFriends();
  showToast(`Blocked ${username}`, 'success');
  addNotification('User Blocked', `You blocked ${username}`, '🚫', 'info');
}

async function unblockUser(username) {
  const [user1, user2] = [currentUser, username].sort();
  
  // Delete the block
  const { error } = await supabase
    .from('friends')
    .delete()
    .eq('user1', user1)
    .eq('user2', user2);
  
  if (error) {
    console.error('Failed to unblock user:', error);
    showToast('Failed to unblock user', 'error');
    return;
  }
  
  blockedUsers = blockedUsers.filter(u => u !== username);
  renderFriends();
  showToast(`Unblocked ${username}`, 'success');
}

$("#addFriendBtn")?.addEventListener("click", async () => {
  const input = $("#friendName");
  const username = input?.value.trim().toLowerCase();
  if (!username) return;
  
  if (username === currentUser) {
    showToast("You can't add yourself!", 'error');
    return;
  }
  
  if (friends.some(f => f.username === username)) {
    showToast("Already friends!", 'info');
    return;
  }
  
  if (friendRequests.outgoing.some(r => r.username === username)) {
    showToast("Request already sent!", 'info');
    return;
  }
  
  if (!supabase) {
    showToast("Database not connected", 'error');
    return;
  }
  
  // Check if user exists
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .single();
  
  if (profileError || !profileData) {
    showToast(`User "${username}" not found`, 'error');
    return;
  }
  
  // Create alphabetically sorted relationship
  const [user1, user2] = [currentUser, username].sort();
  
  // Insert friend request
  const { error } = await supabase
    .from('friends')
    .insert([{
      user1,
      user2,
      status: 'pending',
      requested_by: currentUser
    }]);
  
  if (error) {
    console.error('Failed to send friend request:', error);
    showToast('Failed to send friend request', 'error');
    return;
  }
  
  friendRequests.outgoing.push({ username });
  input.value = "";
  renderFriends();
  showToast(`Friend request sent to ${username}!`, 'success');
});

// Delegate friend actions
$("#friends")?.addEventListener("click", async (e) => {
  const target = e.target;
  if (target.dataset.accept) {
    const user = target.dataset.accept;
    const [user1, user2] = [currentUser, user].sort();
    
    // Update status to accepted
    const { error } = await supabase
      .from('friends')
      .update({ status: 'accepted' })
      .eq('user1', user1)
      .eq('user2', user2);
    
    if (error) {
      console.error('Failed to accept friend request:', error);
      showToast('Failed to accept request', 'error');
      return;
    }
    
    friendRequests.incoming = friendRequests.incoming.filter(r => r.username !== user);
    friends.push({ username: user, online: onlineUsers.has(user) });
    renderFriends();
    showToast(`You are now friends with ${user}!`, 'success');
    
  } else if (target.dataset.reject) {
    const user = target.dataset.reject;
    const [user1, user2] = [currentUser, user].sort();
    
    // Delete the friend request
    const { error } = await supabase
      .from('friends')
      .delete()
      .eq('user1', user1)
      .eq('user2', user2);
    
    if (error) {
      console.error('Failed to reject friend request:', error);
      showToast('Failed to reject request', 'error');
      return;
    }
    
    friendRequests.incoming = friendRequests.incoming.filter(r => r.username !== user);
    renderFriends();
    showToast(`Declined friend request from ${user}`, 'info');
    
  } else if (target.dataset.cancel) {
    const user = target.dataset.cancel;
    const [user1, user2] = [currentUser, user].sort();
    
    // Delete the outgoing request
    const { error } = await supabase
      .from('friends')
      .delete()
      .eq('user1', user1)
      .eq('user2', user2);
    
    if (error) {
      console.error('Failed to cancel friend request:', error);
      showToast('Failed to cancel request', 'error');
      return;
    }
    
    friendRequests.outgoing = friendRequests.outgoing.filter(r => r.username !== user);
    renderFriends();
    showToast(`Cancelled friend request to ${user}`, 'info');
  }
});

// ===== MESSAGES FUNCTIONALITY =====
let conversations = [];
let activeChat = null;
let messages = [];
let messageOffset = 0;
let loadingMessages = false;
let hasMoreMessages = true;

// Build conversations list from messages
function buildConversations() {
  const convMap = new Map();
  
  messages.forEach(msg => {
    const partner = msg.with;
    if (!convMap.has(partner)) {
      convMap.set(partner, {
        username: partner,
        lastMessage: msg.text,
        timestamp: msg.timestamp,
        unread: msg.from !== currentUser && !msg.read ? 1 : 0
      });
    } else {
      const conv = convMap.get(partner);
      if (msg.timestamp > conv.timestamp) {
        conv.lastMessage = msg.text;
        conv.timestamp = msg.timestamp;
      }
      if (msg.from !== currentUser && !msg.read) {
        conv.unread++;
      }
    }
  });
  
  conversations = Array.from(convMap.values())
    .sort((a, b) => b.timestamp - a.timestamp);
  
  renderConversations();
}

function renderConversations() {
  const list = $("#conversationsList");
  if (!list) return;
  
  if (conversations.length === 0) {
    list.innerHTML = '<div class="empty" style="padding:12px;">No conversations yet. Message a friend to start!</div>';
    return;
  }
  
  list.innerHTML = conversations.map(conv => `
    <div class="conversation-item ${activeChat === conv.username ? 'active' : ''}" data-username="${conv.username}">
      <div class="conversation-avatar">👤</div>
      <div class="conversation-info">
        <div class="conversation-name">${conv.username}</div>
        <div class="conversation-preview">${conv.lastMessage}</div>
      </div>
      ${conv.unread > 0 ? `<span class="conversation-unread">${conv.unread}</span>` : ''}
    </div>
  `).join('');
  
  // Add click handlers
  list.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const username = e.currentTarget.dataset.username;
      openChat(username);
    });
  });
}

async function loadMessages(reset = false) {
  if (!currentUser || !supabase) return;
  
  if (reset) {
    messageOffset = 0;
    hasMoreMessages = true;
    messages = [];
  }
  
  if (loadingMessages || !hasMoreMessages) return;
  loadingMessages = true;
  
  try {
    // Load messages in batches of 50
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`from_user.eq.${currentUser},to_user.eq.${currentUser}`)
      .order('created_at', { ascending: false })
      .range(messageOffset, messageOffset + 49);
    
    if (error) {
      console.error('Failed to load messages:', error);
      loadingMessages = false;
      return;
    }
    
    if (!data || data.length === 0) {
      hasMoreMessages = false;
      loadingMessages = false;
      return;
    }
    
    if (data.length < 50) {
      hasMoreMessages = false;
    }
    
    // Convert database format to app format
    const newMessages = data.map(m => ({
      id: m.id,
      from: m.from_user,
      to: m.to_user,
      with: m.from_user === currentUser ? m.to_user : m.from_user,
      text: m.text,
      timestamp: new Date(m.created_at).getTime(),
      read: m.read,
      reactions: m.reactions || {}
    })).reverse(); // Reverse to get chronological order
    
    if (reset) {
      messages = newMessages;
    } else {
      messages = [...newMessages, ...messages];
    }
    
    messageOffset += data.length;
    loadingMessages = false;
    renderMessages(reset);
    buildConversations();
  } catch (e) {
    console.error('Error loading messages:', e);
    loadingMessages = false;
  }
}

function renderMessages(shouldScrollToBottom = true) {
  const chatWith = $("#chatWith");
  const chatLog = $("#chatLog");
  
  if (!activeChat) {
    if (chatWith) chatWith.textContent = "No conversation selected";
    if (chatLog) chatLog.innerHTML = "";
    return;
  }
  
  if (chatWith) chatWith.textContent = `Chat with ${activeChat}`;
  if (chatLog) {
    const scrollHeight = chatLog.scrollHeight;
    const scrollTop = chatLog.scrollTop;
    const wasAtBottom = scrollHeight - scrollTop - chatLog.clientHeight < 50;
    
    chatLog.innerHTML = messages
      .filter(m => m.with === activeChat)
      .map(m => {
        const reactionsHtml = m.reactions && Object.keys(m.reactions).length > 0 
          ? `<div class="msg-reactions">
               ${Object.entries(m.reactions).map(([emoji, users]) => {
                 const isActive = users.includes(currentUser);
                 return `<div class="reaction ${isActive ? 'active' : ''}" data-msg-id="${m.id}" data-emoji="${emoji}">
                   <span class="reaction-emoji">${emoji}</span>
                   <span class="reaction-count ${isActive ? 'active' : ''}">${users.length}</span>
                 </div>`;
               }).join('')}
             </div>`
          : '';
        
        return `
          <div class="msg ${m.from === currentUser ? 'me' : ''}">
            <div class="bubble">
              <button class="bubble-react-btn" data-msg-id="${m.id}">😀</button>
              ${m.text}
              ${m.from === currentUser ? `<span class="read-receipt">${m.read ? '✓✓' : '✓'}</span>` : ''}
            </div>
            ${reactionsHtml}
          </div>
        `;
      }).join("");
    
    // Add reaction button listeners
    chatLog.querySelectorAll('.bubble-react-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const msgId = parseInt(btn.dataset.msgId);
        openReactionPicker(msgId);
      });
    });
    
    // Add reaction click listeners (toggle reaction)
    chatLog.querySelectorAll('.reaction').forEach(reaction => {
      reaction.addEventListener('click', () => {
        const msgId = parseInt(reaction.dataset.msgId);
        const emoji = reaction.dataset.emoji;
        addReaction(msgId, emoji);
      });
    });
    
    // Scroll to bottom on new messages or if user was at bottom
    if (shouldScrollToBottom || wasAtBottom) {
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }
}

// Infinite scroll handler for chat log
$("#chatLog")?.addEventListener('scroll', async (e) => {
  const chatLog = e.target;
  
  // Load more messages when scrolled to top
  if (chatLog.scrollTop < 100 && !loadingMessages && hasMoreMessages && activeChat) {
    const oldHeight = chatLog.scrollHeight;
    await loadMessages(false);
    
    // Maintain scroll position after loading older messages
    requestAnimationFrame(() => {
      chatLog.scrollTop = chatLog.scrollHeight - oldHeight;
    });
  }
});

$("#chatSend")?.addEventListener("click", async () => {
  const input = $("#chatText");
  const text = input?.value.trim();
  if (!text || !activeChat) return;
  
  if (!supabase) {
    showToast('Database not connected', 'error');
    return;
  }
  
  try {
    // Save message to database
    const { data: messageData, error } = await supabase
      .from('direct_messages')
      .insert([{
        from_user: currentUser,
        to_user: activeChat,
        text,
        read: false,
        reactions: {}
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Failed to send message:', error);
      showToast('Failed to send message', 'error');
      return;
    }
    
    // Add to local messages
    const message = {
      id: messageData.id,
      from: currentUser,
      to: activeChat,
      with: activeChat,
      text,
      timestamp: new Date(messageData.created_at).getTime(),
      read: false,
      reactions: {}
    };
    
    messages.push(message);
    input.value = "";
    renderMessages();
    buildConversations();
    
    // Send via Supabase Realtime
    if (messagesChannel) {
      await messagesChannel.send({
        type: 'broadcast',
        event: 'message',
        payload: message
      });
    }
    
    // Stop typing indicator
    sendTypingIndicator(false);
  } catch (e) {
    console.error('Error sending message:', e);
    showToast('Failed to send message', 'error');
  }
});

$("#chatText")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    $("#chatSend")?.click();
  }
});

// Send typing indicator
$("#chatText")?.addEventListener("input", () => {
  if (!activeChat || !messagesChannel) return;
  
  sendTypingIndicator(true);
  
  // Clear existing timeout
  if (typingTimeout) clearTimeout(typingTimeout);
  
  // Auto-stop typing after 2 seconds of no input
  typingTimeout = setTimeout(() => {
    sendTypingIndicator(false);
  }, 2000);
});

async function sendTypingIndicator(isTyping) {
  if (!activeChat || !messagesChannel) return;
  
  await messagesChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: {
      from: currentUser,
      to: activeChat,
      typing: isTyping
    }
  });
}

// Send read receipt when opening a chat
function openChat(username) {
  activeChat = username;
  
  // Reset pagination and reload messages for this chat
  messageOffset = 0;
  hasMoreMessages = true;
  loadMessages(true);
  
  // Send read receipt
  if (messagesChannel) {
    messagesChannel.send({
      type: 'broadcast',
      event: 'read',
      payload: {
        from: currentUser,
        to: username
      }
    });
  }
}

// ===== PROFILE FUNCTIONALITY =====
let userProfile = { display_name: "", bio: "" };

async function loadProfile() {
  if (!currentUser || !supabase) return;
  
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", currentUser)
      .single();
    
    if (!error && data) {
      userProfile = data;
      const displayInput = $("#profileDisplayName");
      const bioInput = $("#profileBio");
      if (displayInput) displayInput.value = data.display_name || currentUser;
      if (bioInput) bioInput.value = data.bio || "";
    }
  } catch (e) {
    console.warn("Profile load error:", e);
  }
}

// View other user's profile
async function viewUserProfile(username) {
  if (!supabase || !username) return;
  
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .single();
    
    if (error || !data) {
      showToast(`Could not load profile for ${username}`, 'error');
      return;
    }
    
    // Populate profile viewer modal
    $("#profileViewerTitle").textContent = `${username}'s Profile`;
    $("#profileViewerUsername").textContent = username;
    $("#profileViewerSword").textContent = data.equipped_sword || "None";
    $("#profileViewerChestplate").textContent = data.equipped_chestplate || "None";
    
    // Show/hide friend button based on relationship
    const friendBtn = $("#profileViewerFriend");
    const isFriend = friends.some(f => f.username === username);
    const hasPendingRequest = friends.some(f => f.username === username && f.status === 'pending');
    
    if (isFriend) {
      friendBtn.textContent = "✓ Friends";
      friendBtn.disabled = true;
      friendBtn.style.opacity = "0.5";
    } else if (hasPendingRequest) {
      friendBtn.textContent = "⏳ Request Sent";
      friendBtn.disabled = true;
      friendBtn.style.opacity = "0.5";
    } else {
      friendBtn.textContent = "👥 Add Friend";
      friendBtn.disabled = false;
      friendBtn.style.opacity = "1";
      friendBtn.onclick = async () => {
        await addFriendRequest(username);
        friendBtn.textContent = "⏳ Request Sent";
        friendBtn.disabled = true;
      };
    }
    
    // Message button
    $("#profileViewerMessage").onclick = () => {
      // Close modal and switch to messages page
      $("#profileViewerModal").hidden = true;
      const messagesLink = document.querySelector('a[data-page="messages"]');
      messagesLink?.click();
      
      // Open chat with this user
      openChat(username);
    };
    
    // Show modal
    $("#profileViewerModal").hidden = false;
  } catch (e) {
    console.error("Error viewing profile:", e);
    showToast("Error loading profile", 'error');
  }
}

// Close profile viewer
$("#profileViewerClose")?.addEventListener("click", () => {
  $("#profileViewerModal").hidden = true;
});

// Helper to add friend request from profile viewer
async function addFriendRequest(username) {
  if (!supabase || !currentUser) return;
  
  try {
    // Check if user exists
    const { data: userData, error: userError } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", username)
      .single();
    
    if (userError || !userData) {
      showToast("User not found", 'error');
      return;
    }
    
    // Add friend request
    const [user1, user2] = [currentUser, username].sort();
    const { error } = await supabase
      .from("friends")
      .insert([{ user1, user2, status: 'pending', requested_by: currentUser }]);
    
    if (error) {
      showToast("Failed to send friend request", 'error');
    } else {
      showToast(`Friend request sent to ${username}!`, 'success');
      await loadFriends();
    }
  } catch (e) {
    console.error("Error adding friend:", e);
    showToast("Error sending friend request", 'error');
  }
}

$("#updateProfileBtn")?.addEventListener("click", async () => {
  if (!currentUser || !supabase) return;
  
  const chestplate = $("#profileChestplate")?.value;
  const sword = $("#profileSword")?.value;
  
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ 
        equipped_chestplate: chestplate,
        equipped_sword: sword
      })
      .eq("username", currentUser);
    
    if (error) {
      showToast("Failed to update profile: " + error.message, 'error');
    } else {
      showToast("Profile updated successfully!", 'success');
      userProfile = { equipped_chestplate: chestplate, equipped_sword: sword };
    }
  } catch (e) {
    console.error("Profile update error:", e);
    showToast("Error updating profile", 'error');
  }
});

// Enable browser notifications button
$("#enableBrowserNotifs")?.addEventListener("click", async () => {
  await requestNotificationPermission();
});

// Load social data when navigating to those pages
$("#nav")?.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link) return;
  const page = link.dataset.page;
  
  if (page === "friends") loadFriends();
  else if (page === "messages") loadMessages();
  else if (page === "profile") loadProfile();
});

// ===== DPS CALCULATOR =====
let savedBuilds = [];

// Populate weapon dropdown from database
function populateDpsWeapons() {
  const select = $("#dpsWeapon");
  if (!select) return;
  
  const weapons = DB.items.filter(item => item.dps && item.dps > 0);
  
  select.innerHTML = '<option value="">Choose a weapon...</option>' +
    weapons.map(weapon => 
      `<option value="${weapon.dps}">${weapon.name} (${weapon.dps} DPS)</option>`
    ).join('');
}

// Update base DPS when weapon is selected
$("#dpsWeapon")?.addEventListener("change", (e) => {
  const baseDps = parseFloat(e.target.value) || 0;
  $("#dpsBase").value = baseDps;
  calculateDps();
});

// Recalculate when enchant changes
$("#dpsEnchant")?.addEventListener("change", calculateDps);

function calculateDps() {
  const base = parseFloat($("#dpsBase")?.value) || 0;
  const enchantMultiplier = parseFloat($("#dpsEnchant")?.value) || 1;
  
  const total = Math.round(base * enchantMultiplier * 10) / 10;
  
  const totalEl = $("#dpsTotal");
  if (totalEl) {
    totalEl.textContent = total;
    totalEl.classList.add("updated");
    setTimeout(() => totalEl.classList.remove("updated"), 500);
  }
  
  const breakdown = $("#dpsBreakdown");
  if (breakdown && base > 0) {
    const enchantName = $("#dpsEnchant")?.options[$("#dpsEnchant").selectedIndex]?.text || "None";
    breakdown.textContent = enchantMultiplier > 1
      ? `${base} base × ${enchantMultiplier} (${enchantName}) = ${total}`
      : `${base} base (no enchant)`;
  } else if (breakdown) {
    breakdown.textContent = "";
  }
}

$("#clearDps")?.addEventListener("click", () => {
  $("#dpsWeapon").value = "";
  $("#dpsBase").value = "";
  $("#dpsEnchant").value = "1";
  $("#dpsTotal").textContent = "0";
  $("#dpsBreakdown").textContent = "";
});

$("#saveDpsBuild")?.addEventListener("click", () => {
  const weaponSelect = $("#dpsWeapon");
  const weaponName = weaponSelect?.options[weaponSelect.selectedIndex]?.text || "Unknown";
  const base = parseFloat($("#dpsBase")?.value) || 0;
  const total = parseFloat($("#dpsTotal")?.textContent) || 0;
  
  if (base === 0) {
    showToast("Select a weapon first!", "error");
    return;
  }
  
  const enchantName = $("#dpsEnchant")?.options[$("#dpsEnchant").selectedIndex]?.text || "None";
  
  const build = {
    id: Date.now(),
    weapon: weaponName,
    base,
    enchant: enchantName !== "None" ? enchantName : null,
    total,
    date: new Date().toLocaleDateString()
  };
  
  savedBuilds.unshift(build);
  renderSavedBuilds();
  showToast(`Build saved: ${total} DPS!`, "success");
});

function renderSavedBuilds() {
  const container = $("#savedBuilds");
  if (!container) return;
  
  if (savedBuilds.length === 0) {
    container.innerHTML = '<div class="empty">No saved builds yet. Create and save a build above!</div>';
    return;
  }
  
  container.innerHTML = savedBuilds.map(build => `
    <div class="saved-build">
      <div class="build-info">
        <div class="build-name">${build.weapon}</div>
        <div class="build-details">
          ${build.enchant ? build.enchant : "No enchant"} • ${build.date}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="build-dps">${build.total}</div>
        <button class="btn ghost" onclick="deleteBuild(${build.id})" style="padding:6px 10px;">🗑️</button>
      </div>
    </div>
  `).join("");
}

function deleteBuild(id) {
  savedBuilds = savedBuilds.filter(b => b.id !== id);
  renderSavedBuilds();
  showToast("Build deleted", "info");
}

// ===== WIKI CONTRIBUTIONS =====
let mySubmissions = [];
let pendingSubmissions = [];

function mapContributionRow(row) {
  return {
    id: row.id,
    type: row.contribution_type,
    name: row.item_name,
    rarity: row.rarity,
    icon: row.icon,
    source: row.source,
    floor: row.floor,
    summary: row.summary,
    dps: row.dps,
    levelReq: row.level_req,
    droppedBy: row.dropped_by || [],
    hp: row.hp,
    defense: row.defense,
    slot: row.slot,
    enemyType: row.enemy_type,
    loot: row.loot || [],
    materials: row.materials || [],
    exp: row.exp,
    money: row.money,
    submittedBy: row.username,
    status: row.status,
    submittedAt: row.created_at,
    is_archived: row.is_archived || false,
    archivedBy: row.archived_by || null,
    archivedAt: row.archived_at || null
  };
}

// Load user's own submissions from database
async function loadMySubmissions() {
  if (!supabase || !currentUser) return;
  
  try {
    const { data, error } = await supabase
      .from('wiki_contributions')
      .select('*')
      .eq('username', currentUser)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    mySubmissions = (data || []).map(sub => ({
      id: sub.id,
      type: sub.contribution_type,
      name: sub.item_name,
      rarity: sub.rarity,
      icon: sub.icon,
      source: sub.source,
      floor: sub.floor,
      summary: sub.summary,
      dps: sub.dps,
      levelReq: sub.level_req,
      droppedBy: sub.dropped_by || [],
      hp: sub.hp,
      defense: sub.defense,
      slot: sub.slot,
      enemyType: sub.enemy_type,
      loot: sub.loot || [],
      materials: sub.materials || [],
      exp: sub.exp,
      money: sub.money,
      submittedBy: sub.username,
      status: sub.status,
      submittedAt: sub.created_at,
      is_archived: sub.is_archived || false
    }));
    
    renderMySubmissions();
  } catch (error) {
    console.error('Error loading my submissions:', error);
  }
}

// Load all pending submissions (admin only)
async function loadPendingSubmissions() {
  if (!supabase || !isAdmin()) return;
  
  try {
    const { data, error } = await supabase
      .from('wiki_contributions')
      .select('*')
      .eq('status', 'pending')
      .eq('is_archived', false)
      .order('created_at', { ascending: false});
    
    if (error) throw error;
    
    pendingSubmissions = (data || []).map(mapContributionRow);
    
    renderPendingApprovals();
  } catch (error) {
    console.error('Error loading pending submissions:', error);
  }
}

// Toggle between forms based on type
$("#contributeType")?.addEventListener("change", (e) => {
  const type = e.target.value;
  $("#itemForm").hidden = type !== "item";
  $("#armorForm").hidden = type !== "armor";
  $("#enemyForm").hidden = type !== "enemy";
});

$("#submitContribution")?.addEventListener("click", async () => {
  const type = $("#contributeType")?.value;
  
  let data = {};
  let valid = true;
  
  if (type === "item") {
    data = {
      type: "item",
      name: $("#itemName")?.value.trim(),
      rarity: $("#itemRarity")?.value,
      dps: parseInt($("#itemDps")?.value) || 0,
      levelReq: parseInt($("#itemLevel")?.value) || 1,
      floor: $("#itemFloor")?.value.trim(),
      source: $("#itemSource")?.value.trim(),
      summary: $("#itemSummary")?.value.trim()
    };
    valid = data.name && data.dps > 0 && data.floor && data.source && data.summary;
  } else if (type === "armor") {
    data = {
      type: "armor",
      name: $("#armorName")?.value.trim(),
      rarity: $("#armorRarity")?.value,
      slot: "Chest", // All armor is chestplate only
      hp: parseInt($("#armorHp")?.value) || 0,
      defense: parseInt($("#armorDefense")?.value) || 0,
      levelReq: parseInt($("#armorLevel")?.value) || 1,
      source: $("#armorSource")?.value.trim(),
      summary: $("#armorSummary")?.value.trim()
    };
    valid = data.name && data.hp >= 0 && data.defense >= 0 && data.source && data.summary;
  } else if (type === "enemy") {
    data = {
      type: "enemy",
      name: $("#enemyName")?.value.trim(),
      enemyType: $("#enemyType")?.value,
      hp: parseInt($("#enemyHp")?.value) || 0,
      defense: $("#enemyDefense")?.value.trim(),
      floor: $("#enemyFloor")?.value.trim(),
      exp: parseInt($("#enemyExp")?.value) || 0,
      money: parseInt($("#enemyMoney")?.value) || 0,
      summary: $("#enemySummary")?.value.trim()
    };
    valid = data.name && data.hp > 0 && data.defense && data.floor && data.summary;
  }
  
  if (!valid) {
    showToast("Please fill out all required fields (*)", "error");
    return;
  }
  
  // Handle image upload
  const iconInput = type === "item" ? $("#itemIcon") : type === "armor" ? $("#armorIcon") : $("#enemyIcon");
  let iconUrl = "";
  
  if (iconInput && iconInput.files && iconInput.files[0]) {
    const file = iconInput.files[0];
    
    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      showToast("Image file is too large! Max 2MB allowed", "error");
      return;
    }
    
    // Convert to base64 data URL (for demo - in production, upload to Supabase storage)
    try {
      iconUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } catch (e) {
      console.error("Image read error:", e);
      showToast("Failed to read image file", "error");
      return;
    }
  }
  
  // Save submission to database
  if (!supabase) {
    showToast("Database not connected", "error");
    return;
  }
  
  try {
    // Build insert object with actual column names from SUPABASE_SQL.sql
    const insertData = {
      username: currentUser,
      contribution_type: type,
      status: 'pending',
      item_name: data.name,
      rarity: data.rarity || null,
      icon: iconUrl || null,
      source: data.source || null,
      floor: data.floor || null,
      summary: data.summary || null
    };
    
    // Add type-specific fields
    if (type === 'item') {
      insertData.dps = data.dps || null;
      insertData.level_req = data.levelReq || null;
      insertData.dropped_by = data.droppedBy || [];
    } else if (type === 'armor') {
      insertData.hp = data.hp || null;
      insertData.defense = data.defense || null;
      insertData.slot = data.slot || null;
      insertData.level_req = data.levelReq || null;
    } else if (type === 'enemy') {
      insertData.enemy_type = data.enemyType || null;
      insertData.hp = data.hp || null;
      insertData.defense = data.defense || null;
      insertData.loot = data.loot || [];
      insertData.materials = data.materials || [];
      insertData.exp = data.exp || null;
      insertData.money = data.money || null;
    }
    
    const { data: newSubmission, error } = await supabase
      .from('wiki_contributions')
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw error;
    
    // Add to local arrays
    const submission = {
      id: newSubmission.id,
      ...data,
      icon: iconUrl,
      submittedBy: currentUser,
      status: "pending",
      submittedAt: newSubmission.created_at
    };
    
    mySubmissions.unshift(submission);
    if (isAdmin()) {
      pendingSubmissions.unshift(submission);
    }
    
    renderMySubmissions();
    renderPendingApprovals();
    
    showToast("Submission sent for review!", "success");
    
    // Clear form
    clearContributeForm(type);
  } catch (error) {
    console.error('Error submitting contribution:', error);
    showToast(`Failed to submit contribution: ${error.message}`, 'error');
  }
});

function clearContributeForm(type) {
  if (type === "item") {
    $("#itemName").value = "";
    $("#itemDps").value = "";
    $("#itemLevel").value = "";
    $("#itemFloor").value = "";
    $("#itemSource").value = "";
    $("#itemSummary").value = "";
    $("#itemIcon").value = "";
  } else if (type === "armor") {
    $("#armorName").value = "";
    $("#armorHp").value = "";
    $("#armorDefense").value = "";
    $("#armorLevel").value = "";
    $("#armorSource").value = "";
    $("#armorSummary").value = "";
    $("#armorIcon").value = "";
  } else if (type === "enemy") {
    $("#enemyName").value = "";
    $("#enemyHp").value = "";
    $("#enemyDefense").value = "";
    $("#enemyFloor").value = "";
    $("#enemyExp").value = "";
    $("#enemyMoney").value = "";
    $("#enemySummary").value = "";
    $("#enemyIcon").value = "";
  }
}

function renderMySubmissions() {
  const container = $("#mySubmissions");
  if (!container) return;
  
  // Filter to only show current user's submissions
  const userSubs = mySubmissions.filter(sub => sub.submittedBy === currentUser);
  
  if (userSubs.length === 0) {
    container.innerHTML = '<div class="empty">No submissions yet. Submit your first entry above!</div>';
    return;
  }
  
  container.innerHTML = userSubs.map(sub => `
    <div class="submission-item ${sub.status}">
      <div class="submission-content">
        <div class="submission-title">${sub.name} <span class="badge">${sub.type}</span></div>
        <div class="submission-meta">${new Date(sub.submittedAt).toLocaleDateString()} • ${sub.submittedBy}</div>
        <span class="submission-status ${sub.status}">${sub.status}</span>
      </div>
    </div>
  `).join("");
}

function renderPendingApprovals() {
  const container = $("#pendingApprovals");
  if (!container) return;
  
  // Only show if user is owner/admin
  const hasAdminAccess = isAdmin();
  $("#adminPanel").hidden = !hasAdminAccess;
  
  // Show/hide archive nav link
  const archiveNavLink = $("#archiveNavLink");
  if (archiveNavLink) {
    archiveNavLink.style.display = hasAdminAccess ? "block" : "none";
  }
  
  if (!hasAdminAccess) return;
  
  const pending = pendingSubmissions.filter(s => s.status === "pending" && !s.is_archived);
  
  if (pending.length === 0) {
    container.innerHTML = '<div class="empty">No pending submissions</div>';
    return;
  }
  
  container.innerHTML = pending.map(sub => `
    <div class="submission-item pending">
      <div class="submission-content">
        <div class="submission-title">${sub.name} <span class="badge">${sub.type}</span> <span class="badge">${sub.rarity || sub.enemyType || ""}</span></div>
        <div class="submission-meta">${new Date(sub.submittedAt).toLocaleDateString()} • Submitted by ${sub.submittedBy}</div>
        <div class="small" style="margin-top:6px;color:var(--muted);">${sub.summary}</div>
      </div>
      <div class="submission-actions">
        <button class="btn" onclick="approveSubmission('${sub.id}')" style="padding:8px 12px;">✅ Approve</button>
        <button class="btn" onclick="openEditModal('${sub.id}')" style="padding:8px 12px;background:var(--ring);">✏️ Edit</button>
        <button class="btn ghost" onclick="archiveSubmission('${sub.id}')" style="padding:8px 12px;color:#f59e0b;">📦 Archive</button>
        <button class="btn ghost" onclick="rejectSubmission('${sub.id}')" style="padding:8px 12px;color:#dc2626;">❌ Reject</button>
      </div>
    </div>
  `).join("");
}

async function approveSubmission(id) {
  if (!supabase || !isAdmin()) {
    showToast('You do not have permission to approve submissions', 'error');
    return;
  }
  
  const sub = pendingSubmissions.find(s => s.id === id);
  if (!sub) return;
  
  try {
    // Update submission status in wiki_contributions table
    const { error: updateError } = await supabase
      .from('wiki_contributions')
      .update({ 
        status: 'approved',
        reviewed_by: currentUser,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', sub.id);
    
    if (updateError) throw updateError;
    
    // Add to appropriate table
    if (sub.type === "item") {
      const { error: itemError } = await supabase
        .from('items')
        .upsert({
          name: sub.name,
          rarity: sub.rarity || 'common',
          dps: sub.dps ?? null,
          level_req: sub.levelReq ?? null,
          floor: sub.floor || null,
          source: sub.source || null,
          summary: sub.summary || null,
          icon: sub.icon || "",
          dropped_by: sub.droppedBy || []
        }, { onConflict: 'name' });
      
      if (itemError) throw itemError;
      
      // Add to local DB immediately
      const existingIndex = DB.items.findIndex(i => i.name === sub.name);
      const newItem = {
        name: sub.name,
        rarity: sub.rarity || 'common',
        dps: sub.dps ?? null,
        levelReq: sub.levelReq ?? null,
        floor: sub.floor || '',
        source: sub.source || '',
        summary: sub.summary || '',
        icon: sub.icon || "",
        droppedBy: sub.droppedBy || []
      };
      if (existingIndex >= 0) DB.items[existingIndex] = newItem;
      else DB.items.push(newItem);
      
    } else if (sub.type === "armor") {
      const { error: armorError } = await supabase
        .from('armor')
        .upsert({
          name: sub.name,
          rarity: sub.rarity || 'common',
          slot: sub.slot || null,
          hp: sub.hp ?? null,
          defense: sub.defense ?? null,
          level_req: sub.levelReq ?? null,
          source: sub.source || null,
          summary: sub.summary || null,
          icon: sub.icon || "",
          floor: sub.floor || null,
          dropped_by: sub.droppedBy || []
        }, { onConflict: 'name' });
      
      if (armorError) throw armorError;
      
      // Add to local DB immediately
      const existingIndex = DB.armor.findIndex(i => i.name === sub.name);
      const newArmor = {
        name: sub.name,
        rarity: sub.rarity || 'common',
        slot: sub.slot || '',
        hp: sub.hp ?? null,
        defense: sub.defense ?? null,
        levelReq: sub.levelReq ?? null,
        source: sub.source || '',
        summary: sub.summary || '',
        icon: sub.icon || "",
        droppedBy: sub.droppedBy || []
      };
      if (existingIndex >= 0) DB.armor[existingIndex] = newArmor;
      else DB.armor.push(newArmor);
      
    } else if (sub.type === "enemy") {
      const { error: enemyError } = await supabase
        .from('enemies')
        .upsert({
          name: sub.name,
          enemy_type: sub.enemyType || 'mob',
          hp: sub.hp ?? null,
          defense: sub.defense || null,
          floor: sub.floor || null,
          exp: sub.exp ?? null,
          money: sub.money ?? null,
          summary: sub.summary || null,
          icon: sub.icon || "",
          loot: sub.loot || [],
          materials: sub.materials || []
        }, { onConflict: 'name' });
      
      if (enemyError) throw enemyError;
      
      // Add to local DB immediately
      const existingIndex = DB.enemies.findIndex(i => i.name === sub.name);
      const newEnemy = {
        name: sub.name,
        type: sub.enemyType || 'mob',
        hp: sub.hp ?? null,
        defense: sub.defense || '',
        floor: sub.floor || '',
        exp: sub.exp ?? null,
        money: sub.money ?? null,
        summary: sub.summary || '',
        icon: sub.icon || "",
        loot: sub.loot || [],
        materials: sub.materials || []
      };
      if (existingIndex >= 0) DB.enemies[existingIndex] = newEnemy;
      else DB.enemies.push(newEnemy);
    }
    
    // Update local submission status
    sub.status = "approved";
    
    // Reload submissions from database
    await loadPendingSubmissions();
    await loadMySubmissions();
    
    showToast(`${sub.name} approved and added to wiki!`, "success");
    addNotification("Submission Approved", `Your ${sub.type} "${sub.name}" was approved!`, "✅", "success");
    
    // Reload fresh data so UI stays in sync with database
    await loadWikiContent();
    render();
    
  } catch (error) {
    console.error('Error approving submission:', error);
    showToast('Failed to approve submission', 'error');
  }
}

// Archive submission (soft delete)
async function archiveSubmission(id) {
  if (!supabase || !isAdmin()) {
    showToast('You do not have permission to archive submissions', 'error');
    return;
  }
  
  const sub = pendingSubmissions.find(s => s.id === id);
  if (!sub) return;
  
  if (confirm(`Archive submission "${sub.name}"? You can unarchive it later from the Archive tab.`)) {
    try {
      const { error } = await supabase
        .from('wiki_contributions')
        .update({
          is_archived: true,
          archived_by: currentUser,
          archived_at: new Date().toISOString(),
          status: 'archived'
        })
        .eq('id', id);
      
      if (error) throw error;
      
      // Reload submissions from database
      await loadPendingSubmissions();
      await loadMySubmissions();
      await loadArchivedSubmissions();
      
      showToast(`${sub.name} archived`, "info");
      
    } catch (error) {
      console.error('Error archiving submission:', error);
      showToast('Failed to archive submission', 'error');
    }
  }
}

// Unarchive submission
async function unarchiveSubmission(id) {
  if (!supabase || !isAdmin()) {
    showToast('You do not have permission to unarchive submissions', 'error');
    return;
  }
  
  try {
    const { error } = await supabase
      .from('wiki_contributions')
      .update({
        is_archived: false,
        archived_by: null,
        archived_at: null,
        status: 'pending'
      })
      .eq('id', id);
    
    if (error) throw error;
    
    // Refresh both views
    await loadPendingSubmissions();
    await loadArchivedSubmissions();
    showToast('Submission unarchived', 'success');
    
  } catch (error) {
    console.error('Error unarchiving submission:', error);
    showToast('Failed to unarchive submission', 'error');
  }
}

// Permanently delete submission
async function permanentlyDeleteSubmission(id) {
  if (!supabase || !isAdmin()) {
    showToast('You do not have permission to delete submissions', 'error');
    return;
  }
  
  const archivedSubs = await getArchivedSubmissions();
  const sub = archivedSubs.find(s => s.id === id);
  if (!sub) return;
  
  if (confirm(`⚠️ PERMANENTLY DELETE "${sub.name}"? This cannot be undone!`)) {
    if (confirm(`Are you absolutely sure? This will permanently delete "${sub.name}" from the database.`)) {
      try {
        const { error } = await supabase
          .from('wiki_contributions')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        
        loadArchivedSubmissions();
        showToast(`${sub.name} permanently deleted`, 'info');
        
      } catch (error) {
        console.error('Error deleting submission:', error);
        showToast('Failed to delete submission', 'error');
      }
    }
  }
}

// Load archived submissions
async function loadArchivedSubmissions() {
  if (!supabase || !isAdmin()) return;
  
  try {
    const { data, error } = await supabase
      .from('wiki_contributions')
      .select('*')
      .eq('is_archived', true)
      .order('archived_at', { ascending: false });
    
    if (error) throw error;
    
  const mapped = (data || []).map(mapContributionRow);
  renderArchivedSubmissions(mapped);
    
  } catch (error) {
    console.error('Error loading archived submissions:', error);
    showToast('Failed to load archived submissions', 'error');
  }
}

// Get archived submissions for helper functions
async function getArchivedSubmissions() {
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('wiki_contributions')
      .select('*')
      .eq('is_archived', true);
    
    if (error) throw error;
    return (data || []).map(mapContributionRow);
    
  } catch (error) {
    console.error('Error getting archived submissions:', error);
    return [];
  }
}

// Render archived submissions
function renderArchivedSubmissions(archived) {
  const container = $("#archivedSubmissions");
  const countEl = $("#archiveCount");
  
  if (!container) return;
  
  if (countEl) {
    countEl.textContent = `${archived.length} archived`;
  }
  
  if (archived.length === 0) {
    container.innerHTML = '<div class="empty">No archived submissions</div>';
    return;
  }
  
  container.innerHTML = archived.map(sub => `
    <div class="submission-item archived">
      <div class="submission-content">
        <div class="submission-title">${sub.name} <span class="badge">${sub.type}</span> <span class="badge">${sub.rarity || sub.enemyType || ""}</span></div>
        <div class="submission-meta">
          ${sub.archivedAt ? `Archived ${new Date(sub.archivedAt).toLocaleDateString()}${sub.archivedBy ? ` by ${sub.archivedBy}` : ""}` : "Archived date unknown"}
          <br>
          <span style="font-size:11px;color:var(--muted);">Originally submitted ${sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : "?"} by ${sub.submittedBy || "unknown"}</span>
        </div>
        <div class="small" style="margin-top:6px;color:var(--muted);">${sub.summary}</div>
      </div>
      <div class="submission-actions">
        <button class="btn" onclick="unarchiveSubmission('${sub.id}')" style="padding:8px 12px;background:#10b981;">↩️ Unarchive</button>
        <button class="btn" onclick="openEditModal('${sub.id}', true)" style="padding:8px 12px;background:var(--ring);">✏️ Edit</button>
        <button class="btn ghost" onclick="permanentlyDeleteSubmission('${sub.id}')" style="padding:8px 12px;color:#dc2626;">🗑️ Delete Forever</button>
      </div>
    </div>
  `).join("");
}

// Edit modal functionality
let currentEditingSubmission = null;

function openEditModal(submissionId, isArchived = false) {
  if (!isAdmin()) {
    showToast('You do not have permission to edit submissions', 'error');
    return;
  }
  
  // Find submission
  let sub;
  if (isArchived) {
    getArchivedSubmissions().then(archived => {
      sub = archived.find(s => s.id === submissionId);
      if (sub) showEditModal(sub);
    });
  } else {
    sub = pendingSubmissions.find(s => s.id === submissionId);
    if (sub) showEditModal(sub);
  }
}

function showEditModal(submission) {
  currentEditingSubmission = submission;
  const modal = $("#editModal");
  const formContainer = $("#editForm");
  
  if (!modal || !formContainer) return;
  
  const enemyTypeValue = submission.enemyType || submission.enemy_type || 'mob';
  const rarityValue = (submission.rarity || 'common').toLowerCase();
  const slotValue = submission.slot || '';
  
  // Generate form based on submission type
  let formHTML = `<h2>✏️ Edit ${submission.type}: ${submission.name}</h2>`;
  
  if (submission.type === 'item') {
    formHTML += `
      <div class="form-group">
        <label>Item Name *</label>
        <input type="text" id="edit_name" value="${submission.name}" required>
      </div>
      <div class="form-group">
        <label>Rarity</label>
        <select id="edit_rarity">
          <option value="common" ${rarityValue === 'common' ? 'selected' : ''}>Common</option>
          <option value="uncommon" ${rarityValue === 'uncommon' ? 'selected' : ''}>Uncommon</option>
          <option value="rare" ${rarityValue === 'rare' ? 'selected' : ''}>Rare</option>
          <option value="epic" ${rarityValue === 'epic' ? 'selected' : ''}>Epic</option>
          <option value="legendary" ${rarityValue === 'legendary' ? 'selected' : ''}>Legendary</option>
          <option value="mythic" ${rarityValue === 'mythic' ? 'selected' : ''}>Mythic</option>
        </select>
      </div>
      <div class="form-group">
        <label>DPS</label>
        <input type="number" id="edit_dps" min="0" step="0.1" value="${submission.dps ?? ''}">
      </div>
      <div class="form-group">
        <label>Level Requirement</label>
        <input type="number" id="edit_level" min="0" value="${submission.levelReq ?? ''}">
      </div>
      <div class="form-group">
        <label>Floor</label>
        <input type="text" id="edit_floor" value="${submission.floor || ''}">
      </div>
      <div class="form-group">
        <label>Source</label>
        <input type="text" id="edit_source" value="${submission.source || ''}">
      </div>
      <div class="form-group">
        <label>Summary *</label>
        <textarea id="edit_summary" required>${submission.summary || ''}</textarea>
      </div>
    `;
  } else if (submission.type === 'armor') {
    formHTML += `
      <div class="form-group">
        <label>Armor Name *</label>
        <input type="text" id="edit_name" value="${submission.name}" required>
      </div>
      <div class="form-group">
        <label>Rarity</label>
        <select id="edit_rarity">
          <option value="common" ${rarityValue === 'common' ? 'selected' : ''}>Common</option>
          <option value="uncommon" ${rarityValue === 'uncommon' ? 'selected' : ''}>Uncommon</option>
          <option value="rare" ${rarityValue === 'rare' ? 'selected' : ''}>Rare</option>
          <option value="epic" ${rarityValue === 'epic' ? 'selected' : ''}>Epic</option>
          <option value="legendary" ${rarityValue === 'legendary' ? 'selected' : ''}>Legendary</option>
          <option value="mythic" ${rarityValue === 'mythic' ? 'selected' : ''}>Mythic</option>
        </select>
      </div>
      <div class="form-group">
        <label>Slot</label>
        <input type="text" id="edit_slot" value="${slotValue}">
      </div>
      <div class="form-group">
        <label>HP</label>
        <input type="number" id="edit_hp" min="0" step="0.1" value="${submission.hp ?? ''}">
      </div>
      <div class="form-group">
        <label>Defense</label>
        <input type="number" id="edit_defense" min="0" step="0.1" value="${submission.defense ?? ''}">
      </div>
      <div class="form-group">
        <label>Level Requirement</label>
        <input type="number" id="edit_level" min="0" value="${submission.levelReq ?? ''}">
      </div>
      <div class="form-group">
        <label>Source</label>
        <input type="text" id="edit_source" value="${submission.source || ''}">
      </div>
      <div class="form-group">
        <label>Summary *</label>
        <textarea id="edit_summary" required>${submission.summary || ''}</textarea>
      </div>
    `;
  } else if (submission.type === 'enemy') {
    formHTML += `
      <div class="form-group">
        <label>Enemy Name *</label>
        <input type="text" id="edit_name" value="${submission.name}" required>
      </div>
      <div class="form-group">
        <label>Enemy Type</label>
        <select id="edit_enemyType">
          <option value="mob" ${enemyTypeValue === 'mob' ? 'selected' : ''}>Mob</option>
          <option value="elite" ${enemyTypeValue === 'elite' ? 'selected' : ''}>Elite</option>
          <option value="boss" ${enemyTypeValue === 'boss' ? 'selected' : ''}>Boss</option>
          <option value="raid" ${enemyTypeValue === 'raid' ? 'selected' : ''}>Raid</option>
        </select>
      </div>
      <div class="form-group">
        <label>HP</label>
        <input type="number" id="edit_hp" min="0" step="1" value="${submission.hp ?? ''}">
      </div>
      <div class="form-group">
        <label>Defense</label>
        <input type="text" id="edit_defense" value="${submission.defense || ''}">
      </div>
      <div class="form-group">
        <label>Floor</label>
        <input type="text" id="edit_floor" value="${submission.floor || ''}">
      </div>
      <div class="form-group">
        <label>Experience</label>
        <input type="number" id="edit_exp" min="0" step="1" value="${submission.exp ?? ''}">
      </div>
      <div class="form-group">
        <label>Money</label>
        <input type="number" id="edit_money" min="0" step="1" value="${submission.money ?? ''}">
      </div>
      <div class="form-group">
        <label>Summary *</label>
        <textarea id="edit_summary" required>${submission.summary || ''}</textarea>
      </div>
    `;
  }
  
  formContainer.innerHTML = formHTML;
  modal.hidden = false;
  modal.style.display = "flex";
}

function closeEditModal() {
  const modal = $("#editModal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  currentEditingSubmission = null;
}

async function saveEditedSubmission() {
  if (!supabase || !currentEditingSubmission || !isAdmin()) {
    showToast('Cannot save changes', 'error');
    return;
  }
  
  const sub = currentEditingSubmission;
  const name = $("#edit_name")?.value?.trim();
  const summary = $("#edit_summary")?.value?.trim();
  
  if (!name || !summary) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  
  const updates = {
    item_name: name,
    summary,
    updated_at: new Date().toISOString()
  };
  const changes = {};
  
  if (sub.name !== name) {
    changes.item_name = { old: sub.name, new: name };
  }
  if ((sub.summary || '').trim() !== summary) {
    changes.summary = { old: sub.summary, new: summary };
  }
  
  const toNumber = (val) => {
    if (val === '' || val == null) return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const toText = (val) => (val && val.trim() ? val.trim() : null);
  
  if (sub.type === 'item') {
    const rarity = $("#edit_rarity")?.value || null;
    const dps = toNumber($("#edit_dps")?.value ?? null);
    const levelReq = toNumber($("#edit_level")?.value ?? null);
    const floor = toText($("#edit_floor")?.value || '');
    const source = toText($("#edit_source")?.value || '');
    
    updates.rarity = rarity;
    updates.dps = dps;
    updates.level_req = levelReq;
    updates.floor = floor;
    updates.source = source;
    
    if ((sub.rarity || null) !== rarity) changes.rarity = { old: sub.rarity, new: rarity };
    if ((sub.dps ?? null) !== dps) changes.dps = { old: sub.dps, new: dps };
    if ((sub.levelReq ?? null) !== levelReq) changes.level_req = { old: sub.levelReq, new: levelReq };
    if ((sub.floor || null) !== floor) changes.floor = { old: sub.floor, new: floor };
    if ((sub.source || null) !== source) changes.source = { old: sub.source, new: source };
  } else if (sub.type === 'armor') {
    const rarity = $("#edit_rarity")?.value || null;
    const slot = toText($("#edit_slot")?.value || '');
    const hp = toNumber($("#edit_hp")?.value ?? null);
    const defense = toNumber($("#edit_defense")?.value ?? null);
    const levelReq = toNumber($("#edit_level")?.value ?? null);
    const source = toText($("#edit_source")?.value || '');
    
    updates.rarity = rarity;
    updates.slot = slot;
    updates.hp = hp;
    updates.defense = defense;
    updates.level_req = levelReq;
    updates.source = source;
    
    if ((sub.rarity || null) !== rarity) changes.rarity = { old: sub.rarity, new: rarity };
    if ((sub.slot || null) !== slot) changes.slot = { old: sub.slot, new: slot };
    if ((sub.hp ?? null) !== hp) changes.hp = { old: sub.hp, new: hp };
    if ((sub.defense ?? null) !== defense) changes.defense = { old: sub.defense, new: defense };
    if ((sub.levelReq ?? null) !== levelReq) changes.level_req = { old: sub.levelReq, new: levelReq };
    if ((sub.source || null) !== source) changes.source = { old: sub.source, new: source };
  } else if (sub.type === 'enemy') {
    const enemyType = $("#edit_enemyType")?.value || null;
    const hp = toNumber($("#edit_hp")?.value ?? null);
    const defense = toText($("#edit_defense")?.value || '');
    const floor = toText($("#edit_floor")?.value || '');
    const exp = toNumber($("#edit_exp")?.value ?? null);
    const money = toNumber($("#edit_money")?.value ?? null);
    
    updates.enemy_type = enemyType;
    updates.hp = hp;
    updates.defense = defense;
    updates.floor = floor;
    updates.exp = exp;
    updates.money = money;
    
    const prevEnemyType = sub.enemyType || sub.enemy_type || null;
    if (prevEnemyType !== enemyType) changes.enemy_type = { old: prevEnemyType, new: enemyType };
    if ((sub.hp ?? null) !== hp) changes.hp = { old: sub.hp, new: hp };
    if ((sub.defense || null) !== defense) changes.defense = { old: sub.defense, new: defense };
    if ((sub.floor || null) !== floor) changes.floor = { old: sub.floor, new: floor };
    if ((sub.exp ?? null) !== exp) changes.exp = { old: sub.exp, new: exp };
    if ((sub.money ?? null) !== money) changes.money = { old: sub.money, new: money };
  }
  
  // Remove unchanged entries from changes object
  Object.keys(changes).forEach((key) => {
    const diff = changes[key];
    if (diff.old === diff.new) delete changes[key];
  });
  
  if (Object.keys(changes).length === 0) {
    showToast('No changes detected', 'info');
    closeEditModal();
    return;
  }
  
  try {
    // Update the submission
    const { error: updateError } = await supabase
      .from('wiki_contributions')
      .update(updates)
      .eq('id', sub.id);
    
    if (updateError) throw updateError;
    
    // Add to edit history
    const { error: historyError } = await supabase.rpc('add_edit_history', {
      submission_id: sub.id,
      editor_username: currentUser,
      changes_json: changes
    });
    
    if (historyError) {
      console.error('Error adding edit history:', historyError);
      // Don't fail the whole operation if history fails
    }
    
    // Refresh views
    loadPendingSubmissions();
    loadArchivedSubmissions();
    
    closeEditModal();
    showToast(`${name} updated successfully`, 'success');
    
  } catch (error) {
    console.error('Error saving edits:', error);
    showToast('Failed to save changes', 'error');
  }
}

// Event listeners for edit modal
document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = $("#saveEditBtn");
  const cancelBtn = $("#cancelEditBtn");
  const closeBtn = $("#editModalClose");
  const modal = $("#editModal");
  
  if (saveBtn) saveBtn.addEventListener('click', saveEditedSubmission);
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditModal);
  if (closeBtn) closeBtn.addEventListener('click', closeEditModal);
  
  // Close on backdrop click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeEditModal();
    });
  }
});

async function rejectSubmission(id) {
  if (!supabase || !isAdmin()) {
    showToast('You do not have permission to reject submissions', 'error');
    return;
  }
  
  const sub = pendingSubmissions.find(s => s.id === id);
  if (!sub) return;
  
  if (confirm(`Reject submission "${sub.name}"?`)) {
    try {
      // Update submission status in wiki_contributions table
      const { error } = await supabase
        .from('wiki_contributions')
        .update({ 
          status: 'rejected',
          reviewed_by: currentUser,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', sub.id);
      
      if (error) throw error;
      
      // Reload submissions from database
      await loadPendingSubmissions();
      await loadMySubmissions();
      
      showToast(`${sub.name} rejected`, "info");
      addNotification("Submission Rejected", `Your ${sub.type} "${sub.name}" was not approved.`, "❌", "info");
      
    } catch (error) {
      console.error('Error rejecting submission:', error);
      showToast('Failed to reject submission', 'error');
    }
  }
}

console.log("Friends, Messages, and Profile features are now functional!");
console.info("[App] Auth UI ready. Click Log In or Create Account to proceed.");

// Boot
if (location.hash) {
  const link = document.querySelector(`a[data-page="${location.hash.slice(1)}"]`);
  link?.click();
}

// Enter-to-submit convenience
[loginUsername, loginPassword].forEach((el) => el?.addEventListener("keydown", (e) => { if (e.key === "Enter") loginSubmit?.click(); }));
[signupUsername, signupPassword, signupConfirm].forEach((el) => el?.addEventListener("keydown", (e) => { if (e.key === "Enter") signupSubmit?.click(); }));
