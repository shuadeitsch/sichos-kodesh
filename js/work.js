(function () {
  "use strict";

  var WORK_URL = "/data/work.json";
  var TOC_URL = "/data/farbrengens.json";
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
  var boardEl = document.getElementById("board");

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

  function allTocGroups(toc) {
    return (toc.front || []).concat(toc.farbrengens || []);
  }

  function range(from, to) {
    var out = [];
    var n;
    for (n = from; n <= to; n++) out.push(n);
    return out;
  }

  function groupPages(toc, records) {
    var defined = allTocGroups(toc);
    var used = {};
    var i;
    var n;
    for (i = 0; i < defined.length; i++) {
      for (n = defined[i].start; n <= defined[i].end; n++) used[n] = i;
    }

    var maxN = 0;
    for (i = 0; i < records.length; i++) {
      if (records[i].n > maxN) maxN = records[i].n;
    }

    var frontCount = (toc.front || []).length;
    var out = [];
    n = 1;
    while (n <= maxN) {
      if (used[n] != null) {
        var g = defined[used[n]];
        out.push({
          title: g.title || g.label || g.id,
          label: g.label || g.title,
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
          label: "blank",
          id: null,
          front: true,
          ns: range(start, n - 1)
        });
      }
    }
    return out;
  }

  function hrefFor(n) {
    return "/read/?p=" + n + "&work=1";
  }

  function titleFor(rec) {
    var bits = [LABELS[gradeOf(rec)] || gradeOf(rec)];
    var model = modelOf(rec);
    if (model) bits.push("model " + model);
    if (rec.print) bits.push("print " + rec.print);
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

  function renderCounts(records) {
    var tally = {};
    var i;
    for (i = 0; i < GRADES.length; i++) tally[GRADES[i]] = 0;
    for (i = 0; i < records.length; i++) {
      var g = gradeOf(records[i]);
      tally[g] = (tally[g] || 0) + 1;
    }
    var parts = [];
    for (i = 0; i < GRADES.length; i++) {
      parts.push(LABELS[GRADES[i]] + " " + (tally[GRADES[i]] || 0));
    }
    countsEl.textContent = parts.join(" · ");
  }

  function renderBoard(toc, byN, records) {
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
        var a = document.createElement("a");
        a.className = "pg grade-" + gradeOf(rec);
        a.href = hrefFor(rec.n);
        a.textContent = String(rec.n);
        a.title = titleFor(rec);
        row.appendChild(a);
        if (rec.note && gradeOf(rec) !== "none") {
          notes.push(rec);
        }
      }
      section.appendChild(row);

      if (notes.length) {
        var list = document.createElement("ul");
        list.className = "ledger-notes";
        var seen = {};
        for (i = 0; i < notes.length; i++) {
          var key = notes[i].note;
          if (!seen[key]) {
            seen[key] = [];
          }
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

  renderLegend();

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
      var records = (pair[0] && pair[0].pages) || [];
      var toc = pair[1] || { front: [], farbrengens: [] };
      var byN = {};
      var i;
      for (i = 0; i < records.length; i++) {
        byN[records[i].n] = records[i];
      }
      renderCounts(records);
      renderBoard(toc, byN, records);
    })
    .catch(function () {
      countsEl.textContent = "The work ledger could not be loaded.";
    });
})();
