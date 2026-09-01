/* forus.by — карточка площадки. */
(function () {
  "use strict";
  RL_LAYOUT.render("");

  var PHOTO_TYPES = ["Общий план", "Крупный план поверхности", "Вид со стороны потока", "Окружение"];

  var id = RL_UTIL.qs("id");
  var sideCode = RL_UTIL.qs("side");

  var isLed = id && id.indexOf("LED-") === 0;
  var structure = isLed ? RL.ledScreens.find(function (l) { return l.id === id; })
                         : RL.structures.find(function (s) { return s.id === id; });

  if (!structure) {
    document.getElementById("not-found").style.display = "block";
    document.getElementById("sd-content").style.display = "none";
  } else {
    init();
  }

  function init() {
    var side = null;
    if (!isLed) {
      side = structure.sides.find(function (s) { return s.code === sideCode; }) || structure.sides[0];
      sideCode = side.code;
    }
    var format = isLed ? "led_screen" : (side.positions[0] ? side.positions[0].format : "poster_static");
    var fmt = RL.formats[format];

    document.getElementById("page-title").textContent = structure.title + " — ФОРУС";
    document.getElementById("bc-title").textContent = structure.publicTitle || structure.title;
    document.getElementById("sd-title").textContent = (structure.publicTitle || structure.title) + (side ? " · сторона " + side.code : "");
    document.getElementById("sd-address").textContent = structure.city + (structure.address ? ", " + structure.address : "") + (structure.landmark ? " (" + structure.landmark + ")" : "");

    // side switcher
    if (!isLed && structure.sides.length > 1) {
      document.getElementById("side-switch").innerHTML = structure.sides.map(function (s) {
        var f2 = RL.formats[s.positions[0].format];
        var dir = RL_UTIL.sideDirectionLabel(structure.trafficType, s.code);
        return '<a href="structure.html?id=' + structure.id + "&side=" + s.code + '" class="' + (s.code === side.code ? "active" : "") + '" title="' + dir + '">Сторона ' + s.code + (s.code === "A" ? " →" : " ←") + " · " + f2.shortTitle + "</a>";
      }).join("");
    }

    // Галерея: сначала реальные снимки сторон из адресной презентации (текущая сторона
    // первой), затем — недостающие типы съёмки по п. 5.2.1 ТЗ, которые загружает администратор.
    var views = [];
    if (!isLed) {
      var sideOrder = [side.code];
      structure.sides.forEach(function (s) { if (s.code !== side.code) sideOrder.push(s.code); });
      sideOrder.forEach(function (code) {
        if (RL_UTIL.photoUrl(structure.id, code)) {
          views.push({ side: code, label: "Сторона " + code + " — общий план" });
        }
      });
    }
    var missing = views.length ? PHOTO_TYPES.slice(1) : PHOTO_TYPES;
    missing.forEach(function (t) { views.push({ side: null, label: t }); });

    var mainEl = document.getElementById("gallery-main");
    var thumbsEl = document.getElementById("gallery-thumbs");
    function tile(v, height) {
      return v.side
        ? RL_UTIL.photoTile(structure.id, v.side, v.label, format, { height: height, sideBadge: true, eager: true })
        : RL_UTIL.photoPlaceholder(v.label, format, { height: height });
    }
    function setMain(idx) {
      mainEl.innerHTML = tile(views[idx], "360px");
      thumbsEl.querySelectorAll("[data-idx]").forEach(function (el) {
        el.classList.toggle("active", parseInt(el.getAttribute("data-idx"), 10) === idx);
      });
    }
    thumbsEl.innerHTML = views.map(function (v, i) {
      return '<div data-idx="' + i + '">' + tile(v, "70px") + "</div>";
    }).join("");
    thumbsEl.querySelectorAll("[data-idx]").forEach(function (el) {
      el.addEventListener("click", function () { setMain(parseInt(el.getAttribute("data-idx"), 10)); });
    });
    setMain(0);

    // Описание расположения и панорама «Яндекс» из адресной презентации
    var loc = RL_UTIL.locationFor(structure.id);
    if (loc && loc.desc) {
      var descEl = document.getElementById("sd-location-desc");
      descEl.textContent = loc.desc;
      descEl.style.display = "block";
    }
    if (loc && loc.pano) {
      document.getElementById("sd-pano").href = loc.pano;
      document.getElementById("sd-pano-row").style.display = "block";
    }

    // availability badge (current month)
    var summary0 = isLed ? ledSummary(0) : RL_OCC.sideSummary(structure, side, 0);
    document.getElementById("sd-avail-badge").innerHTML = RL_UTIL.availabilityBadge(RL_OCC.availabilityLabel(summary0));

    // specs
    var specs = [];
    specs.push(["Формат", fmt.title]);
    if (isLed) {
      specs.push(["Размер экрана", "6 × 3 м"]);
      specs.push(["Режим работы", structure.workHours]);
    } else {
      specs.push(["Тип показа", side.displayTypeLabel]);
      specs.push(["Позиций в стороне", side.positions.length]);
      if (side.displayType !== "static") {
        specs.push(["Доля времени показа", RL_UTIL.pct(100 / side.positions.length)]);
      } else {
        specs.push(["Доля времени показа", "100% (виден постоянно)"]);
      }
      specs.push(["Тип трафика", { pedestrian: "Пешеходный", vehicle: "Автомобильный", mixed: "Смешанный" }[structure.trafficType]]);
      specs.push(["Направление стороны", RL_UTIL.sideDirectionLabel(structure.trafficType, side.code)]);
      specs.push(["Согласование содержания", structure.requiresContentApproval ? "Требуется" : "Не требуется"]);
      specs.push(["Разрешение действительно до", structure.permitValidUntil]);
    }
    specs.push(["Ставка сбора за рекламу", fmt.feeRate + "% (справочно, плательщик — рекламодатель)"]);
    document.getElementById("specs-grid").innerHTML = specs.map(function (s) {
      return '<div class="spec"><div class="k">' + s[0] + '</div><div class="v">' + s[1] + "</div></div>";
    }).join("");
    document.getElementById("format-explainer").textContent = fmt.description;

    // reach
    var reach = isLed ? RL_UTIL.reachFor(structure.id) : RL_UTIL.reachFor(structure.id, side.code);
    var reachEl = document.getElementById("reach-section");
    if (reach) {
      var cpmVal = RL_UTIL.cpm(fmt.priceMonth || 0, reach.total);
      reachEl.innerHTML =
        '<div class="reach-box">' +
          '<div class="metric"><b>' + RL_UTIL.int(reach.total) + '</b><span>контактов / мес</span></div>' +
          '<div class="metric"><b>' + RL_UTIL.int(reach.unique) + '</b><span>уникальный охват, чел.</span></div>' +
          (cpmVal ? '<div class="metric"><b>' + RL_UTIL.money(cpmVal) + '</b><span>цена за 1000 контактов</span></div>' : "") +
        "</div>" +
        '<p class="text-sm muted">Источник: платформа МТС Охват, № ' + reach.mtsId + ". Период измерения: " + reach.period + ". Показатель может отличаться в другие периоды.</p>";
    } else {
      reachEl.innerHTML = '<div class="disclaimer">Данные об охвате уточняются. Как только администратор загрузит выгрузку МТС Охват для этой поверхности, здесь появится число контактов и цена за 1000 контактов.</div>';
    }

    // occupancy calendar (12 months, per position rows for scroller side; single row for LED)
    renderCalendar(side, format);

    // map
    var map = L.map("sd-map", { zoomControl: true, scrollWheelZoom: false }).setView([structure.lat, structure.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
    L.marker([structure.lat, structure.lng]).addTo(map).bindPopup(structure.publicTitle || structure.title);
    setTimeout(function () { map.invalidateSize(); }, 200);

    // booking panel
    initBooking(structure, side, format, fmt, isLed);
  }

  function ledSummary(offset) {
    var st = RL_OCC.statusFor(structure.id, "X", 1, "led_screen", offset);
    return { free: st === "commercial" ? 0 : 1, commercial: st === "commercial" ? 1 : 0, social: 0, total: 1 };
  }

  function renderCalendar(side, format) {
    var months = RL_OCC.monthList(12);
    var table = document.getElementById("cal-table");
    var head = "<tr><th style='text-align:left'>Позиция</th>" + months.map(function (m) { return "<th>" + m.short + "</th>"; }).join("") + "</tr>";
    var rows = "";
    if (structure.id.indexOf("LED-") === 0) {
      rows += "<tr><td style='text-align:left'>Экран</td>" + months.map(function (m, i) {
        var st = RL_OCC.statusFor(structure.id, "X", 1, "led_screen", i);
        return "<td><div class='cal-cell cal-" + (st === "commercial" ? "commercial" : "free") + "' title='" + (st === "commercial" ? "Занято" : "Свободно") + "'></div></td>";
      }).join("") + "</tr>";
    } else {
      side.positions.forEach(function (p) {
        rows += "<tr><td style='text-align:left'>" + side.code + p.number + "</td>" + months.map(function (m, i) {
          var st = RL_OCC.statusFor(structure.id, side.code, p.number, format, i);
          var label = st === "commercial" ? "Занято" : st === "social" ? "Социальная реклама" : "Свободно";
          return "<td><div class='cal-cell cal-" + st + "' title='" + label + "'></div></td>";
        }).join("") + "</tr>";
      });
    }
    table.innerHTML = head + rows;
  }

  function initBooking(structure, side, format, fmt, isLed) {
    var startSel = document.getElementById("b-start");
    RL_OCC.monthList(12).forEach(function (m, i) {
      var o = document.createElement("option"); o.value = i; o.textContent = m.label; startSel.appendChild(o);
    });
    var monthsSel = document.getElementById("b-months");

    function recalc() {
      var startOffset = parseInt(startSel.value, 10);
      var months = parseInt(monthsSel.value, 10);
      var monthlyPrice = isLed ? RL.ledScreenRates[1].month.s15 : fmt.priceMonth;
      var positionsCount = 1;
      var discount = RL_UTIL.discountForSelection(months, positionsCount);
      var rentBase = monthlyPrice * months;
      var rentDiscounted = rentBase * (1 - discount / 100);
      var printTotal = (!isLed && fmt.printPrice) ? fmt.printPrice : 0;
      var total = rentDiscounted + printTotal;
      var fee = RL_UTIL.feeEstimate(total, format);

      var lines = [];
      lines.push(["Аренда (" + months + " мес.)", RL_UTIL.money(rentBase)]);
      if (discount) lines.push(["Скидка за срок/объём", "−" + RL_UTIL.pct(discount)]);
      if (printTotal) lines.push(["Печать постера", RL_UTIL.money(printTotal)]);
      document.getElementById("price-lines").innerHTML =
        lines.map(function (l) { return '<div class="price-line"><span>' + l[0] + "</span><span>" + l[1] + "</span></div>"; }).join("") +
        '<div class="price-line total"><span>Итого</span><span>' + RL_UTIL.money(total) + "</span></div>" +
        '<div class="price-line text-sm muted"><span>Сбор за размещение рекламы (справочно, ' + fee.rate + '%)</span><span>' + RL_UTIL.money(fee.amount) + "</span></div>" +
        '<div class="price-line text-sm muted"><span>НДС</span><span>не облагается</span></div>';

      document.getElementById("fee-note").innerHTML = "<strong>Сбор за размещение рекламы</strong> уплачивается рекламодателем самостоятельно (" + RL.feeInfo.decree + "). Компания сбор не удерживает и не перечисляет.";

      // Крайние даты обратным ходом от старта + проверка выполнимости (п. 11.5 ТЗ)
      var sched = RL_UTIL.scheduleFeasibility(format, startOffset);
      var today = new Date(); today.setHours(0, 0, 0, 0);
      document.getElementById("deadline-list").innerHTML = sched.deadlines.map(function (d) {
        var late = d.date < today;
        return "<li" + (late ? ' style="color:var(--red)"' : "") + "><span>" + d.stage + "</span><span>" +
          d.date.toLocaleDateString("ru-RU") + (late ? " — срок прошёл" : "") + "</span></li>";
      }).join("");

      var warnEl = document.getElementById("deadline-warning");
      if (sched.feasible) {
        warnEl.style.display = "none";
      } else {
        var opt = startSel.options[sched.earliestOffset];
        warnEl.innerHTML = "Старт в выбранном месяце уже невозможен: " +
          (sched.missed.length === 1 ? "срок «" + sched.missed[0].stage + "» прошёл" : "часть подготовительных сроков прошла") + "." +
          (opt ? ' Ближайший доступный старт — <a href="#" id="deadline-fix">' + opt.textContent + "</a>." : "");
        warnEl.style.display = "block";
        var fix = document.getElementById("deadline-fix");
        if (fix) {
          fix.addEventListener("click", function (e) {
            e.preventDefault();
            startSel.value = String(sched.earliestOffset);
            recalc();
          });
        }
      }
    }
    startSel.addEventListener("change", recalc);
    monthsSel.addEventListener("change", recalc);
    recalc();

    document.getElementById("btn-add").addEventListener("click", function () {
      RL_UTIL.mpAdd({
        structureId: structure.id,
        side: isLed ? null : side.code,
        format: format,
        title: (structure.publicTitle || structure.title),
        city: structure.city,
        startOffset: parseInt(startSel.value, 10),
        months: parseInt(monthsSel.value, 10),
        addedAt: Date.now()
      });
      RL_LAYOUT.render("");
      var btn = document.getElementById("btn-add");
      btn.textContent = "Добавлено ✓";
      setTimeout(function () { btn.textContent = "Добавить в медиаплан"; }, 1600);
    });
    document.getElementById("btn-book").addEventListener("click", function () {
      RL_UTIL.mpAdd({
        structureId: structure.id,
        side: isLed ? null : side.code,
        format: format,
        title: (structure.publicTitle || structure.title),
        city: structure.city,
        startOffset: parseInt(startSel.value, 10),
        months: parseInt(monthsSel.value, 10),
        addedAt: Date.now()
      });
    });
  }
})();
