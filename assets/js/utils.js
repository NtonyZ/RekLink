/* RekLink.by — общие утилиты: форматирование, расчёты цены/охвата/сбора, медиаплан. */
(function (global) {
  "use strict";

  function money(n) {
    var v = Math.round(n * 100) / 100;
    return v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " BYN";
  }
  function int(n) {
    return Math.round(n).toLocaleString("ru-RU");
  }
  function pct(n) {
    return (Math.round(n * 10) / 10) + "%";
  }

  // Единый плоский список продаваемых единиц каталога: сторона скроллера или LED-экран.
  function catalogItems() {
    var items = [];
    RL.structures.forEach(function (st) {
      st.sides.forEach(function (side) {
        var format = side.positions[0] ? side.positions[0].format : "poster_static";
        var fmt = RL.formats[format];
        items.push({
          id: st.id + "-" + side.code, type: "side",
          structureId: st.id, sideCode: side.code,
          structure: st, side: side, format: format, displayType: side.displayType,
          lat: st.lat, lng: st.lng, city: st.city, title: st.publicTitle, price: fmt.priceMonth
        });
      });
    });
    RL.ledScreens.forEach(function (led) {
      items.push({
        id: led.id, type: "led", structureId: led.id, sideCode: null,
        structure: led, side: null, format: "led_screen", displayType: "media",
        lat: led.lat, lng: led.lng, city: led.city, title: led.title,
        price: RL.ledScreenRates[0].month.s10
      });
    });
    return items;
  }

  function itemAvailability(item, offset) {
    if (item.type === "led") {
      var st = RL_OCC.statusFor(item.structureId, "X", 1, "led_screen", offset);
      return { free: st === "commercial" ? 0 : 1, commercial: st === "commercial" ? 1 : 0, social: 0, total: 1 };
    }
    return RL_OCC.sideSummary(item.structure, item.side, offset);
  }

  function itemFreeForRange(item, startOffset, months) {
    for (var i = 0; i < months; i++) {
      var summary = itemAvailability(item, startOffset + i);
      if (summary.free === 0) return false;
    }
    return true;
  }

  function flattenPositions() {
    var out = [];
    RL.structures.forEach(function (st) {
      st.sides.forEach(function (side) {
        side.positions.forEach(function (p) {
          out.push({
            structure: st,
            side: side,
            position: p,
            key: RL_OCC.positionKey(st.id, side.code, p.number),
            format: p.format
          });
        });
      });
    });
    return out;
  }

  function reachFor(structureOrLedId, sideCode) {
    var key = sideCode ? (structureOrLedId + "-" + sideCode) : structureOrLedId;
    return RL.reach[key] || null;
  }

  function cpm(priceTotal, reachTotal) {
    if (!reachTotal) return null;
    return priceTotal / (reachTotal / 1000);
  }

  function feeEstimate(amount, format) {
    var fmt = RL.formats[format];
    var rate = fmt ? fmt.feeRate : 10;
    return { rate: rate, amount: amount * (rate / 100) };
  }

  function discountForSelection(months, positionsCount) {
    var best = 0;
    RL.discounts.durationTiers.forEach(function (t) { if (months >= t.minMonths) best = Math.max(best, t.percent); });
    RL.discounts.volumeTiers.forEach(function (t) { if (positionsCount >= t.minPositions) best = Math.max(best, t.percent); });
    return Math.min(best, RL.discounts.maxTotalPercent);
  }

  // ---- Медиаплан: хранится в localStorage, эмулируя "сохранение по ссылке" (п. 8.5.5 ТЗ) ----
  var MP_KEY = "reklink_mediaplan_v1";

  function mpLoad() {
    try {
      var raw = localStorage.getItem(MP_KEY);
      if (!raw) return { items: [], createdAt: null };
      var data = JSON.parse(raw);
      if (data.createdAt && (Date.now() - data.createdAt) > 30 * 24 * 3600 * 1000) {
        localStorage.removeItem(MP_KEY);
        return { items: [], createdAt: null };
      }
      return data;
    } catch (e) { return { items: [], createdAt: null }; }
  }
  function mpSave(data) {
    data.createdAt = data.createdAt || Date.now();
    localStorage.setItem(MP_KEY, JSON.stringify(data));
  }
  function mpAdd(item) {
    var data = mpLoad();
    var exists = data.items.some(function (i) { return i.structureId === item.structureId && i.side === item.side; });
    if (!exists) data.items.push(item);
    mpSave(data);
    return data;
  }
  function mpRemove(structureId, side) {
    var data = mpLoad();
    data.items = data.items.filter(function (i) { return !(i.structureId === structureId && i.side === side); });
    mpSave(data);
    return data;
  }
  function mpClear() {
    localStorage.removeItem(MP_KEY);
  }
  function mpCount() {
    return mpLoad().items.length;
  }

  // ---- Заказы клиента: заявки, отправленные из медиаплана, отражаются в личном кабинете (раздел 9, п. 11.2 ТЗ) ----
  var ORDERS_KEY = "reklink_orders_v1";

  function ordersLoad() {
    try {
      var raw = localStorage.getItem(ORDERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function ordersAdd(order) {
    var orders = ordersLoad();
    orders.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 20)));
  }

  function qs(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Заглушка фотографии: настоящие снимки загружаются администратором (п. 5.2 ТЗ);
  // в прототипе используется цветной блок с меткой формата и адресом.
  function photoPlaceholder(label, formatCode, opts) {
    opts = opts || {};
    var fmt = RL.formats[formatCode] || {};
    var icon = { poster_static: "🖼", poster_dynamic: "🔄", media_poster: "📺", led_screen: "🖥", indoor: "📶" }[formatCode] || "📷";
    var h = opts.height || "180px";
    return (
      '<div class="photo-ph" style="height:' + h + ';background:linear-gradient(135deg,' + (fmt.color || "#3b2a98") + "cc, " + (fmt.color || "#7b1fa2") + '55), var(--bg-soft)">' +
        '<span class="photo-ph-icon">' + icon + "</span>" +
        '<span class="photo-ph-label">' + escapeHtml(label) + "</span>" +
      "</div>"
    );
  }

  function availabilityBadge(avail) {
    var map = {
      free: ['badge-free', 'Свободно'],
      partial: ['badge-partial', 'Частично свободно'],
      busy: ['badge-busy', 'Занято']
    };
    var m = map[avail] || map.busy;
    return '<span class="badge ' + m[0] + '">' + m[1] + "</span>";
  }

  global.RL_UTIL = {
    money: money, int: int, pct: pct,
    flattenPositions: flattenPositions,
    reachFor: reachFor, cpm: cpm, feeEstimate: feeEstimate,
    discountForSelection: discountForSelection,
    mpLoad: mpLoad, mpSave: mpSave, mpAdd: mpAdd, mpRemove: mpRemove, mpClear: mpClear, mpCount: mpCount,
    ordersLoad: ordersLoad, ordersAdd: ordersAdd,
    qs: qs, escapeHtml: escapeHtml,
    photoPlaceholder: photoPlaceholder, availabilityBadge: availabilityBadge,
    catalogItems: catalogItems, itemAvailability: itemAvailability, itemFreeForRange: itemFreeForRange
  };
})(window);
