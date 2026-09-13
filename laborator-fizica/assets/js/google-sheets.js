/* ======================================================================
   FIZICA-LICEU - TRIMITEREA REZULTATELOR CATRE GOOGLE SHEETS

   Adresa aplicatiei Google Apps Script se modifica intr-un singur loc:
   assets/data/configurare-generala.json -> submission.googleScriptUrl

   Incarcare recomandata:
   <script src="../assets/js/google-sheets.js" defer></script>

   API public: window.LaboratorGoogleSheets
   Evenimente emise:
   - laborator:submission-start
   - laborator:submission-sent
   - laborator:submission-failed
   ====================================================================== */

(() => {
  "use strict";

  const SCRIPT_URL = document.currentScript?.src || document.baseURI;
  const DEFAULT_CONFIG_URL = new URL(
    "../data/configurare-generala.json",
    SCRIPT_URL
  ).href;

  const DEFAULT_QUEUE_KEY = "fizica-laborator-rezultate-netrimise";
  const SENT_IDS_KEY = "fizica-laborator-rapoarte-trimise";
  const MAXIMUM_SENT_IDS = 100;

  const state = {
    initialized: false,
    generalConfig: null,
    submissionConfig: null,
    endpoint: "",
    submitting: false,
    listenersAdded: false,
    latestEvaluation: null,
    latestEquipment: null,
    latestNotebook: null,
    latestSafety: null,
    latestMonitoring: null,
    latestReport: null
  };

  function clone(value) {
    if (value === undefined) {
      return undefined;
    }

    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    return String(value ?? "").trim();
  }

  function safeStorageGet(key, fallback) {
    try {
      const value = globalThis.localStorage?.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(
        "[LaboratorGoogleSheets] Datele locale nu au putut fi citite.",
        error
      );
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(
        "[LaboratorGoogleSheets] Datele locale nu au putut fi salvate.",
        error
      );
      return false;
    }
  }

  async function loadGeneralConfig(url = DEFAULT_CONFIG_URL) {
    if (globalThis.LAB_GENERAL_CONFIG) {
      return globalThis.LAB_GENERAL_CONFIG;
    }

    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Configura\u021Bia general\u0103 nu a putut fi ` +
        `\u00EEnc\u0103rcat\u0103 (${response.status}).`
      );
    }

    const configuration = await response.json();
    globalThis.LAB_GENERAL_CONFIG = configuration;

    return configuration;
  }

  function validateEndpoint(value) {
    const normalizedValue = normalize(value);

    if (!normalizedValue) {
      throw new Error(
        "Adresa Google Apps Script nu este configurat\u0103."
      );
    }

    let url;

    try {
      url = new URL(normalizedValue);
    } catch (error) {
      throw new Error(
        "Adresa Google Apps Script nu are un format valid."
      );
    }

    const validHost =
      url.protocol === "https:" &&
      url.hostname === "script.google.com";

    const validPath =
      /^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname);

    if (!validHost || !validPath) {
      throw new Error(
        "Adresa Google Apps Script nu este valid\u0103. " +
        "Folose\u0219te adresa aplica\u021Biei web care se " +
        "termin\u0103 \u00EEn /exec."
      );
    }

    return url.href;
  }

  function queueKey() {
    return (
      state.submissionConfig?.localBackupKey ||
      DEFAULT_QUEUE_KEY
    );
  }

  function readQueue() {
    const queue = safeStorageGet(queueKey(), []);
    return Array.isArray(queue) ? queue : [];
  }

  function writeQueue(queue) {
    return safeStorageSet(queueKey(), queue);
  }

  function addToQueue(payload, errorMessage = "") {
    const queue = readQueue();

    const item = {
      reportId: payload.reportId,
      payload: clone(payload),
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastAttemptAt: null,
      lastError: errorMessage
    };

    const existingIndex = queue.findIndex(
      entry => entry.reportId === payload.reportId
    );

    if (existingIndex >= 0) {
      queue[existingIndex] = {
        ...queue[existingIndex],
        ...item
      };
    } else {
      queue.push(item);
    }

    writeQueue(queue);
  }

  function removeFromQueue(reportId) {
    const updatedQueue = readQueue().filter(
      item => item.reportId !== reportId
    );

    writeQueue(updatedQueue);
  }

  function hasBeenSent(reportId) {
    const ids = safeStorageGet(SENT_IDS_KEY, []);

    return (
      Array.isArray(ids) &&
      ids.includes(reportId)
    );
  }

  function rememberSent(reportId) {
    const storedIds = safeStorageGet(SENT_IDS_KEY, []);
    const ids = Array.isArray(storedIds) ? storedIds : [];

    const updatedIds = [
      reportId,
      ...ids.filter(id => id !== reportId)
    ].slice(0, MAXIMUM_SENT_IDS);

    safeStorageSet(SENT_IDS_KEY, updatedIds);
  }

  function createId(prefix = "RAP") {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    const time = Date.now().toString(36).toUpperCase();
    const random = Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase();

    return `${prefix}-${time}-${random}`;
  }

  function readGlobalState() {
    const session = clone(
      globalThis.LAB_SESSION ||
      globalThis.LaboratorSesiune?.getState?.() ||
      {}
    );

    const experiment = clone(
      globalThis.LAB_EXPERIMENT_CONFIG || {}
    );

    const equipment = clone(
      state.latestEquipment ||
      globalThis.LaboratorEchipamente?.getState?.() ||
      {}
    );

    const evaluation = clone(
      state.latestEvaluation ||
      globalThis.LaboratorEvaluare?.getResult?.() ||
      {}
    );

    const notebook = clone(
      state.latestNotebook ||
      globalThis.LaboratorCaiet?.getState?.() ||
      globalThis.LAB_NOTEBOOK_STATE ||
      {}
    );

    const safety = clone(
      state.latestSafety ||
      globalThis.LaboratorSecuritate?.getState?.() ||
      globalThis.LAB_SAFETY_STATE ||
      {}
    );

    const monitoring = clone(
      state.latestMonitoring ||
      globalThis.LaboratorMonitorizare?.getState?.() ||
      globalThis.LAB_MONITORING ||
      {}
    );

    const report = clone(
      state.latestReport ||
      globalThis.LaboratorRaport?.getData?.() ||
      {}
    );

    return {
      session,
      experiment,
      equipment,
      evaluation,
      notebook,
      safety,
      monitoring,
      report
    };
  }

  function buildPayload(overrides = {}) {
    const source = readGlobalState();
    const now = new Date();

    const sessionStarted =
      source.session.startedAt ||
      source.session.sessionStarted ||
      null;

    const finishTime =
      source.evaluation.finishedAt ||
      source.report.finishedAt ||
      now.toISOString();

    const startedTimestamp = Date.parse(sessionStarted);
    const finishedTimestamp = Date.parse(finishTime);

    const durationSeconds =
      sessionStarted &&
      Number.isFinite(startedTimestamp) &&
      Number.isFinite(finishedTimestamp)
        ? Math.max(
            0,
            Math.round(
              (finishedTimestamp - startedTimestamp) / 1000
            )
          )
        : null;

    const reportId =
      normalize(
        overrides.reportId ||
        source.report.reportId ||
        source.report.id ||
        source.session.reportId
      ) || createId("RAP");

    return {
      schemaVersion: "1.0.0",
      reportId,
      submittedAt: now.toISOString(),

      application: {
        name:
          state.generalConfig?.application?.name ||
          "Laborator virtual de fizic\u0103",

        version:
          state.generalConfig?.schemaVersion ||
          "1.0.0",

        pageUrl:
          globalThis.location?.href ||
          "",

        userAgent:
          globalThis.navigator?.userAgent ||
          ""
      },

      student: {
        name: normalize(
          source.session.studentName ||
          source.session.name
        ),

        className: normalize(
          source.session.studentClass ||
          source.session.className
        ),

        identityConfirmed: Boolean(
          source.session.identityConfirmed
        )
      },

      experiment: {
        id: normalize(
          source.experiment.id ||
          source.experiment.slug
        ),

        title: normalize(
          source.experiment.title ||
          source.experiment.experimentTitle
        ),

        classLevel: normalize(
          source.experiment.classLevel ||
          source.experiment.grade
        ),

        domain: normalize(
          source.experiment.domain ||
          source.experiment.physicsDomain
        ),

        risks: Array.isArray(source.experiment.risks)
          ? source.experiment.risks
          : [],

        dataSetId:
          source.session.dataSetId ||
          source.experiment.dataSetId ||
          source.notebook.dataSetId ||
          null
      },

      session: {
        sessionId: normalize(
          source.session.sessionId ||
          source.session.id
        ),

        startedAt: sessionStarted,
        finishedAt: finishTime,
        durationSeconds,

        dateDisplay: normalize(
          source.session.experimentDate ||
          source.session.dateDisplay
        )
      },

      safety: source.safety,
      equipment: source.equipment,
      notebook: source.notebook,

      measurements:
        source.notebook.measurements ||
        source.report.measurements ||
        [],

      calculations:
        source.notebook.calculations ||
        source.report.calculations ||
        {},

      comparison:
        source.notebook.comparison ||
        source.report.comparison ||
        {},

      evaluation: source.evaluation,
      monitoring: source.monitoring,
      report: source.report,

      ...clone(overrides)
    };
  }

  function validatePayload(payload) {
    const errors = [];

    if (!normalize(payload.reportId)) {
      errors.push(
        "lipse\u0219te identificatorul raportului"
      );
    }

    if (!normalize(payload.student?.name)) {
      errors.push(
        "lipse\u0219te numele elevului"
      );
    }

    if (!normalize(payload.student?.className)) {
      errors.push(
        "lipse\u0219te clasa elevului"
      );
    }

    if (!normalize(payload.experiment?.title)) {
      errors.push(
        "lipse\u0219te titlul experimentului"
      );
    }

    if (!normalize(payload.session?.sessionId)) {
      errors.push(
        "lipse\u0219te codul sesiunii"
      );
    }

    if (
      !payload.evaluation ||
      payload.evaluation.score === undefined
    ) {
      errors.push(
        "evaluarea final\u0103 nu este complet\u0103"
      );
    }

    if (errors.length > 0) {
      throw new Error(
        `Raportul nu poate fi trimis: ${errors.join(", ")}.`
      );
    }

    return payload;
  }

  function updateStatus(message, type = "") {
    const selectors = [
      "[data-submission-status]",
      "[data-report-submission-status]"
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);

      for (const element of elements) {
        element.textContent = message;

        element.classList.remove(
          "is-sending",
          "is-error",
          "is-success"
        );

        if (type === "sending") {
          element.classList.add("is-sending");
        }

        if (type === "error") {
          element.classList.add("is-error");
        }

        if (type === "success") {
          element.classList.add("is-success");
        }
      }
    }
  }

  function dispatch(name, detail) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail: clone(detail)
      })
    );
  }

  function wait(milliseconds) {
    return new Promise(resolve => {
      globalThis.setTimeout(resolve, milliseconds);
    });
  }

  function postPayload(payload) {
  return new Promise((resolve, reject) => {
    const frameName =
      `google-sheets-response-${Date.now()}`;

    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.hidden = true;
    iframe.setAttribute("aria-hidden", "true");

    const form = document.createElement("form");
    form.method = "POST";
    form.action = state.endpoint;
    form.target = frameName;
    form.hidden = true;
    form.acceptCharset = "UTF-8";

    const payloadInput = document.createElement("input");
    payloadInput.type = "hidden";
    payloadInput.name = "payload";
    payloadInput.value = JSON.stringify(payload);

    form.appendChild(payloadInput);
    document.body.appendChild(iframe);
    document.body.appendChild(form);

    let completed = false;

    const cleanup = () => {
      globalThis.setTimeout(() => {
        form.remove();
        iframe.remove();
      }, 1000);
    };

    iframe.addEventListener(
      "load",
      () => {
        if (completed) {
          return;
        }

        completed = true;
        cleanup();

        resolve({
          ok: true,
          type: "form-submit"
        });
      },
      {
        once: true
      }
    );

    globalThis.setTimeout(() => {
      if (completed) {
        return;
      }

      completed = true;
      cleanup();

      resolve({
        ok: true,
        type: "form-submit-timeout"
      });
    }, 5000);

    try {
      form.submit();
    } catch (error) {
      completed = true;
      cleanup();
      reject(error);
    }
  });
}

  async function sendWithRetries(payload) {
    const maximumRetries = Math.max(
      0,
      Number(
        state.submissionConfig.maximumRetries || 0
      )
    );

    const delay = Math.max(
      0,
      Number(
        state.submissionConfig.retryDelayMilliseconds ||
        1000
      )
    );

    let lastError = null;

    for (
      let attempt = 0;
      attempt <= maximumRetries;
      attempt += 1
    ) {
      try {
        const response = await postPayload(payload);

        if (
          state.submissionConfig.mode !== "no-cors" &&
          !response.ok
        ) {
          throw new Error(
            `Serverul a r\u0103spuns cu starea ${response.status}.`
          );
        }

        return {
          response,
          attempt: attempt + 1
        };
      } catch (error) {
        lastError = error;

        if (attempt < maximumRetries) {
          await wait(delay * (attempt + 1));
        }
      }
    }

    throw (
      lastError ||
      new Error(
        "Cererea nu a putut fi trimis\u0103."
      )
    );
  }

  async function submit(
    payloadOrOverrides = null,
    options = {}
  ) {
    if (!state.initialized) {
      await init();
    }

    if (
      !state.initialized ||
      !state.submissionConfig ||
      !state.endpoint
    ) {
      throw new Error(
        "Conexiunea cu Google Sheets nu este configurat\u0103."
      );
    }

    if (state.submitting) {
      throw new Error(
        "O trimitere este deja \u00EEn curs."
      );
    }

    if (!state.submissionConfig.enabled) {
      throw new Error(
        "Trimiterea c\u0103tre Google Sheets este dezactivat\u0103."
      );
    }

    const looksLikePayload = Boolean(
      payloadOrOverrides?.schemaVersion &&
      payloadOrOverrides?.student
    );

    const payload = validatePayload(
      looksLikePayload
        ? clone(payloadOrOverrides)
        : buildPayload(payloadOrOverrides || {})
    );

    const multipleSubmissionsAllowed =
      state.submissionConfig.allowMultipleSubmissions;

    if (
      !options.force &&
      !multipleSubmissionsAllowed &&
      hasBeenSent(payload.reportId)
    ) {
      updateStatus(
        "Acest raport a fost deja trimis."
      );

      return {
        status: "duplicate",
        reportId: payload.reportId
      };
    }

    state.submitting = true;

    updateStatus(
      state.submissionConfig.messages?.sending ||
      "Rezultatul se transmite\u2026",
      "sending"
    );

    dispatch(
      "laborator:submission-start",
      {
        reportId: payload.reportId
      }
    );

    try {
      if (
        globalThis.navigator &&
        !globalThis.navigator.onLine
      ) {
        throw new Error(
          "Conexiunea la internet este indisponibil\u0103."
        );
      }

      const result = await sendWithRetries(payload);

      rememberSent(payload.reportId);
      removeFromQueue(payload.reportId);

      const noCors =
        state.submissionConfig.mode === "no-cors";

      const message = noCors
        ? (
            "Cererea a fost trimis\u0103 c\u0103tre " +
            "Google Apps Script. Verificarea salv\u0103rii " +
            "se face \u00EEn foaia Google Sheets."
          )
        : (
            state.submissionConfig.messages?.success ||
            "Rezultatul a fost \u00EEnregistrat."
          );

      updateStatus(message, "success");

      dispatch(
        "laborator:submission-sent",
        {
          reportId: payload.reportId,
          noCors,
          attempts: result.attempt
        }
      );

      return {
        status: "sent",
        reportId: payload.reportId,
        noCors,
        attempts: result.attempt
      };
    } catch (error) {
      if (
        state.submissionConfig.saveLocalBackup !== false
      ) {
        addToQueue(payload, error.message);
      }

      const failureMessage =
        state.submissionConfig.messages?.failure ||
        "Rezultatul nu a putut fi transmis.";

      const message =
        `${failureMessage} ` +
        "Datele au fost p\u0103strate local pentru " +
        "re\u00EEncercare.";

      updateStatus(message, "error");

      dispatch(
        "laborator:submission-failed",
        {
          reportId: payload.reportId,
          message: error.message
        }
      );

      throw error;
    } finally {
      state.submitting = false;
    }
  }

  async function retryPending() {
    if (!state.initialized) {
      await init();
    }

    if (!state.initialized) {
      return [];
    }

    if (
      state.submitting ||
      (
        globalThis.navigator &&
        !globalThis.navigator.onLine
      )
    ) {
      return [];
    }

    const queue = readQueue();
    const results = [];

    for (const item of queue) {
      try {
        const result = await submit(
          item.payload,
          {
            force: true
          }
        );

        results.push(result);
      } catch (error) {
        results.push({
          status: "failed",
          reportId: item.reportId,
          message: error.message
        });

        break;
      }
    }

    return results;
  }

  function rememberEventData(event, key) {
    state[key] = clone(event.detail || {});
  }

  function addEventListeners() {
    if (state.listenersAdded) {
      return;
    }

    state.listenersAdded = true;

    document.addEventListener(
      "laborator:evaluation-complete",
      event => {
        rememberEventData(
          event,
          "latestEvaluation"
        );
      }
    );

    document.addEventListener(
      "laborator:equipment-complete",
      event => {
        rememberEventData(
          event,
          "latestEquipment"
        );
      }
    );

    document.addEventListener(
      "laborator:notebook-complete",
      event => {
        rememberEventData(
          event,
          "latestNotebook"
        );
      }
    );

    document.addEventListener(
      "laborator:safety-complete",
      event => {
        rememberEventData(
          event,
          "latestSafety"
        );
      }
    );

    document.addEventListener(
      "laborator:monitoring-update",
      event => {
        rememberEventData(
          event,
          "latestMonitoring"
        );
      }
    );

    document.addEventListener(
      "laborator:report-ready",
      event => {
        rememberEventData(
          event,
          "latestReport"
        );
      }
    );

    document.addEventListener(
      "laborator:submission-retry",
      () => {
        retryPending().catch(console.error);
      }
    );

    document.addEventListener(
      "click",
      event => {
        const button = event.target.closest(
          '[data-action="submit-final-report"]'
        );

        if (!button) {
          return;
        }

        event.preventDefault();

        submit().catch(error => {
          console.error(
            "[LaboratorGoogleSheets]",
            error
          );
        });
      }
    );

    globalThis.addEventListener(
      "online",
      () => {
        retryPending().catch(console.error);
      }
    );
  }

  async function init(options = {}) {
    if (state.initialized) {
      return true;
    }

    try {
      state.generalConfig = await loadGeneralConfig(
        options.configUrl ||
        DEFAULT_CONFIG_URL
      );

      state.submissionConfig = {
        enabled: true,
        method: "POST",
        mode: "no-cors",
        contentType: "text/plain;charset=UTF-8",
        timeoutMilliseconds: 15000,
        maximumRetries: 2,
        retryDelayMilliseconds: 1500,
        saveLocalBackup: true,
        allowMultipleSubmissions: false,

        ...(state.generalConfig.submission || {}),
        ...(options.submission || {})
      };

      state.endpoint = validateEndpoint(
        options.googleScriptUrl ||
        state.submissionConfig.googleScriptUrl
      );

      addEventListeners();

      state.initialized = true;

      document.dispatchEvent(
        new CustomEvent(
          "laborator:google-sheets-ready"
        )
      );

      if (
        globalThis.navigator?.onLine &&
        readQueue().length > 0
      ) {
        retryPending().catch(console.error);
      }

      return true;
    } catch (error) {
      updateStatus(
        error.message ||
        (
          "Conexiunea cu Google Sheets nu a putut fi " +
          "configurat\u0103."
        ),
        "error"
      );

      console.error(
        "[LaboratorGoogleSheets]",
        error
      );

      return false;
    }
  }

  globalThis.LaboratorGoogleSheets = Object.freeze({
    init,
    submit,
    retryPending,
    buildPayload,

    getPending: () => clone(readQueue()),

    isConfigured: () => Boolean(
      state.initialized &&
      state.endpoint
    )
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => init(),
      {
        once: true
      }
    );
  } else {
    init();
  }
})();
