/* =========================================================
   GOOGLE SHEETS – MODUL COMUN PENTRU TESTELE DE FIZICĂ
   assets/js/sheets.js

   Necesită Code.gs nou, cu endpoint-urile:

   GET:
   ?action=check&nume=...&clasa=...&test=...
   ?action=status&variantId=...

   POST:
   payload=<JSON>

   Principii:
   - UN SINGUR POST automat la finalizarea testului;
   - confirmare reală prin variantId;
   - fără cele 3 retrimiteri automate;
   - buton "Trimite din nou";
   - retrimiterea manuală face UN SINGUR POST;
   - duplicatele sunt eliminate de Code.gs prin variantId.

   Funcții publice:
   - checkPriorAttempt(name, cls, testId)
   - setStartCheckMessage(text, isError)
   - sendToGoogleSheet(payload)
   - resendLastResult()
   - checkSubmissionStatus(variantId)
   - setResultButtonsEnabled(enabled)
   ========================================================= */

(function () {
  "use strict";


  /* =========================================================
     CONFIGURARE IMPLICITĂ
     ========================================================= */

  const DEFAULT_CONFIG = {

    /* verificarea dacă elevul a mai dat testul */
    checkTimeoutMs: 8000,

    /* verificarea rezultatului după POST */
    statusRequestTimeoutMs: 7000,

    /*
      Nu verificăm instantaneu.
      Dăm timp Apps Script să scrie în Sheet.

      Se adaugă și un mic interval aleatoriu pentru ca
      30 de elevi să nu întrebe serverul exact simultan.
    */
    statusInitialDelayMs: 1800,
    statusInitialJitterMs: 1200,

    /*
      Dacă prima verificare nu găsește rezultatul,
      mai verificăm de câteva ori.

      Acestea sunt GET-uri, NU noi trimiteri POST.
    */
    statusPollIntervalMs: 2500,
    statusMaxChecks: 5,

    /* iframe-ul folosit pentru POST */
    hiddenFrameLifetimeMs: 30000
  };


  /* =========================================================
     STARE INTERNĂ
     ========================================================= */

  let lastPayload = null;

  let sending = false;

  let verificationGeneration = 0;


  /* =========================================================
     UTILITARE
     ========================================================= */

  function byId(id) {
    return document.getElementById(id);
  }


  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }


  /* =========================================================
     CONFIGURARE
     ========================================================= */

  function getConfig() {

    const custom =
      window.PHYSICS_SHEETS_CONFIG || {};


    /* ---------------------------------------------------------
       URL GOOGLE APPS SCRIPT
       --------------------------------------------------------- */

    let url =
      String(
        custom.url || ""
      ).trim();


    /*
      Compatibilitate cu testul actual:

      const GOOGLE_SCRIPT_URL = "...";
    */

    if (!url) {

      try {

        if (
          typeof GOOGLE_SCRIPT_URL !== "undefined" &&
          GOOGLE_SCRIPT_URL
        ) {

          url =
            String(
              GOOGLE_SCRIPT_URL
            ).trim();
        }

      } catch (error) {

        url = "";
      }
    }


    /* ---------------------------------------------------------
       TEST ID
       --------------------------------------------------------- */

    let testId =
      String(
        custom.testId || ""
      ).trim();


    /*
      Dacă test-core.js este configurat,
      preluăm automat testId de acolo.
    */

    if (
      !testId &&
      window.PHYSICS_TEST_CONFIG &&
      window.PHYSICS_TEST_CONFIG.testId
    ) {

      testId =
        String(
          window.PHYSICS_TEST_CONFIG.testId
        ).trim();
    }


    /* ---------------------------------------------------------
       TIMPI
       --------------------------------------------------------- */

    function positiveNumber(
      value,
      fallback
    ) {

      const number =
        Number(value);


      return (
        Number.isFinite(number) &&
        number > 0
      )
        ? number
        : fallback;
    }


    function nonNegativeNumber(
      value,
      fallback
    ) {

      const number =
        Number(value);


      return (
        Number.isFinite(number) &&
        number >= 0
      )
        ? number
        : fallback;
    }


    return {

      url,

      testId,

      checkTimeoutMs:
        positiveNumber(
          custom.checkTimeoutMs,
          DEFAULT_CONFIG.checkTimeoutMs
        ),

      statusRequestTimeoutMs:
        positiveNumber(
          custom.statusRequestTimeoutMs,
          DEFAULT_CONFIG.statusRequestTimeoutMs
        ),

      statusInitialDelayMs:
        nonNegativeNumber(
          custom.statusInitialDelayMs,
          DEFAULT_CONFIG.statusInitialDelayMs
        ),

      statusInitialJitterMs:
        nonNegativeNumber(
          custom.statusInitialJitterMs,
          DEFAULT_CONFIG.statusInitialJitterMs
        ),

      statusPollIntervalMs:
        positiveNumber(
          custom.statusPollIntervalMs,
          DEFAULT_CONFIG.statusPollIntervalMs
        ),

      statusMaxChecks:
        Math.max(
          1,
          Math.round(
            positiveNumber(
              custom.statusMaxChecks,
              DEFAULT_CONFIG.statusMaxChecks
            )
          )
        ),

      hiddenFrameLifetimeMs:
        positiveNumber(
          custom.hiddenFrameLifetimeMs,
          DEFAULT_CONFIG.hiddenFrameLifetimeMs
        )
    };
  }


  /* =========================================================
     VERIFICARE URL
     ========================================================= */

  function hasValidGoogleScriptUrl(url) {

    if (!url) {
      return false;
    }


    if (
      url.includes("PASTE_GOOGLE") ||
      url.includes("YOUR_GOOGLE_SCRIPT")
    ) {

      return false;
    }


    return /^https:\/\/script\.google\.com\/macros\/s\//i
      .test(url);
  }


  /* =========================================================
     BUTON "TRIMITE DIN NOU"

     Dacă nu există deja în HTML, îl creăm automat.
     ========================================================= */

  function ensureResendButton() {

    let button =
      byId("resendBtn");


    if (!button) {

      button =
        document.createElement(
          "button"
        );


      button.id =
        "resendBtn";

      button.type =
        "button";

      button.className =
        "secondary";

      button.innerText =
        "Trimite din nou";

      button.disabled =
        true;


      /*
        Îl introducem înainte de butonul
        "Test nou".
      */

      const newTestButton =
        byId("newTestBtn");


      if (
        newTestButton &&
        newTestButton.parentNode
      ) {

        newTestButton.parentNode
          .insertBefore(
            button,
            newTestButton
          );

      } else {

        const resultArea =
          byId("resultArea");


        if (resultArea) {
          resultArea.appendChild(
            button
          );
        }
      }
    }


    /*
      Evităm instalarea repetată
      a aceluiași listener.
    */

    if (
      !button.dataset
        .resendListenerInstalled
    ) {

      button.addEventListener(
        "click",
        function () {
          resendLastResult();
        }
      );


      button.dataset
        .resendListenerInstalled =
        "true";
    }


    button.title =
      "Folosește acest buton dacă profesorul îți cere să retrimiți rezultatul.";


    return button;
  }


  /* =========================================================
     STARE BUTOANE
     ========================================================= */

  function setButtonsState(options) {

    const settings = {
      download: false,
      resend: false,
      newTest: false,
      ...options
    };


    const downloadButton =
      byId("downloadPdfBtn");

    const resendButton =
      ensureResendButton();

    const newTestButton =
      byId("newTestBtn");


    if (downloadButton) {
      downloadButton.disabled =
        !settings.download;
    }


    if (resendButton) {
      resendButton.disabled =
        !settings.resend;
    }


    if (newTestButton) {
      newTestButton.disabled =
        !settings.newTest;
    }
  }


  /*
    Funcție păstrată pentru compatibilitate
    cu test-core.js.
  */

  function setResultButtonsEnabled(
    enabled
  ) {

    setButtonsState({

      download:
        Boolean(enabled),

      resend:
        Boolean(enabled),

      newTest:
        Boolean(enabled)

    });
  }


  /* =========================================================
     PANOU SALVARE
     ========================================================= */

  function updateSavePanel(
    state,
    title,
    message
  ) {

    const panel =
      byId("savePanel");

    const saveTitle =
      byId("saveTitle");

    const saveMessage =
      byId("saveMessage");


    if (!panel) {
      return;
    }


    panel.classList.remove(
      "hidden",
      "error",
      "done"
    );


    if (state === "error") {
      panel.classList.add(
        "error"
      );
    }


    if (state === "done") {
      panel.classList.add(
        "done"
      );
    }


    if (saveTitle) {
      saveTitle.innerText =
        title || "";
    }


    if (saveMessage) {
      saveMessage.innerText =
        message || "";
    }
  }


  /* =========================================================
     STATUS TEXT
     ========================================================= */

  function setSheetStatus(text) {

    const status =
      byId("sheetStatus");


    if (status) {
      status.innerText =
        text || "";
    }
  }


  /* =========================================================
     MESAJ LA PORNIRE
     ========================================================= */

  function setStartCheckMessage(
    text,
    isError
  ) {

    const element =
      byId("startCheckMessage");


    if (!element) {
      return;
    }


    if (!text) {

      element.classList.add(
        "hidden"
      );

      element.innerText =
        "";

      return;
    }


    element.classList.remove(
      "hidden"
    );


    element.style.color =
      isError
        ? "var(--red, #c0392b)"
        : "var(--muted, #667085)";


    element.innerText =
      text;
  }


  /* =========================================================
     FETCH JSON CU TIMEOUT
     ========================================================= */

  async function fetchJsonWithTimeout(
    url,
    timeoutMs
  ) {

    const controller =
      typeof AbortController !==
      "undefined"
        ? new AbortController()
        : null;


    let timeoutId =
      null;


    if (controller) {

      timeoutId =
        setTimeout(
          function () {
            controller.abort();
          },
          timeoutMs
        );
    }


    try {

      const options = {
        method: "GET",
        cache: "no-store"
      };


      if (controller) {
        options.signal =
          controller.signal;
      }


      const response =
        await fetch(
          url,
          options
        );


      if (!response.ok) {

        throw new Error(
          "HTTP " +
          response.status
        );
      }


      return await response.json();


    } finally {

      if (timeoutId) {
        clearTimeout(
          timeoutId
        );
      }
    }
  }


  /* =========================================================
     VERIFICARE ÎNCERCARE ANTERIOARĂ
     ========================================================= */

  async function checkPriorAttempt(
    name,
    cls,
    testId = ""
  ) {

    const config =
      getConfig();


    if (
      !hasValidGoogleScriptUrl(
        config.url
      )
    ) {

      return {
        found: false,
        checked: false
      };
    }


    const studentName =
      String(name || "")
        .trim();

    const studentClass =
      String(cls || "")
        .trim();


    const effectiveTestId =
      String(
        testId ||
        config.testId ||
        ""
      ).trim();


    const params =
      new URLSearchParams();


    params.set(
      "action",
      "check"
    );

    params.set(
      "nume",
      studentName
    );

    params.set(
      "clasa",
      studentClass
    );


    /*
      Pentru testul actual, dacă nu este
      configurat testId, nu trimitem nimic.

      Astfel păstrăm compatibilitatea cu
      rezultatele mai vechi.
    */

    if (effectiveTestId) {

      params.set(
        "test",
        effectiveTestId
      );
    }


    /*
      Evită răspunsurile din cache.
    */

    params.set(
      "_",
      Date.now().toString()
    );


    const url =
      config.url +
      "?" +
      params.toString();


    try {

      const data =
        await fetchJsonWithTimeout(
          url,
          config.checkTimeoutMs
        );


      return {

        found:
          Boolean(
            data &&
            data.found
          ),

        timestamp:
          data
            ? data.timestamp
            : undefined,

        nota:
          data
            ? data.nota
            : undefined,

        variantId:
          data
            ? data.variantId
            : undefined,

        checked:
          true

      };


    } catch (error) {

      console.error(
        "Nu s-a putut verifica încercarea anterioară:",
        error
      );


      return {
        found: false,
        checked: false
      };
    }
  }


  /* =========================================================
     TRIMITERE POST

     Formular + iframe ascuns.

     Motiv:
     - foarte compatibil cu Google Apps Script;
     - evită problemele CORS la POST;
     - confirmarea NU este dedusă din iframe;
       confirmarea se face separat prin GET status.
     ========================================================= */

  function sendPayloadAttempt(
    payload,
    label = "auto"
  ) {

    const config =
      getConfig();


    if (
      !hasValidGoogleScriptUrl(
        config.url
      )
    ) {

      return false;
    }


    try {

      const uniqueId =
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 9);


      const frameName =
        "physicsSheetFrame_" +
        label +
        "_" +
        uniqueId;


      /* IFRAME */

      const iframe =
        document.createElement(
          "iframe"
        );


      iframe.name =
        frameName;

      iframe.id =
        frameName;

      iframe.style.display =
        "none";

      iframe.setAttribute(
        "aria-hidden",
        "true"
      );


      document.body.appendChild(
        iframe
      );


      /* FORMULAR */

      const form =
        document.createElement(
          "form"
        );


      form.method =
        "POST";

      form.action =
        config.url;

      form.target =
        frameName;

      form.style.display =
        "none";

      form.acceptCharset =
        "UTF-8";


      /* PAYLOAD */

      const input =
        document.createElement(
          "input"
        );


      input.type =
        "hidden";

      input.name =
        "payload";

      input.value =
        JSON.stringify(
          payload
        );


      form.appendChild(
        input
      );


      document.body.appendChild(
        form
      );


      /*
        AICI ARE LOC SINGURUL POST.
      */

      form.submit();


      /*
        Formularul poate fi eliminat imediat
        după inițierea cererii.

        Iframe-ul rămâne o perioadă pentru ca
        request-ul să poată fi finalizat.
      */

      setTimeout(
        function () {

          if (form.isConnected) {
            form.remove();
          }

        },
        1000
      );


      setTimeout(
        function () {

          if (iframe.isConnected) {
            iframe.remove();
          }

        },
        config.hiddenFrameLifetimeMs
      );


      return true;


    } catch (error) {

      console.error(
        "Eroare la pornirea trimiterii rezultatului:",
        error
      );


      return false;
    }
  }


  /* =========================================================
     VERIFICARE STATUS DUPĂ variantId

     Code.gs:
     ?action=status&variantId=...
     ========================================================= */

  async function checkSubmissionStatus(
    variantId
  ) {

    const config =
      getConfig();


    const id =
      String(
        variantId || ""
      ).trim();


    if (
      !id ||
      !hasValidGoogleScriptUrl(
        config.url
      )
    ) {

      return {
        found: false,
        checked: false
      };
    }


    const params =
      new URLSearchParams();


    params.set(
      "action",
      "status"
    );

    params.set(
      "variantId",
      id
    );

    params.set(
      "_",
      Date.now().toString()
    );


    const url =
      config.url +
      "?" +
      params.toString();


    try {

      const data =
        await fetchJsonWithTimeout(
          url,
          config.statusRequestTimeoutMs
        );


      return {

        found:
          Boolean(
            data &&
            data.found
          ),

        checked:
          true,

        data:
          data || null

      };


    } catch (error) {

      console.error(
        "Nu s-a putut verifica salvarea rezultatului:",
        error
      );


      return {
        found: false,
        checked: false,
        error
      };
    }
  }


  /* =========================================================
     AȘTEAPTĂ CONFIRMAREA GOOGLE SHEET

     IMPORTANT:
     aici NU retrimitem rezultatul.

     Facem doar verificări GET.
     ========================================================= */

  async function waitForConfirmation(
    payload,
    generation
  ) {

    const config =
      getConfig();


    if (
      !payload ||
      !payload.variantId
    ) {

      return {
        found: false,
        checked: false,
        reason:
          "missing-variant"
      };
    }


    /*
      Mic jitter pentru ca elevii să nu înceapă
      toți verificarea în aceeași milisecundă.
    */

    const jitter =
      Math.floor(
        Math.random() *
        (
          config.statusInitialJitterMs +
          1
        )
      );


    await sleep(
      config.statusInitialDelayMs +
      jitter
    );


    for (
      let attempt = 1;
      attempt <=
        config.statusMaxChecks;
      attempt++
    ) {

      /*
        Dacă între timp a început o nouă verificare,
        abandonăm ciclul vechi.
      */

      if (
        generation !==
        verificationGeneration
      ) {

        return {
          found: false,
          checked: false,
          cancelled: true
        };
      }


      setSheetStatus(
        "Se verifică în Google Sheet salvarea rezultatului" +
        (
          attempt > 1
            ? ` (${attempt}/${config.statusMaxChecks})`
            : ""
        ) +
        "..."
      );


      const status =
        await checkSubmissionStatus(
          payload.variantId
        );


      if (status.found) {

        return {
          found: true,
          checked: true,
          data:
            status.data
        };
      }


      if (
        attempt <
        config.statusMaxChecks
      ) {

        await sleep(
          config.statusPollIntervalMs
        );
      }
    }


    return {
      found: false,
      checked: true
    };
  }


  /* =========================================================
     REZULTAT CONFIRMAT
     ========================================================= */

  function showConfirmedState() {

    updateSavePanel(
      "done",
      "Rezultatul a fost confirmat în Google Sheet.",
      "Salvarea a fost verificată. Poți descărca raportul PDF."
    );


    setSheetStatus(
      "Rezultatul este confirmat în Google Sheet."
    );


    setButtonsState({
      download: true,
      resend: true,
      newTest: true
    });
  }


  /* =========================================================
     REZULTAT NECONFIRMAT
     ========================================================= */

  function showUnconfirmedState() {

    updateSavePanel(
      "error",
      "Rezultatul nu a putut fi confirmat.",
      "Păstrează această pagină deschisă. Dacă profesorul nu vede rezultatul în Google Sheet, apasă „Trimite din nou”."
    );


    setSheetStatus(
      "Rezultatul a fost trimis, dar nu avem încă o confirmare că a fost înregistrat în Google Sheet."
    );


    /*
      PDF-ul poate fi descărcat local.

      Butonul "Test nou" rămâne blocat pentru a evita
      pierderea paginii înainte ca situația să fie clarificată.
    */

    setButtonsState({
      download: true,
      resend: true,
      newTest: false
    });
  }


  /* =========================================================
     TRIMITERE AUTOMATĂ LA FINALUL TESTULUI

     UN SINGUR POST.
     ========================================================= */

  async function sendToGoogleSheet(
    payload
  ) {

    const config =
      getConfig();


    ensureResendButton();


    /* Validare payload */

    if (
      !payload ||
      typeof payload !==
      "object"
    ) {

      updateSavePanel(
        "error",
        "Rezultatul nu poate fi trimis.",
        "Datele testului nu sunt disponibile."
      );


      setSheetStatus(
        "Datele rezultatului nu sunt disponibile."
      );


      setButtonsState({
        download: true,
        resend: false,
        newTest: false
      });


      return false;
    }


    /*
      Facem o copie proprie pentru modulul Sheets.
    */

    lastPayload = {
      ...payload
    };


    /*
      Dacă test-core.js are testId, dar payload-ul vechi
      nu îl conține încă, îl adăugăm aici.
    */

    if (
      !lastPayload.testId &&
      config.testId
    ) {

      lastPayload.testId =
        config.testId;
    }


    /* variantId este obligatoriu */

    if (!lastPayload.variantId) {

      updateSavePanel(
        "error",
        "Rezultatul nu poate fi confirmat.",
        "Lipsește identificatorul unic al variantei."
      );


      setSheetStatus(
        "Lipsește variantId."
      );


      setButtonsState({
        download: true,
        resend: false,
        newTest: false
      });


      return false;
    }


    /* URL invalid */

    if (
      !hasValidGoogleScriptUrl(
        config.url
      )
    ) {

      updateSavePanel(
        "error",
        "Rezultatul nu a fost trimis profesorului.",
        "URL-ul Google Apps Script nu este configurat corect."
      );


      setSheetStatus(
        "Rezultatul a fost calculat local, dar Google Apps Script nu este configurat."
      );


      setButtonsState({
        download: true,
        resend: false,
        newTest: false
      });


      return false;
    }


    /* prevenim două trimiteri automate simultane */

    if (sending) {
      return false;
    }


    sending =
      true;


    verificationGeneration++;

    const myGeneration =
      verificationGeneration;


    setButtonsState({
      download: false,
      resend: false,
      newTest: false
    });


    updateSavePanel(
      "saving",
      "Se trimite rezultatul...",
      "Nu închide pagina. După trimitere vom verifica dacă rezultatul apare în Google Sheet."
    );


    setSheetStatus(
      "Se trimite rezultatul profesorului..."
    );


    /*
      =======================================================
      UNICUL POST AUTOMAT
      =======================================================
    */

    const started =
      sendPayloadAttempt(
        lastPayload,
        "auto"
      );


    if (!started) {

      sending =
        false;


      updateSavePanel(
        "error",
        "Trimiterea nu a putut fi pornită.",
        "Păstrează pagina deschisă și apasă „Trimite din nou”."
      );


      setSheetStatus(
        "Trimiterea nu a putut fi pornită."
      );


      setButtonsState({
        download: true,
        resend: true,
        newTest: false
      });


      return false;
    }


    updateSavePanel(
      "saving",
      "Rezultatul a fost trimis. Se verifică salvarea...",
      "Nu închide pagina până la confirmarea Google Sheet."
    );


    /*
      Așteptăm confirmarea prin GET.
      NU mai facem alte POST-uri automat.
    */

    const confirmation =
      await waitForConfirmation(
        lastPayload,
        myGeneration
      );


    sending =
      false;


    if (
      confirmation.cancelled
    ) {

      return false;
    }


    if (
      confirmation.found
    ) {

      showConfirmedState();

      return true;
    }


    showUnconfirmedState();

    return false;
  }


  /* =========================================================
     TRIMITERE MANUALĂ

     Buton:
     "Trimite din nou"

     Face UN SINGUR POST.
     ========================================================= */

  async function resendLastResult() {

    const config =
      getConfig();


    if (sending) {

      alert(
        "O trimitere este deja în curs. Așteaptă finalizarea verificării."
      );

      return;
    }


    if (!lastPayload) {

      /*
        Compatibilitate cu testele în care
        lastReportPayload este încă global.
      */

      try {

        if (
          typeof lastReportPayload !==
            "undefined" &&
          lastReportPayload
        ) {

          lastPayload = {
            ...lastReportPayload
          };
        }

      } catch (error) {
        /* nimic */
      }
    }


    if (!lastPayload) {

      alert(
        "Rezultatul testului nu mai este disponibil pentru retrimitere."
      );

      return;
    }


    if (!lastPayload.variantId) {

      alert(
        "Rezultatul nu are un identificator de variantă și nu poate fi retrimis în siguranță."
      );

      return;
    }


    if (
      !hasValidGoogleScriptUrl(
        config.url
      )
    ) {

      alert(
        "Google Apps Script nu este configurat corect."
      );

      return;
    }


    /*
      Mai întâi verificăm dacă rezultatul există deja.

      Dacă este deja în Sheet, nu mai facem POST inutil.
    */

    updateSavePanel(
      "saving",
      "Se verifică rezultatul...",
      "Verificăm mai întâi dacă rezultatul există deja în Google Sheet."
    );


    setButtonsState({
      download: false,
      resend: false,
      newTest: false
    });


    const existing =
      await checkSubmissionStatus(
        lastPayload.variantId
      );


    if (existing.found) {

      showConfirmedState();

      return;
    }


    /*
      Nu există confirmare.
      Facem o singură retrimitere.
    */

    sending =
      true;


    verificationGeneration++;

    const myGeneration =
      verificationGeneration;


    updateSavePanel(
      "saving",
      "Se retrimite rezultatul...",
      "Nu închide pagina. Se face o singură retrimitere."
    );


    setSheetStatus(
      "Se retrimite rezultatul profesorului..."
    );


    const started =
      sendPayloadAttempt(
        lastPayload,
        "manual"
      );


    if (!started) {

      sending =
        false;


      updateSavePanel(
        "error",
        "Retrimiterea nu a putut fi pornită.",
        "Verifică conexiunea la internet și încearcă din nou."
      );


      setSheetStatus(
        "Retrimiterea nu a putut fi pornită."
      );


      setButtonsState({
        download: true,
        resend: true,
        newTest: false
      });


      return;
    }


    updateSavePanel(
      "saving",
      "Rezultatul a fost retrimis. Se verifică...",
      "Așteptăm confirmarea din Google Sheet."
    );


    const confirmation =
      await waitForConfirmation(
        lastPayload,
        myGeneration
      );


    sending =
      false;


    if (
      confirmation.cancelled
    ) {
      return;
    }


    if (
      confirmation.found
    ) {

      showConfirmedState();

      return;
    }


    updateSavePanel(
      "error",
      "Rezultatul nu este încă confirmat.",
      "Nu închide pagina. Anunță profesorul; poți folosi din nou „Trimite din nou” dacă ți se cere."
    );


    setSheetStatus(
      "Retrimiterea a fost efectuată, dar Google Sheet nu a confirmat încă rezultatul."
    );


    setButtonsState({
      download: true,
      resend: true,
      newTest: false
    });
  }


  /* =========================================================
     INITIALIZARE BUTON
     ========================================================= */

  function initialize() {

    ensureResendButton();
  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initialize
    );

  } else {

    initialize();
  }


  /* =========================================================
     API PUBLIC
     ========================================================= */

  window.checkPriorAttempt =
    checkPriorAttempt;

  window.setStartCheckMessage =
    setStartCheckMessage;

  window.setResultButtonsEnabled =
    setResultButtonsEnabled;

  window.sendToGoogleSheet =
    sendToGoogleSheet;

  window.resendLastResult =
    resendLastResult;

  window.checkSubmissionStatus =
    checkSubmissionStatus;


  window.PhysicsSheets = {

    getConfig,

    checkPriorAttempt,

    checkSubmissionStatus,

    sendToGoogleSheet,

    resendLastResult,

    setResultButtonsEnabled,

    updateSavePanel,

    getLastPayload:
      function () {
        return lastPayload
          ? { ...lastPayload }
          : null;
      }

  };

})();
