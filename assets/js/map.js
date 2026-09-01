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

  // ---- Адаптер Яндекс Карт (JS API 3.0) ------------------------------------
  // Сигнатуры сверены по самой библиотеке, а не по документации:
  //   YMapMarker принимает HTML-элемент вторым аргументом — это видно по
  //   реактовой обёртке, которая вызывает super(props, markerElement);
  //   location понимает {center, zoom} и {bounds};
  //   кластеризация — пакет @yandex/ymaps3-clusterer@0.0.1, экспортирует
  //   YMapClusterer и clusterByGrid({gridSize}), читает props features/marker/cluster/method.
  var ymLoad = null;
  function loadYandex(key) {
    if (ymLoad) return ymLoad;
    ymLoad = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://api-maps.yandex.ru/v3/?apikey=" + encodeURIComponent(key) + "&lang=ru_RU";
      s.onload = function () {
        if (!global.ymaps3) { reject(new Error("объект ymaps3 не появился")); return; }
        global.ymaps3.ready.then(function () { resolve(global.ymaps3); }, reject);
      };
      s.onerror = function () {
        reject(new Error("скрипт не загрузился — обычно 403: домен не разрешён в настройках ключа"));
      };
      document.head.appendChild(s);
    });
    return ymLoad;
  }

  function lngLat(latlng) { return [latlng[1], latlng[0]]; }

  function buildYandex(ym, containerId, opts) {
    var container = document.getElementById(containerId);
    var map = new ym.YMap(container, {
      location: { center: lngLat(opts.center || VITEBSK), zoom: opts.zoom || 13 }
    });
    map.addChild(new ym.YMapDefaultSchemeLayer());
    map.addChild(new ym.YMapDefaultFeaturesLayer());

    var placed = [], byId = {}, popup = null, clusterer = null;

    function dot(m) {
      var size = m.size || 20;
      var d = document.createElement("div");
      d.className = "rl-marker";
      d.style.cssText = "width:" + size + "px;height:" + size + "px;background:" + m.color +
        (m.ringColor ? ";outline:3px solid " + m.ringColor : "");
      if (m.popupHtml) d.style.cursor = "pointer";
      return d;
    }
    function closePopup() {
      if (popup) { map.removeChild(popup); popup = null; }
    }
    function showPopup(m) {
      closePopup();
      var box = document.createElement("div");
      box.className = "ym-pop";
      box.innerHTML = '<button class="ym-pop-x" aria-label="Закрыть">×</button>' + m.popupHtml;
      box.addEventListener("click", function (e) {
        if (e.target.classList.contains("ym-pop-x")) closePopup();
      });
      popup = new ym.YMapMarker({ coordinates: [m.lng, m.lat], zIndex: 1000 }, box);
      map.addChild(popup);
      if (m.onPopupOpen) m.onPopupOpen(box);
    }
    function makeMarker(m) {
      var el = dot(m);
      if (m.popupHtml) el.addEventListener("click", function () { showPopup(m); });
      return new ym.YMapMarker({ coordinates: [m.lng, m.lat] }, el);
    }

    function clear() {
      closePopup();
      placed.forEach(function (e) { map.removeChild(e); });
      placed = [];
      if (clusterer) { map.removeChild(clusterer); clusterer = null; }
      byId = {};
    }

    return {
      provider: "yandex",
      setMarkers: function (list) {
        clear();
        list.forEach(function (m) { if (m.id) byId[m.id] = m; });

        if (opts.cluster && ym.__rlClusterer) {
          var C = ym.__rlClusterer;
          clusterer = new C.YMapClusterer({
            method: C.clusterByGrid({ gridSize: 64 }),
            features: list.map(function (m) {
              return { type: "Feature", id: String(m.id), geometry: { type: "Point", coordinates: [m.lng, m.lat] }, properties: {} };
            }),
            marker: function (f) {
              var m = byId[f.id];
              return makeMarker(m);
            },
            cluster: function (coordinates, feats) {
              var d = document.createElement("div");
              d.className = "rl-cluster";
              d.textContent = feats.length;
              return new ym.YMapMarker({ coordinates: coordinates }, d);
            }
          });
          map.addChild(clusterer);
          return;
        }
        list.forEach(function (m) {
          var e = makeMarker(m);
          map.addChild(e);
          placed.push(e);
        });
      },
      openPopup: function (id) { if (byId[id]) showPopup(byId[id]); },
      setView: function (latlng, zoom) {
        map.setLocation({ center: lngLat(latlng), zoom: zoom, duration: 300 });
      },
      fitBounds: function (points) {
        if (!points.length) return;
        if (points.length === 1) { map.setLocation({ center: lngLat(points[0]), zoom: 15, duration: 300 }); return; }
        var lats = points.map(function (p) { return p[0]; });
        var lngs = points.map(function (p) { return p[1]; });
        map.setLocation({
          bounds: [[Math.min.apply(null, lngs), Math.max.apply(null, lats)],
                   [Math.max.apply(null, lngs), Math.min.apply(null, lats)]],
          duration: 300
        });
      },
      invalidateSize: function () { /* ymaps3 сам следит за размером контейнера */ },
      raw: map
    };
  }

  // Провайдер асинхронный, а вызывающий код синхронный: отдаём заглушку и
  // проигрываем в неё накопленные вызовы, когда карта готова. Если Яндекс не
  // поднялся — молча становимся на OpenStreetMap, чтобы карта не пропала.
  function createYandex(containerId, opts) {
    var impl = null, queue = [];
    function run(fn) { if (impl) fn(impl); else queue.push(fn); }
    function activate(i) { impl = i; queue.forEach(function (f) { f(i); }); queue = []; }

    var key = RL.maps.yandexApiKey;
    loadYandex(key).then(function (ym) {
      if (!opts.cluster) return ym;
      return ym.import("@yandex/ymaps3-clusterer@0.0.1").then(function (pkg) {
        ym.__rlClusterer = pkg;
        return ym;
      }, function (e) {
        console.warn("[RL_MAP] Кластеризация не загрузилась (" + e.message + ") — метки будут показаны по одной.");
        return ym;
      });
    }).then(function (ym) {
      activate(buildYandex(ym, containerId, opts));
    }).catch(function (e) {
      console.warn("[RL_MAP] Яндекс Карты недоступны: " + e.message + ". Карта отрисована через OpenStreetMap.");
      activate(createOsm(containerId, opts));
    });

    return {
      provider: "yandex",
      setMarkers: function (l) { run(function (i) { i.setMarkers(l); }); },
      openPopup: function (id) { run(function (i) { i.openPopup(id); }); },
      setView: function (c, z) { run(function (i) { i.setView(c, z); }); },
      fitBounds: function (p, pad) { run(function (i) { i.fitBounds(p, pad); }); },
      invalidateSize: function (d) { run(function (i) { i.invalidateSize(d); }); },
      get raw() { return impl ? impl.raw : null; }
    };
  }

  var ADAPTERS = { osm: createOsm, yandex: createYandex };

  global.RL_MAP = {
    create: function (containerId, opts) {
      opts = opts || {};
      return ADAPTERS[providerName()](containerId, opts);
    },
    provider: providerName
  };
})(window);
