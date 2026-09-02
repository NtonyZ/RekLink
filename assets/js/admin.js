/* forus.by — адресная программа (раздел 10.1 ТЗ): сводный календарь занятости для сотрудников. */
(function () {
  "use strict";
  RL_LAYOUT.render("admin.html");

  // ---- плоский список позиций, сгруппированных по конструкции и стороне ----
  function buildRows() {
    var rows = [];
    RL.structures.forEach(function (st) {
      st.sides.forEach(function (side) {
        side.positions.forEach(function (p) {
          rows.push({
            structureId: st.id, structureTitle: st.publicTitle || st.title, city: st.city,
            sideCode: side.code, displayType: side.displayType, trafficType: st.trafficType,
            positionNumber: p.number, format: p.format, label: side.code + p.number,
            reach: RL_UTIL.reachFor(st.id, side.code)
          });
        });
      });
    });
    RL.ledScreens.forEach(function (ls) {
      rows.push({
        structureId: ls.id, structureTitle: ls.title, city: ls.city,
        sideCode: "X", displayType: "led",
        positionNumber: 1, format: "led_screen", label: "Экран",
        reach: RL_UTIL.reachFor(ls.id)
      });
    });
    return rows;
  }
  var ALL_ROWS = buildRows();

  var citySel = document.getElementById("a-city");
  // Адресная программа — только собственные конструкции, поэтому города наружные.
  RL.outdoorCities.forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; citySel.appendChild(o); });

  // ---- состояние: фильтры и горизонт (переключение окна на 12 месяцев, п. 10.1.4) ----
  var state = { city: "", format: "", status: "", search: "" };
  var horizonOffset = 0;

  function updateHorizonLabel() {
    var months = RL_OCC.monthList(12, horizonOffset);
    document.getElementById("a-horizon-label").textContent = months[0].label + " — " + months[11].label;
  }

  document.getElementById("a-city").addEventListener("change", function (e) { state.city = e.target.value; renderCalendar(); });
  document.getElementById("a-format").addEventListener("change", function (e) { state.format = e.target.value; renderCalendar(); });
  document.getElementById("a-status").addEventListener("change", function (e) { state.status = e.target.value; renderCalendar(); });
  document.getElementById("a-search").addEventListener("input", function (e) { state.search = e.target.value.trim().toLowerCase(); renderCalendar(); });
  document.getElementById("a-prev").addEventListener("click", function () { horizonOffset -= 12; updateHorizonLabel(); renderCalendar(); });
  document.getElementById("a-next").addEventListener("click", function () { horizonOffset += 12; updateHorizonLabel(); renderCalendar(); });

  document.querySelectorAll(".adm-tabs button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".adm-tabs button").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-calendar").style.display = btn.dataset.tab === "calendar" ? "block" : "none";
      document.getElementById("tab-idle").style.display = btn.dataset.tab === "idle" ? "block" : "none";
    });
  });

  // ---- вкладка «Календарь занятости» ----
  function renderCalendar() {
    var months = RL_OCC.monthList(12, horizonOffset);
    var rows = ALL_ROWS.filter(function (r) {
      if (state.city && r.city !== state.city) return false;
      if (state.format && r.format !== state.format) return false;
      return true;
    });

    // текущий статус (первый месяц окна) — для фильтра «статус» и поиска по клиенту
    rows.forEach(function (r) {
      r._curStatus = RL_OCC.statusFor(r.structureId, r.sideCode, r.positionNumber, r.format, horizonOffset);
      r._curClient = r._curStatus === "commercial" ? RL_OCC.clientNameFor(RL_OCC.positionKey(r.structureId, r.sideCode, r.positionNumber), months[0].monthIndex) : "";
      // освобождается в ближайшие 30 дней: считаем от реального текущего месяца, а не от просматриваемого окна
      var st0 = RL_OCC.statusFor(r.structureId, r.sideCode, r.positionNumber, r.format, 0);
      var st1 = RL_OCC.statusFor(r.structureId, r.sideCode, r.positionNumber, r.format, 1);
      r._freeingSoon = st0 === "commercial" && st1 !== "commercial";
    });

    if (state.status) rows = rows.filter(function (r) { return r._curStatus === state.status; });
    if (state.search) {
      rows = rows.filter(function (r) {
        return r.structureTitle.toLowerCase().indexOf(state.search) !== -1 || r._curClient.toLowerCase().indexOf(state.search) !== -1;
      });
    }

    var head = "<tr><th>Позиция</th>" + months.map(function (m) { return "<th>" + m.short + "</th>"; }).join("") + "</tr>";
    var body = "";
    var lastGroup = null;
    var groupCount = 0;
    rows.forEach(function (r) {
      var groupKey = r.structureId + "-" + r.sideCode;
      if (groupKey !== lastGroup) {
        var fmt = RL.formats[r.format];
        var dirLabel = r.sideCode !== "X" ? RL_UTIL.sideDirectionLabel(r.trafficType, r.sideCode) : "";
        body += '<tr class="adm-group"><td colspan="' + (months.length + 1) + '">' +
          RL_UTIL.escapeHtml(r.structureTitle) + " · сторона " + r.sideCode + " · " + r.city +
          (dirLabel ? " · " + dirLabel : "") +
          '<span class="fmt-badge" style="background:' + fmt.color + '">' + RL_UTIL.escapeHtml(fmt.shortTitle) + "</span>" +
          "</td></tr>";
        lastGroup = groupKey;
        groupCount++;
      }
      body += "<tr><td>" + r.label + (r._freeingSoon ? '<span class="adm-bell" title="Освобождается в ближайшие 30 дней">🔔</span>' : "") + "</td>" +
        months.map(function (m, i) {
          var st = RL_OCC.statusFor(r.structureId, r.sideCode, r.positionNumber, r.format, horizonOffset + i);
          var label = st === "commercial" ? RL_OCC.clientNameFor(RL_OCC.positionKey(r.structureId, r.sideCode, r.positionNumber), m.monthIndex) : (st === "social" ? "Социальная реклама" : "Свободно");
          return '<td><div class="adm-cell adm-' + st + '" title="' + RL_UTIL.escapeHtml(label) + '"></div></td>';
        }).join("") +
        "</tr>";
    });

    document.getElementById("a-table").innerHTML = head + body;
    document.getElementById("a-count").textContent = "Показано позиций: " + rows.length + " из " + ALL_ROWS.length + " · конструкций/сторон: " + groupCount;
  }

  // ---- вкладка «Простаивающие позиции» (п. 10.1.10) ----
  function renderIdle() {
    var bySide = {};
    ALL_ROWS.forEach(function (r) {
      var key = r.structureId + "-" + r.sideCode;
      if (!bySide[key]) bySide[key] = { structureId: r.structureId, structureTitle: r.structureTitle, city: r.city, sideCode: r.sideCode, trafficType: r.trafficType, format: r.format, reach: r.reach, total: 0, idle: 0 };
      bySide[key].total++;
      var st0 = RL_OCC.statusFor(r.structureId, r.sideCode, r.positionNumber, r.format, 0);
      var st1 = RL_OCC.statusFor(r.structureId, r.sideCode, r.positionNumber, r.format, 1);
      if (st0 !== "commercial" && st1 !== "commercial") bySide[key].idle++;
    });
    var entries = Object.keys(bySide).map(function (k) { return bySide[k]; }).filter(function (e) { return e.idle > 0; });
    entries.sort(function (a, b) {
      var ra = a.reach ? a.reach.total : -1, rb = b.reach ? b.reach.total : -1;
      if (ra !== rb) return rb - ra;
      return b.idle - a.idle;
    });

    document.getElementById("idle-list").innerHTML = entries.map(function (e) {
      var fmt = RL.formats[e.format];
      var reachText = e.reach ? RL_UTIL.int(e.reach.total) + " конт./мес" : "охват уточняется";
      var href = "structure.html?id=" + e.structureId + (e.sideCode !== "X" ? "&side=" + e.sideCode : "");
      var dirLabel = e.sideCode !== "X" ? RL_UTIL.sideDirectionLabel(e.trafficType, e.sideCode) : "";
      return '<div class="idle-row">' +
        '<div class="info"><b>' + RL_UTIL.escapeHtml(e.structureTitle) + "</b> · сторона " + e.sideCode + (dirLabel ? " (" + dirLabel + ")" : "") +
          '<span class="fmt-badge" style="background:' + fmt.color + '">' + RL_UTIL.escapeHtml(fmt.shortTitle) + "</span>" +
          '<div class="meta">' + e.city + " · свободно " + e.idle + " из " + e.total + " позиций · " + reachText + "</div></div>" +
        '<a href="' + href + '" class="btn btn-outline btn-sm">Открыть карточку</a>' +
      "</div>";
    }).join("") || '<div class="empty-state">По текущим данным простаивающих сторон нет.</div>';
  }

  updateHorizonLabel();
  renderCalendar();
  renderIdle();
})();
