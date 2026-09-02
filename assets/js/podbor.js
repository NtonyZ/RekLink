/* forus.by — пошаговый подбор площадок: где и когда -> что показываем -> результат. */
(function () {
  "use strict";
  RL_LAYOUT.render("");

  var FORMAT_ORDER = ["poster_static", "poster_dynamic", "media_poster", "led_screen", "indoor"];
  var ALL_ITEMS = RL_UTIL.catalogItems();

  var state = { city: "", start: 0, months: 3, formats: FORMAT_ORDER.slice(), budget: 0 };
  var found = [];

  // ---- переключение шагов ----
  function go(n) {
    ["1", "2", "3"].forEach(function (k) {
      document.getElementById("w" + k).classList.toggle("active", k === String(n));
      var nav = document.getElementById("n" + k);
      nav.classList.toggle("active", k === String(n));
      nav.classList.toggle("done", Number(k) < n);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function err(id, msg) {
    var el = document.getElementById(id);
    if (!msg) { el.style.display = "none"; return; }
    el.textContent = msg;
    el.style.display = "block";
  }

  // ---- Шаг 1 ----
  var citySel = document.getElementById("p-city");
  RL.cities.forEach(function (c) {
    var o = document.createElement("option"); o.value = c; o.textContent = c; citySel.appendChild(o);
  });
  var startSel = document.getElementById("p-start");
  RL_OCC.monthList(12).forEach(function (m, i) {
    var o = document.createElement("option"); o.value = i; o.textContent = m.label; startSel.appendChild(o);
  });

  // Выбор, сделанный в форме на главной, переносим сюда, чтобы не спрашивать дважды
  var qCity = RL_UTIL.qs("city");
  if (qCity && RL.cities.indexOf(qCity) !== -1) citySel.value = qCity;

  document.getElementById("to2").addEventListener("click", function () {
    state.city = citySel.value;
    state.start = parseInt(startSel.value, 10);
    state.months = parseInt(document.getElementById("p-months").value, 10);

    // Старт, до которого уже не успеть подготовиться, отсекаем сразу (п. 11.5 ТЗ)
    var sched = RL_UTIL.scheduleFeasibility("poster_static", state.start);
    if (!sched.feasible) {
      var opt = startSel.options[sched.earliestOffset];
      err("e1", "К этому месяцу подготовиться уже не успеть: сроки подписания счёта-протокола и подачи материалов прошли." +
        (opt ? " Ближайший возможный старт — " + opt.textContent + "." : ""));
      if (opt) startSel.value = String(sched.earliestOffset);
      return;
    }
    err("e1", "");
    go(2);
  });

  // ---- Шаг 2 ----
  var fmtEl = document.getElementById("p-formats");
  fmtEl.innerHTML = FORMAT_ORDER.map(function (code) {
    var f = RL.formats[code];
    var price = code === "led_screen"
      ? "от " + RL_UTIL.money(RL.ledScreenRates[0].month.s10) + " / мес"
      : (code === "indoor" ? "от " : "") + RL_UTIL.money(f.priceMonth) + " / мес" +
        (f.printPrice ? " + печать " + RL_UTIL.money(f.printPrice) : "");
    return '<label><input type="checkbox" value="' + code + '" checked>' +
      '<span><span class="t">' + f.shortTitle + "</span>" +
      '<span class="d">' + RL_UTIL.escapeHtml(f.description) + "</span>" +
      '<span class="p">' + price + "</span></span></label>";
  }).join("");

  // Формат, пришедший в адресе страницы, отмечаем один — остальные снимаем.
  var qFormat = RL_UTIL.qs("format");
  if (qFormat && FORMAT_ORDER.indexOf(qFormat) !== -1) {
    fmtEl.querySelectorAll("input").forEach(function (i) { i.checked = (i.value === qFormat); });
  }

  document.getElementById("back1").addEventListener("click", function () { go(1); });

  document.getElementById("to3").addEventListener("click", function () {
    state.formats = Array.prototype.slice.call(fmtEl.querySelectorAll("input:checked")).map(function (i) { return i.value; });
    if (!state.formats.length) { err("e2", "Отметьте хотя бы один формат."); return; }
    state.budget = parseFloat(document.getElementById("p-budget").value) || 0;
    err("e2", "");
    search();
    go(3);
  });

  // ---- Шаг 3: подбор ----
  function priceOf(item) {
    var fmt = RL.formats[item.format];
    var monthly = item.format === "led_screen" ? RL.ledScreenRates[0].month.s10 : fmt.priceMonth;
    var print = (item.format !== "led_screen" && fmt.printPrice) ? fmt.printPrice : 0;
    return monthly * state.months + print;
  }

  function search() {
    var candidates = ALL_ITEMS.filter(function (item) {
      if (state.city && item.city !== state.city) return false;
      if (state.formats.indexOf(item.format) === -1) return false;
      return RL_UTIL.itemFreeForRange(item, state.start, state.months);
    });

    candidates.forEach(function (item) {
      var reach = RL_UTIL.reachFor(item.structureId, item.sideCode);
      item._reach = reach;
      item._cost = priceOf(item);
      item._cpm = reach ? RL_UTIL.cpm(item._cost, reach.total * state.months) : null;
    });

    // Сначала места с подтверждённым охватом — по цене за тысячу контактов,
    // затем остальные по цене: у 96% поверхностей данных МТС пока нет.
    candidates.sort(function (a, b) {
      if (a._cpm != null && b._cpm != null) return a._cpm - b._cpm;
      if (a._cpm != null) return -1;
      if (b._cpm != null) return 1;
      return a._cost - b._cost;
    });

    if (state.budget) {
      var spent = 0;
      found = candidates.filter(function (item) {
        if (spent + item._cost > state.budget) return false;
        spent += item._cost;
        return true;
      });
    } else {
      found = candidates.slice(0, 30);
    }
    renderResults(candidates.length);
  }

  function renderResults(totalFree) {
    var listEl = document.getElementById("res-list");
    var emptyEl = document.getElementById("res-empty");
    var period = RL_OCC.monthList(1, state.start)[0].label;

    // Без склонения месяца: «с Октябрь 2026» звучит коряво, а падежные формы
    // ради одной строки в справочник добавлять незачем.
    document.getElementById("res-hint").textContent =
      "Период: " + period + ", " + state.months + " мес." +
      (state.city ? " · " + state.city : "") + ". Отметьте нужные площадки и добавьте в медиаплан.";

    if (!found.length) {
      emptyEl.style.display = "block";
      listEl.innerHTML = "";
      document.getElementById("res-sum").innerHTML = "";
      return;
    }
    emptyEl.style.display = "none";

    var cost = 0, reachSum = 0, withReach = 0;
    found.forEach(function (i) {
      cost += i._cost;
      if (i._reach) { reachSum += i._reach.total * state.months; withReach++; }
    });
    var cpm = reachSum ? RL_UTIL.cpm(cost, reachSum) : null;

    document.getElementById("res-sum").innerHTML =
      "<div><b>" + found.length + "</b><span>площадок подобрано" + (totalFree > found.length ? " из " + totalFree + " свободных" : "") + "</span></div>" +
      "<div><b>" + RL_UTIL.money(cost) + "</b><span>за " + state.months + " мес." + (state.budget ? " из " + RL_UTIL.money(state.budget) : "") + "</span></div>" +
      "<div><b>" + (reachSum ? RL_UTIL.int(reachSum) : "—") + "</b><span>контактов (" + withReach + " из " + found.length + " с данными МТС)</span></div>" +
      (cpm ? "<div><b>" + RL_UTIL.money(cpm) + "</b><span>за 1000 контактов</span></div>" : "");

    listEl.innerHTML = found.map(function (item, idx) {
      var fmt = RL.formats[item.format];
      var reachText = item._reach
        ? RL_UTIL.int(item._reach.total) + " конт./мес · CPM " + RL_UTIL.money(item._cpm)
        : "охват уточняется";
      return '<div class="res-item">' +
        '<input type="checkbox" data-idx="' + idx + '" checked>' +
        RL_UTIL.photoTile(item.structureId, item.sideCode, item.net || item.title, item.format, { height: "48px", style: "width:64px;flex-shrink:0", thumb: true }) +
        '<div class="info"><h4>' + RL_UTIL.escapeHtml(item.title) + (item.sideCode ? " · сторона " + item.sideCode : "") + "</h4>" +
        '<div class="meta">' + item.city + " · " + fmt.shortTitle + " · " + reachText + "</div></div>" +
        '<div class="price">' + RL_UTIL.money(item._cost) + "</div>" +
        "</div>";
    }).join("");
  }

  document.getElementById("back2").addEventListener("click", function () { go(2); });

  document.getElementById("to-plan").addEventListener("click", function () {
    var picked = Array.prototype.slice.call(document.querySelectorAll("#res-list input:checked"))
      .map(function (c) { return found[parseInt(c.getAttribute("data-idx"), 10)]; });
    if (!picked.length) { alert("Отметьте хотя бы одну площадку."); return; }
    picked.forEach(function (item) {
      RL_UTIL.mpAdd({
        structureId: item.structureId, side: item.sideCode, format: item.format,
        title: item.title, city: item.city,
        startOffset: state.start, months: state.months, addedAt: Date.now()
      });
    });
    window.location.href = "mediaplan.html";
  });
})();
