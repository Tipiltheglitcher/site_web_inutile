/* ===========================================================================
   arcade.js — socle commun a tous les jeux idiots.

   Fournit : un profil unique sauvegarde et signe (impossible a editer a la
   main), des niveaux de difficulte, des records par difficulte, des succes,
   des notifications, des fenetres, du son, et le formatage des nombres.

   Un jeu s'y branche en une fois :

     var A = Arcade.init({
       id: "statue", nom: "La Statue", emoji: "🗿",
       difficultes: [ { id:"calme", n:"Calme", e:"😌", duree: 30 }, ... ],
       succes: [ { id:"marbre", e:"🏛️", n:"De marbre",
                   d:"Tenir 60 secondes.", f:function (d) { return d.record >= 60; } } ]
     });

   Ensuite : A.d (les donnees du jeu, sauvegardees), A.D (la difficulte
   choisie), A.record(...), A.check(), A.toast(...), A.modal(...).
   =========================================================================== */
window.Arcade = (function () {
  "use strict";

  var CLE = "jeux-idiots-v1";
  var SECRET = "Jeux!d10ts-2026-@rc@de-s1gn@ture-ça-ne-se-bidouille-pas";
  var VERSION = 1;
  var ENTETE = "=== PROFIL - JEUX IDIOTS ===";
  var PIED = "=== FIN - FICHIER SIGNE, NE RIEN MODIFIER ===";

  /* ---------------------------------------------------------------------
     Formatage
     --------------------------------------------------------------------- */
  var N0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  var N1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  var N2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

  function nb(n) { return isFinite(n) ? N0.format(Math.floor(n)) : "—"; }
  function nb1(n) { return isFinite(n) ? N1.format(Math.round(n * 10) / 10) : "—"; }
  function nb2(n) { return isFinite(n) ? N2.format(Math.round(n * 100) / 100) : "—"; }
  function secondes(s) {
    if (!isFinite(s)) return "—";
    s = Math.floor(s);
    if (s < 60) return s + " s";
    if (s < 3600) return Math.floor(s / 60) + " min " + (s % 60) + " s";
    if (s < 86400) return Math.floor(s / 3600) + " h " + Math.floor((s % 3600) / 60) + " min";
    return Math.floor(s / 86400) + " j " + Math.floor((s % 86400) / 3600) + " h";
  }

  /* ---------------------------------------------------------------------
     Signature : empeche de trafiquer le profil au bloc-notes
     --------------------------------------------------------------------- */
  function h32(str, graine) {
    var h = graine >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
      h = ((h << 13) | (h >>> 19)) >>> 0;
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13;
    return h >>> 0;
  }
  function signer(donnees) {
    var sale = SECRET + "" + donnees.length + "" + donnees + "" + SECRET;
    var graines = [0x811c9dc5, 0x1b873593, 0x85ebca6b, 0xc2b2ae35], out = "";
    for (var i = 0; i < graines.length; i++) {
      out += ("00000000" + h32(sale + "#" + i, graines[i]).toString(16)).slice(-8);
    }
    return out;
  }
  function brouiller(octets) {
    var x = h32(SECRET, 0x9e3779b9) || 1, out = new Uint8Array(octets.length);
    for (var i = 0; i < octets.length; i++) {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      out[i] = octets[i] ^ (x & 255);
    }
    return out;
  }
  function b64(octets) {
    var s = "";
    for (var i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]);
    return btoa(s);
  }
  function deb64(str) {
    var s = atob(str), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  function encoder() {
    P.savedAt = Date.now();
    var donnees = JSON.stringify(P);
    var enveloppe = JSON.stringify({ v: VERSION, d: donnees, s: signer(donnees) });
    return b64(brouiller(new TextEncoder().encode(enveloppe)));
  }
  function decoder(code) {
    /* on jette l'en-tete, le pied et les commentaires ; le "=" de bourrage du
       base64 doit survivre, d'ou le test sur "===" et non sur "=" */
    code = String(code).split("\n").filter(function (l) {
      var t = l.trim();
      return t && t.indexOf("===") !== 0 && t.charAt(0) !== "#";
    }).join("").replace(/\s+/g, "");
    if (!code) throw new Error("vide");
    var env;
    try { env = JSON.parse(new TextDecoder().decode(brouiller(deb64(code)))); }
    catch (e) { throw new Error("illisible"); }
    if (!env || env.v !== VERSION) throw new Error("version");
    if (typeof env.d !== "string" || signer(env.d) !== env.s) throw new Error("signature");
    var obj;
    try { obj = JSON.parse(env.d); } catch (e) { throw new Error("illisible"); }
    return nettoyer(obj);
  }

  var ERREURS = {
    vide: "il n'y a rien à charger",
    illisible: "le contenu est illisible ou tronqué",
    version: "ce profil vient d'une autre version des jeux",
    signature: "la signature ne correspond pas : le fichier a été modifié",
    format: "ce n'est pas un profil"
  };

  /* ---------------------------------------------------------------------
     Le profil
     --------------------------------------------------------------------- */
  function profilVierge() {
    return { v: VERSION, cree: Date.now(), savedAt: Date.now(), mute: 0, temps: 0, g: {}, a: {} };
  }
  var P = profilVierge();

  function nombre(v, max) {
    v = Number(v);
    if (!isFinite(v) || v < 0) return 0;
    return Math.min(v, max);
  }
  function nettoyer(o) {
    if (!o || typeof o !== "object") throw new Error("format");
    var p = profilVierge(), now = Date.now();
    p.mute = o.mute ? 1 : 0;
    p.temps = nombre(o.temps, 1e10);
    p.cree = nombre(o.cree, now) || now;
    p.savedAt = Math.min(nombre(o.savedAt, now) || now, now);
    /* on ne recopie que des valeurs simples : pas de fonction, pas d'objet
       exotique, et une taille bornee pour ne pas exploser le stockage */
    if (o.g && typeof o.g === "object") {
      Object.keys(o.g).slice(0, 60).forEach(function (k) {
        var src = o.g[k];
        if (!src || typeof src !== "object") return;
        p.g[k] = valeurSure(src, 0);
      });
    }
    if (o.a && typeof o.a === "object") {
      Object.keys(o.a).slice(0, 800).forEach(function (k) { if (o.a[k]) p.a[String(k).slice(0, 80)] = 1; });
    }
    return p;
  }
  function valeurSure(v, prof) {
    if (prof > 4) return null;
    if (v === null) return null;
    var t = typeof v;
    if (t === "number") return isFinite(v) ? v : 0;
    if (t === "boolean") return v ? 1 : 0;
    if (t === "string") return v.slice(0, 200);
    if (Array.isArray(v)) return v.slice(0, 200).map(function (x) { return valeurSure(x, prof + 1); });
    if (t === "object") {
      var out = {};
      Object.keys(v).slice(0, 100).forEach(function (k) { out[String(k).slice(0, 60)] = valeurSure(v[k], prof + 1); });
      return out;
    }
    return null;
  }

  var dernierEnregistrement = 0, refusAuChargement = null;
  function sauver() {
    try { localStorage.setItem(CLE, encoder()); dernierEnregistrement = Date.now(); } catch (e) {}
  }
  function charger() {
    var brut = null;
    try { brut = localStorage.getItem(CLE); } catch (e) {}
    if (!brut) return;
    try { P = decoder(brut); }
    catch (e) { P = profilVierge(); refusAuChargement = ERREURS[e.message] || e.message; }
  }
  charger();

  /* ---------------------------------------------------------------------
     Notifications et fenetres
     --------------------------------------------------------------------- */
  function boite(classe) {
    var b = document.getElementById(classe);
    if (!b) {
      b = document.createElement("div");
      b.id = classe; b.className = classe;
      document.body.appendChild(b);
    }
    return b;
  }
  function toast(icone, titre, texte) {
    var box = boite("ar-toasts"), t = document.createElement("div");
    t.className = "ar-toast";
    var b = document.createElement("b"); b.textContent = icone + " " + titre;
    var s = document.createElement("span"); s.textContent = texte || "";
    t.appendChild(b); t.appendChild(s);
    box.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .4s"; t.style.opacity = "0"; }, 4200);
    setTimeout(function () { t.remove(); }, 4700);
    while (box.children.length > 4) box.firstChild.remove();
  }
  function modal(titre, html, boutons) {
    var o = document.createElement("div");
    o.className = "ar-over";
    var m = document.createElement("div");
    m.className = "ar-modal";
    var h = document.createElement("h2"); h.textContent = titre;
    var p = document.createElement("p"); p.innerHTML = html;
    var r = document.createElement("div"); r.className = "row";
    m.appendChild(h); m.appendChild(p); m.appendChild(r);
    (boutons || [{ t: "Fermer", c: "btn" }]).forEach(function (b) {
      var el = document.createElement("button");
      el.type = "button"; el.className = b.c || "btn alt"; el.textContent = b.t;
      el.addEventListener("click", function () { o.remove(); if (b.go) b.go(); });
      r.appendChild(el);
    });
    o.appendChild(m); document.body.appendChild(o);
    o.addEventListener("click", function (e) { if (e.target === o) o.remove(); });
    return o;
  }
  function echapper(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
  }

  /* ---------------------------------------------------------------------
     Son : un seul reglage pour tous les jeux
     --------------------------------------------------------------------- */
  var ctxAudio = null, audioDebloque = false;
  document.addEventListener("pointerdown", function () { audioDebloque = true; }, { once: true, capture: true });
  document.addEventListener("keydown", function () { audioDebloque = true; }, { once: true, capture: true });

  function bip(freq, duree, forme, volume) {
    if (P.mute || !audioDebloque) return;
    try {
      if (!ctxAudio) ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctxAudio.createOscillator(), g = ctxAudio.createGain(), t = ctxAudio.currentTime;
      var d = duree || 0.12;
      o.type = forme || "square";
      o.frequency.setValueAtTime(freq || 440, t);
      g.gain.setValueAtTime(volume || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(ctxAudio.destination);
      o.start(t); o.stop(t + d + 0.01);
    } catch (e) {}
  }
  function melodie(notes) {
    if (P.mute || !audioDebloque) return;
    notes.forEach(function (n, i) { setTimeout(function () { bip(n[0], n[1], n[2], n[3]); }, i * 110); });
  }
  function boutonSon(cible) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "ar-sound";
    function maj() {
      b.textContent = P.mute ? "🔇" : "🔊";
      b.title = P.mute ? "Remettre le son" : "Couper le son";
      b.classList.toggle("off", !!P.mute);
    }
    b.addEventListener("click", function () {
      P.mute = P.mute ? 0 : 1; audioDebloque = true;
      maj(); sauver();
      if (!P.mute) bip(660, 0.1);
    });
    maj();
    (cible || document.querySelector(".topbar") || document.body).appendChild(b);
    return b;
  }

  /* ---------------------------------------------------------------------
     Fichier de sauvegarde
     --------------------------------------------------------------------- */
  function texteFichier() {
    return ENTETE + "\n" +
      "# Profil du " + new Date().toLocaleString("fr-FR") + "\n" +
      "# Ce fichier est brouille et signe. Le modifier le rend invalide.\n" +
      (encoder().match(/.{1,76}/g) || []).join("\n") + "\n" + PIED + "\n";
  }
  function exporter() {
    var blob = new Blob([texteFichier()], { type: "text/plain;charset=utf-8" });
    var d = new Date();
    var deux = function (n) { return ("0" + n).slice(-2); };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jeux-idiots_" + d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()) +
      "_" + deux(d.getHours()) + "h" + deux(d.getMinutes()) + ".pouet";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function importer(texte, source, apres) {
    var p;
    try { p = decoder(texte); }
    catch (e) {
      modal("❌ Profil refusé",
        "Impossible de charger <b>" + echapper(source) + "</b> : " + (ERREURS[e.message] || e.message) +
        ".<br><br>Le fichier est signé : si tu changes ne serait-ce qu'un caractère, il devient invalide. Bien tenté.",
        [{ t: "Compris", c: "btn" }]);
      if (apres) apres(false, ERREURS[e.message] || e.message);
      return;
    }
    var nbJeux = Object.keys(p.g).length, nbSucces = Object.keys(p.a).length;
    modal("📂 Charger ce profil ?",
      "Signature valide ✔<br>" + nbJeux + " jeu(x) joué(s) · " + nbSucces + " succès · " +
      secondes(p.temps) + " de jeu.<br><br>Ton profil actuel sera remplacé.",
      [{ t: "Annuler", c: "btn alt" },
       { t: "Charger", c: "btn", go: function () {
         P = p; sauver();
         if (apres) apres(true);
         else location.reload();
       } }]);
  }

  /* ---------------------------------------------------------------------
     Branchement d'un jeu
     --------------------------------------------------------------------- */
  function init(conf) {
    var id = conf.id;
    if (!P.g[id]) P.g[id] = {};
    var d = P.g[id];
    if (!d.rec) d.rec = {};      /* records, par difficulte */
    if (!d.parties) d.parties = 0;
    if (typeof d.diff !== "number") d.diff = conf.difficulteParDefaut || 0;

    var diffs = conf.difficultes || [{ id: "normal", n: "Normal", e: "🎮" }];
    if (d.diff < 0 || d.diff >= diffs.length) d.diff = 0;

    var succes = conf.succes || [];
    var api = {
      id: id,
      conf: conf,
      d: d,                      /* donnees du jeu, sauvegardees */
      P: P,                      /* profil complet, si besoin */
      difficultes: diffs,
      get D() { return diffs[d.diff]; },
      get iD() { return d.diff; },

      sauver: sauver,
      toast: toast,
      modal: modal,
      bip: bip,
      melodie: melodie,
      nb: nb, nb1: nb1, nb2: nb2, secondes: secondes,
      echapper: echapper,

      /* choisir une difficulte */
      choisir: function (i) {
        if (i < 0 || i >= diffs.length || i === d.diff) return false;
        d.diff = i; sauver();
        majBarre();
        if (conf.surChangement) conf.surChangement(diffs[i], i);
        return true;
      },

      /* enregistrer un record ; renvoie true si c'est un nouveau record */
      record: function (cle, valeur, plusPetitEstMieux) {
        var k = diffs[d.diff].id + ":" + cle;
        var ancien = d.rec[k];
        var mieux = ancien == null || (plusPetitEstMieux ? valeur < ancien : valeur > ancien);
        if (mieux) { d.rec[k] = valeur; sauver(); }
        return mieux;
      },
      meilleur: function (cle, iDiff) {
        var k = diffs[iDiff == null ? d.diff : iDiff].id + ":" + cle;
        return d.rec[k];
      },

      /* succes */
      debloquer: function (sid) {
        var cle = id + "." + sid;
        if (P.a[cle]) return false;
        var s = null;
        for (var i = 0; i < succes.length; i++) if (succes[i].id === sid) s = succes[i];
        P.a[cle] = 1; sauver();
        if (s) toast(s.e, "Succès : " + s.n, s.d);
        melodie([[660, 0.09], [880, 0.14]]);
        if (conf.surSucces) conf.surSucces(s);
        return true;
      },
      aSucces: function (sid) { return !!P.a[id + "." + sid]; },
      check: function (ctx) {
        succes.forEach(function (s) {
          if (!P.a[id + "." + s.id] && s.f && s.f(d, ctx, diffs[d.diff])) api.debloquer(s.id);
        });
      },
      succes: succes,
      nbSucces: function () {
        var n = 0;
        succes.forEach(function (s) { if (P.a[id + "." + s.id]) n++; });
        return n;
      },

      /* le petit panneau de succes, pret a poser dans une page */
      panneauSucces: function (cible) {
        var box = typeof cible === "string" ? document.getElementById(cible) : cible;
        if (!box) return;
        box.innerHTML = "";
        var titre = document.createElement("div");
        titre.className = "ar-succes-titre";
        titre.innerHTML = "<b>🏅 Succès</b> <span></span>";
        var grille = document.createElement("div");
        grille.className = "ar-badges";
        box.appendChild(titre); box.appendChild(grille);
        function maj() {
          titre.querySelector("span").textContent = api.nbSucces() + " / " + succes.length;
          grille.innerHTML = "";
          succes.forEach(function (s) {
            var on = !!P.a[id + "." + s.id];
            var el = document.createElement("div");
            el.className = "ar-badge" + (on ? " on" : "");
            el.textContent = on ? s.e : "🔒";
            el.title = on ? s.n + " — " + s.d : "??? — " + s.d;
            grille.appendChild(el);
          });
        }
        maj();
        api.majSucces = maj;
        return maj;
      }
    };

    /* --- barre de difficulte --- */
    var barre = null;
    function majBarre() {
      if (!barre) return;
      Array.prototype.forEach.call(barre.querySelectorAll(".ar-diff"), function (b, i) {
        b.classList.toggle("on", i === d.diff);
      });
      var info = barre.querySelector(".ar-diff-info");
      if (info) info.textContent = diffs[d.diff].d || "";
    }
    api.barreDifficulte = function (cible) {
      var box = typeof cible === "string" ? document.getElementById(cible) : cible;
      if (!box) return;
      box.innerHTML = "";
      box.classList.add("ar-diffs");
      var ligne = document.createElement("div");
      ligne.className = "ar-diff-ligne";
      diffs.forEach(function (df, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ar-diff" + (i === d.diff ? " on" : "");
        b.innerHTML = "<span>" + df.e + "</span>" + df.n;
        b.title = df.d || "";
        b.addEventListener("click", function () { api.choisir(i); });
        ligne.appendChild(b);
      });
      var info = document.createElement("div");
      info.className = "ar-diff-info";
      info.textContent = diffs[d.diff].d || "";
      box.appendChild(ligne); box.appendChild(info);
      barre = box;
      majBarre();
      return box;
    };
    api.majBarre = majBarre;

    /* --- temps de jeu --- */
    var dernier = Date.now();
    setInterval(function () {
      var now = Date.now();
      if (!document.hidden) P.temps += (now - dernier) / 1000;
      dernier = now;
    }, 1000);

    /* --- sauvegarde : toutes les 5 minutes + a la fermeture --- */
    setInterval(sauver, 300000);
    window.addEventListener("beforeunload", sauver);
    document.addEventListener("visibilitychange", function () { if (document.hidden) sauver(); });

    /* --- bouton son --- */
    if (conf.son !== false) boutonSon();

    /* --- profil local refuse : on previent une seule fois --- */
    if (refusAuChargement) {
      var raison = refusAuChargement; refusAuChargement = null;
      setTimeout(function () {
        modal("⚠️ Profil refusé",
          "Le profil enregistré dans ce navigateur est invalide ou a été modifié (" + raison +
          "). Tout repart de zéro.", [{ t: "D'accord", c: "btn" }]);
      }, 500);
    }
    return api;
  }

  /* ---------------------------------------------------------------------
     API publique
     --------------------------------------------------------------------- */
  return {
    init: init,
    profil: function () { return P; },
    sauver: sauver,
    exporter: exporter,
    importer: importer,
    texteFichier: texteFichier,
    effacer: function () {
      P = profilVierge();
      try { localStorage.removeItem(CLE); } catch (e) {}
    },
    toast: toast,
    modal: modal,
    bip: bip,
    melodie: melodie,
    boutonSon: boutonSon,
    nb: nb, nb1: nb1, nb2: nb2, secondes: secondes,
    echapper: echapper,
    dernierEnregistrement: function () { return dernierEnregistrement; },
    refus: function () { var r = refusAuChargement; refusAuChargement = null; return r; }
  };
})();
