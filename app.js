/* ==========================================================================
   Carnet auto 1.0 — app.js
   Tout le comportement de l'application : données, calculs, affichage,
   formulaires, sauvegarde. Aucune bibliothèque externe, aucun serveur :
   les données vivent dans le stockage local du téléphone (localStorage).

   Sommaire
     1. Constantes          6. Affichage des vues     11. Sauvegarde, export, import
     2. État                7. Navigation             12. Photo et icône
     3. Outils              8. Feuilles (panneaux)    13. Réglages
     4. Stockage            9. Formulaires            14. Démarrage
     5. Calculs            10. Dates clés, calendrier

   Principe général : l'état S est la seule source de vérité.
   Une modification suit toujours le même chemin :
     changer S  →  persist() (écrit dans localStorage)  →  refresh() (redessine la vue affichée)
   Seule la vue visible est redessinée ; les autres le sont quand on les ouvre.
   ========================================================================== */
(function () {
"use strict";

/* ==========================================================================
   1. CONSTANTES
   ========================================================================== */

const VERSION = "1.1";

/* Clés du stockage local. NE PAS RENOMMER : ce sont elles qui retrouvent les données déjà enregistrées. */
const KEY = "carnet-auto-v1";                          // toutes les données (JSON, voir snapshot())
const KEY_BK = "carnet-auto-derniere-sauvegarde";      // date ISO de la dernière sauvegarde exportée
const KEY_PHOTO = "carnet-auto-photo";                 // photo de la voiture (data URL), à part car volumineuse

const DAY = 864e5;                                     // un jour en millisecondes
const FUELS = ["SP95 E10", "SP98", "E85", "SP95", "Gazole"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/* Plan d'entretien par défaut : chaque intervention revient tous les `mois` mois ou tous les `km` km
   (le premier atteint). km: null = échéance en date seulement. Modifiable dans Réglages. */
const DEFAULT_ECH = {
  seuilKm: 2000,       // « À prévoir » quand il reste moins de 2 000 km…
  seuilJours: 30,      // …ou moins de 30 jours
  items: [
    { nom: "Vidange Moteur", mois: 12, km: 25000 },
    { nom: "Liquide de frein", mois: 24, km: 30000 },
    { nom: "Liquide de refroidissement", mois: 60, km: 90000 },
    { nom: "Filtre d'habitacle", mois: 12, km: 25000 },
    { nom: "Bougies d'allumage", mois: 72, km: 90000 },
    { nom: "Filtre à air moteur", mois: 48, km: 48000 },
    { nom: "Disque de frein avant", mois: 60, km: 90000 },
    { nom: "Pneu avant", mois: 48, km: 50000 },
    { nom: "Pneu arrière", mois: 48, km: 25000 },
    { nom: "Contrôle technique", mois: 24, km: null }
  ]
};

/* Réglages par défaut. Seules ces clés sont conservées au chargement (voir applyData). */
const DEFAULT_PREFS = {
  theme: "auto",       // "auto" | "light" | "dark"
  carburant: "auto",   // carburant proposé pour un nouveau plein ("auto" = le dernier utilisé)
  station: "",         // station proposée ("" = la dernière)
  rappel: 30,          // rappel de sauvegarde, en jours (0 = jamais)
  detour: true,        // retirer le fond uni des photos
  seuil: 0.25,         // coût acceptable en €/km (indicateur de santé)
  decote: null         // perte de valeur en €/an (null = non comptée)
};

/* Libellé et classes CSS de chaque état d'échéance : [texte, pastille de texte, barre, point] */
const ST = {
  bad:  ["En retard", "s-bad", "b-bad", "d-bad"],
  warn: ["À prévoir", "s-warn", "b-warn", "d-warn"],
  ok:   ["OK", "s-ok", "b-ok", "d-ok"],
  na:   ["À renseigner", "s-na", "", "d-na"]
};
const ST_ORDER = { bad: 0, warn: 1, na: 2, ok: 3 };    // ordre d'affichage : le plus urgent en premier

/* Champs de la fiche véhicule et de l'assurance : [clé dans S.veh, libellé, type facultatif "date" | "num"] */
const VEH_FIELDS = [["marque", "Constructeur"], ["modele", "Modèle"], ["immat", "Immatriculation"], ["premiereImmat", "1re immat.", "date"], ["vin", "Code VIN"], ["cv", "Chevaux fiscaux"], ["carburant", "Carburant"], ["huile", "Huile moteur"], ["moteur", "Bloc moteur"], ["pneus", "Pneus"], ["poids", "Poids"], ["conducteur", "Conducteur"], ["permis", "Permis obtenu"], ["stationnement", "Stationnement"], ["usage", "Usage"]];
const INS_FIELDS = [["assureur", "Assureur"], ["formule", "Formule"], ["contrat", "N° de contrat"], ["cotisation", "Cotisation / an (€)", "num"], ["dateEffet", "Date d'effet", "date"], ["renouvellement", "Renouvellement"], ["prelevement", "Prélèvement"], ["banque", "Banque"], ["assistance", "Assistance"]];

/* Champs d'une pièce de rechange : [id du champ, clé, libellé] */
const PIECE_FIELDS = [["pcat", "categorie", "Catégorie"], ["part", "article", "Article"], ["pq", "qte", "Quantité"], ["pma", "marque", "Marque"], ["pr", "ref", "Référence"], ["pp", "prix", "Prix"], ["pmg", "magasin", "Magasin"]];

/* Journal des versions affiché en bas des Réglages (la plus récente en premier) */
const CHANGELOG = [
  { v: "1.1", date: "14 nov. 2026", items: [
    "Nouveau plein : la station se choisit dans la liste de celles déjà fréquentées, la plus utilisée en premier",
    "« Nouvelle station… » en bas de la liste pour en ajouter une",
    "Compteur pré-rempli avec ton écart habituel entre deux pleins : touche le champ, les 3 derniers chiffres sont prêts à être remplacés",
    "Alerte si tu enregistres le compteur proposé sans l'avoir modifié"] },
  { v: "1.0", date: "12 nov. 2026", items: [
    "Version stable : fin de la phase bêta",
    "Application plus légère et plus rapide : seul l'écran affiché est recalculé",
    "Code réorganisé en trois fichiers commentés : la page, le style, le programme",
    "Modèle 3D retiré : la photo est la vue de la voiture",
    "Tes données, ta photo et ton icône sont conservées"] },
  { titre: "Versions bêta 0.1 à 0.9", date: "nov. 2026", items: [
    "Suivi des pleins, des entretiens, des échéances et du coût total",
    "Style iOS, thèmes clair et sombre, page Réglages",
    "Photo de la voiture et icône personnalisée",
    "Indicateur « Santé de la voiture » et suivi des pannes",
    "Dates clés et ajout au calendrier",
    "Sauvegarde, restauration et export CSV"] }
];

/* ==========================================================================
   2. ÉTAT
   Chaque enregistrement (plein, entretien, pièce) porte un identifiant interne `_id`.
     plein     { _id, date "AAAA-MM-JJTHH:MM", km, station, plein (bool), carburants: [{ type, litres, montant }] }
     entretien { _id, date "AAAA-MM-JJ", km, type, nature "prevu" | "panne", montant, note }
     pièce     { _id, categorie, article, qte, marque, ref, prix, magasin }
   ========================================================================== */

const clone = o => JSON.parse(JSON.stringify(o));
const S = {
  veh: {},                      // fiche véhicule + assurance (clés de VEH_FIELDS et INS_FIELDS)
  ech: clone(DEFAULT_ECH),      // plan d'entretien
  pleins: [], entretiens: [], pieces: [],
  prefs: { ...DEFAULT_PREFS },
  editing: null,                // bloc de la fiche en cours de modification : "veh", "ins" ou null
  view: "home"                  // vue affichée
};

/* ==========================================================================
   3. OUTILS
   ========================================================================== */

/* --- DOM --- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
/** Échappe un texte saisi par l'utilisateur avant de l'insérer dans du HTML. */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Icône du jeu défini en haut de index.html (ex. icon("pump")). */
const icon = (name, style = "") => `<svg class="i"${style ? ` style="${style}"` : ""}><use href="#i-${name}"/></svg>`;
const CHEV = '<svg class="chev" viewBox="0 0 9 15"><path d="M1.5 1.5l6 6-6 6"/></svg>';
/** Remplit un champ sauf si l'utilisateur est en train d'y écrire. */
const setVal = (sel, v) => { const el = $(sel); if (document.activeElement !== el) el.value = v; };
/** Coche le bouton d'un sélecteur segmenté qui vérifie `test`. */
const setPressed = (sel, test) => $$(sel).forEach(b => b.setAttribute("aria-pressed", String(test(b))));
/** Affiche une liste de messages d'erreur ("e") ou d'avertissement ("w") dans la feuille ouverte. */
const showMsgs = (list, kind) => { $("#f-msg").innerHTML = list.map(m => `<div class="msg ${kind}">${esc(m)}</div>`).join(""); };
/** Message bref en haut de l'écran, effacé après 2 secondes. */
function toast(text) {
  const el = $("#toast");
  el.textContent = text; el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 2000);
}

/* --- Nombres --- */
/** Lit un nombre saisi à la française ("1 234,5") ; NaN si vide ou illisible. */
const num = v => {
  if (v === null || v === undefined || v === "") return NaN;
  return typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
};
/** Nombre au format français avec `d` décimales ; « — » s'il n'y a pas de valeur. */
const fmt = (n, d = 0) => isFinite(n) ? n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const eur = (n, d = 2) => isFinite(n) ? fmt(n, d) + " €" : "—";
const km = n => isFinite(n) ? fmt(n, 0) + " km" : "—";
const round2 = n => Math.round(n * 100) / 100;
/** Somme de fn(x) sur un tableau (les valeurs absentes comptent pour 0). */
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const cost = e => num(e.montant) || 0;

/* --- Dates --- */
/** Convertit une date enregistrée en objet Date. Une date sans heure est placée à midi
    pour ne jamais glisser d'un jour à cause du fuseau horaire. */
const D = s => !s ? null : s instanceof Date ? s : new Date(String(s).length <= 10 ? s + "T12:00:00" : s);
/** Date lisible (JJ/MM/AAAA par défaut, ou options Intl). */
const fd = (s, o) => { const d = D(s); return d && !isNaN(d) ? d.toLocaleDateString("fr-FR", o || { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"; };
const fdShort = s => fd(s, { day: "numeric", month: "short" });
/** Ajoute m mois ; le 31 janvier + 1 mois donne le 28/29 février et non le 3 mars. */
const addMonths = (d, m) => { const x = new Date(d), day = x.getDate(); x.setMonth(x.getMonth() + m); if (x.getDate() < day) x.setDate(0); return x; };
/** Clé de mois "AAAA-MM", pour regrouper les dépenses. */
const mkey = d => { const x = D(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); };
const today = () => new Date().toISOString().slice(0, 10);
/** Date et heure locales au format des champs datetime-local. */
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
/** « aujourd'hui », « hier », « il y a 12 j ». */
const ago = d => { const n = Math.round((Date.now() - new Date(d)) / DAY); return n <= 0 ? "aujourd'hui" : n === 1 ? "hier" : "il y a " + n + " j"; };

/* --- Texte --- */
/** Forme de comparaison : minuscules, sans accents ni espaces autour ("Pneu arrière" = "pneu arriere"). */
const norm = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

/* ==========================================================================
   4. STOCKAGE
   Format du fichier (format: 2) — NE PAS MODIFIER sans prévoir la relecture des anciennes sauvegardes :
     { app, format, version, exporte, vehicule, echeances, reglages, pleins[], entretiens[], pieces[], photo? }
   Dans le fichier l'identifiant s'appelle `id` ; en mémoire `_id`.
   ========================================================================== */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Lecture / écriture protégées : en navigation privée ou stockage plein, localStorage peut lever une erreur. */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};

/** Photographie de l'état, prête à être écrite. withPhoto = true pour le fichier de sauvegarde. */
function snapshot(withPhoto) {
  const out = ({ _id, ...rest }) => ({ id: _id, ...rest });
  const photo = withPhoto ? getPhoto() : null;
  return {
    ...(photo ? { photo } : {}),
    app: "carnet-auto", format: 2, version: VERSION, exporte: new Date().toISOString().slice(0, 16),
    vehicule: S.veh, echeances: S.ech, reglages: S.prefs,
    pleins: S.pleins.map(out), entretiens: S.entretiens.map(out), pieces: S.pieces.map(out)
  };
}

/** Enregistre l'état sur le téléphone. Renvoie false (et prévient) en cas d'échec. */
function persist() {
  const ok = store.set(KEY, JSON.stringify(snapshot()));
  if (!ok) toast("Impossible d'enregistrer sur ce téléphone");
  return ok;
}

/** Charge des données (stockage local ou fichier de sauvegarde) dans l'état, en tolérant les champs absents. */
function applyData(d) {
  const list = a => (Array.isArray(a) ? a : []).map(x => { const { id, ...rest } = x || {}; return { ...rest, _id: id || uid() }; });
  const obj = o => (o && typeof o === "object" ? o : {});
  S.veh = { ...obj(d.vehicule) };
  S.ech = d.echeances && Array.isArray(d.echeances.items) ? { ...d.echeances } : clone(DEFAULT_ECH);
  // on ne garde que les réglages connus : les options des anciennes versions (vue 3D…) disparaissent d'elles-mêmes
  const r = obj(d.reglages);
  S.prefs = Object.fromEntries(Object.keys(DEFAULT_PREFS).map(k => [k, k in r ? r[k] : DEFAULT_PREFS[k]]));
  S.pleins = list(d.pleins); S.entretiens = list(d.entretiens); S.pieces = list(d.pieces);
}

/** Remplace une partie de l'état (S[key] = value) puis enregistre ; annule si l'écriture échoue. */
function commit(key, value) {
  const before = S[key];
  S[key] = value;
  if (persist()) return true;
  S[key] = before;
  return false;
}
/** Ajoute (id absent) ou remplace un enregistrement de la collection "pleins" | "entretiens" | "pieces". */
function save(col, id, data) {
  const rec = { ...data, _id: id || uid() };
  const exists = S[col].some(x => x._id === rec._id);
  return commit(col, exists ? S[col].map(x => (x._id === rec._id ? rec : x)) : [...S[col], rec]);
}
const del = (col, id) => commit(col, S[col].filter(x => x._id !== id));

const lastBackup = () => store.get(KEY_BK);
/** Vrai si le carnet contient des données et que la dernière sauvegarde est plus vieille que le rappel choisi. */
function backupLate() {
  const every = num(S.prefs.rappel), last = lastBackup();
  return hasData() && every > 0 && (!last || (Date.now() - new Date(last)) / DAY > every);
}
const hasData = () => S.pleins.length > 0 || S.entretiens.length > 0;

/* ==========================================================================
   5. CALCULS
   Aucune fonction de cette section ne touche à l'affichage.
   ========================================================================== */

/** Pleins triés par kilométrage croissant (l'ordre de saisie n'est pas fiable). */
const pleinsByKm = () => S.pleins.slice().sort((a, b) => num(a.km) - num(b.km));
/** Total d'un plein, tous carburants confondus : { l: litres, e: euros }. */
const pleinTot = p => ({ l: sum(p.carburants || [], c => num(c.litres)), e: sum(p.carburants || [], c => num(c.montant)) });
/** Kilométrage actuel = le plus grand compteur connu (pleins, entretiens ou saisie manuelle). */
const curKm = () => Math.max(num(S.veh.kmManuel) || 0, ...S.pleins.map(p => num(p.km) || 0), ...S.entretiens.map(e => num(e.km) || 0));
const isPanne = e => e.nature === "panne";

/** Statistiques carburant depuis le premier plein. null tant qu'il n'y a pas deux pleins.
    Formule de la consommation : le premier plein sert seulement de point de départ (on ne sait pas
    combien de km il a permis), donc
        conso (L/100) = litres de tous les pleins SAUF le premier ÷ km parcourus × 100
    Ce calcul global reste juste même si la plupart des pleins sont partiels. */
function fuelStats() {
  const ps = pleinsByKm();
  if (ps.length < 2) return null;
  const first = ps[0], last = ps[ps.length - 1];
  const dist = num(last.km) - num(first.km);
  if (!(dist > 0)) return null;
  const tots = ps.map(pleinTot);
  const Lall = sum(tots, t => t.l), Eall = sum(tots, t => t.e);      // tout, premier plein compris
  const L = sum(tots.slice(1), t => t.l), E = sum(tots.slice(1), t => t.e);   // sans le premier plein
  const days = Math.max(1, (new Date() - D(first.date)) / DAY);
  return { dist, conso: L / dist * 100, eurKm: E / dist, Eall, Lall, first, last, days, kmMonth: dist / days * 30.44, n: ps.length };
}

/** État de chaque échéance du plan d'entretien.
    Pour chaque intervention on cherche sa dernière réalisation dans l'historique (même nom), puis :
        prochaine date = dernière date + intervalle en mois
        prochain km    = dernier km + intervalle en km
    État : "bad" si l'une des deux limites est dépassée, "warn" si on est à moins de seuilKm / seuilJours,
    "ok" sinon, "na" si l'intervention n'a jamais été enregistrée.
    prog = part de l'intervalle déjà consommée (0 à 1 et plus), la plus avancée des deux limites. */
function echStatus() {
  const ck = curKm(), now = new Date();
  const sk = num(S.ech.seuilKm) || 2000, sj = num(S.ech.seuilJours) || 30;
  return (S.ech.items || []).map(it => {
    let last = null;
    S.entretiens.filter(e => norm(e.type) === norm(it.nom)).forEach(h => {
      if (!last || D(h.date) > D(last.date) || (+D(h.date) === +D(last.date) && num(h.km) > num(last.km))) last = h;
    });
    const r = { ...it, last, status: "na", prog: 0, nextDate: null, nextKm: null };
    if (!last) return r;
    const ld = D(last.date), lk = num(last.km);
    if (num(it.mois) > 0) r.nextDate = addMonths(ld, num(it.mois));
    if (num(it.km) > 0 && isFinite(lk)) r.nextKm = lk + num(it.km);
    r.prog = Math.max(0, r.nextDate ? (now - ld) / (r.nextDate - ld) : 0, r.nextKm ? (ck - lk) / num(it.km) : 0);
    const over = (r.nextKm && ck >= r.nextKm) || (r.nextDate && now >= r.nextDate);
    const soon = (r.nextKm && ck >= r.nextKm - sk) || (r.nextDate && now >= new Date(r.nextDate - sj * DAY));
    r.status = over ? "bad" : soon ? "warn" : "ok";
    r.kmLeft = r.nextKm ? r.nextKm - ck : null;
    r.daysLeft = r.nextDate ? Math.round((r.nextDate - now) / DAY) : null;
    return r;
  });
}
/** Échéances triées de la plus urgente à la moins urgente. */
const sortedEch = () => echStatus().sort((a, b) => ST_ORDER[a.status] - ST_ORDER[b.status] || b.prog - a.prog);
/** Nombre d'échéances en retard et à prévoir. */
const countEch = st => ({ late: st.filter(r => r.status === "bad").length, soon: st.filter(r => r.status === "warn").length });

/** Dépenses par mois : { "AAAA-MM": { f: carburant, m: entretien } }. */
function monthly() {
  const m = {};
  const add = (date, key, v) => { const k = mkey(date); (m[k] = m[k] || { f: 0, m: 0 })[key] += v; };
  S.pleins.forEach(p => { if (p.date) add(p.date, "f", pleinTot(p).e); });
  S.entretiens.forEach(e => { if (e.date && cost(e) > 0) add(e.date, "m", cost(e)); });
  return m;
}

/** Coût total de détention depuis le premier plein :
        total = carburant + entretiens depuis ce jour + assurance au prorata (cotisation annuelle ÷ 365,25 × jours)
        coût au km = total ÷ km parcourus      coût par mois = total ÷ jours × 30,44 */
function tco() {
  const fs = fuelStats();
  if (!fs) return null;
  const start = D(fs.first.date);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days = Math.max(1, (new Date() - start) / DAY);
  const fuel = fs.Eall;
  const maint = sum(S.entretiens.filter(e => D(e.date) >= startDay), cost);
  const ins = (num(S.veh.cotisation) || 0) / 365.25 * days;
  const total = fuel + maint + ins, kmd = curKm() - num(fs.first.km);
  return { start, days, fuel, maint, ins, total, kmd, perKm: total / kmd, perMonth: total / days * 30.44 };
}

/** Coût de la voiture sur les `days` derniers jours (0 = depuis le début) : base de l'indicateur de santé.
    - Le plein précédant la période sert de point de départ du compteur ; s'il n'existe pas, la période
      est « partielle » et démarre au premier plein (qui, lui, n'est pas compté : voir fuelStats).
    - Carburant : coût au km mesuré entre pleins, appliqué à tous les km de la période
      (pour couvrir aussi les km roulés depuis le dernier plein).
    - Entretien séparé en prévu / pannes ; assurance et perte de valeur au prorata des jours.
        coût au km = (carburant + prévu + pannes + assurance + perte de valeur) ÷ km de la période */
function periodStats(days) {
  const ps = pleinsByKm();
  if (ps.length < 2) return null;
  const now = new Date();
  const from = days ? new Date(now - days * DAY) : D(ps[0].date);
  const before = ps.filter(p => D(p.date) < from).slice(-1)[0];       // dernier plein avant la période
  const inside = ps.filter(p => D(p.date) >= from);
  const start = before || inside[0];
  if (!start) return null;
  const fills = before ? inside : inside.slice(1);                    // pleins dont on compte les litres
  const lastFill = inside.length ? inside[inside.length - 1] : before;
  const since = before ? from : D(start.date);
  const kmFuel = num(lastFill.km) - num(start.km);                    // km couverts par les pleins comptés
  const kmTot = curKm() - num(start.km);                              // km de la période
  const covered = Math.max(1, (now - since) / DAY);                   // jours de la période
  const L = sum(fills, p => pleinTot(p).l), F = sum(fills, p => pleinTot(p).e);
  const fuelPerKm = kmFuel > 0 ? F / kmFuel : NaN;
  const es = S.entretiens.filter(e => D(e.date) >= (before ? from : new Date(since.toDateString())));
  const pannes = es.filter(isPanne);
  const prevu = sum(es.filter(e => !isPanne(e)), cost), panne = sum(pannes, cost);
  const ins = (num(S.veh.cotisation) || 0) / 365.25 * covered;
  const dec = num(S.prefs.decote) > 0 ? num(S.prefs.decote) / 365.25 * covered : 0;
  const fuel = fuelPerKm * kmTot;
  const total = fuel + prevu + panne + ins + dec;
  return { from: since, partial: !before, covered, kmTot, kmFuel, conso: kmFuel > 0 ? L / kmFuel * 100 : NaN,
    fuelPerKm, fuel, prevu, panne, nbPanne: pannes.length, ins, dec, total, perKm: kmTot > 0 ? total / kmTot : NaN };
}

/* ==========================================================================
   6. AFFICHAGE DES VUES
   Une fonction render… par vue. Chacune relit l'état et réécrit entièrement ses blocs HTML.
   ========================================================================== */

/** Ligne de liste : texte principal, texte secondaire, valeur à droite (HTML déjà échappé par l'appelant). */
const rowHTML = (title, sub, value, before = "", vCls = "") =>
  `<div class="row">${before}<span class="body"><span class="t"><span>${title}</span></span><span class="s">${sub}</span></span>${value != null ? `<span class="v ${vCls}">${value}</span>` : ""}</div>`;
const emptyHTML = text => `<div class="empty">${text}</div>`;
/** Grille de chiffres clés : liste de [libellé, valeur, unité, précision]. */
const kpiHTML = list => list.map(x => `<div class="kpi"><div class="k">${x[0]}</div><div class="v">${x[1]}<small>${x[2]}</small></div><div class="d">${esc(x[3])}</div></div>`).join("");
/** Classe de couleur de l'étiquette d'un carburant. */
const chipCls = t => ({ e85: "e85", sp98: "sp98" }[norm(t)] || "");
/** Vignette calendrier (mois + jour) d'une date clé. */
const calBadge = d => `<span class="d"><span>${MONTHS[d.getMonth()].replace(".", "")}</span><b>${d.getDate()}</b></span>`;

/* ---------- Accueil ---------- */
function renderHome() {
  const v = S.veh, fs = fuelStats(), t = tco();
  const st = sortedEch(), { late, soon } = countEch(st);
  const urgent = st.find(r => r.status === "bad" || r.status === "warn");
  const lastFill = pleinsByKm().slice(-1)[0], lb = lastBackup(), bkLate = backupLate();

  // en-tête : marque, modèle, compteur, consommation, plaque, état de l'entretien
  $("#h-brand").textContent = v.marque || "Mon véhicule";
  $("#h-model").textContent = v.modele || "Ma voiture";
  $("#h-km").textContent = km(curKm());
  $("#h-conso").textContent = fs ? fmt(fs.conso, 1) + " L/100 km" : (v.carburant || "");
  $("#h-plate").textContent = v.immat || "—";
  $("#h-plate-w").hidden = !v.immat;
  $("#h-state").innerHTML = !hasData() ? ""
    : late ? `<span class="dot d-bad"></span>${plural(late, "entretien")} en retard`
    : soon ? `<span class="dot d-warn"></span>${plural(soon, "entretien")} à prévoir`
    : '<span class="dot d-ok"></span>Entretien à jour';

  // photo de la voiture, ou cadre « ajoute une photo »
  const photo = getPhoto();
  $("#photo").hidden = !photo;
  $("#photo-empty").hidden = !!photo;
  if (photo && $("#photo-img").getAttribute("src") !== photo) $("#photo-img").src = photo;

  // carte de bienvenue tant que le carnet est vide
  $("#welcome").hidden = hasData() || !!v.marque;

  // rangées d'accès aux vues : [vue, couleur de l'icône, icône, titre, sous-titre, valeur]
  const dot = cls => `<span class="dot ${cls}" style="margin-top:5px"></span>`;
  const rows = [
    ["entretien", "var(--orange)", "wrench", "Entretien",
      urgent ? `${dot(ST[urgent.status][3])}${esc(urgent.nom)} · ${ST[urgent.status][0].toLowerCase()}` : st.length ? "Tout est à jour" : "Aucune échéance",
      late + soon ? `<span class="pill ${late ? "s-bad" : "s-warn"}">${late + soon}</span>` : ""],
    ["pleins", "var(--accent)", "pump", "Pleins",
      lastFill ? `Dernier ${fdShort(lastFill.date)} · ${eur(pleinTot(lastFill).e)} · ${esc(lastFill.station || "")}` : "Aucun plein",
      fs ? `<b>${fmt(fs.conso, 1)}</b> L/100` : ""],
    ["couts", "var(--green)", "bars", "Coûts",
      t ? `${fmt(t.perKm, 2)} €/km tout compris` : "Disponible après 2 pleins",
      t ? `<b>${fmt(t.perMonth, 0)} €</b>/mois` : ""],
    ["vehicule", "#5e5ce6", "car2", "Véhicule",
      [v.immat, v.assureur].filter(Boolean).map(esc).join(" · ") || "Fiche, pneus, assurance", ""],
    ["reglages", "#8e8e93", "sun", "Réglages",
      (bkLate ? dot("d-warn") : "") + (lb ? "Sauvegarde " + ago(lb) : "Aucune sauvegarde"),
      bkLate ? '<span class="pill s-warn">Sauvegarder</span>' : ""]
  ];
  $("#home-rows").innerHTML = rows.map(([go, color, ic, title, sub, val]) =>
    `<button class="row has-ic" data-go="${go}"><span class="ic" style="background:${color}">${icon(ic)}</span><span class="body"><span class="t"><span>${title}</span></span><span class="s">${sub}</span></span><span class="v">${val}</span>${CHEV}</button>`).join("");

  $("#home-foot").textContent = v.premiereImmat
    ? `1re immatriculation le ${fd(v.premiereImmat)} · ${Math.floor((Date.now() - D(v.premiereImmat)) / (365.25 * DAY))} ans` : "";
}

/* ---------- Pleins ---------- */
function renderPleins() {
  const fs = fuelStats(), m = monthly(), now = new Date();

  // chiffres clés
  $("#kpis-fuel").innerHTML = fs ? kpiHTML([
    ["Conso moyenne", fmt(fs.conso, 2), "L/100", "total litres ÷ total km"],
    ["Carburant au km", fmt(fs.eurKm, 3), "€", "sur " + km(fs.dist)],
    ["Dépensé", fmt(fs.Eall, 0), "€", fs.n + " pleins · " + fmt(fs.Lall, 0) + " L"],
    ["Ce mois-ci", fmt((m[mkey(now)] || { f: 0 }).f, 0), "€", MONTHS[now.getMonth()] + " " + now.getFullYear()]
  ]) : "";

  // litres, euros et prix moyen par type de carburant (le plus utilisé en premier)
  const by = {};
  S.pleins.forEach(p => (p.carburants || []).forEach(c => {
    const o = by[c.type || "?"] = by[c.type || "?"] || { l: 0, e: 0 };
    o.l += num(c.litres) || 0; o.e += num(c.montant) || 0;
  }));
  const types = Object.keys(by).sort((a, b) => by[b].l - by[a].l);
  $("#fuel-types").innerHTML = types.length ? types.map(t =>
    `<div class="row"><span class="chip ${chipCls(t)}">${esc(t)}</span><span class="body"><span class="s" style="margin:0">${fmt(by[t].l, 1)} L · ${eur(by[t].e, 0)}</span></span><span class="v"><b>${fmt(by[t].e / by[t].l, 3)}</b> €/L</span></div>`).join("")
    : emptyHTML("Aucun plein pour l'instant.");

  // historique, du plus récent au plus ancien, regroupé par mois ; « +xxx km » = distance depuis le plein précédent
  const asc = pleinsByKm();
  let html = "", curMonth = "";
  for (let i = asc.length - 1; i >= 0; i--) {
    const p = asc[i], key = mkey(p.date), t = pleinTot(p);
    const dist = i > 0 ? num(p.km) - num(asc[i - 1].km) : null;
    if (key !== curMonth) {
      const d = D(p.date);
      html += `${curMonth ? "</div>" : ""}<div class="sec-h"><span>${MONTHS[d.getMonth()]} ${d.getFullYear()}</span><span>${eur((m[key] || { f: 0 }).f, 0)}</span></div><div class="group">`;
      curMonth = key;
    }
    const chips = (p.carburants || []).map(c => `<span class="chip ${chipCls(c.type)}">${esc(c.type)}</span>`).join("") + (p.plein ? '<span class="chip full">Plein</span>' : "");
    html += `<button class="row" data-plein="${esc(p._id)}"><span class="body"><span class="t"><span>${esc(p.station || "Station")}</span>${chips}</span><span class="s"><span>${fdShort(p.date)}</span><span>${km(num(p.km))}</span>${dist != null ? `<span>+${fmt(dist)} km</span>` : ""}</span></span><span class="v"><b>${eur(t.e)}</b><br><span style="font-size:13px">${fmt(t.l, 2)} L · ${fmt(t.e / t.l, 3)} €/L</span></span></button>`;
  }
  $("#fuel-list").innerHTML = html + (curMonth ? "</div>" : "");
}

/* ---------- Entretien ---------- */
/** Ligne d'une échéance : dernière réalisation, reste à parcourir, barre de progression, état. */
function dueRow(r) {
  const st = ST[r.status];
  let meta = "Aucune intervention enregistrée", bar = "";
  if (r.status !== "na") {
    const left = [];
    if (r.nextKm) left.push(r.kmLeft >= 0 ? "dans " + km(r.kmLeft) : "dépassé de " + km(-r.kmLeft));
    if (r.nextDate) left.push(r.daysLeft < 0 ? "depuis le " + fd(r.nextDate)
      : r.daysLeft > 60 ? "avant " + fd(r.nextDate, { month: "short", year: "numeric" }) : "dans " + r.daysLeft + " j");
    meta = `Fait le ${fd(r.last.date)}${isFinite(num(r.last.km)) ? " à " + km(num(r.last.km)) : ""}<br>${left.join(" · ")}`;
    bar = `<div class="bar"><span class="${st[2]}" style="width:${Math.max(3, Math.min(100, Math.round(r.prog * 100)))}%"></span></div>`;
  }
  return `<div class="row"><span class="body"><span class="t"><span>${esc(r.nom)}</span></span><span class="s" style="display:block">${meta}</span>${bar}</span><span class="pill ${st[1]}">${st[0]}</span></div>`;
}
function renderEntretien() {
  // échéances
  const st = sortedEch(), { late, soon } = countEch(st);
  $("#due-full").innerHTML = st.length ? st.map(dueRow).join("") : emptyHTML("Aucune échéance. Ajoute des intervalles dans Réglages.");
  $("#due-sum").textContent = [late ? late + " en retard" : "", soon ? soon + " à prévoir" : ""].filter(Boolean).join(" · ");

  // historique, du plus récent au plus ancien
  const es = S.entretiens.slice().sort((a, b) => D(b.date) - D(a.date) || num(b.km) - num(a.km));
  $("#maint-total").textContent = es.length ? eur(sum(es, cost), 0) : "";
  $("#maint-list").innerHTML = es.length ? es.map(e =>
    `<button class="row" data-ent="${esc(e._id)}"><span class="body"><span class="t"><span>${esc(e.type)}</span>${isPanne(e) ? '<span class="chip panne">Panne</span>' : ""}</span><span class="s"><span>${fd(e.date)}</span><span>${km(num(e.km))}</span>${e.note ? `<span>${esc(e.note)}</span>` : ""}</span></span><span class="v">${cost(e) > 0 ? `<b>${eur(cost(e))}</b>` : "—"}</span></button>`).join("")
    : emptyHTML("Aucun entretien. Touche « + » pour en ajouter un.");

  // pièces de rechange, regroupées par catégorie
  const groups = {};
  S.pieces.forEach(p => (groups[p.categorie || "Divers"] = groups[p.categorie || "Divers"] || []).push(p));
  const price = p => num(p.prix);
  $("#pieces").innerHTML = Object.keys(groups).map((g, i) =>
    `${i ? '<div style="height:12px"></div>' : ""}<div class="group"><div class="row" style="min-height:40px"><span class="body"><span class="t"><span style="font-weight:600">${esc(g)}</span></span></span><span class="v">${eur(sum(groups[g], price))}</span></div>${groups[g].map(p =>
      `<button class="row" data-piece="${esc(p._id)}"><span class="body"><span class="t"><span style="white-space:normal">${esc(p.article)}</span></span><span class="s"><span>${esc(p.qte)}</span><span>${esc(p.marque)}</span><span style="font-family:var(--f-m);font-size:13px">${esc(p.ref)}</span><span>${esc(p.magasin)}</span></span></span><span class="v"><b>${eur(price(p))}</b></span></button>`).join("")}</div>`).join("")
    || `<div class="group">${emptyHTML("Note ici les références de tes pièces pour les racheter facilement.")}</div>`;
}

/* ---------- Coûts ---------- */
/** Carte « Santé de la voiture ».
    Verdict : coût au km des 12 derniers mois comparé au coût acceptable (Réglages) :
        ≤ seuil = raisonnable · ≤ seuil × 1,25 = à surveiller · au-delà = trop chère
    Trois signaux d'usure complètent le verdict :
      - tendance : coût au km des 3 derniers mois contre celui des 12 mois (écart de plus de 8 %) ;
      - pannes : alerte si elles dépassent 500 € et la moitié des frais d'atelier ;
      - consommation : alerte si les 3 derniers mois dépassent de 10 % la moyenne générale. */
function renderHealth() {
  const y = periodStats(365), q = periodStats(91), all = periodStats(0);
  if (!y || !(y.kmTot > 0)) { $("#health").innerHTML = emptyHTML("L'indicateur apparaîtra après deux pleins."); $("#health-f").textContent = ""; return; }

  const seuil = num(S.prefs.seuil) > 0 ? num(S.prefs.seuil) : 0.25, v = y.perKm;
  const lvl = v <= seuil ? "ok" : v <= seuil * 1.25 ? "warn" : "bad";
  const [verdict, verdictCls] = { ok: ["Raisonnable", "s-ok"], warn: ["À surveiller", "s-warn"], bad: ["Trop chère", "s-bad"] }[lvl];
  // jauge : position en % d'une valeur, l'échelle s'étire pour que le curseur reste visible
  const max = Math.max(seuil * 1.6, v * 1.1), pct = x => Math.min(100, x / max * 100);
  // tendance (ignorée s'il y a moins de 300 km sur 3 mois : pas assez représentatif)
  const recent = q && q.kmTot > 300 ? q.perKm : NaN;
  const dv = isFinite(recent) ? (recent - v) / v * 100 : NaN;
  const trendCls = dv > 8 ? "trend-up" : dv < -8 ? "trend-down" : "trend-flat";
  const trendTxt = !isFinite(dv) ? "pas assez de recul" : Math.abs(dv) <= 8 ? "stable" : (dv > 0 ? "+" : "") + fmt(dv, 0) + " %";
  // part des pannes dans les frais d'atelier
  const atelier = y.prevu + y.panne, share = atelier > 0 ? y.panne / atelier * 100 : 0;
  const usure = y.panne > 500 && share > 50 ? "warn" : "ok";
  // dérive de la consommation (il faut au moins 800 km sur 3 mois)
  const dc = q && isFinite(q.conso) && all && isFinite(all.conso) && q.kmFuel > 800 ? (q.conso - all.conso) / all.conso * 100 : NaN;
  const consoLvl = dc > 10 ? "warn" : "ok";
  const dot = l => `<span class="dot d-${l}" style="margin-top:6px"></span>`;

  $("#health").innerHTML = `<div class="top"><div class="big">${fmt(v, 2)}<small>€/km</small></div><span class="verdict ${verdictCls}">${verdict}</span></div>
    <div class="sub">Coût de la voiture ${y.partial ? "depuis le " + fd(y.from) : "sur les 12 derniers mois"} · ${km(y.kmTot)}</div>
    <div class="meter"><span style="width:${pct(seuil)}%;background:var(--green)"></span><span style="width:${pct(seuil * 1.25) - pct(seuil)}%;background:var(--orange)"></span><span style="flex:1;background:var(--red)"></span><i style="left:${pct(v)}%"></i></div>
    <div class="meter-l"><span>0</span><span style="margin-left:${Math.max(0, pct(seuil) - 12)}%">acceptable : ${fmt(seuil, 2)} €</span><span></span></div>`
    + rowHTML("Tendance sur 3 mois", isFinite(recent) ? fmt(recent, 2) + " €/km ces 3 derniers mois" : "Il faut au moins 3 mois de données", `<b style="color:inherit">${trendTxt}</b>`, "", trendCls)
    + rowHTML("Réparations imprévues", y.nbPanne ? `${plural(y.nbPanne, "panne")} · ${fmt(share, 0)} % des frais d'atelier` : "Aucune panne enregistrée", `<b>${eur(y.panne, 0)}</b>`, dot(usure))
    + rowHTML("Consommation", isFinite(dc) ? `${fmt(q.conso, 1)} L/100 sur 3 mois, contre ${fmt(all.conso, 1)} en moyenne` : "Il faut plus de recul pour comparer", isFinite(dc) ? `<b>${dc > 0 ? "+" : ""}${fmt(dc, 0)} %</b>` : "—", dot(consoLvl))
    + rowHTML("Détail", `Carburant ${eur(y.fuel, 0)} · Entretien ${eur(y.prevu, 0)} · Réparations ${eur(y.panne, 0)} · Assurance ${eur(y.ins, 0)}${y.dec ? " · Perte de valeur " + eur(y.dec, 0) : ""}`);

  $("#health-f").textContent = [
    lvl === "bad" && "La voiture dépasse nettement ton coût acceptable.",
    usure === "warn" && "Les pannes représentent plus de la moitié des frais d'atelier : signe d'usure à surveiller.",
    consoLvl === "warn" && "La consommation augmente de plus de 10 % : sur une hybride, c'est souvent le premier signe d'usure (pneus, freins qui frottent, batterie hybride).",
    !y.dec && "Perte de valeur non incluse : tu peux l'ajouter dans Réglages."
  ].filter(Boolean).join(" ");
}

/** Histogramme empilé des 12 derniers mois (carburant en bas, entretien au-dessus), dessiné en SVG.
    Redessiné quand la largeur change, pour que les textes gardent leur taille. */
function renderChart() {
  const el = $("#chart-month"), m = monthly(), all = Object.keys(m).sort();
  if (!all.length) { el.innerHTML = emptyHTML("Pas encore de dépenses."); return; }

  // mois affichés : jusqu'à 12, sans remonter avant le premier plein
  const firstFill = pleinsByKm()[0];
  const startKey = firstFill && firstFill.date ? String(firstFill.date).slice(0, 7) : all[0];
  const keys = [], cursor = new Date(); cursor.setDate(1);
  for (let i = 0; i < 12 && mkey(cursor) >= startKey; i++) { keys.unshift(mkey(cursor)); cursor.setMonth(cursor.getMonth() - 1); }
  if (!keys.length) keys.push(all[all.length - 1]);
  const val = k => m[k] || { f: 0, m: 0 };

  // géométrie : marges, échelle verticale arrondie à un pas lisible
  const W = Math.max(300, Math.round(el.clientWidth || 600)), H = 210, pl = 34, pr = 4, pt = 20, pb = 24;
  const iw = W - pl - pr, ih = H - pt - pb;
  const max = Math.max(1, ...keys.map(k => val(k).f + val(k).m));
  const step = max > 800 ? 250 : max > 400 ? 100 : max > 150 ? 50 : 25, top = Math.ceil(max / step) * step;
  const y = v => pt + ih - (v / top) * ih;
  const bw = Math.min(30, iw / keys.length * 0.56), r = Math.min(6, bw / 2);     // largeur et arrondi des barres

  let g = "";
  for (let v = 0; v <= top; v += step)
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--sep)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
  /** Barre du sol jusqu'à la hauteur yTop, coins du haut arrondis si `rounded`. */
  const bar = (cx, yTop, rounded, fill) => {
    const x0 = cx - bw / 2, x1 = cx + bw / 2;
    const head = rounded ? `V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x1 - r} Q${x1},${yTop} ${x1},${yTop + r}` : `V${yTop} H${x1}`;
    return `<path d="M${x0},${y(0)} ${head} V${y(0)} Z" fill="${fill}"/>`;
  };
  keys.forEach((k, i) => {
    const cx = pl + iw / keys.length * (i + 0.5), { f, m: mt } = val(k), month = +k.split("-")[1];
    if (f + mt > 0) {
      g += bar(cx, y(f + mt), true, "var(--c-maint)") + bar(cx, y(f), !(mt > 0), "var(--c-fuel)");      // le carburant recouvre le bas
      g += `<text x="${cx}" y="${y(f + mt) - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink)">${Math.round(f + mt)}</text>`;
    }
    // sur écran étroit avec beaucoup de mois : initiale seulement
    g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${keys.length > 8 && W < 500 ? "JFMAMJJASOND"[month - 1] : MONTHS[month - 1]}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dépenses mensuelles en euros">${g}</svg>`;
}

function renderCouts() {
  renderHealth();
  const fs = fuelStats(), t = tco();

  // chiffres clés depuis le début
  const k = [];
  if (t) k.push(["Coût réel / mois", fmt(t.perMonth, 0), "€", "tout compris"], ["Coût au km", fmt(t.perKm, 2), "€", "tout compris"]);
  if (fs) k.push(["Conso moyenne", fmt(fs.conso, 1), "L/100", "sur " + km(fs.dist)], ["Rythme", fmt(fs.kmMonth, 0), "km/mois", "depuis le " + fd(fs.first.date)]);
  $("#kpis").innerHTML = k.length ? kpiHTML(k) : '<div class="kpi" style="grid-column:1/-1"><div class="d">Les chiffres apparaîtront après deux pleins.</div></div>';

  renderChart();

  // coût total de détention : barre de répartition puis une ligne par poste
  if (!t) { $("#tco").innerHTML = emptyHTML("Disponible après deux pleins."); $("#tco-period").textContent = ""; return; }
  const parts = [["Carburant", t.fuel, "var(--c-fuel)"], ["Entretien", t.maint, "var(--c-maint)"], ["Assurance", t.ins, "var(--c-ins)"]];
  $("#tco").innerHTML =
    `<div class="row" style="display:block;padding-top:14px"><div class="split">${parts.map(p => `<span style="width:${(p[1] / t.total * 100).toFixed(2)}%;background:${p[2]}"></span>`).join("")}</div></div>`
    + parts.map(p => rowHTML(p[0], `${fmt(p[1] / t.total * 100, 0)} % · ${fmt(p[1] / t.kmd, 3)} €/km`, `<b>${eur(p[1], 0)}</b>`, `<span class="dot" style="background:${p[2]};width:10px;height:10px;border-radius:3px"></span>`)).join("")
    + rowHTML("Total", `${fmt(t.perKm, 3)} €/km`, `<b>${eur(t.total, 0)}</b>`);
  $("#tco-period").textContent = "Depuis le " + fd(t.start) + ", sur " + km(t.kmd) + ". L'assurance est comptée au prorata de la cotisation annuelle.";
}

/* ---------- Véhicule ---------- */
/** Champs d'un bloc de la fiche ; modifiables seulement si ce bloc est en cours de modification. */
function fieldsHTML(fields, group) {
  const editing = S.editing === group;
  return fields.map(([key, label, type]) =>
    `<div class="field"><label for="kv-${key}">${label}</label><input id="kv-${key}" ${type === "date" ? 'type="date"' : type === "num" ? 'inputmode="decimal"' : ""} value="${esc(S.veh[key] ?? "")}" ${editing ? "" : "disabled"} placeholder="${editing ? "" : "—"}"></div>`).join("");
}
function renderVehicule() {
  $("#kv-veh").innerHTML = fieldsHTML(VEH_FIELDS, "veh");
  $("#kv-ins").innerHTML = fieldsHTML(INS_FIELDS, "ins");
  $$("[data-edit]").forEach(b => { b.textContent = S.editing === b.dataset.edit ? "OK" : "Modifier"; });

  // pneus : km parcourus depuis le dernier entretien « Pneu avant » / « Pneu arrière »
  const ck = curKm();
  $("#tyres").innerHTML = [["Avant", "avant"], ["Arrière", "arriere"]].map(([label, pos]) => {
    const last = S.entretiens.filter(e => norm(e.type) === "pneu " + pos).sort((a, b) => D(b.date) - D(a.date))[0];
    return rowHTML(label, last ? "Montés le " + fd(last.date) + (last.note ? " · " + esc(last.note) : "") : esc(S.veh.pneus || "Aucun changement enregistré"), last ? `<b>${km(ck - num(last.km))}</b>` : "—");
  }).join("");

  // dates clés
  const dates = keyDates();
  $("#key-dates").innerHTML = dates.length
    ? dates.map(e => `<div class="row cal-ev">${calBadge(e.date)}<span class="body"><span class="t"><span>${esc(e.title)}</span></span><span class="s">${fd(e.date)} · ${esc(e.note)}</span></span></div>`).join("")
    : emptyHTML("Renseigne la date d'effet de l'assurance et ton dernier contrôle technique pour voir les dates clés.");
}

/* ---------- Réglages ---------- */
function renderReglages() {
  const p = S.prefs;
  setPressed("#theme-seg button", b => b.dataset.themeV === p.theme);

  // calendrier : prochaine date clé
  const next = keyDates()[0];
  $("#cal-next").textContent = next ? "Prochaine : " + next.title + " le " + fd(next.date) : "Renseigne la date d'effet de l'assurance";

  // photo
  const photo = getPhoto();
  $("#photo-thumb").hidden = !photo;
  if (photo) $("#photo-thumb").src = photo;
  $("#photo-state").textContent = photo ? "Photo enregistrée" : "Aucune photo";
  $("#photo-pick").textContent = photo ? "Changer de photo" : "Choisir une photo";
  $("#photo-del").hidden = !photo;
  $("#pref-detour").checked = p.detour !== false;

  // nouveau plein
  $("#pref-fuel").innerHTML = '<option value="auto">Le dernier utilisé</option>' + FUELS.map(f => `<option ${p.carburant === f ? "selected" : ""}>${f}</option>`).join("");
  setVal("#pref-station", p.station || "");

  // intervalles d'entretien (on ne réécrit pas le tableau pendant une saisie)
  if (!document.activeElement || !document.activeElement.closest("#ech-edit"))
    $("#ech-edit").innerHTML = '<span class="h">Intervention</span><span class="h" style="text-align:right">mois</span><span class="h" style="text-align:right">km</span>'
      + (S.ech.items || []).map((it, i) => `<span>${esc(it.nom)}</span><span><input id="em-${i}" inputmode="numeric" value="${esc(it.mois ?? "")}" aria-label="${esc(it.nom)} en mois"></span><span><input id="ek-${i}" inputmode="numeric" value="${esc(it.km ?? "")}" aria-label="${esc(it.nom)} en km"></span>`).join("");
  setVal("#seuil-km", S.ech.seuilKm ?? 2000);
  setVal("#seuil-j", S.ech.seuilJours ?? 30);

  // indicateur de coût
  setVal("#pref-seuil", fmt(num(p.seuil) || 0.25, 2));
  setVal("#pref-decote", num(p.decote) > 0 ? p.decote : "");

  // sauvegarde, à propos, journal des versions
  const lb = lastBackup();
  $("#pref-rappel").value = String(p.rappel ?? 30);
  $("#last-backup").textContent = lb ? "dernière " + ago(lb) : "jamais faite";
  $("#about-v").textContent = VERSION;
  $("#about-d").textContent = `${S.pleins.length} pleins · ${S.entretiens.length} entretiens`;
  $("#changelog").innerHTML = CHANGELOG.map((e, i) =>
    `<details class="row" style="display:block" ${i === 0 ? "open" : ""}><summary style="list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px"><span class="t" style="flex:1"><span>${e.titre || "Version " + e.v}</span>${e.v === VERSION ? '<span class="pill s-ok">Installée</span>' : ""}</span><span class="v" style="font-size:15px">${e.date}</span></summary><ul style="margin:8px 0 2px;padding-left:20px;color:var(--ink-2);font-size:15px;line-height:1.45">${e.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>`).join("");
}

/* ---------- Thème ---------- */
/** Applique le thème choisi (ou celui de l'iPhone en mode automatique) et la couleur de la barre d'état.
    Le même calcul est fait avant l'affichage par le petit script de index.html. */
function applyTheme() {
  const t = S.prefs.theme;
  const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  $$('meta[name="theme-color"]').forEach(m => m.setAttribute("content", dark ? "#000000" : "#f2f2f7"));
}

/* ==========================================================================
   7. NAVIGATION
   Six vues (<section id="v-…">) dont une seule est visible. L'adresse garde la vue (#pleins…)
   pour revenir au même endroit après un rechargement.
   ========================================================================== */

const RENDER = { home: renderHome, pleins: renderPleins, entretien: renderEntretien, couts: renderCouts, vehicule: renderVehicule, reglages: renderReglages };
const VIEWS = Object.keys(RENDER);
/** Redessine la vue affichée (à appeler après chaque modification de l'état). */
const refresh = () => RENDER[S.view]();

/** Affiche la vue `v` : masque les autres, met à jour onglet, titre et adresse, puis la dessine. */
function go(v) {
  if (!RENDER[v]) v = "home";
  S.view = v;
  closeSheet(); closeMenu();
  VIEWS.forEach(k => { $("#v-" + k).hidden = k !== v; });
  const section = $("#v-" + v);
  const tab = section.dataset.parent || v;                            // Véhicule et Réglages gardent l'onglet Accueil allumé
  $$("#tabbar button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  $("#tb-title").textContent = section.dataset.title || "";
  $("#tb-back").hidden = !section.dataset.parent;
  if (location.hash.slice(1) !== v) history.replaceState(null, "", "#" + v);
  refresh();                                                          // après l'affichage : le graphique a besoin de sa largeur
  window.scrollTo(0, 0); onScroll();
}

/** Au défilement : barre de titre visible dès qu'on a quitté le grand titre,
    dock réduit en descendant et rétabli en remontant. */
let lastY = 0;
function onScroll() {
  const y = window.scrollY, dock = $("#dock");
  $("#topbar").classList.toggle("show", S.view !== "home" && y > 52);
  if (y > lastY + 6 && y > 80) dock.classList.add("min");
  else if (y < lastY - 6 || y < 40) dock.classList.remove("min");
  lastY = y;
}

/* Menu du bouton « + » */
function setMenu(open) {
  $("#menu").hidden = $("#scrim").hidden = !open;
  $("#plus").setAttribute("aria-expanded", String(open));
}
const closeMenu = () => setMenu(false);

/** Actions déclenchées par les éléments data-act="…". */
const ACTIONS = {
  plein: () => openPlein(null),
  entretien: () => openEnt(null),
  piece: () => openPiece(null),
  backup: backupNow,
  calendar: openCalendar,
  "csv-fuel": exportFuel,
  "csv-maint": exportMaint
};

/** Un seul écouteur de clic pour toute la page : il lit les attributs data-… de l'élément touché.
    Les lignes créées par les rendus fonctionnent ainsi sans écouteur propre. */
function onClick(e) {
  const el = e.target.closest("[data-tab],[data-go],[data-act],[data-plein],[data-ent],[data-piece],[data-edit],[data-theme-v]");
  if (!el) return;
  const d = el.dataset, find = (col, id) => S[col].find(x => x._id === id);
  if (d.tab) { if (d.tab === S.view) window.scrollTo({ top: 0, behavior: "smooth" }); else go(d.tab); }   // retoucher l'onglet courant remonte en haut
  else if (d.go) { go(d.go); if (d.editAfter && S.editing !== d.editAfter) toggleEdit(d.editAfter); }
  else if (d.act) { closeMenu(); ACTIONS[d.act](); }
  else if (d.plein) openPlein(find("pleins", d.plein));
  else if (d.ent) openEnt(find("entretiens", d.ent));
  else if (d.piece) openPiece(find("pieces", d.piece));
  else if (d.edit) toggleEdit(d.edit);
  else if (d.themeV) { S.prefs.theme = d.themeV; persist(); applyTheme(); refresh(); }
}

/* ==========================================================================
   8. FEUILLES
   Panneau qui monte du bas de l'écran (formulaire, confirmation, mode d'emploi). Une seule à la fois.
   ========================================================================== */

let sheetOff = null;      // retire les écouteurs de la feuille ouverte

function closeSheet() {
  if (sheetOff) { sheetOff(); sheetOff = null; }
  $("#sheet-root").innerHTML = "";
  document.body.style.overflow = "";
}

/** Ouvre une feuille. `html` = contenu sous le titre ; `onMount` est appelé une fois le contenu en place.
    Fermeture : bouton ✕, tout élément [data-close], toucher le voile, Échap, ou glisser vers le bas. */
function sheet(title, html, onMount) {
  $("#sheet-root").innerHTML = `<div class="sheet-bg" id="sbg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab" id="grab"></div><div class="sh-head"><button class="gl gl-circle" data-close aria-label="Fermer">${icon("close", "width:18px;height:18px")}</button><h2>${esc(title)}</h2><span style="width:38px"></span></div>${html}</div></div>`;
  document.body.style.overflow = "hidden";                            // la page derrière ne défile plus
  const bg = $("#sbg"), sh = $(".sheet"), grab = $("#grab");
  bg.addEventListener("click", e => { if (e.target === bg || e.target.closest("[data-close]")) closeSheet(); });

  // glisser la poignée ou l'en-tête vers le bas : la feuille suit le doigt et se ferme au-delà de 110 px
  let y0 = null, dy = 0;
  const down = e => { if (sh.scrollTop > 0 && e.target !== grab) return; y0 = e.clientY; dy = 0; sh.style.transition = "none"; };
  const move = e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); if (dy > 4) sh.style.transform = `translateY(${dy}px)`; };
  const up = () => { if (y0 === null) return; y0 = null; sh.style.transition = "transform .2s"; if (dy > 110) closeSheet(); else sh.style.transform = ""; };
  [grab, $(".sh-head")].forEach(h => h.addEventListener("pointerdown", down));
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  // ces deux écouteurs sont posés sur la fenêtre : il faut les retirer à la fermeture, sinon ils s'accumulent
  sheetOff = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };

  if (onMount) onMount();
}

/* ==========================================================================
   9. FORMULAIRES
   Chaque formulaire : construit son HTML, ouvre une feuille, vérifie la saisie puis appelle submit().
   `rec` = l'enregistrement à modifier, ou null / undefined pour une création.
   ========================================================================== */

/** Ligne de formulaire : libellé + champ. */
const frow = (id, label, attrs = "") => `<div class="frow"><label for="${id}">${label}</label><input id="${id}" ${attrs}></div>`;
/** Zone de messages + boutons du bas (Supprimer seulement en modification). */
const formFoot = editing => `<div id="f-msg"></div><div class="btns">${editing ? '<button class="btn danger" id="f-del" type="button">Supprimer</button>' : ""}<button class="btn primary" id="f-save" type="button">Enregistrer</button></div>`;

/** Branche les boutons du bas. `onSave` renvoie les données à enregistrer, ou rien si la saisie est refusée.
    Supprimer demande une confirmation : premier appui « Confirmer », second appui suppression. */
function formActions(col, rec, onSave, savedMsg) {
  const finish = (ok, msg) => { if (ok) { closeSheet(); refresh(); toast(msg); } };
  $("#f-save").addEventListener("click", () => { const data = onSave(); if (data) finish(save(col, rec && rec._id, data), savedMsg); });
  const delBtn = $("#f-del");
  if (delBtn) delBtn.addEventListener("click", () => {
    if (delBtn.classList.contains("armed")) finish(del(col, rec._id), "Supprimé");
    else { delBtn.classList.add("armed"); delBtn.textContent = "Confirmer"; }
  });
}

/* ---------- Plein ---------- */
function openPlein(p) {
  const fuels = (p && p.carburants) || [{}];
  const others = S.pleins.filter(x => !p || x._id !== p._id);         // tous les autres pleins, pour les contrôles de cohérence
  const last = pleinsByKm().slice(-1)[0];
  // valeurs proposées : réglage choisi, sinon celles du dernier plein
  const defType = S.prefs.carburant !== "auto" && S.prefs.carburant || (last && (last.carburants || [{}])[0].type) || "SP95 E10";
  const defStation = S.prefs.station || (last && last.station) || "";
  const curStation = p ? p.station || "" : defStation;
  // stations déjà fréquentées, de la plus utilisée à la moins utilisée
  const freq = {};
  S.pleins.forEach(x => { if (x.station) freq[x.station] = (freq[x.station] || 0) + 1; });
  const stations = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || a.localeCompare(b, "fr"));
  if (curStation && !freq[curStation]) stations.unshift(curStation);         // station réglée dans Réglages mais jamais utilisée
  const newStation = !curStation;                                       // aucune station connue : on ouvre directement le champ « Nom »

  /* Compteur proposé (nouveau plein seulement) :
       dernier compteur + écart médian des 10 derniers intervalles entre pleins, arrondi à la centaine.
     La médiane ignore les intervalles exceptionnels (un long trajet, un plein d'appoint).
     Le chiffre est affiché en gris ; en touchant le champ, les 3 derniers chiffres sont sélectionnés
     pour être remplacés directement. */
  const asc = pleinsByKm();
  const gaps = asc.slice(1).map((x, i) => num(x.km) - num(asc[i].km)).filter(g => g > 0).slice(-10).sort((a, b) => a - b);
  const guess = !p && last && gaps.length ? Math.round((num(last.km) + gaps[Math.floor(gaps.length / 2)]) / 100) * 100 : null;

  /** Bloc d'un carburant (i = 0 : principal, i = 1 : second carburant d'un mélange, ex. E85 + SP95). */
  const fuelBlock = (i, c) => `<div class="fhead"><span>${i ? "2e carburant (mélange)" : "Carburant"}</span>${i ? '<button type="button" id="rm2">Retirer</button>' : ""}</div><div class="fgroup">
    <div class="frow"><label for="ft${i}">Type</label><select id="ft${i}">${FUELS.map(f => `<option ${f === (c.type || (i ? "E85" : defType)) ? "selected" : ""}>${f}</option>`).join("")}</select></div>
    ${frow("fl" + i, "Litres", `inputmode="decimal" value="${esc(c.litres ?? "")}" placeholder="0,00"`)}
    ${frow("fm" + i, "Montant", `inputmode="decimal" value="${esc(c.montant ?? "")}" placeholder="0,00 €"`)}</div>`;
  const ADD2 = '<button type="button" class="btn add2" id="add2">+ Ajouter un 2e carburant</button>';

  sheet(p ? "Modifier le plein" : "Nouveau plein", `<form id="fp" novalidate>
    <div class="fgroup">
      ${frow("pd", "Date", `type="datetime-local" value="${esc(p ? String(p.date || "").slice(0, 16) : localNow())}"`)}
      ${frow("pk", "Compteur", `inputmode="numeric" ${guess ? 'class="guess"' : ""} value="${esc(p ? p.km : guess ? fmt(guess) : "")}" placeholder="${fmt(curKm())} km"`)}
      <div class="frow"><label for="ps">Station</label><select id="ps">${stations.map(s => `<option ${s === curStation ? "selected" : ""}>${esc(s)}</option>`).join("")}<option value="__new" ${newStation ? "selected" : ""}>Nouvelle station…</option></select></div>
      <div class="frow" id="ps-new-w" ${newStation ? "" : "hidden"}><label for="ps-new">Nom</label><input id="ps-new" placeholder="Nom de la station"></div>
      <div class="frow"><span class="l">Plein complet</span><span style="flex:1"></span><label class="switch"><input type="checkbox" id="pf" ${p && p.plein ? "checked" : ""}><span></span></label></div>
    </div>
    ${fuelBlock(0, fuels[0])}<div id="slot2">${fuels[1] ? fuelBlock(1, fuels[1]) : ADD2}</div>
    <div class="live" id="plive"></div>
  </form>${formFoot(!!p)}`, () => {
    let warned = false;       // les avertissements ont déjà été montrés : le prochain appui enregistre
    let guessKept = !!guess;  // le compteur proposé n'a pas encore été modifié

    // compteur proposé : au toucher, sélectionne les 3 derniers chiffres ; à la première saisie, repasse en noir
    const pk = $("#pk");
    pk.addEventListener("focus", () => { if (guessKept) setTimeout(() => pk.setSelectionRange(pk.value.length - 3, pk.value.length), 0); });
    pk.addEventListener("input", () => { guessKept = false; pk.classList.remove("guess"); });
    // « Nouvelle station… » affiche le champ du nom
    $("#ps").addEventListener("change", () => {
      const isNew = $("#ps").value === "__new";
      $("#ps-new-w").hidden = !isNew;
      if (isNew) $("#ps-new").focus();
    });

    /** Lit le formulaire. */
    const read = () => ({
      date: $("#pd").value, km: num($("#pk").value), plein: $("#pf").checked,
      station: $("#ps").value === "__new" ? $("#ps-new").value.trim() : $("#ps").value,
      carburants: [0, 1].filter(i => $("#fl" + i)).map(i => ({ type: $("#ft" + i).value, litres: num($("#fl" + i).value), montant: num($("#fm" + i).value) }))
    });

    /** Contrôles. errs = bloquant ; warns = saisie inhabituelle, à confirmer. */
    const check = v => {
      const errs = [], warns = [];
      if (!v.date) errs.push("Indique la date du plein.");
      if (!(v.km > 0)) errs.push("Indique le kilométrage du compteur.");
      if (!v.station) errs.push("Indique le nom de la nouvelle station.");
      if (guessKept && v.km === guess) warns.push(`Tu n'as pas modifié le compteur proposé (${km(guess)}). C'est bien ce qu'affiche la voiture ?`);
      v.carburants.forEach(c => {
        if (!(c.litres > 0)) errs.push(`Litres manquants pour ${c.type}.`);
        if (!(c.montant > 0)) errs.push(`Montant manquant pour ${c.type}.`);
        const perL = c.montant / c.litres;
        if (c.litres > 0 && c.montant > 0 && (perL < 0.5 || perL > 3.5)) warns.push(`Prix au litre inhabituel pour ${c.type} : ${fmt(perL, 3)} €/L. Vérifie litres et montant.`);
        if (c.litres > 60) warns.push(`${fmt(c.litres, 1)} L, c'est plus qu'un réservoir de compacte. Vérifie le volume.`);
      });
      if (v.km > 0 && v.date) {
        // le compteur doit rester entre celui du plein précédent et celui du plein suivant (dans l'ordre des dates)
        const d = D(v.date);
        const before = others.filter(x => D(x.date) < d).sort((a, b) => D(b.date) - D(a.date))[0];
        const after = others.filter(x => D(x.date) > d).sort((a, b) => D(a.date) - D(b.date))[0];
        if (before && v.km < num(before.km)) errs.push(`Le compteur est plus bas que celui du plein du ${fd(before.date)} (${km(num(before.km))}). Vérifie le kilométrage ou la date.`);
        if (after && v.km > num(after.km)) errs.push(`Le compteur est plus haut que celui du plein suivant, le ${fd(after.date)} (${km(num(after.km))}). Vérifie le kilométrage ou la date.`);
        if (before && v.km - num(before.km) > 1500) warns.push(`${km(v.km - num(before.km))} depuis le plein précédent : c'est beaucoup. Vérifie le compteur.`);
      }
      return { errs, warns };
    };

    /** Totaux en direct sous le formulaire : litres, euros, prix au litre, distance depuis le plein précédent. */
    const live = () => {
      const v = read(), L = sum(v.carburants, c => c.litres), E = sum(v.carburants, c => c.montant);
      const prev = others.filter(x => num(x.km) < v.km).sort((a, b) => num(b.km) - num(a.km))[0];
      $("#plive").innerHTML = (L > 0 ? `<span>Total <b>${fmt(L, 2)} L</b></span>` : "") + (E > 0 ? `<span><b>${eur(E)}</b></span>` : "")
        + (L > 0 && E > 0 ? `<span><b>${fmt(E / L, 3)} €/L</b></span>` : "") + (prev && v.km > 0 ? `<span>Distance <b>${km(v.km - num(prev.km))}</b></span>` : "");
      warned = false; showMsgs([], "e"); $("#f-save").textContent = "Enregistrer";      // toute modification relance les contrôles
    };
    $("#fp").addEventListener("input", live);
    $("#fp").addEventListener("change", live);
    // ajouter / retirer le second carburant
    $("#slot2").addEventListener("click", e => {
      if (e.target.id === "add2") $("#slot2").innerHTML = fuelBlock(1, {});
      else if (e.target.id === "rm2") $("#slot2").innerHTML = ADD2;
      else return;
      live();
    });
    live();

    formActions("pleins", p, () => {
      const v = read(), { errs, warns } = check(v);
      if (errs.length) return showMsgs(errs, "e");
      if (warns.length && !warned) { showMsgs(warns, "w"); warned = true; $("#f-save").textContent = "Enregistrer quand même"; return; }
      return { date: v.date, km: v.km, station: v.station, plein: v.plein, carburants: v.carburants.map(c => ({ type: c.type, litres: round2(c.litres), montant: round2(c.montant) })) };
    }, p ? "Plein modifié" : "Plein enregistré");
  });
}

/* ---------- Entretien ---------- */
function openEnt(en) {
  const types = (S.ech.items || []).map(i => i.nom);
  const known = !en || types.some(t => norm(t) === norm(en.type));    // l'intervention fait-elle partie du plan d'entretien ?
  let nature = en && isPanne(en) ? "panne" : "prevu";

  sheet(en ? "Modifier l'entretien" : "Nouvel entretien", `<form novalidate><div class="fgroup">
    <div class="frow"><label for="et">Intervention</label><select id="et">${types.map(t => `<option ${en && norm(t) === norm(en.type) ? "selected" : ""}>${esc(t)}</option>`).join("")}<option value="__autre" ${known ? "" : "selected"}>Autre…</option></select></div>
    <div class="frow"><div class="seg" id="enat"><button type="button" data-n="prevu">Entretien prévu</button><button type="button" data-n="panne">Panne / réparation</button></div></div>
    <div class="frow" id="eo-w" ${known ? "hidden" : ""}><label for="eo">Nom</label><input id="eo" value="${esc(known ? "" : en.type)}" placeholder="Plaquettes arrière…"></div>
    ${frow("ed", "Date", `type="date" value="${esc(en ? en.date : today())}"`)}
    ${frow("ek", "Compteur", `inputmode="numeric" value="${esc(en ? en.km : "")}" placeholder="${fmt(curKm())} km"`)}
    ${frow("em", "Montant", `inputmode="decimal" value="${esc(en && en.montant != null ? en.montant : "")}" placeholder="0,00 €"`)}
    ${frow("en", "Note", `value="${esc(en ? en.note || "" : "")}" placeholder="Garage, pièce…"`)}
  </div><p class="sec-f" style="padding:0 6px 10px;margin:0">Pour une révision complète, enregistre une ligne par intervention pour que chaque échéance se mette à jour.</p></form>${formFoot(!!en)}`, () => {
    const showNature = () => setPressed("#enat button", b => b.dataset.n === nature);
    showNature();
    $("#enat").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      nature = b.dataset.n; showNature();
      // une panne ne fait pas partie du plan d'entretien : on propose directement un nom libre
      if (nature === "panne" && !en) { $("#et").value = "__autre"; $("#eo-w").hidden = false; }
    });
    $("#et").addEventListener("change", () => { $("#eo-w").hidden = $("#et").value !== "__autre"; });

    formActions("entretiens", en, () => {
      const type = $("#et").value === "__autre" ? $("#eo").value.trim() : $("#et").value;
      const kmv = num($("#ek").value), m = num($("#em").value), errs = [];
      if (!type) errs.push("Indique le nom de l'intervention.");
      if (!$("#ed").value) errs.push("Indique la date.");
      if (!(kmv > 0)) errs.push("Indique le kilométrage.");
      if ($("#em").value.trim() && !(m >= 0)) errs.push("Le montant n'est pas un nombre.");
      if (errs.length) return showMsgs(errs, "e");
      return { date: $("#ed").value, km: kmv, type, nature, montant: isFinite(m) ? round2(m) : null, note: $("#en").value.trim() };
    }, en ? "Entretien modifié" : "Entretien enregistré");
  });
}

/* ---------- Pièce de rechange ---------- */
function openPiece(pc) {
  const cats = [...new Set(S.pieces.map(x => x.categorie).filter(Boolean))];
  const extra = { categorie: 'list="cats"', prix: 'inputmode="decimal" placeholder="0,00 €"' };
  sheet(pc ? "Modifier la pièce" : "Nouvelle pièce",
    `<div class="fgroup">${PIECE_FIELDS.map(([id, key, label]) => frow(id, label, `${extra[key] || ""} value="${esc(pc ? pc[key] ?? "" : "")}"`)).join("")}</div><datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>${formFoot(!!pc)}`, () => {
    formActions("pieces", pc, () => {
      const d = {};
      PIECE_FIELDS.forEach(([id, key]) => { d[key] = $("#" + id).value.trim(); });
      if (!d.article) return showMsgs(["Indique le nom de l'article."], "e");
      d.prix = isFinite(num(d.prix)) ? num(d.prix) : null;
      if (pc && pc.date) d.date = pc.date;
      return d;
    }, "Pièce enregistrée");
  });
}

/* ---------- Fiche véhicule / assurance ---------- */
/** Bouton Modifier / OK d'un bloc de la fiche : le premier appui rend les champs modifiables,
    le second les enregistre. */
function toggleEdit(group) {
  if (S.editing !== group) {
    S.editing = group; renderVehicule();
    const first = $(`#kv-${group} input`); if (first) first.focus();
    return;
  }
  const data = {};
  (group === "veh" ? VEH_FIELDS : INS_FIELDS).forEach(([key, , type]) => {
    const v = $("#kv-" + key).value.trim();
    data[key] = type !== "num" ? v : isFinite(num(v)) ? num(v) : null;
  });
  if (commit("veh", { ...S.veh, ...data })) { S.editing = null; renderVehicule(); toast("Fiche enregistrée"); }
}

/* ==========================================================================
   10. DATES CLÉS ET CALENDRIER
   ========================================================================== */

/** Prochaines dates importantes, triées :
      - contrôle technique (échéance du plan d'entretien) ;
      - anniversaire du contrat d'assurance (prochaine occurrence de la date d'effet) ;
      - rappel pour renégocier l'assurance, 2 mois avant cet anniversaire.
    every = périodicité en mois ; alarms = rappels en jours avant (0 = le jour même à 9 h). */
function keyDates() {
  const out = [], now = new Date();
  const ct = echStatus().find(r => norm(r.nom) === "controle technique");
  if (ct && ct.nextDate) out.push({ id: "ct", title: "Contrôle technique", date: ct.nextDate, every: 24, note: "Prends rendez-vous un mois avant.", alarms: [30, 7] });
  const effet = D(S.veh.dateEffet);
  if (effet && !isNaN(effet)) {
    let next = new Date(effet);
    while (next <= now) next = addMonths(next, 12);
    out.push({ id: "assu", title: "Échéance assurance" + (S.veh.assureur ? " " + S.veh.assureur : ""), date: next, every: 12, note: "Date anniversaire du contrat.", alarms: [7] });
    out.push({ id: "assu-reneg", title: "Renégocier l'assurance", date: addMonths(next, -2), every: 12, note: "Compare les offres et demande un geste à ton assureur avant l'échéance du " + fd(next) + ".", alarms: [0] });
  }
  return out.sort((a, b) => a.date - b.date);
}

/** Fichier calendrier (.ics) : un événement d'une journée par date clé, répété, avec ses rappels.
    L'UID fixe de chaque événement évite les doublons si le fichier est importé deux fois dans le même calendrier. */
function icsFile() {
  const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  const text = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");     // caractères réservés du format
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const car = [S.veh.marque, S.veh.modele].filter(Boolean).join(" ") || "Voiture";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Carnet auto//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Voiture"];
  keyDates().forEach(e => {
    const end = new Date(e.date); end.setDate(end.getDate() + 1);
    L.push("BEGIN:VEVENT", "UID:carnet-auto-" + e.id + "@heikefr.github.io", "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + ymd(e.date), "DTEND;VALUE=DATE:" + ymd(end),
      "SUMMARY:" + text(e.title + " · " + car), "DESCRIPTION:" + text(e.note), "RRULE:FREQ=MONTHLY;INTERVAL=" + e.every, "TRANSP:TRANSPARENT");
    e.alarms.forEach(a => L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + text(e.title), a ? "TRIGGER:-P" + a + "D" : "TRIGGER:PT9H", "END:VALARM"));
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n");
}

/** Feuille « Ajouter au calendrier » : récapitulatif, mode d'emploi et enregistrement du fichier.
    (Sur iPhone, une appli installée ne peut pas ouvrir Calendrier directement : on passe par l'app Fichiers.) */
function openCalendar() {
  const dates = keyDates();
  if (!dates.length) return toast("Aucune date à ajouter");
  sheet("Ajouter au calendrier", `<div class="fgroup">${dates.map(e => `<div class="frow cal-ev">${calBadge(e.date)}<span style="flex:1"><b style="font-weight:600">${esc(e.title)}</b><br><span class="muted" style="font-size:14px">${e.every === 24 ? "Tous les 2 ans" : "Tous les ans"} · rappel ${e.alarms.map(a => a ? a + " j avant" : "le jour même").join(" et ")}</span></span></div>`).join("")}</div>
    <div class="fgroup note"><b>Pour un calendrier à part :</b> dans l'app Calendrier, touche « Calendriers », puis « Ajouter un calendrier » et nomme-le « Voiture ». Au moment d'ajouter les dates, choisis ce calendrier.</div>
    <div class="fgroup note" style="line-height:1.6">
      <b>1.</b> Touche « Enregistrer le fichier » ci-dessous, puis <b>Enregistrer dans Fichiers</b>.<br>
      <b>2.</b> Ouvre l'app <b>Fichiers</b> et touche <b>voiture.ics</b>.<br>
      <b>3.</b> Touche <b>Ajouter tout</b>, puis choisis le calendrier « Voiture ».</div>
    <div class="btns"><button class="btn primary" id="ics-share" type="button">Enregistrer le fichier</button></div>
    <p class="sec-f" style="padding:10px 4px 0;margin:0">N'ajoute les dates qu'une fois pour éviter les doublons.</p>`,
    () => $("#ics-share").addEventListener("click", () => exportFile("voiture.ics", icsFile(), "text/calendar")));
}

/* ==========================================================================
   11. SAUVEGARDE, EXPORT, IMPORT
   ========================================================================== */

/** Remet des fichiers à l'utilisateur : feuille de partage d'iOS si possible (Enregistrer dans Fichiers…),
    sinon téléchargement classique. Renvoie false seulement si l'utilisateur a annulé le partage. */
async function giveFiles(files, title) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share(title ? { files, title } : { files }); return true; }
  } catch (e) { if (e && e.name === "AbortError") return false; }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    if (files.length > 1) await new Promise(r => setTimeout(r, 400));      // les navigateurs bloquent les téléchargements simultanés
  }
  return true;
}
const exportFile = (name, text, type = "text/csv;charset=utf-8") => giveFiles([new File([text], name, { type })], name);

/** Sauvegarde complète (données + photo) dans un fichier .json daté. */
async function backupNow() {
  if (!await exportFile("sauvegarde-carnet-" + today() + ".json", JSON.stringify(snapshot(true), null, 1), "application/json")) return;
  store.set(KEY_BK, new Date().toISOString());
  refresh(); toast("Sauvegarde créée");
}

/* --- Export CSV : séparateur « ; » et virgule décimale, lisible tel quel par Excel et Google Sheets en français --- */
const csv = rows => "\uFEFF" + rows.map(r => r.map(v => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\r\n");      // \uFEFF : marque UTF-8 pour les accents
const dec = n => isFinite(n) ? String(n).replace(".", ",") : "";
function exportFuel() {
  const rows = [["Date", "Kilométrage", "Plein complet", "Station", "Carburant 1", "Litres 1", "Montant 1", "Carburant 2", "Litres 2", "Montant 2", "Total litres", "Total €"]];
  pleinsByKm().forEach(p => {
    const [a = {}, b = {}] = p.carburants || [], t = pleinTot(p);
    rows.push([String(p.date || "").replace("T", " "), p.km, p.plein ? "Oui" : "Non", p.station, a.type, dec(a.litres), dec(a.montant), b.type || "", dec(b.litres), dec(b.montant), dec(round2(t.l)), dec(round2(t.e))]);
  });
  exportFile("pleins.csv", csv(rows));
}
function exportMaint() {
  const rows = [["Date", "Kilométrage", "Intervention", "Montant", "Note"]];
  S.entretiens.slice().sort((a, b) => D(a.date) - D(b.date)).forEach(e => rows.push([e.date, e.km, e.type, dec(e.montant), e.note || ""]));
  exportFile("entretiens.csv", csv(rows));
}

/** Restauration : vérifie que le fichier est bien une sauvegarde, montre son contenu et demande confirmation
    avant de remplacer les données du téléphone. */
function importText(txt, name) {
  let d = null;
  try { d = JSON.parse(String(txt || "").replace(/^\uFEFF/, "").trim()); } catch (e) { /* fichier illisible : traité ci-dessous */ }
  if (!d || d.app !== "carnet-auto") {
    return sheet("Fichier non reconnu", `<p style="margin:0 6px 8px">« ${esc(name || "fichier")} » n'est pas une sauvegarde de cette application.</p><p class="muted" style="margin:0 6px 14px;font-size:15px">Choisis le fichier dont le nom commence par <b>sauvegarde-carnet</b> et finit par <b>.json</b>.</p><div class="btns"><button class="btn primary" data-close type="button">OK</button></div>`);
  }
  const n = k => (Array.isArray(d[k]) ? d[k].length : 0);
  const line = (label, value) => `<div class="frow"><span class="l">${label}</span><span style="flex:1;text-align:right">${value}</span></div>`;
  const replacing = hasData();
  sheet("Restaurer la sauvegarde ?", `<div class="fgroup">${line("Date", esc(fd(String(d.exporte || "").slice(0, 10))))}${d.vehicule && d.vehicule.modele ? line("Véhicule", esc((d.vehicule.marque || "") + " " + d.vehicule.modele)) : ""}${line("Contenu", `${n("pleins")} pleins · ${n("entretiens")} entretiens · ${n("pieces")} pièces${d.photo ? " · photo" : ""}`)}</div>
    ${replacing ? '<div class="msg w">Elle remplacera les données actuelles de ce téléphone.</div>' : ""}<div class="btns"><button class="btn primary" id="imp-ok" type="button">${replacing ? "Remplacer mes données" : "Restaurer"}</button></div>`, () => {
    $("#imp-ok").addEventListener("click", () => {
      const before = snapshot(), prefs = S.prefs;
      applyData(d);
      if (!d.reglages) S.prefs = prefs;                               // sauvegarde sans réglages : on garde ceux du téléphone
      if (!persist()) return applyData(before);                       // échec d'écriture : retour à l'état précédent
      if (d.photo) setPhoto(d.photo);
      applyTheme(); go("home"); toast("Données restaurées");
    });
  });
}

/* ==========================================================================
   12. PHOTO ET ICÔNE
   ========================================================================== */

const getPhoto = () => store.get(KEY_PHOTO);
/** Enregistre (ou retire, avec null) la photo. Renvoie false si elle ne tient pas dans le stockage. */
function setPhoto(url) {
  const ok = store.set(KEY_PHOTO, url || null);
  if (!ok) toast("Photo trop lourde pour être enregistrée");
  return ok;
}

/** Appelle fn(fichier) quand l'utilisateur choisit un fichier dans le sélecteur invisible `sel`. */
function onFile(sel, fn) {
  $(sel).addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";                                              // permet de rechoisir le même fichier ensuite
    if (f) fn(f);
  });
}
/** Charge un fichier image. */
const loadImg = file => new Promise((ok, ko) => {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { ok(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  img.onerror = () => ko(new Error("image illisible"));
  img.src = url;
});
/** Crée un canevas de w × h et renvoie [canevas, contexte de dessin]. */
const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };

/** Rend transparent le fond uni clair d'une photo (photo de catalogue sur fond blanc ou gris clair).
    Méthode : la couleur du fond est la moyenne des 4 coins ; un « remplissage » part des bords et efface,
    de proche en proche, tout pixel proche de cette couleur. La voiture, entourée de pixels différents,
    n'est pas atteinte. Les gris neutres du bas de l'image (ombre portée) deviennent une ombre semi-transparente.
    Renvoie false sans rien changer si le fond n'est pas uni ou pas assez clair. */
function removeBackground(cx, w, h) {
  const im = cx.getImageData(0, 0, w, h), d = im.data;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; });
  const ref = [0, 1, 2].map(k => sum(corners, c => c[k]) / 4);
  const gap = (r, g, b) => Math.abs(r - ref[0]) + Math.abs(g - ref[1]) + Math.abs(b - ref[2]);      // écart de couleur avec le fond
  const refL = (ref[0] + ref[1] + ref[2]) / 3;
  if (Math.max(...corners.map(c => gap(...c))) > 60 || refL < 170) return false;

  /** Que faire du pixel k : 0 = fond (transparent), 1 à 255 = ombre (opacité), -1 = voiture (on s'arrête). */
  const test = (k, y) => {
    const i = k * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (gap(r, g, b) < 48) return 0;
    const l = (r + g + b) / 3, sat = Math.max(r, g, b) - Math.min(r, g, b);
    return sat < 22 && l > 115 && y > h * 0.6 ? Math.min(255, Math.max(0, (refL - l) / (refL - 115) * 255 * 0.85)) : -1;
  };
  const seen = new Uint8Array(w * h), stack = [];                     // pile de coordonnées x, y à examiner
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop(), k = y * w + x;
    if (seen[k]) continue;
    const t = test(k, y);
    if (t < 0) continue;
    seen[k] = 1;
    if (t > 0) d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = 0;            // ombre : noir, plus ou moins opaque
    d[k * 4 + 3] = t;
    if (x > 0) stack.push(x - 1, y);
    if (x < w - 1) stack.push(x + 1, y);
    if (y > 0) stack.push(x, y - 1);
    if (y < h - 1) stack.push(x, y + 1);
  }
  // adoucit le contour : un pixel conservé qui touche le vide devient légèrement transparent
  const cleared = k => (seen[k] && d[k * 4 + 3] === 0 ? 1 : 0);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x;
    if (seen[k]) continue;
    const n = cleared(k - 1) + cleared(k + 1) + cleared(k - w) + cleared(k + w);
    if (n) d[k * 4 + 3] = Math.round(d[k * 4 + 3] * (1 - n / 5));
  }
  cx.putImageData(im, 0, 0);
  return true;
}

/** Recadre un canevas au plus près de ses pixels visibles. */
function trimCanvas(c) {
  const { width: w, height: h } = c, d = c.getContext("2d").getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return c;
  const [out, cx] = canvas(x1 - x0 + 1, y1 - y0 + 1);
  cx.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Nouvelle photo : réduite à 1 100 px au plus, détourée si l'option est active, puis enregistrée
    (PNG si elle a de la transparence, JPEG sinon pour rester légère). */
async function importPhoto(file) {
  try {
    const img = await loadImg(file);
    const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    let [c, cx] = canvas(w, h);
    cx.drawImage(img, 0, 0, w, h);
    let transparent = file.type === "image/png";
    if (S.prefs.detour !== false && removeBackground(cx, w, h)) { transparent = true; c = trimCanvas(c); }
    if (setPhoto(transparent ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.86))) { refresh(); toast("Photo enregistrée"); }
  } catch (e) { toast("Impossible de lire cette image"); }
}

/** Icône personnalisée : fabrique les 4 fichiers attendus par manifest.webmanifest à partir d'une image
    (centrée sur un fond de la couleur de son coin haut gauche), puis explique comment les installer.
    L'icône d'une appli installée vient du site : c'est pourquoi il faut passer par GitHub et réinstaller. */
async function importIcon(file) {
  let img;
  try { img = await loadImg(file); } catch (e) { return toast("Impossible de lire cette image"); }
  const [, probe] = canvas(1, 1);
  probe.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
  const bg = probe.getImageData(0, 0, 1, 1).data;
  /** Icône carrée de `size` px ; `pad` = marge en proportion (plus grande pour l'icône « maskable » d'Android). */
  const make = (size, pad) => {
    const [c, cx] = canvas(size, size), inner = size * (1 - 2 * pad);
    const s = Math.min(inner / img.naturalWidth, inner / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    cx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; cx.fillRect(0, 0, size, size);
    cx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return c;
  };
  const icons = [["icon-180.png", make(180, 0.06)], ["icon-192.png", make(192, 0.06)], ["icon-512.png", make(512, 0.06)], ["icon-512-maskable.png", make(512, 0.16)]];
  const files = await Promise.all(icons.map(([name, c]) => new Promise(ok => c.toBlob(b => ok(new File([b], name, { type: "image/png" })), "image/png"))));
  sheet("Ta nouvelle icône", `<div style="display:flex;justify-content:center;margin:4px 0 16px"><img src="${icons[0][1].toDataURL()}" style="width:96px;height:96px;border-radius:22px;box-shadow:0 4px 14px rgba(0,0,0,.25)" alt=""></div>
    <div class="fgroup note">
      <b>1.</b> Touche « Enregistrer les fichiers » et range les 4 images dans Fichiers.<br>
      <b>2.</b> Sur GitHub, dépose-les dans ton dépôt (Add file › Upload files) pour remplacer les anciennes, puis Commit changes.<br>
      <b>3.</b> Fais une sauvegarde de tes données (Réglages › Sauvegarde).<br>
      <b>4.</b> Supprime l'appli de l'écran d'accueil, rouvre le site dans Safari et refais « Sur l'écran d'accueil ».<br>
      <b>5.</b> Ouvre l'appli et restaure ta sauvegarde.</div>
    <div class="msg w">Sur iPhone, supprimer l'appli efface ses données : ne saute pas l'étape 3.</div>
    <div class="btns"><button class="btn primary" id="icon-save" type="button">Enregistrer les fichiers</button></div>`,
    () => $("#icon-save").addEventListener("click", () => giveFiles(files)));
}

/* ==========================================================================
   13. RÉGLAGES
   ========================================================================== */

/** Réglages simples : [champ, clé dans S.prefs, lecture de la valeur, redessiner et confirmer ?] */
const PREF_INPUTS = [
  ["#pref-detour", "detour", el => el.checked, false],
  ["#pref-fuel", "carburant", el => el.value, true],
  ["#pref-station", "station", el => el.value.trim(), true],
  ["#pref-rappel", "rappel", el => num(el.value), true],
  ["#pref-seuil", "seuil", el => (num(el.value) > 0 ? num(el.value) : 0.25), true],
  ["#pref-decote", "decote", el => (num(el.value) > 0 ? Math.round(num(el.value)) : null), true]
];

/** Enregistre les intervalles d'entretien et les seuils d'alerte saisis dans le tableau. */
function saveIntervals() {
  const read = id => { const n = num($(id).value); return isFinite(n) ? n : null; };
  const items = (S.ech.items || []).map((it, i) => ({ ...it, mois: read("#em-" + i), km: read("#ek-" + i) }));
  if (!commit("ech", { ...S.ech, items, seuilKm: read("#seuil-km") || 2000, seuilJours: read("#seuil-j") || 30 })) return;
  if (document.activeElement) document.activeElement.blur();          // sinon le tableau ne serait pas redessiné
  refresh(); toast("Intervalles enregistrés");
}

/** « Effacer toutes les données » : il faut toucher deux fois en moins de 5 secondes.
    Les réglages et la photo sont conservés. */
let wipeArmed = 0;
function wipe() {
  const label = (title, foot) => { $("#wipe .t").textContent = title; $("#wipe-f").textContent = foot; };
  const disarm = () => label("Effacer toutes les données", "");
  if (Date.now() - wipeArmed > 5000) {
    wipeArmed = Date.now();
    label("Toucher à nouveau pour tout effacer", "Fais d'abord une sauvegarde : cette action est définitive.");
    setTimeout(() => { if (Date.now() - wipeArmed >= 5000) disarm(); }, 5100);
    return;
  }
  const prefs = S.prefs;
  applyData({}); S.prefs = prefs; persist();
  wipeArmed = 0; disarm(); go("home"); toast("Données effacées");
}

/* ==========================================================================
   14. DÉMARRAGE
   ========================================================================== */

/** Pose tous les écouteurs permanents de la page (une seule fois). */
function bind() {
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); closeMenu(); } });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (v !== S.view) go(v); });
  // le graphique dépend de la largeur : on le redessine après une rotation ou un redimensionnement
  let resizeTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (S.view === "couts") renderChart(); }, 150); });
  // mode automatique : suit le passage clair / sombre de l'iPhone
  const mq = matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", applyTheme);

  $("#tb-back").addEventListener("click", () => go("home"));
  $("#plus").addEventListener("click", () => setMenu($("#menu").hidden));
  $("#scrim").addEventListener("click", closeMenu);

  PREF_INPUTS.forEach(([sel, key, read, confirm]) => $(sel).addEventListener("change", e => {
    S.prefs[key] = read(e.target); persist();
    if (confirm) { refresh(); toast("Enregistré"); }
  }));
  $("#save-ech").addEventListener("click", saveIntervals);
  $("#wipe").addEventListener("click", wipe);
  $("#photo-del").addEventListener("click", () => { setPhoto(null); refresh(); toast("Photo retirée"); });
  onFile("#photo-file", importPhoto);
  onFile("#icon-file", importIcon);
  onFile("#imp-file", async f => importText(await f.text().catch(() => ""), f.name));
}

function boot() {
  // 1. données enregistrées sur le téléphone
  const raw = store.get(KEY);
  try { if (raw) applyData(JSON.parse(raw)); }
  catch (e) { const b = $("#banner"); b.textContent = "Impossible de lire les données enregistrées sur ce téléphone."; b.hidden = false; }
  // 2. affichage
  bind(); applyTheme(); go(location.hash.slice(1) || "home");
  // 3. demande au navigateur de ne pas effacer les données quand la place manque
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* non disponible : sans gravité */ }
  // 4. fonctionnement hors connexion (sw.js), uniquement quand la page vient d'un site
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
})();
