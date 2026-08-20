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
  var originalBtn = document.getElementById("view-original");
  var retypeBtn = document.getElementById("view-retype");
  var farbrengenLine = document.getElementById("farbrengen-line");
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
    return v === "original" ? "original" : "retype";
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
    originalBtn.setAttribute("aria-pressed", view === "original" ? "true" : "false");
    retypeBtn.setAttribute("aria-pressed", view === "retype" ? "true" : "false");
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

  function printRange(g) {
    if (!g) return "";
    var a = g.printStart || "";
    var b = g.printEnd || "";
    if (a && b && a !== b) return a + "–" + b;
    return a || b || "";
  }

  function overlayOpen() {
    return !contentsEl.hidden || !noteSheet.hidden || !downloadSheet.hidden;
  }

  function setOverlay(el, open) {
    el.hidden = !open;
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
  }

  function fillContents() {
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
  }

  function openContents() {
    if (!contentsEl.hidden) {
      closeContents();
      return;
    }
    closeNote();
    closeDownload();
    fillContents();
    setOverlay(contentsEl, true);
    openContentsBtn.setAttribute("aria-expanded", "true");
    closeContentsBtn.focus();
  }

  function workLabel(rec) {
    if (!rec) return "";
    var st = rec.state === "needs-work" ? "needs work" : rec.state;
    if (rec.note) return st + " · " + rec.note;
    return st;
  }

  function updateWorkCue(page) {
    if (!workCue) return;
    if (!workMode) {
      workCue.hidden = true;
      workCue.textContent = "";
      farbrengenLine.classList.remove("has-work-cue");
      return;
    }
    var rec = workByN[page.n];
    var text = workLabel(rec);
    if (!text) {
      workCue.hidden = true;
      workCue.textContent = "";
      farbrengenLine.classList.remove("has-work-cue");
      return;
    }
    workCue.hidden = false;
    workCue.textContent = text;
    farbrengenLine.classList.add("has-work-cue");
  }

  function updateFarbrengenLine(page) {
    var g = groupForPage(page.n);
    var title = "";
    if (g) title = g.title || g.label || "";
    else if (page.sicha) title = page.sicha;
    farbrengenLine.textContent = title;
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

  function render(pushUrl) {
    var page = byN[current] || pages[0];
    if (!page) return;
    current = page.n;

    pageInput.value = String(page.n);
    pageInput.max = String(maxN);
    printEl.textContent = page.print ? page.print : "";
    prevBtn.disabled = current <= minN;
    nextBtn.disabled = current >= maxN;
    setViewButtons();
    updateFarbrengenLine(page);

    var titleBits = ["שיחות קודש", "page " + page.n];
    if (page.print) titleBits.push(page.print);
    document.title = titleBits.join(" · ");

    stage.replaceChildren();

    if (view === "original") {
      var wrap = document.createElement("div");
      wrap.className = "scan-stage";
      var img = document.createElement("img");
      img.src = "/" + page.scan;
      img.alt = "Sichos Kodesh vol. 1, page " + page.n;
      img.decoding = "async";
      wrap.appendChild(img);
      stage.appendChild(wrap);
      preloadNeighbor(current + 1);
      preloadNeighbor(current - 1);
    } else if (!hasRetype(page)) {
      var quiet = document.createElement("p");
      quiet.className = "quiet";
      quiet.lang = "en";
      quiet.textContent = "No retype for this page.";
      stage.appendChild(quiet);
    } else {
      var article = document.createElement("article");
      article.className = "leaf leaf--" + page.type;
      article.lang = "he";
      article.dir = "rtl";

      if (page.print) {
        var folio = document.createElement("span");
        folio.className = "leaf-print";
        folio.textContent = page.print;
        article.appendChild(folio);
      }

      if (page.status === "draft") {
        var draft = document.createElement("span");
        draft.className = "leaf-draft";
        draft.lang = "en";
        draft.textContent = "draft";
        article.appendChild(draft);
      }

      if (page.type === "body") {
        var stamp = document.createElement("div");
        stamp.className = "leaf-stamp";
        stamp.textContent = "הנחה בלתי מוגה";
        article.appendChild(stamp);
      }

      var body = document.createElement("div");
      body.className = "leaf-body";
      body.innerHTML = page.html;
      article.appendChild(body);
      stage.appendChild(article);
      prepareParagraphs(article);
    }

    persist();
    syncUrl(pushUrl);
    if (!contentsEl.hidden) fillContents();
  }

  function preloadNeighbor(n) {
    var p = byN[n];
    if (!p) return;
    var img = new Image();
    img.src = "/" + p.scan;
  }

  function go(n, push) {
    var next = clamp(n);
    if (next === current && push) return;
    current = next;
    render(!!push);
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
    sheetScan.src = "/" + page.scan;
    sheetScan.alt = "Original page " + page.n;
    sheetInk.hidden = false;
  }

  function cropParagraphInk(page, index, count) {
    sheetScan.hidden = true;
    sheetScan.removeAttribute("src");
    sheetCanvas.hidden = false;
    sheetInk.hidden = false;
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      var topSkip = h * 0.08;
      var usable = h - topSkip - h * 0.08;
      var n = Math.max(count, 1);
      var band = usable / n;
      var sy = topSkip + band * index;
      var sh = Math.max(1, band);
      if (sy + sh > h) sh = h - sy;
      sheetCanvas.width = w;
      sheetCanvas.height = Math.round(sh);
      var ctx = sheetCanvas.getContext("2d");
      ctx.drawImage(img, 0, sy, w, sh, 0, 0, w, Math.round(sh));
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
    lastFocus = document.activeElement;
    fillDownloadGroups();
    setDownloadKind(view);
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
    if (view !== "retype") return null;
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
    farbrengenLine.addEventListener("click", openContents);
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
      bootFromLocation();
      render(false);
    })
    .catch(function () {
      var quiet = document.createElement("p");
      quiet.className = "quiet";
      quiet.textContent = "The pages could not be loaded.";
      stage.replaceChildren(quiet);
    });
})();
