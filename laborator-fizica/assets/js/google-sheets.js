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
  const DEFAULT_CONFIG_URL = new URL("../data/configurare-generala.json", SCRIPT_URL).href;
  const DEFAULT_QUEUE_KEY = "fizica-laborator-rezultate-netrimise";
  const SENT_IDS_KEY = "fizica-laborator-rapoarte-trimise";
  const MAXIMUM_SENT_IDS = 100;

  const state = {
    initialized: false,
    generalConfig: null,
    submissionConfig: null,
    endpoint: "",
    submitting: false,
    latestEvaluation: null,
    latestEquipment: null,
    latestNotebook: null,
    latestSafety: null,
    latestMonitoring: null,
    latestReport: null
  };

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
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
      console.warn("[LaboratorGoogleSheets] Datele locale nu au putut fi citite.", error);
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("[LaboratorGoogleSheets] Datele locale nu au putut fi salvate.", error);
      return false;
    }
  }

  async function loadGeneralConfig(url = DEFAULT_CONFIG_URL) {
    if (globalThis.LAB_GENERAL_CONFIG) return globalThis.LAB_GENERAL_CONFIG;
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`ConfiguraÈ›ia generalÄƒ nu a putut fi Ã®ncÄƒrcatÄƒ (${response.status}).`);
    }
    const configuration = await response.json();
    globalThis.LAB_GENERAL_CONFIG = configuration;
    return configuration;
  }

  function validateEndpoint(value) {
    const url = new URL(normalize(value));
    const validHost = url.protocol === "https:" && url.hostname === "script.google.com";
    const validPath = /^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname);
    if (!validHost || !validPath) {
      throw new Error("Adresa Google Apps Script nu este validÄƒ. FoloseÈ™te adresa aplicaÈ›iei web care se terminÄƒ Ã®n /exec.");
    }
    return url.href;
  }

  function queueKey() {
    return state.submissionConfig?.localBackupKey || DEFAULT_QUEUE_KEY;
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
    const existingIndex = queue.findIndex(entry => entry.reportId === payload.reportId);
    if (existingIndex >= 0) queue[existingIndex] = { ...queue[existingIndex], ...item };
    else queue.push(item);
    writeQueue(queue);
  }

  function removeFromQueue(reportId) {
    writeQueue(readQueue().filter(item => item.reportId !== reportId));
  }

  function hasBeenSent(reportId) {
    const ids = safeStorageGet(SENT_IDS_KEY, []);
    return Array.isArray(ids) && ids.includes(reportId);
  }

  function rememberSent(reportId) {
    const ids = safeStorageGet(SENT_IDS_KEY, []);
    const updated = [reportId, ...(Array.isArray(ids) ? ids : []).filter(id => id !== reportId)]
      .slice(0, MAXIMUM_SENT_IDS);
    safeStorageSet(SENT_IDS_KEY, updated);
  }

  function createId(prefix = "RAP") {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    const random = Math.random().toString(36).slice(2, 10).toUpperCase();
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
  }

  function readGlobalState() {
    const session = clone(globalThis.LAB_SESSION || globalThis.LaboratorSesiune?.getState?.() || {});
    const experiment = clone(globalThis.LAB_EXPERIMENT_CONFIG || {});
    const equipment = clone(state.latestEquipment || globalThis.LaboratorEchipamente?.getState?.() || {});
    const evaluation = clone(state.latestEvaluation || globalThis.LaboratorEvaluare?.getResult?.() || {});
    const notebook = clone(state.latestNotebook || globalThis.LaboratorCaiet?.getState?.() || globalThis.LAB_NOTEBOOK_STATE || {});
    const safety = clone(state.latestSafety || globalThis.LaboratorSecuritate?.getState?.() || globalThis.LAB_SAFETY_STATE || {});
    const monitoring = clone(state.latestMonitoring || globalThis.LaboratorMonitorizare?.getState?.() || globalThis.LAB_MONITORING || {});
    const report = clone(state.latestReport || globalThis.LaboratorRaport?.getData?.() || {});
    return { session, experiment, equipment, evaluation, notebook, safety, monitoring, report };
  }

  function buildPayload(overrides = {}) {
    const source = readGlobalState();
    const now = new Date();
    const sessionStarted = source.session.startedAt || source.session.sessionStarted || null;
    const finishTime = source.evaluation.finishedAt || source.report.finishedAt || now.toISOString();
    const durationSeconds = sessionStarted
      ? Math.max(0, Math.round((Date.parse(finishTime) - Date.parse(sessionStarted)) / 1000))
      : null;
    const reportId = normalize(
      overrides.reportId || source.report.reportId || source.report.id || source.session.reportId
    ) || createId("RAP");

    return {
      schemaVersion: "1.0.0",
      reportId,
      submittedAt: now.toISOString(),
      application: {
        name: state.generalConfig?.application?.name || "Laborator virtual de fizicÄƒ",
        version: state.generalConfig?.schemaVersion || "1.0.0",
        pageUrl: globalThis.location?.href || "",
        userAgent: globalThis.navigator?.userAgent || ""
      },
      student: {
        name: normalize(source.session.studentName || source.session.name),
        className: normalize(source.session.studentClass || source.session.className),
        identityConfirmed: Boolean(source.session.identityConfirmed)
      },
      experiment: {
        id: normalize(source.experiment.id || source.experiment.slug),
        title: normalize(source.experiment.title || source.experiment.experimentTitle),
        classLevel: normalize(source.experiment.classLevel || source.experiment.grade),
        domain: normalize(source.experiment.domain || source.experiment.physicsDomain),
        risks: Array.isArray(source.experiment.risks) ? source.experiment.risks : [],
        dataSetId: source.session.dataSetId || source.experiment.dataSetId || source.notebook.dataSetId || null
      },
      session: {
        sessionId: normalize(source.session.sessionId || source.session.id),
        startedAt: sessionStarted,
        finishedAt: finishTime,
        durationSeconds,
        dateDisplay: normalize(source.session.experimentDate || source.session.dateDisplay)
      },
      safety: source.safety,
      equipment: source.equipment,
      notebook: source.notebook,
      measurements: source.notebook.measurements || source.report.measurements || [],
      calculations: source.notebook.calculations || source.report.calculations || {},
      comparison: source.notebook.comparison || source.report.comparison || {},
      evaluation: source.evaluation,
      monitoring: source.monitoring,
      report: source.report,
      ...clone(overrides)
    };
  }

  function validatePayload(payload) {
    const errors = [];
    if (!normalize(payload.reportId)) errors.push("lipseÈ™te identificatorul raportului");
    if (!normalize(payload.student?.name)) errors.push("lipseÈ™te numele elevului");
    if (!normalize(payload.student?.className)) errors.push("lipseÈ™te clasa elevului");
    if (!normalize(payload.experiment?.title)) errors.push("lipseÈ™te titlul experimentului");
    if (!normalize(payload.session?.sessionId)) errors.push("lipseÈ™te codul sesiunii");
    if (!payload.evaluation || payload.evaluation.score === undefined) errors.push("evaluarea finalÄƒ nu este completÄƒ");
    if (errors.length) throw new Error(`Raportul nu poate fi trimis: ${errors.join(", ")}.`);
    return payload;
  }

  function updateStatus(message, type = "") {
    const selectors = ["[data-submission-status]", "[data-report-submission-status]"];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        element.textContent = message;
        element.classList.remove("is-sending", "is-error");
        if (type === "sending") element.classList.add("is-sending");
        if (type === "error") element.classList.add("is-error");
      }
    }
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: clone(detail) }));
  }

  function wait(milliseconds) {
    return new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
  }

  async function postPayload(payload) {
    const configuration = state.submissionConfig;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = Number(configuration.timeoutMilliseconds || 15000);
    const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), timeout) : null;
    try {
      return await fetch(state.endpoint, {
        method: configuration.method || "POST",
        mode: configuration.mode || "no-cors",
        cache: "no-store",
        redirect: "follow",
        keepalive: true,
        headers: { "Content-Type": configuration.contentType || "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
        signal: controller?.signal
      });
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }
  }

  async function sendWithRetries(payload) {
    const maximumRetries = Math.max(0, Number(state.submissionConfig.maximumRetries || 0));
    const delay = Math.max(0, Number(state.submissionConfig.retryDelayMilliseconds || 1000));
    let lastError;
    for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
      try {
        const response = await postPayload(payload);
        if (state.submissionConfig.mode !== "no-cors" && !response.ok) {
          throw new Error(`Serverul a rÄƒspuns cu starea ${response.status}.`);
        }
        return { response, attempt: attempt + 1 };
      } catch (error) {
        lastError = error;
        if (attempt < maximumRetries) await wait(delay * (attempt + 1));
      }
    }
    throw lastError || new Error("Cererea nu a putut fi trimisÄƒ.");
  }

  async function submit(payloadOrOverrides = null, options = {}) {
    if (!state.initialized) await init();
    if (!state.initialized || !state.submissionConfig || !state.endpoint) {
      throw new Error("Conexiunea cu Google Sheets nu este configuratÄƒ.");
    }
    if (state.submitting) throw new Error("O trimitere este deja Ã®n curs.");
    if (!state.submissionConfig.enabled) throw new Error("Trimiterea cÄƒtre Google Sheets este dezactivatÄƒ.");

    const looksLikePayload = payloadOrOverrides?.schemaVersion && payloadOrOverrides?.student;
    const payload = validatePayload(looksLikePayload ? clone(payloadOrOverrides) : buildPayload(payloadOrOverrides || {}));
    if (!options.force && !state.submissionConfig.allowMultipleSubmissions && hasBeenSent(payload.reportId)) {
      updateStatus("Acest raport a fost deja trimis.");
      return { status: "duplicate", reportId: payload.reportId };
    }

    state.submitting = true;
    updateStatus(state.submissionConfig.messages?.sending || "Rezultatul se transmiteâ€¦", "sending");
    dispatch("laborator:submission-start", { reportId: payload.reportId });

    try {
      if (globalThis.navigator && !globalThis.navigator.onLine) throw new Error("Conexiunea la internet este indisponibilÄƒ.");
      const result = await sendWithRetries(payload);
      rememberSent(payload.reportId);
      removeFromQueue(payload.reportId);
      const noCors = state.submissionConfig.mode === "no-cors";
      const message = noCors
        ? "Cererea a fost trimisÄƒ cÄƒtre Google Apps Script. Verificarea salvÄƒrii se face Ã®n foaia Google Sheets."
        : state.submissionConfig.messages?.success || "Rezultatul a fost Ã®nregistrat.";
      updateStatus(message);
      dispatch("laborator:submission-sent", { reportId: payload.reportId, noCors, attempts: result.attempt });
      return { status: "sent", reportId: payload.reportId, noCors, attempts: result.attempt };
    } catch (error) {
      if (state.submissionConfig.saveLocalBackup !== false) addToQueue(payload, error.message);
      const message = `${state.submissionConfig.messages?.failure || "Rezultatul nu a putut fi transmis."} Datele au fost pÄƒstrate local pentru reÃ®ncercare.`;
      updateStatus(message, "error");
      dispatch("laborator:submission-failed", { reportId: payload.reportId, message: error.message });
      throw error;
    } finally {
      state.submitting = false;
    }
  }

  async function retryPending() {
    if (!state.initialized) await init();
    if (!state.initialized) return [];
    if (state.submitting || (globalThis.navigator && !globalThis.navigator.onLine)) return [];
    const queue = readQueue();
    const results = [];
    for (const item of queue) {
      try {
        const result = await submit(item.payload, { force: true });
        results.push(result);
      } catch (error) {
        results.push({ status: "failed", reportId: item.reportId, message: error.message });
        break;
      }
    }
    return results;
  }

  function rememberEventData(event, key) {
    state[key] = clone(event.detail || {});
  }

  function addEventListeners() {
    document.addEventListener("laborator:evaluation-complete", event => rememberEventData(event, "latestEvaluation"));
    document.addEventListener("laborator:equipment-complete", event => rememberEventData(event, "latestEquipment"));
    document.addEventListener("laborator:notebook-complete", event => rememberEventData(event, "latestNotebook"));
    document.addEventListener("laborator:safety-complete", event => rememberEventData(event, "latestSafety"));
    document.addEventListener("laborator:monitoring-update", event => rememberEventData(event, "latestMonitoring"));
    document.addEventListener("laborator:report-ready", event => rememberEventData(event, "latestReport"));
    document.addEventListener("laborator:submission-retry", () => retryPending().catch(console.error));
    document.addEventListener("click", event => {
      const button = event.target.closest('[data-action="submit-final-report"]');
      if (!button) return;
      event.preventDefault();
      submit().catch(error => console.error("[LaboratorGoogleSheets]", error));
    });
    globalThis.addEventListener("online", () => retryPending().catch(console.error));
  }

  async function init(options = {}) {
    if (state.initialized) return true;
    try {
      state.generalConfig = await loadGeneralConfig(options.configUrl || DEFAULT_CONFIG_URL);
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
      state.endpoint = validateEndpoint(options.googleScriptUrl || state.submissionConfig.googleScriptUrl);
      addEventListeners();
      state.initialized = true;
      document.dispatchEvent(new CustomEvent("laborator:google-sheets-ready"));
      if (globalThis.navigator?.onLine && readQueue().length) retryPending().catch(console.error);
      return true;
    } catch (error) {
      updateStatus(error.message || "Conexiunea cu Google Sheets nu a putut fi configuratÄƒ.", "error");
      console.error("[LaboratorGoogleSheets]", error);
      return false;
    }
  }

  globalThis.LaboratorGoogleSheets = Object.freeze({
    init,
    submit,
    retryPending,
    buildPayload,
    getPending: () => clone(readQueue()),
    isConfigured: () => Boolean(state.initialized && state.endpoint)
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(), { once: true });
  } else {
    init();
  }
})();
