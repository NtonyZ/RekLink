/* forus.by — регистрация и вход по номеру телефона (п. 9.1–9.2 ТЗ). */
(function () {
  "use strict";
  RL_LAYOUT.render("");

  var nextPage = RL_UTIL.qs("next");
  var phone = "";

  function show(stage) {
    ["1", "2", "3"].forEach(function (n) {
      document.getElementById("stage-" + n).classList.toggle("active", n === stage);
      var bar = document.getElementById("bar-" + n);
      bar.className = n < stage ? "done" : (n === stage ? "active" : "");
    });
  }
  function err(id, msg) {
    var el = document.getElementById(id);
    if (!msg) { el.style.display = "none"; return; }
    el.textContent = msg;
    el.style.display = "block";
  }

  // Уже вошедшему клиенту показываем учётную запись, а не форму
  var user = RL_AUTH.current();
  if (user) {
    document.getElementById("stage-form").style.display = "none";
    document.getElementById("stage-account").classList.add("active");
    var TYPE_LABEL = { legal: "Юридическое лицо", ip: "Индивидуальный предприниматель", person: "Физическое лицо" };
    var rows = [
      ["Телефон", user.phone],
      ["Контактное лицо", user.name],
      ["Электронная почта", user.email],
      ["Тип плательщика", TYPE_LABEL[user.type] || user.type]
    ];
    if (user.company) rows.push(["Наименование", user.company]);
    if (user.unp) rows.push(["УНП", user.unp]);
    if (user.address) rows.push(["Адрес доставки документов", user.address]);
    document.getElementById("acct-info").innerHTML = rows.map(function (r) {
      return "<dt>" + r[0] + "</dt><dd>" + RL_UTIL.escapeHtml(r[1] || "—") + "</dd>";
    }).join("");
    document.getElementById("btn-logout").addEventListener("click", function () {
      RL_AUTH.logout();
      window.location.reload();
    });
    return;
  }

  // ---- Шаг 1: телефон ----
  document.getElementById("btn-send-code").addEventListener("click", function () {
    var raw = document.getElementById("r-phone").value.trim();
    if (!RL_AUTH.isValidPhone(raw)) {
      err("err-phone", "Введите белорусский номер: +375 и девять цифр.");
      return;
    }
    err("err-phone", "");
    phone = RL_AUTH.normalizePhone(raw);
    document.getElementById("code-phone").textContent = phone;
    document.getElementById("code-value").textContent = RL_AUTH.demoCode(phone);
    show("2");
    document.getElementById("r-code").focus();
  });

  document.getElementById("btn-back-1").addEventListener("click", function () { show("1"); });

  // ---- Шаг 2: код подтверждения ----
  document.getElementById("btn-check-code").addEventListener("click", function () {
    var entered = document.getElementById("r-code").value.trim();
    if (entered !== RL_AUTH.demoCode(phone)) {
      err("err-code", "Код не совпадает. В прототипе он показан выше.");
      return;
    }
    err("err-code", "");
    show("3");
    document.getElementById("r-name").focus();
  });

  // ---- Шаг 3: профиль ----
  var typeSel = document.getElementById("r-type");
  function syncType() {
    var isPerson = typeSel.value === "person";
    document.getElementById("row-unp").style.display = isPerson ? "none" : "flex";
    // Физлицу документы курьером не возим — адрес доставки не спрашиваем
    document.getElementById("row-address").style.display = isPerson ? "none" : "block";
  }
  typeSel.addEventListener("change", syncType);
  syncType();

  // Подстановка наименования по УНП (в проде — запрос в реестр, п. 8.5 ТЗ)
  document.getElementById("r-unp").addEventListener("blur", function () {
    var v = this.value.trim();
    var nameEl = document.getElementById("r-company");
    if (/^\d{9}$/.test(v) && !nameEl.value.trim()) {
      nameEl.value = (typeSel.value === "ip" ? "ИП Клиент " : "ООО «Клиент ") + v.slice(-4) + (typeSel.value === "ip" ? "" : "»");
    }
  });

  document.getElementById("btn-register").addEventListener("click", function () {
    var type = typeSel.value;
    var name = document.getElementById("r-name").value.trim();
    var email = document.getElementById("r-email").value.trim();
    var unp = document.getElementById("r-unp").value.trim();
    var company = document.getElementById("r-company").value.trim();
    var address = document.getElementById("r-address").value.trim();

    if (!name) { err("err-profile", "Укажите контактное лицо."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err("err-profile", "Проверьте адрес электронной почты."); return; }
    if (type !== "person" && !/^\d{9}$/.test(unp)) { err("err-profile", "УНП состоит из девяти цифр."); return; }
    if (!document.getElementById("r-consent-pd").checked) { err("err-profile", "Без согласия на обработку персональных данных регистрация невозможна."); return; }
    if (!document.getElementById("r-consent-offer").checked) { err("err-profile", "Нужно принять условия публичной оферты."); return; }
    err("err-profile", "");

    RL_AUTH.save({
      phone: phone, type: type, name: name, email: email,
      unp: type === "person" ? "" : unp,
      company: type === "person" ? "" : company,
      address: type === "person" ? "" : address,
      marketingConsent: document.getElementById("r-consent-mk").checked
    });

    window.location.href = nextPage ? decodeURIComponent(nextPage) : "cabinet.html";
  });
})();
