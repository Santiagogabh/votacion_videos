const $ = s => document.querySelector(s);
const heart = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 2.9 4.5 6.4 4.5c2 0 3.5 1.1 4.3 2.4h.6c.8-1.3 2.3-2.4 4.3-2.4 3.5 0 5.5 3.7 4 7.2C19.5 16.4 12 21 12 21z"/></svg>';
let VIDEOS = [], counts = {}, mine = new Set();
const busy = new Set();

async function api(method, body) {
  const r = await fetch("/api/votes", {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Error " + r.status);
  return data;
}

/* Solo se acepta el src de iframes de YouTube/Vimeo. */
function parseEmbed(embed) {
  let src = "";
  try { src = new DOMParser().parseFromString(embed || "", "text/html").querySelector("iframe")?.src || ""; } catch (e) {}
  if (!/^https:\/\/(www\.)?(youtube(-nocookie)?\.com|player\.vimeo\.com)\//.test(src)) return null;
  const m = src.match(/\/embed\/([\w-]{6,})/);
  return { src, watch: m && src.includes("youtube") ? "https://www.youtube.com/watch?v=" + m[1] : src };
}

function buildPlayer(info, title) {
  const box = document.createElement("div"); box.className = "video";
  if (!info) {
    const p = document.createElement("div"); p.className = "ph";
    p.textContent = "Pega aquí el código embed del video"; box.appendChild(p);
    return box;
  }
  const f = document.createElement("iframe");
  f.src = info.src; f.title = title; f.loading = "lazy"; f.allowFullscreen = true;
  f.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
  f.referrerPolicy = "strict-origin-when-cross-origin";
  box.appendChild(f);
  return box;
}

function renderGrid() {
  const g = $("#grid");
  VIDEOS.forEach((v, i) => {
    const info = parseEmbed(v.embed);
    const c = document.createElement("article"); c.className = "card"; c.style.animationDelay = (i * 60) + "ms";
    c.appendChild(buildPlayer(info, v.title));
    const b = document.createElement("div"); b.className = "body";
    b.innerHTML = '<div class="num"></div><h3></h3><p class="author"></p>' +
      (info ? '<a class="yt" target="_blank" rel="noopener noreferrer">Ver en YouTube ↗</a>' : '') +
      '<div class="row"><div class="count"><b id="c-' + v.id + '">0</b>votos</div>' +
      '<button class="like" id="b-' + v.id + '" disabled>' + heart + '<span>Me gusta</span></button></div>';
    b.querySelector(".num").textContent = "VIDEO " + (i + 1);
    b.querySelector("h3").textContent = v.title;
    b.querySelector(".author").textContent = v.author;
    if (info) b.querySelector(".yt").href = info.watch;
    b.querySelector("button").addEventListener("click", () => toggleVote(v.id));
    c.appendChild(b); g.appendChild(c);
  });
}

function refresh(enabled = true) {
  VIDEOS.forEach(v => {
    const el = $("#c-" + v.id), n = counts[v.id] || 0;
    if (el.textContent != n) { el.textContent = n; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    const btn = $("#b-" + v.id), on = mine.has(v.id);
    btn.classList.toggle("on", on);
    btn.disabled = !enabled;
    btn.title = on ? "Haz clic para quitar tu voto" : "";
    btn.querySelector("span").textContent = on ? "Votado · Quitar" : "Me gusta";
  });
  renderResults();
}

function renderResults() {
  const list = VIDEOS.map(v => ({ ...v, n: counts[v.id] || 0 })).sort((a, b) => b.n - a.n);
  const top = list[0].n, max = Math.max(top, 1);
  const leaders = top > 0 ? list.filter(x => x.n === top) : [];
  const w = $("#winner"); w.innerHTML = "";
  if (leaders.length) {
    const d = document.createElement("div"); d.className = "winner";
    d.innerHTML = '<div class="crown">🏆</div><small></small><h3></h3><div class="author"></div>';
    d.querySelector("small").textContent = leaders.length > 1 ? "Empate en el primer lugar" : "Va ganando";
    d.querySelector("h3").textContent = leaders.map(l => l.title).join("  ·  ");
    d.querySelector(".author").textContent = top + (top === 1 ? " voto" : " votos") + (leaders.length === 1 ? " · " + leaders[0].author : "");
    w.appendChild(d);
  }
  const ol = $("#rank"); ol.innerHTML = "";
  list.forEach((x, i) => {
    const li = document.createElement("li");
    li.innerHTML = '<span class="pos"></span><span class="name"></span><span class="v"></span><div class="bar"><i></i></div>';
    li.querySelector(".pos").textContent = i + 1;
    li.querySelector(".name").textContent = x.title + " — " + x.author;
    li.querySelector(".v").textContent = x.n;
    ol.appendChild(li);
    requestAnimationFrame(() => li.querySelector("i").style.width = (x.n / max * 100) + "%");
  });
}

async function load() {
  if (busy.size) return;                       // no pisar cambios en curso
  try {
    const d = await api("GET");
    if (busy.size) return;
    counts = d.counts; mine = new Set(d.mine);
    $("#status").textContent = "● En vivo";
    refresh();
  } catch (e) { $("#status").textContent = "Sin conexión con el servidor. Reintentando…"; }
}

async function toggleVote(id) {
  if (busy.has(id)) return;
  busy.add(id);
  const had = mine.has(id);
  if (had) { mine.delete(id); counts[id]--; } else { mine.add(id); counts[id] = (counts[id] || 0) + 1; }
  refresh();
  try {
    const d = await api("POST", { videoId: id, action: had ? "unvote" : "vote" });
    counts = d.counts; mine = new Set(d.mine);
  } catch (e) {
    if (had) { mine.add(id); counts[id]++; } else { mine.delete(id); counts[id]--; }
    $("#status").textContent = e.message;
  }
  busy.delete(id);
  refresh();
}

(async () => {
  try {
    VIDEOS = await (await fetch("videos.json", { cache: "no-store" })).json();
    VIDEOS.forEach(v => counts[v.id] = 0);
    renderGrid(); refresh(false);
    await load();
    setInterval(() => { if (!document.hidden) load(); }, 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  } catch (e) { $("#status").textContent = "No se pudo cargar videos.json"; }
})();
