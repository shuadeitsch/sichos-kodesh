(function (global) {
  "use strict";

  var LETTER = { width: 612, height: 792 };
  var PAPER = [243 / 255, 238 / 255, 228 / 255];
  var INK = [28 / 255, 25 / 255, 22 / 255];
  var MUTE = [111 / 255, 103 / 255, 92 / 255];
  var HAIRLINE = [201 / 255, 189 / 255, 168 / 255];
  var COLOPHON = "הנחה בלתי מוגה";
  var FONT_REGULAR = "/fonts/MiriamLibre-Static-Regular.ttf";
  var FONT_BOLD = "/fonts/MiriamLibre-Static-Bold.ttf";
  var VENDOR_PDF = "/js/vendor/pdf-lib.min.js";
  var VENDOR_FONTKIT = "/js/vendor/fontkit.umd.min.js";

  var libsPromise = null;
  var fontFileCache = null;
  var aborted = false;

  function rgb(parts) {
    return global.PDFLib.rgb(parts[0], parts[1], parts[2]);
  }

  function tick() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var found = document.querySelector('script[data-sichos-pdf="' + src + '"]');
      if (found) {
        if (found.getAttribute("data-loaded") === "1") resolve();
        else found.addEventListener("load", function () { resolve(); });
        found.addEventListener("error", function () {
          reject(new Error("The PDF library could not be loaded."));
        });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.setAttribute("data-sichos-pdf", src);
      s.onload = function () {
        s.setAttribute("data-loaded", "1");
        resolve();
      };
      s.onerror = function () {
        reject(new Error("The PDF library could not be loaded."));
      };
      document.head.appendChild(s);
    });
  }

  function loadLibs() {
    if (global.PDFLib && (global.fontkit || (global.fontkit && global.fontkit.default))) {
      return Promise.resolve();
    }
    if (libsPromise) return libsPromise;
    libsPromise = Promise.all([loadScript(VENDOR_PDF), loadScript(VENDOR_FONTKIT)]).then(
      function () {
        if (!global.PDFLib) throw new Error("The PDF library could not be loaded.");
      }
    ).catch(function (err) {
      libsPromise = null;
      throw err;
    });
    return libsPromise;
  }

  function fontkitRef() {
    var fk = global.fontkit;
    if (fk && fk.default) return fk.default;
    return fk;
  }

  function copyBuf(buf) {
    return buf.slice(0);
  }

  function loadFontFiles() {
    if (fontFileCache) return Promise.resolve(fontFileCache);
    return Promise.all([
      fetch(FONT_REGULAR).then(function (res) {
        if (!res.ok) throw new Error("The typeface could not be loaded.");
        return res.arrayBuffer();
      }),
      fetch(FONT_BOLD).then(function (res) {
        if (!res.ok) throw new Error("The typeface could not be loaded.");
        return res.arrayBuffer();
      })
    ]).then(function (pair) {
      fontFileCache = { regular: pair[0], bold: pair[1] };
      return fontFileCache;
    });
  }

  function embedFonts(pdf) {
    return loadFontFiles().then(function (files) {
      function embedOne(buf) {
        return pdf.embedFont(copyBuf(buf), { subset: true }).catch(function () {
          return pdf.embedFont(copyBuf(buf), { subset: false });
        });
      }
      return Promise.all([embedOne(files.regular), embedOne(files.bold)]).then(function (fonts) {
        return { regular: fonts[0], bold: fonts[1] };
      });
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("A scan could not be opened."));
      };
      img.src = src;
    });
  }

  function imageToJpgBytes(img, quality) {
    var canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            reject(new Error("A scan could not be prepared."));
            return;
          }
          blob.arrayBuffer().then(resolve, reject);
        },
        "image/jpeg",
        quality == null ? 0.86 : quality
      );
    });
  }

  function embedScan(pdf, page) {
    var src = "/" + page.scan;
    return loadImage(src)
      .then(function (img) {
        return imageToJpgBytes(img);
      })
      .then(function (bytes) {
        return pdf.embedJpg(bytes);
      });
  }

  function isRtlChar(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x0590 && c <= 0x05ff) || (c >= 0xfb1d && c <= 0xfb4f);
  }

  function isLtrChar(ch) {
    var c = ch.charCodeAt(0);
    if (c >= 0x30 && c <= 0x39) return true;
    if (c >= 0x41 && c <= 0x5a) return true;
    if (c >= 0x61 && c <= 0x7a) return true;
    return false;
  }

  function isCombining(ch) {
    var c = ch.charCodeAt(0);
    return (
      (c >= 0x0591 && c <= 0x05bd) ||
      c === 0x05bf ||
      (c >= 0x05c1 && c <= 0x05c2) ||
      (c >= 0x05c4 && c <= 0x05c5) ||
      c === 0x05c7 ||
      (c >= 0x0300 && c <= 0x036f)
    );
  }

  var MIRROR = {
    "(": ")",
    ")": "(",
    "[": "]",
    "]": "[",
    "{": "}",
    "}": "{",
    "<": ">",
    ">": "<"
  };

  function reverseRtl(str) {
    var clusters = [];
    var i;
    for (i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (isCombining(ch) && clusters.length) {
        clusters[clusters.length - 1] += ch;
      } else {
        clusters.push(ch);
      }
    }
    clusters.reverse();
    for (i = 0; i < clusters.length; i++) {
      if (clusters[i].length === 1 && MIRROR[clusters[i]]) {
        clusters[i] = MIRROR[clusters[i]];
      }
    }
    return clusters.join("");
  }

  function charDir(ch) {
    if (isRtlChar(ch)) return "R";
    if (isLtrChar(ch)) return "L";
    return "N";
  }

  function toVisual(logical) {
    if (!logical) return "";
    if (!/[\u0590-\u05FF\uFB1D-\uFB4F]/.test(logical)) return logical;
    var runs = [];
    var cur = "";
    var curType = null;
    var i;
    for (i = 0; i < logical.length; i++) {
      var ch = logical.charAt(i);
      var d = charDir(ch);
      if (d === "N") d = curType === "L" ? "L" : "R";
      if (curType === null) {
        cur = ch;
        curType = d;
      } else if (d === curType) {
        cur += ch;
      } else {
        runs.push({ t: curType, s: cur });
        cur = ch;
        curType = d;
      }
    }
    if (cur) runs.push({ t: curType, s: cur });
    runs.reverse();
    return runs
      .map(function (r) {
        return r.t === "L" ? r.s : reverseRtl(r.s);
      })
      .join("");
  }

  function glyphSafe(font, text) {
    if (!text) return "";
    try {
      font.widthOfTextAtSize(text, 10);
      return text;
    } catch (e) {
      var out = "";
      var i;
      for (i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        try {
          font.widthOfTextAtSize(ch, 10);
          out += ch;
        } catch (err) {}
      }
      return out;
    }
  }

  function fontFor(fonts, bold) {
    return bold ? fonts.bold : fonts.regular;
  }

  function measure(font, text, size) {
    var vis = glyphSafe(font, text);
    if (!vis) return { text: "", width: 0 };
    return { text: vis, width: font.widthOfTextAtSize(vis, size) };
  }

  function runsFromNode(el) {
    var runs = [];
    function walk(n, bold, fix) {
      if (!n) return;
      if (n.nodeType === 3) {
        var t = n.nodeValue;
        if (t) runs.push({ text: t, bold: !!bold, fix: !!fix });
        return;
      }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      var nextBold = bold || tag === "strong" || tag === "b";
      var nextFix = fix || (n.classList && n.classList.contains("fix"));
      var c = n.firstChild;
      while (c) {
        walk(c, nextBold, nextFix);
        c = c.nextSibling;
      }
    }
    var child = el.firstChild;
    while (child) {
      walk(child, false, false);
      child = child.nextSibling;
    }
    return runs;
  }

  function classListOf(el) {
    return " " + (el.className || "") + " ";
  }

  function hasClass(el, name) {
    return classListOf(el).indexOf(" " + name + " ") !== -1;
  }

  function onlyStrongChild(el) {
    var kids = [];
    var c = el.firstChild;
    while (c) {
      if (c.nodeType === 3 && String(c.nodeValue).trim()) return false;
      if (c.nodeType === 1) kids.push(c);
      c = c.nextSibling;
    }
    if (kids.length !== 1) return false;
    var tag = kids[0].tagName.toLowerCase();
    return tag === "strong" || tag === "b";
  }

  function paraKind(el) {
    if (hasClass(el, "entry")) return "entry";
    if (hasClass(el, "display")) return "display";
    if (hasClass(el, "heading")) return "heading";
    if (hasClass(el, "dateline")) return "dateline";
    if (hasClass(el, "kicker")) return "kicker";
    if (hasClass(el, "stamp-line")) return "stamp";
    if (hasClass(el, "catchword")) return "catchword";
    if (hasClass(el, "sidenote")) return "sidenote";
    if (hasClass(el, "fn")) return "fn";
    if (onlyStrongChild(el)) return "heading";
    return "body";
  }

  function blocksFromHtml(html) {
    var host = document.createElement("div");
    host.innerHTML = html || "";
    var blocks = [];

    function walk(node, inFn) {
      var child = node.firstElementChild;
      while (child) {
        var tag = child.tagName.toLowerCase();
        if (tag === "div" && hasClass(child, "titlepage")) {
          walk(child, inFn);
        } else if (tag === "div" && hasClass(child, "footnotes")) {
          blocks.push({ type: "rule" });
          walk(child, true);
        } else if (tag === "div" && hasClass(child, "ornament")) {
          blocks.push({ type: "ornament" });
        } else if (tag === "div" && hasClass(child, "sp")) {
          blocks.push({ type: "space" });
        } else if (tag === "p") {
          if (hasClass(child, "entry")) {
            var textEl = child.querySelector(".entry-text") || child;
            var pageEl = child.querySelector(".entry-page");
            blocks.push({
              type: "entry",
              textRuns: runsFromNode(textEl),
              pageRuns: pageEl ? runsFromNode(pageEl) : []
            });
          } else {
            blocks.push({
              type: "p",
              kind: inFn && paraKind(child) === "body" ? "fn" : paraKind(child),
              runs: runsFromNode(child)
            });
          }
        }
        child = child.nextElementSibling;
      }
    }

    walk(host, false);
    return blocks;
  }

  function tokenize(runs) {
    var tokens = [];
    var i;
    for (i = 0; i < runs.length; i++) {
      var parts = String(runs[i].text).split(/(\s+)/);
      var j;
      for (j = 0; j < parts.length; j++) {
        if (!parts[j]) continue;
        if (/^\s+$/.test(parts[j])) {
          tokens.push({ space: true, bold: runs[i].bold, fix: runs[i].fix });
        } else {
          tokens.push({
            space: false,
            text: parts[j],
            bold: runs[i].bold,
            fix: runs[i].fix
          });
        }
      }
    }
    return tokens;
  }

  function prepareToken(tok, fonts, size) {
    if (tok.space) {
      var sp = measure(fontFor(fonts, tok.bold), " ", size);
      tok.visual = " ";
      tok.width = sp.width || size * 0.28;
      return tok;
    }
    var font = fontFor(fonts, tok.bold);
    var vis = toVisual(tok.text);
    var m = measure(font, vis, size);
    tok.visual = m.text;
    tok.width = m.width;
    return tok;
  }

  function wrapTokens(tokens, fonts, size, maxWidth) {
    var prepared = tokens.map(function (t) {
      return prepareToken(
        {
          space: t.space,
          text: t.text,
          bold: t.bold,
          fix: t.fix
        },
        fonts,
        size
      );
    });
    var lines = [];
    var line = [];
    var lineW = 0;

    function commit() {
      while (line.length && line[0].space) {
        lineW -= line[0].width;
        line.shift();
      }
      while (line.length && line[line.length - 1].space) {
        lineW -= line[line.length - 1].width;
        line.pop();
      }
      if (!line.length) return;
      lines.push({ tokens: line, width: lineW });
      line = [];
      lineW = 0;
    }

    var i;
    for (i = 0; i < prepared.length; i++) {
      var tok = prepared[i];
      if (!line.length && tok.space) continue;
      if (tok.width > maxWidth && !tok.space) {
        commit();
        var font = fontFor(fonts, tok.bold);
        var chars = Array.from(tok.visual || tok.text || "");
        var chunk = "";
        var chunkW = 0;
        var c;
        for (c = 0; c < chars.length; c++) {
          var piece = measure(font, chars[c], size);
          if (chunk && chunkW + piece.width > maxWidth) {
            lines.push({
              tokens: [
                {
                  space: false,
                  visual: chunk,
                  width: chunkW,
                  bold: tok.bold,
                  fix: tok.fix
                }
              ],
              width: chunkW
            });
            chunk = piece.text;
            chunkW = piece.width;
          } else {
            chunk += piece.text;
            chunkW += piece.width;
          }
        }
        if (chunk) {
          line = [
            {
              space: false,
              visual: chunk,
              width: chunkW,
              bold: tok.bold,
              fix: tok.fix
            }
          ];
          lineW = chunkW;
        }
        continue;
      }
      if (line.length && lineW + tok.width > maxWidth) {
        commit();
        if (tok.space) continue;
      }
      line.push(tok);
      lineW += tok.width;
    }
    commit();
    return lines;
  }

  function styleFor(kind, base) {
    var size = base;
    var leading = base * 1.72;
    var gap = base * 0.5;
    var color = INK;
    var align = "start";
    if (kind === "display") {
      size = base * 1.85;
      leading = size * 1.25;
      gap = base * 1.1;
      align = "center";
    } else if (kind === "heading") {
      size = base * 1.12;
      leading = size * 1.55;
      gap = base * 0.95;
      align = "center";
    } else if (kind === "dateline") {
      gap = base * 0.95;
      align = "center";
    } else if (kind === "kicker") {
      size = base * 0.88;
      color = MUTE;
      align = "center";
    } else if (kind === "stamp") {
      size = base * 0.72;
      leading = size * 1.4;
      color = MUTE;
      align = "center";
      gap = base * 0.8;
    } else if (kind === "catchword") {
      size = base * 0.82;
      color = MUTE;
      align = "center";
      gap = base * 1.35;
    } else if (kind === "sidenote" || kind === "fn") {
      size = base * 0.84;
      leading = size * 1.7;
      gap = base * 0.45;
    } else if (kind === "entry") {
      size = base * 0.92;
      leading = size * 1.55;
      gap = base * 0.22;
    }
    return { size: size, leading: leading, gap: gap, color: color, align: align };
  }

  function layoutBlocks(blocks, fonts, width, base) {
    var out = [];
    var i;
    for (i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === "space") {
        out.push({ type: "space", height: base * 0.7 });
        continue;
      }
      if (b.type === "ornament") {
        var ost = styleFor("kicker", base);
        var oText = "· · ·";
        var om = measure(fonts.regular, oText, ost.size);
        out.push({
          type: "ornament",
          text: om.text || oText,
          width: om.width,
          size: ost.size,
          height: ost.leading,
          gap: ost.gap,
          color: MUTE
        });
        continue;
      }
      if (b.type === "rule") {
        out.push({ type: "rule", height: 1, gap: base * 0.85 });
        continue;
      }
      if (b.type === "entry") {
        var est = styleFor("entry", base);
        var textLines = wrapTokens(tokenize(b.textRuns), fonts, est.size, width * 0.78);
        var pageToks = tokenize(b.pageRuns).filter(function (t) {
          return !t.space;
        });
        pageToks.forEach(function (t) {
          prepareToken(t, fonts, est.size);
        });
        var pageW = 0;
        pageToks.forEach(function (t) {
          pageW += t.width;
        });
        out.push({
          type: "entry",
          lines: textLines,
          pageTokens: pageToks,
          pageWidth: pageW,
          size: est.size,
          leading: est.leading,
          gap: est.gap,
          color: est.color,
          height: Math.max(textLines.length, 1) * est.leading
        });
        continue;
      }
      var st = styleFor(b.kind, base);
      var lines = wrapTokens(tokenize(b.runs || []), fonts, st.size, width);
      if (!lines.length) continue;
      out.push({
        type: "p",
        kind: b.kind,
        lines: lines,
        size: st.size,
        leading: st.leading,
        gap: st.gap,
        color: st.color,
        align: st.align,
        height: lines.length * st.leading
      });
    }
    return out;
  }

  function layoutHeight(items) {
    var h = 0;
    var i;
    for (i = 0; i < items.length; i++) {
      h += items[i].height || 0;
      if (i < items.length - 1) h += items[i].gap || 0;
    }
    return h;
  }

  function drawDotted(page, x, y, width, color) {
    var step = 2.15;
    var dx;
    for (dx = 0; dx < width; dx += step) {
      page.drawCircle({
        x: x + dx,
        y: y - 1.15,
        size: 0.32,
        color: color
      });
    }
  }

  function drawLineTokens(page, fonts, line, xRight, y, size, color, maxWidth, justify) {
    var tokens = line.tokens;
    var extra = 0;
    var gaps = 0;
    if (justify && maxWidth && line.width < maxWidth) {
      tokens.forEach(function (t) {
        if (t.space) gaps += 1;
      });
      if (gaps) extra = (maxWidth - line.width) / gaps;
    }
    var x = xRight;
    var i;
    for (i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var w = tok.width + (tok.space ? extra : 0);
      x -= w;
      if (!tok.space && tok.visual) {
        var font = fontFor(fonts, tok.bold);
        page.drawText(tok.visual, {
          x: x,
          y: y,
          size: size,
          font: font,
          color: color
        });
        if (tok.fix) drawDotted(page, x, y, tok.width, color);
      }
    }
  }

  function drawCentered(page, fonts, line, centerX, y, size, color) {
    var xRight = centerX + line.width / 2;
    drawLineTokens(page, fonts, line, xRight, y, size, color, null, false);
  }

  function drawSpacedHebrew(page, font, logical, y, size, color, tracking, pageWidth) {
    var vis = glyphSafe(font, reverseRtl(logical));
    var i;
    var total = 0;
    var widths = [];
    for (i = 0; i < vis.length; i++) {
      var w = font.widthOfTextAtSize(vis.charAt(i), size);
      widths.push(w);
      total += w;
    }
    if (vis.length > 1) total += tracking * (vis.length - 1);
    var x = (pageWidth - total) / 2;
    for (i = 0; i < vis.length; i++) {
      page.drawText(vis.charAt(i), { x: x, y: y, size: size, font: font, color: color });
      x += widths[i] + tracking;
    }
  }

  function paintPaper(page, width, height) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(PAPER)
    });
  }

  function drawFolio(page, fonts, print, width, height) {
    if (!print) return;
    var size = 9;
    var vis = glyphSafe(fonts.regular, toVisual(String(print)));
    if (!vis) return;
    var w = fonts.regular.widthOfTextAtSize(vis, size);
    page.drawText(vis, {
      x: (width - w) / 2,
      y: height - 32,
      size: size,
      font: fonts.regular,
      color: rgb(MUTE)
    });
  }

  function drawColophon(page, fonts, width) {
    drawSpacedHebrew(page, fonts.regular, COLOPHON, 26, 7.2, rgb(MUTE), 1.55, width);
  }

  function paginateItems(items, boxHeight) {
    var pages = [];
    var current = [];
    var used = 0;
    var i;
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      var gap = current.length ? current[current.length - 1].gap || 0 : 0;
      var need = (item.height || 0) + gap;
      if (current.length && used + need > boxHeight && item.type === "p" && item.lines && item.lines.length > 1) {
        var remaining = boxHeight - used - (current.length ? current[current.length - 1].gap || 0 : 0);
        var fit = Math.max(0, Math.floor(remaining / item.leading));
        if (fit > 0 && fit < item.lines.length) {
          var head = {
            type: "p",
            kind: item.kind,
            lines: item.lines.slice(0, fit),
            size: item.size,
            leading: item.leading,
            gap: item.gap,
            color: item.color,
            align: item.align,
            height: fit * item.leading
          };
          current.push(head);
          pages.push(current);
          current = [];
          used = 0;
          item = {
            type: "p",
            kind: item.kind,
            lines: item.lines.slice(fit),
            size: item.size,
            leading: item.leading,
            gap: item.gap,
            color: item.color,
            align: item.align,
            height: (item.lines.length - fit) * item.leading
          };
          need = item.height;
          gap = 0;
        }
      }
      if (current.length && used + need > boxHeight) {
        pages.push(current);
        current = [];
        used = 0;
        gap = 0;
        need = item.height || 0;
      }
      if (gap) used += gap;
      current.push(item);
      used += item.height || 0;
    }
    if (current.length) pages.push(current);
    if (!pages.length) pages.push([]);
    return pages;
  }

  function drawItems(page, fonts, items, box) {
    var yTop = box.top;
    var i;
    var j;
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      if (i) yTop -= items[i - 1].gap || 0;
      if (item.type === "space") {
        yTop -= item.height;
        continue;
      }
      if (item.type === "rule") {
        yTop -= 6;
        page.drawLine({
          start: { x: box.left, y: yTop },
          end: { x: box.left + box.width, y: yTop },
          thickness: 0.6,
          color: rgb(HAIRLINE)
        });
        yTop -= item.height;
        continue;
      }
      if (item.type === "ornament") {
        var oy = yTop - item.size;
        page.drawText(item.text, {
          x: box.left + (box.width - item.width) / 2,
          y: oy,
          size: item.size,
          font: fonts.regular,
          color: rgb(item.color)
        });
        yTop -= item.height;
        continue;
      }
      if (item.type === "entry") {
        for (j = 0; j < item.lines.length; j++) {
          var ly = yTop - item.size - j * item.leading;
          drawLineTokens(
            page,
            fonts,
            item.lines[j],
            box.left + box.width,
            ly,
            item.size,
            rgb(item.color),
            null,
            false
          );
        }
        if (item.pageTokens && item.pageTokens.length) {
          var py = yTop - item.size;
          var px = box.left;
          for (j = 0; j < item.pageTokens.length; j++) {
            var pt = item.pageTokens[j];
            if (!pt.visual) continue;
            page.drawText(pt.visual, {
              x: px,
              y: py,
              size: item.size,
              font: fontFor(fonts, pt.bold),
              color: rgb(item.color)
            });
            px += pt.width;
          }
        }
        yTop -= item.height;
        continue;
      }
      var color = rgb(item.color);
      var last = item.lines.length - 1;
      for (j = 0; j < item.lines.length; j++) {
        var baseline = yTop - item.size - j * item.leading;
        var line = item.lines[j];
        if (item.align === "center") {
          drawCentered(page, fonts, line, box.left + box.width / 2, baseline, item.size, color);
        } else {
          var justify = item.kind === "body" && j !== last && line.tokens.length > 2;
          drawLineTokens(
            page,
            fonts,
            line,
            box.left + box.width,
            baseline,
            item.size,
            color,
            justify ? box.width : null,
            justify
          );
        }
      }
      yTop -= item.height;
    }
  }

  function addOriginalPage(pdf, fonts, rec, img) {
    var w = LETTER.width;
    var h = LETTER.height;
    var page = pdf.addPage([w, h]);
    var footer = rec.print ? 22 : 0;
    var dims = img.scaleToFit(w, h - footer);
    page.drawImage(img, {
      x: (w - dims.width) / 2,
      y: footer + (h - footer - dims.height) / 2,
      width: dims.width,
      height: dims.height
    });
    if (rec.print) {
      var size = 8;
      var vis = glyphSafe(fonts.regular, toVisual(String(rec.print)));
      if (vis) {
        var tw = fonts.regular.widthOfTextAtSize(vis, size);
        page.drawText(vis, {
          x: (w - tw) / 2,
          y: 8,
          size: size,
          font: fonts.regular,
          color: rgb(MUTE)
        });
      }
    }
  }

  function addRetypePages(pdf, fonts, rec, opts) {
    opts = opts || {};
    var w = opts.width || LETTER.width;
    var h = opts.height || LETTER.height;
    var box = opts.box || {
      left: 64,
      width: w - 128,
      top: h - 50,
      height: h - 50 - 50
    };
    var base = opts.base || 12.35;
    var page = pdf.addPage([w, h]);
    paintPaper(page, w, h);
    drawFolio(page, fonts, rec.print, w, h);
    if (rec.type === "body") drawColophon(page, fonts, w);

    if (!rec.html || !String(rec.html).trim()) {
      var msg = "No retype yet.";
      var mw = fonts.regular.widthOfTextAtSize(msg, 11);
      page.drawText(msg, {
        x: box.left + (box.width - mw) / 2,
        y: box.top - 80,
        size: 11,
        font: fonts.regular,
        color: rgb(MUTE)
      });
      return;
    }

    var items = layoutBlocks(blocksFromHtml(rec.html), fonts, box.width, base);
    var sheets = paginateItems(items, box.height);
    drawItems(page, fonts, sheets[0], box);
    var s;
    for (s = 1; s < sheets.length; s++) {
      page = pdf.addPage([w, h]);
      paintPaper(page, w, h);
      drawFolio(page, fonts, rec.print, w, h);
      if (rec.type === "body") drawColophon(page, fonts, w);
      drawItems(page, fonts, sheets[s], box);
    }
  }

  function fitRetypeItems(rec, fonts, width, height, base) {
    if (!rec.html || !String(rec.html).trim()) return { items: [], size: base };
    var size = base;
    var items = layoutBlocks(blocksFromHtml(rec.html), fonts, width, size);
    var guard = 0;
    while (layoutHeight(items) > height && size > 7.2 && guard < 18) {
      size -= 0.45;
      items = layoutBlocks(blocksFromHtml(rec.html), fonts, width, size);
      guard += 1;
    }
    return { items: items, size: size };
  }

  function addSidePage(pdf, fonts, rec, img) {
    var w = LETTER.height;
    var h = LETTER.width;
    var page = pdf.addPage([w, h]);
    paintPaper(page, w, h);
    var mid = w / 2;
    page.drawLine({
      start: { x: mid, y: 28 },
      end: { x: mid, y: h - 28 },
      thickness: 0.7,
      color: rgb(HAIRLINE)
    });

    var pad = 28;
    var scanBox = { x: mid + pad, y: pad, width: mid - pad * 2, height: h - pad * 2 };
    var dims = img.scaleToFit(scanBox.width, scanBox.height);
    page.drawImage(img, {
      x: scanBox.x + (scanBox.width - dims.width) / 2,
      y: scanBox.y + (scanBox.height - dims.height) / 2,
      width: dims.width,
      height: dims.height
    });

    var box = {
      left: 36,
      width: mid - 72,
      top: h - 44,
      height: h - 44 - 44
    };
    drawFolio(page, fonts, rec.print, mid, h);
    if (rec.type === "body") drawSpacedHebrew(page, fonts.regular, COLOPHON, 22, 6.6, rgb(MUTE), 1.35, mid);

    if (!rec.html || !String(rec.html).trim()) {
      var msg = "No retype yet.";
      var mw = fonts.regular.widthOfTextAtSize(msg, 10);
      page.drawText(msg, {
        x: box.left + (box.width - mw) / 2,
        y: box.top - 70,
        size: 10,
        font: fonts.regular,
        color: rgb(MUTE)
      });
      return;
    }

    var fitted = fitRetypeItems(rec, fonts, box.width, box.height, 11.2);
    drawItems(page, fonts, fitted.items, box);
  }

  function downloadBlob(bytes, name) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function includePage(rec, kind) {
    if (!rec) return false;
    if (kind === "original") return true;
    if (rec.type === "skip") return false;
    return true;
  }

  function makeName(kind, from, to, groupId, useGroup) {
    if (useGroup && groupId) {
      return "sichos-kodesh-" + kind + "-" + groupId + ".pdf";
    }
    return "sichos-kodesh-" + kind + "-" + from + "-" + to + ".pdf";
  }

  function abort() {
    aborted = true;
  }

  function generate(opts) {
    aborted = false;
    opts = opts || {};
    var kind = opts.kind || "retype";
    var records = (opts.pages || []).filter(function (p) {
      return includePage(p, kind);
    });
    var onStatus = opts.onStatus || function () {};
    if (!records.length) {
      return Promise.reject(new Error("Those leaves have no retype."));
    }

    onStatus("Setting the pages…");
    return loadLibs()
      .then(function () {
        if (aborted) return Promise.reject({ aborted: true });
        var created = global.PDFLib.PDFDocument.create();
        return Promise.resolve(created).then(function (doc) {
          var fk = fontkitRef();
          if (!fk) throw new Error("The typeface library could not be loaded.");
          doc.registerFontkit(fk);
          return embedFonts(doc).then(function (fonts) {
            var i = 0;
            function next() {
              if (aborted) return Promise.reject({ aborted: true });
              if (i >= records.length) {
                return doc.save().then(function (bytes) {
                  if (aborted) return Promise.reject({ aborted: true });
                  downloadBlob(
                    bytes,
                    makeName(kind, opts.from, opts.to, opts.groupId, opts.useGroup)
                  );
                });
              }
              var rec = records[i];
              i += 1;
              if (records.length > 1) {
                onStatus("Setting page " + rec.n + "…");
              } else {
                onStatus("Setting the pages…");
              }
              var job = Promise.resolve();
              if (kind === "retype") {
                addRetypePages(doc, fonts, rec, {});
              } else if (kind === "original") {
                job = embedScan(doc, rec).then(function (img) {
                  addOriginalPage(doc, fonts, rec, img);
                });
              } else {
                job = embedScan(doc, rec).then(function (img) {
                  if (rec.type === "skip") return;
                  addSidePage(doc, fonts, rec, img);
                });
              }
              return job.then(function () {
                return tick().then(next);
              });
            }
            return next();
          });
        });
      });
  }

  global.SichosPdf = {
    generate: generate,
    abort: abort,
    load: loadLibs
  };
})(window);
