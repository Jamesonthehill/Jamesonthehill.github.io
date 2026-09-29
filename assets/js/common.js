$(document).ready(function(){if($("a.abstract").click(function(){$(this).parent().parent().find(".abstract.hidden").toggleClass("open"),$(this).parent().parent().find(".award.hidden.open").toggleClass("open"),$(this).parent().parent().find(".bibtex.hidden.open").toggleClass("open")}),$("a.award").click(function(){$(this).parent().parent().find(".abstract.hidden.open").toggleClass("open"),$(this).parent().parent().find(".award.hidden").toggleClass("open"),$(this).parent().parent().find(".bibtex.hidden.open").toggleClass("open")}),$("a.bibtex").click(function(){$(this).parent().parent().find(".abstract.hidden.open").toggleClass("open"),$(this).parent().parent().find(".award.hidden.open").toggleClass("open"),$(this).parent().parent().find(".bibtex.hidden").toggleClass("open")}),$("a").removeClass("waves-effect waves-light"),$("#toc-sidebar").length){$(".publications h2").each(function(){$(this).attr("data-toc-skip","")});var e="#toc-sidebar",t=$(e);Toc.init(t),$("body").scrollspy({target:e})}const n=document.createElement("link");n.href="../css/jupyter.css",n.rel="stylesheet",n.type="text/css";let a=determineComputedTheme();$(".jupyter-notebook-iframe-container iframe").each(function(){$(this).contents().find("head").append(n),"dark"==a&&$(this).bind("load",function(){$(this).contents().find("body").attr({"data-jp-theme-light":"false","data-jp-theme-name":"JupyterLab Dark"})})}),$('[data-toggle="popover"]').popover({trigger:"hover"})});

/* Portfolio refresh: keep the site identity visible across every generated page. */
document.addEventListener("DOMContentLoaded", function () {
  var navContainer = document.querySelector("#navbar > .container");
  var brand = navContainer && navContainer.querySelector(".navbar-brand");
  if (navContainer && !brand) {
    brand = document.createElement("a");
    brand.className = "navbar-brand title";
    brand.href = "/";
    brand.setAttribute("aria-label", "Geonwoo Lee — home");
    brand.textContent = "Geonwoo Lee";
    navContainer.insertBefore(brand, navContainer.firstChild);
  }

  if (brand) {
    brand.textContent = "Geonwoo Lee";
    brand.setAttribute("aria-label", "Geonwoo Lee — home");
  }

  var navList = document.querySelector("#navbar .navbar-nav");
  if (navList) {
    var navLinks = Array.from(navList.querySelectorAll(".nav-link[href]"));
    var hiddenLegacyItems = ["publications", "repositories", "teaching", "people"];

    navLinks.forEach(function (link) {
      var label = link.textContent.trim().toLowerCase().replace("(current)", "").trim();
      if (hiddenLegacyItems.indexOf(label) !== -1) {
        link.closest(".nav-item").hidden = true;
      } else if (label === "blog") {
        link.href = "https://chocoboy.tistory.com/";
      } else if (label === "cv") {
        link.href = "/assets/pdf/GeonwooLee_CV.pdf";
      }
    });

    var addNavItem = function (label, href, beforeItem) {
      var item = document.createElement("li");
      item.className = "nav-item";
      var link = document.createElement("a");
      link.className = "nav-link";
      link.href = href;
      link.textContent = label;
      item.appendChild(link);
      navList.insertBefore(item, beforeItem || navList.querySelector(".toggle-container"));
    };

    var projectsLink = Array.from(navList.querySelectorAll(".nav-link[href]")).find(function (link) {
      return link.textContent.trim().toLowerCase().replace("(current)", "").trim() === "projects";
    });
    if (!navList.querySelector('a[href="/projects/6_project/"]')) {
      addNavItem("chat", "/projects/6_project/", projectsLink && projectsLink.closest(".nav-item"));
    }
    if (!navList.querySelector('a[href="/priorities/"]')) {
      addNavItem("Schedule", "/priorities/");
    }
  }

  if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
    document.body.setAttribute("data-portfolio-page", "home");
  }

  var themeContainer = document.querySelector("#navbar .toggle-container");
  if (themeContainer) {
    var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    var savedTheme = localStorage.getItem("portfolio-theme") || localStorage.getItem("theme") || "system";
    if (["light", "dark", "system"].indexOf(savedTheme) === -1) savedTheme = "system";

    themeContainer.innerHTML = "";
    themeContainer.classList.add("theme-picker");

    var themeButton = document.createElement("button");
    themeButton.type = "button";
    themeButton.className = "theme-picker-trigger";
    themeButton.setAttribute("aria-haspopup", "menu");
    themeButton.setAttribute("aria-expanded", "false");

    var themeMenu = document.createElement("div");
    themeMenu.className = "theme-picker-menu";
    themeMenu.setAttribute("role", "menu");
    themeMenu.hidden = true;

    var themeOptions = [
      { value: "light", label: "Light", icon: "☀" },
      { value: "dark", label: "Dark", icon: "◐" },
      { value: "system", label: "System", icon: "◒" }
    ];

    var updateThemeControls = function (preference) {
      var current = themeOptions.find(function (option) { return option.value === preference; });
      themeButton.innerHTML = '<span class="theme-picker-icon" aria-hidden="true">' + current.icon + '</span><span class="theme-picker-label">' + current.label + '</span><span class="theme-picker-chevron" aria-hidden="true">⌄</span>';
      themeButton.setAttribute("aria-label", "Theme: " + current.label + ". Choose appearance");
      themeMenu.querySelectorAll("[data-theme-choice]").forEach(function (option) {
        var selected = option.dataset.themeChoice === preference;
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-checked", String(selected));
      });
    };

    var applyThemePreference = function (preference) {
      var effectiveTheme = preference === "system" ? (systemTheme.matches ? "dark" : "light") : preference;
      localStorage.setItem("portfolio-theme", preference);
      if (typeof setThemeSetting === "function") {
        setThemeSetting(effectiveTheme);
      } else {
        document.documentElement.setAttribute("data-theme", effectiveTheme);
      }
      document.documentElement.setAttribute("data-theme-setting", preference);
      updateThemeControls(preference);
    };

    themeOptions.forEach(function (option) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "theme-picker-option";
      item.dataset.themeChoice = option.value;
      item.setAttribute("role", "menuitemradio");
      item.innerHTML = '<span class="theme-picker-option-icon" aria-hidden="true">' + option.icon + '</span><span>' + option.label + '</span><span class="theme-picker-check" aria-hidden="true">✓</span>';
      item.addEventListener("click", function () {
        savedTheme = option.value;
        applyThemePreference(savedTheme);
        themeMenu.hidden = true;
        themeButton.setAttribute("aria-expanded", "false");
        themeButton.focus();
      });
      themeMenu.appendChild(item);
    });

    themeButton.addEventListener("click", function () {
      var opening = themeMenu.hidden;
      themeMenu.hidden = !opening;
      themeButton.setAttribute("aria-expanded", String(opening));
      if (opening) themeMenu.querySelector(".is-selected").focus();
    });

    themeContainer.appendChild(themeButton);
    themeContainer.appendChild(themeMenu);
    applyThemePreference(savedTheme);

    document.addEventListener("click", function (event) {
      if (!themeContainer.contains(event.target)) {
        themeMenu.hidden = true;
        themeButton.setAttribute("aria-expanded", "false");
      }
    });
    themeContainer.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        themeMenu.hidden = true;
        themeButton.setAttribute("aria-expanded", "false");
        themeButton.focus();
      }
    });
    systemTheme.addEventListener("change", function () {
      if (savedTheme === "system") applyThemePreference("system");
    });
  }
});

/* Subtle pointer feedback for mouse/trackpad users. */
document.addEventListener("DOMContentLoaded", function () {
  if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var aura = document.createElement("div");
  aura.className = "pointer-aura";
  aura.setAttribute("aria-hidden", "true");
  document.body.appendChild(aura);

  var pointerX = -100;
  var pointerY = -100;
  var scheduled = false;
  var interactiveSelector = "a, button, input, select, textarea, .card, .expertise-card";
  var tiltSelector = ".expertise-card, .projects .card";
  var magneticSelector = ".hero-action, .hero-social";

  document.querySelectorAll(tiltSelector).forEach(function (element) {
    element.classList.add("interactive-tilt");
    element.addEventListener("pointermove", function (event) {
      var rect = element.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width;
      var y = (event.clientY - rect.top) / rect.height;
      element.style.setProperty("--tilt-x", ((0.5 - y) * 5).toFixed(2) + "deg");
      element.style.setProperty("--tilt-y", ((x - 0.5) * 6).toFixed(2) + "deg");
      element.style.setProperty("--glow-x", (x * 100).toFixed(1) + "%");
      element.style.setProperty("--glow-y", (y * 100).toFixed(1) + "%");
    });
    element.addEventListener("pointerleave", function () {
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-y", "0deg");
    });
  });

  document.querySelectorAll(magneticSelector).forEach(function (element) {
    element.classList.add("magnetic-target");
    element.addEventListener("pointermove", function (event) {
      var rect = element.getBoundingClientRect();
      element.style.setProperty("--magnetic-x", ((event.clientX - rect.left - rect.width / 2) * 0.1).toFixed(1) + "px");
      element.style.setProperty("--magnetic-y", ((event.clientY - rect.top - rect.height / 2) * 0.12).toFixed(1) + "px");
    });
    element.addEventListener("pointerleave", function () {
      element.style.setProperty("--magnetic-x", "0px");
      element.style.setProperty("--magnetic-y", "0px");
    });
  });

  document.addEventListener("pointermove", function (event) {
    pointerX = event.clientX;
    pointerY = event.clientY;
    aura.classList.add("is-visible");
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(function () {
        aura.style.left = pointerX + "px";
        aura.style.top = pointerY + "px";
        scheduled = false;
      });
    }
    aura.classList.toggle("is-active", Boolean(event.target.closest(interactiveSelector)));
  });

  document.addEventListener("pointerdown", function () { aura.classList.add("is-pressing"); });
  document.addEventListener("pointerup", function () { aura.classList.remove("is-pressing"); });
  document.documentElement.addEventListener("mouseleave", function () { aura.classList.remove("is-visible"); });
});
