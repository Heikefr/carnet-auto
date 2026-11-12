/* ==========================================================================
   Carnet auto 1.0 — sw.js (service worker)
   Permet à l'application de s'ouvrir sans connexion.

   Stratégie « réseau d'abord » : à chaque ouverture on demande les fichiers au site
   (pour recevoir les mises à jour) et on en garde une copie ; sans réseau, on sert la copie.

   À CHAQUE NOUVELLE VERSION : changer le nom du cache ci-dessous. L'ancien cache est alors
   supprimé et les nouveaux fichiers sont pris en compte.
   ========================================================================== */
const CACHE = "carnet-auto-1.0";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

// Installation : met tous les fichiers de l'appli en cache, puis s'active sans attendre
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Activation : supprime les caches des versions précédentes et prend la main sur les pages ouvertes
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Requêtes : réseau d'abord (la réponse rafraîchit le cache), cache en secours hors connexion
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req).then(m => m || caches.match("./index.html"))));
});
