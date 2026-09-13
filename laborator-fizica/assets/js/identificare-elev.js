/* ======================================================================
   FIZICA-LICEU - IDENTIFICAREA ELEVULUI SI INITIALIZAREA SESIUNII

   Incarcare recomandata:
   <script src="../assets/js/identificare-elev.js" defer></script>

   Biblioteca foloseste:
   - formular-identificare.html;
   - configurare-generala.json;
   - window.LAB_EXPERIMENT_CONFIG.

   Eveniment emis la confirmare: laborator:identification-complete
   ====================================================================== */

(() => {
  "use strict";

  const SCRIPT_URL =
    document.currentScript?.src ||
    document.baseURI;

  const DEFAULT_CONFIG_URL = new URL(
    "../data/configurare-generala.json",
    SCRIPT_URL
  ).href;

  const COMPONENT_SELECTOR =
    '[data-lab-component="formular-identificare"]';

  const INITIALIZED_ATTRIBUTE =
    "data-identification-initialized";

  const state = {
    root: null,
    form: null,
    generalConfig: null,
    experimentConfig: null,
    session: null,
    initialized: false,
    submitting: false
  };

  const select = (
    selector,
    root = state.root
  ) => root?.querySelector(selector) || null;

  const selectAll = (
    selector,
    root = document
  ) => [
    ...(root?.querySelectorAll(selector) || [])
  ];

  const normalizeSpaces = value =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");

  function clone(value) {
    if (value === undefined) {
      return undefined;
    }

    if (
      typeof globalThis.structuredClone ===
      "function"
    ) {
      return globalThis.structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  function safeStorageGet(key) {
    try {
      const value =
        globalThis.sessionStorage?.getItem(key);

      return value
        ? JSON.parse(value)
        : null;
    } catch (error) {
      console.warn(
        "[IdentificareElev] Sesiunea locală nu a putut fi citită.",
        error
      );

      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      globalThis.sessionStorage?.setItem(
        key,
        JSON.stringify(value)
      );

      return true;
    } catch (error) {
      console.warn(
        "[IdentificareElev] Sesiunea locală nu a putut fi salvată.",
        error
      );

      return false;
    }
  }

  function safeStorageRemove(key) {
    try {
      globalThis.sessionStorage?.removeItem(
        key
      );
    } catch (error) {
      console.warn(
        "[IdentificareElev] Sesiunea locală nu a putut fi eliminată.",
        error
      );
    }
  }

  async function loadGeneralConfig(
    url = DEFAULT_CONFIG_URL
  ) {
    if (globalThis.LAB_GENERAL_CONFIG) {
      return globalThis.LAB_GENERAL_CONFIG;
    }

    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Configurația generală nu a putut fi încărcată (${response.status}).`
      );
    }

    const configuration =
      await response.json();

    globalThis.LAB_GENERAL_CONFIG =
      configuration;

    return configuration;
  }

  function experimentTitle() {
    return normalizeSpaces(
      state.experimentConfig?.title ||
      state.experimentConfig
        ?.experimentTitle ||
      document.querySelector("h1")
        ?.textContent ||
      "Experiment de fizică"
    );
  }

  function experimentId() {
    const configured = normalizeSpaces(
      state.experimentConfig?.id ||
      state.experimentConfig?.slug
    );

    if (configured) {
      return configured;
    }

    const filename =
      globalThis.location?.pathname
        ?.split("/")
        .pop() ||
      "experiment";

    return filename.replace(
      /\.html?$/i,
      ""
    ) || "experiment";
  }

  function storageKey() {
    const prefix =
      state.generalConfig?.session
        ?.storagePrefix ||
      "fizica-laborator";

    return `${prefix}:sesiune:${experimentId()}`;
  }

  function randomInteger(
    minimum,
    maximum
  ) {
    const min = Math.ceil(minimum);
    const max = Math.floor(maximum);
    const range = max - min + 1;

    if (range <= 0) {
      throw new RangeError(
        "Intervalul aleatoriu nu este valid."
      );
    }

    if (
      globalThis.crypto?.getRandomValues
    ) {
      const maximumUint = 4294967296;
      const limit =
        maximumUint -
        maximumUint % range;

      const buffer =
        new Uint32Array(1);

      do {
        globalThis.crypto.getRandomValues(
          buffer
        );
      } while (buffer[0] >= limit);

      return min + buffer[0] % range;
    }

    return min +
      Math.floor(Math.random() * range);
  }

  function createSessionId() {
    const prefix =
      state.generalConfig?.session
        ?.idPrefix ||
      "FIZ";

    if (
      globalThis.crypto?.randomUUID
    ) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    const timestamp =
      Date.now()
        .toString(36)
        .toUpperCase();

    const random =
      Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase();

    return `${prefix}-${timestamp}-${random}`;
  }

  function createDataSetId() {
    const minimumCount = Math.max(
      1,
      Number(
        state.generalConfig?.session
          ?.dataSet?.minimumSetCount ||
        50
      )
    );

    return randomInteger(
      1,
      minimumCount
    );
  }

  function dateFormatter(options) {
    return new Intl.DateTimeFormat(
      state.generalConfig?.application
        ?.locale ||
      "ro-RO",
      {
        timeZone:
          state.generalConfig
            ?.application?.timeZone ||
          "Europe/Bucharest",
        ...options
      }
    );
  }

  function formatDate(date) {
    return dateFormatter({
      dateStyle: "long"
    }).format(date);
  }

  function formatTime(date) {
    return dateFormatter({
      timeStyle: "medium"
    }).format(date);
  }

  function formatDateTime(date) {
    return dateFormatter({
      dateStyle: "long",
      timeStyle: "medium"
    }).format(date);
  }

  function setValue(selector, value) {
    const field = select(selector);

    if (field) {
      field.value = String(value ?? "");
    }
  }

  function setTextEverywhere(
    selectors,
    value
  ) {
    for (const selector of selectors) {
      for (
        const element
        of selectAll(selector)
      ) {
        element.textContent =
          value || "—";
      }
    }
  }

  function setFeedback(
    message,
    type = ""
  ) {
    const feedback = select(
      "[data-identification-feedback]"
    );

    if (!feedback) {
      return;
    }

    feedback.textContent = message;

    feedback.classList.remove(
      "is-success",
      "is-warning",
      "is-error"
    );

    if (type) {
      feedback.classList.add(
        `is-${type}`
      );
    }
  }

  function setFieldError(
    fieldName,
    message = ""
  ) {
    const field = select(
      `[name="${fieldName}"]`
    );

    const feedback = select(
      `[data-error-for="${fieldName}"]`
    );

    field?.setAttribute(
      "aria-invalid",
      String(Boolean(message))
    );

    if (feedback) {
      feedback.textContent = message;
    }
  }

  function normalizeName(value) {
    return normalizeSpaces(value)
      .split(" ")
      .map(part =>
        part
          ? part
              .charAt(0)
              .toLocaleUpperCase("ro-RO") +
            part.slice(1)
          : ""
      )
      .join(" ");
  }

  function normalizeClassName(value) {
    return normalizeSpaces(value)
      .toLocaleUpperCase("ro-RO")
      .replace(
        /^([IVX]+)([A-ZĂÂÎȘȚ])$/,
        "$1 $2"
      );
  }

  function validateName(value) {
    const configuration =
      state.generalConfig
        ?.studentIdentification ||
      {};

    const minimum = Number(
      configuration.minimumNameLength ||
      3
    );

    const maximum = Number(
      configuration.maximumNameLength ||
      80
    );

    if (value.length < minimum) {
      return `Numele trebuie să conțină cel puțin ${minimum} caractere.`;
    }

    if (value.length > maximum) {
      return `Numele poate conține cel mult ${maximum} de caractere.`;
    }

    if (!/[\p{L}]/u.test(value)) {
      return "Numele trebuie să conțină litere.";
    }

    if (/\d/u.test(value)) {
      return "Numele nu trebuie să conțină cifre.";
    }

    return "";
  }

  function validateClassName(value) {
    const configuration =
      state.generalConfig
        ?.studentIdentification ||
      {};

    const minimum = Number(
      configuration.minimumClassLength ||
      2
    );

    const maximum = Number(
      configuration.maximumClassLength ||
      12
    );

    if (value.length < minimum) {
      return "Completează clasa.";
    }

    if (value.length > maximum) {
      return `Clasa poate conține cel mult ${maximum} caractere.`;
    }

    const pattern =
      configuration.allowedClassPattern;

    if (pattern) {
      try {
        if (
          !new RegExp(
            pattern,
            "u"
          ).test(value)
        ) {
          return "Introdu clasa în forma IX A, X B, XI C sau XII D.";
        }
      } catch (error) {
        console.warn(
          "[IdentificareElev] Expresia pentru validarea clasei nu este validă.",
          error
        );
      }
    }

    return "";
  }

  function prepareSession() {
    const restored =
      state.generalConfig?.session
        ?.restoreInterruptedSession
        ? safeStorageGet(storageKey())
        : null;

    const now = new Date();

    const validRestoredSession =
      restored &&
      restored.experimentId ===
        experimentId();

    state.session =
      validRestoredSession
        ? restored
        : {
            sessionId:
              createSessionId(),
            dataSetId:
              createDataSetId(),
            experimentId:
              experimentId(),
            experimentTitle:
              experimentTitle(),
            createdAt:
              now.toISOString(),
            startedAt: null,
            studentName: "",
            studentClass: "",
            identityConfirmed: false,
            monitoringAcknowledged: false
          };

    const created = new Date(
      state.session.createdAt ||
      now
    );

    setValue(
      "[data-experiment-date]",
      formatDate(created)
    );

    setValue(
      "[data-experiment-start-time]",
      state.session.startedAt
        ? formatTime(
            new Date(
              state.session.startedAt
            )
          )
        : formatTime(now)
    );

    setValue(
      "[data-session-id]",
      state.session.sessionId
    );

    setValue(
      "[data-dataset-id]",
      state.session.dataSetId
    );

    const title = select(
      "[data-identification-experiment-title]"
    );

    if (title) {
      title.textContent =
        experimentTitle();
    }

    if (state.session.studentName) {
      setValue(
        "[data-student-name]",
        state.session.studentName
      );
    }

    if (state.session.studentClass) {
      setValue(
        "[data-student-class]",
        state.session.studentClass
      );
    }

    safeStorageSet(
      storageKey(),
      state.session
    );
  }

  function validateForm() {
    const nameField = select(
      "[data-student-name]"
    );

    const classField = select(
      "[data-student-class]"
    );

    const monitoring = select(
      "[data-monitoring-consent]"
    );

    const confirmation = select(
      "[data-identity-confirmation]"
    );

    const name = normalizeName(
      nameField?.value
    );

    const className =
      normalizeClassName(
        classField?.value
      );

    const nameError =
      validateName(name);

    const classError =
      validateClassName(className);

    if (nameField) {
      nameField.value = name;
    }

    if (classField) {
      classField.value = className;
    }

    setFieldError(
      "studentName",
      nameError
    );

    setFieldError(
      "studentClass",
      classError
    );

    setFieldError(
      "activityMonitoringAcknowledged",
      monitoring?.checked
        ? ""
        : "Bifează confirmarea privind monitorizarea activității."
    );

    setFieldError(
      "identityConfirmed",
      confirmation?.checked
        ? ""
        : "Confirmă că datele introduse sunt corecte."
    );

    return {
      valid:
        !nameError &&
        !classError &&
        Boolean(monitoring?.checked) &&
        Boolean(confirmation?.checked),
      name,
      className,
      monitoringAcknowledged:
        Boolean(monitoring?.checked),
      identityConfirmed:
        Boolean(confirmation?.checked)
    };
  }

  async function requestFullscreenIfConfigured() {
    const monitoring =
      state.generalConfig?.monitoring ||
      {};

    if (
      !monitoring.requestFullscreen ||
      document.fullscreenElement ||
      !document.documentElement
        .requestFullscreen
    ) {
      return false;
    }

    try {
      await document.documentElement
        .requestFullscreen({
          navigationUI: "hide"
        });

      return true;
    } catch (error) {
      console.info(
        "[IdentificareElev] Modul ecran complet nu a fost activat.",
        error
      );

      return false;
    }
  }

  function updateSharedInterface() {
    const session = state.session;

    setTextEverywhere(
      [
        "[data-session-student-name]",
        "[data-notebook-student-name]",
        "[data-safety-student-name]",
        "[data-print-student-name]"
      ],
      session.studentName
    );

    setTextEverywhere(
      [
        "[data-session-student-class]",
        "[data-notebook-student-class]",
        "[data-print-student-class]"
      ],
      session.studentClass
    );

    setTextEverywhere(
      [
        "[data-session-date]",
        "[data-notebook-date-time]"
      ],
      session.startedAtDisplay
    );

    setTextEverywhere(
      [
        "[data-session-id-display]"
      ],
      session.sessionId
    );

    setTextEverywhere(
      [
        "[data-notebook-dataset-id]"
      ],
      String(session.dataSetId)
    );

    setTextEverywhere(
      [
        "[data-notebook-experiment-title]",
        "[data-print-experiment-title]"
      ],
      session.experimentTitle
    );
  }

  async function submitIdentification(
    event
  ) {
    event.preventDefault();

    if (state.submitting) {
      return;
    }

    const validation =
      validateForm();

    if (!validation.valid) {
      setFeedback(
        "Verifică datele și confirmările obligatorii.",
        "error"
      );

      select(
        '[aria-invalid="true"]'
      )?.focus();

      return;
    }

    state.submitting = true;

    const button = select(
      '[data-action="start-laboratory"]'
    );

    if (button) {
      button.disabled = true;
    }

    try {
      const now = new Date();

      state.session = {
        ...state.session,
        studentName:
          validation.name,
        studentClass:
          validation.className,
        experimentTitle:
          experimentTitle(),
        startedAt:
          state.session.startedAt ||
          now.toISOString(),
        startedAtDisplay:
          formatDateTime(
            state.session.startedAt
              ? new Date(
                  state.session.startedAt
                )
              : now
          ),
        experimentDate:
          formatDate(now),
        identityConfirmed:
          validation.identityConfirmed,
        monitoringAcknowledged:
          validation
            .monitoringAcknowledged
      };

      safeStorageSet(
        storageKey(),
        state.session
      );

      globalThis.LAB_SESSION =
        clone(state.session);

      updateSharedInterface();

      await requestFullscreenIfConfigured();

      setFeedback(
        "Datele au fost confirmate. Continuă cu instructajul de securitate.",
        "success"
      );

      state.root.hidden = true;

      state.root.setAttribute(
        "aria-hidden",
        "true"
      );

      document.body.classList.remove(
        "lab-modal-open"
      );

      document.dispatchEvent(
        new CustomEvent(
          "laborator:identification-complete",
          {
            detail: clone(
              state.session
            )
          }
        )
      );

      document.querySelector(
        '[data-lab-component="instructaj-securitate"] h2, main h2'
      )?.focus?.();
    } finally {
      state.submitting = false;

      if (button) {
        button.disabled = false;
      }
    }
  }

  function addEventListeners() {
    state.form.addEventListener(
      "submit",
      submitIdentification
    );

    select(
      "[data-student-name]"
    )?.addEventListener(
      "input",
      () =>
        setFieldError(
          "studentName"
        )
    );

    select(
      "[data-student-class]"
    )?.addEventListener(
      "input",
      () =>
        setFieldError(
          "studentClass"
        )
    );

    select(
      "[data-monitoring-consent]"
    )?.addEventListener(
      "change",
      () =>
        setFieldError(
          "activityMonitoringAcknowledged"
        )
    );

    select(
      "[data-identity-confirmation]"
    )?.addEventListener(
      "change",
      () =>
        setFieldError(
          "identityConfirmed"
        )
    );
  }

  async function init(
    root = document,
    experimentConfiguration =
      globalThis.LAB_EXPERIMENT_CONFIG ||
      {}
  ) {
    const component =
      root.matches?.(COMPONENT_SELECTOR)
        ? root
        : root.querySelector?.(
            COMPONENT_SELECTOR
          );

    if (
      !component ||
      component.hasAttribute(
        INITIALIZED_ATTRIBUTE
      )
    ) {
      return null;
    }

    component.setAttribute(
      INITIALIZED_ATTRIBUTE,
      "loading"
    );

    state.root = component;

    state.form = select(
      "[data-identification-form]"
    );

    state.experimentConfig =
      experimentConfiguration;

    try {
      if (!state.form) {
        throw new Error(
          "Formularul de identificare nu există în componentă."
        );
      }

      state.generalConfig =
        await loadGeneralConfig();

      prepareSession();
      addEventListeners();

      document.body.classList.add(
        "lab-modal-open"
      );

      component.hidden = false;

      component.removeAttribute(
        "aria-hidden"
      );

      component.setAttribute(
        INITIALIZED_ATTRIBUTE,
        "true"
      );

      state.initialized = true;

      select(
        "[data-student-name]"
      )?.focus();

      document.dispatchEvent(
        new CustomEvent(
          "laborator:identification-ready",
          {
            detail: {
              sessionId:
                state.session.sessionId,
              dataSetId:
                state.session.dataSetId
            }
          }
        )
      );

      return clone(state.session);
    } catch (error) {
      component.setAttribute(
        INITIALIZED_ATTRIBUTE,
        "error"
      );

      setFeedback(
        error.message ||
        "Formularul nu a putut fi inițializat.",
        "error"
      );

      console.error(
        "[IdentificareElev]",
        error
      );

      return null;
    }
  }

  function reset() {
    if (!state.root) {
      return;
    }

    safeStorageRemove(storageKey());

    globalThis.LAB_SESSION = null;

    state.form?.reset();
    state.session = null;

    state.root.removeAttribute(
      INITIALIZED_ATTRIBUTE
    );

    state.initialized = false;

    init(
      document,
      state.experimentConfig || {}
    );
  }

  globalThis.LaboratorIdentificare =
    Object.freeze({
      init,
      reset,
      getState: () =>
        clone(state.session)
    });

  function autoInit() {
    const component =
      document.querySelector(
        COMPONENT_SELECTOR
      );

    if (
      component &&
      !component.hasAttribute(
        INITIALIZED_ATTRIBUTE
      )
    ) {
      init(
        document,
        globalThis
          .LAB_EXPERIMENT_CONFIG ||
        {}
      );
    }
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      autoInit,
      {
        once: true
      }
    );
  } else {
    autoInit();
  }

  document.addEventListener(
    "laborator:components-loaded",
    autoInit
  );

  document.addEventListener(
    "laborator:component-loaded",
    autoInit
  );
})();
