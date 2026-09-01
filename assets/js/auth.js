/*
 * forus.by — регистрация и вход клиента (п. 9.1–9.2 ТЗ).
 *
 * Регистрация по номеру телефона с подтверждением кодом; пароль не используется —
 * вход выполняется тем же способом, что и регистрация. В прототипе SMS не отправляется:
 * код подставляется на экран, аккаунт хранится только в localStorage этого браузера.
 *
 * Закрытие сайта «только для зарегистрированных» включается одним флагом
 * RL.auth.required в data.js. По умолчанию выключено: каталог, цены и форматы должны
 * оставаться открытыми, иначе поисковые системы не проиндексируют их и органический
 * трафик, ради которого переименован формат, не появится. Под замок имеет смысл
 * убирать не витрину, а действия — медиаплан, заявку и личный кабинет.
 */
(function (global) {
  "use strict";

  var KEY = "forus_user_v1";

  function current() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save(profile) {
    profile.registeredAt = profile.registeredAt || Date.now();
    localStorage.setItem(KEY, JSON.stringify(profile));
    return profile;
  }

  function logout() {
    localStorage.removeItem(KEY);
  }

  // Демонстрационный код подтверждения: детерминирован по номеру, чтобы его можно
  // было показать на экране вместо реальной SMS.
  function demoCode(phone) {
    var digits = String(phone).replace(/\D/g, "");
    var h = 0;
    for (var i = 0; i < digits.length; i++) h = (h * 31 + digits.charCodeAt(i)) % 10000;
    return String(1000 + (h % 9000));
  }

  function normalizePhone(v) {
    var d = String(v).replace(/\D/g, "");
    if (d.indexOf("375") === 0) return "+" + d;
    if (d.length === 9) return "+375" + d;
    return "+" + d;
  }

  function isValidPhone(v) {
    return /^\+375\d{9}$/.test(normalizePhone(v));
  }

  // Страницы, закрытые при RL.auth.required === true
  function isProtected(page) {
    var cfg = (RL.auth && RL.auth.protectedPages) || [];
    return cfg.indexOf(page) !== -1;
  }

  // Вызывается страницей: если доступ закрыт и клиент не вошёл — уводим на регистрацию
  function guard(page) {
    if (!RL.auth || !RL.auth.required) return true;
    if (!isProtected(page)) return true;
    if (current()) return true;
    var next = encodeURIComponent(page + global.location.search);
    global.location.replace("register.html?next=" + next);
    return false;
  }

  global.RL_AUTH = {
    current: current, save: save, logout: logout, guard: guard,
    demoCode: demoCode, normalizePhone: normalizePhone, isValidPhone: isValidPhone,
    isProtected: isProtected
  };
})(window);
