(function () {
  var root = document.documentElement, saved = null;
  try { saved = localStorage.getItem("jeux-theme"); } catch (e) {}
  var dark = saved ? saved === "dark" : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme", dark ? "dark" : "light");
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("button");
    b.className = "theme-toggle"; b.type = "button";
    function label() { var d = root.getAttribute("data-theme") === "dark"; b.textContent = d ? "☀️" : "🌙"; b.title = d ? "Mode clair" : "Mode sombre"; }
    b.addEventListener("click", function () {
      var d = root.getAttribute("data-theme") !== "dark";
      root.setAttribute("data-theme", d ? "dark" : "light");
      try { localStorage.setItem("jeux-theme", d ? "dark" : "light"); } catch (e) {}
      label();
    });
    label();
    document.body.appendChild(b);
  });
})();
