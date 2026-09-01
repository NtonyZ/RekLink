/*
 * forus.by — единая обёртка над картой.
 *
 * Провайдер выбирается в RL.maps.provider (data.js):
 *   "osm"    — OpenStreetMap + Leaflet (раздел 15 ТЗ, работает без ключа);
 *   "yandex" — Яндекс Карты, JS API 3.0, требует ключ RL.maps.yandexApiKey.
 *
 * Координаты во внешнем интерфейсе везде задаются как [широта, долгота] —
 * в том же порядке, что в data.js. Пересчёт под порядок конкретного API
 * выполняет адаптер, поэтому данные при смене провайдера не трогаются.
 *
 * Адаптер Яндекса будет добавлен, когда заказчик выпустит ключ продукта
 * «JavaScript API и HTTP Геокодер»: до этого писать его вслепую нельзя —
 * код нечем проверить. Пока provider !== "osm", модуль сообщает об этом
 * в консоль и работает через OpenStreetMap, чтобы карты не пропали с сайта.
 */
(function (global) {
  "use strict";

  var VITEBSK = [55.19, 30.21];

  function providerName() {
    var cfg = global.RL && RL.maps ? RL.maps : {};
    if (cfg.provider === "yandex") {
      if (!ADAPTERS.yandex) {
        console.warn("[RL_MAP] Адаптер Яндекс Карт ещё не подключён — карта отрисована через OpenStreetMap.");
        return "osm";
      }
      if (!cfg.yandexApiKey) {
        console.warn("[RL_MAP] Не задан RL.maps.yandexApiKey — карта отрисована через OpenStreetMap.");
        return "osm";
      }
      return "yandex";
    }
    return "osm";
  }

  // ---- Адаптер OpenStreetMap + Leaflet -------------------------------------
  function createOsm(containerId, opts) {
    if (typeof L === "undefined") {
      console.warn("[RL_MAP] Leaflet не загружен на этой странице.");
      return null;
    }
    var map = L.map(containerId, {
      scrollWheelZoom: opts.scrollWheelZoom !== false,
      zoomControl: opts.zoomControl !== false
    }).setView(opts.center || VITEBSK, opts.zoom || 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    // Кластеризация — только там, где подключён markercluster (каталог)
    var useCluster = opts.cluster && typeof L.markerClusterGroup === "function";
    var layer = useCluster ? L.markerClusterGroup({ maxClusterRadius: 50 }) : L.layerGroup();
    map.addLayer(layer);

    var byId = {};

    function icon(m) {
      var size = m.size || 20;
      var ring = m.ringColor ? ";outline:3px solid " + m.ringColor : "";
      return L.divIcon({
        className: "",
        html: '<div class="rl-marker" style="width:' + size + "px;height:" + size + "px;background:" + m.color + ring + '"></div>',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2]
      });
    }

    return {
      provider: "osm",
      setMarkers: function (list) {
        layer.clearLayers();
        byId = {};
        list.forEach(function (m) {
          var marker = L.marker([m.lat, m.lng], { icon: icon(m) });
          if (m.popupHtml) {
            marker.bindPopup(m.popupHtml);
            if (m.onPopupOpen) {
              marker.on("popupopen", function (e) { m.onPopupOpen(e.popup._contentNode); });
            }
          }
          layer.addLayer(marker);
          if (m.id) byId[m.id] = marker;
        });
      },
      // Наведение на карточку списка. Обе стороны конструкции стоят в одной точке,
      // поэтому метка почти всегда скрыта в кластере: открыть её попап нельзя, а
      // «подзумить» на каждое наведение — раздражает. Поэтому подсвечиваем кластер,
      // в котором сидит нужная метка, и открываем попап только когда метка видна.
      openPopup: function (id) {
        var mk = byId[id];
        if (!mk) return;
        var visible = (useCluster && layer.getVisibleParent) ? layer.getVisibleParent(mk) : mk;
        if (!visible || visible === mk) { mk.openPopup(); return; }
        var el = visible._icon;
        if (!el) return;
        el.classList.add("rl-cluster-hl");
        clearTimeout(el._hlTimer);
        el._hlTimer = setTimeout(function () { el.classList.remove("rl-cluster-hl"); }, 1200);
      },
      setView: function (latlng, zoom) { map.setView(latlng, zoom); },
      fitBounds: function (points, padding) {
        if (!points.length) return;
        if (points.length === 1) { map.setView(points[0], 15); return; }
        map.fitBounds(points, { padding: [padding || 30, padding || 30] });
      },
      invalidateSize: function (delay) {
        setTimeout(function () { map.invalidateSize(); }, delay || 0);
      },
      raw: map
    };
  }

  var ADAPTERS = { osm: createOsm, yandex: null };

  global.RL_MAP = {
    create: function (containerId, opts) {
      opts = opts || {};
      return ADAPTERS[providerName()](containerId, opts);
    },
    provider: providerName
  };
})(window);
