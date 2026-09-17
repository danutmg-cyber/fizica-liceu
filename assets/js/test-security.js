/* =========================================================
   SECURITATE COMUNĂ PENTRU TESTELE DE FIZICĂ
   assets/js/test-security.js

   Se ocupă exclusiv de:
   - detectarea părăsirii ecranului testului;
   - detectarea revenirii;
   - durata petrecută în afara testului;
   - itemul la care elevul a părăsit testul;
   - blocarea copierii;
   - blocarea decupării;
   - blocarea lipirii;
   - blocarea clickului dreapta;
   - pregătirea datelor pentru raport.

   NU se ocupă de:
   - întrebări;
   - notare;
   - Google Sheets;
   - PDF.

   API public:
   PhysicsTestSecurity.configure(...)
   PhysicsTestSecurity.start()
   PhysicsTestSecurity.stop()
   PhysicsTestSecurity.reset()
   PhysicsTestSecurity.getReportData()
   PhysicsTestSecurity.getEvents()
   PhysicsTestSecurity.getReturnEvents()
   PhysicsTestSecurity.getItemsSummary()
   PhysicsTestSecurity.formatDuration(...)
   ========================================================= */

(function () {
  "use strict";


  /* =========================================================
     CONFIGURARE IMPLICITĂ
     ========================================================= */

  const DEFAULT_CONFIG = {

    enabled: true,

    monitorVisibility: true,

    blockContextMenu: true,
    blockCopy: true,
    blockCut: true,
    blockPaste: true,

    locale: "ro-RO",

    warningMessage:
      "Atenție! Ai părăsit ecranul testului. " +
      "Profesorul va vedea acest eveniment în raportul testului.",

    contextMenuMessage:
      "Click dreapta nu este permis în timpul testului.",

    copyMessage:
      "Copierea nu este permisă în timpul testului.",

    cutMessage:
      "Decuparea textului nu este permisă în timpul testului.",

    pasteMessage:
      "Lipirea textului nu este permisă în timpul testului.",


    /*
      Aceste funcții vor fi furnizate
      de test-core.js.
    */

    isActive: function () {
      return false;
    },

    getCurrentItem: function () {
      return null;
    },

    getCurrentQuestion: function () {
      return "";
    }
  };


  let config = {
    ...DEFAULT_CONFIG
  };


  /* =========================================================
     STAREA INTERNĂ
     ========================================================= */

  let active = false;

  let alertOpen = false;

  let log = createEmptyLog();


  function createEmptyLog() {
    return {
      exitCount: 0,

      awayStart: null,

      awayItem: null,

      awayQuestion: "",

      totalAwaySeconds: 0,

      events: []
    };
  }


  /* =========================================================
     UTILITARE
     ========================================================= */

  function stripHtml(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }


  function currentDateTime() {
    return new Date()
      .toLocaleString(
        config.locale || "ro-RO"
      );
  }


  function formatDateTime(timestamp) {
    return new Date(timestamp)
      .toLocaleString(
        config.locale || "ro-RO"
      );
  }


  function formatDuration(seconds) {
    const total =
      Math.max(
        0,
        Math.round(
          Number(seconds) || 0
        )
      );


    const minutes =
      Math.floor(total / 60);

    const remainingSeconds =
      total % 60;


    if (minutes === 0) {
      return `${remainingSeconds} secunde`;
    }


    if (remainingSeconds === 0) {
      return (
        `${minutes} minut` +
        `${minutes === 1 ? "" : "e"}`
      );
    }


    return (
      `${minutes} minut` +
      `${minutes === 1 ? "" : "e"} ` +
      `și ${remainingSeconds} secunde`
    );
  }


  /* =========================================================
     TEST ACTIV?
     ========================================================= */

  function isSecurityActive() {

    if (!config.enabled) {
      return false;
    }


    if (!active) {
      return false;
    }


    if (
      typeof config.isActive ===
      "function"
    ) {

      try {
        return Boolean(
          config.isActive()
        );

      } catch (error) {

        console.error(
          "Eroare isActive() în test-security.js:",
          error
        );

        return false;
      }
    }


    return true;
  }


  /* =========================================================
     ITEMUL CURENT
     ========================================================= */

  function getCurrentItem() {

    if (
      typeof config.getCurrentItem !==
      "function"
    ) {
      return null;
    }


    try {

      return config
        .getCurrentItem();

    } catch (error) {

      console.error(
        "Eroare getCurrentItem():",
        error
      );

      return null;
    }
  }


  /* =========================================================
     ÎNTREBAREA CURENTĂ
     ========================================================= */

  function getCurrentQuestion() {

    if (
      typeof config.getCurrentQuestion !==
      "function"
    ) {
      return "";
    }


    try {

      return stripHtml(
        config.getCurrentQuestion()
      );

    } catch (error) {

      console.error(
        "Eroare getCurrentQuestion():",
        error
      );

      return "";
    }
  }


  /* =========================================================
     RESETARE RAPORT
     ========================================================= */

  function reset() {

    log = createEmptyLog();

    alertOpen = false;
  }


  /* =========================================================
     PORNIRE MONITORIZARE
     ========================================================= */

  function start(options = {}) {

    if (options.reset !== false) {
      reset();
    }


    active = true;
  }


  /* =========================================================
     OPRIRE MONITORIZARE
     ========================================================= */

  function stop() {

    /*
      Dacă testul se termină în timp ce există
      o ieșire neînchisă, o finalizăm înainte
      de oprirea monitorizării.
    */

    if (log.awayStart) {
      closeAwayEvent(false);
    }


    active = false;
  }


  /* =========================================================
     CONFIGURARE
     ========================================================= */

  function configure(options = {}) {

    if (
      !options ||
      typeof options !== "object"
    ) {
      return;
    }


    config = {
      ...config,
      ...options
    };
  }


  /* =========================================================
     ÎNREGISTRARE IEȘIRE DIN TEST
     ========================================================= */

  function handleScreenExit() {

    if (
      !isSecurityActive() ||
      alertOpen ||
      log.awayStart
    ) {
      return;
    }


    const now =
      Date.now();


    log.awayStart =
      now;


    log.awayItem =
      getCurrentItem();


    log.awayQuestion =
      getCurrentQuestion();


    log.exitCount++;


    log.events.push({

      tip:
        "iesire_din_ecran",

      item:
        log.awayItem,

      intrebare:
        log.awayQuestion,

      ora:
        formatDateTime(now),

      timestamp:
        new Date(now)
          .toISOString()

    });
  }


  /* =========================================================
     FINALIZARE EVENIMENT DE IEȘIRE
     ========================================================= */

  function closeAwayEvent(
    showWarning = true
  ) {

    if (!log.awayStart) {
      return;
    }


    const returnTime =
      Date.now();


    const durationSeconds =
      Math.max(
        1,
        Math.round(
          (
            returnTime -
            log.awayStart
          ) / 1000
        )
      );


    log.totalAwaySeconds +=
      durationSeconds;


    log.events.push({

      tip:
        "revenire_in_test",

      item:
        log.awayItem,

      intrebare:
        log.awayQuestion,

      durataSecunde:
        durationSeconds,

      oraPlecare:
        formatDateTime(
          log.awayStart
        ),

      oraRevenire:
        formatDateTime(
          returnTime
        ),

      timestamp:
        new Date(returnTime)
          .toISOString()

    });


    log.awayStart =
      null;

    log.awayItem =
      null;

    log.awayQuestion =
      "";


    if (
      showWarning &&
      isSecurityActive()
    ) {

      alertOpen = true;


      alert(
        config.warningMessage
      );


      /*
        Împiedică alerta însăși să fie
        interpretată imediat ca o nouă
        schimbare de ecran.
      */

      setTimeout(
        function () {

          alertOpen = false;

        },
        500
      );
    }
  }


  /* =========================================================
     REVENIRE ÎN TEST
     ========================================================= */

  function handleScreenReturn() {

    if (!log.awayStart) {
      return;
    }


    closeAwayEvent(true);
  }


  /* =========================================================
     EVENIMENT visibilitychange
     ========================================================= */

  function onVisibilityChange() {

    if (
      !config.monitorVisibility
    ) {
      return;
    }


    if (document.hidden) {

      handleScreenExit();

    } else {

      handleScreenReturn();
    }
  }


  /* =========================================================
     CLICK DREAPTA
     ========================================================= */

  function onContextMenu(event) {

    if (
      !config.blockContextMenu ||
      !isSecurityActive()
    ) {
      return;
    }


    event.preventDefault();


    alert(
      config.contextMenuMessage
    );
  }


  /* =========================================================
     COPIERE
     ========================================================= */

  function onCopy(event) {

    if (
      !config.blockCopy ||
      !isSecurityActive()
    ) {
      return;
    }


    event.preventDefault();


    alert(
      config.copyMessage
    );
  }


  /* =========================================================
     DECUPARE
     ========================================================= */

  function onCut(event) {

    if (
      !config.blockCut ||
      !isSecurityActive()
    ) {
      return;
    }


    event.preventDefault();


    alert(
      config.cutMessage
    );
  }


  /* =========================================================
     LIPIRE
     ========================================================= */

  function onPaste(event) {

    if (
      !config.blockPaste ||
      !isSecurityActive()
    ) {
      return;
    }


    event.preventDefault();


    alert(
      config.pasteMessage
    );
  }


  /* =========================================================
     EVENIMENTE IEȘIRE
     ========================================================= */

  function getExitEvents() {

    return log.events
      .filter(
        event =>
          event.tip ===
          "iesire_din_ecran"
      )
      .map(
        event => ({
          ...event
        })
      );
  }


  /* =========================================================
     EVENIMENTE REVENIRE
     ========================================================= */

  function getReturnEvents() {

    return log.events
      .filter(
        event =>
          event.tip ===
          "revenire_in_test"
      )
      .map(
        event => ({
          ...event
        })
      );
  }


  /* =========================================================
     TOATE EVENIMENTELE
     ========================================================= */

  function getEvents() {

    return log.events
      .map(
        event => ({
          ...event
        })
      );
  }


  /* =========================================================
     REZUMAT ITEMI AFECTAȚI
     ========================================================= */

  function getItemsSummary() {

    const items =
      getExitEvents()
        .map(
          event =>
            event.item
        )
        .filter(
          item =>
            item !== undefined &&
            item !== null &&
            item !== ""
        );


    const uniqueItems =
      [...new Set(items)];


    if (!uniqueItems.length) {

      return (
        "Nu s-au înregistrat " +
        "părăsiri ale ecranului."
      );
    }


    return uniqueItems
      .map(
        item =>
          `Item ${item}`
      )
      .join(", ");
  }


  /* =========================================================
     DATE PENTRU PAYLOAD / GOOGLE SHEETS / PDF
     ========================================================= */

  function getReportData() {

    /*
      Dacă elevul este încă în afara paginii,
      calculăm durata și până la momentul
      solicitării raportului, fără să alterăm
      jurnalul.
    */

    let totalAwaySeconds =
      log.totalAwaySeconds;


    if (log.awayStart) {

      totalAwaySeconds +=
        Math.max(
          1,
          Math.round(
            (
              Date.now() -
              log.awayStart
            ) / 1000
          )
        );
    }


    return {

      integrityExitCount:
        log.exitCount,

      integrityTotalAwaySeconds:
        totalAwaySeconds,

      integrityTotalAwayFormatted:
        formatDuration(
          totalAwaySeconds
        ),

      integrityItemsSummary:
        getItemsSummary(),

      integrityEvents:
        getEvents()

    };
  }


  /* =========================================================
     STARE PENTRU DEBUG
     ========================================================= */

  function getState() {

    return {

      active,

      alertOpen,

      exitCount:
        log.exitCount,

      awayStart:
        log.awayStart,

      awayItem:
        log.awayItem,

      awayQuestion:
        log.awayQuestion,

      totalAwaySeconds:
        log.totalAwaySeconds,

      events:
        getEvents()

    };
  }


  /* =========================================================
     INSTALAREA EVENIMENTELOR
     ========================================================= */

  document.addEventListener(
    "visibilitychange",
    onVisibilityChange
  );


  document.addEventListener(
    "contextmenu",
    onContextMenu
  );


  document.addEventListener(
    "copy",
    onCopy
  );


  document.addEventListener(
    "cut",
    onCut
  );


  document.addEventListener(
    "paste",
    onPaste
  );


  /* =========================================================
     API PUBLIC
     ========================================================= */

  window.PhysicsTestSecurity = {

    configure,

    start,

    stop,

    reset,

    handleScreenExit,

    handleScreenReturn,

    getEvents,

    getExitEvents,

    getReturnEvents,

    getItemsSummary,

    getReportData,

    formatDuration,

    getState

  };

})();
