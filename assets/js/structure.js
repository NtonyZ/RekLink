/* RekLink.by — карточка площадки. */
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

    document.getElementById("page-title").textContent = structure.title + " — RekLink.by";
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

    // gallery
    var mainEl = document.getElementById("gallery-main");
    var thumbsEl = document.getElementById("gallery-thumbs");
    function setMain(idx) {
      mainEl.innerHTML = RL_UTIL.photoPlaceholder(PHOTO_TYPES[idx] + " — " + structure.publicTitle, format, { height: "360px" });
    }
    setMain(0);
    thumbsEl.innerHTML = PHOTO_TYPES.map(function (t, i) {
      return '<div data-idx="' + i + '">' + RL_UTIL.photoPlaceholder(t, format, { height: "70px" }) + "</div>";
    }).join("");
    thumbsEl.querySelectorAll("[data-idx]").forEach(function (el) {
      el.addEventListener("click", function () { setMain(parseInt(el.getAttribute("data-idx"), 10)); });
    });

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

      // deadlines relative to a synthetic start date = today + startOffset months, day 1
      var now = new Date();
      var startDate = new Date(now.getFullYear(), now.getMonth() + startOffset, 1);
      var deadlines = RL.leadTimes.filter(function (lt) {
        if (isLed) return /Все форматы|Видеоформаты/.test(lt.format);
        if (format === "media_poster") return /Все форматы|Медиа-постер|Видеоформаты/.test(lt.format);
        return /Все форматы|Скроллер/.test(lt.format);
      });
      document.getElementById("deadline-list").innerHTML = deadlines.map(function (lt) {
        var d = new Date(startDate);
        d.setDate(d.getDate() - lt.days);
        return "<li><span>" + lt.stage + "</span><span>" + d.toLocaleDateString("ru-RU") + "</span></li>";
      }).join("");
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
