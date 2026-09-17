/* =========================================================
   GOOGLE SHEETS – FUNCȚII COMUNE PENTRU TESTELE DE FIZICĂ
   assets/js/sheets.js

   Funcții publice:
   - checkPriorAttempt(name, cls, testId)
   - setStartCheckMessage(text, isError)
   - sendToGoogleSheet(payload)
   - setResultButtonsEnabled(enabled)

   Compatibil cu:
   - GOOGLE_SCRIPT_URL definit în pagina testului
   - SAVE_WAIT_SECONDS
   - SAVE_RETRY_DELAYS_MS

   Pentru testele viitoare se poate folosi și:
   window.PHYSICS_SHEETS_CONFIG = {
     url: "...",
     testId: "...",
     saveWaitSeconds: 15,
     retryDelaysMs: [0, 5000, 10000],
     checkTimeoutMs: 8000
   };
   ========================================================= */

(function () {
  "use strict";


  /* =========================================================
     VALORI IMPLICITE
     ========================================================= */

  const DEFAULT_SAVE_WAIT_SECONDS = 15;

  const DEFAULT_RETRY_DELAYS_MS = [
    0,
    5000,
    10000
  ];

  const DEFAULT_CHECK_TIMEOUT_MS = 8000;

  const HIDDEN_FRAME_LIFETIME_MS = 30000;


  /* =========================================================
     CONFIGURARE
     ========================================================= */

  function getSheetsConfig() {
    const customConfig =
      window.PHYSICS_SHEETS_CONFIG || {};

    let url = "";

    /*
      1. Preferă configurația comună modernă.
      2. Dacă nu există, folosește GOOGLE_SCRIPT_URL
         din testele mai vechi.
    */

    if (customConfig.url) {
      url = String(customConfig.url).trim();
    } else {
      try {
        if (
          typeof GOOGLE_SCRIPT_URL !== "undefined" &&
          GOOGLE_SCRIPT_URL
        ) {
          url = String(GOOGLE_SCRIPT_URL).trim();
        }
      } catch (error) {
        url = "";
      }
    }


    /* Timp de așteptare după salvare */

    let saveWaitSeconds =
      Number(customConfig.saveWaitSeconds);

    if (
      !Number.isFinite(saveWaitSeconds) ||
      saveWaitSeconds < 0
    ) {
      try {
        if (
          typeof SAVE_WAIT_SECONDS !== "undefined" &&
          Number.isFinite(Number(SAVE_WAIT_SECONDS))
        ) {
          saveWaitSeconds =
            Number(SAVE_WAIT_SECONDS);
        } else {
          saveWaitSeconds =
            DEFAULT_SAVE_WAIT_SECONDS;
        }
      } catch (error) {
        saveWaitSeconds =
          DEFAULT_SAVE_WAIT_SECONDS;
      }
    }


    /* Încercări de salvare */

    let retryDelaysMs =
      Array.isArray(customConfig.retryDelaysMs)
        ? customConfig.retryDelaysMs
        : null;

    if (!retryDelaysMs) {
      try {
        if (
          typeof SAVE_RETRY_DELAYS_MS !== "undefined" &&
          Array.isArray(SAVE_RETRY_DELAYS_MS)
        ) {
          retryDelaysMs =
            SAVE_RETRY_DELAYS_MS;
        }
      } catch (error) {
        retryDelaysMs = null;
      }
    }

    if (!retryDelaysMs) {
      retryDelaysMs =
        DEFAULT_RETRY_DELAYS_MS;
    }

    retryDelaysMs = retryDelaysMs
      .map(value => Number(value))
      .filter(
        value =>
          Number.isFinite(value) &&
          value >= 0
      );


    if (!retryDelaysMs.length) {
      retryDelaysMs = [0];
    }


    /* Timeout verificare încercare anterioară */

    let checkTimeoutMs =
      Number(customConfig.checkTimeoutMs);

    if (
      !Number.isFinite(checkTimeoutMs) ||
      checkTimeoutMs <= 0
    ) {
      checkTimeoutMs =
        DEFAULT_CHECK_TIMEOUT_MS;
    }


    /* Identificator opțional al testului */

    const testId =
      customConfig.testId
        ? String(customConfig.testId).trim()
        : "";


    return {
      url,
      saveWaitSeconds,
      retryDelaysMs,
      checkTimeoutMs,
      testId
    };
  }


  /* =========================================================
     VERIFICARE URL GOOGLE APPS SCRIPT
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
     MESAJ VERIFICARE ÎNAINTE DE TEST
     ========================================================= */

  function setStartCheckMessage(text, isError) {
    const element =
      document.getElementById(
        "startCheckMessage"
      );

    if (!element) {
      return;
    }

    if (!text) {
      element.classList.add("hidden");
      element.innerText = "";
      return;
    }

    element.classList.remove("hidden");

    element.style.color =
      isError
        ? "var(--red, #c0392b)"
        : "var(--muted, #667085)";

    element.innerText = text;
  }


  /* =========================================================
     VERIFICĂ DACĂ ELEVUL A MAI SUSȚINUT TESTUL
     ========================================================= */

  async function checkPriorAttempt(
    name,
    cls,
    testId = ""
  ) {
    const config = getSheetsConfig();

    if (
      !hasValidGoogleScriptUrl(config.url)
    ) {
      return {
        found: false,
        checked: false
      };
    }


    const studentName =
      String(name || "").trim();

    const studentClass =
      String(cls || "").trim();


    /*
      Dacă funcția este apelată fără al treilea argument,
      putem utiliza identificatorul din configurație.
    */

    const currentTestId =
      String(
        testId ||
        config.testId ||
        ""
      ).trim();


    const params =
      new URLSearchParams();

    params.set("action", "check");
    params.set("nume", studentName);
    params.set("clasa", studentClass);


    /*
      Parametrul "test" permite ca același Google Sheet
      să fie folosit pentru mai multe teste.

      Dacă versiunea actuală de Code.gs nu îl folosește,
      parametrul suplimentar nu afectează funcționarea.
    */

    if (currentTestId) {
      params.set(
        "test",
        currentTestId
      );
    }


    const url =
      `${config.url}?${params.toString()}`;


    const controller =
      typeof AbortController !== "undefined"
        ? new AbortController()
        : null;


    let timeoutId = null;


    if (controller) {
      timeoutId = setTimeout(
        () => controller.abort(),
        config.checkTimeoutMs
      );
    }


    try {
      const fetchOptions = {
        method: "GET",
        cache: "no-store"
      };


      if (controller) {
        fetchOptions.signal =
          controller.signal;
      }


      const response =
        await fetch(
          url,
          fetchOptions
        );


      if (timeoutId) {
        clearTimeout(timeoutId);
      }


      if (!response.ok) {
        return {
          found: false,
          checked: false
        };
      }


      const data =
        await response.json();


      return {
        found: Boolean(data.found),

        timestamp:
          data.timestamp,

        nota:
          data.nota,

        checked: true
      };

    } catch (error) {

      if (timeoutId) {
        clearTimeout(timeoutId);
      }


      if (
        error &&
        error.name === "AbortError"
      ) {
        console.warn(
          "Verificarea încercării anterioare a expirat."
        );
      } else {
        console.error(
          "Eroare la verificarea încercării anterioare:",
          error
        );
      }


      /*
        La fel ca în testul actual:
        dacă verificarea nu poate fi făcută,
        elevul nu este blocat.
      */

      return {
        found: false,
        checked: false
      };
    }
  }


  /* =========================================================
     ACTIVARE / DEZACTIVARE BUTOANE REZULTAT
     ========================================================= */

  function setResultButtonsEnabled(enabled) {
    const downloadButton =
      document.getElementById(
        "downloadPdfBtn"
      );

    const newTestButton =
      document.getElementById(
        "newTestBtn"
      );


    if (downloadButton) {
      downloadButton.disabled =
        !enabled;
    }


    if (newTestButton) {
      newTestButton.disabled =
        !enabled;
    }
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
      document.getElementById(
        "savePanel"
      );

    const saveTitle =
      document.getElementById(
        "saveTitle"
      );

    const saveMessage =
      document.getElementById(
        "saveMessage"
      );


    if (
      !panel ||
      !saveTitle ||
      !saveMessage
    ) {
      return;
    }


    panel.classList.remove(
      "hidden",
      "error",
      "done"
    );


    if (state === "error") {
      panel.classList.add("error");
    }


    if (state === "done") {
      panel.classList.add("done");
    }


    saveTitle.innerText =
      title || "";

    saveMessage.innerText =
      message || "";
  }


  /* =========================================================
     TRIMITEREA UNEI ÎNCERCĂRI

     Folosim formular + iframe ascuns deoarece este metoda
     folosită deja de test și evită problemele CORS la POST.
     ========================================================= */

  function sendPayloadAttempt(
    payload,
    attemptNumber,
    googleScriptUrl
  ) {
    try {

      const iframeName =
        "googleSheetHiddenFrame_" +
        attemptNumber +
        "_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8);


      /* IFRAME ASCUNS */

      const iframe =
        document.createElement(
          "iframe"
        );

      iframe.name = iframeName;
      iframe.id = iframeName;

      iframe.style.display =
        "none";

      iframe.setAttribute(
        "aria-hidden",
        "true"
      );

      document.body.appendChild(
        iframe
      );


      /* FORMULAR ASCUNS */

      const form =
        document.createElement(
          "form"
        );

      form.method = "POST";

      form.action =
        googleScriptUrl;

      form.target =
        iframeName;

      form.style.display =
        "none";

      form.acceptCharset =
        "UTF-8";


      /* PAYLOAD JSON */

      const input =
        document.createElement(
          "input"
        );

      input.type = "hidden";
      input.name = "payload";

      input.value =
        JSON.stringify(payload);


      form.appendChild(input);

      document.body.appendChild(
        form
      );


      /* TRIMITERE */

      form.submit();


      /*
        Formularul nu mai este necesar după submit.
        iframe-ul este păstrat suficient timp pentru
        finalizarea cererii.
      */

      setTimeout(() => {
        if (form.isConnected) {
          form.remove();
        }

        if (iframe.isConnected) {
          iframe.remove();
        }
      }, HIDDEN_FRAME_LIFETIME_MS);


      return true;

    } catch (error) {

      console.error(
        "Eroare la trimiterea rezultatului:",
        error
      );

      return false;
    }
  }


  /* =========================================================
     PROGRAMAREA ÎNCERCĂRILOR DE SALVARE
     ========================================================= */

  function scheduleSaveAttempts(
    payload,
    config
  ) {
    config.retryDelaysMs.forEach(
      (delay, index) => {

        setTimeout(() => {

          updateSavePanel(
            "saving",

            `Se salvează rezultatul... încercarea ${
              index + 1
            }/${
              config.retryDelaysMs.length
            }`,

            "Nu închide pagina. Nu descărca raportul încă."
          );


          sendPayloadAttempt(
            payload,
            index + 1,
            config.url
          );

        }, delay);

      }
    );
  }


  /* =========================================================
     TRIMITERE PRINCIPALĂ CĂTRE GOOGLE SHEETS
     ========================================================= */

  function sendToGoogleSheet(payload) {
    const config =
      getSheetsConfig();

    const status =
      document.getElementById(
        "sheetStatus"
      );


    /* Blochează PDF-ul cât timp are loc salvarea */

    setResultButtonsEnabled(false);


    /* Verificare configurare */

    if (
      !hasValidGoogleScriptUrl(
        config.url
      )
    ) {

      updateSavePanel(
        "error",

        "Rezultatul nu a fost transmis profesorului.",

        "Lipsește URL-ul Google Apps Script din configurarea testului."
      );


      if (status) {
        status.innerHTML =
          "Rezultatul a fost calculat local, dar " +
          "<b>nu a fost trimis în Google Sheet</b>, " +
          "deoarece URL-ul Google Apps Script nu este configurat.";
      }


      /*
        Permitem totuși elevului accesul la raportul local.
      */

      setResultButtonsEnabled(true);

      return false;
    }


    /* Verificare payload */

    if (
      !payload ||
      typeof payload !== "object"
    ) {

      updateSavePanel(
        "error",

        "Rezultatul nu a fost transmis profesorului.",

        "Datele rezultatului nu sunt disponibile."
      );


      if (status) {
        status.innerText =
          "Nu există date valide pentru salvare.";
      }


      setResultButtonsEnabled(true);

      return false;
    }


    /* Mesaj inițial */

    updateSavePanel(
      "saving",

      "Se salvează rezultatul. Nu închide pagina.",

      `Așteaptă ${config.saveWaitSeconds} secunde. ` +
      "Raportul PDF va putea fi descărcat după finalizarea salvării."
    );


    if (status) {
      status.innerText =
        "Se salvează rezultatul. Nu închide pagina.";
    }


    /* Trimitem rezultatul */

    scheduleSaveAttempts(
      payload,
      config
    );


    /*
      Păstrăm comportamentul testului actual:
      după perioada de siguranță, butoanele sunt activate.
    */

    setTimeout(() => {

      updateSavePanel(
        "done",

        "Rezultatul a fost transmis profesorului.",

        "Acum poți descărca raportul PDF."
      );


      if (status) {
        status.innerText =
          "Testul a fost finalizat. " +
          "Rezultatul a fost transmis profesorului. " +
          "Poți descărca raportul PDF.";
      }


      setResultButtonsEnabled(true);

    }, config.saveWaitSeconds * 1000);


    return true;
  }


  /* =========================================================
     EXPUNERE FUNCȚII PENTRU TESTELE HTML
     ========================================================= */

  window.checkPriorAttempt =
    checkPriorAttempt;

  window.setStartCheckMessage =
    setStartCheckMessage;

  window.setResultButtonsEnabled =
    setResultButtonsEnabled;

  window.sendToGoogleSheet =
    sendToGoogleSheet;


  /*
    Obiect opțional pentru depanare sau dezvoltări viitoare.
  */

  window.PhysicsSheets = {
    getConfig: getSheetsConfig,
    checkPriorAttempt,
    sendToGoogleSheet,
    setResultButtonsEnabled,
    updateSavePanel
  };

})();
