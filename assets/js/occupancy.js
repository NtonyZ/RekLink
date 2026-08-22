/*
 * Демонстрационная модель занятости позиций по месяцам.
 * Реальный источник — таблица occupancy (раздел 7.3 ТЗ), которая в проде ведётся
 * менеджерами и производством. Здесь занятость рассчитывается детерминированно
 * (без бэкенда) на основе фактических показателей загрузки из раздела 2.2 и
 * контрольных значений миграции из Приложения В, чтобы витрина выглядела
 * реалистично: медиа-постеры почти распроданы, статичный плакат простаивает.
 */
(function (global) {
  "use strict";

  // Целевая доля коммерческой загрузки по месяцам (индекс 0 = январь) для трёх
  // плакатных форматов. Известные точки — из раздела 2.2 ТЗ (июль/август и, для
  // медиа-постеров, январь/апрель/май/июнь); остальные месяцы интерполированы.
  var COMMERCIAL_RATE = {
    media_poster: [0.472, 0.52, 0.56, 0.583, 0.667, 0.639, 0.833, 0.750, 0.55, 0.45, 0.35, 0.30],
    poster_dynamic: [0.10, 0.12, 0.15, 0.17, 0.19, 0.21, 0.244, 0.276, 0.15, 0.10, 0.06, 0.05],
    poster_static: [0.08, 0.09, 0.11, 0.13, 0.15, 0.16, 0.178, 0.168, 0.09, 0.06, 0.04, 0.03]
  };
  // Доля свободных плакатных позиций, занятых социальной рекламой (на медиа-постерах
  // социальных размещений почти нет — п. 2.2 ТЗ).
  var SOCIAL_RATE_BY_MONTH = [0.22, 0.22, 0.21, 0.20, 0.20, 0.19, 0.19, 0.20, 0.04, 0.03, 0.02, 0.02];

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand01(key) {
    return mulberry32(hashStr(key))();
  }

  function monthList(count, startOffset) {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var out = [];
    var names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    for (var i = 0; i < count; i++) {
      var idx = m + (startOffset || 0) + i;
      var yy = y + Math.floor(idx / 12);
      var mm = ((idx % 12) + 12) % 12;
      out.push({ year: yy, monthIndex: mm, label: names[mm] + " " + yy, short: names[mm].slice(0, 3) + " " + String(yy).slice(2) });
    }
    return out;
  }

  // status: 'commercial' | 'social' | 'free'
  function positionStatus(posKey, format, calMonthIndex) {
    if (format === "led_screen" || format === "indoor") {
      var r0 = rand01(posKey + "|" + calMonthIndex + "|led");
      return r0 < 0.55 ? "commercial" : "free";
    }
    var rate = COMMERCIAL_RATE[format] || COMMERCIAL_RATE.poster_static;
    var commercialP = rate[calMonthIndex % 12];
    var r = rand01(posKey + "|" + calMonthIndex + "|c");
    if (r < commercialP) return "commercial";
    if (format !== "media_poster") {
      var socialP = SOCIAL_RATE_BY_MONTH[calMonthIndex % 12];
      var r2 = rand01(posKey + "|" + calMonthIndex + "|s");
      if (r2 < socialP) return "social";
    }
    return "free";
  }

  function positionKey(structureId, sideCode, positionNumber) {
    return structureId + "-" + sideCode + "-" + positionNumber;
  }

  // Возвращает статус позиции для конкретного месяца горизонта (offset от текущего, 0..11)
  function statusFor(structureId, sideCode, positionNumber, format, offset) {
    var m = monthList(1, offset)[0];
    var key = positionKey(structureId, sideCode, positionNumber);
    return positionStatus(key, format, m.monthIndex);
  }

  // Сводка по стороне за месяц: {free, commercial, social, total}
  function sideSummary(structure, side, offset) {
    var out = { free: 0, commercial: 0, social: 0, total: side.positions.length };
    side.positions.forEach(function (p) {
      var st = statusFor(structure.id, side.code, p.number, p.format, offset);
      out[st]++;
    });
    return out;
  }

  // Сводка по конструкции (обе стороны) за месяц
  function structureSummary(structure, offset) {
    var out = { free: 0, commercial: 0, social: 0, total: 0 };
    structure.sides.forEach(function (side) {
      var s = sideSummary(structure, side, offset);
      out.free += s.free; out.commercial += s.commercial; out.social += s.social; out.total += s.total;
    });
    return out;
  }

  // Доступность конструкции для карты/списка: 'free' | 'partial' | 'busy'
  function availabilityLabel(summary) {
    if (summary.total === 0) return "busy";
    var openShare = (summary.free + summary.social) / summary.total;
    if (openShare > 0.5) return "free";
    if (openShare > 0) return "partial";
    return "busy";
  }

  global.RL_OCC = {
    monthList: monthList,
    positionKey: positionKey,
    statusFor: statusFor,
    sideSummary: sideSummary,
    structureSummary: structureSummary,
    availabilityLabel: availabilityLabel
  };
})(window);
