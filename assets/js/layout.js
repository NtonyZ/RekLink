/* forus.by — общая шапка и подвал, единые для всех страниц витрины. */
(function (global) {
  "use strict";

  var NAV = [
    { href: "catalog.html", label: "Каталог" },
    { href: "map.html", label: "Карта" },
    { href: "calculator.html", label: "Калькулятор" },
    { href: "formats.html", label: "Форматы рекламы" },
    { href: "mediaplan.html", label: "Медиаплан" },
    { href: "cabinet.html", label: "Личный кабинет" }
  ];

  // Вход/регистрация в шапке. Имя вошедшего клиента ведёт в кабинет.
  function authLink() {
    if (!global.RL_AUTH) return "";
    var u = RL_AUTH.current();
    if (!u) return '<a href="register.html" class="btn btn-ghost btn-sm">Войти</a>';
    var label = (u.company || u.name || u.phone);
    if (label.length > 18) label = label.slice(0, 17) + "…";
    return '<a href="cabinet.html" class="btn btn-ghost btn-sm" title="' + RL_UTIL.escapeHtml(u.phone) + '">' + RL_UTIL.escapeHtml(label) + "</a>";
  }

  function renderHeader(active) {
    var el = document.getElementById("site-header");
    if (!el) return;
    var count = RL_UTIL.mpCount();
    var links = NAV.map(function (n) {
      var cls = n.href === active ? "active" : "";
      var extra = n.href === "mediaplan.html" && count > 0 ? ' <span class="badge badge-gold" id="mp-count-badge">' + count + "</span>" : "";
      return '<a href="' + n.href + '" class="' + cls + '">' + n.label + extra + "</a>";
    }).join("");
    el.innerHTML =
      '<div class="container inner">' +
        '<a href="index.html" class="logo"><span class="mark">Ф</span>forus.by</a>' +
        '<nav class="main-nav">' + links + "</nav>" +
        '<div class="header-cta">' +
          authLink() +
          '<a href="mediaplan.html" class="btn btn-ghost btn-sm">Медиаплан' + (count ? " (" + count + ")" : "") + "</a>" +
          '<a href="podbor.html" class="btn btn-primary btn-sm">Подобрать место</a>' +
        "</div>" +
        '<button class="burger" id="burger-btn" aria-label="Меню">☰</button>' +
      "</div>" +
      '<nav class="mobile-nav" id="mobile-nav">' + links + '<a href="podbor.html" class="btn btn-primary btn-block mt-24">Подобрать место</a>' + "</nav>";

    var burger = document.getElementById("burger-btn");
    var mnav = document.getElementById("mobile-nav");
    if (burger) {
      burger.addEventListener("click", function () { mnav.classList.toggle("open"); });
      mnav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { mnav.classList.remove("open"); }); });
    }
  }

  // Сквозная полоса шагов: клиент всегда видит, на каком этапе он находится и что дальше.
  // Активный шаг задаётся на странице через <div id="site-steps" data-step="N">.
  var STEPS = [
    { n: 1, label: "Выбор площадок", href: "podbor.html" },
    { n: 2, label: "Медиаплан", href: "mediaplan.html" },
    { n: 3, label: "Заявка", href: "mediaplan.html#apply-form" }
  ];

  function renderSteps() {
    var el = document.getElementById("site-steps");
    if (!el) return;
    var active = parseInt(el.getAttribute("data-step"), 10) || 1;
    var count = RL_UTIL.mpCount();
    var html = STEPS.map(function (s) {
      var state = s.n < active ? "done" : (s.n === active ? "active" : "next");
      // Пока подборка пуста, шаги 2 и 3 недостижимы — показываем их, но не ведём в пустоту.
      var reachable = s.n === 1 || count > 0 || s.n <= active;
      var badge = s.n === 2 && count ? '<em class="step-count">' + count + "</em>" : "";
      var inner = '<span class="step-n">' + (state === "done" ? "✓" : s.n) + "</span>" +
                  '<span class="step-label">' + s.label + "</span>" + badge;
      return reachable
        ? '<a class="step-chip ' + state + '" href="' + s.href + '">' + inner + "</a>"
        : '<span class="step-chip ' + state + ' disabled">' + inner + "</span>";
    }).join('<span class="step-sep" aria-hidden="true">→</span>');
    el.innerHTML = '<div class="container steps-inner">' + html + "</div>";
  }

  function renderFooter() {
    var el = document.getElementById("site-footer");
    if (!el) return;
    var s = RL.seller;
    el.innerHTML =
      '<div class="container">' +
        '<div class="footer-grid">' +
          '<div><a href="index.html" class="logo" style="color:#fff"><span class="mark">Ф</span>forus.by</a>' +
            '<p style="margin-top:14px;max-width:280px">Портал продаж рекламного инвентаря ' + s.publicTitle + '. Indoor и outdoor реклама в Витебске и Беларуси.</p></div>' +
          '<div><h4>Рекламные места</h4><ul>' +
            '<li><a href="catalog.html?format=poster_static">Статичный плакат</a></li>' +
            '<li><a href="catalog.html?format=poster_dynamic">Динамический скроллер</a></li>' +
            '<li><a href="catalog.html?format=media_poster">Медиа-скроллер</a></li>' +
            '<li><a href="catalog.html?format=led_screen">LED-экраны 6×3</a></li>' +
            '<li><a href="formats.html">Все форматы</a></li>' +
          "</ul></div>" +
          '<div><h4>Портал</h4><ul>' +
            '<li><a href="calculator.html">Калькулятор бюджета</a></li>' +
            '<li><a href="mediaplan.html">Медиаплан</a></li>' +
            '<li><a href="cabinet.html">Личный кабинет</a></li>' +
            '<li><a href="info.html">Требования к макетам</a></li>' +
            '<li><a href="info.html#offer">Публичная оферта</a></li>' +
            '<li><a href="info.html#privacy">Политика обработки персональных данных</a></li>' +
          "</ul></div>" +
          '<div><h4>Контакты</h4><ul>' +
            '<li>' + s.address + "</li>" +
            '<li><a href="tel:' + s.phone.replace(/[^\d+]/g, "") + '">' + s.phone + "</a></li>" +
            '<li><a href="mailto:' + s.email + '">' + s.email + "</a></li>" +
            "<li>" + s.workHours + "</li>" +
          "</ul></div>" +
        "</div>" +
        '<div class="footer-bottom">' +
          "<span>© " + new Date().getFullYear() + " " + s.title + ". Продажа собственного рекламного инвентаря. Прототип портала forus.by по ТЗ v5.0.</span>" +
          '<span>НДС не облагается · <a href="admin.html" style="color:inherit">Адресная программа (для сотрудников)</a></span>' +
        "</div>" +
      "</div>";
  }

  global.RL_LAYOUT = {
    render: function (active) { renderHeader(active); renderSteps(); renderFooter(); },
    renderSteps: renderSteps
  };
})(window);
