(function () {
  "use strict";

  var STORAGE_KEY = "sichos-kodesh-reader";
  var DEFAULT_PAGE = 16;
  var DEFAULT_VIEW = "retype";
  var DATA_URL = "/data/pages.json";
  var TOC_URL = "/data/farbrengens.json";
  var WORK_URL = "/data/work.json";
  var HOLD_MS = 520;
  var MOVE_PX = 8;
  var MAIL = "sichos@agentmail.to";
  var SCAN_W = 1366;
  var SCAN_H = 1760;
  var TURN_SWAP_MS = 80;
  var BOTH_RESIZE_MS = 150;

  var pages = [];
  var byN = {};
  var minN = 1;
  var maxN = 1;
  var current = DEFAULT_PAGE;
  var view = DEFAULT_VIEW;
  var toc = { front: [], farbrengens: [] };
  var workMode = false;
  var workByN = {};

  var stage = document.getElementById("stage");
  var pageInput = document.getElementById("page-input");
  var printEl = document.getElementById("bar-print");
  var prevBtn = document.getElementById("prev");
  var nextBtn = document.getElementById("next");
  var nextBottom = document.getElementById("next-bottom");
  var prevBottom = document.getElementById("prev-bottom");
  var pageInputBottom = document.getElementById("page-input-bottom");
  var pagerNums = document.getElementById("pager-nums");
  var pagerPrint = document.getElementById("pager-print");
  var originalBtn = document.getElementById("view-original");
  var retypeBtn = document.getElementById("view-retype");
  var bothBtn = document.getElementById("view-both");
  var farbrengenLine = document.getElementById("farbrengen-line");
  var farbrengenTitle = document.getElementById("farbrengen-title");
  var retypeGroupBtn = document.getElementById("retype-group");
  var workCue = document.getElementById("work-cue");
  var openContentsBtn = document.getElementById("open-contents");
  var closeContentsBtn = document.getElementById("close-contents");
  var contentsEl = document.getElementById("contents");
  var contentsList = document.getElementById("contents-list");
  var openNoteBtn = document.getElementById("open-note");
  var noteSheet = document.getElementById("note-sheet");
  var sheetKicker = document.getElementById("sheet-kicker");
  var sheetQuote = document.getElementById("sheet-quote");
  var sheetInk = document.getElementById("sheet-ink");
  var sheetCanvas = document.getElementById("sheet-canvas");
  var sheetScan = document.getElementById("sheet-scan");
  var sheetText = document.getElementById("sheet-text");
  var sheetSend = document.getElementById("sheet-send");
  var sheetClose = document.getElementById("sheet-close");
  var openRetypeBtn = document.getElementById("open-retype");
  var openDownloadBtn = document.getElementById("open-download");
  var downloadSheet = document.getElementById("download-sheet");
  var downloadKicker = document.getElementById("download-kicker");
  var downloadKindBtns = [
    document.getElementById("download-kind-original"),
    document.getElementById("download-kind-retype"),
    document.getElementById("download-kind-side")
  ];
  var downloadModeGroupBtn = document.getElementById("download-mode-group");
  var downloadModePagesBtn = document.getElementById("download-mode-pages");
  var downloadModeGroupWrap = document.getElementById("download-mode-group-wrap");
  var downloadModePagesWrap = document.getElementById("download-mode-pages-wrap");
  var downloadGroup = document.getElementById("download-group");
  var downloadFrom = document.getElementById("download-from");
  var downloadTo = document.getElementById("download-to");
  var downloadStatus = document.getElementById("download-status");
  var downloadError = document.getElementById("download-error");
  var downloadGo = document.getElementById("download-go");
  var downloadClose = document.getElementById("download-close");
  var downloadKind = DEFAULT_VIEW;
  var downloadMode = "group";
  var downloadBusy = false;

  var bothPeek = document.getElementById("both-peek");
  var bothPeekScan = document.getElementById("both-peek-scan");
  var bothPeekClose = document.getElementById("both-peek-close");
  var stageFrame = document.getElementById("stage-frame");
  var scanStage = document.getElementById("scan-stage");
  var scanImg = document.getElementById("stage-scan");
  var leafEl = document.getElementById("leaf");
  var leafBody = document.getElementById("leaf-body");
  var leafPrint = document.getElementById("leaf-print");
  var leafDraft = document.getElementById("leaf-draft");
  var leafStamp = document.getElementById("leaf-stamp");
  var quietEl = document.getElementById("leaf-quiet");
  var bothInkBtn = document.getElementById("both-ink");
  var bothCanvas = document.getElementById("both-canvas");
  var bothScanImg = null;
  var bothScanBmp = null;
  var bothParas = [];
  var bothIndex = -1;
  var bothPageN = 0;
  var bothObserver = null;
  var bothRaf = 0;
  var bothResizeTimer = 0;
  var peekZoom = null;
  var inkZoom = null;
  var renderedN = 0;
  var renderedView = "";
  var turnTimer = 0;
  var turnGen = 0;
  var scanCache = {};
  var contentsBuilt = false;
  var chromeObserver = null;
  var ZOOM_MIN = 1;
  var ZOOM_MAX = 5;
  var ZOOM_TOGGLE = 2.5;
  var DOUBLE_TAP_MS = 400;
  var DOUBLE_TAP_PX = 28;

  var noteCtx = null;
  var holdTimer = null;
  var holdTarget = null;
  var holdStart = null;
  var holdMoved = false;
  var lastFocus = null;

  function clamp(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return DEFAULT_PAGE;
    n = Math.round(n);
    if (n < minN) return minN;
    if (n > maxN) return maxN;
    return n;
  }

  function normalizeView(v) {
    v = String(v || "").toLowerCase();
    if (v === "original") return "original";
    if (v === "both") return "both";
    return "retype";
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ p: current, view: view })
      );
    } catch (e) {}
  }

  function syncUrl(push) {
    var q = new URLSearchParams();
    q.set("p", String(current));
    q.set("view", view);
    if (workMode) q.set("work", "1");
    var url = location.pathname + "?" + q.toString();
    var state = { p: current, view: view, work: workMode };
    if (push) history.pushState(state, "", url);
    else history.replaceState(state, "", url);
  }

  function setViewButtons() {
    originalBtn.classList.toggle("is-active", view === "original");
    retypeBtn.classList.toggle("is-active", view === "retype");
    bothBtn.classList.toggle("is-active", view === "both");
    originalBtn.setAttribute("aria-pressed", view === "original" ? "true" : "false");
    retypeBtn.setAttribute("aria-pressed", view === "retype" ? "true" : "false");
    bothBtn.setAttribute("aria-pressed", view === "both" ? "true" : "false");
  }

  function hasRetype(page) {
    return page && page.type !== "skip" && page.html && page.html.trim() !== "";
  }

  function allGroups() {
    return (toc.front || []).concat(toc.farbrengens || []);
  }

  function groupForPage(n) {
    var list = allGroups();
    var i;
    for (i = 0; i < list.length; i++) {
      if (n >= list[i].start && n <= list[i].end) return list[i];
    }
    return null;
  }

  function isFarbrengenGroup(g) {
    if (!g) return false;
    var list = toc.farbrengens || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === g.id) return true;
    }
    return false;
  }

  function printRange(g) {
    if (!g) return "";
    var a = g.printStart || "";
    var b = g.printEnd || "";
    if (a && b && a !== b) return a + "–" + b;
    return a || b || "";
  }

  function overlayOpen() {
    return !contentsEl.hidden || !noteSheet.hidden || !downloadSheet.hidden || (bothPeek && !bothPeek.hidden);
  }

  function setOverlay(el, open) {
    if (!el) return;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if ("inert" in el) el.inert = !open;
  }

  function closeContents() {
    setOverlay(contentsEl, false);
    openContentsBtn.setAttribute("aria-expanded", "false");
  }

  function closeNote() {
    setOverlay(noteSheet, false);
    noteCtx = null;
    sheetText.value = "";
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
    lastFocus = null;
  }

  function closeDownload() {
    if (downloadBusy && window.SichosPdf && typeof window.SichosPdf.abort === "function") {
      window.SichosPdf.abort();
    }
    setOverlay(downloadSheet, false);
    downloadBusy = false;
    downloadGo.disabled = false;
    downloadStatus.hidden = true;
    downloadStatus.textContent = "";
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
    lastFocus = null;
  }

  function closeAllOverlays() {
    closeContents();
    closeNote();
    closeDownload();
    closeBothPeek();
  }

  function markContentsCurrent() {
    if (!contentsList) return;
    var btns = contentsList.querySelectorAll(".toc-entry");
    var i;
    for (i = 0; i < btns.length; i++) {
      var start = parseInt(btns[i].getAttribute("data-start"), 10);
      var end = parseInt(btns[i].getAttribute("data-end"), 10);
      btns[i].classList.toggle("is-current", current >= start && current <= end);
    }
  }

  function fillContents() {
    if (contentsBuilt) {
      markContentsCurrent();
      return;
    }
    contentsList.replaceChildren();
    function addKicker(text) {
      var h = document.createElement("h3");
      h.className = "toc-kicker";
      h.lang = "he";
      h.textContent = text;
      contentsList.appendChild(h);
    }
    function addEntry(g, quiet) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = quiet ? "toc-entry is-front" : "toc-entry";
      btn.lang = "he";
      btn.setAttribute("data-start", String(g.start));
      btn.setAttribute("data-end", String(g.end));
      if (current >= g.start && current <= g.end) btn.classList.add("is-current");
      var name = document.createElement("span");
      name.className = "toc-name";
      name.textContent = g.label || g.title;
      btn.appendChild(name);
      var pagesEl = document.createElement("span");
      pagesEl.className = "toc-pages";
      pagesEl.textContent = printRange(g);
      btn.appendChild(pagesEl);
      btn.addEventListener("click", function () {
        view = "retype";
        closeContents();
        go(g.start, true);
      });
      contentsList.appendChild(btn);
    }
    (toc.front || []).forEach(function (g) {
      addEntry(g, true);
    });
    addKicker("תש\"י");
    (toc.farbrengens || []).forEach(function (g) {
      addEntry(g, false);
    });
    contentsBuilt = true;
  }

  function openContents() {
    if (!contentsEl.hidden) {
      closeContents();
      return;
    }
    closeNote();
    closeDownload();
    closeBothPeek();
    fillContents();
    setOverlay(contentsEl, true);
    openContentsBtn.setAttribute("aria-expanded", "true");
    closeContentsBtn.focus();
  }

  function applyWorkStore(map) {
    var store = {};
    try {
      var raw = localStorage.getItem("sichos-kodesh-work");
      if (raw) {
        var data = JSON.parse(raw);
        store = (data && data.pages) || data || {};
      }
    } catch (e) {
      return;
    }
    var key;
    for (key in store) {
      if (!Object.prototype.hasOwnProperty.call(store, key)) continue;
      var n = parseInt(key, 10);
      if (!map[n] || !store[key] || typeof store[key] !== "object") continue;
      var rec = map[n];
      var local = store[key];
      if (local.grade) rec.grade = local.grade;
      if (Object.prototype.hasOwnProperty.call(local, "note")) rec.note = local.note || "";
      if (local.retype) rec.retype = true;
    }
  }

  function workLabel(rec) {
    if (!rec) return "";
    var grade = rec.grade || rec.state || "";
    if (grade === "needs-work") grade = "needs work";
    var bits = [];
    if (grade) bits.push(grade);
    if (rec.model && rec.model !== "unknown") bits.push("model " + rec.model);
    if (rec.note) bits.push(rec.note);
    return bits.join(" · ");
  }

  function updateWorkCue(page) {
    if (!workCue) {
      syncChromeHeight();
      return;
    }
    if (!workMode) {
      workCue.hidden = true;
      workCue.textContent = "";
      farbrengenLine.classList.remove("has-work-cue");
      syncChromeHeight();
      return;
    }
    var rec = workByN[page.n];
    var text = workLabel(rec);
    if (!text) {
      workCue.hidden = true;
      workCue.textContent = "";
      farbrengenLine.classList.remove("has-work-cue");
      syncChromeHeight();
      return;
    }
    workCue.hidden = false;
    workCue.textContent = text;
    farbrengenLine.classList.add("has-work-cue");
    syncChromeHeight();
  }

  function updateFarbrengenLine(page) {
    var g = groupForPage(page.n);
    var title = "";
    if (g) title = g.title || g.label || "";
    else if (page.sicha) title = page.sicha;
    if (farbrengenTitle) farbrengenTitle.textContent = title;
    else farbrengenLine.textContent = title;
    farbrengenLine.classList.toggle("is-empty", !title);
    farbrengenLine.classList.toggle("has-retype", isFarbrengenGroup(g));
    if (retypeGroupBtn) {
      retypeGroupBtn.hidden = !isFarbrengenGroup(g);
    }
    updateWorkCue(page);
  }

  function noteableParagraphs(root) {
    return Array.prototype.filter.call(root.querySelectorAll("p"), function (p) {
      return !p.classList.contains("catchword") && !p.classList.contains("stamp-line");
    });
  }

  function prepareParagraphs(root) {
    var paras = noteableParagraphs(root);
    var i;
    for (i = 0; i < paras.length; i++) {
      paras[i].setAttribute("data-p", String(i));
    }
    return paras;
  }

  function scanUrl(page) {
    return "/" + page.scan;
  }

  function decorateScan(img, priority) {
    if (!img) return;
    img.width = SCAN_W;
    img.height = SCAN_H;
    img.setAttribute("width", String(SCAN_W));
    img.setAttribute("height", String(SCAN_H));
    img.decoding = "async";
    if (priority) img.fetchPriority = "high";
    else if (img.fetchPriority) img.fetchPriority = "auto";
  }

  function prepareScan(src) {
    var hit = scanCache[src];
    if (hit && hit.ready) return Promise.resolve(hit.img);
    if (hit && hit.promise) return hit.promise;
    var img = new Image();
    img.width = SCAN_W;
    img.height = SCAN_H;
    img.decoding = "async";
    img.src = src;
    var entry = { img: img, ready: false, promise: null };
    entry.promise = (img.decode ? img.decode() : Promise.resolve())
      .catch(function () {})
      .then(function () {
        entry.ready = true;
        return img;
      });
    scanCache[src] = entry;
    return entry.promise;
  }

  function swapScan(el, page, priority) {
    if (!el || !page) return;
    decorateScan(el, priority);
    el.alt = "Sichos Kodesh vol. 1, page " + page.n;
    var src = scanUrl(page);
    el.setAttribute("data-n", String(page.n));
    prepareScan(src).then(function () {
      if (el.getAttribute("data-n") !== String(page.n)) return;
      if (el.getAttribute("src") === src) return;
      el.src = src;
    });
  }

  function fillLeaf(page) {
    if (!leafEl || !leafBody) return;
    var ok = hasRetype(page);
    if (quietEl) quietEl.hidden = ok;
    leafEl.hidden = !ok;
    if (!ok) {
      leafEl.classList.remove("is-skeleton");
      leafEl.removeAttribute("aria-hidden");
      return;
    }
    if (leafBody.getAttribute("data-n") === String(page.n) && !leafEl.classList.contains("is-skeleton")) {
      return;
    }
    leafEl.className = "leaf leaf--" + page.type;
    leafEl.lang = "he";
    leafEl.dir = "rtl";
    leafEl.removeAttribute("aria-hidden");
    if (leafPrint) leafPrint.textContent = page.print || "";
    if (leafDraft) leafDraft.hidden = page.status !== "draft";
    if (leafStamp) leafStamp.hidden = page.type !== "body";
    leafBody.innerHTML = page.html;
    leafBody.setAttribute("data-n", String(page.n));
    prepareParagraphs(leafEl);
  }

  function applyViewClasses() {
    document.body.classList.toggle("is-both", view === "both");
    document.body.classList.toggle("is-original", view === "original");
  }

  function fillPageContent(page) {
    fillLeaf(page);
    swapScan(scanImg, page, view === "original");
  }

  function syncChromeHeight() {
    var chrome = document.querySelector(".chrome");
    if (!chrome) return;
    document.documentElement.style.setProperty("--chrome-h", chrome.offsetHeight + "px");
  }

  function watchChrome() {
    var chrome = document.querySelector(".chrome");
    if (!chrome) return;
    syncChromeHeight();
    if (typeof ResizeObserver !== "function") return;
    if (chromeObserver) chromeObserver.disconnect();
    chromeObserver = new ResizeObserver(function () {
      syncChromeHeight();
    });
    chromeObserver.observe(chrome);
  }

  function paintScanBand(img, canvas, index, count) {
    if (!img || !canvas || !img.naturalWidth) return;
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var topSkip = h * 0.08;
    var usable = h - topSkip - h * 0.08;
    var n = Math.max(count, 1);
    var band = usable / n;
    var sy = topSkip + band * index;
    var sh = Math.max(1, band);
    if (sy + sh > h) sh = h - sy;
    canvas.width = w;
    canvas.height = Math.round(sh);
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, sy, w, sh, 0, 0, w, Math.round(sh));
  }

  function followSrc() {
    return bothScanBmp || bothScanImg;
  }

  function srcSize(img) {
    if (!img) return { w: 0, h: 0 };
    if (img.width && img.height) return { w: img.width, h: img.height };
    return { w: img.naturalWidth || 0, h: img.naturalHeight || 0 };
  }

  function ensureCanvasBox(canvas, boxW, boxH) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = boxW > 0 ? boxW : canvas.clientWidth || 320;
    var cssH = boxH > 0 ? boxH : canvas.clientHeight || Math.round(cssW * SCAN_H / SCAN_W);
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    if (w > 1800) {
      h = Math.max(1, Math.round((h * 1800) / w));
      w = 1800;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w: canvas.width, h: canvas.height };
  }

  function drawContained(ctx, img, sx, sy, sw, sh, dw, dh) {
    var scale = Math.min(dw / sw, dh / sh);
    var tw = sw * scale;
    var th = sh * scale;
    var dx = (dw - tw) / 2;
    var dy = (dh - th) / 2;
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, tw, th);
  }

  function paintFullScan(img, canvas) {
    if (!img || !canvas) return;
    var src = srcSize(img);
    if (!src.w) return;
    var box = ensureCanvasBox(
      canvas,
      bothInkBtn ? bothInkBtn.clientWidth : 0,
      bothInkBtn ? bothInkBtn.clientHeight : 0
    );
    drawContained(canvas.getContext("2d"), img, 0, 0, src.w, src.h, box.w, box.h);
  }

  function paintFollowLens(img, canvas, index, count, boxW, boxH) {
    if (!img || !canvas) return;
    var src = srcSize(img);
    if (!src.w) return;
    var w = src.w;
    var h = src.h;
    var topSkip = h * 0.08;
    var usable = Math.max(1, h - topSkip - h * 0.08);
    var n = Math.max(count, 1);
    var band = usable / n;
    var bandSy = topSkip + band * index;
    var bandSh = Math.max(1, band);
    if (bandSy + bandSh > h) bandSh = h - bandSy;
    var sy = bandSy;
    var sh = bandSh;
    var box = ensureCanvasBox(canvas, boxW, boxH);
    if (box.w > 0 && box.h > 0) {
      var need = w * (box.h / box.w);
      if (need > sh) {
        var mid = bandSy + bandSh / 2;
        sh = Math.min(h, need);
        sy = mid - sh / 2;
        if (sy < 0) sy = 0;
        if (sy + sh > h) sy = h - sh;
      }
    }
    drawContained(canvas.getContext("2d"), img, 0, sy, w, sh, box.w, box.h);
  }

  function paintCurrentBand() {
    var src = followSrc();
    if (!src || !bothCanvas) return;
    if (!bothParas.length) {
      paintFullScan(src, bothCanvas);
      return;
    }
    var index = bothIndex < 0 ? 0 : bothIndex;
    var boxW = bothInkBtn ? bothInkBtn.clientWidth : 0;
    var boxH = bothInkBtn ? bothInkBtn.clientHeight : 0;
    paintFollowLens(
      src,
      bothCanvas,
      index,
      bothParas.length,
      boxW,
      boxH
    );
  }

  function bothRailSide() {
    return window.matchMedia("(min-width: 800px)").matches;
  }

  function bothReadingLine() {
    var chrome = document.querySelector(".chrome");
    var top = chrome ? chrome.getBoundingClientRect().bottom : 0;
    if (bothInkBtn && !bothRailSide()) {
      var inkBottom = bothInkBtn.getBoundingClientRect().bottom;
      if (inkBottom > top) top = inkBottom;
    }
    var room = Math.max(48, window.innerHeight - top);
    return top + Math.min(56, room * 0.18);
  }

  function bothRootMargin() {
    var y = bothReadingLine();
    var vh = window.innerHeight || 1;
    var band = Math.max(28, Math.min(64, vh * 0.08));
    var top = Math.max(0, y - band / 2);
    var bottom = Math.max(0, vh - (y + band / 2));
    return "-" + Math.round(top) + "px 0px -" + Math.round(bottom) + "px 0px";
  }

  function showBothBand(index) {
    if (index === bothIndex && bothCanvas && bothCanvas.width) return;
    bothIndex = index;
    paintCurrentBand();
  }

  function pickBothPara() {
    if (!bothParas.length || !followSrc() || !bothCanvas) return;
    var y = bothReadingLine();
    var i;
    var best = 0;
    var bestDist = Infinity;
    for (i = 0; i < bothParas.length; i++) {
      var r = bothParas[i].getBoundingClientRect();
      if (!r.height) continue;
      if (r.top <= y && r.bottom >= y) {
        showBothBand(i);
        return;
      }
      var mid = (r.top + r.bottom) / 2;
      var d = Math.abs(mid - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    showBothBand(best);
  }

  function scheduleBothPick() {
    if (view !== "both") return;
    if (bothPeek && !bothPeek.hidden) return;
    if (bothRaf) return;
    bothRaf = window.requestAnimationFrame(function () {
      bothRaf = 0;
      pickBothPara();
    });
  }

  function startBothObserver() {
    if (bothObserver) {
      bothObserver.disconnect();
      bothObserver = null;
    }
    if (!bothParas.length || typeof IntersectionObserver !== "function") return;
    bothObserver = new IntersectionObserver(
      function () {
        scheduleBothPick();
      },
      { root: null, rootMargin: bothRootMargin(), threshold: [0, 0.25, 0.5, 1] }
    );
    var i;
    for (i = 0; i < bothParas.length; i++) bothObserver.observe(bothParas[i]);
  }

  function stopBothFollow() {
    if (bothObserver) {
      bothObserver.disconnect();
      bothObserver = null;
    }
    if (bothRaf) {
      window.cancelAnimationFrame(bothRaf);
      bothRaf = 0;
    }
    if (inkZoom) inkZoom.reset();
    closeBothPeek();
    bothIndex = -1;
  }

  function setFollowSource(img) {
    bothScanImg = img;
    if (typeof createImageBitmap !== "function") return Promise.resolve(img);
    return createImageBitmap(img)
      .then(function (bmp) {
        if (bothScanImg !== img) {
          if (bmp.close) bmp.close();
          return img;
        }
        if (bothScanBmp && bothScanBmp.close) bothScanBmp.close();
        bothScanBmp = bmp;
        return bmp;
      })
      .catch(function () {
        return img;
      });
  }

  function startBothFollow(page) {
    bothInkBtn = document.getElementById("both-ink") || bothInkBtn;
    bothCanvas = document.getElementById("both-canvas") || bothCanvas;
    var leaf = leafEl || stage.querySelector(".leaf");
    bothParas = leaf && !leaf.hidden ? noteableParagraphs(leaf) : [];
    syncChromeHeight();

    if (!inkZoom && bothInkBtn && bothCanvas) {
      inkZoom = attachPanZoom({
        surface: bothInkBtn,
        target: bothCanvas,
        container: bothInkBtn,
        passScrollAtOne: true,
        wheel: false,
        doubleTap: false,
        zoomedClass: "is-zoomed"
      });
    }

    if (bothPageN === page.n && followSrc()) {
      startBothObserver();
      pickBothPara();
      return;
    }

    bothPageN = page.n;
    bothIndex = -1;
    bothScanImg = null;
    if (bothScanBmp && bothScanBmp.close) {
      bothScanBmp.close();
      bothScanBmp = null;
    }

    prepareScan(scanUrl(page))
      .then(function (img) {
        if (view !== "both" || current !== page.n) return null;
        return setFollowSource(img);
      })
      .then(function (src) {
        if (!src || view !== "both" || current !== page.n) return;
        if (!bothParas.length) {
          paintFullScan(src, bothCanvas);
          return;
        }
        startBothObserver();
        pickBothPara();
      })
      .catch(function () {});
  }

  function dist2(x1, y1, x2, y2) {
    var dx = x1 - x2;
    var dy = y1 - y2;
    return dx * dx + dy * dy;
  }

  function attachPanZoom(opts) {
    var surface = opts.surface;
    var target = opts.target;
    var container = opts.container || surface;
    var minScale = opts.minScale || ZOOM_MIN;
    var maxScale = opts.maxScale || ZOOM_MAX;
    var toggleScale = opts.toggleScale || ZOOM_TOGGLE;
    var st = { scale: 1, x: 0, y: 0 };
    var gestureFlag = false;
    var pointers = {};
    var pointerIds = [];
    var lastDist = 0;
    var lastMidX = 0;
    var lastMidY = 0;
    var lastX = 0;
    var lastY = 0;
    var moved = false;
    var startX = 0;
    var startY = 0;
    var lastTapAt = 0;
    var lastTapX = 0;
    var lastTapY = 0;
    var mouseOn = false;
    var onTarget = false;
    var destroyed = false;
    var touchOpt = { passive: false };

    function apply() {
      if (st.scale === 1 && st.x === 0 && st.y === 0) {
        target.style.transform = "";
      } else {
        target.style.transform =
          "translate(" + st.x + "px, " + st.y + "px) scale(" + st.scale + ")";
      }
      if (opts.zoomedClass) {
        surface.classList.toggle(opts.zoomedClass, st.scale > 1.001);
      }
    }

    function reset() {
      st.scale = 1;
      st.x = 0;
      st.y = 0;
      pointers = {};
      pointerIds = [];
      mouseOn = false;
      moved = false;
      onTarget = false;
      apply();
    }

    function box() {
      var r = target.getBoundingClientRect();
      var s = st.scale || 1;
      return {
        w: r.width / s,
        h: r.height / s,
        cx: r.left + r.width / 2 - st.x,
        cy: r.top + r.height / 2 - st.y
      };
    }

    function clampPan() {
      var c = container.getBoundingClientRect();
      var b = box();
      var visW = b.w * st.scale;
      var visH = b.h * st.scale;
      var maxX = Math.max(0, (visW - c.width) / 2);
      var maxY = Math.max(0, (visH - c.height) / 2);
      if (st.x > maxX) st.x = maxX;
      if (st.x < -maxX) st.x = -maxX;
      if (st.y > maxY) st.y = maxY;
      if (st.y < -maxY) st.y = -maxY;
    }

    function zoomAt(px, py, next) {
      if (next < minScale) next = minScale;
      if (next > maxScale) next = maxScale;
      var b = box();
      var cx = b.cx + st.x;
      var cy = b.cy + st.y;
      var ox = st.scale ? (px - cx) / st.scale : 0;
      var oy = st.scale ? (py - cy) / st.scale : 0;
      st.x = st.x + ox * (st.scale - next);
      st.y = st.y + oy * (st.scale - next);
      st.scale = next;
      if (st.scale <= 1.001) {
        st.scale = 1;
        st.x = 0;
        st.y = 0;
      } else {
        clampPan();
      }
      apply();
    }

    function ignore(e) {
      if (!opts.ignoreSelector) return false;
      var t = e.target;
      if (!t || !t.closest) return false;
      return !!t.closest(opts.ignoreSelector);
    }

    function markOnTarget(e) {
      onTarget = !!(e.target && (e.target === target || (target.contains && target.contains(e.target))));
    }

    function addPtr(id, x, y) {
      if (pointers[id]) {
        pointers[id].x = x;
        pointers[id].y = y;
        return;
      }
      pointers[id] = { x: x, y: y };
      pointerIds.push(id);
    }

    function updatePtr(id, x, y) {
      if (!pointers[id]) return;
      pointers[id].x = x;
      pointers[id].y = y;
    }

    function removePtr(id) {
      if (!pointers[id]) return;
      delete pointers[id];
      var i = pointerIds.indexOf(id);
      if (i >= 0) pointerIds.splice(i, 1);
    }

    function pinchPts() {
      return { a: pointers[pointerIds[0]], b: pointers[pointerIds[1]] };
    }

    function beginPinch() {
      var p = pinchPts();
      if (!p.a || !p.b) return;
      var dx = p.a.x - p.b.x;
      var dy = p.a.y - p.b.y;
      lastDist = Math.sqrt(dx * dx + dy * dy) || 1;
      lastMidX = (p.a.x + p.b.x) / 2;
      lastMidY = (p.a.y + p.b.y) / 2;
    }

    function movePinch() {
      var p = pinchPts();
      if (!p.a || !p.b) return;
      var dx = p.a.x - p.b.x;
      var dy = p.a.y - p.b.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var mx = (p.a.x + p.b.x) / 2;
      var my = (p.a.y + p.b.y) / 2;
      zoomAt(lastMidX, lastMidY, st.scale * (dist / lastDist));
      st.x += mx - lastMidX;
      st.y += my - lastMidY;
      if (st.scale > 1.001) clampPan();
      apply();
      lastDist = dist;
      lastMidX = mx;
      lastMidY = my;
      gestureFlag = true;
      moved = true;
    }

    function maybeDoubleTap(x, y, onEl) {
      if (!opts.doubleTap) return;
      if (opts.doubleTapEl) {
        if (onEl !== opts.doubleTapEl && !(opts.doubleTapEl.contains && opts.doubleTapEl.contains(onEl))) {
          return;
        }
      }
      var now = Date.now();
      if (
        now - lastTapAt < DOUBLE_TAP_MS &&
        dist2(x, y, lastTapX, lastTapY) < DOUBLE_TAP_PX * DOUBLE_TAP_PX
      ) {
        lastTapAt = 0;
        if (st.scale > 1.05) zoomAt(x, y, minScale);
        else zoomAt(x, y, toggleScale);
        gestureFlag = true;
      } else {
        lastTapAt = now;
        lastTapX = x;
        lastTapY = y;
      }
    }

    function onTouchStart(e) {
      if (destroyed) return;
      if (ignore(e)) return;
      markOnTarget(e);
      var i;
      for (i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        addPtr("t" + t.identifier, t.clientX, t.clientY);
      }
      if (pointerIds.length === 1) {
        var p = pointers[pointerIds[0]];
        lastX = p.x;
        lastY = p.y;
        startX = p.x;
        startY = p.y;
        moved = false;
        gestureFlag = false;
      }
      if (pointerIds.length >= 2) {
        e.preventDefault();
        beginPinch();
        gestureFlag = true;
      }
    }

    function onTouchMove(e) {
      if (destroyed) return;
      var i;
      for (i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        updatePtr("t" + t.identifier, t.clientX, t.clientY);
      }
      if (pointerIds.length >= 2) {
        e.preventDefault();
        movePinch();
        return;
      }
      if (pointerIds.length !== 1) return;
      var p = pointers[pointerIds[0]];
      if (dist2(p.x, p.y, startX, startY) > MOVE_PX * MOVE_PX) moved = true;
      if (st.scale > 1.001) {
        e.preventDefault();
        st.x += p.x - lastX;
        st.y += p.y - lastY;
        clampPan();
        apply();
        lastX = p.x;
        lastY = p.y;
        gestureFlag = true;
      } else if (!opts.passScrollAtOne) {
        e.preventDefault();
        if (moved) gestureFlag = true;
      } else if (moved) {
        gestureFlag = true;
      }
    }

    function onTouchEnd(e) {
      if (destroyed) return;
      var i;
      var ended = [];
      for (i = 0; i < e.changedTouches.length; i++) {
        ended.push(e.changedTouches[i]);
        removePtr("t" + e.changedTouches[i].identifier);
      }
      if (pointerIds.length >= 2) {
        beginPinch();
      } else if (pointerIds.length === 1) {
        var p = pointers[pointerIds[0]];
        lastX = p.x;
        lastY = p.y;
        startX = p.x;
        startY = p.y;
      } else if (ended.length === 1 && !moved) {
        maybeDoubleTap(ended[0].clientX, ended[0].clientY, onTarget ? target : e.target);
      }
    }

    function onPointerDown(e) {
      if (destroyed) return;
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      if (ignore(e)) return;
      markOnTarget(e);
      mouseOn = true;
      moved = false;
      gestureFlag = false;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (st.scale > 1.001) e.preventDefault();
    }

    function onPointerMove(e) {
      if (destroyed) return;
      if (!mouseOn) return;
      if (e.pointerType === "touch") return;
      if (dist2(e.clientX, e.clientY, startX, startY) > MOVE_PX * MOVE_PX) moved = true;
      if (st.scale > 1.001) {
        e.preventDefault();
        st.x += e.clientX - lastX;
        st.y += e.clientY - lastY;
        clampPan();
        apply();
        lastX = e.clientX;
        lastY = e.clientY;
        gestureFlag = true;
      } else if (moved && !opts.passScrollAtOne) {
        gestureFlag = true;
      }
    }

    function onPointerUp(e) {
      if (destroyed) return;
      if (e.pointerType === "touch") return;
      if (!mouseOn) return;
      mouseOn = false;
      if (moved) gestureFlag = true;
      else maybeDoubleTap(e.clientX, e.clientY, onTarget ? target : e.target);
    }

    function onWheel(e) {
      if (destroyed) return;
      if (!opts.wheel) return;
      e.preventDefault();
      var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(e.clientX, e.clientY, st.scale * factor);
      gestureFlag = true;
    }

    function onGesture(e) {
      e.preventDefault();
    }

    surface.addEventListener("touchstart", onTouchStart, touchOpt);
    surface.addEventListener("touchmove", onTouchMove, touchOpt);
    surface.addEventListener("touchend", onTouchEnd);
    surface.addEventListener("touchcancel", onTouchEnd);
    surface.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    if (opts.wheel) surface.addEventListener("wheel", onWheel, touchOpt);
    surface.addEventListener("gesturestart", onGesture);
    surface.addEventListener("gesturechange", onGesture);
    surface.addEventListener("gestureend", onGesture);

    return {
      reset: reset,
      destroy: function () {
        destroyed = true;
        mouseOn = false;
        surface.removeEventListener("touchstart", onTouchStart, touchOpt);
        surface.removeEventListener("touchmove", onTouchMove, touchOpt);
        surface.removeEventListener("touchend", onTouchEnd);
        surface.removeEventListener("touchcancel", onTouchEnd);
        surface.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        if (opts.wheel) surface.removeEventListener("wheel", onWheel, touchOpt);
        surface.removeEventListener("gesturestart", onGesture);
        surface.removeEventListener("gesturechange", onGesture);
        surface.removeEventListener("gestureend", onGesture);
        reset();
      },
      consumeGesture: function () {
        var g = gestureFlag;
        gestureFlag = false;
        return g;
      },
      startedOnTarget: function () {
        var v = onTarget;
        onTarget = false;
        return v;
      }
    };
  }

  function openBothPeek() {
    var page = byN[current];
    if (!page || !bothPeek) return;
    closeContents();
    closeDownload();
    closeNote();
    if (peekZoom) peekZoom.reset();
    bothPeekScan.alt = "Original page " + page.n;
    swapScan(bothPeekScan, page, true);
    document.body.classList.add("is-peeking");
    setOverlay(bothPeek, true);
    if (bothInkBtn) bothInkBtn.setAttribute("aria-expanded", "true");
  }

  function closeBothPeek() {
    if (!bothPeek) return;
    if (bothPeek.hidden) {
      document.body.classList.remove("is-peeking");
      if (peekZoom) peekZoom.reset();
      return;
    }
    setOverlay(bothPeek, false);
    document.body.classList.remove("is-peeking");
    if (peekZoom) peekZoom.reset();
    if (bothInkBtn) bothInkBtn.setAttribute("aria-expanded", "false");
  }

  function fillPager(page) {
    if (prevBottom) prevBottom.disabled = current <= minN;
    if (nextBottom) nextBottom.disabled = current >= maxN;
    if (pageInputBottom) {
      pageInputBottom.value = String(page.n);
      pageInputBottom.max = String(maxN);
    }
    if (pagerPrint) pagerPrint.textContent = page.print ? page.print : "";
    if (!pagerNums) return;
    var wanted = [];
    var n;
    for (n = current - 2; n <= current + 2; n++) {
      if (n >= minN && n <= maxN) wanted.push(n);
    }
    while (pagerNums.children.length < wanted.length) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pager-num";
      pagerNums.appendChild(btn);
    }
    while (pagerNums.children.length > wanted.length) {
      pagerNums.removeChild(pagerNums.lastChild);
    }
    var i;
    for (i = 0; i < wanted.length; i++) {
      var node = pagerNums.children[i];
      if (node.getAttribute("data-n") !== String(wanted[i])) {
        node.setAttribute("data-n", String(wanted[i]));
        node.textContent = String(wanted[i]);
      }
      var on = wanted[i] === current;
      node.classList.toggle("is-current", on);
      node.setAttribute("aria-current", on ? "page" : "false");
    }
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function renderChrome(page, pushUrl) {
    current = page.n;
    pageInput.value = String(page.n);
    pageInput.max = String(maxN);
    printEl.textContent = page.print ? page.print : "";
    prevBtn.disabled = current <= minN;
    nextBtn.disabled = current >= maxN;
    fillPager(page);
    setViewButtons();
    updateFarbrengenLine(page);
    applyViewClasses();
    var titleBits = ["שיחות קודש", "page " + page.n];
    if (page.print) titleBits.push(page.print);
    document.title = titleBits.join(" · ");
    persist();
    syncUrl(pushUrl);
    if (!contentsEl.hidden) fillContents();
  }

  function afterPageShown(page) {
    if (view === "both") startBothFollow(page);
    preloadNeighbor(current + 1);
    preloadNeighbor(current - 1);
    renderedN = page.n;
    renderedView = view;
  }

  function applyPageNow(page) {
    if (stageFrame) {
      stageFrame.classList.remove("is-turning-next", "is-turning-prev");
    }
    fillPageContent(page);
    window.scrollTo(0, 0);
  }

  function render(pushUrl, turnDir) {
    var page = byN[current] || pages[0];
    if (!page) return;
    current = page.n;

    var pageChanged = renderedN !== 0 && page.n !== renderedN;
    var prevView = renderedView;

    if (prevView === "both" && view !== "both") {
      stopBothFollow();
    }

    renderChrome(page, pushUrl);

    if (!renderedN) {
      applyPageNow(page);
      afterPageShown(page);
      return;
    }

    if (!pageChanged) {
      if (view === "original") swapScan(scanImg, page, true);
      if (view === "both" && prevView !== "both") startBothFollow(page);
      renderedView = view;
      return;
    }

    if (turnDir == null) turnDir = 0;
    if (!stageFrame || reduceMotion() || !turnDir) {
      applyPageNow(page);
      afterPageShown(page);
      return;
    }

    turnGen += 1;
    var gen = turnGen;
    if (turnTimer) {
      window.clearTimeout(turnTimer);
      turnTimer = 0;
    }
    stageFrame.classList.remove("is-turning-next", "is-turning-prev");
    void stageFrame.offsetWidth;
    stageFrame.classList.add(turnDir > 0 ? "is-turning-next" : "is-turning-prev");
    turnTimer = window.setTimeout(function () {
      turnTimer = 0;
      if (gen !== turnGen) return;
      fillPageContent(page);
      window.scrollTo(0, 0);
      afterPageShown(page);
    }, TURN_SWAP_MS);
  }

  function preloadNeighbor(n) {
    var p = byN[n];
    if (!p) return;
    prepareScan(scanUrl(p));
  }

  function go(n, push) {
    var next = clamp(n);
    if (next === current && push) return;
    var dir = next > current ? 1 : next < current ? -1 : 0;
    current = next;
    render(!!push, dir);
  }

  function jumpFarbrengen(dir) {
    var list = toc.farbrengens || [];
    var starts = list
      .map(function (g) {
        return g.start;
      })
      .sort(function (a, b) {
        return a - b;
      });
    if (!starts.length) return;
    var i;
    if (dir > 0) {
      for (i = 0; i < starts.length; i++) {
        if (starts[i] > current) {
          go(starts[i], true);
          return;
        }
      }
      return;
    }
    var here = null;
    for (i = 0; i < list.length; i++) {
      if (current >= list[i].start && current <= list[i].end) here = list[i];
    }
    if (here && current !== here.start) {
      go(here.start, true);
      return;
    }
    var prev = null;
    for (i = 0; i < starts.length; i++) {
      if (starts[i] < current) prev = starts[i];
    }
    if (prev != null) go(prev, true);
  }

  function pageMetaLine(page) {
    var g = groupForPage(page.n);
    var bits = [];
    if (g && g.title) bits.push(g.title);
    bits.push("page " + page.n);
    if (page.print) bits.push(page.print);
    return bits.join("  ·  ");
  }

  function showFullScan(page) {
    sheetCanvas.hidden = true;
    sheetScan.hidden = false;
    sheetScan.alt = "Original page " + page.n;
    swapScan(sheetScan, page, true);
    sheetInk.hidden = false;
  }

  function cropParagraphInk(page, index, count) {
    sheetScan.hidden = true;
    sheetScan.removeAttribute("src");
    sheetCanvas.hidden = false;
    sheetInk.hidden = false;
    var img = new Image();
    img.onload = function () {
      paintScanBand(img, sheetCanvas, index, count);
    };
    img.onerror = function () {
      showFullScan(page);
    };
    img.src = "/" + page.scan;
  }

  function groupById(id) {
    var list = allGroups();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function selectedDownloadGroup() {
    return groupById(downloadGroup.value);
  }

  function fillDownloadGroups() {
    downloadGroup.replaceChildren();
    var list = allGroups();
    var i;
    for (i = 0; i < list.length; i++) {
      var g = list[i];
      var opt = document.createElement("option");
      opt.value = g.id;
      var name = g.title || g.label || g.id;
      var pr = printRange(g);
      opt.textContent = pr ? name + "  ·  " + pr : name;
      downloadGroup.appendChild(opt);
    }
  }

  function setDownloadKind(kind) {
    downloadKind = kind === "original" || kind === "side-by-side" ? kind : "retype";
    var i;
    for (i = 0; i < downloadKindBtns.length; i++) {
      var btn = downloadKindBtns[i];
      if (!btn) continue;
      var on = btn.getAttribute("data-kind") === downloadKind;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function applyGroupRange(g, fromCurrent) {
    if (!g) return;
    downloadFrom.value = String(fromCurrent ? current : g.start);
    downloadTo.value = String(g.end);
  }

  function setDownloadMode(mode) {
    downloadMode = mode === "pages" ? "pages" : "group";
    var groupOn = downloadMode === "group";
    downloadModeGroupWrap.classList.toggle("is-on", groupOn);
    downloadModeGroupWrap.classList.toggle("is-off", !groupOn);
    downloadModePagesWrap.classList.toggle("is-on", !groupOn);
    downloadModePagesWrap.classList.toggle("is-off", groupOn);
    downloadModeGroupBtn.setAttribute("aria-pressed", groupOn ? "true" : "false");
    downloadModePagesBtn.setAttribute("aria-pressed", groupOn ? "false" : "true");
    downloadGroup.disabled = !groupOn;
    downloadFrom.disabled = groupOn;
    downloadTo.disabled = groupOn;
  }

  function downloadRange() {
    var from;
    var to;
    if (downloadMode === "group") {
      var g = selectedDownloadGroup();
      if (g) {
        from = g.start;
        to = g.end;
      } else {
        from = current;
        to = current;
      }
    } else {
      from = parseInt(downloadFrom.value, 10);
      to = parseInt(downloadTo.value, 10);
    }
    if (!Number.isFinite(from)) from = current;
    if (!Number.isFinite(to)) to = from;
    from = clamp(from);
    to = clamp(to);
    if (to < from) {
      var swap = from;
      from = to;
      to = swap;
    }
    return { from: from, to: to };
  }

  function pagesInRange(from, to) {
    var out = [];
    var n;
    for (n = from; n <= to; n++) {
      if (byN[n]) out.push(byN[n]);
    }
    return out;
  }

  function setDownloadMessage(el, text) {
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function openDownloadSheet() {
    closeContents();
    closeNote();
    closeBothPeek();
    lastFocus = document.activeElement;
    fillDownloadGroups();
    setDownloadKind(view === "both" ? "side-by-side" : view);
    var g = groupForPage(current);
    if (g) {
      downloadGroup.value = g.id;
      applyGroupRange(g, true);
      setDownloadMode("group");
    } else {
      if (downloadGroup.options.length) downloadGroup.selectedIndex = 0;
      downloadFrom.value = String(current);
      downloadTo.value = String(current);
      setDownloadMode("pages");
    }
    downloadKicker.textContent = pageMetaLine(byN[current] || { n: current });
    downloadFrom.min = String(minN);
    downloadFrom.max = String(maxN);
    downloadTo.min = String(minN);
    downloadTo.max = String(maxN);
    setDownloadMessage(downloadStatus, "");
    setDownloadMessage(downloadError, "");
    downloadBusy = false;
    downloadGo.disabled = false;
    setOverlay(downloadSheet, true);
    if (window.SichosPdf && typeof window.SichosPdf.load === "function") {
      window.SichosPdf.load().catch(function () {});
    }
    downloadGo.focus();
  }

  function runDownload() {
    if (downloadBusy) return;
    if (!window.SichosPdf || typeof window.SichosPdf.generate !== "function") {
      setDownloadMessage(downloadError, "The PDF tools could not be opened.");
      return;
    }
    var range = downloadRange();
    var g = downloadMode === "group" ? selectedDownloadGroup() : null;
    var list = pagesInRange(range.from, range.to);
    downloadBusy = true;
    downloadGo.disabled = true;
    setDownloadMessage(downloadError, "");
    setDownloadMessage(downloadStatus, "Setting the pages…");
    window.SichosPdf.generate({
      kind: downloadKind,
      pages: list,
      from: range.from,
      to: range.to,
      groupId: g && g.id,
      useGroup: downloadMode === "group" && !!(g && g.id),
      onStatus: function (msg) {
        setDownloadMessage(downloadStatus, msg);
      }
    })
      .then(function () {
        setDownloadMessage(downloadStatus, "");
      })
      .catch(function (err) {
        if (err && err.aborted) return;
        var msg = (err && err.message) || "The PDF could not be set.";
        setDownloadMessage(downloadError, msg);
        setDownloadMessage(downloadStatus, "");
      })
      .then(function () {
        downloadBusy = false;
        downloadGo.disabled = false;
      });
  }

  function openNoteSheet(opts) {
    opts = opts || {};
    var page = byN[current];
    if (!page) return;
    closeContents();
    closeDownload();
    closeBothPeek();
    lastFocus = document.activeElement;
    noteCtx = {
      page: page,
      quote: opts.quote || "",
      index: typeof opts.index === "number" ? opts.index : null,
      count: typeof opts.count === "number" ? opts.count : null
    };
    sheetKicker.textContent = pageMetaLine(page);
    if (noteCtx.quote) {
      sheetQuote.hidden = false;
      sheetQuote.textContent = noteCtx.quote;
    } else {
      sheetQuote.hidden = true;
      sheetQuote.textContent = "";
    }
    if (noteCtx.index != null && noteCtx.count) {
      cropParagraphInk(page, noteCtx.index, noteCtx.count);
    } else {
      showFullScan(page);
    }
    sheetText.value = "";
    setOverlay(noteSheet, true);
    sheetText.focus();
  }

  function sendNote() {
    var page = (noteCtx && noteCtx.page) || byN[current];
    if (!page) return;
    var g = groupForPage(page.n);
    var lines = [];
    if (g && g.title) lines.push("Farbrengen: " + g.title);
    lines.push("Page: " + page.n);
    if (page.print) lines.push("Print page: " + page.print);
    if (noteCtx && noteCtx.quote) {
      lines.push("");
      lines.push("Paragraph:");
      lines.push(noteCtx.quote);
    }
    lines.push("");
    lines.push("Note:");
    lines.push(sheetText.value || "");
    var subject = "Sichos Kodesh — page " + page.n;
    var href =
      "mailto:" +
      MAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(lines.join("\n"));
    window.location.href = href;
  }

  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holdTarget) {
      holdTarget.classList.remove("is-holding");
      holdTarget = null;
    }
    holdStart = null;
    holdMoved = false;
  }

  function selectionLooksReal() {
    var sel = window.getSelection();
    if (!sel) return false;
    return String(sel).trim().length > 0;
  }

  function paraFromEvent(e) {
    if (view !== "retype" && view !== "both") return null;
    var t = e.target;
    if (!t || !t.closest) return null;
    var p = t.closest("p[data-p]");
    if (!p || !stage.contains(p)) return null;
    return p;
  }

  function openFromParagraph(p) {
    var article = p.closest(".leaf");
    var paras = article ? noteableParagraphs(article) : [];
    var index = paras.indexOf(p);
    if (index < 0) index = parseInt(p.getAttribute("data-p"), 10) || 0;
    openNoteSheet({
      quote: (p.innerText || p.textContent || "").trim(),
      index: index,
      count: Math.max(paras.length, 1)
    });
  }

  function bind() {
    prevBtn.addEventListener("click", function () {
      go(current - 1, true);
    });
    nextBtn.addEventListener("click", function () {
      go(current + 1, true);
    });
    if (prevBottom) {
      prevBottom.addEventListener("click", function () {
        go(current - 1, true);
      });
    }
    if (nextBottom) {
      nextBottom.addEventListener("click", function () {
        go(current + 1, true);
      });
    }
    if (pageInputBottom) {
      pageInputBottom.addEventListener("change", function () {
        go(pageInputBottom.value, true);
      });
    }
    originalBtn.addEventListener("click", function () {
      if (view === "original") return;
      view = "original";
      render(false);
    });
    retypeBtn.addEventListener("click", function () {
      if (view === "retype") return;
      view = "retype";
      render(false);
    });
    bothBtn.addEventListener("click", function () {
      if (view === "both") return;
      view = "both";
      render(false);
    });
    stage.addEventListener("click", function (e) {
      if (view !== "both") return;
      if (!e.target.closest) return;
      if (!e.target.closest(".both-ink")) return;
      if (inkZoom && inkZoom.consumeGesture()) return;
      openBothPeek();
    });
    if (bothPeekClose) {
      bothPeekClose.addEventListener("click", closeBothPeek);
    }
    if (bothPeek && bothPeekScan) {
      bothPeekScan.draggable = false;
      peekZoom = attachPanZoom({
        surface: bothPeek,
        target: bothPeekScan,
        container: bothPeek,
        passScrollAtOne: false,
        wheel: true,
        doubleTap: true,
        doubleTapEl: bothPeekScan,
        ignoreSelector: ".both-peek-close",
        zoomedClass: "is-zoomed"
      });
      bothPeek.addEventListener("click", function (e) {
        if (peekZoom && peekZoom.consumeGesture()) return;
        if (e.target === bothPeekScan) return;
        if (peekZoom && peekZoom.startedOnTarget()) return;
        closeBothPeek();
      });
    }
    window.addEventListener(
      "scroll",
      function () {
        if (view !== "both") return;
        scheduleBothPick();
      },
      { passive: true }
    );
    window.addEventListener("resize", function () {
      if (view !== "both") return;
      window.clearTimeout(bothResizeTimer);
      bothResizeTimer = window.setTimeout(function () {
        bothResizeTimer = 0;
        startBothObserver();
        paintCurrentBand();
        scheduleBothPick();
      }, BOTH_RESIZE_MS);
    });
    if (pagerNums) {
      pagerNums.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target.closest(".pager-num") : null;
        if (!t || t.classList.contains("is-current")) return;
        var n = parseInt(t.getAttribute("data-n") || t.textContent, 10);
        if (Number.isFinite(n)) go(n, true);
      });
    }
    if (stageFrame) {
      stageFrame.addEventListener("animationend", function (e) {
        if (e.target !== stageFrame) return;
        stageFrame.classList.remove("is-turning-next", "is-turning-prev");
      });
    }
    pageInput.addEventListener("change", function () {
      go(pageInput.value, true);
    });
    pageInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        go(pageInput.value, true);
        pageInput.blur();
      }
    });

    openContentsBtn.addEventListener("click", openContents);
    closeContentsBtn.addEventListener("click", closeContents);
    if (farbrengenTitle) {
      farbrengenTitle.addEventListener("click", openContents);
    } else {
      farbrengenLine.addEventListener("click", openContents);
    }
    if (openRetypeBtn) {
      openRetypeBtn.addEventListener("click", function () {
        startMachineJob(current, current);
      });
    }
    if (retypeGroupBtn) {
      retypeGroupBtn.addEventListener("click", function () {
        var g = groupForPage(current);
        if (!g) {
          startMachineJob(current, current);
          return;
        }
        startMachineJob(g.start, g.end);
      });
    }
    contentsEl.addEventListener("click", function (e) {
      if (e.target === contentsEl) closeContents();
    });

    openNoteBtn.addEventListener("click", function () {
      openNoteSheet({});
    });
    sheetClose.addEventListener("click", closeNote);
    sheetSend.addEventListener("click", sendNote);
    noteSheet.addEventListener("click", function (e) {
      if (e.target === noteSheet) closeNote();
    });

    openDownloadBtn.addEventListener("click", function () {
      if (!downloadSheet.hidden) {
        closeDownload();
        return;
      }
      openDownloadSheet();
    });
    downloadClose.addEventListener("click", closeDownload);
    downloadGo.addEventListener("click", runDownload);
    downloadSheet.addEventListener("click", function (e) {
      if (e.target === downloadSheet) closeDownload();
    });
    var ki;
    for (ki = 0; ki < downloadKindBtns.length; ki++) {
      (function (btn) {
        if (!btn) return;
        btn.addEventListener("click", function () {
          setDownloadKind(btn.getAttribute("data-kind"));
        });
      })(downloadKindBtns[ki]);
    }
    downloadModeGroupBtn.addEventListener("click", function () {
      var g = selectedDownloadGroup();
      if (g) applyGroupRange(g, false);
      setDownloadMode("group");
    });
    downloadModePagesBtn.addEventListener("click", function () {
      setDownloadMode("pages");
    });
    downloadGroup.addEventListener("change", function () {
      var g = selectedDownloadGroup();
      if (g) applyGroupRange(g, false);
    });

    stage.addEventListener("pointerdown", function (e) {
      if (overlayOpen()) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var p = paraFromEvent(e);
      if (!p) return;
      cancelHold();
      holdTarget = p;
      holdMoved = false;
      holdStart = { x: e.clientX, y: e.clientY };
      p.classList.add("is-holding");
      holdTimer = setTimeout(function () {
        holdTimer = null;
        if (!holdTarget || holdMoved) return;
        if (selectionLooksReal()) {
          cancelHold();
          return;
        }
        var target = holdTarget;
        target.classList.remove("is-holding");
        holdTarget = null;
        var sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        openFromParagraph(target);
      }, HOLD_MS);
    });

    document.addEventListener("pointermove", function (e) {
      if (!holdStart || !holdTarget) return;
      var dx = e.clientX - holdStart.x;
      var dy = e.clientY - holdStart.y;
      if (dx * dx + dy * dy > MOVE_PX * MOVE_PX) {
        holdMoved = true;
        cancelHold();
      }
    });

    document.addEventListener("pointerup", cancelHold);
    document.addEventListener("pointercancel", cancelHold);

    stage.addEventListener("contextmenu", function (e) {
      if (overlayOpen()) return;
      var p = paraFromEvent(e);
      if (!p) return;
      if (selectionLooksReal()) return;
      e.preventDefault();
      cancelHold();
      openFromParagraph(p);
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (e.key === "Escape") {
        if (!downloadSheet.hidden) {
          e.preventDefault();
          closeDownload();
          return;
        }
        if (!noteSheet.hidden) {
          e.preventDefault();
          closeNote();
          return;
        }
        if (bothPeek && !bothPeek.hidden) {
          e.preventDefault();
          closeBothPeek();
          return;
        }
        if (!contentsEl.hidden) {
          e.preventDefault();
          closeContents();
          return;
        }
      }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (overlayOpen()) return;
      var k = e.key;
      if (k === "ArrowLeft" || k === "h" || k === "H") {
        e.preventDefault();
        go(current - 1, true);
      } else if (k === "ArrowRight" || k === "l" || k === "L") {
        e.preventDefault();
        go(current + 1, true);
      } else if (k === "]") {
        e.preventDefault();
        jumpFarbrengen(1);
      } else if (k === "[") {
        e.preventDefault();
        jumpFarbrengen(-1);
      }
    });

    window.addEventListener("popstate", function (e) {
      if (e.state && typeof e.state.p === "number") {
        current = clamp(e.state.p);
        view = normalizeView(e.state.view);
        workMode = !!e.state.work;
        render(false);
      }
    });
  }

  function wantWork(params) {
    var v = (params || new URLSearchParams(location.search)).get("work");
    return v === "1" || v === "true";
  }

  function bootFromLocation() {
    var params = new URLSearchParams(location.search);
    var stored = readStore();
    var pParam = params.get("p");
    var vParam = params.get("view");
    if (pParam) current = clamp(pParam);
    else if (stored && stored.p) current = clamp(stored.p);
    else current = DEFAULT_PAGE;
    if (vParam) view = normalizeView(vParam);
    else if (stored && stored.view) view = normalizeView(stored.view);
    else view = DEFAULT_VIEW;
    workMode = wantWork(params);
    if (params.get("download") === "1" || params.get("download") === "pdf") {
      window.setTimeout(function () {
        openDownloadSheet();
        var url = new URL(location.href);
        url.searchParams.delete("download");
        history.replaceState({ p: current, view: view, work: workMode }, "", url.pathname + url.search);
      }, 0);
    }
  }

  decorateScan(scanImg, false);
  decorateScan(bothPeekScan, false);
  decorateScan(sheetScan, false);
  watchChrome();
  bind();

  var fetches = [
    fetch(DATA_URL).then(function (res) {
      if (!res.ok) throw new Error("pages.json " + res.status);
      return res.json();
    }),
    fetch(TOC_URL).then(function (res) {
      if (!res.ok) throw new Error("farbrengens.json " + res.status);
      return res.json();
    }).catch(function () {
      return { front: [], farbrengens: [] };
    })
  ];
  if (wantWork()) {
    fetches.push(
      fetch(WORK_URL).then(function (res) {
        if (!res.ok) throw new Error("work.json " + res.status);
        return res.json();
      }).catch(function () {
        return { pages: [] };
      })
    );
  }

  Promise.all(fetches)
    .then(function (pair) {
      pages = pair[0];
      toc = pair[1] || { front: [], farbrengens: [] };
      byN = {};
      workByN = {};
      minN = pages[0].n;
      maxN = pages[0].n;
      var i;
      for (i = 0; i < pages.length; i++) {
        var p = pages[i];
        byN[p.n] = p;
        if (p.n < minN) minN = p.n;
        if (p.n > maxN) maxN = p.n;
      }
      var workPages = pair[2] && pair[2].pages ? pair[2].pages : [];
      for (i = 0; i < workPages.length; i++) {
        workByN[workPages[i].n] = workPages[i];
      }
      applyWorkStore(workByN);
      bootFromLocation();
      render(false);
    })
    .catch(function () {
      var quiet = document.createElement("p");
      quiet.className = "quiet";
      quiet.textContent = "The pages could not be loaded.";
      if (stageFrame) stageFrame.replaceChildren(quiet);
      else stage.replaceChildren(quiet);
    });
})();
