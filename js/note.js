(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var p = params.get("p");
  var where = document.getElementById("where");
  var mail = document.getElementById("mailto");
  var back = document.getElementById("back");
  var address = "sichos@agentmail.to";
  var subject = "Sichos Kodesh";
  var body =
    "Page: " +
    (p ? p : "") +
    "\nView: (original / retype)\n\nCorrection:\n\n";

  if (p) {
    subject = "Sichos Kodesh — page " + p;
    where.hidden = false;
    where.innerHTML =
      "You were reading page " +
      p +
      ". <a href=\"/read/?p=" +
      encodeURIComponent(p) +
      "\">Return to the leaf</a>.";
    back.href = "/read/?p=" + encodeURIComponent(p);
  } else {
    where.hidden = true;
    back.href = "/read/";
  }

  mail.href =
    "mailto:" +
    address +
    "?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body);
})();
