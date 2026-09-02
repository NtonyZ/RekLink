/* forus.by — каталог: список + карта, фильтры без перезагрузки страницы. */
(function () {
  "use strict";
  RL_LAYOUT.render("catalog.html");

  var FORMAT_ORDER = ["poster_static", "poster_dynamic", "media_poster", "led_screen", "indoor"];

  var ALL_ITEMS = RL_UTIL.catalogItems();
  var availabilityFor = RL_UTIL.itemAvailability;

  function reachForItem(item) {
    return RL_UTIL.reachFor(item.structureId, item.sideCode);
  }

  // ---- Состояние фильтров (синхронизировано с URL) --------------------------
  var state = {
    formats: [],
    city: RL_UTIL.qs("city") || "",
    month: parseInt(RL_UTIL.qs("month") || "0", 10),
    dtype: RL_UTIL.qs("dtype") || "",
    priceMax: parseFloat(RL_UTIL.qs("priceMax")) || 0,
    free: RL_UTIL.qs("free") === "1",
    sort: RL_UTIL.qs("sort") || "price-asc",
    view: RL_UTIL.qs("view") || "split"
  };
  var qFormat = RL_UTIL.qs("format");
  if (qFormat) state.formats = [qFormat];

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.formats.length === 1) p.set("format", state.formats[0]);
    if (state.city) p.set("city", state.city);
    if (state.month) p.set("month", state.month);
    if (state.dtype) p.set("dtype", state.dtype);
    if (state.priceMax) p.set("priceMax", state.priceMax);
    if (state.free) p.set("free", "1");
    if (state.sort !== "price-asc") p.set("sort", state.sort);
    if (state.view !== "split") p.set("view", state.view);
    history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p.toString() : ""));
  }

  // ---- UI: чипы форматов ------------------------------------------------------
  var chipsEl = document.getElementById("format-chips");
  function renderChips() {
    chipsEl.innerHTML = FORMAT_ORDER.map(function (code) {
      var f = RL.formats[code];
      var active = state.formats.length === 0 || state.formats.indexOf(code) !== -1;
      return '<span class="chip' + (active ? " active" : "") + '" data-fmt="' + code + '">' + f.shortTitle + "</span>";
    }).join("");
    chipsEl.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var code = chip.getAttribute("data-fmt");
        var idx = state.formats.indexOf(code);
        if (state.formats.length === 0) {
          state.formats = FORMAT_ORDER.filter(function (c) { return c !== code; });
        } else if (idx === -1) {
          state.formats.push(code);
          if (state.formats.length === FORMAT_ORDER.length) state.formats = [];
        } else {
          state.formats.splice(idx, 1);
        }
        renderChips();
        refresh();
      });
    });
  }

  // ---- UI: селекты ------------------------------------------------------------
  // Города и их количество берём из самого каталога: список не расходится
  // с тем, что реально можно найти, и сразу видно, где инвентаря больше.
  var citySel = document.getElementById("f-city");
  var cityCount = {};
  ALL_ITEMS.forEach(function (it) { cityCount[it.city] = (cityCount[it.city] || 0) + 1; });
  RL.cities.forEach(function (c) {
    if (!cityCount[c]) return;
    var o = document.createElement("option");
    o.value = c;
    o.textContent = c + " (" + cityCount[c] + ")";
    citySel.appendChild(o);
  });
  citySel.value = state.city;
  citySel.addEventListener("change", function () { state.city = citySel.value; refresh(true); });

  var monthSel = document.getElementById("f-month");
  RL_OCC.monthList(12).forEach(function (m, i) { var o = document.createElement("option"); o.value = i; o.textContent = m.label; monthSel.appendChild(o); });
  monthSel.value = state.month;
  monthSel.addEventListener("change", function () { state.month = parseInt(monthSel.value, 10); refresh(); });

  // Варианты типа показа строятся из справочника, иначе список расходится с данными:
  // в фильтре не хватало «Видеоролика», и 9 сторон медиа-скроллеров было не отобрать.
  var dtypeSel = document.getElementById("f-dtype");
  Object.keys(RL.displayTypeLabel).forEach(function (code) {
    var o = document.createElement("option");
    o.value = code;
    o.textContent = RL.displayTypeLabel[code];
    dtypeSel.appendChild(o);
  });
  dtypeSel.value = state.dtype;
  dtypeSel.addEventListener("change", function () { state.dtype = dtypeSel.value; refresh(); });

  var priceMaxInput = document.getElementById("f-price-max");
  if (state.priceMax) priceMaxInput.value = state.priceMax;
  priceMaxInput.addEventListener("input", function () { state.priceMax = parseFloat(priceMaxInput.value) || 0; refresh(); });

  var freeChk = document.getElementById("f-free");
  freeChk.checked = state.free;
  freeChk.addEventListener("change", function () { state.free = freeChk.checked; refresh(); });

  var sortSel = document.getElementById("f-sort");
  sortSel.value = state.sort;
  sortSel.addEventListener("change", function () { state.sort = sortSel.value; refresh(); });

  document.querySelectorAll(".view-toggle button").forEach(function (btn) {
    if (btn.getAttribute("data-view") === state.view) btn.classList.add("active");
    btn.addEventListener("click", function () {
      state.view = btn.getAttribute("data-view");
      document.querySelectorAll(".view-toggle button").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      document.body.setAttribute("data-view", state.view);
      syncUrl();
      if (map) map.invalidateSize(50);
    });
  });
  document.body.setAttribute("data-view", state.view);

  // ---- Карта --------------------------------------------------------------
  var map = RL_MAP.create("cat-map", { center: [55.19, 30.21], zoom: 13, cluster: true });

  function ringFor(avail) {
    return avail === "free" ? "#1f9d55" : (avail === "partial" ? "#e5ac04" : "#c9506b");
  }

  // У панелей в помещениях нет карточки конструкции — ведём в описание формата.
  function detailHref(item) {
    if (item.type === "indoor") return "formats.html#indoor";
    return "structure.html?id=" + item.structureId + (item.sideCode ? "&side=" + item.sideCode : "");
  }

  // Подпись на плитке без фотографии. Для панелей это название сети: адрес
  // и так стоит заголовком карточки, дублировать его в картинке незачем.
  function tileLabel(item) {
    return item.net || item.title;
  }

  function metaLine(item) {
    var parts = [item.city, RL.formats[item.format].shortTitle];
    if (item.sideCode) parts.push("сторона " + item.sideCode);
    if (item.net) parts.push("сеть " + item.net);
    if (item.type === "indoor") parts.push(item.monitors + (item.monitors === 1 ? " экран" : " экрана"));
    return parts.join(" · ");
  }

  function popupHtml(item, summary) {
    var reach = reachForItem(item);
    var reachLine = reach
      ? RL_UTIL.int(reach.total) + " конт./мес · CPM " + RL_UTIL.money(RL_UTIL.cpm(item.price, reach.total))
      : "Охват уточняется";
    var freePositions = summary.free + summary.social;
    var availText = item.type === "indoor"
      ? (item.active ? "Вещает" : "Сейчас не вещает")
      : (item.type === "led"
        ? (summary.free ? "Свободно" : "Занято")
        : (freePositions + " своб. из " + summary.total));
    return (
      '<div class="pop-photo">' + RL_UTIL.photoTile(item.structureId, item.sideCode, tileLabel(item), item.format, { height: "90px", sideBadge: !!item.sideCode }) + "</div>" +
      '<div class="pop-title">' + RL_UTIL.escapeHtml(item.title) + "</div>" +
      '<div class="pop-meta">' + metaLine(item) + " · " + availText + "<br>" +
        (item.type === "indoor" ? "от " : "") + RL_UTIL.money(item.price) + " / мес · " + reachLine + "</div>" +
      '<div class="pop-actions">' +
        '<a href="' + detailHref(item) + '" class="btn-outline" style="border-radius:8px">Подробнее</a>' +
        '<button class="btn-primary" data-add="' + item.id + '">В медиаплан</button>' +
      "</div>"
    );
  }

  function rebuildMarkers(filtered) {
    if (!map) return;
    map.setMarkers(filtered.map(function (item) {
      var summary = availabilityFor(item, state.month);
      return {
        id: item.id,
        lat: item.lat, lng: item.lng,
        color: RL.formats[item.format].color,
        ringColor: ringFor(RL_OCC.availabilityLabel(summary)),
        popupHtml: popupHtml(item, summary),
        onPopupOpen: function (node) {
          var btn = node.querySelector("[data-add]");
          if (btn) btn.addEventListener("click", function () { addToPlan(item); });
        }
      };
    }));
  }

  function addToPlan(item) {
    var m = RL_OCC.monthList(1, state.month)[0];
    RL_UTIL.mpAdd({
      structureId: item.structureId,
      side: item.sideCode,
      format: item.format,
      title: item.title,
      city: item.city,
      startOffset: state.month,
      months: 1,
      addedAt: Date.now()
    });
    RL_LAYOUT.render("catalog.html");
    renderChips();
  }

  // ---- Список ---------------------------------------------------------------
  var listEl = document.getElementById("cat-items");
  var countEl = document.getElementById("cat-count");

  function filterItems() {
    return ALL_ITEMS.filter(function (item) {
      if (state.formats.length && state.formats.indexOf(item.format) === -1) return false;
      if (state.city && item.city !== state.city) return false;
      if (state.dtype && item.displayType !== state.dtype) return false;
      if (state.priceMax && item.price > state.priceMax) return false;
      if (state.free) {
        var summary = availabilityFor(item, state.month);
        if (summary.free + summary.social === 0) return false;
      }
      return true;
    });
  }

  function sortItems(items) {
    var arr = items.slice();
    arr.sort(function (a, b) {
      if (state.sort === "price-asc") return a.price - b.price;
      if (state.sort === "price-desc") return b.price - a.price;
      if (state.sort === "alpha") return a.title.localeCompare(b.title, "ru");
      var ra = reachForItem(a), rb = reachForItem(b);
      if (state.sort === "reach-desc") {
        return (rb ? rb.total : -1) - (ra ? ra.total : -1);
      }
      if (state.sort === "cpm-asc") {
        var ca = ra ? RL_UTIL.cpm(a.price, ra.total) : Infinity;
        var cb = rb ? RL_UTIL.cpm(b.price, rb.total) : Infinity;
        return ca - cb;
      }
      return 0;
    });
    return arr;
  }

  function renderList(items) {
    countEl.textContent = "Найдено: " + items.length + " из " + ALL_ITEMS.length;
    if (!items.length) {
      listEl.innerHTML = '<div class="empty-state">Нет мест по заданным фильтрам.<br>Попробуйте изменить период или снять часть фильтров.</div>';
      return;
    }
    listEl.innerHTML = items.map(function (item) {
      var summary = availabilityFor(item, state.month);
      var avail = RL_OCC.availabilityLabel(summary);
      var reach = reachForItem(item);
      var reachLine = reach ? RL_UTIL.int(reach.total) + " конт." : "охват уточняется";
      var badge = item.type === "indoor"
        ? '<span class="badge ' + (item.active ? "badge-free" : "badge-busy") + '">' + (item.active ? "Вещает" : "Не вещает") + "</span>"
        : RL_UTIL.availabilityBadge(avail);
      return (
        '<a class="cat-item" href="' + detailHref(item) + '" data-id="' + item.id + '">' +
          RL_UTIL.photoTile(item.structureId, item.sideCode, tileLabel(item), item.format, { height: "72px", cls: "thumb", thumb: true }) +
          '<div class="info">' +
            "<h4>" + RL_UTIL.escapeHtml(item.title) + "</h4>" +
            '<div class="meta">' + metaLine(item) + " · " + reachLine + "</div>" +
            '<div class="price-row">' +
              badge +
              "<b>" + (item.type === "indoor" ? "от " : "") + RL_UTIL.money(item.price) + "/мес</b>" +
            "</div>" +
          "</div>" +
        "</a>"
      );
    }).join("");
    listEl.querySelectorAll(".cat-item").forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        var id = el.getAttribute("data-id");
        if (map) map.openPopup(id);
      });
    });
  }

  // fit=true — подогнать карту под отобранные метки. Нужно при смене города:
  // инвентарь теперь в шести городах, и Минск с Могилёвом иначе остаются за экраном.
  function refresh(fit) {
    syncUrl();
    var filtered = filterItems();
    var sorted = sortItems(filtered);
    renderList(sorted);
    rebuildMarkers(sorted);
    if (fit && map && sorted.length) {
      map.fitBounds(sorted.map(function (i) { return [i.lat, i.lng]; }), 40);
    }
  }

  renderChips();
  refresh(true);
  if (map) map.invalidateSize(100);

  window.__rlCatalog = { map: map, items: ALL_ITEMS };
})();
