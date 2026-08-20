(function () {
  "use strict";

  var WORK_URL = "/data/work.json";
  var TOC_URL = "/data/farbrengens.json";
  var STORE_KEY = "sichos-kodesh-work";
  var GRADES = ["none", "bad", "rough", "ok", "good", "verified"];
  var LABELS = {
    none: "none",
    bad: "bad",
    rough: "rough",
    ok: "ok",
    good: "good",
    verified: "verified"
  };

  var countsEl = document.getElementById("counts");
  var legendEl = document.getElementById("legend");
  var modelsEl = document.getElementById("models");
  var boardEl = document.getElementById("board");
  var downloadBtn = document.getElementById("download-ratings");
  var sheetEl = document.getElementById("rate-sheet");
  var kickerEl = document.getElementById("rate-kicker");
  var modelEl = document.getElementById("rate-model");
  var gradesEl = document.getElementById("rate-grades");
  var noteEl = document.getElementById("rate-note");
  var retypeEl = document.getElementById("rate-retype");
  var saveBtn = document.getElementById("rate-save");
  var readBtn = document.getElementById("rate-read");
  var closeBtn = document.getElementById("rate-close");

  var seed = [];
  var seedByN = {};
  var records = [];
  var byN = {};
  var toc = { front: [], farbrengens: [] };
  var currentN = null;

  function gradeOf(rec) {
    var g = rec && rec.grade;
    if (GRADES.indexOf(g) >= 0) return g;
    if (rec && rec.state === "skip") return "none";
    if (rec && rec.state === "verified") return "verified";
    return "ok";
  }

  function modelOf(rec) {
    var m = rec && rec.model != null ? String(rec.model).trim() : "";
    return m;
  }

  function noteOf(rec) {
    return rec && rec.note ? String(rec.note) : "";
  }

  function allTocGroups(data) {
    return (data.front || []).concat(data.farbrengens || []);
  }

  function groupForPage(n) {
    var list = allTocGroups(toc);
    var i;
    for (i = 0; i < list.length; i++) {
      if (n >= list[i].start && n <= list[i].end) return list[i];
    }
    return null;
  }

  function range(from, to) {
    var out = [];
    var n;
    for (n = from; n <= to; n++) out.push(n);
    return out;
  }

  function groupPages(data, list) {
    var defined = allTocGroups(data);
    var used = {};
    var i;
    var n;
    for (i = 0; i < defined.length; i++) {
      for (n = defined[i].start; n <= defined[i].end; n++) used[n] = i;
    }

    var maxN = 0;
    for (i = 0; i < list.length; i++) {
      if (list[i].n > maxN) maxN = list[i].n;
    }

    var frontCount = (data.front || []).length;
    var out = [];
    n = 1;
    while (n <= maxN) {
      if (used[n] != null) {
        var g = defined[used[n]];
        out.push({
          title: g.title || g.label || g.id,
          id: g.id,
          front: used[n] < frontCount,
          ns: range(g.start, g.end)
        });
        n = g.end + 1;
      } else {
        var start = n;
        while (n <= maxN && used[n] == null) n++;
        out.push({
          title: "blank",
          id: null,
          front: true,
          ns: range(start, n - 1)
        });
      }
    }
    return out;
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var data = JSON.parse(raw);
      if (data && data.pages && typeof data.pages === "object") return data.pages;
      if (data && typeof data === "object") return data;
      return {};
    } catch (e) {
      return {};
    }
  }

  function copyRec(src) {
    var out = {
      n: src.n,
      state: src.state,
      grade: src.grade,
      model: src.model,
      print: src.print,
      id: src.id
    };
    if (src.note) out.note = src.note;
    if (src.retype) out.retype = true;
    return out;
  }

  function applyStore() {
    var store = readStore();
    records = [];
    byN = {};
    var i;
    for (i = 0; i < seed.length; i++) {
      var rec = copyRec(seed[i]);
      var local = store[rec.n] || store[String(rec.n)];
      if (local && typeof local === "object") {
        if (local.grade != null) rec.grade = local.grade;
        if (Object.prototype.hasOwnProperty.call(local, "note")) {
          if (local.note) rec.note = String(local.note);
          else delete rec.note;
        }
        rec.retype = !!local.retype;
        if (!rec.retype) delete rec.retype;
      }
      records.push(rec);
      byN[rec.n] = rec;
    }
  }

  function sameNote(a, b) {
    return noteOf(a) === noteOf(b);
  }

  function persist() {
    var pages = {};
    var i;
    for (i = 0; i < records.length; i++) {
      var rec = records[i];
      var base = seedByN[rec.n] || {};
      var changed =
        gradeOf(rec) !== gradeOf(base) ||
        !sameNote(rec, base) ||
        !!rec.retype !== !!base.retype;
      if (!changed) continue;
      pages[String(rec.n)] = {
        grade: gradeOf(rec),
        note: noteOf(rec),
        retype: !!rec.retype
      };
    }
    try {
      if (Object.keys(pages).length) {
        localStorage.setItem(STORE_KEY, JSON.stringify({ pages: pages }));
      } else {
        localStorage.removeItem(STORE_KEY);
      }
    } catch (e) {}
  }

  function titleFor(rec) {
    var bits = [LABELS[gradeOf(rec)] || gradeOf(rec)];
    var model = modelOf(rec);
    if (model) bits.push("model " + model);
    if (rec.print) bits.push("print " + rec.print);
    if (rec.retype) bits.push("queued for retype");
    if (rec.note) bits.push(rec.note);
    return bits.join(" · ");
  }

  function addKicker(text) {
    var h = document.createElement("h2");
    h.className = "ledger-kicker";
    h.lang = "he";
    h.textContent = text;
    boardEl.appendChild(h);
  }

  function renderLegend() {
    if (!legendEl) return;
    legendEl.replaceChildren();
    var i;
    for (i = 0; i < GRADES.length; i++) {
      if (i) legendEl.appendChild(document.createTextNode(" · "));
      var span = document.createElement("span");
      span.className = "pg grade-" + GRADES[i];
      span.textContent = LABELS[GRADES[i]];
      legendEl.appendChild(span);
    }
  }

  function queuedCount(list) {
    var n = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].retype) n += 1;
    }
    return n;
  }

  function renderCounts(list) {
    var tally = {};
    var i;
    for (i = 0; i < GRADES.length; i++) tally[GRADES[i]] = 0;
    for (i = 0; i < list.length; i++) {
      var g = gradeOf(list[i]);
      tally[g] = (tally[g] || 0) + 1;
    }
    var parts = [];
    for (i = 0; i < GRADES.length; i++) {
      parts.push(LABELS[GRADES[i]] + " " + (tally[GRADES[i]] || 0));
    }
    parts.push("queued for retype " + queuedCount(list));
    countsEl.textContent = parts.join(" · ");
  }

  function renderModels(list) {
    if (!modelsEl) return;
    var seen = {};
    var i;
    for (i = 0; i < list.length; i++) {
      seen[modelOf(list[i]) || "unknown"] = true;
    }
    var keys = Object.keys(seen).sort();
    if (keys.length === 1) modelsEl.textContent = "model " + keys[0];
    else modelsEl.textContent = "model mixed — hover a page";
  }

  function renderBoard() {
    boardEl.replaceChildren();
    var groups = groupPages(toc, records);
    var shownFarbrengenKicker = false;
    var gi;
    for (gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      if (!g.front && !shownFarbrengenKicker) {
        addKicker("תש\"י");
        shownFarbrengenKicker = true;
      }

      var section = document.createElement("section");
      section.className = "ledger-group";
      if (g.id) section.id = g.id;

      var head = document.createElement("h3");
      head.className = g.front ? "ledger-head is-front" : "ledger-head";
      if (g.id) {
        head.lang = "he";
        head.dir = "rtl";
      }
      head.textContent = g.title;
      section.appendChild(head);

      var row = document.createElement("p");
      row.className = "ledger-pages";
      var notes = [];
      var i;
      for (i = 0; i < g.ns.length; i++) {
        var rec = byN[g.ns[i]];
        if (!rec) continue;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pg grade-" + gradeOf(rec);
        btn.textContent = String(rec.n);
        btn.title = titleFor(rec);
        btn.setAttribute("aria-label", "Rate page " + rec.n);
        (function (n) {
          btn.addEventListener("click", function () {
            openSheet(n);
          });
        })(rec.n);
        row.appendChild(btn);
        if (rec.note && rec.note !== "blank") notes.push(rec);
      }
      section.appendChild(row);

      if (notes.length) {
        var list = document.createElement("ul");
        list.className = "ledger-notes";
        var seen = {};
        for (i = 0; i < notes.length; i++) {
          var key = notes[i].note;
          if (!seen[key]) seen[key] = [];
          seen[key].push(notes[i].n);
        }
        var keys = Object.keys(seen);
        for (i = 0; i < keys.length; i++) {
          var li = document.createElement("li");
          var nums = seen[keys[i]];
          var span = document.createElement("span");
          span.className = "ledger-note-pages";
          span.textContent = nums[0] + (nums.length > 1 ? "–" + nums[nums.length - 1] : "");
          li.appendChild(span);
          li.appendChild(document.createTextNode("  " + keys[i]));
          list.appendChild(li);
        }
        section.appendChild(list);
      }

      boardEl.appendChild(section);
    }
  }

  function paint() {
    renderCounts(records);
    renderModels(records);
    renderBoard();
  }

  function setGradeButtons(grade) {
    var btns = gradesEl.querySelectorAll(".sheet-choice");
    var i;
    for (i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-grade") === grade;
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function fillGradeButtons() {
    gradesEl.replaceChildren();
    var i;
    for (i = 0; i < GRADES.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-choice grade-" + GRADES[i];
      btn.setAttribute("data-grade", GRADES[i]);
      btn.textContent = LABELS[GRADES[i]];
      btn.addEventListener("click", function (ev) {
        var rec = currentN != null ? byN[currentN] : null;
        if (!rec) return;
        rec.grade = ev.currentTarget.getAttribute("data-grade");
        if (rec.grade === "verified") rec.state = "verified";
        else if (rec.grade === "none") rec.state = "skip";
        else if (rec.grade === "bad" || rec.grade === "rough") rec.state = "needs-work";
        else rec.state = "typed";
        takeNoteFromSheet();
        setGradeButtons(rec.grade);
        persist();
      });
      gradesEl.appendChild(btn);
    }
  }

  function pageMetaLine(rec) {
    var g = groupForPage(rec.n);
    var bits = [];
    if (g && g.title) bits.push(g.title);
    bits.push("page " + rec.n);
    if (rec.print) bits.push(rec.print);
    return bits.join("  ·  ");
  }

  function openSheet(n) {
    var rec = byN[n];
    if (!rec) return;
    currentN = n;
    kickerEl.textContent = pageMetaLine(rec);
    var model = modelOf(rec) || "unknown";
    modelEl.textContent = "model " + model;
    setGradeButtons(gradeOf(rec));
    noteEl.value = noteOf(rec) === "blank" ? "" : noteOf(rec);
    retypeEl.checked = !!rec.retype;
    sheetEl.hidden = false;
    var active = gradesEl.querySelector(".sheet-choice.is-active");
    if (active) active.focus();
    else noteEl.focus();
  }

  function takeNoteFromSheet() {
    var rec = currentN != null ? byN[currentN] : null;
    if (!rec) return;
    var text = String(noteEl.value || "").trim();
    if (text) rec.note = text;
    else delete rec.note;
    rec.retype = !!retypeEl.checked;
    if (!rec.retype) delete rec.retype;
  }

  function focusPageButton(n) {
    var btns = boardEl.querySelectorAll(".pg");
    var i;
    for (i = 0; i < btns.length; i++) {
      if (btns[i].textContent === String(n)) {
        btns[i].focus();
        return;
      }
    }
  }

  function closeSheet() {
    var n = currentN;
    takeNoteFromSheet();
    persist();
    sheetEl.hidden = true;
    currentN = null;
    paint();
    if (n != null) focusPageButton(n);
  }

  function saveSheet() {
    closeSheet();
  }

  function openRead() {
    var n = currentN;
    takeNoteFromSheet();
    persist();
    if (n == null) return;
    window.location.href = "/read/?p=" + n + "&work=1";
  }

  function exportPayload() {
    var pages = [];
    var i;
    for (i = 0; i < records.length; i++) {
      var rec = records[i];
      var row = {
        n: rec.n,
        state: rec.state,
        grade: gradeOf(rec),
        model: modelOf(rec) || "unknown",
        print: rec.print == null ? null : rec.print,
        id: rec.id == null ? null : rec.id
      };
      if (noteOf(rec)) row.note = rec.note;
      if (rec.retype) row.retype = true;
      pages.push(row);
    }
    return { pages: pages };
  }

  function downloadRatings() {
    takeNoteFromSheet();
    persist();
    var text = JSON.stringify(exportPayload(), null, 2) + "\n";
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "sichos-kodesh-work.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function bind() {
    fillGradeButtons();
    saveBtn.addEventListener("click", saveSheet);
    closeBtn.addEventListener("click", closeSheet);
    readBtn.addEventListener("click", openRead);
    downloadBtn.addEventListener("click", downloadRatings);
    retypeEl.addEventListener("change", function () {
      var rec = currentN != null ? byN[currentN] : null;
      if (!rec) return;
      rec.retype = !!retypeEl.checked;
      if (!rec.retype) delete rec.retype;
      takeNoteFromSheet();
      persist();
    });
    sheetEl.addEventListener("click", function (e) {
      if (e.target === sheetEl) closeSheet();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !sheetEl.hidden) {
        e.preventDefault();
        closeSheet();
      }
    });
  }

  renderLegend();
  bind();

  Promise.all([
    fetch(WORK_URL).then(function (res) {
      if (!res.ok) throw new Error("work.json " + res.status);
      return res.json();
    }),
    fetch(TOC_URL).then(function (res) {
      if (!res.ok) throw new Error("farbrengens.json " + res.status);
      return res.json();
    })
  ])
    .then(function (pair) {
      seed = ((pair[0] && pair[0].pages) || []).map(copyRec);
      seedByN = {};
      var i;
      for (i = 0; i < seed.length; i++) seedByN[seed[i].n] = seed[i];
      toc = pair[1] || { front: [], farbrengens: [] };
      applyStore();
      paint();
      var pParam = parseInt(new URLSearchParams(location.search).get("p"), 10);
      if (Number.isFinite(pParam) && byN[pParam]) openSheet(pParam);
    })
    .catch(function () {
      countsEl.textContent = "The work ledger could not be loaded.";
    });
})();
