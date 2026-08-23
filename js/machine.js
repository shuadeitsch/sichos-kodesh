function startMachineJob(start, end) {
  var s = parseInt(start, 10);
  var e = parseInt(end, 10);
  if (!Number.isFinite(s)) return;
  if (!Number.isFinite(e) || e < s) e = s;
  var url = "http://127.0.0.1:8765/retype-movie.html?start=" + s + "&end=" + e + "&write=1";
  var w = window.open(url, "sichos-machine");
  if (!w) window.location.href = url; // last resort
}
