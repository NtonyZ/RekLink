/* RekLink.by — калькулятор рекламного бюджета: режимы «от бюджета» и «от подборки». */
(function () {
  "use strict";
  RL_LAYOUT.render("calculator.html");

  var FORMAT_ORDER = ["poster_static", "poster_dynamic", "media_poster", "led_screen"];
  var ALL_ITEMS = RL_UTIL.catalogItems();

  // ---- переключение режимов --------------------------------------------------
  var modeBudgetBtn = document.getElementById("mode-budget");
  var modeSelBtn = document.getElementById("mode-selection");
  modeBudgetBtn.addEventListener("click", function () { setMode("budget"); });
  modeSelBtn.addEventListener("click", function () { setMode("selection"); });
  function setMode(mode) {
    modeBudgetBtn.classList.toggle("active", mode === "budget");
    modeSelBtn.classList.toggle("active", mode === "selection");
    document.getElementById("panel-budget").style.display = mode === "budget" ? "block" : "none";
    document.getElementById("panel-selection").style.display = mode === "selection" ? "block" : "none";
    if (mode === "selection") renderSelectionPanel();
  }

  // ---- форма «от бюджета» ----------------------------------------------------
  var citySel = document.getElementById("c-city");
  RL.cities.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; citySel.appendChild(o); });

  var startSel = document.getElementById("c-start");
  RL_OCC.monthList(12).forEach(function (m, i) { var o = document.createElement("option"); o.value = i; o.textContent = m.label; startSel.appendChild(o); });

  var formatsEl = document.getElementById("c-formats");
  formatsEl.innerHTML = FORMAT_ORDER.map(function (code) {
    var f = RL.formats[code];
    return '<label class="format-check"><input type="checkbox" value="' + code + '" checked>' + f.shortTitle + "</label>";
  }).join("");

  var lastSelection = [];

  document.getElementById("c-submit").addEventListener("click", runBudgetSearch);

  function runBudgetSearch() {
    var budget = parseFloat(document.getElementById("c-budget").value) || 0;
    var city = citySel.value;
    var startOffset = parseInt(startSel.value, 10);
    var months = parseInt(document.getElementById("c-months").value, 10);
    var preferred = Array.from(formatsEl.querySelectorAll("input:checked")).map(function (i) { return i.value; });
    if (!preferred.length) preferred = FORMAT_ORDER;

    var candidates = ALL_ITEMS.filter(function (item) {
      if (city && item.city !== city) return false;
      if (preferred.indexOf(item.format) === -1) return false;
      return RL_UTIL.itemFreeForRange(item, startOffset, months);
    });

    // Приоритет: сначала площадки с реальными данными МТС Охват (по CPM), затем
    // остальной простаивающий плакатный инвентарь по цене (п. 4.3.1, 4.3.5 ТЗ).
    candidates.forEach(function (item) {
      var reach = item.sideCode ? RL_UTIL.reachFor(item.structureId, item.sideCode) : RL_UTIL.reachFor(item.structureId);
      item._reach = reach;
      item._cpm = reach ? RL_UTIL.cpm(item.price * months, reach.total * months) : null;
    });
    candidates.sort(function (a, b) {
      if (a._reach && b._reach) return a._cpm - b._cpm;
      if (a._reach) return -1;
      if (b._reach) return 1;
      return a.price - b.price;
    });

    var picked = [];
    var spent = 0;
    candidates.forEach(function (item) {
      var fmt = RL.formats[item.format];
      var rent = item.price * months;
      var print = (item.format !== "led_screen" && fmt.printPrice) ? fmt.printPrice : 0;
      var cost = rent + print;
      if (spent + cost <= budget) {
        picked.push(Object.assign({ startOffset: startOffset, months: months, cost: cost }, item));
        spent += cost;
      }
    });

    lastSelection = picked;
    renderResults(picked, budget, spent, startOffset, months);
  }

  function renderResults(picked, budget, spent, startOffset, months) {
    var resEl = document.getElementById("c-results");
    var emptyEl = document.getElementById("c-empty");
    if (!picked.length) {
      resEl.style.display = "none";
      emptyEl.style.display = "block";
      return;
    }
    emptyEl.style.display = "none";
    resEl.style.display = "block";

    var totalReach = 0, reachCount = 0;
    picked.forEach(function (item) { if (item._reach) { totalReach += item._reach.total * months; reachCount++; } });
    var cpm = totalReach ? RL_UTIL.cpm(spent, totalReach) : null;
    var fee = RL_UTIL.feeEstimate(spent, "poster_static");

    document.getElementById("c-summary").innerHTML =
      '<div class="result-summary">' +
        '<div class="metric"><b>' + picked.length + '</b><span>площадок подобрано</span></div>' +
        '<div class="metric"><b>' + RL_UTIL.money(spent) + '</b><span>из ' + RL_UTIL.money(budget) + ' бюджета</span></div>' +
        '<div class="metric"><b>' + (totalReach ? RL_UTIL.int(totalReach) : "—") + '</b><span>контактов за период (' + reachCount + " из " + picked.length + " с данными)</span></div>" +
        (cpm ? '<div class="metric"><b>' + RL_UTIL.money(cpm) + '</b><span>цена за 1000 контактов</span></div>' : "") +
      "</div>" +
      '<div class="disclaimer">Сбор за размещение рекламы справочно: ' + RL_UTIL.money(fee.amount) + ". Плательщик — рекламодатель. Совокупный охват — верхняя оценка: аудитории поверхностей могут пересекаться.</div>";

    document.getElementById("c-items").innerHTML = picked.map(function (item) {
      var fmt = RL.formats[item.format];
      var reachText = item._reach ? RL_UTIL.int(item._reach.total) + " конт./мес" : "охват уточняется";
      return (
        '<div class="result-item">' +
          RL_UTIL.photoPlaceholder(item.title, item.format, { height: "56px" }).replace('style="', 'style="width:80px;flex-shrink:0;') +
          '<div class="info"><h5>' + RL_UTIL.escapeHtml(item.title) + (item.sideCode ? " · " + item.sideCode : "") + '</h5>' +
          '<div class="meta">' + item.city + " · " + fmt.shortTitle + " · " + reachText + "</div></div>" +
          "<b>" + RL_UTIL.money(item.cost) + "</b>" +
        "</div>"
      );
    }).join("");
  }

  document.getElementById("c-add-all").addEventListener("click", function () {
    lastSelection.forEach(function (item) {
      RL_UTIL.mpAdd({
        structureId: item.structureId, side: item.sideCode, format: item.format,
        title: item.title, city: item.city, startOffset: item.startOffset, months: item.months, addedAt: Date.now()
      });
    });
    window.location.href = "mediaplan.html";
  });

  // ---- режим «от подборки» ---------------------------------------------------
  function renderSelectionPanel() {
    var mp = RL_UTIL.mpLoad();
    var el = document.getElementById("sel-content");
    if (!mp.items.length) {
      el.innerHTML = '<div class="empty-state"><h3>Медиаплан пуст</h3><p class="muted">Добавьте площадки в <a href="catalog.html">каталоге</a>, затем вернитесь сюда — калькулятор покажет стоимость и охват.</p><a href="catalog.html" class="btn btn-primary mt-24">Перейти в каталог</a></div>';
      return;
    }
    var rentTotal = 0, printTotal = 0, reachTotal = 0, reachCount = 0;
    mp.items.forEach(function (it) {
      var fmt = RL.formats[it.format];
      var monthly = it.format === "led_screen" ? RL.ledScreenRates[1].month.s15 : fmt.priceMonth;
      var discount = RL_UTIL.discountForSelection(it.months, mp.items.length);
      var rent = monthly * it.months * (1 - discount / 100);
      var print = (it.format !== "led_screen" && fmt.printPrice) ? fmt.printPrice : 0;
      rentTotal += rent; printTotal += print;
      var reach = it.side ? RL_UTIL.reachFor(it.structureId, it.side) : RL_UTIL.reachFor(it.structureId);
      if (reach) { reachTotal += reach.total; reachCount++; }
    });
    var total = rentTotal + printTotal;
    var fee = RL_UTIL.feeEstimate(total, "poster_static");
    var cpm = reachTotal ? RL_UTIL.cpm(total, reachTotal) : null;

    el.innerHTML =
      "<h3>Текущий медиаплан — " + mp.items.length + " площад" + (mp.items.length === 1 ? "ка" : "ок") + "</h3>" +
      '<div class="result-summary">' +
        '<div class="metric"><b>' + RL_UTIL.money(total) + '</b><span>итоговая стоимость</span></div>' +
        '<div class="metric"><b>' + (reachTotal ? RL_UTIL.int(reachTotal) : "—") + '</b><span>охват/мес (' + reachCount + " из " + mp.items.length + ")</span></div>" +
        (cpm ? '<div class="metric"><b>' + RL_UTIL.money(cpm) + '</b><span>CPM</span></div>' : "") +
        '<div class="metric"><b>' + RL_UTIL.money(fee.amount) + '</b><span>сбор справочно</span></div>' +
      "</div>" +
      '<a href="mediaplan.html" class="btn btn-primary">Открыть медиаплан и оформить заявку</a>';
  }

  setMode("budget");
})();
