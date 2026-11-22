/* =========================================================================
   DNX CB-Funkgeraete (v9.12) - Funkgeraet 1 + Funkgeraet 2 + Funkgeraet 3 (markenfrei)
   -------------------------------------------------------------------------
   Eigene Datei, haengt an keinem anderen Plugin. Es benutzt nur, was
   OpenWebRX selbst mitbringt:
     UI.setFrequency()            -> Kanal / Frequenz / RIT
     UI.getFrequency()            -> Anzeige
     UI.setVolume()               -> VOLUME (Regler #openwebrx-panel-volume)
     .openwebrx-squelch-slider    -> SQUELCH (Regler des Geraetepanels)
     .openwebrx-demodulator-button[data-modulation=...] -> MODE (A·F/LOW)
     window.smeter_level          -> Dual-Analog-Messwerke & Suchlauf
   ========================================================================= */
(function () {
  "use strict";
  if (window.__dnxCbFunkGeladen) return;
  window.__dnxCbFunkGeladen = true;

  var KENNUNG = "dnx-george2";
  var SPEICHER = "dnx_george2_zustand";
  var BILD = "static/plugins/receiver/funkgeraet1_ae8000.png";

  /* ---------------------------------------------------------------------
     Kanaltabelle: 80 CB-Kanaele, 10 kHz Raster
       1..40 : 26,965 - 27,405 MHz
      41..80 : 26,565 - 26,955 MHz
     --------------------------------------------------------------------- */
  /* Achtung: die Kanäle 1-40 liegen NICHT auf einem glatten 10-kHz-Raster.
     Nach 3, 7, 11, 15 und 19 fehlt jeweils 10 kHz (26,995 / 27,045 / 27,095 /
     27,145 / 27,195 gibt es nicht), und 23/24/25 sind Dreher:
     27,255 - 27,235 - 27,245. Deshalb hier die feste Tabelle nach der
     deutschen CB-Zuteilung, in kHz. */
  var CB_KANAELE_KHZ = [
    26965, 26975, 26985, 27005, 27015, 27025, 27035, 27055, 27065, 27075,
    27085, 27105, 27115, 27125, 27135, 27155, 27165, 27175, 27185, 27205,
    27215, 27225, 27255, 27235, 27245, 27265, 27275, 27285, 27295, 27305,
    27315, 27325, 27335, 27345, 27355, 27365, 27375, 27385, 27395, 27405
  ];
  function kanalFrequenz(n) {
    if (n >= 1 && n <= 40) return CB_KANAELE_KHZ[n - 1] * 1000;
    if (n >= 41 && n <= 80) return (26565 + (n - 41) * 10) * 1000;
    return 26965000;
  }
  /* Rueckweg: ueber die Tabelle suchen - der Sprung bei 23/24/25 macht eine
     Rechnung unmoeglich. */
  function frequenzKanal(hz) {
    var k;
    if (!istZahl(hz)) return 0;
    for (k = 1; k <= 80; k++) {
      if (Math.abs(hz - kanalFrequenz(k)) <= 5000) return k;
    }
    return 0;
  }
  function wrapKanal(n) {
    var v = (n === null || n === undefined || n === "") ? NaN : Number(n);
    var k = isFinite(v) ? Math.round(v) : 1;
    return ((k - 1) % 80 + 80) % 80 + 1;
  }

  function istZahl(v) { return typeof v === "number" && isFinite(v); }
  function merken(schluessel, wert) {
    try { localStorage.setItem(schluessel, String(wert)); } catch (e) { }
  }
  function holen(schluessel, fallback) {
    try {
      var v = localStorage.getItem(schluessel);
      if (v === null || v === "") return fallback;
      var n = parseFloat(v);
      return isFinite(n) ? n : fallback;
    } catch (e) { return fallback; }
  }
  function holenText(schluessel, fallback) {
    try { var v = localStorage.getItem(schluessel); return (v === null || v === "") ? fallback : v; }
    catch (e) { return fallback; }
  }


  /* ---------------------------------------------------------------------
     Haptik-Klicks (WebAudio, abschaltbar), Audio-Filter & S-Meter-Daempfung
     --------------------------------------------------------------------- */
  var _klickAn = (function () {
    try { var v = localStorage.getItem(SPEICHER + "_klicks"); return v === null ? true : v === "1"; }
    catch (e) { return true; }
  })();
  var _g2Ac = null;
  function g2Klick(art) {
    try {
      if (!_klickAn) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!_g2Ac) _g2Ac = new AC();
      if (_g2Ac.state === "suspended") _g2Ac.resume().catch(function () {});
      var t = _g2Ac.currentTime;
      var osc = _g2Ac.createOscillator();
      var g = _g2Ac.createGain();
      var freq = (art === "dial") ? 2050 : (art === "rast" ? 900 : 1320);
      var dur = (art === "dial") ? 0.0075 : (art === "rast" ? 0.014 : 0.010);
      var peak = (art === "dial") ? 0.016 : 0.025;
      osc.type = (art === "rast") ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 0.42), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.0012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(_g2Ac.destination);
      osc.start(t); osc.stop(t + dur + 0.002);
    } catch (e) { }
  }

  function afBtn(name) {
    try {
      var roots = [
        document.getElementById("audio-filter-panel"),
        document.body
      ];
      var w = String(name || "").toLowerCase();
      for (var r = 0; r < roots.length; r++) {
        if (!roots[r]) continue;
        var bs = roots[r].querySelectorAll("button");
        for (var i = 0; i < bs.length; i++) {
          if (bs[i].classList && (bs[i].classList.contains("ae8-m-knopf") || bs[i].classList.contains("ae-m-knopf") || bs[i].classList.contains("p3-m-knopf"))) continue;
          if (bs[i].closest && bs[i].closest("#dnx-george2,#dnx-ae6290,#dnx-profi95")) continue;
          var txt = (bs[i].textContent || "").replace(/[^a-z]/gi, "").toLowerCase();
          if (txt === w) return bs[i];
        }
      }
    } catch (e) { }
    return null;
  }
  function afRead(name) {
    try {
      var l = String(name || "").toLowerCase();
      if (l === "nb") {
        var vn = localStorage.getItem("openwebrx-audio-filter-declick");
        if (vn !== null) return vn === "true" || vn === "1";
      }
      if (l === "nr") {
        var vr = localStorage.getItem("nr_enabled");
        if (vr !== null) return vr === "true" || vr === "1";
        var vr2 = localStorage.getItem("openwebrx-audio-filter-nr");
        if (vr2 !== null) return vr2 === "true" || vr2 === "1";
      }
      var b = afBtn(name);
      if (b) return /rgb\(\s*(0|46|57|34|76)|#39ff14|green/i.test((b.style && b.style.backgroundColor) || "") || b.classList.contains("active");
    } catch (e) { }
    return false;
  }
  function afToggle(name) {
    try {
      var l = String(name || "").toLowerCase();
      var b = afBtn(name);
      if (l === "nr") {
        var cur = afRead("nr");
        if (typeof UI !== "undefined" && typeof UI.setNR === "function") {
          try { UI.setNR(cur ? 0 : 1); } catch (e0) { }
        }
        try { localStorage.setItem("nr_enabled", cur ? "false" : "true"); } catch (e1) { }
        if (b) { try { b.click(); } catch (e2) { } }
        return afRead("nr");
      }
      if (b) { b.click(); return afRead(name); }
    } catch (e) { }
    return false;
  }

  var _smGlatt = [0, 0, 0];
  var _smPeak = [{ v: 0, t: 0 }, { v: 0, t: 0 }, { v: 0, t: 0 }];
  function smGlaetten(idx, ziel) {
    var cur = _smGlatt[idx] || 0;
    var t = Math.max(0, Math.min(1, ziel || 0));
    var a = (t > cur) ? 0.36 : 0.14;
    var nx = cur + (t - cur) * a;
    if (Math.abs(nx - t) < 0.002) nx = t;
    _smGlatt[idx] = nx;
    var pk = _smPeak[idx] || { v: 0, t: 0 };
    var now = Date.now();
    if (nx >= pk.v) { pk.v = nx; pk.t = now; }
    else if (now - pk.t > 1200) { pk.v = Math.max(nx, pk.v - 0.04); }
    _smPeak[idx] = pk;
    return nx;
  }

  /* ---------------------------------------------------------------------
     Zustand
     --------------------------------------------------------------------- */
  var zustand = {
    /* Beim ersten Besuch offen stehen, damit man das Geraet ueberhaupt findet;
       danach wird die eigene Wahl gemerkt. */
    offen: (function () {
      try { var v = localStorage.getItem(SPEICHER + "_offen"); return v === null ? true : v === "1"; }
      catch (e) { return true; }
    })(),
    /* Zweites Geraet (AE 6290) - eigener Auf/Zu-Zustand */
    aeOffen: (function () {
      try { return localStorage.getItem("dnx_ae6290_offen") === "1"; } catch (e) { return false; }
    })(),
    /* Drittes Geraet (Heimstation / Team Profi 95 Stil) - eigener Auf/Zu-Zustand */
    p3Offen: (function () {
      try { return localStorage.getItem("dnx_profi95_offen") === "1"; } catch (e) { return false; }
    })(),
    laut: holen(SPEICHER + "_laut", 100),
    sq: holen(SPEICHER + "_sq", -150),
    rf: holen(SPEICHER + "_rf", 20),      /* RF-Gain in dB, 0 - 50 */
    kanal: wrapKanal(holen(SPEICHER + "_kanal", 9)),
    istCb: true,
    extHz: null,
    mode: holenText(SPEICHER + "_mode", "nfm"),
    /* Abstand vom Rauschsockel, bei dem der Suchlauf anhaelt.
       Der Sockel wird waehrend des Laufs selbst gemessen (kleinster Pegel). */
    rand: holen(SPEICHER + "_rand", 14),
    boden: null,
    pegelProzent: null,
    pegelZeit: 0,
    scan: false,
    /* DW = Zweikanal-Ueberwachung: abwechselnd auf Kanal A und dem fest
       programmierten Kanal B hoeren. */
    dw: (function () { try { return localStorage.getItem(SPEICHER + "_dw") === "1"; } catch (e) { return false; } })(),
    dwA: 9,
    dwKanal: holen(SPEICHER + "_dwkanal", 27),
    dwZeit: 0,
    dwSignal: false,
    dwBoden: null,
    smBoden: null,
    meldung: "",
    meldungZeit: 0,
    power: true,
    stumm: false,
    stummVorher: null,
    mon: false,
    sqVorMon: null,
    lock: (function () { try { return localStorage.getItem(SPEICHER + "_lock") === "1"; } catch (e) { return false; } })(),
    fun: false,
    funZeit: 0,
    low: (function () { try { return localStorage.getItem(SPEICHER + "_low") === "1"; } catch (e) { return false; } })(),
    lcrKanal: wrapKanal(holen(SPEICHER + "_lcr", 9)),
    ch919Vor: wrapKanal(holen(SPEICHER + "_ch919vor", 1)),
    memIdx: Math.max(0, Math.min(4, Math.round(holen(SPEICHER + "_memidx", 0)))),
    memList: (function () {
      try {
        var raw = localStorage.getItem(SPEICHER + "_memlist");
        if (raw) {
          var arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length === 5) return arr.map(wrapKanal);
        }
      } catch (e) { }
      return [1, 9, 19, 27, 40];
    })(),
    mScan: false,
    mScanIdx: 0,
    filterStufe: Math.max(0, Math.min(3, Math.round(holen(SPEICHER + "_filt", 0)))),
    ritHz: Math.max(-2500, Math.min(2500, Math.round(holen(SPEICHER + "_rit", 0)))),
    swrMode: (function () {
      var m = holenText(SPEICHER + "_swrmode", "mod");
      return (m === "cal" || m === "swr" || m === "mod") ? m : "mod";
    })()
  };

  var MODI = ["nfm", "am", "lsb", "usb"];         /* Reihenfolge der MODE-Taste: FM, AM, LSB, USB */
  var MODE_TEXT = { nfm: "FM", am: "AM", usb: "USB", lsb: "LSB" };
  /* 16 Beleuchtungsfarben. Die ersten 7 sind dieselben wie im Styler (und dort
     auch eingetragen), damit Geraet und Styler zusammenpassen. */
  var LCD_FARBEN = {
    orange: "#ff8c1a", gelb: "#ffe93d", gruen: "#3dff7a", blau: "#3da5ff",
    tuerkis: "#22e0e0", rot: "#ff3b30", weiss: "#eef4ff",
    bernstein: "#ffb300", limette: "#b6ff2e", smaragd: "#00e58a", himmel: "#7fb2ff",
    petrol: "#0097a7", violett: "#b46bff", pink: "#ff5fbf", magenta: "#ff2f6d",
    sonne: "#fff08a", eisblau: "#8fe8ff"
  };
  var FARB_REIHE = ["orange", "gelb", "gruen", "blau", "tuerkis", "rot", "weiss",
                    "bernstein", "limette", "smaragd", "himmel", "petrol",
                    "violett", "pink", "magenta", "sonne", "eisblau"];
  var FARB_NAME = { orange: "Orange", gelb: "Gelb", gruen: "Grün", blau: "Blau",
                    tuerkis: "Türkis", rot: "Rot", weiss: "Weiß",
                    bernstein: "Bernstein", limette: "Limette", smaragd: "Smaragd",
                    himmel: "Himmel", petrol: "Petrol", violett: "Violett",
                    pink: "Pink", magenta: "Magenta", sonne: "Sonne", eisblau: "Eisblau" };
  var FARB_SCHLUESSEL = "dnx_ae8000_lcd";
  /* Die Beleuchtung hat ihren eigenen Speicher. Frueher teilte sie sich den
     Schluessel mit der LCD-Anzeige - stand die Anzeige auf Blau, leuchteten
     Tasten, Griffe und Ecken ebenfalls blau. Jetzt zaehlt nur die eigene
     Einstellung, und ohne Einstellung ist sie orange wie am Anfang. */
  var LICHT_SCHLUESSEL = "dnx_george2_licht";

  /* ---------------------------------------------------------------------
     Albrecht AE 8000 Wurzelholz (1440x449 RGBA): Gemessene Zonen in Prozent
     --------------------------------------------------------------------- */
  var BILD_B = 1440, BILD_H = 449;
  var FELD = {
    bezel:  [16.111,  9.577, 68.056, 44.543],
    meter1: [18.542, 20.490, 13.889, 26.058],
    meter2: [36.458, 20.490, 13.750, 26.058],
    lcd:    [54.861, 23.385, 26.944, 20.267],
    led:    [ 5.000,  5.568,  1.389,  6.904],
    power:  [ 2.569, 14.477,  7.014, 16.927],
    phones: [ 4.306, 42.094,  3.958, 14.922],
    mic:    [ 3.333, 70.156,  6.111, 20.713],
    b1:     [87.639, 13.586,  3.889,  7.572],
    b2:     [92.778, 13.363,  3.889,  7.795],
    b3:     [87.569, 24.944,  3.889,  7.572],
    b4:     [92.708, 24.944,  3.889,  7.572],
    b5:     [87.431, 36.303,  3.958,  7.795],
    b6:     [92.639, 36.303,  3.889,  7.795],
    b7:     [87.361, 47.884,  3.958,  8.018],
    b8:     [92.500, 47.661,  3.889,  8.018]
  };
  /* Exakte Vorderkappen-Zentren + 5 px Randpuffer fuer die 8 Goldknoepfe */
  var AE8_KNOB = {
    vol:    { feld: [13.125, 73.608, 5.417, 17.372], rRatio: 34.0 / 39.0, groesse: 96,  mark: "red" },
    sq:     { feld: [23.576, 73.274, 5.417, 17.372], rRatio: 34.0 / 39.0, groesse: 96,  mark: "red" },
    rf:     { feld: [33.889, 73.608, 5.417, 17.372], rRatio: 34.0 / 39.0, groesse: 96,  mark: "red" },
    micg:   { feld: [44.236, 73.385, 5.417, 17.372], rRatio: 34.0 / 39.0, groesse: 96,  mark: "red" },
    filt:   { feld: [54.340, 73.608, 5.417, 17.372], rRatio: 34.0 / 39.0, groesse: 96,  mark: "red" },
    chan:   { feld: [66.007, 62.138, 9.792, 31.403], rRatio: 65.5 / 70.5, groesse: 176, mark: "dimple" },
    swrcal: { feld: [81.944, 73.385, 5.347, 17.149], rRatio: 33.5 / 38.5, groesse: 96,  mark: "red" },
    swrmod: { feld: [92.083, 73.385, 5.347, 17.149], rRatio: 33.5 / 38.5, groesse: 96,  mark: "red" }
  };

  var AE8_METER_FARBEN = [
    { id: "warm",  bg: "radial-gradient(ellipse at 50% 35%, rgba(255,244,214,.92) 0%, rgba(246,214,158,.84) 68%, rgba(206,162,98,.80) 100%)", name: "Original Warm" },
    { id: "amber", bg: "radial-gradient(ellipse at 50% 35%, rgba(255,232,175,.94) 0%, rgba(245,180,82,.86) 72%, rgba(190,118,32,.82) 100%)", name: "Gold-Bernstein" },
    { id: "ivory", bg: "radial-gradient(ellipse at 50% 35%, rgba(255,253,246,.95) 0%, rgba(238,232,216,.88) 70%, rgba(196,188,168,.84) 100%)", name: "Cremeweiss" },
    { id: "mint",  bg: "radial-gradient(ellipse at 50% 35%, rgba(225,255,238,.90) 0%, rgba(155,232,190,.82) 70%, rgba(78,168,120,.80) 100%)", name: "Smaragd" },
    { id: "rot",   bg: "radial-gradient(ellipse at 50% 35%, rgba(255,204,196,.88) 0%, rgba(228,96,88,.82) 70%, rgba(152,36,34,.82) 100%)", name: "Nacht-Rot" }
  ];

  /* Meldung in der Statuszeile - verschwindet nach 4 Sekunden von selbst */
  function melden(text) {
    zustand.meldung = text || "";
    zustand.meldungZeit = Date.now();
  }

  /* ---------------------------------------------------------------------
     Verdrahtung zu OpenWebRX
     --------------------------------------------------------------------- */
  function frequenzSetzen(hz) {
    try {
      if (typeof UI === "undefined" || typeof UI.setFrequency !== "function") return false;
      UI.setFrequency(Math.round(hz), false);
      return true;
    } catch (e) { return false; }
  }
  function frequenzLesen() {
    try {
      if (typeof UI === "undefined" || typeof UI.getFrequency !== "function") return null;
      var f = UI.getFrequency();
      return (istZahl(f) && f > 1000) ? f : null;
    } catch (e) { return null; }
  }
  function modeSetzen(m) {
    try {
      var knopf = document.querySelector('.openwebrx-demodulator-button[data-modulation="' + m + '"]');
      if (!knopf) return false;
      knopf.click();
      return true;
    } catch (e) { return false; }
  }
  function lautSetzen(v) {
    var val = Math.max(0, Math.min(150, Math.round(v)));
    zustand.laut = val;
    if (val > 0) zustand.stumm = false;
    merken(SPEICHER + "_laut", zustand.laut);
    try {
      var eff = zustand.power ? val : 0;
      var s = document.getElementById("openwebrx-panel-volume");
      if (s) { s.value = eff; ausloesen(s, "input"); ausloesen(s, "change"); }
      if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(eff);
    } catch (e) { }
    malen();
  }
  function sqSetzen(db) {
    zustand.sq = Math.max(-150, Math.min(0, Math.round(db)));
    if (zustand.sq > -150) zustand.mon = false;
    merken(SPEICHER + "_sq", zustand.sq);
    try {
      var s = document.querySelector(".openwebrx-squelch-slider");
      if (s && !s.disabled) { s.value = zustand.sq; ausloesen(s, "input"); ausloesen(s, "change"); }
    } catch (e) { }
    malen();
  }
  function ausloesen(el, art) {
    try { el.dispatchEvent(new Event(art, { bubbles: true })); } catch (e) { }
  }
  function pegelLesen() {
    try { var v = window.smeter_level; return istZahl(v) ? v : null; } catch (e) { return null; }
  }

  var hakenGesetzt = false;
  function pegelHakenSetzen() {
    if (hakenGesetzt) return true;
    try {
      var alt = window.setSmeterRelativeValue;
      if (typeof alt !== "function") return false;
      var neu = function (v) {
        try { alt.apply(this, arguments); } catch (eA) { }
        try {
          if (istZahl(v)) { zustand.pegelProzent = v; zustand.pegelZeit = Date.now(); }
        } catch (eB) { }
      };
      window.setSmeterRelativeValue = neu;
      hakenGesetzt = true;
      return true;
    } catch (e) { return false; }
  }

  function pegelDb() {
    var jetzt = Date.now();
    if (zustand.pegelProzent !== null && jetzt - zustand.pegelZeit < 4000) {
      try {
        if (typeof Waterfall !== "undefined" && typeof Waterfall.getRange === "function") {
          var r = Waterfall.getRange();
          var lo = Number(r.min) - 20, hi = Number(r.max) + 20;
          if (isFinite(lo) && isFinite(hi) && hi > lo) {
            return zustand.pegelProzent * (hi - lo) + lo;
          }
        }
        return zustand.pegelProzent * 100 - 100;
      } catch (e) { }
    }
    return pegelLesen();
  }

  function pegelAnteil() {
    var jetzt = Date.now();
    if (zustand.pegelProzent !== null && jetzt - zustand.pegelZeit < 4000) {
      return Math.max(0, Math.min(1, zustand.pegelProzent));
    }
    var p = pegelLesen();
    if (p === null) return null;
    if (p >= 0 && p <= 1) return p;
    try {
      if (typeof Waterfall !== "undefined" && typeof Waterfall.getRange === "function") {
        var r = Waterfall.getRange();
        var lo = Number(r.min) - 20, hi = Number(r.max) + 20;
        if (isFinite(lo) && isFinite(hi) && hi > lo) {
          return Math.max(0, Math.min(1, (p - lo) / (hi - lo)));
        }
      }
    } catch (e) { }
    return Math.max(0, Math.min(1, (p + 100) / 100));
  }

  /* ---------------------------------------------------------------------
     Kanalwahl, RIT (SWR CAL), Filter & Speicher
     --------------------------------------------------------------------- */
  var g2LetzteExtHz = null;
  function kanalSetzen(n, drehen) {
    var prev = zustand.kanal;
    var k = wrapKanal(n);
    if (prev && prev !== k && !zustand.scan && !zustand.dw && !zustand.mScan) {
      zustand.lcrKanal = prev;
      merken(SPEICHER + "_lcr", prev);
    }
    zustand.kanal = k;
    zustand.istCb = true;
    var hz = kanalFrequenz(k) + (zustand.ritHz || 0);
    zustand.extHz = hz;
    merken(SPEICHER + "_kanal", k);
    frequenzSetzen(hz);
    var nach = frequenzLesen();
    g2LetzteExtHz = (nach !== null) ? nach : hz;
    malen();
  }

  function ritSetzen(hzVal) {
    var v = Math.round(Number(hzVal) || 0);
    v = Math.max(-2500, Math.min(2500, Math.round(v / 100) * 100));
    if (Math.abs(v) <= 150 && Math.abs(zustand.ritHz) > 0 && Math.abs(v) < Math.abs(zustand.ritHz)) v = 0;
    zustand.ritHz = v;
    merken(SPEICHER + "_rit", v);
    if (zustand.swrMode === "cal") {
      melden("SWR CAL: " + (v >= 0 ? "+" : "") + Math.round(v / 50) + " %");
      malen();
      return;
    }
    if (zustand.istCb !== false) {
      var neuHz = kanalFrequenz(zustand.kanal) + v;
      zustand.extHz = neuHz;
      frequenzSetzen(neuHz);
      var nach = frequenzLesen();
      g2LetzteExtHz = (nach !== null) ? nach : neuHz;
    }
    melden(v === 0 ? "RIT: 0 Hz (Mitte)" : ("RIT " + (v > 0 ? "+" : "") + (v / 1000).toFixed(1) + " kHz"));
    malen();
  }

  function filterSyncLesen() {
    var nb = afRead("NB"), nr = afRead("NR");
    if (nb && nr) return 3;
    if (nr) return 2;
    if (nb) return 1;
    return 0;
  }
  function filterSetzen(stufe) {
    var st = Math.max(0, Math.min(3, Math.round(Number(stufe) || 0)));
    zustand.filterStufe = st;
    merken(SPEICHER + "_filt", st);
    var sollNb = (st === 1 || st === 3);
    var sollNr = (st === 2 || st === 3);
    if (afRead("NB") !== sollNb) afToggle("NB");
    if (afRead("NR") !== sollNr) afToggle("NR");
    var namen = ["AUS", "ANL/NB", "NR", "ANL + NR"];
    melden("FILTER: " + namen[st]);
    malen();
  }

  /* ---------------------------------------------------------------------
     RF-Gain: Regler unten (api/dnx-gain)
     --------------------------------------------------------------------- */
  var RF_MIN = 0, RF_MAX = 49, RF_TIMER = null;
  var RF_STATE = { darfAendern: true, qDirect: false, serverWert: null, modus: "manual", apiVorhanden: true };
  function rfProfil() {
    try {
      var box = document.getElementById("openwebrx-sdr-profiles-listbox");
      if (!box || !box.options || !box.options.length) return null;
      var o = box.options[box.selectedIndex >= 0 ? box.selectedIndex : 0];
      var v = (o && o.value ? o.value : "").split("|");
      if (v.length < 2 || !v[0] || !v[1]) return null;
      return { sdr: v[0], profil: v[1], name: (o.textContent || "").trim() };
    } catch (e) { return null; }
  }
  function rfIstQDirect(d, p) {
    if (d && typeof d.q_direct === "boolean") return d.q_direct;
    if (d && (d.direct_sampling === 1 || d.direct_sampling === 2)) return true;
    if (!p) return false;
    if (/q-direct/i.test(p.name || "")) return true;
    if (p.sdr === "rtl_usb_hf_60351967" &&
        !/^hf_2[5-9]/.test(p.profil || "") &&
        p.profil !== "16cfe6b2-b989-4715-8f66-073875db5c67") return true;
    if (p.sdr === "2d36da2b-4d3e-465b-b259-990fe7e2bbb4") return true;
    return false;
  }
  function rfSyncIntern(wert) {
    if (typeof wert === "number") {
      zustand.rf = Math.max(RF_MIN, Math.min(RF_MAX, Math.round(wert)));
      merken(SPEICHER + "_rf", zustand.rf);
      try {
        var z2 = aeZustand();
        if (z2) { z2.rf = zustand.rf; merken(SPEICHER + "_aerf", z2.rf); }
      } catch (eAe) { }
      try {
        var z3 = p3Zustand();
        if (z3) { z3.rf = zustand.rf; merken(SPEICHER3 + "_rf", z3.rf); }
      } catch (eP3) { }
    }
    malen();
    try { aeMalen(); } catch (eM) { }
    try { p3Malen(); } catch (eM3) { }
  }
  function rfSenden(wert) {
    if (!RF_STATE.apiVorhanden) return;
    var p = rfProfil();
    if (!p) { melden("RF-Gain: kein Profil gefunden"); return; }
    fetch("api/dnx-gain?sdr=" + encodeURIComponent(p.sdr) + "&profil=" + encodeURIComponent(p.profil), {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ modus: "manual", rf_gain: wert })
    }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { code: r.status, d: d }; });
      })
      .then(function (res) {
        if (res.code === 200 && res.d && res.d.ok) {
          var gw = (typeof res.d.geraet === "number") ? res.d.geraet :
                   ((typeof res.d.rf_gain === "number") ? res.d.rf_gain : wert);
          RF_STATE.modus = res.d.modus || "manual";
          RF_STATE.serverWert = gw;
          RF_STATE.qDirect = rfIstQDirect(res.d, p);
          rfSyncIntern(gw);
          try {
            window.dispatchEvent(new CustomEvent("dnx-rf-gain", {
              detail: { wert: gw, modus: RF_STATE.modus, qDirect: RF_STATE.qDirect, quelle: "george2", gespeichert: true }
            }));
          } catch (eEv) { }
          var msg = RF_STATE.qDirect ?
            ("RF-Gain " + gw + " dB (Q-Direct: ohne Wirkung)") :
            ("RF-Gain " + gw + " dB uebernommen");
          melden(msg);
          try { aeMeld(msg); } catch (eAeM) { }
          try { p3Meld(msg); } catch (eP3M) { }
        } else if (res.code === 404 || res.code === 405 || res.code === 501) {
          RF_STATE.apiVorhanden = false;
          var locMsg = "RF-Gain " + wert + " dB (lokal)";
          melden(locMsg);
          try { aeMeld(locMsg); } catch (eAeM0) { }
          try { p3Meld(locMsg); } catch (eP3M0) { }
        } else {
          if (res.code === 403) RF_STATE.darfAendern = false;
          var errMsg = (res.code === 403) ? "RF-Gain: bitte anmelden (403)" :
            ("RF-Gain: " + ((res.d && res.d.fehler) || res.code));
          melden(errMsg);
          try { aeMeld(errMsg); } catch (eAeM2) { }
          try { p3Meld(errMsg); } catch (eP3M2) { }
          rfLaden();
        }
        malen();
      })
      .catch(function () { melden("RF-Gain: keine Antwort"); malen(); });
  }
  function rfSetzen(w) {
    var p = rfProfil();
    RF_STATE.qDirect = rfIstQDirect(null, p);
    if (RF_STATE.darfAendern === false) {
      if (RF_TIMER) { clearTimeout(RF_TIMER); RF_TIMER = null; }
      if (typeof RF_STATE.serverWert === "number") rfSyncIntern(RF_STATE.serverWert);
      melden("RF-Gain: bitte anmelden");
      try { aeMeld("RF-Gain: bitte anmelden"); } catch (eAe3) { }
      try { p3Meld("RF-Gain: bitte anmelden"); } catch (eP33) { }
      return;
    }
    RF_STATE.modus = "manual";
    rfSyncIntern(w);
    try {
      window.dispatchEvent(new CustomEvent("dnx-rf-gain", {
        detail: { wert: zustand.rf, modus: "manual", qDirect: RF_STATE.qDirect, quelle: "george2" }
      }));
    } catch (eWf) { }
    var mTxt = RF_STATE.qDirect ?
      ("RF-Gain " + zustand.rf + " dB (Q-Direct: ohne Wirkung)") :
      ("RF-Gain " + zustand.rf + " dB");
    melden(mTxt);
    try { aeMeld(mTxt); } catch (eAe4) { }
    try { p3Meld(mTxt); } catch (eP34) { }
    if (RF_TIMER) clearTimeout(RF_TIMER);
    if (RF_STATE.apiVorhanden) {
      RF_TIMER = setTimeout(function () { RF_TIMER = null; rfSenden(zustand.rf); }, 1200);
    }
    malen();
  }
  function rfLaden() {
    if (!RF_STATE.apiVorhanden) return;
    var p = rfProfil();
    if (!p) { setTimeout(rfLaden, 3000); return; }
    fetch("api/dnx-gain?sdr=" + encodeURIComponent(p.sdr) + "&profil=" + encodeURIComponent(p.profil),
          { credentials: "same-origin" })
      .then(function (r) {
        if (r.status === 404 || r.status === 405 || r.status === 501) {
          RF_STATE.apiVorhanden = false;
          return { code: r.status, d: null };
        }
        return r.json().catch(function () { return {}; }).then(function (d) { return { code: r.status, d: d }; });
      })
      .then(function (res) {
        if (res.code !== 200 || !res.d || !res.d.ok) return;
        var d = res.d;
        if (typeof d.darf_aendern === "boolean") RF_STATE.darfAendern = d.darf_aendern;
        RF_STATE.qDirect = rfIstQDirect(d, p);
        RF_STATE.modus = d.modus || "manual";
        var gVal = (typeof d.geraet === "number") ? d.geraet :
                   ((typeof d.rf_gain === "number") ? d.rf_gain : null);
        var mVal = (d.mein !== null && d.mein !== undefined && d.mein !== "auto" && typeof d.mein === "number")
                   ? d.mein : null;
        var w = (gVal !== null) ? gVal : mVal;
        if (RF_STATE.modus === "auto") {
          RF_STATE.serverWert = null;
          malen();
          try { aeMalen(); } catch (eA) { }
          try { p3Malen(); } catch (eP3A) { }
        } else if (typeof w === "number") {
          RF_STATE.serverWert = w;
          rfSyncIntern(w);
        }
        try {
          window.dispatchEvent(new CustomEvent("dnx-rf-gain-sync", {
            detail: {
              wert: typeof w === "number" ? w : zustand.rf,
              modus: RF_STATE.modus,
              darfAendern: RF_STATE.darfAendern,
              qDirect: RF_STATE.qDirect,
              quelle: "george2"
            }
          }));
        } catch (eSy) { }
      })
      .catch(function () { });
  }

  /* ---------------------------------------------------------------------
     Suchlauf (SCAN & M·SCN) + Zweikanal-Ueberwachung (DW)
     --------------------------------------------------------------------- */
  var scanTimer = null;
  var scanZaehler = 0;
  function scanStart(memoryMode) {
    if (!zustand.power) return;
    dwStopp("");
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    zustand.scan = true;
    zustand.mScan = !!memoryMode;
    zustand.boden = null;
    scanZaehler = 0;
    melden(memoryMode ? "M·SCN (Speicher) ..." : "SCAN (Suchlauf) ...");
    scanSchritt();
    malen();
  }
  function scanStopp(meldung) {
    var war = zustand.scan;
    zustand.scan = false;
    zustand.mScan = false;
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    if (meldung !== undefined && (meldung || war)) melden(meldung);
    malen();
  }
  function scanSchritt() {
    if (!zustand.scan || !zustand.power) return;
    if (zustand.mScan) {
      zustand.mScanIdx = (zustand.mScanIdx + 1) % zustand.memList.length;
      kanalSetzen(zustand.memList[zustand.mScanIdx], true);
    } else {
      kanalSetzen(zustand.kanal + 1, true);
    }
    scanTimer = setTimeout(function () {
      if (!zustand.scan || !zustand.power) return;
      var p = pegelDb();
      if (p === null) { scanSchritt(); return; }
      if (zustand.boden === null || p < zustand.boden) zustand.boden = p;
      scanZaehler++;
      if (scanZaehler >= 3 && p > zustand.boden + zustand.rand) {
        scanStopp("Treffer Kanal " + zustand.kanal + " (+" + Math.round(p - zustand.boden) + " dB)");
        return;
      }
      scanSchritt();
    }, 1000);
  }

  function dwStart() {
    if (!zustand.power) return;
    scanStopp("");
    zustand.dw = true;
    zustand.dwA = (zustand.kanal !== zustand.dwKanal)
      ? zustand.kanal
      : (zustand.dwKanal > 1 ? zustand.dwKanal - 1 : 2);
    zustand.dwZeit = Date.now();
    zustand.dwBoden = null;
    merken(SPEICHER + "_dw", "1");
    melden("DW an · 2. Kanal " + (zustand.dwKanal < 10 ? "0" + zustand.dwKanal : zustand.dwKanal));
    malen();
  }
  function dwStopp(meldung) {
    if (!zustand.dw) return;
    zustand.dw = false;
    zustand.dwSignal = false;
    merken(SPEICHER + "_dw", "0");
    melden(meldung);
    malen();
  }
  function dwWechsel() {
    var ziel = (zustand.kanal === zustand.dwKanal) ? zustand.dwA : zustand.dwKanal;
    kanalSetzen(ziel, true);
    zustand.dwZeit = Date.now();
  }
  function dwKanalSetzen(n) {
    var k = wrapKanal(n);
    zustand.dwKanal = k;
    zustand.dwZeit = Date.now();
    merken(SPEICHER + "_dwkanal", k);
    melden("DW 2. Kanal: " + (k < 10 ? "0" + k : String(k)));
    malen();
  }
  function dwTakt() {
    if (!zustand.dw || zustand.scan || !zustand.power) return;
    var p = pegelDb();
    if (p === null) return;
    if (zustand.dwBoden === null || p < zustand.dwBoden) zustand.dwBoden = p;
    else zustand.dwBoden = Math.min(p, zustand.dwBoden + 0.03);
    zustand.dwSignal = (p > zustand.dwBoden + zustand.rand);
    if (!zustand.dwSignal && Date.now() - zustand.dwZeit > 2000) dwWechsel();
  }

  function ae8PowerUmschalten(ziel) {
    var neu = (typeof ziel === "boolean") ? ziel : !zustand.power;
    if (neu === zustand.power) return zustand.power;
    zustand.power = neu;
    if (!neu) {
      scanStopp("");
      dwStopp("");
      try {
        var s = document.getElementById("openwebrx-panel-volume");
        if (s) { s.value = 0; ausloesen(s, "input"); ausloesen(s, "change"); }
        if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(0);
      } catch (e0) { }
      melden("STANDBY");
    } else {
      lautSetzen(zustand.stumm ? 0 : (zustand.laut > 0 ? zustand.laut : 80));
      melden("BEREIT");
    }
    malen();
    return zustand.power;
  }

  /* ---------------------------------------------------------------------
     Dual-Analog-Messwerke (S-Meter / WATTS + MODULATION / SWR)
     --------------------------------------------------------------------- */
  function ae8Meter1SvgBauen(box) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 220 128");
    svg.setAttribute("preserveAspectRatio", "none");

    function arcPt(r, deg) {
      var ra = deg * Math.PI / 180;
      return [110 + Math.sin(ra) * r, 142 - Math.cos(ra) * r];
    }
    function arcPath(r, a0, a1) {
      var p0 = arcPt(r, a0), p1 = arcPt(r, a1);
      return "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) +
             " A" + r + " " + r + " 0 0 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1);
    }
    function add(tag, attrs, par) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (par || svg).appendChild(e);
      return e;
    }

    add("text", {
      x: "110", y: "13", fill: "#2b241d",
      "font-family": "system-ui,sans-serif", "font-weight": "800",
      "font-size": "8.5", "letter-spacing": "1.1", "text-anchor": "middle"
    }).textContent = "SIGNAL";

    add("path", { d: arcPath(96, -44, 14), fill: "none", stroke: "#181512", "stroke-width": "1.6", "stroke-linecap": "round" });
    add("path", { d: arcPath(96, 14, 44),  fill: "none", stroke: "#c42420", "stroke-width": "2.6", "stroke-linecap": "round" });
    add("path", { d: arcPath(72, -41, 41), fill: "none", stroke: "#2b251e", "stroke-width": "1.1" });

    var sMarks = [
      { d: -44, l: "0", c: "#181512" },
      { d: -32, l: "1", c: "#181512" },
      { d: -21, l: "3", c: "#181512" },
      { d: -10, l: "5", c: "#181512" },
      { d:   2, l: "7", c: "#181512" },
      { d:  14, l: "9", c: "#181512" },
      { d:  38, l: "+30dB", c: "#c42420", sm: 1 }
    ];
    for (var i = 0; i < sMarks.length; i++) {
      var m = sMarks[i];
      var pA = arcPt(96, m.d), pB = arcPt(102, m.d), pT = arcPt(110.5, m.d);
      add("line", { x1: pA[0].toFixed(1), y1: pA[1].toFixed(1), x2: pB[0].toFixed(1), y2: pB[1].toFixed(1), stroke: m.c, "stroke-width": "1.4" });
      add("text", {
        x: pT[0].toFixed(1), y: pT[1].toFixed(1), fill: m.c,
        "font-family": "system-ui,sans-serif", "font-weight": "800",
        "font-size": m.sm ? "7.8" : "9.5", "text-anchor": "middle", "dominant-baseline": "middle"
      }).textContent = m.l;
    }
    [-38, -26.5, -15.5, -4, 8, 24, 34].forEach(function (deg) {
      var c = deg > 14 ? "#c42420" : "#181512";
      var p1 = arcPt(96, deg), p2 = arcPt(100, deg);
      add("line", { x1: p1[0].toFixed(1), y1: p1[1].toFixed(1), x2: p2[0].toFixed(1), y2: p2[1].toFixed(1), stroke: c, "stroke-width": "1" });
    });

    var wMarks = [
      { d: -41, l: "0" }, { d: -26, l: ".5" }, { d: -12, l: "1" },
      { d:   2, l: "2" }, { d:  15, l: "3" },  { d:  28, l: "4" }, { d: 41, l: "5" }
    ];
    for (var j = 0; j < wMarks.length; j++) {
      var wm = wMarks[j];
      var wA = arcPt(72, wm.d), wB = arcPt(67.5, wm.d), wT = arcPt(60, wm.d);
      add("line", { x1: wA[0].toFixed(1), y1: wA[1].toFixed(1), x2: wB[0].toFixed(1), y2: wB[1].toFixed(1), stroke: "#2b251e", "stroke-width": "1" });
      add("text", {
        x: wT[0].toFixed(1), y: wT[1].toFixed(1), fill: "#2b251e",
        "font-family": "system-ui,sans-serif", "font-weight": "700",
        "font-size": "8", "text-anchor": "middle", "dominant-baseline": "middle"
      }).textContent = wm.l;
    }

    add("text", {
      x: "110", y: "97", fill: "#2b251e",
      "font-family": "system-ui,sans-serif", "font-weight": "700",
      "font-size": "7.5", "letter-spacing": "1", "text-anchor": "middle"
    }).textContent = "WATTS";
    add("text", {
      x: "110", y: "110", fill: "#181512",
      "font-family": "system-ui,sans-serif", "font-weight": "800",
      "font-size": "10", "letter-spacing": "0.7", "text-anchor": "middle"
    }).textContent = "TX POWER";

    var ng = add("g", { transform: "rotate(-44, 110, 142)" });
    add("line", { x1: "110", y1: "142", x2: "110", y2: "34", stroke: "rgba(0,0,0,.22)", "stroke-width": "3.2", "stroke-linecap": "round" }, ng);
    add("line", { x1: "110", y1: "142", x2: "110", y2: "34", stroke: "#181512", "stroke-width": "1.7", "stroke-linecap": "round" }, ng);
    add("line", { x1: "110", y1: "54",  x2: "110", y2: "34", stroke: "#c42420", "stroke-width": "2.0", "stroke-linecap": "round" }, ng);
    add("circle", { cx: "110", cy: "130", r: "11", fill: "#191512" });

    box.appendChild(svg);
    return ng;
  }

  function ae8Meter2SvgBauen(box) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 220 128");
    svg.setAttribute("preserveAspectRatio", "none");

    function arcPt(r, deg) {
      var ra = deg * Math.PI / 180;
      return [110 + Math.sin(ra) * r, 142 - Math.cos(ra) * r];
    }
    function arcPath(r, a0, a1) {
      var p0 = arcPt(r, a0), p1 = arcPt(r, a1);
      return "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) +
             " A" + r + " " + r + " 0 0 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1);
    }
    function add(tag, attrs, par) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (par || svg).appendChild(e);
      return e;
    }

    add("text", {
      x: "110", y: "13", fill: "#2b241d",
      "font-family": "system-ui,sans-serif", "font-weight": "800",
      "font-size": "8.2", "letter-spacing": "1.0", "text-anchor": "middle"
    }).textContent = "MODULATION";

    add("path", { d: arcPath(96, -44, 44), fill: "none", stroke: "#181512", "stroke-width": "1.5", "stroke-linecap": "round" });
    var pctMarks = [
      { d: -44, l: "0" }, { d: -31, l: "10" }, { d: -19, l: "20" },
      { d:  -8, l: "30" }, { d:   6, l: "50" }, { d:  18, l: "60" },
      { d:  30, l: "80" }, { d:  41, l: "100%" }
    ];
    for (var i = 0; i < pctMarks.length; i++) {
      var pm = pctMarks[i];
      var pA = arcPt(96, pm.d), pB = arcPt(101, pm.d), pT = arcPt(109.5, pm.d);
      add("line", { x1: pA[0].toFixed(1), y1: pA[1].toFixed(1), x2: pB[0].toFixed(1), y2: pB[1].toFixed(1), stroke: "#181512", "stroke-width": "1.2" });
      add("text", {
        x: pT[0].toFixed(1), y: pT[1].toFixed(1), fill: "#181512",
        "font-family": "system-ui,sans-serif", "font-weight": "700",
        "font-size": i === 7 ? "7.2" : "8.0", "text-anchor": "middle", "dominant-baseline": "middle"
      }).textContent = pm.l;
    }
    var khzMarks = [{ d: -20, l: "0.5" }, { d: -3, l: "1" }, { d: 13, l: "1.5" }, { d: 28, l: "2 kHz" }];
    for (var k = 0; k < khzMarks.length; k++) {
      var km = khzMarks[k];
      var kT = arcPt(84, km.d);
      add("text", {
        x: kT[0].toFixed(1), y: kT[1].toFixed(1), fill: "#383028",
        "font-family": "system-ui,sans-serif", "font-weight": "700",
        "font-size": "6.8", "text-anchor": "middle", "dominant-baseline": "middle"
      }).textContent = km.l;
    }

    add("path", { d: arcPath(69, -42, 16), fill: "none", stroke: "#181512", "stroke-width": "1.4" });
    add("path", { d: arcPath(69, 16, 42),  fill: "none", stroke: "#c42420", "stroke-width": "2.6" });
    var swrMarks = [
      { d: -42, l: "1.2", c: "#181512" }, { d: -22, l: "1.5", c: "#181512" },
      { d:  -3, l: "2",   c: "#181512" }, { d:  16, l: "3",   c: "#c42420" },
      { d:  36, l: "CAL", c: "#c42420" }
    ];
    for (var s = 0; s < swrMarks.length; s++) {
      var sm = swrMarks[s];
      var sA = arcPt(69, sm.d), sB = arcPt(64.5, sm.d), sT = arcPt(57.5, sm.d);
      add("line", { x1: sA[0].toFixed(1), y1: sA[1].toFixed(1), x2: sB[0].toFixed(1), y2: sB[1].toFixed(1), stroke: sm.c, "stroke-width": "1.2" });
      add("text", {
        x: sT[0].toFixed(1), y: sT[1].toFixed(1), fill: sm.c,
        "font-family": "system-ui,sans-serif", "font-weight": "800",
        "font-size": "7.5", "text-anchor": "middle", "dominant-baseline": "middle"
      }).textContent = sm.l;
    }

    add("text", {
      x: "110", y: "109", fill: "#181512",
      "font-family": "system-ui,sans-serif", "font-weight": "800",
      "font-size": "10", "letter-spacing": "0.9", "text-anchor": "middle"
    }).textContent = "SWR";

    var ng = add("g", { transform: "rotate(-44, 110, 142)" });
    add("line", { x1: "110", y1: "142", x2: "110", y2: "34", stroke: "rgba(0,0,0,.22)", "stroke-width": "3.2", "stroke-linecap": "round" }, ng);
    add("line", { x1: "110", y1: "142", x2: "110", y2: "34", stroke: "#181512", "stroke-width": "1.7", "stroke-linecap": "round" }, ng);
    add("line", { x1: "110", y1: "54",  x2: "110", y2: "34", stroke: "#c42420", "stroke-width": "2.0", "stroke-linecap": "round" }, ng);
    add("circle", { cx: "110", cy: "130", r: "11", fill: "#191512" });

    box.appendChild(svg);
    return ng;
  }

  var _modPrev = 0, _modGlatt = 0;
  function ae8NadelZeichnen(rohAnteil) {
    if (!zustand.power) {
      if (el.m1Nadel) el.m1Nadel.setAttribute("transform", "rotate(-44, 110, 142)");
      if (el.m2Nadel) el.m2Nadel.setAttribute("transform", "rotate(-44, 110, 142)");
      return;
    }
    var a1 = (rohAnteil === null || !isFinite(rohAnteil)) ? 0 : smGlaetten(0, rohAnteil);
    var g1 = -44 + Math.max(0, Math.min(1, a1)) * 88;
    if (el.m1Nadel) el.m1Nadel.setAttribute("transform", "rotate(" + g1.toFixed(1) + ", 110, 142)");

    var a2 = 0;
    if (zustand.swrMode === "cal") {
      var targetCal = 0.89 + (zustand.ritHz || 0) / 14000;
      _modGlatt += (Math.max(0.15, Math.min(0.98, targetCal)) - _modGlatt) * 0.28;
      a2 = _modGlatt;
    } else if (zustand.swrMode === "swr") {
      _modGlatt += (0.04 - _modGlatt) * 0.25;
      a2 = _modGlatt;
    } else {
      var r = (rohAnteil === null || !isFinite(rohAnteil)) ? 0 : Math.max(0, Math.min(1, rohAnteil));
      var delta = Math.abs(r - _modPrev);
      _modPrev = r;
      var ziel2 = Math.min(0.95, r * 0.62 + delta * 3.8);
      var k2 = (ziel2 > _modGlatt) ? 0.45 : 0.16;
      _modGlatt += (ziel2 - _modGlatt) * k2;
      a2 = _modGlatt;
    }
    var g2 = -44 + Math.max(0, Math.min(1, a2)) * 88;
    if (el.m2Nadel) el.m2Nadel.setAttribute("transform", "rotate(" + g2.toFixed(1) + ", 110, 142)");
  }

  var el = {};
  function lcdFarbe() {
    var id = holenText(FARB_SCHLUESSEL, "bernstein");
    if (id === "bernstein") return "#f4b25c";
    return LCD_FARBEN[id] || "#f4b25c";
  }
  function hexZuRgb(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lichtFarbe() {
    var id = holenText(LICHT_SCHLUESSEL, "bernstein");
    return LCD_FARBEN[id] || LCD_FARBEN.bernstein;
  }
  var LICHT_FILTER = {
    orange: "hue-rotate(0deg)",
    gelb: "hue-rotate(34deg) saturate(1.3)",
    gruen: "hue-rotate(114deg) saturate(2.0)",
    blau: "hue-rotate(184deg) saturate(1.9)",
    tuerkis: "hue-rotate(150deg) saturate(1.1)",
    rot: "hue-rotate(333deg) saturate(2.1)",
    weiss: "saturate(0) brightness(1.8)",
    bernstein: "hue-rotate(0deg)",
    limette: "hue-rotate(58deg) saturate(1.3)",
    smaragd: "hue-rotate(123deg) saturate(1.3)",
    himmel: "hue-rotate(195deg) saturate(2.1)",
    petrol: "hue-rotate(154deg) saturate(2.1)",
    violett: "hue-rotate(245deg) saturate(2.1)",
    pink: "hue-rotate(290deg) saturate(2.1)",
    magenta: "hue-rotate(310deg) saturate(2.1)",
    sonne: "hue-rotate(33deg) saturate(1.3)",
    eisblau: "hue-rotate(161deg) saturate(2.0)"
  };
  function lichtFilter() { return "hue-rotate(0deg)"; }
  function lichtRgb() { return hexZuRgb(lichtFarbe()).join(","); }
  function lichtHell() {
    return hexZuRgb(lichtFarbe()).map(function (v) { return Math.round(v + (255 - v) * 0.55); }).join(",");
  }

  function lcdDreh(richtung) {
    var id = holenText(FARB_SCHLUESSEL, "bernstein");
    var i = FARB_REIHE.indexOf(id);
    if (i < 0) i = 0;
    var n = FARB_REIHE.length;
    var k = ((i + (richtung || 1)) % n + n) % n;
    var neu = FARB_REIHE[k];
    try { localStorage.setItem(FARB_SCHLUESSEL, neu); } catch (e) { }
    melden("LCD " + (k + 1) + "/" + n + ": " + (FARB_NAME[neu] || neu));
    malen();
    return neu;
  }
  function ae8MeterWeiter(richtung) {
    var i = Math.round(holen(SPEICHER + "_meterlicht", 0));
    var n = AE8_METER_FARBEN.length;
    var k = ((i + (richtung || 1)) % n + n) % n;
    merken(SPEICHER + "_meterlicht", k);
    melden("Skalenlicht: " + AE8_METER_FARBEN[k].name);
    malen();
    return k;
  }

  function handCursor(farbe, faust) {
    var k = faust ? 6 : 0;
    var s = "<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'>";
    s += "<g fill='" + farbe + "' stroke='%23141210' stroke-width='1.7' stroke-linejoin='round'>";
    s += "<rect x='13' y='" + (3 + k) + "' width='5' height='" + (17 - k) + "' rx='2.5'/>";
    s += "<rect x='18' y='" + (6 + k) + "' width='5' height='" + (14 - k) + "' rx='2.5'/>";
    s += "<rect x='23' y='" + (8 + k) + "' width='5' height='" + (12 - k) + "' rx='2.5'/>";
    s += "<rect x='27.4' y='" + (11 + k) + "' width='4.6' height='" + (9 - k) + "' rx='2.3'/>";
    s += "<path d='M11 15 L6 19.5 a2.7 2.7 0 0 0 3.7 3.5 L12.5 20.5 Z'/>";
    s += "<rect x='10' y='14' width='20' height='17' rx='7'/>";
    s += "</g></svg>";
    return "url(\"data:image/svg+xml;utf8," + s + "\") 14 11, " + (faust ? "grabbing" : "grab");
  }

  function menueAusrichten(winEl, mEl) {
    if (!winEl || !mEl || !mEl.classList.contains("offen")) return;
    mEl.classList.remove("menue-unten", "menue-rechts");
    mEl.style.removeProperty("max-height");
    var wr = winEl.getBoundingClientRect();
    var mh = mEl.scrollHeight || mEl.offsetHeight || 280;
    var mw = mEl.offsetWidth || 268;
    var platzOben = Math.max(0, wr.top - 12);
    var platzUnten = Math.max(0, (window.innerHeight || 980) - wr.bottom - 12);
    var nachUnten = (platzOben < mh + 8 && platzUnten > platzOben);
    if (nachUnten) {
      mEl.classList.add("menue-unten");
      mEl.style.setProperty("max-height", Math.max(120, Math.floor(platzUnten)) + "px", "important");
    } else {
      mEl.style.setProperty("max-height", Math.max(120, Math.floor(platzOben)) + "px", "important");
    }
    if (wr.left + 10 + mw > (window.innerWidth || 1600) - 8 && wr.right - 10 - mw >= 8) {
      mEl.classList.add("menue-rechts");
    }
  }

  function cbKastenKlemmen(winEl, setBreiteFn, minW, persistFn) {
    if (!winEl || winEl.style.display === "none") return;
    var vw = window.innerWidth || 1600, vh = window.innerHeight || 980;
    var r = winEl.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return;
    var maxFitW = Math.max(minW, vw - 8);
    if (r.width > maxFitW) {
      setBreiteFn(maxFitW);
      r = winEl.getBoundingClientRect();
    }
    var maxFitH = Math.max(80, vh - 8);
    if (r.height > maxFitH && r.height > 0) {
      var nw = Math.max(minW, Math.floor(r.width * (maxFitH / r.height)));
      if (nw < r.width) {
        setBreiteFn(nw);
        r = winEl.getBoundingClientRect();
      }
    }
    var nl = r.left, nt = r.top, ch = false;
    if (r.left < 0) { nl = 0; ch = true; }
    else if (r.right > vw) { nl = Math.max(0, vw - r.width); ch = true; }
    if (r.top < 0) { nt = 0; ch = true; }
    else if (r.bottom > vh) { nt = Math.max(0, vh - r.height); ch = true; }
    if (ch) {
      winEl.style.left = Math.round(nl) + "px";
      winEl.style.top = Math.round(nt) + "px";
      winEl.style.bottom = "auto";
      if (persistFn) persistFn(winEl);
    }
  }


  /* ---------------------------------------------------------------------
     Gold-Drehknopf: laesst die echte Studio-Goldbeleuchtung der Frontplatte
     intakt, dreht dezent Raendel-Zahnkranz, polierte Schimmer-Reflexe und
     die originale rote AE8000-Markierung bzw. CHANNEL-Fingermulde.
     --------------------------------------------------------------------- */
  function ae8KnopfBauen(name, cfg, holen, setzen, von, bis, titel, opts) {
    opts = opts || {};
    var RAST = (opts.rast && opts.rast > 0) ? opts.rast : 0;
    var fl = document.createElement("canvas");
    fl.className = "g2-knopf g2-knopf-" + name;
    fl.style.left = cfg.feld[0] + "%";
    fl.style.top = cfg.feld[1] + "%";
    fl.style.width = cfg.feld[2] + "%";
    fl.style.height = cfg.feld[3] + "%";
    fl.setAttribute("title", titel);
    fl.setAttribute("data-feld", name);

    var seite = cfg.groesse || 96;
    fl.width = seite;
    fl.height = seite;
    var ctx = fl.getContext("2d");
    var _cGrad = null;

    function knopfMalen() {
      var val = holen();
      var anteil = (val - von) / ((bis - von) || 1);
      anteil = Math.max(0, Math.min(1, anteil));
      var grad;
      if (opts.angSpan) {
        grad = (opts.angStart !== undefined ? opts.angStart : -45) + anteil * opts.angSpan;
      } else if (RAST) {
        grad = -180 + anteil * 360;
      } else {
        grad = -135 + anteil * 270;
      }
      var gradR = Math.round(grad * 10) / 10;
      if (_cGrad === gradR) return;
      _cGrad = gradR;

      ctx.clearRect(0, 0, seite, seite);
      var R = seite / 2;
      var rCap = R * (cfg.rRatio || 0.87);

      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(gradR * Math.PI / 180);

      var nZ = (cfg.mark === "dimple") ? 36 : 24;
      for (var zi = 0; zi < nZ; zi++) {
        var za = (zi * Math.PI * 2) / nZ;
        ctx.strokeStyle = (zi % 2 === 0) ? "rgba(255,248,200,.24)" : "rgba(42,24,4,.28)";
        ctx.lineWidth = Math.max(1.0, seite * 0.015);
        ctx.beginPath();
        ctx.moveTo(Math.cos(za) * (rCap * 0.90), Math.sin(za) * (rCap * 0.90));
        ctx.lineTo(Math.cos(za) * (rCap * 1.03), Math.sin(za) * (rCap * 1.03));
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255,245,190,.09)";
      ctx.lineWidth = Math.max(1.2, seite * 0.02);
      ctx.beginPath();
      ctx.moveTo(-rCap * 0.65, 0);
      ctx.lineTo(rCap * 0.65, 0);
      ctx.stroke();

      if (cfg.mark === "dimple") {
        var dc = -rCap * 0.54;
        var dr = rCap * 0.19;
        var dg = ctx.createRadialGradient(0, dc + dr * 0.25, dr * 0.15, 0, dc, dr);
        dg.addColorStop(0, "rgba(255,242,170,.72)");
        dg.addColorStop(0.55, "rgba(178,136,42,.58)");
        dg.addColorStop(0.88, "rgba(68,45,8,.72)");
        dg.addColorStop(1, "rgba(255,246,195,.52)");
        ctx.beginPath();
        ctx.arc(0, dc, dr, 0, Math.PI * 2);
        ctx.fillStyle = dg;
        ctx.fill();
        ctx.lineWidth = Math.max(1, seite * 0.009);
        ctx.strokeStyle = "rgba(48,30,4,.55)";
        ctx.stroke();

        ctx.fillStyle = "rgba(218,30,24,.92)";
        ctx.beginPath();
        ctx.arc(0, -rCap * 0.87, Math.max(2.2, seite * 0.022), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(38,6,4,.55)";
        ctx.lineWidth = Math.max(3.2, seite * 0.062);
        ctx.beginPath();
        ctx.moveTo(0, -rCap * 0.56);
        ctx.lineTo(0, -rCap * 0.88);
        ctx.stroke();

        ctx.strokeStyle = "#d91c18";
        ctx.lineWidth = Math.max(2.2, seite * 0.044);
        ctx.beginPath();
        ctx.moveTo(0, -rCap * 0.57);
        ctx.lineTo(0, -rCap * 0.87);
        ctx.stroke();

        ctx.fillStyle = "#ff4e42";
        ctx.beginPath();
        ctx.arc(0, -rCap * 0.78, Math.max(1.1, seite * 0.015), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    fl.knopfMalen = knopfMalen;

    var greift = false, letzter = 0, start = 0, summe = 0, stufen = 0;
    function winkel(e) {
      var r = fl.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2),
                        e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    }
    function ae8Move(e) {
      if (!greift) return;
      if (e.stopPropagation) e.stopPropagation();
      if (e.cancelable && e.preventDefault) e.preventDefault();
      var w = winkel(e), d = w - letzter;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      letzter = w; summe += d;
      if (RAST) {
        var prevSt = stufen;
        while (summe >= RAST) { summe -= RAST; stufen += 1; }
        while (summe <= -RAST) { summe += RAST; stufen -= 1; }
        if (stufen !== prevSt) g2Klick("dial");
        setzen(start + stufen);
      } else {
        var span = opts.angSpan || 270;
        setzen(start + (summe / span) * (bis - von));
      }
    }
    function loslassen() {
      if (!greift) return;
      greift = false;
      try { fl.classList.remove("greift"); } catch (e) { }
      window.removeEventListener("pointermove", ae8Move, true);
      window.removeEventListener("pointerup", loslassen, true);
      window.removeEventListener("pointercancel", loslassen, true);
      window.removeEventListener("blur", loslassen, true);
    }
    fl.addEventListener("pointerdown", function (e) {
      if (e && e.button && e.button !== 0) return;
      if (zustand.lock) { melden("LOCK aktiv"); malen(); return; }
      greift = true; summe = 0; stufen = 0; start = holen(); letzter = winkel(e);
      try { fl.classList.add("greift"); } catch (err) { }
      window.addEventListener("pointermove", ae8Move, { capture: true, passive: false });
      window.addEventListener("pointerup", loslassen, true);
      window.addEventListener("pointercancel", loslassen, true);
      window.addEventListener("blur", loslassen, true);
      e.preventDefault();
      e.stopPropagation();
    });
    fl.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (zustand.lock) { melden("LOCK aktiv"); malen(); return; }
      g2Klick("dial");
      if (RAST) { setzen(holen() + (rad(e) > 0 ? -1 : 1)); return; }
      var schritt = opts.radSchritt || 1;
      setzen(holen() + (rad(e) > 0 ? -schritt : schritt));
    }, { passive: false });
    if (opts.onDblClick) {
      fl.addEventListener("dblclick", function (e) {
        e.preventDefault();
        if (zustand.lock) return;
        opts.onDblClick();
      });
    }
    return fl;
  }

  function bauen() {
    if (document.getElementById(KENNUNG)) return;

    var HAND_AUF = handCursor("%23f6d3a8", 0);
    var HAND_ZU  = handCursor("%23e8b98a", 1);

    var css = document.createElement("style");
    css.setAttribute("data-von", KENNUNG);
    css.textContent = [
      "#" + KENNUNG + "{position:fixed !important;left:14px;bottom:44px;",
      " z-index:2147483100 !important;width:680px;font-family:system-ui,sans-serif !important;user-select:none !important;overflow:visible !important;}",
      "#" + KENNUNG + " .g2-geraet{position:relative !important;border:none !important;border-radius:14px !important;",
      " overflow:visible !important;isolation:isolate !important;filter:drop-shadow(0 14px 28px rgba(0,0,0,.80)) !important;}",
      "#" + KENNUNG + " .g2-geraet > img{display:block !important;width:100% !important;height:auto !important;aspect-ratio:1440/449 !important;user-select:none !important;border-radius:12px !important;}",
      "#" + KENNUNG + " .ae8-led{position:absolute !important;z-index:5 !important;pointer-events:none !important;display:flex !important;align-items:center !important;justify-content:center !important;}",
      "#" + KENNUNG + " .ae8-led i{display:block !important;width:calc(5.8px * var(--g2-skala,1)) !important;height:calc(5.8px * var(--g2-skala,1)) !important;border-radius:50% !important;",
      " background:radial-gradient(circle at 38% 35%,#ff968a 0%,#eb1c18 55%,#7c0503 100%) !important;",
      " box-shadow:0 0 calc(8px * var(--g2-skala,1)) rgba(255,44,32,.95),0 0 calc(2px * var(--g2-skala,1)) #ffd0cc !important;transition:all .15s !important;}",
      "#" + KENNUNG + ".standby .ae8-led i{background:#340a09 !important;box-shadow:none !important;opacity:.75 !important;}",
      "#" + KENNUNG + " .ae8-zone{position:absolute !important;z-index:6 !important;background:transparent !important;border:none !important;padding:0 !important;cursor:pointer !important;border-radius:5px !important;}",
      "#" + KENNUNG + " .ae8-zone:hover{background:rgba(255,220,165,.07) !important;}",
      "#" + KENNUNG + " .ae8-zone:active{background:rgba(255,220,165,.16) !important;}",
      "#" + KENNUNG + " .ae8-brand{position:absolute !important;z-index:5 !important;left:18.6% !important;top:11.6% !important;",
      " display:flex !important;align-items:baseline !important;gap:calc(6px * var(--g2-skala,1)) !important;pointer-events:none !important;}",
      "#" + KENNUNG + " .ae8-brand-a{font:italic 800 calc(10.5px * var(--g2-skala,1))/1 'Trebuchet MS',system-ui,sans-serif !important;",
      " color:#eceef2 !important;letter-spacing:.02em !important;text-shadow:0 1px 2px #000 !important;}",
      "#" + KENNUNG + " .ae8-brand-m{font:700 calc(11px * var(--g2-skala,1))/1 system-ui,sans-serif !important;",
      " color:#f4f6f9 !important;letter-spacing:.08em !important;text-shadow:0 1px 2px #000 !important;}",
      "#" + KENNUNG + " .ae8-cbs{position:absolute !important;z-index:5 !important;left:54.9% !important;top:14.0% !important;pointer-events:none !important;",
      " font:700 calc(8.8px * var(--g2-skala,1))/1 system-ui,sans-serif !important;letter-spacing:.09em !important;",
      " color:rgba(242,245,250,.94) !important;text-shadow:0 1px 2px #000 !important;}",
      "#" + KENNUNG + " .ae8-meter{position:absolute !important;z-index:5 !important;border-radius:3px !important;overflow:hidden !important;cursor:pointer !important;",
      " box-shadow:inset 0 2px 7px rgba(0,0,0,.55),inset 0 0 0 1px rgba(24,18,12,.7) !important;transition:filter .2s !important;}",
      "#" + KENNUNG + " .ae8-meter-licht{position:absolute !important;inset:0 !important;pointer-events:none !important;transition:background .25s,opacity .25s !important;}",
      "#" + KENNUNG + " .ae8-meter svg{position:relative !important;z-index:2 !important;width:100% !important;height:100% !important;display:block !important;}",
      "#" + KENNUNG + " .ae8-meter::after{content:'' !important;position:absolute !important;inset:0 !important;z-index:3 !important;pointer-events:none !important;",
      " background:linear-gradient(128deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,.04) 33%,transparent 36%) !important;}",
      "#" + KENNUNG + ".standby .ae8-meter{filter:brightness(.22) saturate(.3) !important;}",
      "#" + KENNUNG + " .g2-lcd-klick{position:absolute !important;z-index:7 !important;background:transparent !important;cursor:pointer !important;border-radius:4px !important;}",
      "#" + KENNUNG + " .g2-lcd-klick:active{background:rgba(255,255,255,.05) !important;}",
      "#" + KENNUNG + " .g2-lcd{position:absolute !important;z-index:5 !important;border-radius:4px !important;overflow:hidden !important;pointer-events:none !important;",
      " background-color:#f4b25c !important;",
      " background-image:radial-gradient(ellipse at 50% 44%,rgba(255,255,255,.28) 0%,rgba(0,0,0,.08) 68%,rgba(0,0,0,.38) 100%) !important;",
      " box-shadow:inset 0 3px 10px rgba(0,0,0,.78),inset 0 0 18px rgba(0,0,0,.35),inset 0 0 0 1.5px rgba(10,8,6,.85) !important;",
      " transition:filter .2s !important;}",
      "#" + KENNUNG + " .g2-lcd::after{content:'' !important;position:absolute !important;inset:0 !important;pointer-events:none !important;z-index:6 !important;",
      " background:linear-gradient(125deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,.05) 30%,transparent 32%) !important;}",
      "#" + KENNUNG + ".standby .g2-lcd{filter:brightness(.18) saturate(.3) !important;}",
      "#" + KENNUNG + ".standby .g2-teil,#" + KENNUNG + ".standby .g2-flags{opacity:.14 !important;}",
      "#" + KENNUNG + " .g2-teil{position:absolute !important;pointer-events:none !important;display:flex !important;align-items:center !important;justify-content:center !important;z-index:5 !important;}",
      "#" + KENNUNG + " .g2-sr{position:absolute !important;width:1px !important;height:1px !important;overflow:hidden !important;opacity:0 !important;pointer-events:none !important;}",
      "#" + KENNUNG + " .g2-mode{left:55.6% !important;top:29.5% !important;width:3.0% !important;height:4.2% !important;justify-content:flex-start !important;}",
      "#" + KENNUNG + " .g2-mode span{font:800 calc(8.2px * var(--g2-skala,1))/1 system-ui,sans-serif !important;color:#120a03 !important;letter-spacing:.03em !important;}",
      "#" + KENNUNG + " .g2-freq{left:58.3% !important;top:25.8% !important;width:12.6% !important;height:11.8% !important;justify-content:center !important;}",
      "#" + KENNUNG + " .g2-kanal{left:71.2% !important;top:24.8% !important;width:6.4% !important;height:13.6% !important;justify-content:center !important;}",
      "#" + KENNUNG + " .g2-flags{position:absolute !important;z-index:5 !important;left:55.6% !important;top:24.2% !important;width:25.4% !important;height:18.6% !important;pointer-events:none !important;}",
      "#" + KENNUNG + " .ae8-flg{position:absolute !important;font:800 calc(6.4px * var(--g2-skala,1))/1 system-ui,sans-serif !important;letter-spacing:.04em !important;",
      " color:#120a03 !important;opacity:.14 !important;transition:opacity .12s !important;}",
      "#" + KENNUNG + " .ae8-flg.an{opacity:.95 !important;}",
      "#" + KENNUNG + " .ae8-flg.f-dw{left:0;top:7%;}#" + KENNUNG + " .ae8-flg.f-scn{left:13%;top:7%;}#" + KENNUNG + " .ae8-flg.f-mem{left:29%;top:7%;}",
      "#" + KENNUNG + " .ae8-flg.f-mon{left:0;bottom:27%;}#" + KENNUNG + " .ae8-flg.f-low{right:1.5%;top:7%;}",
      "#" + KENNUNG + " .ae8-flg.f-fun{right:1.5%;top:37%;}#" + KENNUNG + " .ae8-flg.f-anl{right:1.5%;bottom:21%;}",
      "#" + KENNUNG + " .ae8-flg.f-lock{right:17%;top:7%;}",
      "#" + KENNUNG + " .g2-status{left:55.8% !important;top:39.2% !important;width:25.2% !important;height:3.8% !important;justify-content:flex-start !important;overflow:hidden !important;}",
      "#" + KENNUNG + " .g2-status span{font:700 calc(7.1px * var(--g2-skala,1))/1 'Courier New',monospace !important;color:#120a03 !important;opacity:.82 !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;}",
      "#" + KENNUNG + " .g2-seg{position:relative !important;display:flex !important;align-items:flex-end !important;gap:calc(2.4px * var(--g2-skala,1)) !important;filter:drop-shadow(1px 1.2px 0 rgba(0,0,0,.22)) !important;}",
      "#" + KENNUNG + " .g2-seg .z{position:relative !important;display:block !important;width:calc(12.2px * var(--g2-skala,1)) !important;height:calc(23px * var(--g2-skala,1)) !important;flex:0 0 auto !important;transform:skewX(-5deg) !important;}",
      "#" + KENNUNG + " .g2-seg.big .z{width:calc(15.5px * var(--g2-skala,1)) !important;height:calc(30px * var(--g2-skala,1)) !important;}",
      "#" + KENNUNG + " .g2-seg.big{gap:calc(3.5px * var(--g2-skala,1)) !important;}",
      "#" + KENNUNG + " .g2-seg .z i{position:absolute !important;display:block !important;background:rgba(18,10,3,.065) !important;border-radius:1px !important;}",
      "#" + KENNUNG + " .g2-seg .z i.on{background:#120a03 !important;box-shadow:0 0 1px rgba(18,10,3,.35) !important;}",
      "#" + KENNUNG + " .g2-seg .z i.a{top:0;left:calc(2.1px * var(--g2-skala,1));right:calc(2.1px * var(--g2-skala,1));height:calc(2.5px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg .z i.d{bottom:0;left:calc(2.1px * var(--g2-skala,1));right:calc(2.1px * var(--g2-skala,1));height:calc(2.5px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg .z i.g{top:calc(10.25px * var(--g2-skala,1));left:calc(2.1px * var(--g2-skala,1));right:calc(2.1px * var(--g2-skala,1));height:calc(2.5px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg .z i.f{top:calc(2.1px * var(--g2-skala,1));left:0;width:calc(2.5px * var(--g2-skala,1));height:calc(8.0px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg .z i.b{top:calc(2.1px * var(--g2-skala,1));right:0;width:calc(2.5px * var(--g2-skala,1));height:calc(8.0px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg .z i.e{bottom:calc(2.1px * var(--g2-skala,1));left:0;width:calc(2.5px * var(--g2-skala,1));height:calc(8.0px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg .z i.c{bottom:calc(2.1px * var(--g2-skala,1));right:0;width:calc(2.5px * var(--g2-skala,1));height:calc(8.0px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg.big .z i.a{left:calc(2.6px * var(--g2-skala,1));right:calc(2.6px * var(--g2-skala,1));height:calc(3.3px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg.big .z i.d{left:calc(2.6px * var(--g2-skala,1));right:calc(2.6px * var(--g2-skala,1));height:calc(3.3px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg.big .z i.g{top:calc(13.35px * var(--g2-skala,1));left:calc(2.6px * var(--g2-skala,1));right:calc(2.6px * var(--g2-skala,1));height:calc(3.3px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg.big .z i.f{top:calc(2.6px * var(--g2-skala,1));width:calc(3.3px * var(--g2-skala,1));height:calc(10.5px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg.big .z i.b{top:calc(2.6px * var(--g2-skala,1));width:calc(3.3px * var(--g2-skala,1));height:calc(10.5px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg.big .z i.e{bottom:calc(2.6px * var(--g2-skala,1));width:calc(3.3px * var(--g2-skala,1));height:calc(10.5px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg.big .z i.c{bottom:calc(2.6px * var(--g2-skala,1));width:calc(3.3px * var(--g2-skala,1));height:calc(10.5px * var(--g2-skala,1));}",
      "#" + KENNUNG + " .g2-seg .k{position:relative !important;display:block !important;width:calc(4px * var(--g2-skala,1)) !important;height:calc(23px * var(--g2-skala,1)) !important;flex:0 0 auto !important;}",
      "#" + KENNUNG + " .g2-seg .k i{position:absolute !important;left:calc(.7px * var(--g2-skala,1));bottom:0;width:calc(2.6px * var(--g2-skala,1));height:calc(3.2px * var(--g2-skala,1));background:#120a03 !important;border-radius:1px !important;}",
      "#" + KENNUNG + " .g2-knopf{position:absolute !important;z-index:6 !important;border-radius:50% !important;",
      " touch-action:none !important;cursor:" + HAND_AUF + " !important;}",
      "#" + KENNUNG + " .g2-knopf.greift{cursor:" + HAND_ZU + " !important;}",
      "#" + KENNUNG + " .g2-taste{position:absolute !important;z-index:6 !important;border-radius:6px !important;",
      " background:transparent !important;border:none !important;padding:0 !important;cursor:pointer !important;",
      " display:flex !important;align-items:center !important;justify-content:center !important;",
      " font:700 calc(7.6px * var(--g2-skala,1))/1 system-ui,sans-serif !important;letter-spacing:.03em !important;",
      " color:rgba(240,242,246,.92) !important;text-shadow:0 1px 1px #000 !important;transition:box-shadow .12s,transform .08s,background .12s !important;}",
      "#" + KENNUNG + " .g2-taste:hover{background:rgba(255,255,255,.08) !important;}",
      "#" + KENNUNG + " .g2-taste:active{transform:translateY(1px) !important;background:rgba(255,220,160,.18) !important;}",
      "#" + KENNUNG + " .g2-taste.leuchtet,#" + KENNUNG + " .g2-taste.an{",
      " box-shadow:inset 0 0 0 1.4px rgba(255,190,85,.92),0 0 7px rgba(255,165,45,.48) !important;color:#ffe6b0 !important;}",
      "#" + KENNUNG + " .ae8-lbl{position:absolute !important;z-index:5 !important;pointer-events:none !important;text-align:center !important;",
      " font:700 calc(7.0px * var(--g2-skala,1))/1 system-ui,sans-serif !important;letter-spacing:.05em !important;",
      " color:rgba(246,242,235,.90) !important;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.7) !important;white-space:nowrap !important;}",
      "#" + KENNUNG + " .ae8-lbl.sub{font:700 calc(5.9px * var(--g2-skala,1))/1 system-ui,sans-serif !important;letter-spacing:.02em !important;color:rgba(244,238,230,.88) !important;}",
      "#" + KENNUNG + " .g2-griff{position:absolute !important;z-index:20 !important;opacity:.28 !important;transition:opacity .15s linear !important;}",
      "#" + KENNUNG + ":hover .g2-griff{opacity:.78 !important;}",
      "#" + KENNUNG + " .g2-griff:hover{opacity:1 !important;}",
      "#" + KENNUNG + " .ae8-menu{position:absolute !important;left:22px !important;top:4px !important;z-index:22 !important;",
      " width:22px !important;height:18px !important;padding:0 !important;border-radius:4px !important;cursor:pointer !important;",
      " background:rgba(16,10,6,.82) !important;color:#ffd08a !important;border:1px solid rgba(255,188,92,.55) !important;font:11px/16px system-ui !important;}",
      "#" + KENNUNG + " .g2-wechsel{position:absolute !important;top:4px !important;right:46px !important;z-index:22 !important;",
      " height:18px !important;padding:0 6px !important;border-radius:4px !important;cursor:pointer !important;",
      " background:rgba(16,10,6,.82) !important;border:1px solid rgba(255,205,140,.45) !important;",
      " color:#ffdcb0 !important;font:700 10.5px/16px system-ui !important;letter-spacing:.03em !important;}",
      "#" + KENNUNG + " .g2-wechsel3{right:86px !important;}",
      "#" + KENNUNG + " .g2-wechsel:hover{background:rgba(255,165,45,.28) !important;}",
      "#" + KENNUNG + " .g2-zu{right:22px !important;top:4px !important;z-index:22 !important;",
      " width:20px !important;height:18px !important;padding:0 !important;cursor:pointer !important;border-radius:4px !important;",
      " background:rgba(16,10,6,.82) !important;border:1px solid rgba(255,205,140,.45) !important;color:#ffdcb0 !important;",
      " font:700 12.5px/16px system-ui !important;text-align:center !important;}",
      "#" + KENNUNG + " .g2-zieh{left:50% !important;bottom:3px !important;margin-left:-24px !important;z-index:22 !important;",
      " width:48px !important;height:13px !important;",
      " cursor:move !important;border-radius:7px !important;background:rgba(12,8,4,.72) !important;",
      " border:1px solid rgba(255,205,140,.4) !important;display:flex !important;align-items:center !important;justify-content:center !important;gap:3px !important;}",
      "#" + KENNUNG + " .g2-zieh i{width:3px !important;height:3px !important;",
      " border-radius:50% !important;background:#ffdcb0 !important;display:block !important;}",
      "#" + KENNUNG + " .g2-eck{width:14px !important;height:14px !important;z-index:20 !important;}",
      "#" + KENNUNG + " .g2-eck.br{right:2px !important;bottom:2px !important;border-right:3px solid #ffd08a !important;border-bottom:3px solid #ffd08a !important;cursor:nwse-resize !important;}",
      "#" + KENNUNG + " .g2-eck.bl{left:2px !important;bottom:2px !important;border-left:3px solid #ffd08a !important;border-bottom:3px solid #ffd08a !important;cursor:nesw-resize !important;}",
      "#" + KENNUNG + " .g2-eck.tr{right:2px !important;top:2px !important;border-right:3px solid #ffd08a !important;border-top:3px solid #ffd08a !important;cursor:nesw-resize !important;}",
      "#" + KENNUNG + " .g2-eck.tl{left:2px !important;top:2px !important;border-left:3px solid #ffd08a !important;border-top:3px solid #ffd08a !important;cursor:nwse-resize !important;}",
      "#" + KENNUNG + " .ae8-menue{position:absolute !important;left:10px !important;bottom:calc(100% + 6px) !important;top:auto !important;z-index:30 !important;",
      " width:268px !important;max-height:calc(100vh - 24px) !important;overflow-y:auto !important;padding:10px 11px !important;border-radius:9px !important;display:none;",
      " background:linear-gradient(180deg,#261a12,#160f0a) !important;border:1px solid #6e4a2f !important;box-shadow:0 12px 28px rgba(0,0,0,.86) !important;}",
      "#" + KENNUNG + " .ae8-menue.menue-unten{top:calc(100% + 6px) !important;bottom:auto !important;}",
      "#" + KENNUNG + " .ae8-menue.menue-rechts{left:auto !important;right:10px !important;}",
      "#" + KENNUNG + " .ae8-menue.offen{display:block !important;}",
      "#" + KENNUNG + " .ae8-m-titel{font:800 11px/1 system-ui !important;letter-spacing:.08em !important;color:#ffd08a !important;margin-bottom:7px !important;}",
      "#" + KENNUNG + " .ae8-m-zeile{display:flex !important;align-items:center !important;gap:7px !important;margin:6px 0 !important;font:11px/1.2 system-ui !important;color:#f0e4d6 !important;}",
      "#" + KENNUNG + " .ae8-m-zeile label{width:82px !important;opacity:.85 !important;}",
      "#" + KENNUNG + " .ae8-m-zeile input[type=range]{flex:1 1 auto;min-width:0;}",
      "#" + KENNUNG + " .ae8-m-zeile b{width:42px !important;text-align:right !important;font-weight:700 !important;color:#ffd08a !important;}",
      "#" + KENNUNG + " .ae8-m-knopf{width:100% !important;margin-top:6px !important;height:25px !important;border-radius:6px !important;cursor:pointer !important;",
      " background:#362519 !important;color:#f5ece2 !important;border:1px solid #634632 !important;font:11px/23px system-ui !important;}",
      "#" + KENNUNG + " .ae8-m-knopf.an{background:rgba(244,178,92,.32) !important;border-color:#ffd08a !important;color:#fff !important;}",
      "#dnx-g2-knopf{position:fixed !important;left:14px !important;bottom:14px !important;z-index:2147483100 !important;",
      " background:linear-gradient(180deg,#3b2314,#21130a) !important;color:#ffdca8 !important;",
      " border:1px solid rgba(244,178,92,.6) !important;",
      " border-radius:8px !important;padding:7px 12px !important;font-size:13px !important;cursor:pointer !important;}"
    ].join("\n");
    document.head.appendChild(css);

    function pctCss(f) {
      return "left:" + f[0] + "%;top:" + f[1] + "%;width:" + f[2] + "%;height:" + f[3] + "%;";
    }

    var fenster = document.createElement("div");
    fenster.id = KENNUNG;

    function breiteSetzen(w) {
      fenster.style.width = w + "px";
      try { fenster.style.setProperty("--g2-skala", (w / 680).toFixed(3)); } catch (e) { }
    }

    var b0 = Number(holenText(SPEICHER + "_breite", "0"));
    if (b0 >= 320) breiteSetzen(b0);
    var l0 = holenText(SPEICHER + "_links", ""), t0 = holenText(SPEICHER + "_oben", "");
    if (l0 !== "" && t0 !== "") {
      fenster.style.left = l0 + "px";
      fenster.style.top = t0 + "px";
      fenster.style.bottom = "auto";
    }

    var geraet = document.createElement("div");
    geraet.className = "g2-geraet";

    var bild = document.createElement("img");
    bild.src = BILD + "?v=" + Date.now();
    bild.alt = "Funkgerät 1";
    bild.draggable = false;
    geraet.appendChild(bild);
    el.bild = bild;
    el.bildVersuche = 0;
    el.bildZeit = Date.now();
    if (bild.complete && bild.naturalWidth) { setTimeout(malen, 60); }
    else {
      bild.addEventListener("load", function () { el.bildVersuche = 0; setTimeout(malen, 60); });
      bild.addEventListener("error", function () {
        malen();
        if (el.bildVersuche < 30) {
          el.bildVersuche++;
          el.bildZeit = Date.now();
          setTimeout(function () {
            if (!el.bild || el.bild.naturalWidth) return;
            el.bildZeit = Date.now();
            el.bild.src = BILD + "?v=" + Date.now();
          }, 1200);
        }
      });
    }

    var ledBox = document.createElement("div");
    ledBox.className = "ae8-led";
    ledBox.style.cssText = pctCss(FELD.led);
    ledBox.appendChild(document.createElement("i"));
    geraet.appendChild(ledBox);

    var hPower = document.createElement("button");
    hPower.className = "ae8-zone";
    hPower.style.cssText = pctCss(FELD.power);
    hPower.title = "POWER – Gerät Ein / Standby";
    geraet.appendChild(hPower);

    var hPhones = document.createElement("button");
    hPhones.className = "ae8-zone";
    hPhones.style.cssText = pctCss(FELD.phones);
    hPhones.title = "PHONES – Kopfhörer (Klick = Stumm / Ton ein)";
    geraet.appendChild(hPhones);

    var hMic = document.createElement("button");
    hMic.className = "ae8-zone";
    hMic.style.cssText = pctCss(FELD.mic);
    hMic.title = "MIC – 6-Pol Mikrofonbuchse (Empfangsbetrieb)";
    geraet.appendChild(hMic);

    var cbs = document.createElement("div");
    cbs.className = "ae8-cbs";
    cbs.textContent = "CB BASE STATION";
    geraet.appendChild(cbs);

    var m1Box = document.createElement("div");
    m1Box.className = "ae8-meter ae8-meter1";
    m1Box.style.cssText = pctCss(FELD.meter1);
    m1Box.title = "SIGNAL / TX POWER – Klick wechselt Skalenbeleuchtung";
    var m1Licht = document.createElement("div");
    m1Licht.className = "ae8-meter-licht";
    m1Box.appendChild(m1Licht);
    el.m1Nadel = ae8Meter1SvgBauen(m1Box);
    el.m1Licht = m1Licht;
    geraet.appendChild(m1Box);

    var m2Box = document.createElement("div");
    m2Box.className = "ae8-meter ae8-meter2";
    m2Box.style.cssText = pctCss(FELD.meter2);
    m2Box.title = "MODULATION / SWR – Klick wechselt Skalenbeleuchtung";
    var m2Licht = document.createElement("div");
    m2Licht.className = "ae8-meter-licht";
    m2Box.appendChild(m2Licht);
    el.m2Nadel = ae8Meter2SvgBauen(m2Box);
    el.m2Licht = m2Licht;
    geraet.appendChild(m2Box);

    m1Box.addEventListener("click", function () { g2Klick("taste"); ae8MeterWeiter(1); });
    m1Box.addEventListener("wheel", function (ev) { ev.preventDefault(); ae8MeterWeiter(rad(ev) > 0 ? -1 : 1); }, { passive: false });
    m2Box.addEventListener("click", function () { g2Klick("taste"); ae8MeterWeiter(1); });
    m2Box.addEventListener("wheel", function (ev) { ev.preventDefault(); ae8MeterWeiter(rad(ev) > 0 ? -1 : 1); }, { passive: false });

    var lcd = document.createElement("div");
    lcd.className = "g2-lcd";
    lcd.style.cssText = pctCss(FELD.lcd);
    geraet.appendChild(lcd);
    el.lcd = lcd;

    var lcdKlick = document.createElement("div");
    lcdKlick.className = "g2-lcd-klick";
    lcdKlick.style.cssText = pctCss(FELD.lcd);
    lcdKlick.title = "LCD-Anzeige – Klick schaltet Hintergrundbeleuchtung weiter";
    lcdKlick.addEventListener("click", function () { g2Klick("taste"); lcdDreh(1); });
    lcdKlick.addEventListener("wheel", function (e) { e.preventDefault(); lcdDreh(rad(e) > 0 ? -1 : 1); }, { passive: false });
    geraet.appendChild(lcdKlick);

    function teil(name, inhalt) {
      var d = document.createElement("div");
      d.className = "g2-teil g2-" + name;
      d.innerHTML = inhalt;
      geraet.appendChild(d);
      return d;
    }
    el.mode = teil("mode", "<span>FM</span>").querySelector("span");
    var fBox = teil("freq", '<span class="g2-seg" data-wert=""></span>');
    el.freq = fBox.querySelector("span");
    var kBox = teil("kanal", '<span class="g2-seg big" data-wert=""></span>');
    el.kanalZahl = kBox.querySelector("span");
    el.kanalText = document.createElement("small");
    el.status = teil("status", "<span></span>").querySelector("span");

    var flgBox = document.createElement("div");
    flgBox.className = "g2-flags";
    flgBox.innerHTML = [
      '<span class="ae8-flg f-dw">DW</span>',
      '<span class="ae8-flg f-scn">SCN</span>',
      '<span class="ae8-flg f-mem">MEM</span>',
      '<span class="ae8-flg f-mon">MON</span>',
      '<span class="ae8-flg f-lock">LOCK</span>',
      '<span class="ae8-flg f-low">LOW</span>',
      '<span class="ae8-flg f-fun">FUN</span>',
      '<span class="ae8-flg f-anl">ANL</span>'
    ].join("");
    geraet.appendChild(flgBox);
    el.flgs = {
      dw:   flgBox.querySelector(".f-dw"),
      scn:  flgBox.querySelector(".f-scn"),
      mem:  flgBox.querySelector(".f-mem"),
      mon:  flgBox.querySelector(".f-mon"),
      lock: flgBox.querySelector(".f-lock"),
      low:  flgBox.querySelector(".f-low"),
      fun:  flgBox.querySelector(".f-fun"),
      anl:  flgBox.querySelector(".f-anl")
    };

    el.knopfVol = ae8KnopfBauen("vol", AE8_KNOB.vol,
      function () { return zustand.laut; },
      function (v) { lautSetzen(v); },
      0, 150, "VOLUME – Lautstärke drehen");
    el.knopfSq = ae8KnopfBauen("sq", AE8_KNOB.sq,
      function () { return zustand.sq; },
      function (v) { sqSetzen(v); },
      -150, 0, "SQUELCH – Rauschsperre drehen");
    el.knopfRf = ae8KnopfBauen("rf", AE8_KNOB.rf,
      function () { return zustand.rf; },
      function (v) { rfSetzen(v); },
      RF_MIN, RF_MAX, "RF-GAIN – Empfangsverstärkung 0–49 dB");
    el.knopfMicg = ae8KnopfBauen("micg", AE8_KNOB.micg,
      function () { return zustand.rand; },
      function (v) {
        zustand.rand = Math.max(6, Math.min(30, Math.round(v)));
        merken(SPEICHER + "_rand", zustand.rand);
        melden("Suchlauf-Schwelle +" + zustand.rand + " dB");
        malen();
      },
      6, 30, "MIC GAIN – Suchlauf-Schwelle (+6..+30 dB)");
    el.knopfFilt = ae8KnopfBauen("filt", AE8_KNOB.filt,
      function () { return filterSyncLesen(); },
      function (v) { filterSetzen(v); },
      0, 3, "FILTER – Störaustaster/NR (AUS / NB / NR / NB+NR)",
      { rast: 45, angStart: -120, angSpan: 240 });
    el.knopfKanal = ae8KnopfBauen("chan", AE8_KNOB.chan,
      function () { return zustand.dw ? zustand.dwKanal : zustand.kanal; },
      function (v) {
        scanStopp("");
        var n = wrapKanal(v);
        if (zustand.dw) { dwKanalSetzen(n); return; }
        dwStopp("");
        kanalSetzen(n, true);
      },
      1, 81, "CHANNEL – Kanal 1–80 drehen (rastet je Kanal)",
      { rast: 4.5 });
    el.knopfSwrCal = ae8KnopfBauen("swrcal", AE8_KNOB.swrcal,
      function () { return zustand.ritHz; },
      function (v) { ritSetzen(v); },
      -2500, 2500, "SWR CAL / RIT – Feinstimmung ±2,5 kHz (Doppelklick = 0 Hz)",
      { radSchritt: 100, onDblClick: function () { g2Klick("rast"); ritSetzen(0); } });
    var swrList = ["cal", "swr", "mod"];
    el.knopfSwrMod = ae8KnopfBauen("swrmod", AE8_KNOB.swrmod,
      function () { var idx = swrList.indexOf(zustand.swrMode); return idx < 0 ? 2 : idx; },
      function (v) {
        var idx = Math.max(0, Math.min(2, Math.round(v)));
        var neu = swrList[idx];
        if (neu !== zustand.swrMode) {
          zustand.swrMode = neu;
          merken(SPEICHER + "_swrmode", neu);
          melden("Meter 2: " + neu.toUpperCase());
          malen();
        }
      },
      0, 2, "SWR / CAL / MOD – Umschalter für rechtes Zeigermesswerk",
      { rast: 36, angStart: -45, angSpan: 90 });

    [el.knopfVol, el.knopfSq, el.knopfRf, el.knopfMicg, el.knopfFilt,
     el.knopfKanal, el.knopfSwrCal, el.knopfSwrMod].forEach(function (k) { geraet.appendChild(k); });

    function tasteBau(feld, txt, titel) {
      var d = document.createElement("button");
      d.className = "g2-taste";
      d.style.cssText = pctCss(feld);
      d.title = titel;
      d.textContent = txt;
      geraet.appendChild(d);
      return d;
    }
    var bt1 = tasteBau(FELD.b1, "1", "1 / CH9/19 – Direkt auf Kanal 9 / 19 / zurück");
    var bt2 = tasteBau(FELD.b2, "2", "2 / DW/ANL – Zweikanal-Überwachung (lang/FUN = ANL Noise Blanker)");
    var bt3 = tasteBau(FELD.b3, "3", "3 / A·F/LOW – Betriebsart FM/AM/LSB/USB (lang/FUN = LOW Empfindlichkeit)");
    var bt4 = tasteBau(FELD.b4, "4", "4 / SCN/M·SCN – Suchlauf (Mausrad = 2. DW-Kanal, lang/FUN = Speicher-Scan)");
    var bt5 = tasteBau(FELD.b5, "5", "5 / LCR/SPK – Letzter Kanal zurück (lang/FUN = Stumm/Ton)");
    var bt6 = tasteBau(FELD.b6, "ME", "ME – Speicher M1–M5 durchschalten (lang/FUN = Kanal speichern)");
    var bt7 = tasteBau(FELD.b7, "MON", "MON – Monitor (Rauschsperre vorübergehend öffnen)");
    var bt8 = tasteBau(FELD.b8, "FUN", "FUN – Zweitfunktion (lang = Einstellungs-Menü)");
    el.tasten = { bt1: bt1, bt2: bt2, bt3: bt3, bt4: bt4, bt5: bt5, bt6: bt6, bt7: bt7, bt8: bt8 };

    function blitz(d) {
      try { d.classList.add("leuchtet"); setTimeout(function () { d.classList.remove("leuchtet"); }, 140); } catch (e) { }
    }
    function ae8Gesperrt() {
      if (!zustand.power) { melden("STANDBY – POWER einschalten"); malen(); return true; }
      if (zustand.lock)  { melden("LOCK aktiv"); malen(); return true; }
      return false;
    }
    function ae8FunVerbrauchen() {
      if (zustand.fun && Date.now() - (zustand.funZeit || 0) < 5500) {
        zustand.fun = false;
        return true;
      }
      zustand.fun = false;
      return false;
    }
    function bindTapHold(btn, onTap, onHold) {
      var ht = null, held = false;
      btn.addEventListener("pointerdown", function (ev) {
        if (ev && ev.button && ev.button !== 0) return;
        held = false;
        if (ht) clearTimeout(ht);
        if (onHold) {
          ht = setTimeout(function () {
            ht = null; held = true; onHold();
          }, 550);
        }
      });
      function clr() { if (ht) { clearTimeout(ht); ht = null; } }
      btn.addEventListener("pointerup", clr);
      btn.addEventListener("pointercancel", clr);
      window.addEventListener("pointerup", clr);
      btn.addEventListener("click", function () {
        if (held) { held = false; return; }
        onTap();
      });
    }

    hPower.addEventListener("click", function () { g2Klick("rast"); ae8PowerUmschalten(); });
    hPhones.addEventListener("click", function () {
      if (!zustand.power) return;
      g2Klick("taste");
      if (!zustand.stumm && zustand.laut > 0) {
        zustand.stummVorher = zustand.laut;
        zustand.stumm = true;
        lautSetzen(0);
        melden("PHONES STUMM");
      } else {
        var r = (typeof zustand.stummVorher === "number" && zustand.stummVorher > 0) ? zustand.stummVorher : 80;
        zustand.stumm = false; zustand.stummVorher = null;
        lautSetzen(r);
        melden("TON EIN");
      }
    });
    hMic.addEventListener("click", function () { g2Klick("taste"); melden("RX-Betrieb (Empfänger)"); malen(); });

    bt1.addEventListener("click", function () {
      if (ae8Gesperrt()) return;
      ae8FunVerbrauchen();
      g2Klick("rast"); blitz(bt1); scanStopp(""); dwStopp("");
      if (zustand.kanal !== 9 && zustand.kanal !== 19) {
        zustand.ch919Vor = zustand.kanal;
        merken(SPEICHER + "_ch919vor", zustand.ch919Vor);
        kanalSetzen(9, true);
        melden("CH 9 (Notruf)");
      } else if (zustand.kanal === 9) {
        kanalSetzen(19, true);
        melden("CH 19 (Fernfahrer)");
      } else {
        kanalSetzen(zustand.ch919Vor || 1, true);
        melden("Zurück K" + (zustand.kanal < 10 ? "0" + zustand.kanal : zustand.kanal));
      }
      malen();
    });

    function actAnl() {
      if (ae8Gesperrt()) return;
      g2Klick("taste"); blitz(bt2);
      var nbAn = afToggle("NB");
      zustand.filterStufe = filterSyncLesen();
      merken(SPEICHER + "_filt", zustand.filterStufe);
      melden("ANL / NB: " + (nbAn ? "EIN" : "AUS"));
      malen();
    }
    bindTapHold(bt2, function () {
      if (ae8Gesperrt()) return;
      if (ae8FunVerbrauchen()) { actAnl(); return; }
      g2Klick("taste"); blitz(bt2);
      if (zustand.dw) dwStopp("DW aus"); else dwStart();
    }, actAnl);

    function actLow() {
      if (ae8Gesperrt()) return;
      g2Klick("taste"); blitz(bt3);
      zustand.low = !zustand.low;
      merken(SPEICHER + "_low", zustand.low ? "1" : "0");
      zustand.rand = zustand.low ? 18 : 12;
      merken(SPEICHER + "_rand", zustand.rand);
      melden("LOW: " + (zustand.low ? "EIN (+18 dB)" : "AUS (+12 dB)"));
      malen();
    }
    bindTapHold(bt3, function () {
      if (ae8Gesperrt()) return;
      if (ae8FunVerbrauchen()) { actLow(); return; }
      g2Klick("rast"); blitz(bt3);
      var i = MODI.indexOf(zustand.mode);
      if (i < 0) i = 0;
      var nx = MODI[(i + 1) % MODI.length];
      if (modeSetzen(nx)) {
        zustand.mode = nx;
        merken(SPEICHER + "_mode", nx);
        melden("Mode " + (MODE_TEXT[nx] || nx));
      } else {
        melden("Mode-Taste nicht gefunden");
      }
      malen();
    }, actLow);

    function actMScan() {
      if (ae8Gesperrt()) return;
      g2Klick("taste"); blitz(bt4);
      if (zustand.scan) scanStopp("M·SCN gestoppt"); else scanStart(true);
    }
    bindTapHold(bt4, function () {
      if (ae8Gesperrt()) return;
      if (ae8FunVerbrauchen()) { actMScan(); return; }
      g2Klick("taste"); blitz(bt4);
      if (zustand.scan) scanStopp("Suchlauf gestoppt"); else scanStart(false);
    }, actMScan);
    bt4.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (ae8Gesperrt()) return;
      dwKanalSetzen(zustand.dwKanal + (rad(e) > 0 ? -1 : 1));
    }, { passive: false });

    function actSpk() {
      if (!zustand.power) return;
      g2Klick("taste"); blitz(bt5);
      hPhones.click();
    }
    bindTapHold(bt5, function () {
      if (ae8Gesperrt()) return;
      if (ae8FunVerbrauchen()) { actSpk(); return; }
      g2Klick("rast"); blitz(bt5); scanStopp(""); dwStopp("");
      var ziel = wrapKanal(zustand.lcrKanal || 9);
      kanalSetzen(ziel, true);
      melden("LCR -> Kanal " + (ziel < 10 ? "0" + ziel : ziel));
      malen();
    }, actSpk);

    function actMemSave() {
      if (ae8Gesperrt()) return;
      g2Klick("rast"); blitz(bt6);
      zustand.memList[zustand.memIdx] = zustand.kanal;
      try { localStorage.setItem(SPEICHER + "_memlist", JSON.stringify(zustand.memList)); } catch (e) { }
      melden("M" + (zustand.memIdx + 1) + " gespeichert: K" + (zustand.kanal < 10 ? "0" + zustand.kanal : zustand.kanal));
      malen();
    }
    bindTapHold(bt6, function () {
      if (ae8Gesperrt()) return;
      if (ae8FunVerbrauchen()) { actMemSave(); return; }
      g2Klick("rast"); blitz(bt6); scanStopp(""); dwStopp("");
      zustand.memIdx = (zustand.memIdx + 1) % zustand.memList.length;
      merken(SPEICHER + "_memidx", zustand.memIdx);
      var mk = wrapKanal(zustand.memList[zustand.memIdx]);
      kanalSetzen(mk, true);
      melden("Speicher M" + (zustand.memIdx + 1) + ": K" + (mk < 10 ? "0" + mk : mk));
      malen();
    }, actMemSave);

    bt7.addEventListener("click", function () {
      if (ae8Gesperrt()) return;
      ae8FunVerbrauchen();
      g2Klick("taste"); blitz(bt7);
      if (!zustand.mon) {
        zustand.sqVorMon = zustand.sq;
        zustand.mon = true;
        try {
          var s = document.querySelector(".openwebrx-squelch-slider");
          if (s && !s.disabled) { s.value = -150; ausloesen(s, "input"); ausloesen(s, "change"); }
        } catch (e) { }
        melden("MON: Rauschsperre offen");
      } else {
        zustand.mon = false;
        var origSq = (typeof zustand.sqVorMon === "number") ? zustand.sqVorMon : zustand.sq;
        sqSetzen(origSq);
        melden("MON aus (SQ " + origSq + " dB)");
      }
      malen();
    });

    var menueEl = null;
    bindTapHold(bt8, function () {
      if (!zustand.power) { melden("STANDBY – POWER einschalten"); malen(); return; }
      g2Klick("taste"); blitz(bt8);
      zustand.fun = !zustand.fun;
      zustand.funZeit = Date.now();
      melden(zustand.fun ? "FUN aktiv (2. Funktion wählen)" : "FUN aus");
      malen();
    }, function () {
      g2Klick("taste"); blitz(bt8);
      if (menueEl) {
        if (typeof el.ae8MenueSync === "function") el.ae8MenueSync();
        menueEl.classList.toggle("offen");
        menueAusrichten(fenster, menueEl);
      }
    });

    function lbl(x, y, wPct, txt, cls) {
      var d = document.createElement("div");
      d.className = "ae8-lbl" + (cls ? (" " + cls) : "");
      d.style.left = x + "%";
      d.style.top = y + "%";
      if (wPct) d.style.width = wPct + "%";
      d.textContent = txt;
      geraet.appendChild(d);
      return d;
    }
    lbl(2.3,  9.2, 7.6, "POWER");
    lbl(2.3, 37.0, 8.0, "PHONES");
    lbl(2.3, 64.6, 8.2, "MIC");
    lbl(12.2, 68.0, 7.2, "VOLUME");
    lbl(22.6, 68.0, 7.4, "SQUELCH");
    lbl(32.9, 68.0, 7.4, "RF-GAIN");
    lbl(43.2, 68.0, 7.6, "MIC GAIN");
    lbl(53.4, 68.0, 7.2, "FILTER");
    lbl(66.5, 57.6, 8.8, "CHANNEL");
    lbl(80.6, 68.0, 8.0, "SWR CAL");
    lbl(91.0, 65.4, 7.6, "SWR");
    lbl(89.9, 70.6, 4.2, "CAL", "sub");
    lbl(94.9, 70.6, 4.4, "MOD", "sub");

    lbl(86.4, 21.6, 6.2, "CH9/19", "sub");
    lbl(91.6, 21.6, 6.2, "DW/ANL", "sub");
    lbl(86.4, 33.0, 6.2, "A·F/LOW", "sub");
    lbl(91.4, 33.0, 6.6, "SCN/M·SCN", "sub");
    lbl(86.4, 44.5, 6.2, "LCR/SPK", "sub");

    menueEl = document.createElement("div");
    menueEl.className = "ae8-menue";
    menueEl.innerHTML = [
      '<div class="ae8-m-titel">EINSTELLUNGEN · FUNKGERÄT 1</div>',
      '<div class="ae8-m-zeile"><label>LCD-Farbe</label><button class="ae8-m-knopf" data-m="lcd" style="margin:0">Farbe wechseln</button></div>',
      '<div class="ae8-m-zeile"><label>Skalenlicht</label><button class="ae8-m-knopf" data-m="meter" style="margin:0">Skala wechseln</button></div>',
      '<div class="ae8-m-zeile"><label>Rauschfilter</label><button class="ae8-m-knopf" data-m="nb" style="margin:0;flex:1">ANL / NB</button><button class="ae8-m-knopf" data-m="nr" style="margin:0;flex:1">NR-Filter</button></div>',
      '<div class="ae8-m-zeile"><label>Schwelle</label><input type="range" data-m="rand" min="6" max="30" step="1"><b class="ae8-m-rand">+14</b></div>',
      '<div class="ae8-m-zeile"><label>Schutz</label><button class="ae8-m-knopf" data-m="lock" style="margin:0">LOCK: AUS</button></div>',
      '<div class="ae8-m-zeile"><label>Bedienklicks</label><button class="ae8-m-knopf" data-m="klicks" style="margin:0">Klick-Ton: EIN</button></div>',
      '<button class="ae8-m-knopf" data-m="w2">\u21c4 Zu Funkgerät 2</button>',
      '<button class="ae8-m-knopf" data-m="w3">\u21c4 Zu Funkgerät 3</button>'
    ].join("");
    fenster.appendChild(geraet);
    fenster.appendChild(menueEl);
    document.body.appendChild(fenster);
    el.fenster = fenster;
    el.menue = menueEl;

    var qm = function (sel) { return menueEl.querySelector(sel); };
    var bNb = qm('[data-m="nb"]'), bNr = qm('[data-m="nr"]'), bLk = qm('[data-m="lock"]'), bKl = qm('[data-m="klicks"]');
    var sRand = qm('[data-m="rand"]'), bRandLbl = qm('.ae8-m-rand');
    function ae8MenueSync() {
      if (bNb) bNb.classList.toggle("an", afRead("NB"));
      if (bNr) bNr.classList.toggle("an", afRead("NR"));
      if (bLk) { bLk.classList.toggle("an", !!zustand.lock); bLk.textContent = "LOCK: " + (zustand.lock ? "EIN" : "AUS"); }
      if (bKl) { bKl.classList.toggle("an", !!_klickAn); bKl.textContent = "Klick-Ton: " + (_klickAn ? "EIN" : "AUS"); }
      if (sRand && document.activeElement !== sRand) { sRand.value = zustand.rand; if (bRandLbl) bRandLbl.textContent = "+" + zustand.rand; }
    }
    el.ae8MenueSync = ae8MenueSync;
    qm('[data-m="lcd"]').addEventListener("click", function () { g2Klick("taste"); lcdDreh(1); });
    qm('[data-m="meter"]').addEventListener("click", function () { g2Klick("taste"); ae8MeterWeiter(1); });
    bNb.addEventListener("click", function () { g2Klick("taste"); afToggle("NB"); zustand.filterStufe = filterSyncLesen(); malen(); });
    bNr.addEventListener("click", function () { g2Klick("taste"); afToggle("NR"); zustand.filterStufe = filterSyncLesen(); malen(); });
    bLk.addEventListener("click", function () {
      g2Klick("taste"); zustand.lock = !zustand.lock; merken(SPEICHER + "_lock", zustand.lock ? "1" : "0");
      melden(zustand.lock ? "Tasten gesperrt" : "Entsperrt"); malen();
    });
    bKl.addEventListener("click", function () {
      _klickAn = !_klickAn; merken(SPEICHER + "_klicks", _klickAn ? "1" : "0");
      if (_klickAn) g2Klick("taste"); malen();
    });
    sRand.addEventListener("input", function () {
      zustand.rand = Math.max(6, Math.min(30, Math.round(Number(sRand.value) || 14)));
      merken(SPEICHER + "_rand", zustand.rand);
      if (bRandLbl) bRandLbl.textContent = "+" + zustand.rand;
      malen();
    });
    qm('[data-m="w2"]').addEventListener("click", function () { g2Klick("taste"); menueEl.classList.remove("offen"); geraetWechsel(2); });
    qm('[data-m="w3"]').addEventListener("click", function () { g2Klick("taste"); menueEl.classList.remove("offen"); geraetWechsel(3); });

    var knopf = document.createElement("button");
    knopf.id = "dnx-g2-knopf";
    knopf.addEventListener("click", function () {
      var ak = aktivesGeraet();
      if (ak === "3") p3Zeigen(!zustand.p3Offen);
      else if (ak === "2") aeZeigen(!zustand.aeOffen);
      else fensterZeigen(!zustand.offen);
      knopfTextSetzen();
    });
    document.body.appendChild(knopf);

    var menuBtn = document.createElement("button");
    menuBtn.className = "g2-griff ae8-menu";
    menuBtn.textContent = "\u2630";
    menuBtn.title = "Menü – Einstellungen Funkgerät 1";
    menuBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      ae8MenueSync();
      menueEl.classList.toggle("offen");
      menueAusrichten(fenster, menueEl);
    });
    fenster.appendChild(menuBtn);
    document.addEventListener("click", function (ev) {
      if (ev && ev.isTrusted === false) return;
      if (menueEl.classList.contains("offen") && !menueEl.contains(ev.target) &&
          ev.target !== menuBtn && !menuBtn.contains(ev.target) &&
          ev.target !== bt8 && !bt8.contains(ev.target)) {
        menueEl.classList.remove("offen");
      }
    });

    var zieh = document.createElement("div");
    zieh.className = "g2-griff g2-zieh";
    zieh.title = "Gerät verschieben";
    for (var di = 0; di < 3; di++) zieh.appendChild(document.createElement("i"));
    fenster.appendChild(zieh);

    var wechselKnopf = document.createElement("div");
    wechselKnopf.className = "g2-griff g2-wechsel";
    wechselKnopf.textContent = "\u21c4 2";
    wechselKnopf.title = "Zu Funkgerät 2";
    wechselKnopf.addEventListener("click", function () { menueEl.classList.remove("offen"); geraetWechsel(2); });
    fenster.appendChild(wechselKnopf);

    var wechselKnopf3 = document.createElement("div");
    wechselKnopf3.className = "g2-griff g2-wechsel g2-wechsel3";
    wechselKnopf3.textContent = "\u21c4 3";
    wechselKnopf3.title = "Zu Funkgerät 3";
    wechselKnopf3.addEventListener("click", function () { menueEl.classList.remove("offen"); geraetWechsel(3); });
    fenster.appendChild(wechselKnopf3);

    var xKnopf = document.createElement("div");
    xKnopf.className = "g2-griff g2-zu";
    xKnopf.textContent = "×";
    xKnopf.title = "Schließen";
    xKnopf.addEventListener("click", function () { menueEl.classList.remove("offen"); fensterZeigen(false); });
    fenster.appendChild(xKnopf);

    [["tl", 1, 1], ["tr", 0, 1], ["bl", 1, 0], ["br", 0, 0]].forEach(function (eck) {
      var d = document.createElement("div");
      d.className = "g2-griff g2-eck " + eck[0];
      d.setAttribute("data-eck", eck[0]);
      d.title = "Größe ziehen";
      fenster.appendChild(d);
    });

    function g2Persist() {
      var r = fenster.getBoundingClientRect();
      merken(SPEICHER + "_breite", Math.round(r.width));
      merken(SPEICHER + "_links", Math.round(r.left));
      merken(SPEICHER + "_oben", Math.round(r.top));
    }
    el.g2Klemmen = function () {
      cbKastenKlemmen(fenster, breiteSetzen, 340, g2Persist);
      if (menueEl.classList.contains("offen")) menueAusrichten(fenster, menueEl);
    };

    var zieht = null;
    function ziehMove(e) {
      if (!zieht) return;
      var vw = window.innerWidth || 1600, vh = window.innerHeight || 980;
      var dx = e.clientX - zieht.mx, dy = e.clientY - zieht.my;
      if (zieht.art === "zieh") {
        var cr = fenster.getBoundingClientRect();
        var nx = Math.max(0, Math.min(Math.max(0, vw - cr.width), Math.round(zieht.x + dx)));
        var ny = Math.max(0, Math.min(Math.max(0, vh - cr.height), Math.round(zieht.y + dy)));
        fenster.style.left = nx + "px";
        fenster.style.top = ny + "px";
        fenster.style.bottom = "auto";
      } else {
        var vonLinks = zieht.art.indexOf("l") >= 0;
        var vonOben = zieht.art.indexOf("t") >= 0;
        var dW = vonLinks ? -dx : dx;
        var dH = (vonOben ? -dy : dy) * zieht.ratio;
        var delta = (Math.abs(dW) >= Math.abs(dH)) ? dW : dH;
        var nw = Math.max(340, Math.min(zieht.effMaxW, Math.round(zieht.w + delta)));
        breiteSetzen(nw);
        var nh = fenster.getBoundingClientRect().height;
        var nl = vonLinks ? Math.round(zieht.anchorR - nw) : Math.round(zieht.anchorL);
        var nt = vonOben ? Math.round(zieht.anchorB - nh) : Math.round(zieht.anchorT);
        nl = Math.max(0, Math.min(Math.max(0, vw - nw), nl));
        nt = Math.max(0, Math.min(Math.max(0, vh - nh), nt));
        fenster.style.left = nl + "px";
        fenster.style.top = nt + "px";
        fenster.style.bottom = "auto";
      }
      if (menueEl.classList.contains("offen")) menueAusrichten(fenster, menueEl);
      if (e.cancelable && e.preventDefault) e.preventDefault();
    }
    function ziehEnde() {
      if (!zieht) return;
      zieht = null;
      window.removeEventListener("pointermove", ziehMove, true);
      window.removeEventListener("pointerup", ziehEnde, true);
      window.removeEventListener("pointercancel", ziehEnde, true);
      window.removeEventListener("blur", ziehEnde, true);
      cbKastenKlemmen(fenster, breiteSetzen, 340);
      g2Persist();
      if (menueEl.classList.contains("offen")) menueAusrichten(fenster, menueEl);
    }
    function ziehStart(e, art) {
      if (e && e.button && e.button !== 0) return;
      var r = fenster.getBoundingClientRect();
      var vw = window.innerWidth || 1600, vh = window.innerHeight || 980;
      var ratio = r.width / Math.max(40, r.height);
      var vonLinks = art.indexOf("l") >= 0, vonOben = art.indexOf("t") >= 0;
      var availW = vonLinks ? r.right : (vw - r.left);
      var availH = vonOben ? r.bottom : (vh - r.top);
      var effMaxW = Math.max(340, Math.min(1800, Math.floor(Math.min(availW, availH * ratio))));
      zieht = {
        art: art, mx: e.clientX, my: e.clientY, x: r.left, y: r.top,
        w: r.width, h: r.height, ratio: ratio, effMaxW: effMaxW,
        anchorL: r.left, anchorR: r.right, anchorT: r.top, anchorB: r.bottom
      };
      fenster.style.left = Math.round(r.left) + "px";
      fenster.style.top = Math.round(r.top) + "px";
      fenster.style.bottom = "auto";
      window.addEventListener("pointermove", ziehMove, { capture: true, passive: false });
      window.addEventListener("pointerup", ziehEnde, true);
      window.addEventListener("pointercancel", ziehEnde, true);
      window.addEventListener("blur", ziehEnde, true);
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
    zieh.addEventListener("pointerdown", function (e) { ziehStart(e, "zieh"); });
    geraet.addEventListener("pointerdown", function (e) {
      if (e.target === geraet || e.target === el.bild) ziehStart(e, "zieh");
    });
    Array.prototype.forEach.call(fenster.querySelectorAll(".g2-eck"), function (d) {
      d.addEventListener("pointerdown", function (e) { ziehStart(e, d.getAttribute("data-eck")); });
    });

    bauen6290();
    bauenProfi95();
    knopfTextSetzen();
    if (aktivesGeraet() === "3") { fensterZeigen(false); aeZeigen(false); p3Zeigen(true); }
    else if (aktivesGeraet() === "2") { fensterZeigen(false); p3Zeigen(false); aeZeigen(true); }
    else fensterZeigen(zustand.offen);

    window.addEventListener("resize", function () {
      try { if (el.g2Klemmen) el.g2Klemmen(); } catch (e1) { }
      try { if (el.aeKlemmen) el.aeKlemmen(); } catch (e2) { }
      try { if (el.p3Klemmen) el.p3Klemmen(); } catch (e3) { }
    });

    setTimeout(function () {
      if (zustand.offen) { lautSetzen(zustand.laut); sqSetzen(zustand.sq); }
      else if (zustand.p3Offen) {
        var z3 = p3Zustand();
        p3WertSetzen("laut", z3.laut); p3WertSetzen("sq", z3.sq);
      } else if (zustand.aeOffen) {
        var z2 = aeZustand();
        aeWertSetzen("laut", z2.laut); aeWertSetzen("sq", z2.sq);
      }
    }, 2500);
    setTimeout(rfLaden, 1200);
    setTimeout(rfLaden, 4000);
    setInterval(rfLaden, 15000);
    document.addEventListener("change", function (ev) {
      if (ev.target && ev.target.id === "openwebrx-sdr-profiles-listbox") {
        setTimeout(rfLaden, 350);
        setTimeout(rfLaden, 3500);
      }
    }, true);
    window.addEventListener("dnx-rf-gain-sync", function (ev) {
      var d = ev && ev.detail;
      if (!d || d.quelle === "george2") return;
      if (typeof d.darfAendern === "boolean") RF_STATE.darfAendern = d.darfAendern;
      if (typeof d.qDirect === "boolean") RF_STATE.qDirect = d.qDirect;
      if (d.modus) RF_STATE.modus = d.modus;
      if (typeof d.wert === "number") rfSyncIntern(d.wert);
      else { malen(); try { aeMalen(); } catch (eAeS) { } try { p3Malen(); } catch (eP3S) { } }
    });
    window.addEventListener("dnx-rf-gain", function (ev) {
      var d = ev && ev.detail;
      if (!d || d.quelle === "george2") return;
      if (d.gespeichert) { setTimeout(rfLaden, 150); return; }
      if (typeof d.wert === "number") {
        RF_STATE.modus = d.modus || "manual";
        rfSyncIntern(d.wert);
      }
    });

    setInterval(takt, 500);
    setInterval(function () {
      try {
        var r1 = pegelAnteil();
        if (el.fenster && el.fenster.style.display !== "none") {
          ae8NadelZeichnen(r1);
        }
        var wAe = el.aeFenster;
        if (wAe && wAe.style.display !== "none" && r1 !== null) {
          aeSmZeichnen(r1);
        }
        var wP3 = el.p3Fenster;
        if (wP3 && wP3.style.display !== "none" && r1 !== null) {
          p3NadelZeichnen(r1);
        }
      } catch (e) { }
    }, 100);
    takt();
  }

  /* =====================================================================
     Funkgeraet 2: Stabo XF 9082 professional II SSB (Heimstation)
     (static/plugins/receiver/funkgeraet2_xf9082.png, 1440x468 RGBA)
     ===================================================================== */
  var KENNUNG2 = "dnx-ae6290";
  var SPEICHER2 = "dnx_ae6290";
  var BILD2 = "static/plugins/receiver/funkgeraet2_xf9082.png";
  var BILD2_B = 1440, BILD2_H = 468;

  /* Exakt gemessene Zonen in Prozent der 1440x468 Stabo XF 9082 Frontplatte */
  var XF_FELD = {
    lcd:     [16.667, 10.684, 59.097, 32.906],
    power:   [ 3.472, 15.812,  5.972, 22.436],
    pwrLens: [ 4.444, 17.735,  4.028,  4.487],
    ledRx:   [11.806, 20.513,  0.833,  2.564],
    ledAnt1: [11.806, 28.050,  0.833,  2.564],
    ledAnt2: [11.806, 36.650,  0.833,  2.564],
    phones:  [ 3.750, 53.205,  5.069, 15.598],
    mic:     [ 3.125, 73.504,  6.319, 19.872],
    emg:     [81.319, 16.880,  3.681,  7.692],
    dim:     [81.319, 31.197,  3.681,  7.692],
    page:    [34.931, 54.274,  3.750, 11.752],
    step:    [34.722, 70.513,  2.708,  8.333],
    up:      [31.736, 85.256,  3.819,  7.692],
    down:    [38.056, 85.256,  3.681,  7.692],
    k1:      [14.722, 55.128,  2.361,  7.265],
    k2:      [19.583, 55.128,  2.361,  7.479],
    k3:      [24.444, 55.128,  2.361,  7.265],
    k4:      [14.722, 65.598,  2.361,  7.265],
    k5:      [19.583, 65.598,  2.361,  7.479],
    k6:      [24.444, 65.598,  2.361,  7.265],
    k7:      [14.722, 75.855,  2.361,  7.479],
    k8:      [19.583, 76.068,  2.361,  7.265],
    k9:      [24.444, 75.855,  2.431,  7.265],
    kstar:   [14.722, 86.325,  2.431,  7.265],
    k0:      [19.583, 86.325,  2.361,  7.265],
    khash:   [24.444, 86.111,  2.361,  7.479],
    hicut:   [61.736, 54.915,  3.750,  7.265],
    anl:     [67.153, 54.915,  3.750,  7.265],
    asc:     [72.639, 54.915,  3.750,  7.265],
    dw:      [61.736, 65.598,  3.681,  7.265],
    sskip:   [67.153, 65.598,  3.681,  7.265],
    lock:    [72.569, 65.598,  3.750,  7.265],
    ant:     [61.736, 76.282,  3.681,  7.265],
    rbeep:   [67.153, 76.282,  3.681,  7.265],
    dtmf:    [72.569, 76.496,  3.750,  7.265],
    mm:      [61.736, 87.179,  3.681,  7.265],
    nb:      [67.153, 87.179,  3.681,  7.479],
    swr:     [72.569, 87.393,  3.750,  7.265]
  };
  var XF_KNOB = {
    vfo:  { feld: [44.306, 55.769, 12.778, 39.316], rRatio: 0.9348, groesse: 192 },
    mode: { feld: [89.514, 18.376,  4.444, 13.675], rRatio: 0.8438, groesse: 84 },
    vol:  { feld: [82.500, 58.120,  4.583, 14.103], rRatio: 0.8485, groesse: 84 },
    sq:   { feld: [82.500, 80.128,  4.583, 14.103], rRatio: 0.8485, groesse: 84 },
    rf:   { feld: [91.944, 58.120,  4.583, 14.103], rRatio: 0.8485, groesse: 84 },
    clr:  { feld: [91.944, 80.128,  4.583, 14.103], rRatio: 0.8485, groesse: 84 }
  };

  /* Authentische Stabo XF 9082 Farben: Bernstein-Orange & Kobalt-Blau vornweg + alle Styler-Farben */
  var AE_FARBE_REIHE = ["bernstein", "blau", "orange", "gelb", "gruen", "tuerkis", "rot", "weiss",
                        "limette", "smaragd", "himmel", "petrol", "violett", "pink", "magenta", "sonne", "eisblau"];
  var AE_LCD_HEX = {
    bernstein: "#ff9b12",
    blau:      "#2e6dff"
  };
  var AE_FARBE_FILTER = {
    bernstein: "hue-rotate(0deg)",
    orange:    "hue-rotate(-8deg) saturate(1.15)",
    gelb:      "hue-rotate(16deg) saturate(1.15)",
    gruen:     "hue-rotate(106deg) saturate(1.8)",
    blau:      "hue-rotate(184deg) saturate(1.9)",
    tuerkis:   "hue-rotate(146deg) saturate(1.3)",
    rot:       "hue-rotate(324deg) saturate(2.0)",
    weiss:     "saturate(0) brightness(1.75)",
    limette:   "hue-rotate(52deg) saturate(1.3)",
    smaragd:   "hue-rotate(120deg) saturate(1.3)",
    himmel:    "hue-rotate(192deg) saturate(2.0)",
    petrol:    "hue-rotate(152deg) saturate(1.9)",
    violett:   "hue-rotate(242deg) saturate(1.9)",
    pink:      "hue-rotate(288deg) saturate(1.9)",
    magenta:   "hue-rotate(308deg) saturate(1.9)",
    sonne:     "hue-rotate(26deg) saturate(1.2)",
    eisblau:   "hue-rotate(164deg) saturate(1.9)"
  };

  function aeFarbeId() { return holenText(SPEICHER2 + "_lcd", "bernstein"); }
  function aeFarbe() {
    var id = aeFarbeId();
    return AE_LCD_HEX[id] || LCD_FARBEN[id] || AE_LCD_HEX.bernstein;
  }
  function aeFarbeFilter() { return AE_FARBE_FILTER[aeFarbeId()] || AE_FARBE_FILTER.bernstein; }
  function aeFarbeWeiter(richtung) {
    var id = aeFarbeId();
    var i = AE_FARBE_REIHE.indexOf(id);
    if (i < 0) i = 0;
    var n = AE_FARBE_REIHE.length;
    var k = ((i + (richtung || 1)) % n + n) % n;
    var neu = AE_FARBE_REIHE[k];
    merken(SPEICHER2 + "_lcd", neu);
    aeMeld("LCD " + (k + 1) + "/" + n + ": " + (FARB_NAME[neu] || neu));
    aeMalen();
    return neu;
  }

  function aeZeigen(an) {
    var w = document.getElementById(KENNUNG2);
    if (!w) return;
    zustand.aeOffen = !!an;
    merken(SPEICHER2 + "_offen", zustand.aeOffen ? "1" : "0");
    w.style.display = zustand.aeOffen ? "block" : "none";
    knopfTextSetzen();
    if (zustand.aeOffen) {
      try { aeMalen(); } catch (e) { }
      try { if (el.aeGroesseNachziehen) el.aeGroesseNachziehen(); } catch (e2) { }
      try { if (el.aeKlemmen) el.aeKlemmen(); } catch (e3) { }
    }
  }

  function aktivesGeraet() {
    var v = holenText(SPEICHER2 + "_aktiv", "1");
    return (v === "2" || v === "3") ? v : "1";
  }
  function geraetWechsel(n) {
    var s = String(n);
    var ziel = (s === "2") ? "2" : (s === "3" ? "3" : "1");
    merken(SPEICHER2 + "_aktiv", ziel);
    if (ziel === "3") {
      if (el.fenster) { zustand.offen = false; merken(SPEICHER + "_offen", "0"); el.fenster.style.display = "none"; }
      aeZeigen(false);
      try {
        var z3w = p3Zustand();
        if (z3w.power) {
          var hz3 = (z3w.istCb === false && z3w.extHz !== null) ? z3w.extHz : kanalFrequenz(z3w.kanal);
          if (hz3) { frequenzSetzen(hz3); var nf3 = frequenzLesen(); p3LetzteExtHz = (nf3 !== null) ? nf3 : hz3; g2LetzteExtHz = p3LetzteExtHz; }
          if (modeSetzen(z3w.mode)) p3LetzteExtMode = z3w.mode;
          else { try { var dmCur3 = document.querySelector(".openwebrx-demodulator-button.highlighted"); if (dmCur3) p3LetzteExtMode = dmCur3.getAttribute("data-modulation") || p3LetzteExtMode; } catch (eM3c) { } }
          p3LetzteExtLaut = z3w.laut;
          try {
            var sl3 = document.getElementById("openwebrx-panel-volume");
            if (sl3) { sl3.value = z3w.laut; ausloesen(sl3, "input"); ausloesen(sl3, "change"); }
            if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(z3w.laut);
          } catch (eL3) { }
          p3LetzteExtSq = z3w.sq;
          try {
            var ss3 = document.querySelector(".openwebrx-squelch-slider");
            if (ss3 && !ss3.disabled) { ss3.value = z3w.sq; ausloesen(ss3, "input"); ausloesen(ss3, "change"); }
          } catch (eS3) { }
        }
      } catch (eP3W) { }
      p3Zeigen(true);
    } else if (ziel === "2") {
      if (el.fenster) { zustand.offen = false; merken(SPEICHER + "_offen", "0"); el.fenster.style.display = "none"; }
      p3Zeigen(false);
      try {
        var z2w = aeZustand();
        if (z2w.power) {
          var hz2 = (z2w.istCb === false && z2w.extHz !== null) ? z2w.extHz : (kanalFrequenz(z2w.kanal) + (z2w.rit || 0));
          if (hz2) { frequenzSetzen(hz2); var nf2 = frequenzLesen(); aeLetzteExtHz = (nf2 !== null) ? nf2 : hz2; g2LetzteExtHz = aeLetzteExtHz; }
          if (modeSetzen(z2w.mode)) aeLetzteExtMode = z2w.mode;
          else { try { var dmCur2 = document.querySelector(".openwebrx-demodulator-button.highlighted"); if (dmCur2) aeLetzteExtMode = dmCur2.getAttribute("data-modulation") || aeLetzteExtMode; } catch (eM2c) { } }
          aeLetzteExtLaut = z2w.laut;
          try {
            var sl2 = document.getElementById("openwebrx-panel-volume");
            if (sl2) { sl2.value = z2w.laut; ausloesen(sl2, "input"); ausloesen(sl2, "change"); }
            if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(z2w.laut);
          } catch (eL2) { }
          aeLetzteExtSq = z2w.sq;
          try {
            var ss2 = document.querySelector(".openwebrx-squelch-slider");
            if (ss2 && !ss2.disabled) { ss2.value = z2w.sq; ausloesen(ss2, "input"); ausloesen(ss2, "change"); }
          } catch (eS2) { }
        }
      } catch (eAeW) { }
      aeZeigen(true);
    } else {
      aeZeigen(false);
      p3Zeigen(false);
      try {
        var hz1 = (zustand.istCb === false && zustand.extHz !== null) ? zustand.extHz : kanalFrequenz(zustand.kanal);
        if (hz1) { frequenzSetzen(hz1); var nf1 = frequenzLesen(); g2LetzteExtHz = (nf1 !== null) ? nf1 : hz1; p3LetzteExtHz = g2LetzteExtHz; aeLetzteExtHz = g2LetzteExtHz; }
        modeSetzen(zustand.mode);
        lautSetzen(zustand.laut);
        sqSetzen(zustand.sq);
      } catch (eG1W) { }
      fensterZeigen(true);
    }
    knopfTextSetzen();
    return ziel;
  }

  function knopfTextSetzen() {
    var k = document.getElementById("dnx-g2-knopf");
    if (k) {
      var nr = aktivesGeraet();
      var an = (nr === "3") ? !!zustand.p3Offen : ((nr === "2") ? !!zustand.aeOffen : !!zustand.offen);
      k.textContent = "\uD83D\uDCFB Funkger\u00e4t " + nr + (an ? "" : " \u2013 aufklappen");
      k.style.display = an ? "none" : "block";
    }
    try { if (typeof window.__dnxFunkSync === "function") window.__dnxFunkSync(); } catch (eS) { }
  }

  function aeKnopfZustand() {
    var w = document.getElementById(KENNUNG2);
    if (!w) return null;
    return !!zustand.aeOffen;
  }

  /* Baut den authentischen gebogenen Stabo XF 9082 Analog-LCD-S-Meter-Bogen */
  function aeMeterSvgBauen(box) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 245 148");
    svg.setAttribute("preserveAspectRatio", "none");

    var CX = 112, CY = 160;
    function arcPt(r, deg) {
      var ra = deg * Math.PI / 180;
      return [CX + Math.sin(ra) * r, CY - Math.cos(ra) * r];
    }
    function arcPath(r, a0, a1) {
      var p0 = arcPt(r, a0), p1 = arcPt(r, a1);
      return "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) +
             " A" + r + " " + r + " 0 0 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1);
    }
    function add(tag, attrs, par) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (par || svg).appendChild(e);
      return e;
    }

    /* Oberer S-Meter-Bogen (S 1 - 3 - 5 - 7 - 9 - 20 - 40 - 60dB) */
    add("path", { d: arcPath(114, -45, 7),  fill: "none", stroke: "#181104", "stroke-width": "1.5", "stroke-linecap": "round" });
    add("path", { d: arcPath(114, 7, 45),   fill: "none", stroke: "#181104", "stroke-width": "2.6", "stroke-linecap": "round" });
    add("path", { d: arcPath(118.5, 7, 45), fill: "none", stroke: "#181104", "stroke-width": "1.1", "stroke-linecap": "round" });

    var sMarks = [
      { d: -45, l: "S" },
      { d: -35, l: "1" },
      { d: -25, l: "3" },
      { d: -15, l: "5" },
      { d:  -4, l: "7" },
      { d:   7, l: "9" },
      { d:  19, l: "20" },
      { d:  31, l: "40" },
      { d:  44, l: "60dB", sm: 1 }
    ];
    for (var i = 0; i < sMarks.length; i++) {
      var m = sMarks[i];
      var pA = arcPt(114, m.d), pB = arcPt(121, m.d), pT = arcPt(131, m.d);
      add("line", { x1: pA[0].toFixed(1), y1: pA[1].toFixed(1), x2: pB[0].toFixed(1), y2: pB[1].toFixed(1), stroke: "#181104", "stroke-width": "1.4" });
      add("text", {
        x: pT[0].toFixed(1), y: pT[1].toFixed(1), fill: "#181104",
        "font-family": "system-ui,sans-serif", "font-weight": "800",
        "font-size": m.sm ? "8.5" : "10.2", "text-anchor": "middle", "dominant-baseline": "middle"
      }).textContent = m.l;
    }
    [-40, -30, -20, -9.5, 1.5, 13, 25, 37.5].forEach(function (deg) {
      var p1 = arcPt(114, deg), p2 = arcPt(118, deg);
      add("line", { x1: p1[0].toFixed(1), y1: p1[1].toFixed(1), x2: p2[0].toFixed(1), y2: p2[1].toFixed(1), stroke: "#181104", "stroke-width": "1" });
    });

    /* Unterer PWR / MAX / SWR Bogen */
    add("path", { d: arcPath(82, -39, 39), fill: "none", stroke: "#181104", "stroke-width": "1.2", opacity: "0.78" });
    var pwrLbl = add("text", {
      x: "38", y: "102", fill: "#181104",
      "font-family": "system-ui,sans-serif", "font-weight": "800",
      "font-size": "8.8", "letter-spacing": "0.6"
    });
    pwrLbl.textContent = "PWR";
    add("text", {
      x: "180", y: "102", fill: "#181104",
      "font-family": "system-ui,sans-serif", "font-weight": "800",
      "font-size": "8.5", "letter-spacing": "0.5"
    }).textContent = "MAX";

    /* Segment-Schattenbogen als LCD-Spur unterhalb der Nadel */
    for (var si = 0; si < 18; si++) {
      var sd = -44 + si * 5.2;
      var q1 = arcPt(97, sd), q2 = arcPt(110, sd);
      add("line", {
        x1: q1[0].toFixed(1), y1: q1[1].toFixed(1),
        x2: q2[0].toFixed(1), y2: q2[1].toFixed(1),
        stroke: "#181104", "stroke-width": "2.4", "stroke-linecap": "round",
        opacity: "0.08"
      });
    }

    /* LCD-Drehnadel um (112, 160) */
    var ng = add("g", { transform: "rotate(-45, " + CX + ", " + CY + ")" });
    add("line", { x1: String(CX), y1: String(CY), x2: String(CX), y2: "42", stroke: "rgba(0,0,0,.18)", "stroke-width": "3.6", "stroke-linecap": "round" }, ng);
    add("line", { x1: String(CX), y1: String(CY), x2: String(CX), y2: "42", stroke: "#140e04", "stroke-width": "2.1", "stroke-linecap": "round" }, ng);

    box.appendChild(svg);
    return { ng: ng, pwrLbl: pwrLbl, cx: CX, cy: CY };
  }

  function aeSmZeichnen(anteil) {
    if (!el.aeNadel || !el.aeFenster) return;
    var z = aeZustand();
    var target = (z.power && anteil !== null) ? Math.max(0, Math.min(1, anteil)) : 0;
    var g = smGlaetten(1, target);
    var deg = -45 + g * 90;
    var degR = Math.round(deg * 10) / 10;
    if (el.aeNadel._deg !== degR) {
      el.aeNadel._deg = degR;
      el.aeNadel.setAttribute("transform", "rotate(" + degR + ", 112, 160)");
    }
    if (el.aeBusy) {
      var busyAn = !!(z.power && (g >= 0.16 || z.sq <= -145));
      if (el.aeBusy._an !== busyAn) {
        el.aeBusy._an = busyAn;
        el.aeBusy.classList.toggle("an", busyAn);
      }
    }
  }

  function aeDrehBauen(name, cfg, holenFn, setzenFn, von, bis, titel, opts) {
    opts = opts || {};
    var RAST = (opts.rast && opts.rast > 0) ? opts.rast : 0;
    var fl = document.createElement("canvas");
    fl.className = "ae-dreh-cv ae-knopf-" + name;
    fl.style.left = cfg.feld[0] + "%";
    fl.style.top = cfg.feld[1] + "%";
    fl.style.width = cfg.feld[2] + "%";
    fl.style.height = cfg.feld[3] + "%";
    fl.setAttribute("title", titel);
    fl.setAttribute("data-feld", name);

    var seite = cfg.groesse || 84;
    fl.width = seite;
    fl.height = seite;
    var ctx = fl.getContext("2d");
    var _cGrad = null;

    function knopfMalen() {
      var val = holenFn();
      var grad;
      if (opts.winkelMap) {
        grad = opts.winkelMap(val);
      } else {
        var anteil = Math.max(0, Math.min(1, (val - von) / ((bis - von) || 1)));
        if (opts.angSpan) grad = (opts.angStart !== undefined ? opts.angStart : -145) + anteil * opts.angSpan;
        else if (RAST) grad = -180 + anteil * 360;
        else grad = -145 + anteil * 290;
      }
      var gradR = Math.round(grad * 10) / 10;
      if (_cGrad === gradR) return;
      _cGrad = gradR;

      ctx.clearRect(0, 0, seite, seite);
      var R = seite / 2;
      var rCap = R * (cfg.rRatio || 0.85);
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(gradR * Math.PI / 180);

      if (opts.stil === "vfo") {
        /* Grosse glatte Stabo-VFO-Scheibe mit feiner Rändelstruktur und dezentem Index-Punkt */
        for (var zi = 0; zi < 48; zi++) {
          var za = (zi * Math.PI * 2) / 48;
          ctx.strokeStyle = (zi % 2 === 0) ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.18)";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(Math.cos(za) * (rCap * 0.90), Math.sin(za) * (rCap * 0.90));
          ctx.lineTo(Math.cos(za) * (rCap * 1.00), Math.sin(za) * (rCap * 1.00));
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,255,255,.05)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, rCap * 0.72, -0.5, 0.5);
        ctx.stroke();

        ctx.fillStyle = "rgba(180,192,208,.26)";
        ctx.beginPath();
        ctx.arc(0, -rCap * 0.68, Math.max(2.2, seite * 0.019), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        /* Geriffelter Drehknopf (MODE SELECTOR / VOL / SQ / RF / CLR) mit sauberer weisser Zeigerkerbe */
        for (var ki = 0; ki < 18; ki++) {
          var ka = (ki * Math.PI * 2) / 18;
          ctx.strokeStyle = (ki % 2 === 0) ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.22)";
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ka) * (rCap * 0.78), Math.sin(ka) * (rCap * 0.78));
          ctx.lineTo(Math.cos(ka) * (rCap * 0.98), Math.sin(ka) * (rCap * 0.98));
          ctx.stroke();
        }
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,.55)";
        ctx.lineWidth = Math.max(3.2, seite * 0.070);
        ctx.beginPath();
        ctx.moveTo(0, -rCap * 0.34);
        ctx.lineTo(0, -rCap * 0.84);
        ctx.stroke();

        ctx.strokeStyle = (opts.stil === "mode") ? "#eef3fa" : "#f4f7fc";
        ctx.lineWidth = Math.max(2.0, seite * 0.044);
        ctx.beginPath();
        ctx.moveTo(0, -rCap * 0.36);
        ctx.lineTo(0, -rCap * 0.82);
        ctx.stroke();
      }
      ctx.restore();
    }
    fl.knopfMalen = knopfMalen;

    var greift = false, bewegt = false, downX = 0, downY = 0, letzter = 0, start = 0, summe = 0, stufen = 0;
    function winkel(e) {
      var r = fl.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2),
                        e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    }
    function aeDrehMove(e) {
      if (!greift) return;
      if (e.stopPropagation) e.stopPropagation();
      if (e.cancelable && e.preventDefault) e.preventDefault();
      if (!bewegt && (Math.abs(e.clientX - downX) > 3 || Math.abs(e.clientY - downY) > 3)) {
        bewegt = true;
      }
      var w = winkel(e), d = w - letzter;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      letzter = w; summe += d;
      if (RAST) {
        var prevSt = stufen;
        while (summe >= RAST) { summe -= RAST; stufen += 1; }
        while (summe <= -RAST) { summe += RAST; stufen -= 1; }
        if (stufen !== prevSt) {
          bewegt = true;
          g2Klick(opts.stil === "mode" ? "rast" : "dial");
        }
        setzenFn(start + stufen);
      } else {
        var span = opts.angSpan || 290;
        setzenFn(start + (summe / span) * (bis - von));
      }
    }
    function loslassen() {
      if (!greift) return;
      greift = false;
      if (bewegt) fl._dnxZog = Date.now();
      try { fl.classList.remove("greift"); } catch (e) { }
      window.removeEventListener("pointermove", aeDrehMove, true);
      window.removeEventListener("pointerup", loslassen, true);
      window.removeEventListener("pointercancel", loslassen, true);
      window.removeEventListener("blur", loslassen, true);
    }
    fl.addEventListener("pointerdown", function (e) {
      if (e && e.button && e.button !== 0) return;
      var z = aeZustand();
      if (!z.power) { aeMeld("STANDBY \u2013 ON/OFF einschalten"); aeMalen(); return; }
      if (z.lock) { aeMeld("LOCK aktiv"); aeMalen(); return; }
      greift = true; bewegt = false; downX = e.clientX; downY = e.clientY;
      summe = 0; stufen = 0; start = holenFn(); letzter = winkel(e);
      try { fl.classList.add("greift"); } catch (err) { }
      window.addEventListener("pointermove", aeDrehMove, { capture: true, passive: false });
      window.addEventListener("pointerup", loslassen, true);
      window.addEventListener("pointercancel", loslassen, true);
      window.addEventListener("blur", loslassen, true);
      e.preventDefault();
      e.stopPropagation();
    });
    fl.addEventListener("wheel", function (e) {
      e.preventDefault();
      var z = aeZustand();
      if (!z.power) { aeMeld("STANDBY \u2013 ON/OFF einschalten"); aeMalen(); return; }
      if (z.lock) { aeMeld("LOCK aktiv"); aeMalen(); return; }
      g2Klick(opts.stil === "mode" ? "rast" : "dial");
      if (RAST) { setzenFn(holenFn() + (rad(e) > 0 ? -1 : 1)); return; }
      var schritt = opts.radSchritt || 1;
      setzenFn(holenFn() + (rad(e) > 0 ? -schritt : schritt));
    }, { passive: false });
    if (opts.onDblClick) {
      fl.addEventListener("dblclick", function (e) {
        e.preventDefault();
        var z = aeZustand();
        if (!z.power || z.lock) return;
        opts.onDblClick();
      });
    }
    return fl;
  }

  function bauen6290() {
    if (document.getElementById(KENNUNG2)) return;
    var HAND_AUF2 = handCursor("%23f6d3a8", 0);
    var HAND_ZU2 = handCursor("%23e8b98a", 1);

    var css = document.createElement("style");
    css.setAttribute("data-von", KENNUNG2);
    css.textContent = [
      "#" + KENNUNG2 + "{position:fixed !important;left:675px;bottom:44px;z-index:2147483100 !important;",
      " width:560px;font-family:system-ui,sans-serif !important;display:none;overflow:visible !important;user-select:none !important;}",
      "#" + KENNUNG2 + " .ae-kasten{position:relative !important;width:560px !important;transform-origin:top left !important;overflow:visible !important;}",
      "#" + KENNUNG2 + " .ae-geraet{position:relative !important;width:100% !important;isolation:isolate !important;}",
      "#" + KENNUNG2 + " .ae-geraet > img{display:block !important;width:100% !important;height:auto !important;aspect-ratio:1440/468 !important;user-select:none !important;pointer-events:auto !important;",
      " filter:drop-shadow(0 16px 32px rgba(0,0,0,.85)) !important;}",
      /* Power-Kippschalter rote Glimm-Linse & Status-LEDs (RX/TX gruen, ANT 1 rot, ANT 2 rot) */
      "#" + KENNUNG2 + " .ae-pwr-lens{position:absolute !important;z-index:4 !important;pointer-events:none !important;border-radius:2px !important;",
      " background:radial-gradient(ellipse at 50% 45%,#ff7a6b 0%,#e61e16 58%,#780804 100%) !important;",
      " box-shadow:0 0 9px rgba(255,46,34,.92),inset 0 0 2px rgba(255,225,210,.7) !important;",
      " opacity:.92 !important;transition:opacity .15s,box-shadow .15s !important;}",
      "#" + KENNUNG2 + ".standby .ae-pwr-lens{opacity:.06 !important;box-shadow:none !important;}",
      "#" + KENNUNG2 + " .ae-led{position:absolute !important;z-index:5 !important;pointer-events:none !important;border-radius:50% !important;",
      " transition:all .14s !important;opacity:.14 !important;background:#1a1c1e !important;}",
      "#" + KENNUNG2 + " .ae-led.rx.an{opacity:1 !important;",
      " background:radial-gradient(circle at 38% 35%,#b8ffca 0%,#26ee5a 55%,#0b7528 100%) !important;",
      " box-shadow:0 0 7px rgba(44,245,98,.95),0 0 2px #d8ffe4 !important;}",
      "#" + KENNUNG2 + " .ae-led.ant.an{opacity:1 !important;",
      " background:radial-gradient(circle at 38% 35%,#ffaba0 0%,#f5241c 55%,#7c0804 100%) !important;",
      " box-shadow:0 0 7px rgba(255,46,34,.95),0 0 2px #ffd4cf !important;}",
      "#" + KENNUNG2 + ".standby .ae-led{opacity:.10 !important;box-shadow:none !important;}",
      /* Interaktive Bedien-Zonen & Knoepfe */
      "#" + KENNUNG2 + " .ae-zone{position:absolute !important;z-index:6 !important;background:transparent !important;border:none !important;padding:0 !important;",
      " cursor:pointer !important;border-radius:6px !important;transition:background .10s,box-shadow .12s !important;}",
      "#" + KENNUNG2 + " .ae-zone:hover{background:rgba(255,255,255,.10) !important;}",
      "#" + KENNUNG2 + " .ae-zone:active{background:rgba(255,255,255,.22) !important;transform:translateY(.5px) !important;}",
      "#" + KENNUNG2 + " .ae-zone.pill{border-radius:999px !important;}",
      "#" + KENNUNG2 + " .ae-zone.round{border-radius:50% !important;}",
      "#" + KENNUNG2 + " .ae-zone.an{box-shadow:inset 0 0 0 1.3px rgba(var(--ae-hell,255,215,140),.95),0 0 7px rgba(var(--ae-rgb,255,155,18),.62) !important;",
      " background:rgba(var(--ae-rgb,255,155,18),.14) !important;}",
      /* Drehknopf-Canvas */
      "#" + KENNUNG2 + " .ae-dreh-cv{position:absolute !important;z-index:5 !important;border-radius:50% !important;",
      " touch-action:none !important;cursor:" + HAND_AUF2 + " !important;}",
      "#" + KENNUNG2 + " .ae-dreh-cv.greift{cursor:" + HAND_ZU2 + " !important;}",
      /* Panoramisches Stabo XF 9082 LCD-Fenster (Alle Groessen fest auf ae-kasten 560x182 skaliert!) */
      "#" + KENNUNG2 + " .ae-display{position:absolute !important;z-index:5 !important;border-radius:3px !important;cursor:pointer !important;",
      " isolation:isolate !important;contain:layout paint style !important;transform:translateZ(0) !important;overflow:hidden !important;",
      " background-color:var(--ae-lcd,#ff9b12) !important;",
      " background-image:radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.26) 0%,rgba(0,0,0,.06) 66%,rgba(0,0,0,.34) 100%) !important;",
      " box-shadow:inset 0 3px 10px rgba(0,0,0,.82),inset 0 0 18px rgba(0,0,0,.35),inset 0 0 0 1.5px rgba(8,8,10,.92) !important;",
      " transition:filter .2s,background-color .22s !important;}",
      "#" + KENNUNG2 + ".dim .ae-display{filter:brightness(.58) contrast(1.06) !important;}",
      "#" + KENNUNG2 + ".standby .ae-display{filter:brightness(.19) saturate(.24) !important;}",
      "#" + KENNUNG2 + " .ae-display::after{content:'' !important;position:absolute !important;inset:0 !important;pointer-events:none !important;z-index:8 !important;",
      " background:linear-gradient(124deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,.04) 30%,transparent 32.5%) !important;}",
      "#" + KENNUNG2 + " .ae-lcd-grid{position:absolute !important;inset:0 !important;padding:2px 6px !important;",
      " display:grid !important;grid-template-columns:28% 1fr 22% !important;align-items:stretch !important;gap:3px !important;",
      " box-sizing:border-box !important;}",
      "#" + KENNUNG2 + ".standby .ae-lcd-grid{opacity:.14 !important;}",
      /* Linkes Feld im LCD: Gebogenes Analog-S-Meter + BUSY Kasten */
      "#" + KENNUNG2 + " .ae-lcd-meter{position:relative !important;height:100% !important;min-width:0 !important;}",
      "#" + KENNUNG2 + " .ae-lcd-meter svg{width:100% !important;height:100% !important;display:block !important;}",
      "#" + KENNUNG2 + " .ae-busy{position:absolute !important;left:2px !important;bottom:2px !important;",
      " padding:1px 3.5px !important;border-radius:1.5px !important;",
      " font:900 6.5px/1.05 system-ui,sans-serif !important;letter-spacing:.05em !important;",
      " background:rgba(20,14,4,.09) !important;color:rgba(20,14,4,.18) !important;transition:all .10s !important;}",
      "#" + KENNUNG2 + " .ae-busy.an{background:#140e04 !important;color:var(--ae-lcd,#ff9b12) !important;box-shadow:0 0 2px rgba(0,0,0,.28) !important;}",
      /* Mittleres Feld im LCD: Mode, Status-Flags, 7-Segment Frequenz + BEEP / MHz + Statuszeile */
      "#" + KENNUNG2 + " .ae-lcd-mitte{position:relative !important;display:flex !important;flex-direction:column !important;justify-content:space-between !important;min-width:0 !important;padding:1px 0 !important;}",
      "#" + KENNUNG2 + " .ae-lcd-mtop{display:flex !important;align-items:center !important;justify-content:space-between !important;gap:3px !important;}",
      "#" + KENNUNG2 + " .ae-d-mode{font:900 8.5px/1 system-ui,sans-serif !important;color:#140e04 !important;letter-spacing:.04em !important;flex:0 0 auto !important;}",
      "#" + KENNUNG2 + " .ae-lcd-flags{display:flex !important;align-items:center !important;gap:3px !important;flex-wrap:nowrap !important;overflow:hidden !important;}",
      "#" + KENNUNG2 + " .ae-d-flag{font:800 5.3px/1 system-ui,sans-serif !important;color:#140e04 !important;opacity:.12 !important;letter-spacing:.02em !important;white-space:nowrap !important;}",
      "#" + KENNUNG2 + " .ae-d-flag.an{opacity:.96 !important;}",
      "#" + KENNUNG2 + " .ae-lcd-fzeile{display:flex !important;align-items:flex-end !important;justify-content:center !important;gap:4px !important;margin:0 !important;}",
      "#" + KENNUNG2 + " .ae-lcd-fzus{display:flex !important;flex-direction:column !important;align-items:flex-start !important;justify-content:space-between !important;height:25px !important;padding:0 !important;}",
      "#" + KENNUNG2 + " .ae-f-beep{font:800 5.6px/1 system-ui,sans-serif !important;color:#140e04 !important;opacity:.16 !important;letter-spacing:.04em !important;}",
      "#" + KENNUNG2 + " .ae-f-beep.an{opacity:.95 !important;}",
      "#" + KENNUNG2 + " .ae-f-mhz{font:800 7.5px/1 system-ui,sans-serif !important;color:#140e04 !important;opacity:.92 !important;}",
      "#" + KENNUNG2 + " .ae-d-status{font:700 6.2px/1.05 'Courier New',monospace !important;color:#140e04 !important;opacity:.84 !important;",
      " white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;text-align:center !important;}",
      /* Rechtes Feld im LCD: Band C / CH / Grosse Kanalziffern */
      "#" + KENNUNG2 + " .ae-lcd-rechts{position:relative !important;display:flex !important;flex-direction:column !important;align-items:center !important;justify-content:space-between !important;padding:1px 1px 2px 1px !important;}",
      "#" + KENNUNG2 + " .ae-band{font:800 7.6px/1 system-ui,sans-serif !important;color:#140e04 !important;letter-spacing:.06em !important;}",
      "#" + KENNUNG2 + " .ae-ch-row{display:flex !important;align-items:flex-start !important;gap:3px !important;}",
      "#" + KENNUNG2 + " .ae-ch-lbl{font:800 7.4px/1 system-ui,sans-serif !important;color:#140e04 !important;margin-top:2px !important;}",
      /* Schlanke geneigte Stabo-7-Segment-Ziffern (exakt bemessen fuer 56px LCD-Innenhoehe) */
      "#" + KENNUNG2 + " .ae-seg{position:relative !important;display:flex !important;align-items:flex-end !important;gap:2.4px !important;filter:drop-shadow(.8px .8px 0 rgba(0,0,0,.18)) !important;}",
      "#" + KENNUNG2 + " .ae-seg .z{position:relative !important;display:block !important;width:11.6px !important;height:25px !important;flex:0 0 auto !important;transform:skewX(-7deg) !important;}",
      "#" + KENNUNG2 + " .ae-seg.big .z{width:14.4px !important;height:31px !important;}",
      "#" + KENNUNG2 + " .ae-seg.big{gap:3.2px !important;}",
      "#" + KENNUNG2 + " .ae-seg .z i{position:absolute !important;display:block !important;background:rgba(20,14,4,.075) !important;border-radius:1px !important;}",
      "#" + KENNUNG2 + " .ae-seg .z i.on{background:#140e04 !important;box-shadow:0 0 1px rgba(20,14,4,.28) !important;}",
      "#" + KENNUNG2 + " .ae-seg .z i.a{top:0;left:2.0px;right:2.0px;height:2.4px;}",
      "#" + KENNUNG2 + " .ae-seg .z i.d{bottom:0;left:2.0px;right:2.0px;height:2.4px;}",
      "#" + KENNUNG2 + " .ae-seg .z i.g{top:11.3px;left:2.0px;right:2.0px;height:2.4px;}",
      "#" + KENNUNG2 + " .ae-seg .z i.f{top:2.0px;left:0;width:2.4px;height:9.1px;}",
      "#" + KENNUNG2 + " .ae-seg .z i.b{top:2.0px;right:0;width:2.4px;height:9.1px;}",
      "#" + KENNUNG2 + " .ae-seg .z i.e{bottom:2.0px;left:0;width:2.4px;height:9.1px;}",
      "#" + KENNUNG2 + " .ae-seg .z i.c{bottom:2.0px;right:0;width:2.4px;height:9.1px;}",
      "#" + KENNUNG2 + " .ae-seg.big .z i.a{left:2.4px;right:2.4px;height:3.0px;}",
      "#" + KENNUNG2 + " .ae-seg.big .z i.d{left:2.4px;right:2.4px;height:3.0px;}",
      "#" + KENNUNG2 + " .ae-seg.big .z i.g{top:14.0px;left:2.4px;right:2.4px;height:3.0px;}",
      "#" + KENNUNG2 + " .ae-seg.big .z i.f{top:2.4px;width:3.0px;height:11.4px;}",
      "#" + KENNUNG2 + " .ae-seg.big .z i.b{top:2.4px;width:3.0px;height:11.4px;}",
      "#" + KENNUNG2 + " .ae-seg.big .z i.e{bottom:2.4px;width:3.0px;height:11.4px;}",
      "#" + KENNUNG2 + " .ae-seg.big .z i.c{bottom:2.4px;width:3.0px;height:11.4px;}",
      "#" + KENNUNG2 + " .ae-seg .k{position:relative !important;display:block !important;width:4px !important;height:25px !important;flex:0 0 auto !important;}",
      "#" + KENNUNG2 + " .ae-seg .k i{position:absolute !important;left:.6px;bottom:0;width:2.6px;height:3.2px;background:#140e04 !important;border-radius:1px !important;}",
      "#" + KENNUNG2 + " .g2-sr{position:absolute !important;width:1px !important;height:1px !important;overflow:hidden !important;opacity:0 !important;pointer-events:none !important;}",
      /* Rahmen-Griffe, Menue, Wechsel & Ecken */
      "#" + KENNUNG2 + " .ae-griff{position:absolute !important;z-index:20 !important;opacity:.28 !important;transition:opacity .15s linear !important;}",
      "#" + KENNUNG2 + ":hover .ae-griff{opacity:.80 !important;}",
      "#" + KENNUNG2 + " .ae-griff:hover{opacity:1 !important;}",
      "#" + KENNUNG2 + " .ae-menu{position:absolute !important;left:22px !important;top:4px !important;z-index:22 !important;",
      " width:22px !important;height:18px !important;padding:0 !important;border-radius:4px !important;cursor:pointer !important;",
      " background:rgba(12,16,22,.82) !important;color:rgb(var(--ae-hell,255,215,140)) !important;",
      " border:1px solid rgba(var(--ae-rgb,255,155,18),.55) !important;font:11px/16px system-ui !important;}",
      "#" + KENNUNG2 + " .ae-wechsel{position:absolute !important;top:4px !important;right:46px !important;z-index:22 !important;",
      " height:18px !important;padding:0 6px !important;border-radius:4px !important;cursor:pointer !important;",
      " background:rgba(12,16,22,.82) !important;border:1px solid rgba(var(--ae-rgb,255,155,18),.55) !important;",
      " color:rgb(var(--ae-hell,255,215,140)) !important;font:700 10.5px/16px system-ui !important;letter-spacing:.03em !important;}",
      "#" + KENNUNG2 + " .ae-wechsel3{right:86px !important;}",
      "#" + KENNUNG2 + " .ae-zu{right:22px !important;top:4px !important;width:20px !important;height:18px !important;padding:0 !important;z-index:22 !important;",
      " cursor:pointer !important;border-radius:4px !important;background:rgba(12,16,22,.82) !important;",
      " border:1px solid rgba(var(--ae-rgb,255,155,18),.55) !important;color:rgb(var(--ae-hell,255,215,140)) !important;",
      " font:700 12.5px/16px system-ui !important;text-align:center !important;}",
      "#" + KENNUNG2 + " .ae-zieh{left:50% !important;bottom:3px !important;margin-left:-24px !important;z-index:22 !important;",
      " width:48px !important;height:13px !important;cursor:move !important;",
      " border-radius:7px !important;background:rgba(12,16,22,.72) !important;border:1px solid rgba(var(--ae-rgb,255,155,18),.45) !important;",
      " display:flex !important;align-items:center !important;justify-content:center !important;gap:3px !important;}",
      "#" + KENNUNG2 + " .ae-zieh i{width:3px !important;height:3px !important;",
      " border-radius:50% !important;background:rgb(var(--ae-hell,255,215,140)) !important;display:block !important;}",
      "#" + KENNUNG2 + " .ae-eck{width:14px !important;height:14px !important;z-index:20 !important;}",
      "#" + KENNUNG2 + " .ae-eck.br{right:2px !important;bottom:2px !important;border-right:3px solid rgb(var(--ae-hell,255,215,140)) !important;border-bottom:3px solid rgb(var(--ae-hell,255,215,140)) !important;cursor:nwse-resize !important;}",
      "#" + KENNUNG2 + " .ae-eck.bl{left:2px !important;bottom:2px !important;border-left:3px solid rgb(var(--ae-hell,255,215,140)) !important;border-bottom:3px solid rgb(var(--ae-hell,255,215,140)) !important;cursor:nesw-resize !important;}",
      "#" + KENNUNG2 + " .ae-eck.tr{right:2px !important;top:2px !important;border-right:3px solid rgb(var(--ae-hell,255,215,140)) !important;border-top:3px solid rgb(var(--ae-hell,255,215,140)) !important;cursor:nesw-resize !important;}",
      "#" + KENNUNG2 + " .ae-eck.tl{left:2px !important;top:2px !important;border-left:3px solid rgb(var(--ae-hell,255,215,140)) !important;border-top:3px solid rgb(var(--ae-hell,255,215,140)) !important;cursor:nwse-resize !important;}",
      /* Einstellungs-Menue */
      "#" + KENNUNG2 + " .ae-menue{position:absolute !important;left:10px !important;bottom:calc(100% + 6px) !important;top:auto !important;z-index:30 !important;",
      " width:262px !important;max-height:calc(100vh - 24px) !important;overflow-y:auto !important;padding:10px 11px !important;border-radius:9px !important;display:none;",
      " background:linear-gradient(180deg,#1a1f28,#0d1016) !important;border:1px solid #3c4657 !important;box-shadow:0 12px 28px rgba(0,0,0,.85) !important;}",
      "#" + KENNUNG2 + " .ae-menue.menue-unten{top:calc(100% + 6px) !important;bottom:auto !important;}",
      "#" + KENNUNG2 + " .ae-menue.menue-rechts{left:auto !important;right:10px !important;}",
      "#" + KENNUNG2 + " .ae-menue.offen{display:block !important;}",
      "#" + KENNUNG2 + " .ae-m-titel{font:800 11px/1 system-ui !important;letter-spacing:.08em !important;color:rgb(var(--ae-hell,255,215,140)) !important;margin-bottom:7px !important;}",
      "#" + KENNUNG2 + " .ae-m-zeile{display:flex !important;align-items:center !important;gap:7px !important;margin:6px 0 !important;font:11px/1.2 system-ui !important;color:#e7edf5 !important;}",
      "#" + KENNUNG2 + " .ae-m-zeile label{width:76px !important;opacity:.85 !important;}",
      "#" + KENNUNG2 + " .ae-m-zeile input[type=range]{flex:1 1 auto;min-width:0;}",
      "#" + KENNUNG2 + " .ae-m-zeile b{width:42px !important;text-align:right !important;font-weight:700 !important;color:rgb(var(--ae-hell,255,215,140)) !important;}",
      "#" + KENNUNG2 + " .ae-m-reihe{display:flex !important;gap:5px !important;margin-top:6px !important;}",
      "#" + KENNUNG2 + " .ae-m-knopf{width:100% !important;margin-top:6px !important;height:25px !important;border-radius:6px !important;cursor:pointer !important;",
      " background:#222834 !important;color:#edf2f7 !important;border:1px solid #3c4657 !important;font:11px/23px system-ui !important;}",
      "#" + KENNUNG2 + " .ae-m-knopf.an{background:rgba(var(--ae-rgb,255,155,18),.28) !important;border-color:rgb(var(--ae-hell,255,215,140)) !important;color:#fff !important;}"
    ].join("\n");
    document.head.appendChild(css);

    function pctCss(f) {
      return "left:" + f[0] + "%;top:" + f[1] + "%;width:" + f[2] + "%;height:" + f[3] + "%;";
    }

    var w = document.createElement("div");
    w.id = KENNUNG2;

    var kasten = document.createElement("div");
    kasten.className = "ae-kasten";
    var g = document.createElement("div");
    g.className = "ae-geraet";

    var aeBild = document.createElement("img");
    aeBild.src = BILD2 + "?v=" + Date.now();
    aeBild.alt = "Funkgerät 2";
    aeBild.draggable = false;
    g.appendChild(aeBild);
    var aeBildVersuche = 0;

    /* Power-Linsen-Glow + 3 Status-LEDs */
    var pwrLens = document.createElement("div");
    pwrLens.className = "ae-pwr-lens";
    pwrLens.style.cssText = pctCss(XF_FELD.pwrLens);
    g.appendChild(pwrLens);

    var ledRx = document.createElement("div");
    ledRx.className = "ae-led rx an";
    ledRx.style.cssText = pctCss(XF_FELD.ledRx);
    g.appendChild(ledRx);

    var ledAnt1 = document.createElement("div");
    ledAnt1.className = "ae-led ant an";
    ledAnt1.style.cssText = pctCss(XF_FELD.ledAnt1);
    g.appendChild(ledAnt1);

    var ledAnt2 = document.createElement("div");
    ledAnt2.className = "ae-led ant";
    ledAnt2.style.cssText = pctCss(XF_FELD.ledAnt2);
    g.appendChild(ledAnt2);

    /* Panoramisches Stabo XF 9082 LCD */
    var disp = document.createElement("div");
    disp.className = "ae-display";
    disp.style.cssText = pctCss(XF_FELD.lcd);
    disp.title = "LCD-Farbe wechseln (Klick: Bernstein-Orange / Kobalt-Blau / …)";
    disp.innerHTML =
      '<div class="ae-lcd-grid">' +
        '<div class="ae-lcd-meter">' +
          '<div class="ae-busy">BUSY</div>' +
        '</div>' +
        '<div class="ae-lcd-mitte">' +
          '<div class="ae-lcd-mtop">' +
            '<span class="ae-d-mode ae-sm-mode">FM</span>' +
            '<div class="ae-lcd-flags">' +
              '<span class="ae-d-flag" data-flg="hicut">HI-CUT</span>' +
              '<span class="ae-d-flag" data-flg="anl">ANL</span>' +
              '<span class="ae-d-flag" data-flg="nb">NB</span>' +
              '<span class="ae-d-flag" data-flg="asc">ASC</span>' +
              '<span class="ae-d-flag" data-flg="dw">DW</span>' +
              '<span class="ae-d-flag" data-flg="scan">SCN</span>' +
              '<span class="ae-d-flag" data-flg="skip">SKP</span>' +
              '<span class="ae-d-flag" data-flg="lock">LCK</span>' +
            '</div>' +
          '</div>' +
          '<div class="ae-lcd-fzeile">' +
            '<div class="ae-d-freq"><span class="ae-seg"></span></div>' +
            '<div class="ae-lcd-fzus">' +
              '<span class="ae-f-beep an">BEEP</span>' +
              '<span class="ae-f-mhz">MHz</span>' +
            '</div>' +
          '</div>' +
          '<div class="ae-d-status"></div>' +
        '</div>' +
        '<div class="ae-lcd-rechts">' +
          '<span class="ae-band">C</span>' +
          '<div class="ae-ch-row">' +
            '<span class="ae-ch-lbl">CH</span>' +
            '<span class="ae-k-seg ae-seg big"></span>' +
          '</div>' +
          '<span class="ae-d-kanal g2-sr">14</span>' +
        '</div>' +
      '</div>';
    var q = function (s) { return disp.querySelector(s); };
    var aeMeterInfo = aeMeterSvgBauen(q(".ae-lcd-meter"));
    g.appendChild(disp);

    /* Alle klickbaren Front-Zonen / Tasten auf der Stabo XF 9082 */
    function zone(feld, cls, dataF, titel) {
      var b = document.createElement("button");
      b.className = "ae-zone" + (cls ? " " + cls : "");
      b.style.cssText = pctCss(feld);
      if (dataF) b.setAttribute("data-f", dataF);
      b.title = titel;
      g.appendChild(b);
      return b;
    }

    var bPower  = zone(XF_FELD.power,  "",      "power",  "POWER – Gerät Ein / Standby");
    var bPhones = zone(XF_FELD.phones, "round", "phones", "Kopfhörer – Stumm / Ton ein");
    var bMic    = zone(XF_FELD.mic,    "round", "mic",    "MIC – 6-Pol Buchse (Empfangsbetrieb)");
    var bEmg    = zone(XF_FELD.emg,    "pill",  "emg",    "EMG – Notrufkanal 9 / 19 / zurück");
    var bDim    = zone(XF_FELD.dim,    "pill",  "dim",    "DIM/BRT – Display-Helligkeit dimmen/hell");
    var bPage   = zone(XF_FELD.page,   "round", "page",   "PAGE – Band / Speicher-Seite (M1–M10)");
    var bStep   = zone(XF_FELD.step,   "round", "step",   "STEP – 1-Kanal / 10er-Schritt");
    var bUp     = zone(XF_FELD.up,     "pill",  "up",     "UP – Kanal hoch (gedrückt halten: schnell)");
    var bDown   = zone(XF_FELD.down,   "pill",  "down",   "DOWN – Kanal runter (gedrückt halten: schnell)");

    var kpButtons = {};
    [["1","1 / M1"], ["2","2 / M2"], ["3","3 / M3"],
     ["4","4 / M4"], ["5","5 / M5"], ["6","6 / M6"],
     ["7","7 / M7"], ["8","8 / M8"], ["9","9 / M9"],
     ["*","* / DT.W (Dual Watch)"], ["0","0 / M10"], ["#","# / D.CH (Direktkanal)"]]
    .forEach(function (item) {
      var key = item[0] === "*" ? "kstar" : (item[0] === "#" ? "khash" : ("k" + item[0]));
      kpButtons[item[0]] = zone(XF_FELD[key], "round", "kp_" + item[0], "Taste " + item[1] + " (Langdruck: in Speicher legen)");
    });

    var bHiCut = zone(XF_FELD.hicut, "pill", "hicut", "HI-CUT – Höhenfilter");
    var bAnl   = zone(XF_FELD.anl,   "pill", "anl",   "ANL – Automatic Noise Limiter (NR)");
    var bAsc   = zone(XF_FELD.asc,   "pill", "asc",   "ASC – Automatik-Squelch");
    var bDw    = zone(XF_FELD.dw,    "pill", "dw",    "DW – Zweikanal-Überwachung (Dual Watch)");
    var bSskip = zone(XF_FELD.sskip, "pill", "sskip", "S.SKIP – Klick: Suchlauf (SCAN) · Langdruck: Kanal überspringen");
    var bLock  = zone(XF_FELD.lock,  "pill", "lock",  "LOCK – Tastatur- und Knopfsperre");
    var bAnt   = zone(XF_FELD.ant,   "pill", "ant",   "ANT – Antennenwahl ANT 1 / ANT 2");
    var bRbeep = zone(XF_FELD.rbeep, "pill", "rbeep", "R.BEEP – Bedienklicks / Roger Beep");
    var bDtmf  = zone(XF_FELD.dtmf,  "pill", "dtmf",  "DTMF – Status-Ton / Frequenz-Ansage");
    var bMm    = zone(XF_FELD.mm,    "pill", "mm",    "M.M – Speicher-Modus M1–M10");
    var bNb    = zone(XF_FELD.nb,    "pill", "nb",    "NB – Noise Blanker (Störaustaster)");
    var bSwr   = zone(XF_FELD.swr,   "pill", "swr",   "SWR – SWR / PWR / Signal-Anzeige umschalten");

    /* 6 Drehregler (VFO-Kanalrad, MODE SELECTOR, VOL, SQ, MIC/RF, CLR/CAL) */
    var dVfo = aeDrehBauen("vfo", XF_KNOB.vfo,
      function () { return aeZustand().kanal; },
      function (v) { aeKanalSetzen(v); }, 1, 80,
      "Kanalrad / VFO – Drehen oder Scrollen für Kanal 1–80", { rast: 4.5, stil: "vfo" });

    var XF_MODI = ["nfm", "am", "usb", "lsb"]; /* Physische Reihenfolge auf MODE SELECTOR: FM (-52), AM (-27), USB (+19), LSB (+52) */
    var dMode = aeDrehBauen("mode", XF_KNOB.mode,
      function () {
        var idx = XF_MODI.indexOf(aeZustand().mode);
        return idx < 0 ? 0 : idx;
      },
      function (v) {
        var m = XF_MODI[((Math.round(v) % 4) + 4) % 4];
        aeModeSetzen(m);
      }, 0, 3,
      "MODE SELECTOR – Drehen / Klicken: FM · AM · USB · LSB", {
        rast: 24, stil: "mode",
        winkelMap: function (idx) {
          var map = [-52, -27, 19, 52];
          return map[((Math.round(idx) % 4) + 4) % 4];
        }
      });
    dMode.addEventListener("click", function () {
      if (dMode._dnxZog && (Date.now() - dMode._dnxZog) < 350) return;
      var z = aeZustand();
      if (!z.power || z.lock) return;
      g2Klick("rast");
      var idx = XF_MODI.indexOf(z.mode);
      aeModeSetzen(XF_MODI[((idx < 0 ? 0 : idx) + 1) % 4]);
    });

    var dVol = aeDrehBauen("vol", XF_KNOB.vol,
      function () { return aeZustand().laut; },
      function (v) { aeWertSetzen("laut", v); }, 0, 150,
      "VOL – Lautstärke (0–150)", { radSchritt: 5, angStart: -145, angSpan: 290 });

    var dSq = aeDrehBauen("sq", XF_KNOB.sq,
      function () { return aeZustand().sq; },
      function (v) {
        var z = aeZustand();
        if (z.asc) { z.asc = false; merken(SPEICHER2 + "_asc", "0"); }
        aeWertSetzen("sq", v);
      }, -150, 0,
      "SQ – Rauschsperre (-150 bis 0 dB)", { radSchritt: 3, angStart: -145, angSpan: 290 });

    var dRf = aeDrehBauen("rf", XF_KNOB.rf,
      function () { return aeZustand().rf; },
      function (v) { aeWertSetzen("rf", v); }, RF_MIN, RF_MAX,
      "MIC / RF – Empfänger-Vorverstärkung RF-Gain (0–49 dB)", { radSchritt: 2, angStart: -145, angSpan: 290 });

    var dClr = aeDrehBauen("clr", XF_KNOB.clr,
      function () { return aeZustand().rit; },
      function (v) { aeRitSetzen(v); }, -2500, 2500,
      "CLR / CAL – Clarifier / Feinabstimmung ±2,5 kHz (Doppelklick = 0 Hz)",
      { radSchritt: 100, angStart: -145, angSpan: 290, onDblClick: function () { aeRitSetzen(0); } });

    [dVfo, dMode, dVol, dSq, dRf, dClr].forEach(function (d) { g.appendChild(d); });
    kasten.appendChild(g);

    /* Einstellungs-Menue */
    var menue = document.createElement("div");
    menue.className = "ae-menue";
    menue.innerHTML =
      '<div class="ae-m-titel">EINSTELLUNGEN \u00b7 FUNKGER\u00c4T 2</div>' +
      '<div class="ae-m-zeile"><label>VOL</label><input type="range" min="0" max="150" data-m="vol"><b class="ae-m-vol">80</b></div>' +
      '<div class="ae-m-zeile"><label>SQUELCH</label><input type="range" min="-150" max="0" data-m="sq"><b class="ae-m-sq">-120</b></div>' +
      '<div class="ae-m-zeile"><label>RF-GAIN</label><input type="range" min="0" max="49" data-m="rf"><b class="ae-m-rf">35</b></div>' +
      '<div class="ae-m-zeile"><label>CLARIFIER</label><input type="range" min="-2500" max="2500" step="100" data-m="rit"><b class="ae-m-rit">0</b></div>' +
      '<div class="ae-m-reihe">' +
        '<button type="button" class="ae-m-knopf" data-m="amber">Bernstein</button>' +
        '<button type="button" class="ae-m-knopf" data-m="blau">Kobalt-Blau</button>' +
      '</div>' +
      '<button type="button" class="ae-m-knopf" data-m="lcd">N\u00e4chste Displayfarbe</button>' +
      '<button type="button" class="ae-m-knopf" data-m="dim">DIM / BRT umschalten</button>' +
      '<button type="button" class="ae-m-knopf" data-m="w1">\u21c4 Zu Funkger\u00e4t 1</button>' +
      '<button type="button" class="ae-m-knopf" data-m="w3">\u21c4 Zu Funkger\u00e4t 3</button>';
    w.appendChild(kasten);
    w.appendChild(menue);

    var menuBtn = document.createElement("button");
    menuBtn.className = "ae-griff ae-menu";
    menuBtn.textContent = "\u2630";
    menuBtn.title = "Menü – Einstellungen Funkgerät 2";
    menuBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      menue.classList.toggle("offen");
      menueAusrichten(w, menue);
    });
    w.appendChild(menuBtn);

    var w1 = document.createElement("button");
    w1.className = "ae-griff ae-wechsel";
    w1.textContent = "\u21c4 1";
    w1.title = "Zu Funkgerät 1";
    w1.addEventListener("click", function () { geraetWechsel(1); });
    w.appendChild(w1);

    var w3 = document.createElement("button");
    w3.className = "ae-griff ae-wechsel ae-wechsel3";
    w3.textContent = "\u21c4 3";
    w3.title = "Zu Funkgerät 3";
    w3.addEventListener("click", function () { geraetWechsel(3); });
    w.appendChild(w3);

    var zu = document.createElement("button");
    zu.className = "ae-griff ae-zu";
    zu.textContent = "×";
    zu.title = "Schließen";
    zu.addEventListener("click", function () { aeZeigen(false); });
    w.appendChild(zu);

    var zieh = document.createElement("div");
    zieh.className = "ae-griff ae-zieh";
    zieh.title = "Gerät verschieben";
    for (var di = 0; di < 3; di++) zieh.appendChild(document.createElement("i"));
    w.appendChild(zieh);

    [["tl", 1, 1], ["tr", 0, 1], ["bl", 1, 0], ["br", 0, 0]].forEach(function (eck) {
      var d = document.createElement("div");
      d.className = "ae-griff ae-eck " + eck[0];
      d.setAttribute("data-eck", eck[0]);
      d.setAttribute("title", "Größe ziehen");
      w.appendChild(d);
    });

    document.body.appendChild(w);
    document.addEventListener("click", function (ev) {
      if (ev && ev.isTrusted === false) return;
      if (menue.classList.contains("offen") && !menue.contains(ev.target) &&
          ev.target !== menuBtn && !menuBtn.contains(ev.target)) {
        menue.classList.remove("offen");
      }
    });

    /* Bild-Lader & Fehlerwiederholung */
    function aeDrehAlleMalen() {
      [dVfo, dMode, dVol, dSq, dRf, dClr].forEach(function (k) {
        try { if (k && k.knopfMalen) k.knopfMalen(); } catch (eK) { }
      });
    }
    if (aeBild.complete && aeBild.naturalWidth) { setTimeout(function () { aeGroesseNachziehen(); aeDrehAlleMalen(); }, 60); }
    else {
      aeBild.addEventListener("load", function () { aeBildVersuche = 0; setTimeout(function () { aeGroesseNachziehen(); aeDrehAlleMalen(); }, 60); });
      aeBild.addEventListener("error", function () {
        aeDrehAlleMalen();
        if (aeBildVersuche < 30) {
          aeBildVersuche++;
          setTimeout(function () {
            if (!aeBild || aeBild.naturalWidth) return;
            aeBild.src = BILD2 + "?v=" + Date.now();
          }, 1200);
        }
      });
    }

    /* Sperr- & Powerpruefung fuer alle Bedienelemente */
    function aeSperre() {
      var z = aeZustand();
      if (!z.power) { aeMeld("STANDBY \u2013 ON/OFF einschalten"); aeMalen(); return true; }
      if (z.lock) { aeMeld("LOCK aktiv"); aeMalen(); return true; }
      return false;
    }

    /* Alle Button-Ereignisse */
    disp.addEventListener("click", function () {
      if (!aeZustand().power) return;
      g2Klick("taste");
      aeFarbeWeiter(1);
    });
    bPower.addEventListener("click", function () {
      g2Klick("rast");
      aePowerUmschalten();
    });
    bPhones.addEventListener("click", function () {
      var z = aeZustand();
      if (!z.power) return;
      g2Klick("taste");
      if (!z.stumm && z.laut > 0) {
        z.stummVorher = z.laut; z.stumm = true;
        aeWertSetzen("laut", 0); aeMeld("STUMM (PHONES)");
      } else {
        var r = (typeof z.stummVorher === "number" && z.stummVorher > 0) ? z.stummVorher : 80;
        z.stumm = false; z.stummVorher = null;
        aeWertSetzen("laut", r); aeMeld("TON EIN");
      }
      aeMalen();
    });
    bMic.addEventListener("click", function () {
      g2Klick("taste");
      aeMeld("RX-Betrieb (6-Pol MIC)");
      aeMalen();
    });
    bEmg.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("rast");
      aeScanStopp(""); aeDwStopp("");
      var z = aeZustand();
      if (z.kanal === 9) {
        aeKanalSetzen(19);
        aeMeld("EMG: Kanal 19 (Trucker)");
      } else if (z.kanal === 19 && z.chVorEmg && z.chVorEmg !== 9 && z.chVorEmg !== 19) {
        var ret = z.chVorEmg;
        aeKanalSetzen(ret);
        aeMeld("Zur\u00fcck auf K" + (ret < 10 ? "0" + ret : ret));
      } else {
        z.chVorEmg = z.kanal;
        merken(SPEICHER2 + "_chvoremg", z.chVorEmg);
        aeKanalSetzen(9);
        aeMeld("EMG: Notruf-Kanal 9");
      }
      aeMalen();
    });
    bDim.addEventListener("click", function () {
      var z = aeZustand();
      if (!z.power) return;
      g2Klick("taste");
      z.dim = !z.dim;
      merken(SPEICHER2 + "_dim", z.dim ? "1" : "0");
      aeMeld(z.dim ? "LCD: DIM (gedimmt)" : "LCD: BRT (hell)");
      aeMalen();
    });
    bPage.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      var z = aeZustand();
      z.mm = !z.mm;
      merken(SPEICHER2 + "_mm", z.mm ? "1" : "0");
      aeMeld(z.mm ? "PAGE: Speicher M1\u2013M10" : "PAGE: Band C (Normal)");
      aeMalen();
    });
    bStep.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      var z = aeZustand();
      z.step10 = !z.step10;
      merken(SPEICHER2 + "_step10", z.step10 ? "1" : "0");
      aeMeld(z.step10 ? "STEP: 10er-Kanalsprung" : "STEP: 1-Kanal-Schritt");
      aeMalen();
    });

    function chPfeilBinden(kn, delta) {
      var rpt = null;
      kn.addEventListener("pointerdown", function (e) {
        if (e && e.button && e.button !== 0) return;
        if (aeSperre()) return;
        aeScanStopp(""); aeDwStopp("");
        var z = aeZustand();
        var step = (z.step10 ? 10 : 1) * delta;
        g2Klick("taste");
        aeKanalSetzen(z.kanal + step);
        if (rpt) clearInterval(rpt);
        rpt = setTimeout(function () {
          rpt = setInterval(function () {
            if (!aeZustand().power || aeZustand().lock) { clearInterval(rpt); return; }
            aeKanalSetzen(aeZustand().kanal + step);
          }, 125);
        }, 420);
      });
      function aus() { if (rpt) { clearTimeout(rpt); clearInterval(rpt); rpt = null; } }
      kn.addEventListener("pointerup", aus);
      kn.addEventListener("pointercancel", aus);
      kn.addEventListener("pointerleave", aus);
    }
    chPfeilBinden(bUp, 1);
    chPfeilBinden(bDown, -1);

    /* CH DIRECT & FUNCTION Tastenfeld (1..9, *, 0, #) */
    var aeEingabeTimer = null;
    function aeEingabeCommit() {
      if (aeEingabeTimer) { clearTimeout(aeEingabeTimer); aeEingabeTimer = null; }
      var z = aeZustand();
      if (!z.eingabePuffer) return;
      var k = parseInt(z.eingabePuffer, 10);
      z.eingabePuffer = "";
      if (k >= 1 && k <= 80) {
        aeScanStopp(""); aeDwStopp("");
        aeKanalSetzen(k);
        aeMeld("Direkt-Kanal " + (k < 10 ? "0" + k : k));
      } else {
        aeMeld("Ung\u00fcltig (nur K01\u2013K80)");
      }
      aeMalen();
    }
    function aeMemIndex(ch) {
      return ch === "0" ? 9 : (parseInt(ch, 10) - 1);
    }
    Object.keys(kpButtons).forEach(function (ch) {
      var btn = kpButtons[ch];
      if (ch === "*") {
        btn.addEventListener("click", function () {
          if (aeSperre()) return;
          g2Klick("taste");
          if (aeZustand().dw) aeDwStopp("DW aus");
          else aeDwStart();
        });
        return;
      }
      if (ch === "#") {
        btn.addEventListener("click", function () {
          if (aeSperre()) return;
          g2Klick("taste");
          if (aeZustand().eingabePuffer) aeEingabeCommit();
          else { aeMeld("D.CH: Ziffern 1\u201380 eintippen"); aeMalen(); }
        });
        return;
      }
      var langTimer = null, langAusgeloest = false;
      btn.addEventListener("pointerdown", function (e) {
        if (e && e.button && e.button !== 0) return;
        langAusgeloest = false;
        if (langTimer) clearTimeout(langTimer);
        langTimer = setTimeout(function () {
          langTimer = null;
          if (aeSperre()) return;
          langAusgeloest = true;
          g2Klick("rast");
          var idx = aeMemIndex(ch);
          var z = aeZustand();
          z.mems[idx] = { k: z.kanal, m: z.mode };
          z.memIdx = idx;
          try { merken(SPEICHER2 + "_mems", JSON.stringify(z.mems)); } catch (eJm) { }
          aeMeld("M" + (idx + 1) + " gespeichert: K" + (z.kanal < 10 ? "0" + z.kanal : z.kanal));
          aeMalen();
        }, 550);
      });
      function clearKp() { if (langTimer) { clearTimeout(langTimer); langTimer = null; } }
      btn.addEventListener("pointerup", clearKp);
      btn.addEventListener("pointercancel", clearKp);
      btn.addEventListener("click", function () {
        if (langAusgeloest) { langAusgeloest = false; return; }
        if (aeSperre()) return;
        g2Klick("taste");
        var z = aeZustand();
        if (z.mm) {
          var idx = aeMemIndex(ch);
          var slot = z.mems[idx];
          z.memIdx = idx;
          if (slot && slot.k >= 1 && slot.k <= 80) {
            aeScanStopp(""); aeDwStopp("");
            aeKanalSetzen(slot.k);
            if (slot.m && MODI.indexOf(slot.m) >= 0) aeModeSetzen(slot.m);
            aeMeld("Speicher M" + (idx + 1) + ": K" + (slot.k < 10 ? "0" + slot.k : slot.k));
          } else {
            aeMeld("M" + (idx + 1) + " leer (Langdruck speichert)");
          }
          aeMalen();
          return;
        }
        z.eingabePuffer = (z.eingabePuffer || "") + ch;
        if (z.eingabePuffer.length >= 2) {
          aeEingabeCommit();
        } else {
          if (aeEingabeTimer) clearTimeout(aeEingabeTimer);
          aeEingabeTimer = setTimeout(aeEingabeCommit, 1200);
          aeMeld("Direkt: " + z.eingabePuffer + "-");
          aeMalen();
        }
      });
    });

    /* Rechte 12 Funktions-Pillen (HI-CUT..SWR) */
    bHiCut.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      var z = aeZustand();
      z.hiCut = !z.hiCut;
      merken(SPEICHER2 + "_hicut", z.hiCut ? "1" : "0");
      aeMeld("HI-CUT " + (z.hiCut ? "EIN" : "AUS"));
      aeMalen();
    });
    bAnl.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      afToggle("NR");
      aeMeld("ANL / NR: " + (afRead("NR") ? "EIN" : "AUS"));
      aeMalen();
    });
    bAsc.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      var z = aeZustand();
      z.asc = !z.asc;
      merken(SPEICHER2 + "_asc", z.asc ? "1" : "0");
      if (z.asc) {
        z.sqVorAsc = z.sq;
        aeWertSetzen("sq", -85);
        aeMeld("ASC Automatik-Squelch EIN");
      } else {
        var rSq = (typeof z.sqVorAsc === "number") ? z.sqVorAsc : -120;
        aeWertSetzen("sq", rSq);
        aeMeld("ASC AUS (SQ " + rSq + " dB)");
      }
      aeMalen();
    });
    bDw.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      if (aeZustand().dw) aeDwStopp("DW aus");
      else aeDwStart();
    });
    (function () {
      var sTimer = null, sLang = false;
      bSskip.addEventListener("pointerdown", function (e) {
        if (e && e.button && e.button !== 0) return;
        sLang = false;
        if (sTimer) clearTimeout(sTimer);
        sTimer = setTimeout(function () {
          sTimer = null;
          if (aeSperre()) return;
          sLang = true;
          g2Klick("rast");
          var z = aeZustand();
          var i = z.skipList.indexOf(z.kanal);
          if (i >= 0) { z.skipList.splice(i, 1); aeMeld("K" + z.kanal + " wieder im Suchlauf"); }
          else { z.skipList.push(z.kanal); aeMeld("S.SKIP: K" + z.kanal + " gesperrt"); }
          try { merken(SPEICHER2 + "_skip", JSON.stringify(z.skipList)); } catch (eJs) { }
          aeMalen();
        }, 550);
      });
      function cs() { if (sTimer) { clearTimeout(sTimer); sTimer = null; } }
      bSskip.addEventListener("pointerup", cs);
      bSskip.addEventListener("pointercancel", cs);
      bSskip.addEventListener("click", function () {
        if (sLang) { sLang = false; return; }
        if (aeSperre()) return;
        g2Klick("taste");
        if (aeZustand().scan) aeScanStopp("Suchlauf gestoppt");
        else aeScanStart();
      });
    })();
    bLock.addEventListener("click", function () {
      var z = aeZustand();
      if (!z.power) return;
      g2Klick("rast");
      z.lock = !z.lock;
      merken(SPEICHER2 + "_lock", z.lock ? "1" : "0");
      aeMeld(z.lock ? "LOCK: Tastensperre EIN" : "LOCK: entsperrt");
      aeMalen();
    });
    bAnt.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("rast");
      var z = aeZustand();
      z.ant = (z.ant === 1) ? 2 : 1;
      merken(SPEICHER2 + "_ant", z.ant);
      aeMeld("Antenne: ANT " + z.ant + " gew\u00e4hlt");
      aeMalen();
    });
    bRbeep.addEventListener("click", function () {
      if (aeSperre()) return;
      _klickAn = !_klickAn;
      merken(SPEICHER + "_klicks", _klickAn ? "1" : "0");
      if (_klickAn) g2Klick("taste");
      aeMeld("R.BEEP Klicks: " + (_klickAn ? "EIN" : "AUS"));
      aeMalen();
    });
    bDtmf.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("rast");
      var z = aeZustand();
      var hz = kanalFrequenz(z.kanal) + (z.rit || 0);
      aeMeld("DTMF / Info: K" + (z.kanal < 10 ? "0" + z.kanal : z.kanal) + " (" + (hz / 1e6).toFixed(3) + " MHz)");
      aeMalen();
    });
    bMm.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      var z = aeZustand();
      z.mm = !z.mm;
      merken(SPEICHER2 + "_mm", z.mm ? "1" : "0");
      aeMeld(z.mm ? "M.M Speicher-Modus (1\u20130 w\u00e4hlt M1\u2013M10)" : "M.M aus (Direkteingabe 1\u201380)");
      aeMalen();
    });
    bNb.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      afToggle("NB");
      aeMeld("Noise Blanker: " + (afRead("NB") ? "EIN" : "AUS"));
      aeMalen();
    });
    bSwr.addEventListener("click", function () {
      if (aeSperre()) return;
      g2Klick("taste");
      var z = aeZustand();
      z.swrAn = !z.swrAn;
      aeMeld(z.swrAn ? "SWR-Skala 1:1.1 (CAL)" : "S-Meter / PWR-Skala");
      aeMalen();
    });

    /* Menue-Regler & Knoepfe */
    var qm = function (s) { return menue.querySelector(s); };
    qm('[data-m="vol"]').addEventListener("input", function () { aeWertSetzen("laut", this.value); });
    qm('[data-m="sq"]').addEventListener("input", function () { aeWertSetzen("sq", this.value); });
    qm('[data-m="rf"]').addEventListener("input", function () { aeWertSetzen("rf", this.value); });
    qm('[data-m="rit"]').addEventListener("input", function () { aeRitSetzen(this.value); });
    qm('[data-m="amber"]').addEventListener("click", function () {
      g2Klick("taste"); merken(SPEICHER2 + "_lcd", "bernstein"); aeMeld("LCD: Bernstein-Orange"); aeMalen();
    });
    qm('[data-m="blau"]').addEventListener("click", function () {
      g2Klick("taste"); merken(SPEICHER2 + "_lcd", "blau"); aeMeld("LCD: Kobalt-Blau"); aeMalen();
    });
    qm('[data-m="lcd"]').addEventListener("click", function () { g2Klick("taste"); aeFarbeWeiter(1); });
    qm('[data-m="dim"]').addEventListener("click", function () { bDim.click(); });
    qm('[data-m="w1"]').addEventListener("click", function () { g2Klick("taste"); menue.classList.remove("offen"); geraetWechsel(1); });
    qm('[data-m="w3"]').addEventListener("click", function () { g2Klick("taste"); menue.classList.remove("offen"); geraetWechsel(3); });

    /* Skalierung (mit festem 1440:468 Seitenverhaeltnis) & Dragging */
    var AE_BASIS = 560;
    var aeSkala = 1;
    function aeGroesseSetzen(k) {
      aeSkala = Math.max(0.55, Math.min(2.4, Number(k) || 1));
      kasten.style.transform = (Math.abs(aeSkala - 1) < 0.001) ? "none" : ("scale(" + aeSkala + ")");
      try { w.style.setProperty("--ae-skala", aeSkala.toFixed(3)); } catch (e0) { }
      w.style.width = Math.round(AE_BASIS * aeSkala) + "px";
      var hh = kasten.offsetHeight;
      if (hh <= 20) hh = Math.round(AE_BASIS * BILD2_H / BILD2_B);
      w.style.height = Math.round(hh * aeSkala) + "px";
    }
    function aeGroesseNachziehen() {
      if (w.style.display === "none") return;
      aeGroesseSetzen(aeSkala);
    }

    var sk0 = parseFloat(holenText(SPEICHER2 + "_skala", "1"));
    aeGroesseSetzen((sk0 >= 0.55 && sk0 <= 2.4) ? sk0 : 1);
    var l0 = holenText(SPEICHER2 + "_links", ""), o0 = holenText(SPEICHER2 + "_oben", "");
    if (l0 !== "" && o0 !== "") {
      w.style.left = l0 + "px";
      w.style.top = o0 + "px";
      w.style.bottom = "auto";
    }

    var AE_MIN_W = Math.round(AE_BASIS * 0.55), AE_MAX_W = Math.round(AE_BASIS * 2.4);
    function aePersist() {
      var r = w.getBoundingClientRect();
      merken(SPEICHER2 + "_links", Math.round(r.left));
      merken(SPEICHER2 + "_oben", Math.round(r.top));
      merken(SPEICHER2 + "_skala", String(Math.round(aeSkala * 1000) / 1000));
    }
    el.aeKlemmen = function () {
      cbKastenKlemmen(w, function (nw) { aeGroesseSetzen(nw / AE_BASIS); }, AE_MIN_W, aePersist);
      if (menue.classList.contains("offen")) menueAusrichten(w, menue);
    };

    var aeZug = null;
    function aeZugStart(ev, art) {
      if (ev && ev.button && ev.button !== 0) return;
      var r = w.getBoundingClientRect();
      var vw = window.innerWidth || 1600, vh = window.innerHeight || 980;
      var ratio = r.width / Math.max(40, r.height);
      var vonLinks = art.indexOf("l") >= 0, vonOben = art.indexOf("t") >= 0;
      var availW = vonLinks ? r.right : (vw - r.left);
      var availH = vonOben ? r.bottom : (vh - r.top);
      var effMaxW = Math.max(AE_MIN_W, Math.min(AE_MAX_W, Math.floor(Math.min(availW, availH * ratio))));
      aeZug = {
        art: art, mx: ev.clientX, my: ev.clientY, x: r.left, y: r.top,
        w: r.width, h: r.height, ratio: ratio, effMaxW: effMaxW,
        anchorL: r.left, anchorR: r.right, anchorT: r.top, anchorB: r.bottom
      };
      w.style.left = Math.round(r.left) + "px";
      w.style.top = Math.round(r.top) + "px";
      w.style.bottom = "auto";
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
    }
    w.addEventListener("pointerdown", function (ev) {
      var eck = ev.target && ev.target.closest ? ev.target.closest(".ae-eck") : null;
      if (eck) { aeZugStart(ev, eck.getAttribute("data-eck")); return; }
      var gr = ev.target && ev.target.closest ? ev.target.closest(".ae-zieh") : null;
      if (gr) { aeZugStart(ev, "zieh"); return; }
      if (ev.target === aeBild) { aeZugStart(ev, "zieh"); }
    }, { capture: true });
    window.addEventListener("pointermove", function (ev) {
      if (!aeZug) return;
      var vw = window.innerWidth || 1600, vh = window.innerHeight || 980;
      var dx = ev.clientX - aeZug.mx, dy = ev.clientY - aeZug.my;
      if (aeZug.art === "zieh") {
        var cr = w.getBoundingClientRect();
        var nx = Math.max(0, Math.min(Math.max(0, vw - cr.width), Math.round(aeZug.x + dx)));
        var ny = Math.max(0, Math.min(Math.max(0, vh - cr.height), Math.round(aeZug.y + dy)));
        w.style.left = nx + "px";
        w.style.top = ny + "px";
        w.style.bottom = "auto";
      } else {
        var vonLinks = aeZug.art.indexOf("l") >= 0;
        var vonOben = aeZug.art.indexOf("t") >= 0;
        var dW = vonLinks ? -dx : dx;
        var dH = (vonOben ? -dy : dy) * aeZug.ratio;
        var delta = (Math.abs(dW) >= Math.abs(dH)) ? dW : dH;
        var breit = Math.max(AE_MIN_W, Math.min(aeZug.effMaxW, Math.round(aeZug.w + delta)));
        aeGroesseSetzen(breit / AE_BASIS);
        var nh = w.getBoundingClientRect().height;
        var nl = vonLinks ? Math.round(aeZug.anchorR - breit) : Math.round(aeZug.anchorL);
        var nt = vonOben ? Math.round(aeZug.anchorB - nh) : Math.round(aeZug.anchorT);
        nl = Math.max(0, Math.min(Math.max(0, vw - breit), nl));
        nt = Math.max(0, Math.min(Math.max(0, vh - nh), nt));
        w.style.left = nl + "px";
        w.style.top = nt + "px";
        w.style.bottom = "auto";
      }
      if (menue.classList.contains("offen")) menueAusrichten(w, menue);
      if (ev.cancelable && ev.preventDefault) ev.preventDefault();
    }, { capture: true, passive: false });
    function aeZugEnde() {
      if (!aeZug) return;
      aeZug = null;
      aeGroesseNachziehen();
      cbKastenKlemmen(w, function (nw) { aeGroesseSetzen(nw / AE_BASIS); }, AE_MIN_W);
      aePersist();
      if (menue.classList.contains("offen")) menueAusrichten(w, menue);
    }
    window.addEventListener("pointerup", aeZugEnde, true);
    window.addEventListener("pointercancel", aeZugEnde, true);
    window.addEventListener("blur", aeZugEnde, true);

    /* Referenzen fuer aeMalen() und 100ms-Takt sichern */
    el.aeFenster = w;
    el.aeGroesseNachziehen = aeGroesseNachziehen;
    el.aeDrehMalen = aeDrehAlleMalen;
    el.aeNadel = aeMeterInfo.ng;
    el.aePwrLbl = aeMeterInfo.pwrLbl;
    el.aeBusy = q(".ae-busy");
    el.aeKanal = q(".ae-d-kanal");
    el.aeKanalSeg = q(".ae-k-seg");
    el.aeFreq = q(".ae-d-freq");
    el.aeMode = q(".ae-d-mode");
    el.aeBand = q(".ae-band");
    el.aeBeep = q(".ae-f-beep");
    el.aeStatus = q(".ae-d-status");
    el.aeLeds = { rx: ledRx, ant1: ledAnt1, ant2: ledAnt2 };
    el.aeFlags = {
      hicut: q('[data-flg="hicut"]'), anl: q('[data-flg="anl"]'), nb: q('[data-flg="nb"]'),
      asc: q('[data-flg="asc"]'),     dw: q('[data-flg="dw"]'),   scan: q('[data-flg="scan"]'),
      skip: q('[data-flg="skip"]'),   lock: q('[data-flg="lock"]')
    };
    el.aeTasten = {
      hicut: bHiCut, anl: bAnl, asc: bAsc, dw: bDw, sskip: bSskip,
      lock: bLock, ant: bAnt, rbeep: bRbeep, mm: bMm, nb: bNb, swr: bSwr, step: bStep, page: bPage
    };
    el.aeMVol = qm(".ae-m-vol");
    el.aeMSq  = qm(".ae-m-sq");
    el.aeMRf  = qm(".ae-m-rf");
    el.aeMRit = qm(".ae-m-rit");

    aeZeigen(zustand.aeOffen === true);
    aeMalen();
  }

  var aeZ = null, aeScanTimer = null, aeScanZaehler = 0;
  var aeLetzteExtHz = null, aeLetzteExtLaut = null, aeLetzteExtSq = null, aeLetzteExtMode = null;
  var aeHzGrace = 0, aeModeGrace = 0;

  function aeZustand() {
    if (aeZ) return aeZ;
    var k = Math.round(holen(SPEICHER + "_aekanal", 14));
    if (!(k >= 1 && k <= 80)) k = 14;
    var m = holenText(SPEICHER + "_aemode", "nfm");
    if (MODI.indexOf(m) < 0) m = "nfm";
    var mems = [];
    try {
      var mj = JSON.parse(holenText(SPEICHER2 + "_mems", "[]"));
      if (Array.isArray(mj)) mems = mj;
    } catch (eJm) { mems = []; }
    if (!mems.length) {
      mems = [{ k: 1, m: "nfm" }, { k: 4, m: "nfm" }, { k: 9, m: "nfm" }, { k: 14, m: "nfm" },
              { k: 19, m: "am" }, { k: 22, m: "nfm" }, { k: 40, m: "nfm" }, { k: 80, m: "nfm" },
              { k: 15, m: "usb" }, { k: 31, m: "lsb" }];
    }
    var skips = [];
    try {
      var sj = JSON.parse(holenText(SPEICHER2 + "_skip", "[]"));
      if (Array.isArray(sj)) skips = sj;
    } catch (eJs) { skips = []; }
    var antV = Math.round(holen(SPEICHER2 + "_ant", 1));
    aeZ = {
      kanal: k,
      istCb: true,
      extHz: null,
      mode: m,
      laut: Math.round(holen(SPEICHER + "_aelaut", zustand.laut)),
      sq: Math.round(holen(SPEICHER + "_aesq", zustand.sq)),
      rf: holen(SPEICHER + "_aerf", zustand.rf),
      rit: Math.round(holen(SPEICHER2 + "_rit", 0)),
      power: true,
      stumm: false,
      stummVorher: null,
      dim: holenText(SPEICHER2 + "_dim", "0") === "1",
      ant: (antV === 2) ? 2 : 1,
      lock: holenText(SPEICHER2 + "_lock", "0") === "1",
      hiCut: holenText(SPEICHER2 + "_hicut", "0") === "1",
      asc: holenText(SPEICHER2 + "_asc", "0") === "1",
      sqVorAsc: -120,
      step10: holenText(SPEICHER2 + "_step10", "0") === "1",
      mm: holenText(SPEICHER2 + "_mm", "0") === "1",
      memIdx: 0,
      mems: mems,
      skipList: skips,
      swrAn: false,
      eingabePuffer: "",
      chVorEmg: Math.round(holen(SPEICHER2 + "_chvoremg", k)),
      scan: false, boden: null,
      dw: false, dwKanal: 19, dwA: k, dwSignal: false, dwZeit: 0, dwBoden: null,
      meldung: "", meldungZeit: 0
    };
    return aeZ;
  }
  function aeMeld(text) {
    var z = aeZustand(); z.meldung = text || ""; z.meldungZeit = Date.now();
  }
  function aeDarfOpenWebRx() {
    return !zustand.offen && (!zustand.p3Offen || aktivesGeraet() === "2");
  }
  function aeKanalSetzen(n, ohneTune) {
    var z = aeZustand();
    var k = wrapKanal(n);
    z.kanal = k;
    z.istCb = true;
    var hz = kanalFrequenz(k) + (z.rit || 0);
    z.extHz = hz;
    merken(SPEICHER + "_aekanal", k);
    if (aeDarfOpenWebRx() && !ohneTune && z.power) {
      aeHzGrace = Date.now() + 900;
      frequenzSetzen(hz);
      var nach = frequenzLesen();
      var eff = (nach !== null) ? nach : hz;
      aeLetzteExtHz = eff;
      g2LetzteExtHz = eff;
    }
    aeMalen();
    return k;
  }
  function aeModeSetzen(m) {
    if (MODI.indexOf(m) < 0) return false;
    var z = aeZustand();
    z.mode = m;
    merken(SPEICHER + "_aemode", m);
    if (aeDarfOpenWebRx() && z.power) {
      aeModeGrace = Date.now() + 900;
      aeLetzteExtMode = m;
      modeSetzen(m);
    }
    aeMeld("MODE " + (MODE_TEXT[m] || String(m).toUpperCase()));
    aeMalen();
    return m;
  }
  function aeModeWeiter() {
    var z = aeZustand();
    var i = MODI.indexOf(z.mode);
    if (i < 0) i = 0;
    return aeModeSetzen(MODI[(i + 1) % MODI.length]);
  }
  function aeRitSetzen(hzVal) {
    var z = aeZustand();
    var v = Math.round(Number(hzVal) || 0);
    v = Math.max(-2500, Math.min(2500, Math.round(v / 100) * 100));
    if (Math.abs(v) <= 150 && Math.abs(z.rit) > 0 && Math.abs(v) < Math.abs(z.rit)) v = 0;
    z.rit = v;
    merken(SPEICHER2 + "_rit", v);
    if (z.istCb !== false) {
      var neuHz = kanalFrequenz(z.kanal) + v;
      z.extHz = neuHz;
      if (aeDarfOpenWebRx() && z.power) {
        aeHzGrace = Date.now() + 900;
        frequenzSetzen(neuHz);
        var nach = frequenzLesen();
        aeLetzteExtHz = (nach !== null) ? nach : neuHz;
        g2LetzteExtHz = aeLetzteExtHz;
      }
    }
    aeMeld(v === 0 ? "CLR / RIT: 0 Hz" : ("CLR " + (v > 0 ? "+" : "") + (v / 1000).toFixed(1) + " kHz"));
    aeMalen();
    return v;
  }
  function aePowerUmschalten(ziel) {
    var z = aeZustand();
    var neu = (typeof ziel === "boolean") ? ziel : !z.power;
    if (neu === z.power) return z.power;
    z.power = neu;
    if (!neu) {
      aeScanStopp("");
      aeDwStopp("");
      z.stummVorher = z.laut;
      z.stumm = true;
      if (aeDarfOpenWebRx()) {
        aeLetzteExtLaut = 0;
        try {
          var s = document.getElementById("openwebrx-panel-volume");
          if (s) { s.value = 0; ausloesen(s, "input"); ausloesen(s, "change"); }
          if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(0);
        } catch (eM0) { }
      }
      aeMeld("STANDBY");
    } else {
      var restore = (typeof z.stummVorher === "number" && z.stummVorher > 0) ? z.stummVorher : (z.laut > 0 ? z.laut : 80);
      z.stummVorher = null;
      z.stumm = false;
      aeWertSetzen("laut", restore);
      aeMeld("BEREIT");
    }
    aeMalen();
    return z.power;
  }
  function aeWertSetzen(art, v) {
    var z = aeZustand();
    if (art === "laut") {
      z.laut = Math.max(0, Math.min(150, Math.round(Number(v) || 0)));
      if (z.laut > 0) z.stumm = false;
      merken(SPEICHER + "_aelaut", z.laut);
      if (aeDarfOpenWebRx()) {
        aeLetzteExtLaut = z.laut;
        try {
          var sl = document.getElementById("openwebrx-panel-volume");
          if (sl) { sl.value = z.laut; ausloesen(sl, "input"); ausloesen(sl, "change"); }
          if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(z.laut);
        } catch (eAeL) { }
      }
    } else if (art === "sq") {
      z.sq = Math.max(-150, Math.min(0, Math.round(Number(v) || 0)));
      merken(SPEICHER + "_aesq", z.sq);
      if (aeDarfOpenWebRx()) {
        aeLetzteExtSq = z.sq;
        try {
          var ss = document.querySelector(".openwebrx-squelch-slider");
          if (ss && !ss.disabled) { ss.value = z.sq; ausloesen(ss, "input"); ausloesen(ss, "change"); }
        } catch (eAeS) { }
      }
    } else if (art === "rf") {
      z.rf = Math.max(RF_MIN, Math.min(RF_MAX, Number(v) || 0));
      merken(SPEICHER + "_aerf", z.rf);
      rfSetzen(z.rf);
      return aeZustand().rf;
    } else if (art === "rit") {
      return aeRitSetzen(v);
    }
    aeMalen();
    return z[art];
  }
  function aeScanStart() {
    var z = aeZustand();
    if (!z.power) return;
    if (aeScanTimer) { clearTimeout(aeScanTimer); aeScanTimer = null; }
    z.dw = false; z.dwSignal = false;
    z.scan = true; z.boden = null;
    aeScanZaehler = 0;
    aeMeld("Suchlauf ..."); aeMalen(); aeScanSchritt();
  }
  function aeScanStopp(meldung) {
    var z = aeZustand();
    var warAn = z.scan; z.scan = false;
    if (aeScanTimer) { clearTimeout(aeScanTimer); aeScanTimer = null; }
    if (meldung !== undefined || warAn) aeMeld(meldung);
    aeMalen();
  }
  function aeScanSchritt() {
    var z = aeZustand();
    if (!z.scan || !z.power) return;
    var nk = wrapKanal(z.kanal + 1), versuche = 0;
    while (z.skipList && z.skipList.indexOf(nk) >= 0 && versuche < 79) {
      nk = wrapKanal(nk + 1);
      versuche++;
    }
    aeKanalSetzen(nk);
    aeScanTimer = setTimeout(function () {
      var zz = aeZustand();
      if (!zz.scan || !zz.power) return;
      var p = pegelDb();
      if (p === null) { aeScanSchritt(); return; }
      if (zz.boden === null || p < zz.boden) zz.boden = p;
      aeScanZaehler++;
      if (aeScanZaehler >= 3 && p > zz.boden + zustand.rand) {
        var kn = zz.kanal < 10 ? "0" + zz.kanal : String(zz.kanal);
        aeScanStopp("Treffer Kanal " + kn + " (+" + Math.round(p - zz.boden) + " dB)");
        return;
      }
      aeScanSchritt();
    }, 1000);
  }
  function aeDwStart() {
    var z = aeZustand();
    if (!z.power) return;
    if (aeScanTimer) { clearTimeout(aeScanTimer); aeScanTimer = null; }
    z.scan = false; z.dw = true;
    z.dwA = (z.kanal !== z.dwKanal) ? z.kanal : (z.dwKanal > 1 ? z.dwKanal - 1 : 2);
    z.dwZeit = Date.now(); z.dwBoden = null; z.dwSignal = false;
    aeMeld("DW an \u00b7 2. Kanal " + (z.dwKanal < 10 ? "0" + z.dwKanal : String(z.dwKanal)));
    aeMalen();
  }
  function aeDwStopp(meldung) {
    var z = aeZustand();
    if (!z.dw) return;
    z.dw = false; z.dwSignal = false; aeMeld(meldung); aeMalen();
  }
  function aeDwWechsel() {
    var z = aeZustand();
    aeKanalSetzen((z.kanal === z.dwKanal) ? z.dwA : z.dwKanal);
    z.dwZeit = Date.now();
  }
  function aeDwTakt() {
    var z = aeZustand();
    if (!z.dw || z.scan || !z.power) return;
    var p = pegelDb();
    if (p === null) return;
    if (z.dwBoden === null || p < z.dwBoden) z.dwBoden = p;
    else z.dwBoden = Math.min(p, z.dwBoden + 0.03);
    z.dwSignal = (p > z.dwBoden + zustand.rand);
    if (!z.dwSignal && Date.now() - z.dwZeit > 2000) aeDwWechsel();
  }

  var aeLetzteFarbeId = null;
  function aeMalen() {
    var w = el.aeFenster;
    if (!w || !el.aeKanal) return;
    if (w.style.display === "none") return;
    var z = aeZustand();
    var zwei = function (n) { return n < 10 ? "0" + n : String(n); };

    w.classList.toggle("standby", !z.power);
    w.classList.toggle("dim", !!z.dim);

    try {
      var fid = aeFarbeId();
      if (aeLetzteFarbeId !== fid) {
        aeLetzteFarbeId = fid;
        var lf = aeFarbe();
        w.style.setProperty("--ae-lcd", lf);
        w.style.setProperty("--ae-licht-filter", aeFarbeFilter());
        var rgb = hexZuRgb(lf);
        w.style.setProperty("--ae-rgb", rgb.join(","));
        w.style.setProperty("--ae-hell", rgb.map(function (v) { return Math.round(v + (255 - v) * 0.55); }).join(","));
      }
    } catch (e) { }

    /* Externe OpenWebRX-Aenderungen uebernehmen, wenn Funkgeraet 2 allein aktiv ist */
    if (!aeDarfOpenWebRx()) {
      var extB = frequenzLesen();
      if (extB !== null) aeLetzteExtHz = extB;
      try {
        var vB = document.getElementById("openwebrx-panel-volume");
        if (vB && isFinite(parseFloat(vB.value))) aeLetzteExtLaut = Math.round(parseFloat(vB.value));
        var sB = document.querySelector(".openwebrx-squelch-slider");
        if (sB && !sB.disabled && isFinite(parseFloat(sB.value))) aeLetzteExtSq = Math.round(parseFloat(sB.value));
        var dB = document.querySelector(".openwebrx-demodulator-button.highlighted");
        if (dB) {
          var dmB = dB.getAttribute("data-modulation") || "";
          if (MODI.indexOf(dmB) >= 0) aeLetzteExtMode = dmB;
        }
      } catch (eSb) { }
    } else if (zustand.aeOffen && z.power && !z.scan && !z.dw) {
      var nowSync = Date.now();
      var ext = frequenzLesen();
      if (nowSync > aeHzGrace && ext !== null && (aeLetzteExtHz === null || Math.abs(ext - aeLetzteExtHz) > 5)) {
        aeLetzteExtHz = ext;
        z.extHz = ext;
        var ek = frequenzKanal(ext);
        if (ek) {
          z.kanal = ek;
          z.istCb = true;
          merken(SPEICHER + "_aekanal", ek);
        } else {
          z.istCb = false;
        }
      }
      try {
        var volEl = document.getElementById("openwebrx-panel-volume");
        if (volEl && isFinite(parseFloat(volEl.value))) {
          var evVal = Math.round(parseFloat(volEl.value));
          if (aeLetzteExtLaut === null) aeLetzteExtLaut = evVal;
          else if (evVal !== aeLetzteExtLaut) {
            aeLetzteExtLaut = evVal;
            z.laut = Math.max(0, Math.min(150, evVal));
            merken(SPEICHER + "_aelaut", z.laut);
          }
        }
        var sqEl = document.querySelector(".openwebrx-squelch-slider");
        if (sqEl && !sqEl.disabled && isFinite(parseFloat(sqEl.value))) {
          var sqVal = Math.round(parseFloat(sqEl.value));
          if (aeLetzteExtSq === null) aeLetzteExtSq = sqVal;
          else if (sqVal !== aeLetzteExtSq) {
            aeLetzteExtSq = sqVal;
            z.sq = Math.max(-150, Math.min(0, sqVal));
            merken(SPEICHER + "_aesq", z.sq);
          }
        }
        var dmEl = document.querySelector(".openwebrx-demodulator-button.highlighted");
        if (nowSync > aeModeGrace && dmEl) {
          var dmM = dmEl.getAttribute("data-modulation") || "";
          if (MODI.indexOf(dmM) >= 0) {
            if (aeLetzteExtMode === null) aeLetzteExtMode = dmM;
            else if (dmM !== aeLetzteExtMode) {
              aeLetzteExtMode = dmM;
              z.mode = dmM;
              merken(SPEICHER + "_aemode", dmM);
            }
          }
        }
      } catch (eSync) { }
    }

    var kTxt = (z.istCb !== false && z.kanal) ? zwei(z.kanal) : "--";
    var kDisp = (z.eingabePuffer && z.eingabePuffer.length === 1) ? (z.eingabePuffer + "-") : kTxt;
    if (el.aeKanal.textContent !== kTxt) el.aeKanal.textContent = kTxt;
    if (el.aeKanalSeg) segStringSetzen(el.aeKanalSeg, kDisp);

    var hz = (z.istCb === false && z.extHz !== null)
      ? z.extHz
      : (kanalFrequenz(z.kanal) + (z.rit || 0));
    var mhz = (hz / 1e6).toFixed(3);
    var segBox = el.aeFreq.querySelector(".ae-seg");
    if (segBox) segStringSetzen(segBox, mhz);

    var modeAe = MODE_TEXT[z.mode] || String(z.mode || "nfm").toUpperCase();
    if (el.aeMode.textContent !== modeAe) el.aeMode.textContent = modeAe;

    var bandTxt = z.mm ? ("M" + ((z.memIdx || 0) + 1)) : (z.kanal === 9 || z.kanal === 19 ? "EMG" : "C");
    if (el.aeBand && el.aeBand.textContent !== bandTxt) el.aeBand.textContent = bandTxt;
    if (el.aeBeep) el.aeBeep.classList.toggle("an", !!_klickAn);
    if (el.aePwrLbl) el.aePwrLbl.textContent = z.swrAn ? "SWR" : "PWR";

    if (el.aeLeds) {
      el.aeLeds.rx.classList.toggle("an", !!z.power);
      el.aeLeds.ant1.classList.toggle("an", !!z.power && z.ant === 1);
      el.aeLeds.ant2.classList.toggle("an", !!z.power && z.ant === 2);
    }

    var nbAn = afRead("NB"), nrAn = afRead("NR");
    var isSkip = !!(z.skipList && z.skipList.indexOf(z.kanal) >= 0);
    if (el.aeFlags) {
      el.aeFlags.hicut.classList.toggle("an", !!z.hiCut);
      el.aeFlags.anl.classList.toggle("an", !!nrAn);
      el.aeFlags.nb.classList.toggle("an", !!nbAn);
      el.aeFlags.asc.classList.toggle("an", !!z.asc);
      el.aeFlags.dw.classList.toggle("an", !!z.dw);
      el.aeFlags.scan.classList.toggle("an", !!z.scan);
      el.aeFlags.skip.classList.toggle("an", isSkip);
      el.aeFlags.lock.classList.toggle("an", !!z.lock);
    }
    if (el.aeTasten) {
      el.aeTasten.hicut.classList.toggle("an", z.power && !!z.hiCut);
      el.aeTasten.anl.classList.toggle("an", z.power && !!nrAn);
      el.aeTasten.asc.classList.toggle("an", z.power && !!z.asc);
      el.aeTasten.dw.classList.toggle("an", z.power && !!z.dw);
      el.aeTasten.sskip.classList.toggle("an", z.power && (!!z.scan || isSkip));
      el.aeTasten.lock.classList.toggle("an", z.power && !!z.lock);
      el.aeTasten.ant.classList.toggle("an", z.power && z.ant === 2);
      el.aeTasten.rbeep.classList.toggle("an", z.power && !!_klickAn);
      el.aeTasten.mm.classList.toggle("an", z.power && !!z.mm);
      el.aeTasten.nb.classList.toggle("an", z.power && !!nbAn);
      el.aeTasten.swr.classList.toggle("an", z.power && !!z.swrAn);
      el.aeTasten.step.classList.toggle("an", z.power && !!z.step10);
      el.aeTasten.page.classList.toggle("an", z.power && !!z.mm);
    }
    if (!z.power) { try { aeSmZeichnen(0); } catch (eSm0) { } }
    try { if (el.aeDrehMalen) el.aeDrehMalen(); } catch (eZ) { }

    var st;
    if (!z.power) {
      st = "STANDBY \u00b7 AUS";
    } else if (z.scan) {
      st = "SCAN \u00b7 Boden " + (z.boden === null ? "--" : Math.round(z.boden)) + " dB";
    } else if (z.dw) {
      st = "DW " + zwei(z.dwA) + "/" + zwei(z.dwKanal) + (z.dwSignal ? " \u00b7 h\u00f6rt" : " \u00b7 wechselt");
    } else {
      st = "VOL " + z.laut + " \u00b7 SQ " + z.sq + " \u00b7 RF " + (RF_STATE.modus === "auto" ? "AGC" : z.rf) +
           (z.rit ? (" \u00b7 CLR " + (z.rit > 0 ? "+" : "") + (z.rit / 1000).toFixed(1) + "k") : "");
    }
    if (z.power && z.meldung && Date.now() - (z.meldungZeit || 0) < 4000) st = z.meldung;
    if (el.aeStatus.textContent !== st) el.aeStatus.textContent = st;

    try {
      var sV = w.querySelector('[data-m="vol"]'), sS = w.querySelector('[data-m="sq"]');
      var sR = w.querySelector('[data-m="rf"]'),  sC = w.querySelector('[data-m="rit"]');
      if (sV && document.activeElement !== sV) { sV.value = z.laut; el.aeMVol.textContent = z.laut; }
      if (sS && document.activeElement !== sS) { sS.value = z.sq;   el.aeMSq.textContent  = z.sq; }
      if (sR && document.activeElement !== sR) { sR.value = z.rf;   el.aeMRf.textContent  = (RF_STATE.modus === "auto" ? "AGC" : z.rf); }
      if (sC && document.activeElement !== sC) { sC.value = z.rit;  el.aeMRit.textContent = (z.rit > 0 ? "+" : "") + z.rit; }
      var bAmb = w.querySelector('[data-m="amber"]'), bBlau = w.querySelector('[data-m="blau"]');
      if (bAmb)  bAmb.classList.toggle("an", aeFarbeId() === "bernstein");
      if (bBlau) bBlau.classList.toggle("an", aeFarbeId() === "blau");
    } catch (eM) { }
  }

  /* =====================================================================
     Funkgeraet 3: CB-Heimstation (Team Profi 95 Stil, markenfrei)
     (static/plugins/receiver/funkgeraet3_111.png, 1280x476)
     ===================================================================== */
  var KENNUNG3 = "dnx-profi95";
  var SPEICHER3 = "dnx_profi95";
  var BILD3 = "static/plugins/receiver/funkgeraet3_111.png";
  var BILD3_B = 1280, BILD3_H = 476;

  /* Alle gemessenen Pixelpositionen in Prozent von 1280x476 */
  var P3_FELD = {
    ledBay:  [47.344, 10.084, 14.766, 27.101],
    meter:   [62.422, 10.084, 17.109, 27.101],
    segBay:  [79.844, 10.084, 15.938, 27.101],
    plaque:  [62.266, 50.630, 16.953,  7.983],
    rgr:     [46.875, 50.000,  5.156,  9.454],
    nld:     [54.688, 50.000,  5.156,  9.454],
    mic:     [ 3.828, 66.597,  8.594, 21.218],
    phone:   [16.094, 71.429,  5.313, 16.387],
    power:   [25.313, 69.328,  4.844, 17.647],
    volKnob: [37.031, 69.118,  6.094, 16.387],
    sqKnob:  [48.047, 69.118,  6.094, 16.387],
    rfKnob:  [59.141, 69.118,  6.094, 16.387],
    txKnob:  [70.234, 69.118,  6.094, 16.387],
    kMode:   [82.031, 43.277,  5.781,  9.454],
    kTxp:    [90.625, 43.277,  5.781,  9.454],
    kRfg:    [82.031, 55.882,  5.781,  9.874],
    kTone:   [90.625, 55.882,  5.781,  9.874],
    kCh9:    [82.031, 68.697,  5.781, 10.084],
    kScd:    [90.625, 68.697,  5.781, 10.084],
    kUp:     [82.031, 81.723,  5.781, 10.084],
    kDn:     [90.625, 81.723,  5.781, 10.084]
  };
  /* Perfekt zentrierter geriffelter Knopf (Knopf 2, cx=654, cy=368, r=39) */
  var P3_KNOPF = { cx: 654, cy: 368, r: 39 };

  /* Farbdrehungen bezogen auf das originale Smaragd-Gruen (~145 Grad) */
  var P3_LICHT_FILTER = {
    gruen:     "hue-rotate(0deg)",
    tuerkis:   "hue-rotate(38deg) saturate(1.15)",
    blau:      "hue-rotate(85deg) saturate(1.25)",
    violett:   "hue-rotate(138deg) saturate(1.2)",
    rot:       "hue-rotate(215deg) saturate(1.3)",
    orange:    "hue-rotate(248deg) saturate(1.25)",
    bernstein: "hue-rotate(262deg) saturate(1.25)",
    gelb:      "hue-rotate(282deg) saturate(1.15)",
    weiss:     "saturate(0) brightness(1.55)"
  };
  var P3_FARB_REIHE = ["gruen", "tuerkis", "blau", "violett", "rot", "orange", "bernstein", "gelb", "weiss"];
  var P3_METER_FARBEN = [
    { id: "ice",    bg: "radial-gradient(ellipse at 50% 25%, rgba(235,255,250,.55) 0%, rgba(190,242,226,.22) 65%, rgba(120,185,168,.28) 100%)", name: "Eis-Mint" },
    { id: "warm",   bg: "radial-gradient(ellipse at 50% 25%, rgba(255,244,205,.88) 0%, rgba(255,208,120,.62) 70%, rgba(210,145,55,.55) 100%)", name: "Warm-Bernstein" },
    { id: "gruen",  bg: "radial-gradient(ellipse at 50% 25%, rgba(205,255,220,.82) 0%, rgba(110,235,155,.48) 70%, rgba(45,165,92,.45) 100%)", name: "Smaragd" },
    { id: "blau",   bg: "radial-gradient(ellipse at 50% 25%, rgba(205,235,255,.85) 0%, rgba(105,180,255,.52) 70%, rgba(45,115,215,.48) 100%)", name: "Eisblau" },
    { id: "rot",    bg: "radial-gradient(ellipse at 50% 25%, rgba(255,205,205,.78) 0%, rgba(255,95,95,.46) 70%, rgba(185,35,35,.48) 100%)", name: "Nacht-Rot" }
  ];

  function p3FarbeId() { return holenText(SPEICHER3 + "_licht", "gruen"); }
  function p3FarbeHex() { return LCD_FARBEN[p3FarbeId()] || LCD_FARBEN.gruen; }
  function p3FarbeFilter() { return P3_LICHT_FILTER[p3FarbeId()] || P3_LICHT_FILTER.gruen; }
  function p3FarbeWeiter(richtung) {
    var id = p3FarbeId();
    var i = P3_FARB_REIHE.indexOf(id);
    if (i < 0) i = 0;
    var n = P3_FARB_REIHE.length;
    var k = ((i + (richtung || 1)) % n + n) % n;
    var neu = P3_FARB_REIHE[k];
    merken(SPEICHER3 + "_licht", neu);
    p3Meld("Licht " + (k + 1) + "/" + n + ": " + (FARB_NAME[neu] || neu));
    p3Malen();
    return neu;
  }
  function p3MeterWeiter(richtung) {
    var i = Math.round(holen(SPEICHER3 + "_meterlicht", 0));
    var n = P3_METER_FARBEN.length;
    var k = ((i + (richtung || 1)) % n + n) % n;
    merken(SPEICHER3 + "_meterlicht", k);
    p3Meld("Skala: " + P3_METER_FARBEN[k].name);
    p3Malen();
    return k;
  }

  function p3Zeigen(an) {
    var w = document.getElementById(KENNUNG3);
    if (!w) return;
    zustand.p3Offen = !!an;
    merken(SPEICHER3 + "_offen", zustand.p3Offen ? "1" : "0");
    w.style.display = zustand.p3Offen ? "block" : "none";
    knopfTextSetzen();
    if (zustand.p3Offen) {
      try { p3Malen(); } catch (e) { }
      try { if (el.p3GroesseNachziehen) el.p3GroesseNachziehen(); } catch (e2) { }
      try { if (el.p3Klemmen) el.p3Klemmen(); } catch (e3) { }
    }
  }

  var p3Z = null, p3ScanTimer = null, p3ScanZaehler = 0;
  var p3LetzteExtHz = null, p3LetzteExtLaut = null, p3LetzteExtSq = null, p3LetzteExtMode = null;

  function p3Zustand() {
    if (p3Z) return p3Z;
    var defK = (zustand.kanal === 9) ? 19 : 9;
    var k = Math.round(holen(SPEICHER3 + "_kanal", defK));
    if (!(k >= 1 && k <= 80)) k = defK;
    var m = holenText(SPEICHER3 + "_mode", "nfm");
    if (MODI.indexOf(m) < 0) m = "nfm";
    var schw = Math.round(holen(SPEICHER3 + "_schw", 14));
    if (!(schw >= 6 && schw <= 30)) schw = 14;
    var dwK = Math.round(holen(SPEICHER3 + "_dwkanal", 19));
    if (!(dwK >= 1 && dwK <= 80)) dwK = 19;
    var chV9 = Math.round(holen(SPEICHER3 + "_chvor9", k));
    if (!(chV9 >= 1 && chV9 <= 80)) chV9 = k;
    p3Z = {
      kanal: k,
      istCb: true,
      mode: m,
      laut: Math.round(holen(SPEICHER3 + "_laut", zustand.laut)),
      sq: Math.round(holen(SPEICHER3 + "_sq", zustand.sq)),
      rf: holen(SPEICHER3 + "_rf", zustand.rf),
      schw: schw,
      power: true,
      stumm: false,
      stummVorher: null,
      lock: holenText(SPEICHER3 + "_lock", "0") === "1",
      chVor9: chV9,
      scan: false,
      boden: null,
      dw: false,
      dwKanal: dwK,
      dwA: k,
      dwSignal: false,
      dwZeit: 0,
      dwBoden: null,
      extHz: null,
      meldung: "",
      meldungZeit: 0
    };
    return p3Z;
  }

  function p3Meld(text) {
    var z = p3Zustand();
    z.meldung = text || "";
    z.meldungZeit = Date.now();
  }

  function p3KanalSetzen(n, ohneTune) {
    var z = p3Zustand();
    var k = wrapKanal(n);
    z.kanal = k;
    z.istCb = true;
    var hz = kanalFrequenz(k);
    z.extHz = hz;
    merken(SPEICHER3 + "_kanal", k);
    /* v8.22: Funkgeraet 3 strikt von Funkgeraet 1 trennen. OpenWebRX wird nur
       dann direkt gestimmt, wenn Funkgeraet 1 geschlossen ist (!zustand.offen) —
       und selbst dann wird zustand.kanal (Funkgeraet 1) niemals ueberschrieben. */
    if (!zustand.offen && !ohneTune && z.power) {
      frequenzSetzen(hz);
      var nach = frequenzLesen();
      var eff = (nach !== null) ? nach : hz;
      p3LetzteExtHz = eff;
      g2LetzteExtHz = eff;
    }
    p3Malen();
    return k;
  }

  function p3ModeWeiter() {
    var z = p3Zustand();
    var i = MODI.indexOf(z.mode);
    if (i < 0) i = 0;
    var m = MODI[(i + 1) % MODI.length];
    z.mode = m;
    merken(SPEICHER3 + "_mode", m);
    if (!zustand.offen && z.power) {
      p3LetzteExtMode = m;
      modeSetzen(m);
    }
    p3Meld("MODE " + (MODE_TEXT[m] || String(m).toUpperCase()));
    p3Malen();
    return m;
  }

  function p3WertSetzen(art, v) {
    var z = p3Zustand();
    if (art === "laut") {
      var valL = Math.max(0, Math.min(150, Math.round(Number(v) || 0)));
      z.laut = valL;
      if (valL > 0) z.stumm = false;
      merken(SPEICHER3 + "_laut", valL);
      if (!zustand.offen) {
        p3LetzteExtLaut = valL;
        try {
          var sl = document.getElementById("openwebrx-panel-volume");
          if (sl) { sl.value = valL; ausloesen(sl, "input"); ausloesen(sl, "change"); }
          if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(valL);
        } catch (eP3L) { }
      }
    } else if (art === "sq") {
      var valS = Math.max(-150, Math.min(0, Math.round(Number(v) || 0)));
      z.sq = valS;
      merken(SPEICHER3 + "_sq", valS);
      if (!zustand.offen) {
        p3LetzteExtSq = valS;
        try {
          var ss = document.querySelector(".openwebrx-squelch-slider");
          if (ss && !ss.disabled) { ss.value = valS; ausloesen(ss, "input"); ausloesen(ss, "change"); }
        } catch (eP3S) { }
      }
    } else if (art === "rf") {
      var valR = Math.max(RF_MIN, Math.min(RF_MAX, Number(v) || 0));
      z.rf = valR;
      merken(SPEICHER3 + "_rf", valR);
      rfSetzen(valR);
      return p3Zustand().rf;
    } else if (art === "schw") {
      var valT = Math.max(6, Math.min(30, Math.round(Number(v) || 14)));
      z.schw = valT;
      merken(SPEICHER3 + "_schw", valT);
      p3Meld("Schwelle +" + valT + " dB");
    }
    p3Malen();
    return z[art];
  }

  function p3PowerUmschalten(ziel) {
    var z = p3Zustand();
    var neu = (typeof ziel === "boolean") ? ziel : !z.power;
    if (neu === z.power) return z.power;
    z.power = neu;
    if (!neu) {
      p3ScanStopp("");
      p3DwStopp("");
      z.stummVorher = z.laut;
      z.stumm = true;
      if (!zustand.offen) {
        p3LetzteExtLaut = 0;
        try {
          var s = document.getElementById("openwebrx-panel-volume");
          if (s) { s.value = 0; ausloesen(s, "input"); ausloesen(s, "change"); }
          if (typeof UI !== "undefined" && UI.setVolume) UI.setVolume(0);
        } catch (eM0) { }
      }
      p3Meld("STANDBY");
    } else {
      var restore = (typeof z.stummVorher === "number" && z.stummVorher > 0) ? z.stummVorher : (z.laut > 0 ? z.laut : 80);
      z.stummVorher = null;
      z.stumm = false;
      p3WertSetzen("laut", restore);
      p3Meld("BEREIT");
    }
    p3Malen();
    return z.power;
  }

  function p3ScanStart() {
    var z = p3Zustand();
    if (!z.power) return;
    if (p3ScanTimer) { clearTimeout(p3ScanTimer); p3ScanTimer = null; }
    z.dw = false; z.dwSignal = false;
    z.scan = true; z.boden = null;
    p3ScanZaehler = 0;
    p3Meld("Suchlauf ...");
    p3Malen();
    p3ScanSchritt();
  }
  function p3ScanStopp(meldung) {
    var z = p3Zustand();
    var warAn = z.scan;
    z.scan = false;
    if (p3ScanTimer) { clearTimeout(p3ScanTimer); p3ScanTimer = null; }
    if (meldung !== undefined || warAn) p3Meld(meldung);
    p3Malen();
  }
  function p3ScanSchritt() {
    var z = p3Zustand();
    if (!z.scan || !z.power) return;
    p3KanalSetzen(z.kanal + 1);
    p3ScanTimer = setTimeout(function () {
      var zz = p3Zustand();
      if (!zz.scan || !zz.power) return;
      var p = pegelDb();
      if (p === null) { p3ScanSchritt(); return; }
      if (zz.boden === null || p < zz.boden) zz.boden = p;
      p3ScanZaehler++;
      if (p3ScanZaehler >= 3 && p > zz.boden + (zz.schw || 14)) {
        var kn = zz.kanal < 10 ? "0" + zz.kanal : String(zz.kanal);
        p3ScanStopp("Treffer K" + kn + " (+" + Math.round(p - zz.boden) + " dB)");
        return;
      }
      p3ScanSchritt();
    }, 1000);
  }

  function p3DwStart() {
    var z = p3Zustand();
    if (!z.power) return;
    if (p3ScanTimer) { clearTimeout(p3ScanTimer); p3ScanTimer = null; }
    z.scan = false; z.dw = true;
    z.dwA = (z.kanal !== z.dwKanal) ? z.kanal : (z.dwKanal > 1 ? z.dwKanal - 1 : 2);
    z.dwZeit = Date.now(); z.dwBoden = null; z.dwSignal = false;
    p3Meld("DW " + (z.dwA < 10 ? "0" + z.dwA : z.dwA) + "/" + (z.dwKanal < 10 ? "0" + z.dwKanal : z.dwKanal));
    p3Malen();
  }
  function p3DwStopp(meldung) {
    var z = p3Zustand();
    if (!z.dw) return;
    z.dw = false; z.dwSignal = false;
    p3Meld(meldung);
    p3Malen();
  }
  function p3DwWechsel() {
    var z = p3Zustand();
    p3KanalSetzen((z.kanal === z.dwKanal) ? z.dwA : z.dwKanal);
    z.dwZeit = Date.now();
  }
  function p3DwTakt() {
    var z = p3Zustand();
    if (!z.dw || z.scan || !z.power) return;
    var p = pegelDb();
    if (p === null) return;
    if (z.dwBoden === null || p < z.dwBoden) z.dwBoden = p;
    else z.dwBoden = Math.min(p, z.dwBoden + 0.03);
    z.dwSignal = (p > z.dwBoden + (z.schw || 14));
    if (!z.dwSignal && Date.now() - z.dwZeit > 2000) p3DwWechsel();
  }

  function p3NadelZeichnen(rohAnteil) {
    var w = el.p3Fenster;
    if (!w) return;
    var z = p3Zustand();
    var nadel = el.p3Nadel;
    if (!nadel) return;
    var anteil = !z.power ? 0 : ((rohAnteil === null || !isFinite(rohAnteil)) ? 0 : smGlaetten(2, rohAnteil));
    var grad = -43 + Math.max(0, Math.min(1, anteil)) * 86;
    nadel.setAttribute("transform", "rotate(" + grad.toFixed(1) + ", 110, 146)");
  }

  function p3MeterSvgBauen(box) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 220 130");
    svg.setAttribute("preserveAspectRatio", "none");

    function arcPt(r, deg) {
      var radA = deg * Math.PI / 180;
      return [110 + Math.sin(radA) * r, 146 - Math.cos(radA) * r];
    }
    function arcPath(r, a0, a1) {
      var p0 = arcPt(r, a0), p1 = arcPt(r, a1);
      return "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " A" + r + " " + r + " 0 0 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1);
    }
    function addEl(tag, attrs, parent) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(e);
      return e;
    }

    /* Obere S-Skala: schwarz bis S9 (+12 Grad), rot +10..+30dB (+12..+43 Grad) */
    addEl("path", { d: arcPath(100, -43, 12), fill: "none", stroke: "#182126", "stroke-width": "1.7", "stroke-linecap": "round" });
    addEl("path", { d: arcPath(100, 12, 43), fill: "none", stroke: "#cf232a", "stroke-width": "2.4", "stroke-linecap": "round" });
    /* Untere Watt-Skala */
    addEl("path", { d: arcPath(75, -40, 40), fill: "none", stroke: "#3c4a50", "stroke-width": "1.1" });

    var sMarks = [
      { d: -43, l: "0", c: "#182126" },
      { d: -32, l: "1", c: "#182126" },
      { d: -21, l: "3", c: "#182126" },
      { d: -10, l: "5", c: "#182126" },
      { d:   1, l: "7", c: "#182126" },
      { d:  12, l: "9", c: "#182126" },
      { d:  28, l: "+10", c: "#cf232a", sm: 1 },
      { d:  43, l: "+30dB", c: "#cf232a", sm: 1 }
    ];
    for (var si = 0; si < sMarks.length; si++) {
      var m = sMarks[si];
      var pA = arcPt(100, m.d), pB = arcPt(106.5, m.d), pT = arcPt(115.5, m.d);
      addEl("line", { x1: pA[0].toFixed(1), y1: pA[1].toFixed(1), x2: pB[0].toFixed(1), y2: pB[1].toFixed(1), stroke: m.c, "stroke-width": "1.4" });
      var tx = addEl("text", {
        x: pT[0].toFixed(1), y: pT[1].toFixed(1), fill: m.c,
        "font-family": "system-ui,sans-serif", "font-weight": "800",
        "font-size": m.sm ? "8.2" : "9.8", "text-anchor": "middle", "dominant-baseline": "middle"
      });
      tx.textContent = m.l;
    }

    var wMarks = [
      { d: -40, l: "0" }, { d: -24, l: ".5" }, { d: -10, l: "1" },
      { d:   4, l: "2" }, { d:  17, l: "3" }, { d:  29, l: "4" }, { d: 40, l: "5" }
    ];
    for (var wi = 0; wi < wMarks.length; wi++) {
      var wm = wMarks[wi];
      var wA = arcPt(75, wm.d), wB = arcPt(70, wm.d), wT = arcPt(62.5, wm.d);
      addEl("line", { x1: wA[0].toFixed(1), y1: wA[1].toFixed(1), x2: wB[0].toFixed(1), y2: wB[1].toFixed(1), stroke: "#3c4a50", "stroke-width": "1" });
      var wt = addEl("text", {
        x: wT[0].toFixed(1), y: wT[1].toFixed(1), fill: "#2e3b40",
        "font-family": "system-ui,sans-serif", "font-weight": "700",
        "font-size": "8", "text-anchor": "middle", "dominant-baseline": "middle"
      });
      wt.textContent = wm.l;
    }

    var tW = addEl("text", { x: "110", y: "97", fill: "#38464b", "font-family": "system-ui,sans-serif", "font-weight": "800", "font-size": "8", "letter-spacing": "1.2", "text-anchor": "middle" });
    tW.textContent = "WATTS";
    var tP = addEl("text", { x: "110", y: "110", fill: "#1d262b", "font-family": "system-ui,sans-serif", "font-weight": "800", "font-size": "10.5", "letter-spacing": "0.8", "text-anchor": "middle" });
    tP.textContent = "TX POWER";

    /* Drehbare Nadel mit weichem Schatten */
    var nadelG = addEl("g", { id: "p3-meter-nadel-g", transform: "rotate(-43, 110, 146)" });
    addEl("line", { x1: "110", y1: "146", x2: "110", y2: "34", stroke: "rgba(0,0,0,.22)", "stroke-width": "3.2", "stroke-linecap": "round" }, nadelG);
    addEl("line", { x1: "110", y1: "146", x2: "110", y2: "34", stroke: "#14181c", "stroke-width": "1.8", "stroke-linecap": "round" }, nadelG);
    addEl("line", { x1: "110", y1: "54", x2: "110", y2: "34", stroke: "#cf232a", "stroke-width": "2.0", "stroke-linecap": "round" }, nadelG);
    /* Dreh-Kappe unten */
    addEl("circle", { cx: "110", cy: "133", r: "11", fill: "#181d22" });

    box.appendChild(svg);
    return nadelG;
  }

  function bauenProfi95() {
    if (document.getElementById(KENNUNG3)) return;
    var HAND_AUF3 = handCursor("%23d8f6e5", 0);
    var HAND_ZU3 = handCursor("%239ae2bd", 1);

    var css = document.createElement("style");
    css.setAttribute("data-von", KENNUNG3);
    css.textContent = [
      "#" + KENNUNG3 + "{position:fixed !important;left:360px;bottom:44px;z-index:2147483100 !important;",
      " width:560px;font-family:system-ui,sans-serif !important;display:none;overflow:visible !important;user-select:none !important;}",
      "#" + KENNUNG3 + " .p3-kasten{position:relative !important;width:560px !important;transform-origin:top left !important;overflow:visible !important;}",
      "#" + KENNUNG3 + " .p3-geraet{position:relative !important;width:100% !important;isolation:isolate !important;}",
      "#" + KENNUNG3 + " .p3-geraet > img{display:block !important;width:100% !important;height:auto !important;aspect-ratio:1280/476 !important;user-select:none !important;pointer-events:auto !important;",
      " filter:drop-shadow(0 18px 36px rgba(0,0,0,.88)) !important;}",
      /* LED Status-Matrix oben Mitte-Links */
      "#" + KENNUNG3 + " .p3-led-bay{position:absolute !important;z-index:5 !important;display:grid !important;",
      " grid-template-columns:1fr 1fr !important;grid-template-rows:repeat(4,1fr) !important;",
      " padding:calc(7px * var(--p3-skala,1)) calc(8px * var(--p3-skala,1)) !important;box-sizing:border-box !important;",
      " gap:calc(2px * var(--p3-skala,1)) calc(6px * var(--p3-skala,1)) !important;pointer-events:none !important;}",
      "#" + KENNUNG3 + " .p3-led-item{display:flex !important;align-items:center !important;gap:calc(4px * var(--p3-skala,1)) !important;min-width:0 !important;}",
      "#" + KENNUNG3 + " .p3-led-dot{width:calc(12px * var(--p3-skala,1)) !important;height:calc(4.2px * var(--p3-skala,1)) !important;",
      " border-radius:1px !important;background:rgba(48,54,58,.45) !important;box-shadow:inset 0 0 1px rgba(0,0,0,.9) !important;flex:0 0 auto !important;transition:all .12s !important;}",
      "#" + KENNUNG3 + " .p3-led-lbl{font:800 calc(7.5px * var(--p3-skala,1))/1 system-ui !important;letter-spacing:.06em !important;",
      " color:rgba(218,228,236,.72) !important;text-shadow:0 1px 1px #000 !important;white-space:nowrap !important;}",
      "#" + KENNUNG3 + " .p3-led-item.an-rot .p3-led-dot{background:#ff3b6b !important;box-shadow:0 0 7px #ff3b6b,0 0 2px #fff !important;}",
      "#" + KENNUNG3 + " .p3-led-item.an-gruen .p3-led-dot{background:#34e86a !important;box-shadow:0 0 7px #34e86a,0 0 2px #d8ffe4 !important;}",
      "#" + KENNUNG3 + " .p3-led-item.an-amber .p3-led-dot{background:#ffb020 !important;box-shadow:0 0 7px #ffb020,0 0 2px #fff2cc !important;}",
      "#" + KENNUNG3 + " .p3-led-item.an-cyan .p3-led-dot{background:#38e4ff !important;box-shadow:0 0 7px #38e4ff,0 0 2px #e5fbff !important;}",
      "#" + KENNUNG3 + " .p3-led-item.an-rot .p3-led-lbl,#" + KENNUNG3 + " .p3-led-item.an-gruen .p3-led-lbl,",
      "#" + KENNUNG3 + " .p3-led-item.an-amber .p3-led-lbl,#" + KENNUNG3 + " .p3-led-item.an-cyan .p3-led-lbl{color:#ffffff !important;}",
      "#" + KENNUNG3 + ".standby .p3-led-item .p3-led-dot{background:rgba(32,36,40,.45) !important;box-shadow:none !important;}",
      "#" + KENNUNG3 + ".standby .p3-led-item .p3-led-lbl{color:rgba(150,160,170,.35) !important;}",
      /* Analoges S-Meter Fenster */
      "#" + KENNUNG3 + " .p3-meter{position:absolute !important;z-index:5 !important;cursor:pointer !important;overflow:hidden !important;",
      " border-radius:2px !important;box-shadow:inset 0 2px 8px rgba(0,0,0,.45) !important;transition:filter .2s !important;}",
      "#" + KENNUNG3 + " .p3-meter-licht{position:absolute !important;inset:0 !important;pointer-events:none !important;transition:background .25s,opacity .25s !important;}",
      "#" + KENNUNG3 + " .p3-meter svg{position:relative !important;z-index:2 !important;width:100% !important;height:100% !important;display:block !important;}",
      "#" + KENNUNG3 + " .p3-meter::after{content:'' !important;position:absolute !important;inset:0 !important;z-index:3 !important;pointer-events:none !important;",
      " background:linear-gradient(135deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,.04) 36%,transparent 40%) !important;}",
      "#" + KENNUNG3 + ".standby .p3-meter{filter:brightness(.22) saturate(.25) !important;}",
      /* Rote 7-Segment Kanalanzeige rechts */
      "#" + KENNUNG3 + " .p3-seg-bay{position:absolute !important;z-index:5 !important;display:flex !important;align-items:center !important;",
      " justify-content:center !important;overflow:hidden !important;pointer-events:none !important;}",
      "#" + KENNUNG3 + " .p3-seg-bay::after{content:'' !important;position:absolute !important;inset:0 !important;",
      " background:linear-gradient(135deg,rgba(255,255,255,.11) 0%,transparent 38%) !important;}",
      "#" + KENNUNG3 + " .p3-seg-flags{position:absolute !important;left:calc(5px * var(--p3-skala,1)) !important;top:calc(5px * var(--p3-skala,1)) !important;",
      " display:flex !important;flex-direction:column !important;gap:calc(2px * var(--p3-skala,1)) !important;}",
      "#" + KENNUNG3 + " .p3-seg-flg{font:800 calc(6.2px * var(--p3-skala,1))/1 system-ui !important;letter-spacing:.06em !important;",
      " color:rgba(255,48,92,.2) !important;}",
      "#" + KENNUNG3 + " .p3-seg-flg.an{color:#ff4575 !important;text-shadow:0 0 6px rgba(255,45,95,.9) !important;}",
      "#" + KENNUNG3 + " .p3-seg{display:flex !important;align-items:center !important;gap:calc(6px * var(--p3-skala,1)) !important;",
      " transform:skewX(-6deg) !important;margin-left:calc(20px * var(--p3-skala,1)) !important;}",
      "#" + KENNUNG3 + " .p3-seg .z{position:relative !important;display:block !important;width:calc(24px * var(--p3-skala,1)) !important;",
      " height:calc(44px * var(--p3-skala,1)) !important;flex:0 0 auto !important;}",
      "#" + KENNUNG3 + " .p3-seg .z i{position:absolute !important;display:block !important;background:rgba(130,18,34,.14) !important;border-radius:1.5px !important;}",
      "#" + KENNUNG3 + " .p3-seg .z i.on{background:#ff2e63 !important;box-shadow:0 0 7px rgba(255,40,90,.88),0 0 2px #ff9eb5 !important;}",
      "#" + KENNUNG3 + ".standby .p3-seg .z i.on{background:rgba(130,18,34,.14) !important;box-shadow:none !important;}",
      "#" + KENNUNG3 + ".standby .p3-seg-flg.an{color:rgba(255,48,92,.14) !important;text-shadow:none !important;}",
      "#" + KENNUNG3 + " .p3-seg .z i.a{top:0;left:calc(3.6px * var(--p3-skala,1));right:calc(3.6px * var(--p3-skala,1));height:calc(4.5px * var(--p3-skala,1));}",
      "#" + KENNUNG3 + " .p3-seg .z i.d{bottom:0;left:calc(3.6px * var(--p3-skala,1));right:calc(3.6px * var(--p3-skala,1));height:calc(4.5px * var(--p3-skala,1));}",
      "#" + KENNUNG3 + " .p3-seg .z i.g{top:calc(19.75px * var(--p3-skala,1));left:calc(3.6px * var(--p3-skala,1));right:calc(3.6px * var(--p3-skala,1));height:calc(4.5px * var(--p3-skala,1));}",
      "#" + KENNUNG3 + " .p3-seg .z i.f{top:calc(3.8px * var(--p3-skala,1));left:0;width:calc(4.5px * var(--p3-skala,1));height:calc(15.4px * var(--p3-skala,1));}",
      "#" + KENNUNG3 + " .p3-seg .z i.b{top:calc(3.8px * var(--p3-skala,1));right:0;width:calc(4.5px * var(--p3-skala,1));height:calc(15.4px * var(--p3-skala,1));}",
      "#" + KENNUNG3 + " .p3-seg .z i.e{bottom:calc(3.8px * var(--p3-skala,1));left:0;width:calc(4.5px * var(--p3-skala,1));height:calc(15.4px * var(--p3-skala,1));}",
      "#" + KENNUNG3 + " .p3-seg .z i.c{bottom:calc(3.8px * var(--p3-skala,1));right:0;width:calc(4.5px * var(--p3-skala,1));height:calc(15.4px * var(--p3-skala,1));}",
      /* Markenfreie Frequenz-Plakette unter dem S-Meter + Statuszeile direkt darunter */
      "#" + KENNUNG3 + " .p3-plaque{position:absolute !important;z-index:5 !important;display:flex !important;align-items:center !important;",
      " justify-content:center !important;overflow:hidden !important;pointer-events:none !important;",
      " padding:calc(2px * var(--p3-skala,1)) calc(5px * var(--p3-skala,1)) !important;box-sizing:border-box !important;}",
      "#" + KENNUNG3 + " .p3-plaque-top{display:flex !important;align-items:baseline !important;justify-content:center !important;gap:calc(4px * var(--p3-skala,1)) !important;}",
      "#" + KENNUNG3 + " .p3-d-freq{font:800 calc(11px * var(--p3-skala,1))/1 'Courier New',monospace !important;",
      " color:#d9fff0 !important;text-shadow:0 0 6px rgba(105,255,180,.45) !important;letter-spacing:.03em !important;}",
      "#" + KENNUNG3 + " .p3-plaque-mhz{font:700 calc(7.2px * var(--p3-skala,1))/1 system-ui !important;color:#9ed0ba !important;}",
      "#" + KENNUNG3 + " .p3-d-mode{font:900 calc(7.5px * var(--p3-skala,1))/1 system-ui !important;padding:calc(1.5px * var(--p3-skala,1)) calc(4px * var(--p3-skala,1)) !important;",
      " border-radius:2px !important;background:rgba(52,232,106,.2) !important;color:#8dffb0 !important;border:1px solid rgba(52,232,106,.45) !important;}",
      "#" + KENNUNG3 + " .p3-d-status{position:absolute !important;z-index:5 !important;left:61.2% !important;top:59.7% !important;width:19.0% !important;",
      " text-align:center !important;font:700 calc(6.8px * var(--p3-skala,1))/1.1 'Courier New',monospace !important;color:#a5b8c7 !important;",
      " text-shadow:0 1px 2px #000 !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;pointer-events:none !important;}",
      "#" + KENNUNG3 + ".standby .p3-plaque,#" + KENNUNG3 + ".standby .p3-d-status{opacity:.22 !important;}",
      /* Tasten & Klickflaechen */
      "#" + KENNUNG3 + " .p3-taste{position:absolute !important;z-index:6 !important;border-radius:3px !important;",
      " background:transparent !important;border:none !important;padding:0 !important;cursor:pointer !important;",
      " display:flex !important;flex-direction:column !important;align-items:center !important;justify-content:center !important;",
      " backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) !important;-webkit-backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) !important;",
      " color:#e8f4ee !important;font:800 calc(8.5px * var(--p3-skala,1))/1.05 system-ui !important;letter-spacing:.06em !important;",
      " text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.9) !important;transition:filter .09s !important;}",
      "#" + KENNUNG3 + " .p3-taste:hover{filter:brightness(1.25) !important;",
      " backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) brightness(1.2) !important;-webkit-backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) brightness(1.2) !important;}",
      "#" + KENNUNG3 + " .p3-taste:active{transform:translateY(1px) !important;filter:brightness(1.45) !important;",
      " backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) brightness(1.38) !important;-webkit-backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) brightness(1.38) !important;}",
      "#" + KENNUNG3 + " .p3-taste.an{box-shadow:inset 0 0 0 1.4px rgba(135,255,180,.92),inset 0 0 10px rgba(45,235,120,.38) !important;",
      " color:#ffffff !important;text-shadow:0 0 8px rgba(85,255,155,.9),0 1px 2px #000 !important;}",
      "#" + KENNUNG3 + ".standby .p3-halo,#" + KENNUNG3 + ".standby .p3-taste{",
      " backdrop-filter:brightness(.34) saturate(.3) !important;-webkit-backdrop-filter:brightness(.34) saturate(.3) !important;}",
      "#" + KENNUNG3 + ".standby .p3-taste{color:rgba(200,212,206,.34) !important;box-shadow:none !important;text-shadow:none !important;}",
      "#" + KENNUNG3 + " .p3-taste.hell{color:#121a16 !important;text-shadow:0 1px 0 rgba(255,255,255,.5) !important;font-weight:900 !important;}",
      "#" + KENNUNG3 + " .p3-taste.hell .p3-tri{font-size:calc(8.5px * var(--p3-skala,1)) !important;line-height:1 !important;margin-bottom:calc(1px * var(--p3-skala,1)) !important;}",
      "#" + KENNUNG3 + " .p3-fmam{display:flex !important;flex-direction:column !important;align-items:center !important;line-height:0.95 !important;font-size:calc(7.5px * var(--p3-skala,1)) !important;}",
      "#" + KENNUNG3 + " .p3-fmam i{font-style:normal !important;opacity:.75 !important;font-size:calc(6px * var(--p3-skala,1)) !important;}",
      /* Power Kippschalter & Buchsen */
      "#" + KENNUNG3 + " .p3-power{position:absolute !important;z-index:6 !important;border:none !important;background:transparent !important;",
      " border-radius:3px !important;cursor:pointer !important;padding:0 !important;transition:filter .15s !important;}",
      "#" + KENNUNG3 + ".standby .p3-power{backdrop-filter:brightness(.36) saturate(.45) !important;-webkit-backdrop-filter:brightness(.36) saturate(.45) !important;}",
      "#" + KENNUNG3 + " .p3-jack{position:absolute !important;z-index:5 !important;border:none !important;background:transparent !important;",
      " border-radius:50% !important;cursor:pointer !important;padding:0 !important;}",
      /* Drehregler */
      "#" + KENNUNG3 + " .p3-dreh-cv{position:absolute !important;z-index:6 !important;border-radius:50% !important;",
      " touch-action:none !important;cursor:" + HAND_AUF3 + " !important;}",
      "#" + KENNUNG3 + " .p3-dreh-cv.greift{cursor:" + HAND_ZU3 + " !important;}",
      "#" + KENNUNG3 + " .p3-halo{position:absolute !important;border-radius:50% !important;pointer-events:none !important;z-index:3 !important;",
      " backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) !important;-webkit-backdrop-filter:var(--p3-licht-filter,hue-rotate(0deg)) !important;}",
      /* Gehaeuse-Beschriftung */
      "#" + KENNUNG3 + " .p3-lbl{position:absolute !important;z-index:5 !important;pointer-events:none !important;text-align:center !important;",
      " font:700 calc(7.4px * var(--p3-skala,1))/1 system-ui !important;letter-spacing:.09em !important;",
      " color:#cfd8e3 !important;text-shadow:0 1px 2px #000 !important;white-space:nowrap !important;}",
      "#" + KENNUNG3 + " .p3-lbl.sm{font-size:calc(6.8px * var(--p3-skala,1)) !important;text-align:left !important;}",
      /* Bediengriffe & Ecken + Menue (identisches Bedienkonzept wie Geraet 2) */
      "#" + KENNUNG3 + " .p3-griff{position:absolute !important;z-index:20 !important;opacity:.38 !important;transition:opacity .15s linear !important;}",
      "#" + KENNUNG3 + ":hover .p3-griff{opacity:.85 !important;}#" + KENNUNG3 + " .p3-griff:hover{opacity:1 !important;}",
      "#" + KENNUNG3 + " .p3-menu{position:absolute !important;left:22px !important;top:4px !important;z-index:22 !important;",
      " width:22px !important;height:18px !important;padding:0 !important;border-radius:4px !important;cursor:pointer !important;",
      " background:rgba(12,15,20,.84) !important;color:#8dffb8 !important;border:1px solid rgba(52,232,106,.55) !important;font:11px/16px system-ui !important;}",
      "#" + KENNUNG3 + " .p3-wechsel{position:absolute !important;top:4px !important;z-index:22 !important;",
      " height:18px !important;padding:0 6px !important;border-radius:4px !important;cursor:pointer !important;",
      " background:rgba(12,15,20,.84) !important;color:#e2e8f0 !important;border:1px solid rgba(255,255,255,.32) !important;font:700 10.5px/16px system-ui !important;}",
      "#" + KENNUNG3 + " .p3-w1{right:86px !important;}#" + KENNUNG3 + " .p3-w2{right:46px !important;}",
      "#" + KENNUNG3 + " .p3-zu{position:absolute !important;right:22px !important;top:4px !important;z-index:22 !important;",
      " width:20px !important;height:18px !important;padding:0 !important;border-radius:4px !important;cursor:pointer !important;",
      " background:rgba(12,15,20,.84) !important;color:#e2e8f0 !important;border:1px solid rgba(255,255,255,.32) !important;font:700 12.5px/16px system-ui !important;}",
      "#" + KENNUNG3 + " .p3-zieh{left:50% !important;bottom:3px !important;margin-left:-24px !important;width:48px !important;height:13px !important;z-index:22 !important;",
      " border-radius:7px !important;cursor:move !important;background:rgba(10,12,16,.72) !important;border:1px solid rgba(255,255,255,.28) !important;",
      " display:flex !important;align-items:center !important;justify-content:center !important;gap:3px !important;}",
      "#" + KENNUNG3 + " .p3-zieh i{display:block !important;width:3px !important;height:3px !important;border-radius:50% !important;background:#e2e8f0 !important;}",
      "#" + KENNUNG3 + " .p3-eck{width:14px !important;height:14px !important;z-index:20 !important;}",
      "#" + KENNUNG3 + " .p3-eck.br{right:2px !important;bottom:2px !important;cursor:nwse-resize !important;border-right:3px solid #8dffb8 !important;border-bottom:3px solid #8dffb8 !important;}",
      "#" + KENNUNG3 + " .p3-eck.bl{left:2px !important;bottom:2px !important;cursor:nesw-resize !important;border-left:3px solid #8dffb8 !important;border-bottom:3px solid #8dffb8 !important;}",
      "#" + KENNUNG3 + " .p3-eck.tr{right:2px !important;top:2px !important;cursor:nesw-resize !important;border-right:3px solid #8dffb8 !important;border-top:3px solid #8dffb8 !important;}",
      "#" + KENNUNG3 + " .p3-eck.tl{left:2px !important;top:2px !important;cursor:nwse-resize !important;border-left:3px solid #8dffb8 !important;border-top:3px solid #8dffb8 !important;}",
      "#" + KENNUNG3 + " .p3-menue{position:absolute !important;left:10px !important;bottom:calc(100% + 6px) !important;top:auto !important;z-index:30 !important;",
      " width:268px !important;max-height:calc(100vh - 24px) !important;overflow-y:auto !important;padding:10px 11px !important;border-radius:9px !important;display:none;",
      " background:linear-gradient(180deg,#20272c,#13171b) !important;border:1px solid #495763 !important;box-shadow:0 12px 28px rgba(0,0,0,.84) !important;}",
      "#" + KENNUNG3 + " .p3-menue.menue-unten{top:calc(100% + 6px) !important;bottom:auto !important;}",
      "#" + KENNUNG3 + " .p3-menue.menue-rechts{left:auto !important;right:10px !important;}",
      "#" + KENNUNG3 + " .p3-menue.offen{display:block !important;}",
      "#" + KENNUNG3 + " .p3-m-zeile{display:flex !important;align-items:center !important;gap:7px !important;margin:6px 0 !important;font:11px/1.2 system-ui !important;color:#dfe6ee !important;}",
      "#" + KENNUNG3 + " .p3-m-zeile label{width:78px !important;opacity:.85 !important;}",
      "#" + KENNUNG3 + " .p3-m-zeile input[type=range]{flex:1 1 auto;min-width:0;}",
      "#" + KENNUNG3 + " .p3-m-zeile b{width:38px !important;text-align:right !important;font-weight:700 !important;color:#8dffb8 !important;}",
      "#" + KENNUNG3 + " .p3-m-knopf{width:100% !important;margin-top:6px !important;height:25px !important;border-radius:6px !important;cursor:pointer !important;",
      " background:#263038 !important;color:#e9eef4 !important;border:1px solid #475561 !important;font:11px/23px system-ui !important;}",
      "#" + KENNUNG3 + " .p3-m-knopf.an{background:rgba(52,232,106,.28) !important;border-color:#74ff9e !important;color:#fff !important;}",
      "#" + KENNUNG3 + " .p3-m-titel{font:800 11px/1 system-ui !important;letter-spacing:.08em !important;color:#8dffb8 !important;margin-bottom:7px !important;}"
    ].join("\n");
    document.head.appendChild(css);

    function pctCss(f) {
      return "left:" + f[0] + "%;top:" + f[1] + "%;width:" + f[2] + "%;height:" + f[3] + "%;";
    }
    function knobHaloCss(f) {
      return "left:" + (f[0] - 0.7) + "%;top:" + (f[1] - 1.9) + "%;width:" + (f[2] + 1.4) + "%;height:" + (f[3] + 3.8) + "%;";
    }

    var w = document.createElement("div");
    w.id = KENNUNG3;
    w.innerHTML = [
      '<div class="p3-kasten">',
      '  <div class="p3-geraet">',
      '    <img src="' + BILD3 + '?v=' + Date.now() + '" alt="Funkgerät 3" draggable="false">',
      '    <div class="p3-halo" style="' + knobHaloCss(P3_FELD.volKnob) + '"></div>',
      '    <div class="p3-halo" style="' + knobHaloCss(P3_FELD.sqKnob)  + '"></div>',
      '    <div class="p3-halo" style="' + knobHaloCss(P3_FELD.rfKnob)  + '"></div>',
      '    <div class="p3-halo" style="' + knobHaloCss(P3_FELD.txKnob)  + '"></div>',
      '    <div class="p3-led-bay" style="' + pctCss(P3_FELD.ledBay) + '">',
      '      <div class="p3-led-item" data-led="fm"><i class="p3-led-dot"></i><span class="p3-led-lbl">FM</span></div>',
      '      <div class="p3-led-item" data-led="tx"><i class="p3-led-dot"></i><span class="p3-led-lbl">TX</span></div>',
      '      <div class="p3-led-item" data-led="rgr"><i class="p3-led-dot"></i><span class="p3-led-lbl">RGR</span></div>',
      '      <div class="p3-led-item" data-led="txp"><i class="p3-led-dot"></i><span class="p3-led-lbl">TXP</span></div>',
      '      <div class="p3-led-item" data-led="nlp"><i class="p3-led-dot"></i><span class="p3-led-lbl">NLP</span></div>',
      '      <div class="p3-led-item" data-led="tone"><i class="p3-led-dot"></i><span class="p3-led-lbl">TONE</span></div>',
      '      <div class="p3-led-item" data-led="rfg"><i class="p3-led-dot"></i><span class="p3-led-lbl">RFG</span></div>',
      '      <div class="p3-led-item" data-led="lock"><i class="p3-led-dot"></i><span class="p3-led-lbl">LOCK</span></div>',
      '    </div>',
      '    <div class="p3-meter" style="' + pctCss(P3_FELD.meter) + '" title="S-Meter – Klick wechselt Skalenbeleuchtung">',
      '      <div class="p3-meter-licht"></div>',
      '    </div>',
      '    <div class="p3-seg-bay" style="' + pctCss(P3_FELD.segBay) + '">',
      '      <div class="p3-seg-flags">',
      '        <span class="p3-seg-flg" data-flg="scan">SCAN</span>',
      '        <span class="p3-seg-flg" data-flg="dw">DW</span>',
      '      </div>',
      '      <div class="p3-d-kanal" style="display:none">09</div>',
      '      <span class="p3-seg" data-wert=""></span>',
      '    </div>',
      '    <div class="p3-plaque" style="' + pctCss(P3_FELD.plaque) + '">',
      '      <div class="p3-plaque-top"><span class="p3-d-freq">27,065</span><span class="p3-plaque-mhz">MHz</span><span class="p3-d-mode">FM</span></div>',
      '    </div>',
      '    <div class="p3-d-status">bereit</div>',
      '    <button class="p3-taste" data-f="rgr"  style="' + pctCss(P3_FELD.rgr)   + '" title="RGR – Roger-Beep / Bedienklicks ein/aus">RGR</button>',
      '    <button class="p3-taste" data-f="nld"  style="' + pctCss(P3_FELD.nld)   + '" title="NLD – Noise Blanker (NB) ein/aus">NLD</button>',
      '    <button class="p3-taste" data-f="mode" style="' + pctCss(P3_FELD.kMode) + '" title="FM/AM – Betriebsart FM / AM / LSB / USB"><span class="p3-fmam"><span>FM</span><i>/</i><span>AM</span></span></button>',
      '    <button class="p3-taste" data-f="txp"  style="' + pctCss(P3_FELD.kTxp)  + '" title="TXP – Zweikanal-Überwachung (DW) ein/aus">TXP</button>',
      '    <button class="p3-taste" data-f="rfg"  style="' + pctCss(P3_FELD.kRfg)  + '" title="RFG – RF-Gain Schnellwahl (15 / 30 / 45 / 0 dB)">RFG</button>',
      '    <button class="p3-taste" data-f="tone" style="' + pctCss(P3_FELD.kTone) + '" title="TONE – Tastenbeleuchtung weiterschalten">TONE</button>',
      '    <button class="p3-taste" data-f="ch9"  style="' + pctCss(P3_FELD.kCh9)  + '" title="CH9 – Direkt Kanal 9 / Rücksprung">CH9</button>',
      '    <button class="p3-taste" data-f="scd"  style="' + pctCss(P3_FELD.kScd)  + '" title="SCD – Suchlauf (lang = DW, Mausrad = 2. Kanal)">SCD</button>',
      '    <button class="p3-taste hell" data-f="up" style="' + pctCss(P3_FELD.kUp) + '" title="UP – Kanal auf"><span class="p3-tri">&#9650;</span><span>UP</span></button>',
      '    <button class="p3-taste hell" data-f="dn" style="' + pctCss(P3_FELD.kDn) + '" title="DN – Kanal ab"><span class="p3-tri">&#9660;</span><span>DN</span></button>',
      '    <button class="p3-jack"  data-f="mic"   style="' + pctCss(P3_FELD.mic)   + '" title="MICROPHONE – 4-Pol CB-Mikrofonbuchse (Empfangsbetrieb)"></button>',
      '    <button class="p3-jack"  data-f="phone" style="' + pctCss(P3_FELD.phone) + '" title="HEADPHONE – Kopfhörer (Klick = Stumm/Ton an)"></button>',
      '    <button class="p3-power" data-f="power" style="' + pctCss(P3_FELD.power) + '" title="POWER – Gerät Ein / Standby"></button>',
      '    <canvas class="p3-dreh-cv" data-k="laut" style="' + pctCss(P3_FELD.volKnob) + '" title="VOLUME – Lautstärke drehen"></canvas>',
      '    <canvas class="p3-dreh-cv" data-k="sq"   style="' + pctCss(P3_FELD.sqKnob)  + '" title="SQUELCH – Rauschsperre drehen"></canvas>',
      '    <canvas class="p3-dreh-cv" data-k="rf"   style="' + pctCss(P3_FELD.rfKnob)  + '" title="RF-GAIN – Empfangsverstärkung 0–49 dB"></canvas>',
      '    <canvas class="p3-dreh-cv" data-k="schw" style="' + pctCss(P3_FELD.txKnob)  + '" title="TX PWR – Suchlauf-Schwelle (+6..+30 dB)"></canvas>',
      '    <div class="p3-lbl" style="left:3.1%;top:61.6%;width:10.0%">MICROPHONE</div>',
      '    <div class="p3-lbl" style="left:14.1%;top:61.6%;width:9.4%">HEADPHONE</div>',
      '    <div class="p3-lbl" style="left:24.6%;top:61.6%;width:6.2%">POWER</div>',
      '    <div class="p3-lbl sm" style="left:30.6%;top:71.2%;width:3.5%">ON</div>',
      '    <div class="p3-lbl sm" style="left:30.6%;top:82.2%;width:3.5%">OFF</div>',
      '    <div class="p3-lbl" style="left:35.8%;top:88.4%;width:8.5%">VOLUME</div>',
      '    <div class="p3-lbl" style="left:46.8%;top:88.4%;width:8.5%">SQUELCH</div>',
      '    <div class="p3-lbl" style="left:57.9%;top:88.4%;width:8.5%">RF-GAIN</div>',
      '    <div class="p3-lbl" style="left:69.0%;top:88.4%;width:8.5%">TX PWR</div>',
      '  </div>',
      '</div>',
      '<button class="p3-griff p3-menu" title="Menü – Einstellungen">\u2630</button>',
      '<button class="p3-griff p3-wechsel p3-w1" title="Zu Funkgerät 1">\u21c4 1</button>',
      '<button class="p3-griff p3-wechsel p3-w2" title="Zu Funkgerät 2">\u21c4 2</button>',
      '<button class="p3-griff p3-zu" title="Schließen">\u00d7</button>',
      '<div class="p3-griff p3-zieh" title="Gerät verschieben (ziehen)"><i></i><i></i><i></i></div>',
      '<div class="p3-menue">',
      '  <div class="p3-m-titel">EINSTELLUNGEN · FUNKGERÄT 3</div>',
      '  <div class="p3-m-zeile"><label>Tastenlicht</label><button class="p3-m-knopf" data-m="farbe" style="margin:0">Farbe wechseln</button></div>',
      '  <div class="p3-m-zeile"><label>Skalenlicht</label><button class="p3-m-knopf" data-m="meter" style="margin:0">Skala wechseln</button></div>',
      '  <div class="p3-m-zeile"><label>Lautstärke</label><input type="range" data-m="vol" min="0" max="150" step="1"><b class="p3-m-vol">--</b></div>',
      '  <div class="p3-m-zeile"><label>Squelch</label><input type="range" data-m="sq" min="-150" max="0" step="1"><b class="p3-m-sq">--</b></div>',
      '  <div class="p3-m-zeile"><label>RF-Gain</label><input type="range" data-m="rf" min="0" max="49" step="1"><b class="p3-m-rf">--</b></div>',
      '  <div class="p3-m-zeile"><label>Schwelle</label><input type="range" data-m="schw" min="6" max="30" step="1"><b class="p3-m-schw">--</b></div>',
      '  <div class="p3-m-zeile"><label>Rauschfilter</label><button class="p3-m-knopf" data-m="nb" style="margin:0;flex:1">NB</button><button class="p3-m-knopf" data-m="nr" style="margin:0;flex:1">NR</button></div>',
      '  <div class="p3-m-zeile"><label>Schutz</label><button class="p3-m-knopf" data-m="lock" style="margin:0">LOCK: AUS</button></div>',
      '  <div class="p3-m-zeile"><label>Bedienklicks</label><button class="p3-m-knopf" data-m="klicks" style="margin:0">Klick-Ton: EIN</button></div>',
      '  <button class="p3-m-knopf" data-m="w1">\u21c4 Zu Funkgerät 1</button>',
      '  <button class="p3-m-knopf" data-m="w2">\u21c4 Zu Funkgerät 2</button>',
      '</div>'
    ].join("\n");
    document.body.appendChild(w);

    var q = function (sel) { return w.querySelector(sel); };
    var p3Bild = q(".p3-geraet img");
    var menue = q(".p3-menue");
    var nadelG = p3MeterSvgBauen(q(".p3-meter"));

    /* Geriffelten Fotoknopf (aus Knopf 2 cx=654, cy=368, r=38) einmal schneiden */
    var p3Seite = Math.round(P3_KNOPF.r * 2 * 1.4);
    var p3Stempel = null, p3BildVersuche = 0;
    function p3Ausschnitt() {
      if (p3Stempel) return p3Stempel;
      if (!p3Bild || !p3Bild.naturalWidth || !p3Bild.complete) return null;
      try {
        var f = p3Bild.naturalWidth / BILD3_B;
        var s = document.createElement("canvas");
        s.width = p3Seite; s.height = p3Seite;
        var sc = s.getContext("2d");
        sc.drawImage(p3Bild,
          (P3_KNOPF.cx - P3_KNOPF.r) * f, (P3_KNOPF.cy - P3_KNOPF.r) * f,
          P3_KNOPF.r * 2 * f, P3_KNOPF.r * 2 * f,
          0, 0, p3Seite, p3Seite);
        var d = sc.getImageData(0, 0, p3Seite, p3Seite).data;
        var ok = 0;
        for (var i = 3; i < d.length; i += 4 * 31) { if (d[i] > 16) { ok++; if (ok > 4) break; } }
        if (ok <= 4) return null;
        p3Stempel = s;
      } catch (e) { p3Stempel = null; }
      return p3Stempel;
    }

    var p3Regler = [
      { art: "laut", von: 0,      bis: 150,    holen: function () { return p3Zustand().laut; }, set: function (v) { p3WertSetzen("laut", v); } },
      { art: "sq",   von: -150,   bis: 0,      holen: function () { return p3Zustand().sq; },   set: function (v) { p3WertSetzen("sq", v); } },
      { art: "rf",   von: RF_MIN, bis: RF_MAX, holen: function () { return p3Zustand().rf; },   set: function (v) { p3WertSetzen("rf", v); } },
      { art: "schw", von: 6,      bis: 30,     holen: function () { return p3Zustand().schw; }, set: function (v) { p3WertSetzen("schw", v); } }
    ];

    function p3DrehAlleMalen() {
      var s = p3Ausschnitt();
      var hatS = !!s;
      for (var i = 0; i < p3Regler.length; i++) {
        var reg = p3Regler[i];
        var cv = reg.cv;
        if (!cv) continue;
        var ctx = reg.ctx;
        var anteil = Math.max(0, Math.min(1, (reg.holen() - reg.von) / ((reg.bis - reg.von) || 1)));
        var grad = -140 + anteil * 280;
        var gradR = Math.round(grad * 10) / 10;
        if (reg._cGrad === gradR && reg._cStem === hatS) continue;
        reg._cGrad = gradR;
        reg._cStem = hatS;
        ctx.clearRect(0, 0, p3Seite, p3Seite);
        if (!s) {
          var R0 = p3Seite / 2;
          ctx.save();
          ctx.translate(R0, R0);
          var bg = ctx.createRadialGradient(0, -R0 * 0.25, R0 * 0.1, 0, 0, R0);
          bg.addColorStop(0, "#464d54"); bg.addColorStop(0.65, "#1f2328"); bg.addColorStop(1, "#0d1013");
          ctx.beginPath(); ctx.arc(0, 0, R0 * 0.94, 0, Math.PI * 2);
          ctx.fillStyle = bg; ctx.fill();
          ctx.rotate(grad * Math.PI / 180);
          ctx.strokeStyle = "#f2f6fa"; ctx.lineWidth = Math.max(2, p3Seite * 0.032);
          ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(0, -R0 * 0.42); ctx.lineTo(0, -R0 * 0.88); ctx.stroke();
          ctx.restore();
          continue;
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(p3Seite / 2, p3Seite / 2, p3Seite * 0.495, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(p3Seite / 2, p3Seite / 2);
        ctx.rotate(grad * Math.PI / 180);
        ctx.drawImage(s, -p3Seite / 2, -p3Seite / 2, p3Seite, p3Seite);
        ctx.restore();
      }
    }

    p3Regler.forEach(function (reg) {
      var cv = q('.p3-dreh-cv[data-k="' + reg.art + '"]');
      if (!cv) return;
      cv.width = p3Seite;
      cv.height = p3Seite;
      reg.cv = cv;
      reg.ctx = cv.getContext("2d");

      var greift = false, letzter = 0, summe = 0, startW = 0;
      function winkel(ev) {
        var r = cv.getBoundingClientRect();
        return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
      }
      function p3Move(ev) {
        if (!greift) return;
        if (ev.stopPropagation) ev.stopPropagation();
        if (ev.cancelable && ev.preventDefault) ev.preventDefault();
        var w2 = winkel(ev), d = w2 - letzter;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        letzter = w2; summe += d;
        var schrittWert = Math.round(summe / 280 * (reg.bis - reg.von));
        if (schrittWert !== 0) {
          summe = 0;
          g2Klick("dial");
          reg.set(startW + schrittWert);
          startW = reg.holen();
        }
      }
      function losCv() {
        if (!greift) return;
        greift = false;
        cv.classList.remove("greift");
        window.removeEventListener("pointermove", p3Move, true);
        window.removeEventListener("pointerup", losCv, true);
        window.removeEventListener("pointercancel", losCv, true);
        window.removeEventListener("blur", losCv, true);
      }
      cv.addEventListener("pointerdown", function (ev) {
        if (ev && ev.button && ev.button !== 0) return;
        if (p3Zustand().lock || !p3Zustand().power) { p3Meld(p3Zustand().lock ? "LOCK aktiv" : "STANDBY"); p3Malen(); return; }
        greift = true; letzter = winkel(ev); summe = 0; startW = reg.holen();
        cv.classList.add("greift");
        window.addEventListener("pointermove", p3Move, { capture: true, passive: false });
        window.addEventListener("pointerup", losCv, true);
        window.addEventListener("pointercancel", losCv, true);
        window.addEventListener("blur", losCv, true);
        ev.preventDefault();
        ev.stopPropagation();
      });
      cv.addEventListener("wheel", function (ev) {
        ev.preventDefault();
        if (p3Zustand().lock || !p3Zustand().power) { p3Meld(p3Zustand().lock ? "LOCK aktiv" : "STANDBY"); p3Malen(); return; }
        g2Klick("dial");
        reg.set(reg.holen() + (rad(ev) > 0 ? -1 : 1));
      }, { passive: false });
    });

    if (p3Bild.complete && p3Bild.naturalWidth) { setTimeout(function () { p3GroesseNachziehen(); p3DrehAlleMalen(); }, 60); }
    else {
      p3Bild.addEventListener("load", function () { p3BildVersuche = 0; setTimeout(function () { p3GroesseNachziehen(); p3DrehAlleMalen(); }, 60); });
      p3Bild.addEventListener("error", function () {
        p3DrehAlleMalen();
        if (p3BildVersuche < 30) {
          p3BildVersuche++;
          setTimeout(function () {
            if (!p3Bild || p3Bild.naturalWidth) return;
            p3Bild.src = BILD3 + "?v=" + Date.now();
          }, 1200);
        }
      });
    }

    function p3SperrePruefen() {
      var z = p3Zustand();
      if (!z.power) { p3Meld("STANDBY – POWER einschalten"); p3Malen(); return true; }
      if (z.lock) { p3Meld("LOCK aktiv (Menü entsperren)"); p3Malen(); return true; }
      return false;
    }

    var p3MenuBtn = q(".p3-menu");
    p3MenuBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      menue.classList.toggle("offen");
      menueAusrichten(w, menue);
    });
    document.addEventListener("click", function (ev) {
      if (ev && ev.isTrusted === false) return;
      if (menue.classList.contains("offen") && !menue.contains(ev.target) &&
          ev.target !== p3MenuBtn && !p3MenuBtn.contains(ev.target)) {
        menue.classList.remove("offen");
      }
    });

    q(".p3-meter").addEventListener("click", function () {
      if (!p3Zustand().power) return;
      g2Klick("taste");
      p3MeterWeiter(1);
    });
    q(".p3-meter").addEventListener("wheel", function (ev) {
      ev.preventDefault();
      if (!p3Zustand().power) return;
      p3MeterWeiter(rad(ev) > 0 ? -1 : 1);
    }, { passive: false });

    q('[data-f="power"]').addEventListener("click", function () {
      g2Klick("rast");
      p3PowerUmschalten();
    });
    q('[data-f="phone"]').addEventListener("click", function () {
      var z = p3Zustand();
      if (!z.power) return;
      g2Klick("taste");
      if (!z.stumm && z.laut > 0) {
        z.stummVorher = z.laut;
        z.stumm = true;
        p3WertSetzen("laut", 0);
        p3Meld("STUMM");
      } else {
        var r = (typeof z.stummVorher === "number" && z.stummVorher > 0) ? z.stummVorher : 80;
        z.stumm = false;
        z.stummVorher = null;
        p3WertSetzen("laut", r);
        p3Meld("TON EIN");
      }
      p3Malen();
    });
    q('[data-f="mic"]').addEventListener("click", function () {
      g2Klick("taste");
      p3Meld("RX-Betrieb (Empfänger)");
      p3Malen();
    });

    q('[data-f="rgr"]').addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      _klickAn = !_klickAn;
      merken(SPEICHER + "_klicks", _klickAn ? "1" : "0");
      if (_klickAn) g2Klick("taste");
      p3Meld("RGR Klick-Ton: " + (_klickAn ? "EIN" : "AUS"));
      p3MenueSync();
      p3Malen();
    });
    q('[data-f="nld"]').addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      g2Klick("taste");
      afToggle("NB");
      p3Meld("Noise Limiter: " + (afRead("NB") ? "EIN" : "AUS"));
      p3MenueSync();
      p3Malen();
    });
    q('[data-f="mode"]').addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      g2Klick("rast");
      p3ModeWeiter();
    });
    q('[data-f="txp"]').addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      g2Klick("taste");
      if (p3Zustand().dw) p3DwStopp("DW aus");
      else p3DwStart();
    });
    q('[data-f="rfg"]').addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      g2Klick("taste");
      var cur = Math.round(p3Zustand().rf || 0);
      var ziele = [0, 15, 30, 45];
      var next = ziele[0];
      for (var i = 0; i < ziele.length; i++) {
        if (cur < ziele[i] - 2) { next = ziele[i]; break; }
      }
      p3WertSetzen("rf", next);
    });
    q('[data-f="tone"]').addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      g2Klick("taste");
      p3FarbeWeiter(1);
    });
    q('[data-f="tone"]').addEventListener("wheel", function (ev) {
      ev.preventDefault();
      if (p3SperrePruefen()) return;
      p3FarbeWeiter(rad(ev) > 0 ? -1 : 1);
    }, { passive: false });
    q('[data-f="ch9"]').addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      g2Klick("rast");
      p3ScanStopp("");
      p3DwStopp("");
      var z = p3Zustand();
      if (z.kanal !== 9) {
        z.chVor9 = z.kanal;
        merken(SPEICHER3 + "_chvor9", z.chVor9);
        p3KanalSetzen(9);
        p3Meld("CH 9 Notrufkanal");
      } else {
        var r = (z.chVor9 >= 1 && z.chVor9 <= 80 && z.chVor9 !== 9) ? z.chVor9 : 1;
        p3KanalSetzen(r);
        p3Meld("Zurück K" + (r < 10 ? "0" + r : r));
      }
      p3Malen();
    });

    /* SCD: kurzer Klick = Suchlauf (SCAN), langer Druck = DW, Mausrad = 2. Kanal */
    var p3ScdTimer = null, p3ScdLang = false;
    var scdBtn = q('[data-f="scd"]');
    scdBtn.addEventListener("pointerdown", function () {
      if (p3SperrePruefen()) return;
      p3ScdLang = false;
      if (p3ScdTimer) clearTimeout(p3ScdTimer);
      p3ScdTimer = setTimeout(function () {
        p3ScdTimer = null;
        p3ScdLang = true;
        g2Klick("taste");
        if (p3Zustand().dw) p3DwStopp("DW aus");
        else p3DwStart();
      }, 600);
    });
    window.addEventListener("pointerup", function () {
      if (p3ScdTimer) { clearTimeout(p3ScdTimer); p3ScdTimer = null; }
    });
    scdBtn.addEventListener("click", function () {
      if (p3SperrePruefen()) return;
      if (p3ScdLang) { p3ScdLang = false; return; }
      g2Klick("taste");
      if (p3Zustand().scan) p3ScanStopp("Suchlauf gestoppt");
      else p3ScanStart();
    });
    scdBtn.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      if (p3SperrePruefen()) return;
      var z = p3Zustand();
      var k2 = wrapKanal(z.dwKanal + (rad(ev) > 0 ? -1 : 1));
      z.dwKanal = k2;
      z.dwZeit = Date.now();
      merken(SPEICHER3 + "_dwkanal", k2);
      p3Meld("2. Kanal: " + (k2 < 10 ? "0" + k2 : k2));
      p3Malen();
    }, { passive: false });

    function p3StepBind(btn, delta) {
      var holdTimer = null, holdInt = null, didHold = false;
      function stopHold() {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        if (holdInt) { clearInterval(holdInt); holdInt = null; }
        if (didHold) { setTimeout(function () { didHold = false; }, 60); }
      }
      btn.addEventListener("pointerdown", function (ev) {
        if (ev && ev.button && ev.button !== 0) return;
        if (p3SperrePruefen()) return;
        didHold = false;
        stopHold();
        try { if (btn.setPointerCapture && ev.pointerId !== undefined) btn.setPointerCapture(ev.pointerId); } catch (eCap) { }
        holdTimer = setTimeout(function () {
          didHold = true;
          if (p3Zustand().lock || !p3Zustand().power) { stopHold(); return; }
          g2Klick("rast");
          p3ScanStopp(""); p3DwStopp("");
          p3KanalSetzen(p3Zustand().kanal + delta);
          holdInt = setInterval(function () {
            if (p3Zustand().lock || !p3Zustand().power) { stopHold(); return; }
            g2Klick("rast");
            p3ScanStopp(""); p3DwStopp("");
            p3KanalSetzen(p3Zustand().kanal + delta);
          }, 125);
        }, 360);
      });
      btn.addEventListener("pointerup", stopHold);
      btn.addEventListener("pointercancel", stopHold);
      btn.addEventListener("lostpointercapture", stopHold);
      window.addEventListener("pointerup", stopHold);
      window.addEventListener("blur", stopHold);
      btn.addEventListener("click", function () {
        if (p3SperrePruefen()) return;
        if (didHold) { didHold = false; return; }
        g2Klick("rast");
        p3ScanStopp(""); p3DwStopp("");
        p3KanalSetzen(p3Zustand().kanal + delta);
      });
      btn.addEventListener("wheel", function (ev) {
        ev.preventDefault();
        if (p3SperrePruefen()) return;
        g2Klick("rast");
        p3ScanStopp(""); p3DwStopp("");
        p3KanalSetzen(p3Zustand().kanal + (rad(ev) > 0 ? -1 : 1));
      }, { passive: false });
    }
    p3StepBind(q('[data-f="up"]'), 1);
    p3StepBind(q('[data-f="dn"]'), -1);

    /* Einstellungs-Menue Bindings */
    q('[data-m="farbe"]').addEventListener("click", function () { g2Klick("taste"); p3FarbeWeiter(1); });
    q('[data-m="meter"]').addEventListener("click", function () { g2Klick("taste"); p3MeterWeiter(1); });
    q('[data-m="w1"]').addEventListener("click", function () { g2Klick("taste"); menue.classList.remove("offen"); geraetWechsel(1); });
    q('[data-m="w2"]').addEventListener("click", function () { g2Klick("taste"); menue.classList.remove("offen"); geraetWechsel(2); });

    var bNb3 = q('[data-m="nb"]'), bNr3 = q('[data-m="nr"]'), bKl3 = q('[data-m="klicks"]'), bLk3 = q('[data-m="lock"]');
    function p3MenueSync() {
      var z = p3Zustand();
      if (bNb3) bNb3.classList.toggle("an", afRead("NB"));
      if (bNr3) bNr3.classList.toggle("an", afRead("NR"));
      if (bLk3) { bLk3.classList.toggle("an", !!z.lock); bLk3.textContent = "LOCK: " + (z.lock ? "EIN" : "AUS"); }
      if (bKl3) { bKl3.classList.toggle("an", !!_klickAn); bKl3.textContent = "Klick-Ton: " + (_klickAn ? "EIN" : "AUS"); }
    }
    if (bNb3) bNb3.addEventListener("click", function () { g2Klick("taste"); afToggle("NB"); p3MenueSync(); p3Malen(); });
    if (bNr3) bNr3.addEventListener("click", function () { g2Klick("taste"); afToggle("NR"); p3MenueSync(); p3Malen(); });
    if (bLk3) bLk3.addEventListener("click", function () {
      g2Klick("taste");
      var z = p3Zustand();
      z.lock = !z.lock;
      merken(SPEICHER3 + "_lock", z.lock ? "1" : "0");
      p3Meld(z.lock ? "Tasten gesperrt" : "Entsperrt");
      p3MenueSync();
      p3Malen();
    });
    if (bKl3) bKl3.addEventListener("click", function () {
      _klickAn = !_klickAn; merken(SPEICHER + "_klicks", _klickAn ? "1" : "0");
      if (_klickAn) g2Klick("taste");
      p3MenueSync();
      p3Malen();
    });
    setTimeout(p3MenueSync, 600);

    var sV3 = q('[data-m="vol"]'), sS3 = q('[data-m="sq"]'), sR3 = q('[data-m="rf"]'), sT3 = q('[data-m="schw"]');
    sV3.addEventListener("input", function () { p3WertSetzen("laut", sV3.value); });
    sS3.addEventListener("input", function () { p3WertSetzen("sq", sS3.value); });
    sR3.addEventListener("input", function () { p3WertSetzen("rf", sR3.value); });
    sT3.addEventListener("input", function () { p3WertSetzen("schw", sT3.value); });

    q(".p3-w1").addEventListener("click", function () { menue.classList.remove("offen"); geraetWechsel(1); });
    q(".p3-w2").addEventListener("click", function () { menue.classList.remove("offen"); geraetWechsel(2); });
    q(".p3-zu").addEventListener("click", function () { menue.classList.remove("offen"); p3Zeigen(false); });

    var P3_BASIS = 560;
    var p3Skala = 1;
    function p3Kasten() { return w.querySelector(".p3-kasten"); }
    function p3GroesseSetzen(k) {
      p3Skala = Math.max(0.55, Math.min(2.4, Number(k) || 1));
      var ka = p3Kasten();
      if (!ka) return;
      ka.style.transform = (Math.abs(p3Skala - 1) < 0.001) ? "none" : ("scale(" + p3Skala + ")");
      try { w.style.setProperty("--p3-skala", p3Skala.toFixed(3)); } catch (e0) { }
      w.style.width = Math.round(P3_BASIS * p3Skala) + "px";
      var hh = ka.offsetHeight;
      if (hh <= 20) hh = Math.round(P3_BASIS * BILD3_H / BILD3_B);
      w.style.height = Math.round(hh * p3Skala) + "px";
    }
    function p3GroesseNachziehen() {
      if (w.style.display === "none") return;
      p3GroesseSetzen(p3Skala);
    }

    var pk0 = parseFloat(holenText(SPEICHER3 + "_skala", "1"));
    p3GroesseSetzen((pk0 >= 0.55 && pk0 <= 2.4) ? pk0 : 1);
    var pl0 = holenText(SPEICHER3 + "_links", ""), po0 = holenText(SPEICHER3 + "_oben", "");
    if (pl0 !== "" && po0 !== "") {
      w.style.left = pl0 + "px";
      w.style.top = po0 + "px";
      w.style.bottom = "auto";
    }

    [["tl", 1, 1], ["tr", 0, 1], ["bl", 1, 0], ["br", 0, 0]].forEach(function (eck) {
      var d = document.createElement("div");
      d.className = "p3-griff p3-eck " + eck[0];
      d.setAttribute("data-eck", eck[0]);
      d.setAttribute("title", "Größe ziehen");
      w.appendChild(d);
    });

    var P3_MIN_W = Math.round(P3_BASIS * 0.55), P3_MAX_W = Math.round(P3_BASIS * 2.4);
    function p3Persist() {
      var r = w.getBoundingClientRect();
      merken(SPEICHER3 + "_links", Math.round(r.left));
      merken(SPEICHER3 + "_oben", Math.round(r.top));
      merken(SPEICHER3 + "_skala", String(Math.round(p3Skala * 1000) / 1000));
    }
    el.p3Klemmen = function () {
      cbKastenKlemmen(w, function (nw) { p3GroesseSetzen(nw / P3_BASIS); }, P3_MIN_W, p3Persist);
      if (menue.classList.contains("offen")) menueAusrichten(w, menue);
    };

    var p3Zug = null;
    function p3ZugStart(ev, art) {
      if (ev && ev.button && ev.button !== 0) return;
      var r = w.getBoundingClientRect();
      var vw = window.innerWidth || 1600, vh = window.innerHeight || 980;
      var ratio = r.width / Math.max(40, r.height);
      var vonLinks = art.indexOf("l") >= 0, vonOben = art.indexOf("t") >= 0;
      var availW = vonLinks ? r.right : (vw - r.left);
      var availH = vonOben ? r.bottom : (vh - r.top);
      var effMaxW = Math.max(P3_MIN_W, Math.min(P3_MAX_W, Math.floor(Math.min(availW, availH * ratio))));
      p3Zug = {
        art: art, mx: ev.clientX, my: ev.clientY, x: r.left, y: r.top,
        w: r.width, h: r.height, ratio: ratio, effMaxW: effMaxW,
        anchorL: r.left, anchorR: r.right, anchorT: r.top, anchorB: r.bottom
      };
      w.style.left = Math.round(r.left) + "px";
      w.style.top = Math.round(r.top) + "px";
      w.style.bottom = "auto";
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
    }
    w.addEventListener("pointerdown", function (ev) {
      var eck = ev.target && ev.target.closest ? ev.target.closest(".p3-eck") : null;
      if (eck) { p3ZugStart(ev, eck.getAttribute("data-eck")); return; }
      var gr = ev.target && ev.target.closest ? ev.target.closest(".p3-zieh") : null;
      if (gr) { p3ZugStart(ev, "zieh"); return; }
      if (ev.target === p3Bild) { p3ZugStart(ev, "zieh"); }
    }, { capture: true });
    window.addEventListener("pointermove", function (ev) {
      if (!p3Zug) return;
      var vw = window.innerWidth || 1600, vh = window.innerHeight || 980;
      var dx = ev.clientX - p3Zug.mx, dy = ev.clientY - p3Zug.my;
      if (p3Zug.art === "zieh") {
        var cr = w.getBoundingClientRect();
        var nx = Math.max(0, Math.min(Math.max(0, vw - cr.width), Math.round(p3Zug.x + dx)));
        var ny = Math.max(0, Math.min(Math.max(0, vh - cr.height), Math.round(p3Zug.y + dy)));
        w.style.left = nx + "px";
        w.style.top = ny + "px";
        w.style.bottom = "auto";
      } else {
        var vonLinks = p3Zug.art.indexOf("l") >= 0;
        var vonOben = p3Zug.art.indexOf("t") >= 0;
        var dW = vonLinks ? -dx : dx;
        var dH = (vonOben ? -dy : dy) * p3Zug.ratio;
        var delta = (Math.abs(dW) >= Math.abs(dH)) ? dW : dH;
        var breit = Math.max(P3_MIN_W, Math.min(p3Zug.effMaxW, Math.round(p3Zug.w + delta)));
        p3GroesseSetzen(breit / P3_BASIS);
        var nh = w.getBoundingClientRect().height;
        var nl = vonLinks ? Math.round(p3Zug.anchorR - breit) : Math.round(p3Zug.anchorL);
        var nt = vonOben ? Math.round(p3Zug.anchorB - nh) : Math.round(p3Zug.anchorT);
        nl = Math.max(0, Math.min(Math.max(0, vw - breit), nl));
        nt = Math.max(0, Math.min(Math.max(0, vh - nh), nt));
        w.style.left = nl + "px";
        w.style.top = nt + "px";
        w.style.bottom = "auto";
      }
      if (menue.classList.contains("offen")) menueAusrichten(w, menue);
      if (ev.cancelable && ev.preventDefault) ev.preventDefault();
    }, { capture: true, passive: false });
    function p3ZugEnde() {
      if (!p3Zug) return;
      p3Zug = null;
      p3GroesseNachziehen();
      cbKastenKlemmen(w, function (nw) { p3GroesseSetzen(nw / P3_BASIS); }, P3_MIN_W);
      p3Persist();
      if (menue.classList.contains("offen")) menueAusrichten(w, menue);
    }
    window.addEventListener("pointerup", p3ZugEnde, true);
    window.addEventListener("pointercancel", p3ZugEnde, true);
    window.addEventListener("blur", p3ZugEnde, true);

    el.p3Fenster = w;
    el.p3GroesseNachziehen = p3GroesseNachziehen;
    el.p3Nadel = nadelG;
    el.p3DrehMalen = p3DrehAlleMalen;
    el.p3KanalTxt = q(".p3-d-kanal");
    el.p3Seg = q(".p3-seg-bay .p3-seg");
    el.p3Freq = q(".p3-d-freq");
    el.p3Mode = q(".p3-d-mode");
    el.p3Status = q(".p3-d-status");
    el.p3FlagScan = q('.p3-seg-bay [data-flg="scan"]');
    el.p3FlagDw = q('.p3-seg-bay [data-flg="dw"]');
    el.p3MeterLicht = q(".p3-meter-licht");
    el.p3MVol = q(".p3-m-vol");
    el.p3MSq = q(".p3-m-sq");
    el.p3MRf = q(".p3-m-rf");
    el.p3MSchw = q(".p3-m-schw");
    el.p3Leds = {
      fm:   q('[data-led="fm"]'),
      rgr:  q('[data-led="rgr"]'),
      nlp:  q('[data-led="nlp"]'),
      rfg:  q('[data-led="rfg"]'),
      tx:   q('[data-led="tx"]'),
      txp:  q('[data-led="txp"]'),
      tone: q('[data-led="tone"]'),
      lock: q('[data-led="lock"]')
    };
    el.p3Tasten = {
      rgr:  q('[data-f="rgr"]'),
      nld:  q('[data-f="nld"]'),
      txp:  q('[data-f="txp"]'),
      rfg:  q('[data-f="rfg"]'),
      tone: q('[data-f="tone"]'),
      scd:  q('[data-f="scd"]')
    };
    el.p3MenueSync = p3MenueSync;

    p3Zeigen(zustand.p3Offen === true);
    p3Malen();
  }

  function p3Malen() {
    var w = el.p3Fenster;
    if (!w || !el.p3Seg) return;
    if (w.style.display === "none") return;
    var z = p3Zustand();
    var zwei = function (n) { return n < 10 ? "0" + n : String(n); };

    w.classList.toggle("standby", !z.power);
    try {
      var p3Fid = p3FarbeId();
      if (w._p3LetzteFarbe !== p3Fid) {
        w._p3LetzteFarbe = p3Fid;
        w.style.setProperty("--p3-licht-filter", p3FarbeFilter());
      }
    } catch (e) { }

    /* Externe OpenWebRX-Aenderungen nur nachziehen, wenn Funkgeraet 3 allein aktiv ist (!zustand.offen) */
    if (zustand.offen) {
      var extB = frequenzLesen();
      if (extB !== null) p3LetzteExtHz = extB;
      try {
        var vB = document.getElementById("openwebrx-panel-volume");
        if (vB && isFinite(parseFloat(vB.value))) p3LetzteExtLaut = Math.round(parseFloat(vB.value));
        var sB = document.querySelector(".openwebrx-squelch-slider");
        if (sB && !sB.disabled && isFinite(parseFloat(sB.value))) p3LetzteExtSq = Math.round(parseFloat(sB.value));
        var dB = document.querySelector(".openwebrx-demodulator-button.highlighted");
        if (dB) {
          var dmB = dB.getAttribute("data-modulation") || "";
          if (MODI.indexOf(dmB) >= 0) p3LetzteExtMode = dmB;
        }
      } catch (eSb) { }
    } else if (zustand.p3Offen && z.power && !z.scan && !z.dw) {
      var ext = frequenzLesen();
      if (ext !== null && (p3LetzteExtHz === null || Math.abs(ext - p3LetzteExtHz) > 5)) {
        p3LetzteExtHz = ext;
        z.extHz = ext;
        var ek = frequenzKanal(ext);
        if (ek) {
          z.kanal = ek;
          z.istCb = true;
          merken(SPEICHER3 + "_kanal", ek);
        } else {
          z.istCb = false;
        }
      }
      try {
        var volEl = document.getElementById("openwebrx-panel-volume");
        if (volEl && isFinite(parseFloat(volEl.value))) {
          var evVal = Math.round(parseFloat(volEl.value));
          if (p3LetzteExtLaut === null) p3LetzteExtLaut = evVal;
          else if (evVal !== p3LetzteExtLaut) {
            p3LetzteExtLaut = evVal;
            z.laut = Math.max(0, Math.min(150, evVal));
            merken(SPEICHER3 + "_laut", z.laut);
          }
        }
        var sqEl = document.querySelector(".openwebrx-squelch-slider");
        if (sqEl && !sqEl.disabled && isFinite(parseFloat(sqEl.value))) {
          var sqVal = Math.round(parseFloat(sqEl.value));
          if (p3LetzteExtSq === null) p3LetzteExtSq = sqVal;
          else if (sqVal !== p3LetzteExtSq) {
            p3LetzteExtSq = sqVal;
            z.sq = Math.max(-150, Math.min(0, sqVal));
            merken(SPEICHER3 + "_sq", z.sq);
          }
        }
        var dmEl = document.querySelector(".openwebrx-demodulator-button.highlighted");
        if (dmEl) {
          var dmM = dmEl.getAttribute("data-modulation") || "";
          if (MODI.indexOf(dmM) >= 0) {
            if (p3LetzteExtMode === null) p3LetzteExtMode = dmM;
            else if (dmM !== p3LetzteExtMode) {
              p3LetzteExtMode = dmM;
              z.mode = dmM;
              merken(SPEICHER3 + "_mode", dmM);
            }
          }
        }
      } catch (eSync) { }
    }

    var kTxt = (z.istCb !== false && z.kanal) ? zwei(z.kanal) : "--";
    if (el.p3KanalTxt && el.p3KanalTxt.textContent !== kTxt) el.p3KanalTxt.textContent = kTxt;
    segStringSetzen(el.p3Seg, kTxt);

    var hz = (z.istCb === false && z.extHz) ? z.extHz : ((z.extHz && Math.abs(z.extHz - kanalFrequenz(z.kanal)) <= 5000) ? z.extHz : kanalFrequenz(z.kanal));
    var mhz = (hz / 1e6).toFixed(3).replace(".", ",");
    if (el.p3Freq && el.p3Freq.textContent !== mhz) el.p3Freq.textContent = mhz;

    var modeTxt = MODE_TEXT[z.mode] || String(z.mode || "nfm").toUpperCase();
    if (el.p3Mode && el.p3Mode.textContent !== modeTxt) el.p3Mode.textContent = modeTxt;

    /* Analog S-Meter Licht (Nadel laeuft im 100-ms-Takt, damit smGlaetten(2) nicht doppelt zaehlt) */
    if (el.p3MeterLicht) {
      var mlIdx = Math.round(holen(SPEICHER3 + "_meterlicht", 0));
      var mlObj = P3_METER_FARBEN[mlIdx] || P3_METER_FARBEN[0];
      if (el.p3MeterLicht._mlIdx !== mlIdx || el.p3MeterLicht._mlPwr !== z.power) {
        el.p3MeterLicht._mlIdx = mlIdx; el.p3MeterLicht._mlPwr = z.power;
        el.p3MeterLicht.style.background = mlObj.bg;
        el.p3MeterLicht.style.opacity = z.power ? "1" : "0.15";
      }
    }
    if (!z.power) { try { p3NadelZeichnen(0); } catch (ePn) { } }
    try { if (el.p3DrehMalen) el.p3DrehMalen(); } catch (ePd) { }

    /* LED Matrix */
    var leds = el.p3Leds || {};
    function ledSet(elL, cls) {
      if (!elL) return;
      var ziel = (z.power && cls) ? cls : "";
      if (elL._p3Led === ziel) return;
      elL._p3Led = ziel;
      elL.classList.remove("an-rot", "an-gruen", "an-amber", "an-cyan");
      if (ziel) elL.classList.add(ziel);
    }
    if (leds.fm) {
      var fmLbl = leds.fm.querySelector(".p3-led-lbl");
      if (fmLbl && fmLbl.textContent !== modeTxt) fmLbl.textContent = modeTxt;
      ledSet(leds.fm, z.mode === "nfm" ? "an-rot" : (z.mode === "am" ? "an-amber" : "an-cyan"));
    }
    ledSet(leds.rgr, _klickAn ? "an-amber" : "");
    var nbAn = afRead("NB") || afRead("NR");
    ledSet(leds.nlp, nbAn ? "an-gruen" : "");
    ledSet(leds.rfg, (!RF_STATE.qDirect && z.rf > 0) ? "an-amber" : "");
    ledSet(leds.tx, "");
    ledSet(leds.txp, (z.dw || z.schw !== 14) ? "an-gruen" : "");
    ledSet(leds.tone, p3FarbeId() !== "gruen" ? "an-cyan" : "an-gruen");
    ledSet(leds.lock, z.lock ? "an-rot" : "");

    /* Tasten-Zustände */
    var ts = el.p3Tasten || {};
    if (ts.rgr) ts.rgr.classList.toggle("an", z.power && !!_klickAn);
    if (ts.nld) ts.nld.classList.toggle("an", z.power && nbAn);
    if (ts.txp) ts.txp.classList.toggle("an", z.power && !!z.dw);
    if (ts.rfg) ts.rfg.classList.toggle("an", z.power && z.rf > 0 && !RF_STATE.qDirect);
    if (ts.tone) ts.tone.classList.toggle("an", z.power && p3FarbeId() !== "gruen");
    if (ts.scd) ts.scd.classList.toggle("an", z.power && (!!z.scan || !!z.dw));
    if (el.p3FlagScan) el.p3FlagScan.classList.toggle("an", z.power && !!z.scan);
    if (el.p3FlagDw) el.p3FlagDw.classList.toggle("an", z.power && !!z.dw);

    /* Status in Plakette */
    var st;
    if (!z.power) {
      st = "STANDBY · AUS";
    } else if (z.scan) {
      st = "SCAN · Boden " + (z.boden === null ? "--" : Math.round(z.boden)) + " dB";
    } else if (z.dw) {
      st = "DW " + zwei(z.dwA) + "/" + zwei(z.dwKanal) + (z.dwSignal ? " · aktiv" : " · sucht");
    } else {
      st = "VOL " + z.laut + " · SQ " + z.sq + " · RF " + (RF_STATE.modus === "auto" ? "AGC" : z.rf);
    }
    if (z.meldung && Date.now() - (z.meldungZeit || 0) < 4000) {
      st = z.meldung;
    }
    if (el.p3Status) el.p3Status.textContent = st;

    try {
      var sV = w.querySelector('[data-m="vol"]'), sS = w.querySelector('[data-m="sq"]'),
          sR = w.querySelector('[data-m="rf"]'),  sT = w.querySelector('[data-m="schw"]');
      if (sV && document.activeElement !== sV) { sV.value = z.laut; el.p3MVol.textContent = z.laut; }
      if (sS && document.activeElement !== sS) { sS.value = z.sq;   el.p3MSq.textContent = z.sq; }
      if (sR && document.activeElement !== sR) { sR.value = z.rf;   el.p3MRf.textContent = (RF_STATE.modus === "auto" ? "AGC" : z.rf); }
      if (sT && document.activeElement !== sT) { sT.value = z.schw; el.p3MSchw.textContent = "+" + z.schw; }
    } catch (eM) { }
  }

  /* Eine Ziffer als Siebensegment: welche Striche leuchten */
  var SEG_MUSTER = {
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd",
    "4": "fgbc", "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abcdfg",
    "-": "g"
  };
  function segZeichen(ch) {
    if (ch === "," || ch === ".") return '<span class="k"><i></i></span>';
    var an = SEG_MUSTER[ch] || "";
    var striche = ["a", "b", "c", "d", "e", "f", "g"], html = "";
    for (var i = 0; i < striche.length; i++) {
      html += '<i class="' + striche[i] + (an.indexOf(striche[i]) >= 0 ? " on" : "") + '"></i>';
    }
    return '<span class="z">' + html + '</span>';
  }

  function segStringSetzen(box, str) {
    if (!box) return;
    var s = String(str || "");
    if (box.getAttribute("data-wert") === s) return;
    box.setAttribute("data-wert", s);
    var html = "";
    for (var i = 0; i < s.length; i++) html += segZeichen(s.charAt(i));
    html += '<b class="g2-sr">' + s.replace(/</g, "") + '</b>';
    box.innerHTML = html;
  }

  function rad(e) { return (e.deltaY || 0) > 0 ? 1 : -1; }

  function fensterZeigen(an) {
    zustand.offen = !!an;
    merken(SPEICHER + "_offen", zustand.offen ? "1" : "0");
    try {
      if (el.fenster) el.fenster.style.display = zustand.offen ? "block" : "none";
      if (zustand.offen && el.g2Klemmen) el.g2Klemmen();
      knopfTextSetzen();
    } catch (e) { }
  }

  /* ---------------------------------------------------------------------
     Takt: Frequenz, Kanal, Mode, Skalen, Flags & Knoepfe nachziehen
     --------------------------------------------------------------------- */
  function takt() {
    if (!el.fenster) return;
    if (!hakenGesetzt) pegelHakenSetzen();
    el.fenster.classList.toggle("standby", !zustand.power);
    try {
      var g2Fid = holenText(FARB_SCHLUESSEL, "bernstein") + "|" + holenText(LICHT_SCHLUESSEL, "bernstein");
      if (el._g2LetzteFarbe !== g2Fid) {
        el._g2LetzteFarbe = g2Fid;
        var lf = lcdFarbe();
        if (el.lcd) el.lcd.style.backgroundColor = lf;
        el.fenster.style.setProperty("--g2-licht-rgb", lichtRgb());
        el.fenster.style.setProperty("--g2-licht-hell", lichtHell());
        el.fenster.style.setProperty("--g2-licht-filter", lichtFilter());
        try {
          var wz = document.documentElement;
          wz.style.setProperty("--g2-licht-rgb", lichtRgb());
          wz.style.setProperty("--g2-licht-hell", lichtHell());
          wz.style.setProperty("--g2-licht-filter", lichtFilter());
        } catch (eW) { }
      }
      var mlIdx = Math.round(holen(SPEICHER + "_meterlicht", 0));
      var mlObj = AE8_METER_FARBEN[mlIdx] || AE8_METER_FARBEN[0];
      if (el._ae8MlIdx !== mlIdx || el._ae8MlPwr !== zustand.power) {
        el._ae8MlIdx = mlIdx;
        el._ae8MlPwr = zustand.power;
        if (el.m1Licht) { el.m1Licht.style.background = mlObj.bg; el.m1Licht.style.opacity = zustand.power ? "1" : "0.18"; }
        if (el.m2Licht) { el.m2Licht.style.background = mlObj.bg; el.m2Licht.style.opacity = zustand.power ? "1" : "0.18"; }
      }
    } catch (eF) { }
    try { aeMalen(); } catch (eAE) { }
    try { aeDwTakt(); } catch (eAeDw) { }
    try { p3Malen(); } catch (eP3M) { }
    try { p3DwTakt(); } catch (eP3Dw) { }
    try {
      if (el.bild && el.bild.complete && !el.bild.naturalWidth &&
          (Date.now() - (el.bildZeit || 0) > 2500) && (el.bildVersuche || 0) < 30) {
        el.bildVersuche = (el.bildVersuche || 0) + 1;
        el.bildZeit = Date.now();
        el.bild.src = BILD + "?v=" + Date.now();
      }
    } catch (eB) { }
    [el.knopfVol, el.knopfSq, el.knopfRf, el.knopfMicg,
     el.knopfFilt, el.knopfKanal, el.knopfSwrCal, el.knopfSwrMod].forEach(function (k) {
      try { if (k && k.knopfMalen) k.knopfMalen(); } catch (eK) { }
    });
    if (zustand.meldung && Date.now() - (zustand.meldungZeit || 0) > 4000) zustand.meldung = "";
    if (zustand.fun && Date.now() - (zustand.funZeit || 0) > 5500) zustand.fun = false;
    try { dwTakt(); } catch (eDw) { }
    var f = frequenzLesen();
    if (f !== null) {
      if (!zustand.offen) {
        g2LetzteExtHz = f;
      } else if (g2LetzteExtHz === null || Math.abs(f - g2LetzteExtHz) > 5) {
        g2LetzteExtHz = f;
        zustand.extHz = f;
        var ekG2 = frequenzKanal(f);
        if (ekG2) {
          zustand.kanal = ekG2;
          zustand.istCb = true;
          merken(SPEICHER + "_kanal", ekG2);
        } else {
          zustand.istCb = false;
        }
      }
    } else if (zustand.extHz === null) {
      zustand.istCb = true;
    }
    var kanal = (zustand.istCb !== false && zustand.kanal) ? zustand.kanal : 0;
    var hzAnzeige = (zustand.istCb === false && zustand.extHz !== null)
      ? zustand.extHz
      : (kanalFrequenz(zustand.kanal) + (zustand.ritHz || 0));
    segStringSetzen(el.freq, hzAnzeige ? (hzAnzeige / 1e6).toFixed(3) : "--.---");
    segStringSetzen(el.kanalZahl, kanal ? (kanal < 10 ? "0" + kanal : String(kanal)) : "--");
    var mLbl = MODE_TEXT[zustand.mode] || String(zustand.mode).toUpperCase();
    if (el.mode && el.mode.textContent !== mLbl) el.mode.textContent = mLbl;

    var nbAn = afRead("NB"), nrAn = afRead("NR");
    if (el.flgs) {
      el.flgs.dw.classList.toggle("an", zustand.power && !!zustand.dw);
      el.flgs.scn.classList.toggle("an", zustand.power && !!zustand.scan);
      el.flgs.mem.classList.toggle("an", zustand.power && (!!zustand.mScan || zustand.memList[zustand.memIdx] === zustand.kanal));
      el.flgs.mon.classList.toggle("an", zustand.power && !!zustand.mon);
      el.flgs.lock.classList.toggle("an", zustand.power && !!zustand.lock);
      el.flgs.low.classList.toggle("an", zustand.power && !!zustand.low);
      el.flgs.fun.classList.toggle("an", zustand.power && !!zustand.fun);
      el.flgs.anl.classList.toggle("an", zustand.power && (nbAn || nrAn));
    }
    if (el.tasten) {
      el.tasten.bt2.classList.toggle("an", zustand.power && !!zustand.dw);
      el.tasten.bt4.classList.toggle("an", zustand.power && !!zustand.scan);
      el.tasten.bt7.classList.toggle("an", zustand.power && !!zustand.mon);
      el.tasten.bt8.classList.toggle("an", zustand.power && !!zustand.fun);
    }
    try { if (el.ae8MenueSync) el.ae8MenueSync(); } catch (eMs) { }

    var zwei = function (n) { return n < 10 ? "0" + n : String(n); };
    var g2StTxt = !zustand.power
      ? "STANDBY · AUS"
      : zustand.scan
      ? ((zustand.mScan ? "M·SCN" : "SCAN") + " · Boden " + (zustand.boden === null ? "--" : Math.round(zustand.boden)) + " dB · +" + zustand.rand + " dB")
      : zustand.dw
      ? ("DW " + zwei(zustand.dwA) + "/" + zwei(zustand.dwKanal) + (zustand.dwSignal ? " · hört K" + zwei(zustand.kanal) : " · sucht"))
      : ("VOL " + zustand.laut + " · SQ " + (zustand.mon ? "MON" : zustand.sq) + " · RF " + (RF_STATE.modus === "auto" ? "AGC" : zustand.rf) +
         (zustand.ritHz ? " · RIT " + (zustand.ritHz > 0 ? "+" : "") + (zustand.ritHz / 1000).toFixed(1) + "k" : ""));
    if (zustand.power && zustand.meldung && Date.now() - (zustand.meldungZeit || 0) < 4000) {
      g2StTxt = zustand.meldung;
    }
    if (el.status && el.status.textContent !== g2StTxt) el.status.textContent = g2StTxt;
  }

  function malen() { takt(); }

  /* ---------------------------------------------------------------------
     Start: warten, bis OpenWebRX seine Bedienelemente gebaut hat
     --------------------------------------------------------------------- */
  function los() {
    try {
      var fertig = document.querySelector(".openwebrx-squelch-slider");
      if (!fertig) { setTimeout(los, 1500); return; }
      bauen();
    } catch (e) { setTimeout(los, 2500); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(los, 1200); });
  } else {
    setTimeout(los, 1200);
  }

  /* API fuer Styler, Besucher-Spalte & Tests (100% abwaertskompatibel) */
  try {
    window.dnxGeorge2 = {
      kanal: function (n) { kanalSetzen(n, true); },
      pegel: function () { return pegelDb(); },
      mode: function (m) { if (modeSetzen(m)) { zustand.mode = m; malen(); } },
      laut: lautSetzen,
      sq: sqSetzen,
      rf: rfSetzen,
      rfWert: function () { return zustand.rf; },
      power: ae8PowerUmschalten,
      rit: ritSetzen,
      filter: filterSetzen,
      zeige: fensterZeigen,
      zeige2: aeZeigen,
      zeige3: p3Zeigen,
      wechsle: geraetWechsel,
      aktiv: aktivesGeraet,
      geraet: function (n) {
        var s = String(n);
        if (s === "3") return !!zustand.p3Offen;
        if (s === "2") return !!zustand.aeOffen;
        return !!zustand.offen;
      },
      geraetAn: function (n) {
        var s = String(n);
        if (s === "3") { p3Zeigen(true); merken(SPEICHER2 + "_aktiv", "3"); }
        else if (s === "2") { aeZeigen(true); merken(SPEICHER2 + "_aktiv", "2"); }
        else { fensterZeigen(true); merken(SPEICHER2 + "_aktiv", "1"); }
        knopfTextSetzen();
        return true;
      },
      nurAktiv: function (n) {
        var s = String(n);
        var ziel = (s === "2" || s === "3") ? s : "1";
        merken(SPEICHER2 + "_aktiv", ziel);
        knopfTextSetzen();
        return ziel;
      },
      beideAn: function () { fensterZeigen(true); aeZeigen(true); knopfTextSetzen(); return true; },
      beideAus: function () { fensterZeigen(false); aeZeigen(false); p3Zeigen(false); knopfTextSetzen(); return true; },
      alleAn: function () { fensterZeigen(true); aeZeigen(true); p3Zeigen(true); knopfTextSetzen(); return true; },
      alleAus: function () { fensterZeigen(false); aeZeigen(false); p3Zeigen(false); knopfTextSetzen(); return true; },
      stand2: function () { return { eins: !!zustand.offen, zwei: !!zustand.aeOffen, drei: !!zustand.p3Offen, aktiv: aktivesGeraet() }; },
      geraetAus: function (n) {
        var s = String(n);
        if (s === "3") { p3Zeigen(false); }
        else if (s === "2") { aeZeigen(false); }
        else { fensterZeigen(false); }
        knopfTextSetzen();
        return true;
      },
      anzeige2: aeFarbeWeiter,
      anzeige3: p3FarbeWeiter,
      aeKanal: function (n) { return aeKanalSetzen(n); },
      aeMode: function (m) { return (typeof m === "string" && MODI.indexOf(m) >= 0) ? aeModeSetzen(m) : aeModeWeiter(); },
      aeScan: function (an) { if (an === false) aeScanStopp(""); else aeScanStart(); return aeZustand().scan; },
      aeDw: function (an) { if (an === false) aeDwStopp(""); else aeDwStart(); return aeZustand().dw; },
      aePower: aePowerUmschalten,
      aeWert: aeWertSetzen,
      aeStand: function () {
        var z = aeZustand();
        return {
          kanal: z.istCb === false ? 0 : z.kanal,
          mode: z.mode, laut: z.laut, sq: z.sq, rf: z.rf, rit: z.rit,
          scan: z.scan, dw: z.dw, power: z.power, lock: z.lock, ant: z.ant, dim: z.dim
        };
      },
      p3Kanal: function (n) { return p3KanalSetzen(n); },
      p3Mode: function () { return p3ModeWeiter(); },
      p3Scan: function (an) { if (an === false) p3ScanStopp(""); else p3ScanStart(); return p3Zustand().scan; },
      p3Dw: function (an) { if (an === false) p3DwStopp(""); else p3DwStart(); return p3Zustand().dw; },
      p3Power: p3PowerUmschalten,
      p3Wert: p3WertSetzen,
      p3Stand: function () {
        var z = p3Zustand();
        return { kanal: z.istCb === false ? 0 : z.kanal, mode: z.mode, laut: z.laut, sq: z.sq, rf: z.rf, schw: z.schw, scan: z.scan, dw: z.dw, power: z.power, lock: z.lock };
      },
      stand: function () { return zustand; }
    };
  } catch (e) { }
})();
