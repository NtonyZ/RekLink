/* RekLink.by — медиаплан: корзина площадок, итог, карта, форма заявки. */
(function () {
  "use strict";
  RL_LAYOUT.render("mediaplan.html");

  function findStructure(structureId) {
    if (structureId.indexOf("LED-") === 0) return RL.ledScreens.find(function (l) { return l.id === structureId; });
    return RL.structures.find(function (s) { return s.id === structureId; });
  }
  function findSide(structure, code) {
    if (!structure.sides) return null;
    return structure.sides.find(function (s) { return s.code === code; });
  }
  function formatOf(structure, side) {
    if (!side) return "led_screen";
    return side.positions[0] ? side.positions[0].format : "poster_static";
  }

  var data = RL_UTIL.mpLoad();
  var items = data.items.map(function (it) {
    var structure = findStructure(it.structureId);
    var side = structure && structure.sides ? findSide(structure, it.side) : null;
    var format = it.format || formatOf(structure, side);
    return Object.assign({}, it, { structure: structure, side: side, format: format });
  }).filter(function (it) { return it.structure; });

  if (!items.length) {
    document.getElementById("mp-empty").style.display = "block";
    document.getElementById("mp-content").style.display = "none";
    return;
  }

  if (data.createdAt) {
    var expires = new Date(data.createdAt + 30 * 24 * 3600 * 1000);
    document.getElementById("mp-saved-note").textContent = "Медиаплан сохранён в этом браузере до " + expires.toLocaleDateString("ru-RU") + " (30 суток, без регистрации).";
  }

  function priceFor(item) {
    var fmt = RL.formats[item.format];
    var monthly = item.format === "led_screen" ? RL.ledScreenRates[1].month.s15 : fmt.priceMonth;
    var months = item.months || 1;
    var discount = RL_UTIL.discountForSelection(months, items.length);
    var rentBase = monthly * months;
    var rentAfter = rentBase * (1 - discount / 100);
    var print = (item.format !== "led_screen" && fmt.printPrice) ? fmt.printPrice : 0;
    var total = rentAfter + print;
    return { monthly: monthly, months: months, discount: discount, rentBase: rentBase, rentAfter: rentAfter, print: print, total: total };
  }

  function renderItems() {
    var el = document.getElementById("mp-items");
    el.innerHTML = items.map(function (item, idx) {
      var fmt = RL.formats[item.format];
      var price = priceFor(item);
      var monthOpts = RL_OCC.monthList(12).map(function (m, i) {
        return '<option value="' + i + '"' + (i === item.startOffset ? " selected" : "") + ">" + m.label + "</option>";
      }).join("");
      var durOpts = [1, 2, 3, 6, 12].map(function (n) {
        return '<option value="' + n + '"' + (n === item.months ? " selected" : "") + ">" + n + " мес.</option>";
      }).join("");
      return (
        '<div class="mp-item" data-idx="' + idx + '">' +
          RL_UTIL.photoTile(item.structureId, item.side ? item.side.code : null, item.title, item.format, { height: "84px", style: "width:110px;flex-shrink:0", thumb: true }) +
          '<div class="info">' +
            "<h4>" + RL_UTIL.escapeHtml(item.title) + (item.side ? " · сторона " + item.side.code : "") + "</h4>" +
            '<div class="meta">' + item.city + " · " + fmt.shortTitle + "</div>" +
            '<div class="flex gap-8 no-print">' +
              '<select data-role="start" data-idx="' + idx + '">' + monthOpts + "</select>" +
              '<select data-role="months" data-idx="' + idx + '">' + durOpts + "</select>" +
            "</div>" +
            '<button class="remove no-print" data-remove="' + idx + '">Удалить из медиаплана</button>' +
          "</div>" +
          '<div class="price">' + RL_UTIL.money(price.total) + (price.discount ? '<div class="text-sm muted">скидка ' + price.discount + "%</div>" : "") + "</div>" +
        "</div>"
      );
    }).join("");

    el.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-remove"), 10);
        var it = items[idx];
        RL_UTIL.mpRemove(it.structureId, it.side ? it.side.code : null);
        items.splice(idx, 1);
        if (!items.length) { location.reload(); return; }
        renderAll();
      });
    });
    el.querySelectorAll('[data-role="start"]').forEach(function (sel) {
      sel.addEventListener("change", function () {
        items[parseInt(sel.getAttribute("data-idx"), 10)].startOffset = parseInt(sel.value, 10);
        persistAndRender();
      });
    });
    el.querySelectorAll('[data-role="months"]').forEach(function (sel) {
      sel.addEventListener("change", function () {
        items[parseInt(sel.getAttribute("data-idx"), 10)].months = parseInt(sel.value, 10);
        persistAndRender();
      });
    });
  }

  function persistAndRender() {
    var d = RL_UTIL.mpLoad();
    d.items = items.map(function (it) {
      return { structureId: it.structureId, side: it.side ? it.side.code : null, format: it.format, title: it.title, city: it.city, startOffset: it.startOffset, months: it.months, addedAt: it.addedAt };
    });
    RL_UTIL.mpSave(d);
    renderAll();
  }

  function renderSummary() {
    var rentTotal = 0, printTotal = 0, feeTotal = 0, grandTotal = 0;
    items.forEach(function (item) {
      var p = priceFor(item);
      rentTotal += p.rentAfter;
      printTotal += p.print;
      var fee = RL_UTIL.feeEstimate(p.total, item.format);
      feeTotal += fee.amount;
      grandTotal += p.total;
    });
    document.getElementById("summary-lines").innerHTML =
      '<div class="summary-line"><span>Площадок в подборке</span><span>' + items.length + "</span></div>" +
      '<div class="summary-line"><span>Аренда</span><span>' + RL_UTIL.money(rentTotal) + "</span></div>" +
      (printTotal ? '<div class="summary-line"><span>Печать постеров</span><span>' + RL_UTIL.money(printTotal) + "</span></div>" : "") +
      '<div class="summary-line total"><span>Итого</span><span>' + RL_UTIL.money(grandTotal) + "</span></div>" +
      '<div class="summary-line text-sm muted"><span>Сбор за размещение рекламы (справочно, плательщик — рекламодатель)</span><span>' + RL_UTIL.money(feeTotal) + "</span></div>" +
      '<div class="summary-line text-sm muted"><span>НДС</span><span>не облагается</span></div>';
  }

  function renderReach() {
    var withReach = 0, total = 0, unique = 0, grandTotal = 0;
    items.forEach(function (item) {
      var reach = item.side ? RL_UTIL.reachFor(item.structureId, item.side.code) : RL_UTIL.reachFor(item.structureId);
      var p = priceFor(item);
      grandTotal += p.total;
      if (reach) { withReach++; total += reach.total; unique += reach.unique; }
    });
    var cpm = total ? RL_UTIL.cpm(grandTotal, total) : null;
    document.getElementById("mp-reach-numbers").innerHTML =
      total
        ? "<b style='font-size:20px'>" + RL_UTIL.int(total) + "</b> конт./мес" + (cpm ? " · CPM " + RL_UTIL.money(cpm) : "")
        : "<span class='muted'>Данные уточняются</span>";
    document.getElementById("mp-reach-note").textContent =
      withReach + " из " + items.length + " площадок с данными МТС Охват. Суммарный уникальный охват — " + (unique ? RL_UTIL.int(unique) + " чел." : "не рассчитан") +
      "; аудитории поверхностей могут пересекаться, значение является верхней оценкой.";
  }

  var map = null;
  function renderMap() {
    if (!map) {
      map = L.map("mp-map", { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
    }
    var bounds = [];
    items.forEach(function (item) {
      var st = item.structure;
      var fmt = RL.formats[item.format];
      var icon = L.divIcon({ className: "", html: '<div class="rl-marker" style="width:20px;height:20px;background:' + fmt.color + '"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
      L.marker([st.lat, st.lng], { icon: icon }).addTo(map).bindPopup(item.title);
      bounds.push([st.lat, st.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 15); else map.fitBounds(bounds, { padding: [30, 30] });
    setTimeout(function () { map.invalidateSize(); }, 150);
  }

  function renderAll() {
    renderItems();
    renderSummary();
    renderReach();
    renderMap();
  }
  renderAll();

  document.getElementById("btn-pdf").addEventListener("click", function () { window.print(); });

  // approval note if any outdoor structure requires content approval
  var needsApproval = items.some(function (it) { return it.structure.requiresContentApproval; });
  if (needsApproval) document.getElementById("approval-note").style.display = "block";

  var payerSel = document.getElementById("f-payer");
  function toggleUnp() { document.getElementById("f-unp-row").style.display = payerSel.value === "person" ? "none" : "flex"; }
  payerSel.addEventListener("change", toggleUnp);
  toggleUnp();

  document.getElementById("f-unp").addEventListener("blur", function () {
    var v = this.value.trim();
    if (v.length === 9 && /^\d+$/.test(v)) {
      document.getElementById("f-company").value = "ООО «Клиент " + v.slice(-4) + "»";
    }
  });

  document.getElementById("btn-submit").addEventListener("click", function () {
    var name = document.getElementById("f-name").value.trim();
    var phone = document.getElementById("f-phone").value.trim();
    var email = document.getElementById("f-email").value.trim();
    var pd = document.getElementById("f-consent-pd").checked;
    if (!name || !phone || !email) { alert("Заполните контактное лицо, телефон и e-mail."); return; }
    if (!pd) { alert("Необходимо согласие на обработку персональных данных."); return; }
    var num = "RL-" + new Date().getFullYear() + "-" + String(Math.floor(1000 + Math.random() * 9000));
    document.getElementById("success-number").textContent = num;
    document.getElementById("apply-form").style.display = "none";
    document.getElementById("apply-success").style.display = "block";
    document.getElementById("apply-success").scrollIntoView({ behavior: "smooth" });

    var cities = items.reduce(function (acc, it) { if (acc.indexOf(it.city) < 0) acc.push(it.city); return acc; }, []);
    var formats = items.reduce(function (acc, it) { var t = RL.formats[it.format].shortTitle; if (acc.indexOf(t) < 0) acc.push(t); return acc; }, []);
    var starts = items.map(function (it) { return it.startOffset || 0; });
    var ends = items.map(function (it) { return (it.startOffset || 0) + (it.months || 1) - 1; });
    var startM = RL_OCC.monthList(1, Math.min.apply(null, starts))[0];
    var endM = RL_OCC.monthList(1, Math.max.apply(null, ends))[0];
    var period = startM.label === endM.label ? startM.short : startM.short + "–" + endM.short;
    var grandTotal = items.reduce(function (sum, it) { return sum + priceFor(it).total; }, 0);
    var orderItems = items.map(function (it) {
      return { structureId: it.structureId, side: it.side ? it.side.code : null, format: it.format, title: it.title, city: it.city, startOffset: it.startOffset, months: it.months };
    });

    RL_UTIL.ordersAdd({
      number: num,
      date: new Date().toISOString(),
      meta: cities.join(", ") + " · " + formats.join(", ") + " · " + items.length + (items.length === 1 ? " позиция" : " позиций") + " · " + period,
      total: grandTotal,
      status: "new",
      items: orderItems
    });

    RL_UTIL.mpClear();
  });
})();
