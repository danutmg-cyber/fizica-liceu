/**
 * experiment-engine.js
 * Motor generic pentru experimente interactive pas-cu-pas
 * Fizică – clasa a IX-a
 *
 * Prof. Dănuț Andronie
 * e-Mail: danutmg@gmail.com
 *
 * Principii:
 * - fără animații;
 * - acțiuni explicite ale elevului;
 * - citirea manuală a instrumentelor;
 * - notarea rezultatelor în caiet;
 * - introducerea manuală a valorilor;
 * - calcule efectuate de elev;
 * - comparații și concluzii;
 * - salvare locală a progresului;
 * - trimitere / retrimitere către Google Apps Script;
 * - raport PDF prin dialogul de imprimare al browserului.
 *
 * Dependențe:
 *   experiment-tools.js
 *   experiment-physics.js
 *   measurement-tools.js
 */

(function (window, document) {
  "use strict";

  /* =========================================================
     DEPENDENȚE
     ========================================================= */

  if (!window.ExperimentTools) {
    throw new Error(
      "experiment-engine.js necesită experiment-tools.js."
    );
  }

  if (!window.ExperimentPhysics) {
    throw new Error(
      "experiment-engine.js necesită experiment-physics.js."
    );
  }

  if (!window.MeasurementTools) {
    throw new Error(
      "experiment-engine.js necesită measurement-tools.js."
    );
  }

  const Tools = window.ExperimentTools;
  const Physics = window.ExperimentPhysics;
  const Measurements = window.MeasurementTools;

  const instances = new Map();

  /* =========================================================
     CONSTANTE
     ========================================================= */

  const ENGINE_VERSION = "3.0.0";

  const DEFAULT_OPTIONS = {
    minimumConclusionLength: 20,
    minimumComparisonLength: 10,
    calculationTolerance: 0.02,
    maximumAttempts: 3,
    submissionTimeoutMs: 20000
  };

  const STUDENT_PROFILE_KEY =
    "fizica-liceu:student-profile";

  /* =========================================================
     FUNCȚII GENERALE
     ========================================================= */

  function createElement(
    tag,
    className = "",
    text = ""
  ) {
    const element =
      document.createElement(tag);

    if (className) {
      element.className =
        className;
    }

    if (text !== "") {
      element.textContent =
        text;
    }

    return element;
  }

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(
        element.firstChild
      );
    }
  }

  function escapeHtml(value) {
    const element =
      document.createElement("div");

    element.textContent =
      String(value ?? "");

    return element.innerHTML;
  }

  function isFiniteNumber(value) {
    return (
      typeof value === "number" &&
      Number.isFinite(value)
    );
  }

  function formatNumber(
    value,
    decimals = 2
  ) {
    if (!isFiniteNumber(value)) {
      return "";
    }

    return Tools.numbers.formatNumber(
      value,
      decimals
    );
  }

  function deepClone(value) {
    return JSON.parse(
      JSON.stringify(value)
    );
  }

  function getByPath(
    object,
    path
  ) {
    if (
      object === null ||
      object === undefined ||
      !path
    ) {
      return undefined;
    }

    return String(path)
      .split(".")
      .reduce(
        (current, key) => {
          if (
            current === null ||
            current === undefined
          ) {
            return undefined;
          }

          return current[key];
        },
        object
      );
  }

  function createId(prefix = "id") {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        "function"
    ) {
      return (
        prefix +
        "-" +
        window.crypto.randomUUID()
      );
    }

    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random()
        .toString(36)
        .slice(2, 12)
    );
  }

  function durationSeconds(
    start,
    end
  ) {
    if (!start || !end) {
      return null;
    }

    const startTime =
      new Date(start).getTime();

    const endTime =
      new Date(end).getTime();

    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime)
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.round(
        (endTime - startTime) /
        1000
      )
    );
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage
        .getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeLocalStorageSet(
    key,
    value
  ) {
    try {
      window.localStorage
        .setItem(
          key,
          value
        );
    } catch (error) {
      /* fără acțiune */
    }
  }

  function loadStudentProfile() {
    const raw =
      safeLocalStorageGet(
        STUDENT_PROFILE_KEY
      );

    if (!raw) {
      return {
        name: "",
        className: ""
      };
    }

    try {
      const profile =
        JSON.parse(raw);

      return {
        name:
          String(
            profile.name || ""
          ),
        className:
          String(
            profile.className || ""
          )
      };
    } catch (error) {
      return {
        name: "",
        className: ""
      };
    }
  }

  function saveStudentProfile(
    profile
  ) {
    safeLocalStorageSet(
      STUDENT_PROFILE_KEY,
      JSON.stringify({
        name:
          String(
            profile.name || ""
          ).trim(),

        className:
          String(
            profile.className || ""
          ).trim()
      })
    );
  }

  /* =========================================================
     URL FIȘIER JSON
     ========================================================= */

  function getEngineScript() {
    if (
      document.currentScript &&
      document.currentScript.src
    ) {
      return document.currentScript;
    }

    return Array
      .from(document.scripts)
      .find(
        (script) =>
          script.src &&
          script.src.includes(
            "experiment-engine.js"
          )
      );
  }

  function getDefaultDataUrl() {
    const script =
      getEngineScript();

    if (
      script &&
      script.src
    ) {
      return new URL(
        "../data/experiments-clasa9.json",
        script.src
      ).href;
    }

    return (
      "../../../assets/data/" +
      "experiments-clasa9.json"
    );
  }

  async function loadJson(url) {
    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Nu s-a putut încărca " +
        `experiments-clasa9.json. HTTP ${response.status}`
      );
    }

    return response.json();
  }

  /* =========================================================
     URL GOOGLE APPS SCRIPT
     ========================================================= */

  function getConfiguredAppScriptUrl(
    container,
    options
  ) {
    if (
      options.appScriptUrl
    ) {
      return options.appScriptUrl;
    }

    if (
      container.dataset
        .appScriptUrl
    ) {
      return container.dataset
        .appScriptUrl;
    }

    const meta =
      document.querySelector(
        'meta[name="experiment-web-app"]'
      );

    if (
      meta &&
      meta.content
    ) {
      return meta.content.trim();
    }

    if (
      window.FIZICA_CONFIG &&
      window.FIZICA_CONFIG
        .experimentWebAppUrl
    ) {
      return String(
        window.FIZICA_CONFIG
          .experimentWebAppUrl
      ).trim();
    }

    return "";
  }

  /* =========================================================
     CLASA PRINCIPALĂ
     ========================================================= */

  class ExperimentEngine {
    constructor(
      container,
      options = {}
    ) {
      this.container =
        typeof container === "string"
          ? document.querySelector(
              container
            )
          : container;

      if (!this.container) {
        throw new Error(
          "Containerul experimentului nu există."
        );
      }

      this.options = {
        ...DEFAULT_OPTIONS,
        ...options
      };

      this.experimentId =
        options.experimentId ||
        this.container.dataset
          .experimentId;

      if (!this.experimentId) {
        throw new Error(
          "Lipsește data-experiment-id."
        );
      }

      this.dataUrl =
        options.dataUrl ||
        this.container.dataset
          .experimentsSource ||
        getDefaultDataUrl();

      this.appScriptUrl =
        getConfiguredAppScriptUrl(
          this.container,
          options
        );

      this.data = null;
      this.defaults = {};
      this.reporting = {};
      this.experiment = null;
      this.simulation = {};
      this.model = null;
      this.steps = [];

      this.state = {
        version:
          ENGINE_VERSION,

        experimentId:
          this.experimentId,

        currentStep: 0,

        completedSteps: [],

        actions: {},

        measurements: {},

        calculations: {},

        answers: {},

        choices: {},

        comparisons: {},

        conclusions: {},

        tables: {},

        session: {
          sessionId:
            createId("session"),

          startedAt:
            new Date()
              .toISOString(),

          finishedAt: null
        },

        submission: {
          reportId:
            createId(
              this.experimentId
            ),

          datasetId:
            createId("dataset"),

          submitted: false,

          revision: 0,

          lastSubmittedAt: null,

          lastServerMessage: "",

          lastStatus: "not-sent"
        },

        completed: false
      };

      this.elements = {};
    }

    /* =======================================================
       INIȚIALIZARE
       ======================================================= */

    async init() {
      this.data =
        await loadJson(
          this.dataUrl
        );

      this.defaults =
        this.data
          .simulationDefaults ||
        {};

      this.reporting =
        this.data.reporting ||
        {};

      this.experiment =
        this.data
          .experiments
          ?.find(
            (experiment) =>
              experiment.id ===
              this.experimentId
          );

      if (!this.experiment) {
        throw new Error(
          `Experimentul ${this.experimentId} nu există în JSON.`
        );
      }

      this.simulation =
        Tools.config.deepMerge(
          this.defaults,
          this.experiment
            .simulation ||
            {}
        );

      if (
        this.experiment
          .simulation
          ?.type
      ) {
        this.model =
          Physics.create(
            this.experimentId,
            this.experiment
              .simulation
          );
      }

      this.steps =
        Array.isArray(
          this.experiment.steps
        )
          ? this.experiment.steps
          : [];

      this.restoreState();
      this.ensureRuntimeState();
      this.validateCurrentStep();

      this.renderShell();

      if (
        this.steps.length === 0
      ) {
        this.renderConfigurationError(
          "Experimentul nu conține proprietatea steps."
        );

        return this;
      }

      this.render();

      return this;
    }

    /* =======================================================
       STARE
       ======================================================= */

    restoreState() {
      const saved =
        Tools.storage.loadState(
          this.experimentId
        );

      if (
        !saved ||
        saved.experimentId !==
          this.experimentId
      ) {
        return;
      }

      this.state = {
        ...this.state,
        ...saved,

        actions:
          saved.actions || {},

        measurements:
          saved.measurements || {},

        calculations:
          saved.calculations || {},

        answers:
          saved.answers || {},

        choices:
          saved.choices || {},

        comparisons:
          saved.comparisons || {},

        conclusions:
          saved.conclusions || {},

        tables:
          saved.tables || {},

        completedSteps:
          Array.isArray(
            saved.completedSteps
          )
            ? saved.completedSteps
            : [],

        session: {
          ...this.state.session,
          ...(saved.session || {})
        },

        submission: {
          ...this.state.submission,
          ...(saved.submission ||
            {})
        }
      };
    }

    ensureRuntimeState() {
      if (
        !this.state.session
          .sessionId
      ) {
        this.state.session
          .sessionId =
          createId("session");
      }

      if (
        !this.state.session
          .startedAt
      ) {
        this.state.session
          .startedAt =
          new Date()
            .toISOString();
      }

      if (
        !this.state.submission
          .reportId
      ) {
        this.state.submission
          .reportId =
          createId(
            this.experimentId
          );
      }

      if (
        !this.state.submission
          .datasetId
      ) {
        this.state.submission
          .datasetId =
          createId("dataset");
      }

      if (
        !Number.isInteger(
          this.state.submission
            .revision
        )
      ) {
        this.state.submission
          .revision = 0;
      }

      this.saveState();
    }

    saveState() {
      Tools.storage.saveState(
        this.experimentId,
        this.state
      );
    }

    validateCurrentStep() {
      if (
        !Number.isInteger(
          this.state.currentStep
        )
      ) {
        this.state.currentStep = 0;
      }

      if (
        this.state.currentStep < 0
      ) {
        this.state.currentStep = 0;
      }

      if (
        this.steps.length > 0 &&
        this.state.currentStep >=
          this.steps.length
      ) {
        this.state.currentStep =
          this.steps.length - 1;
      }
    }

    /* =======================================================
       PAȘI
       ======================================================= */

    isStepCompleted(stepId) {
      return this.state
        .completedSteps
        .includes(stepId);
    }

    completeStep(stepId) {
      if (
        !this.isStepCompleted(
          stepId
        )
      ) {
        this.state
          .completedSteps
          .push(stepId);
      }

      this.saveState();
      this.updateProgress();
    }

    requirementsSatisfied(step) {
      if (
        !Array.isArray(
          step.requires
        ) ||
        step.requires.length === 0
      ) {
        return true;
      }

      return step.requires.every(
        (requiredStep) =>
          this.isStepCompleted(
            requiredStep
          )
      );
    }

    getCurrentStep() {
      return this.steps[
        this.state.currentStep
      ];
    }

    /* =======================================================
       REZOLVAREA VALORILOR DIN JSON
       ======================================================= */

    resolveValue(descriptor) {
      if (
        typeof descriptor ===
        "number"
      ) {
        return descriptor;
      }

      if (
        typeof descriptor ===
        "string"
      ) {
        return descriptor;
      }

      if (
        descriptor === null ||
        descriptor === undefined
      ) {
        return null;
      }

      if (
        Array.isArray(descriptor)
      ) {
        return descriptor.map(
          (item) =>
            this.resolveValue(item)
        );
      }

      if (
        typeof descriptor !==
        "object"
      ) {
        return descriptor;
      }

      if (
        Object.prototype
          .hasOwnProperty
          .call(
            descriptor,
            "value"
          )
      ) {
        return descriptor.value;
      }

      if (
        descriptor.measurement
      ) {
        return this.state
          .measurements[
            descriptor.measurement
          ];
      }

      if (
        descriptor.calculation
      ) {
        return this.state
          .calculations[
            descriptor.calculation
          ];
      }

      if (
        descriptor.answer
      ) {
        return this.state
          .answers[
            descriptor.answer
          ];
      }

      if (
        descriptor.modelProperty
      ) {
        if (!this.model) {
          throw new Error(
            "Modelul fizic nu este inițializat."
          );
        }

        return getByPath(
          this.model,
          descriptor.modelProperty
        );
      }

      if (
        descriptor.modelMethod
      ) {
        if (!this.model) {
          throw new Error(
            "Modelul fizic nu este inițializat."
          );
        }

        const method =
          this.model[
            descriptor.modelMethod
          ];

        if (
          typeof method !==
          "function"
        ) {
          throw new Error(
            `Metoda "${descriptor.modelMethod}" nu există în modelul fizic.`
          );
        }

        const args =
          (
            descriptor.args ||
            []
          ).map(
            (argument) =>
              this.resolveValue(
                argument
              )
          );

        return method.apply(
          this.model,
          args
        );
      }

      if (
        descriptor
          .physicsCalculation
      ) {
        const calculation =
          Physics.calculations[
            descriptor
              .physicsCalculation
          ];

        if (
          typeof calculation !==
          "function"
        ) {
          throw new Error(
            `Calculul fizic "${descriptor.physicsCalculation}" nu există.`
          );
        }

        const args =
          (
            descriptor.args ||
            []
          ).map(
            (argument) =>
              this.resolveValue(
                argument
              )
          );

        return calculation(
          ...args
        );
      }

      return null;
    }

    /* =======================================================
       STRUCTURA INTERFEȚEI
       ======================================================= */

    renderShell() {
      clearElement(
        this.container
      );

      this.container.classList.add(
        "experiment-engine"
      );

      const header =
        createElement(
          "header",
          "experiment-header"
        );

      const badge =
        createElement(
          "span",
          "experiment-badge",
          this.experimentId
        );

      const title =
        createElement(
          "h2",
          "experiment-title",
          this.experiment
            .officialTitle ||
            "Experiment"
        );

      const objective =
        createElement(
          "p",
          "experiment-objective",
          this.experiment
            .objective ||
            ""
        );

      const notebook =
        createElement(
          "div",
          "experiment-notebook-note",
          this.defaults
            .notebook
            ?.instruction ||
            "Notează valorile măsurate și calculele și în caiet."
        );

      header.append(
        badge,
        title,
        objective,
        notebook
      );

      /* ---------- PROGRES ---------- */

      const progress =
        createElement(
          "div",
          "experiment-progress"
        );

      const progressText =
        createElement(
          "div",
          "experiment-progress-text"
        );

      const progressTrack =
        createElement(
          "div",
          "experiment-progress-track"
        );

      progressTrack.setAttribute(
        "role",
        "progressbar"
      );

      progressTrack.setAttribute(
        "aria-valuemin",
        "0"
      );

      progressTrack.setAttribute(
        "aria-valuemax",
        "100"
      );

      const progressBar =
        createElement(
          "div",
          "experiment-progress-bar"
        );

      progressTrack.appendChild(
        progressBar
      );

      progress.append(
        progressText,
        progressTrack
      );

      /* ---------- PAS ---------- */

      const stepArea =
        createElement(
          "section",
          "experiment-step-area"
        );

      stepArea.setAttribute(
        "aria-live",
        "polite"
      );

      /* ---------- NAVIGARE ---------- */

      const navigation =
        createElement(
          "nav",
          "experiment-navigation"
        );

      navigation.setAttribute(
        "aria-label",
        "Navigarea experimentului"
      );

      const previousButton =
        createElement(
          "button",
          "experiment-nav-button experiment-prev",
          "← Pasul anterior"
        );

      previousButton.type =
        "button";

      const nextButton =
        createElement(
          "button",
          "experiment-nav-button experiment-next",
          "Pasul următor →"
        );

      nextButton.type =
        "button";

      previousButton.addEventListener(
        "click",
        () =>
          this.previousStep()
      );

      nextButton.addEventListener(
        "click",
        () =>
          this.nextStep()
      );

      navigation.append(
        previousButton,
        nextButton
      );

      /* ---------- FINAL ---------- */

      const completionArea =
        createElement(
          "section",
          "experiment-completion"
        );

      completionArea.hidden =
        true;

      this.container.append(
        header,
        progress,
        stepArea,
        navigation,
        completionArea
      );

      this.elements = {
        progressText,
        progressTrack,
        progressBar,
        stepArea,
        navigation,
        previousButton,
        nextButton,
        completionArea
      };
    }

    /* =======================================================
       RANDĂRIRE PAS
       ======================================================= */

    render() {
      this.elements.stepArea
        .hidden = false;

      this.elements.navigation
        .hidden = false;

      this.elements.completionArea
        .hidden = true;

      this.updateProgress();

      if (
        this.state.completed
      ) {
        this.renderCompletion();
        return;
      }

      const step =
        this.getCurrentStep();

      if (!step) {
        this.renderConfigurationError(
          "Pas experimental inexistent."
        );
        return;
      }

      clearElement(
        this.elements.stepArea
      );

      const counter =
        createElement(
          "div",
          "experiment-step-counter",
          `Pasul ${
            this.state.currentStep + 1
          } din ${this.steps.length}`
        );

      const title =
        createElement(
          "h3",
          "experiment-step-title",
          step.title ||
            "Pas experimental"
        );

      const instruction =
        createElement(
          "div",
          "experiment-step-instruction",
          step.instruction || ""
        );

      this.elements.stepArea
        .append(
          counter,
          title,
          instruction
        );

      if (
        !this.requirementsSatisfied(
          step
        )
      ) {
        this.elements.stepArea
          .appendChild(
            createElement(
              "div",
              "experiment-step-locked",
              "Finalizează pașii anteriori înainte de a continua."
            )
          );

        this.updateNavigation(
          step
        );

        return;
      }

      switch (step.type) {
        case "action":
          this.renderAction(step);
          break;

        case "measurement":
          this.renderMeasurement(
            step
          );
          break;

        case "record":
          this.renderRecord(step);
          break;

        case "calculation":
          this.renderCalculation(
            step
          );
          break;

        case "comparison":
          this.renderComparison(
            step
          );
          break;

        case "choice":
          this.renderChoice(step);
          break;

        case "conclusion":
          this.renderConclusion(
            step
          );
          break;

        default:
          this.renderConfigurationError(
            `Tip de pas necunoscut: "${step.type}".`
          );
      }

      this.updateNavigation(
        step
      );
    }

    /* =======================================================
       ACTION
       ======================================================= */

    renderAction(step) {
      const box =
        createElement(
          "div",
          "experiment-action"
        );

      if (
        this.isStepCompleted(
          step.id
        )
      ) {
        box.appendChild(
          createElement(
            "div",
            "experiment-success",
            "✓ Acțiune realizată."
          )
        );

        this.elements.stepArea
          .appendChild(box);

        return;
      }

      const button =
        createElement(
          "button",
          "experiment-action-button",
          step.buttonLabel ||
            "Realizează acțiunea"
        );

      button.type =
        "button";

      button.addEventListener(
        "click",
        () => {
          this.state.actions[
            step.id
          ] = {
            action:
              step.action ||
              step.id,

            completedAt:
              new Date()
                .toISOString()
          };

          this.completeStep(
            step.id
          );

          this.emit(
            "action",
            {
              step,
              action:
                step.action ||
                step.id
            }
          );

          this.render();
        }
      );

      box.appendChild(
        button
      );

      this.elements.stepArea
        .appendChild(box);
    }

    /* =======================================================
       INSTRUMENTE
       ======================================================= */

    getInstrumentConfig(type) {
      const instruments =
        this.experiment
          .simulation
          ?.instruments ||
        [];

      return (
        instruments.find(
          (instrument) =>
            instrument.type ===
              type ||
            instrument.id ===
              type
        ) ||
        {}
      );
    }

    normalizeInstrumentConfig(
      config
    ) {
      const result = {
        ...config
      };

      if (
        Array.isArray(
          result.range
        )
      ) {
        result.min =
          result.range[0];

        result.max =
          result.range[1];
      }

      return result;
    }

    /* =======================================================
       CRONOMETRU FĂRĂ ANIMAȚIE
       ======================================================= */

    renderStaticStopwatch(
      container,
      expectedValue,
      step
    ) {
      const box =
        createElement(
          "div",
          "static-stopwatch"
        );

      const display =
        createElement(
          "div",
          "stopwatch-display",
          "00:00.00"
        );

      const controls =
        createElement(
          "div",
          "stopwatch-controls"
        );

      const start =
        createElement(
          "button",
          "stopwatch-start",
          "START"
        );

      const stop =
        createElement(
          "button",
          "stopwatch-stop",
          "STOP"
        );

      start.type = "button";
      stop.type = "button";
      stop.disabled = true;

      let started = false;

      start.addEventListener(
        "click",
        () => {
          started = true;

          start.disabled =
            true;

          stop.disabled =
            false;

          display.textContent =
            "Cronometrul funcționează…";
        }
      );

      stop.addEventListener(
        "click",
        () => {
          if (!started) {
            return;
          }

          const resolution =
            step.resolution ||
            0.01;

          const displayedValue =
            Tools.numbers.quantize(
              expectedValue,
              resolution
            );

          display.textContent =
            `${formatNumber(
              displayedValue,
              2
            )} s`;

          stop.disabled = true;
        }
      );

      controls.append(
        start,
        stop
      );

      box.append(
        display,
        controls
      );

      container.appendChild(
        box
      );
    }

    /* =======================================================
       MEASUREMENT
       ======================================================= */

    renderMeasurement(step) {
      let expectedValue;

      try {
        expectedValue =
          this.resolveValue(
            step.expectedValue ??
            step.expected
          );
      } catch (error) {
        this.renderConfigurationError(
          error.message
        );
        return;
      }

      if (
        !isFiniteNumber(
          expectedValue
        )
      ) {
        this.renderConfigurationError(
          `Pasul "${step.id}" nu produce o valoare numerică validă.`
        );
        return;
      }

      const wrapper =
        createElement(
          "div",
          "experiment-measurement"
        );

      const instrumentArea =
        createElement(
          "div",
          "experiment-instrument-area"
        );

      const answerArea =
        createElement(
          "div",
          "experiment-measurement-answer"
        );

      wrapper.append(
        instrumentArea,
        answerArea
      );

      this.elements.stepArea
        .appendChild(wrapper);

      const instrumentType =
        step.instrument;

      const baseConfig =
        this.getInstrumentConfig(
          instrumentType
        );

      const config =
        this.normalizeInstrumentConfig({
          ...baseConfig,
          ...(step.instrumentOptions ||
            {}),
          value:
            expectedValue
        });

      if (
        instrumentType ===
        "stopwatch"
      ) {
        this.renderStaticStopwatch(
          instrumentArea,
          expectedValue,
          step
        );
      } else {
        try {
          Measurements.create(
            instrumentType,
            instrumentArea,
            config
          );
        } catch (error) {
          this.renderConfigurationError(
            error.message
          );
          return;
        }
      }

      const savedValue =
        this.state
          .measurements[
          step.id
        ];

      if (
        isFiniteNumber(
          savedValue
        )
      ) {
        answerArea.appendChild(
          createElement(
            "div",
            "experiment-success",
            `✓ Ai înregistrat ${formatNumber(
              savedValue,
              step.decimals ?? 2
            )} ${step.unit || ""}.`
          )
        );

        return;
      }

      answerArea.appendChild(
        createElement(
          "div",
          "experiment-notebook-reminder",
          step.notebookInstruction ||
            "Citește instrumentul, notează valoarea în caiet, apoi introdu valoarea mai jos."
        )
      );

      const reading =
        Measurements
          .createReadingInput(
            answerArea,
            {
              label:
                step.inputLabel ||
                "Valoarea citită",

              unit:
                step.unit ||
                baseConfig.unit ||
                "",

              expectedValue,

              resolution:
                step.resolution ??
                baseConfig.resolution ??
                0,

              absoluteTolerance:
                step.absoluteTolerance ??
                0,

              relativeTolerance:
                step.relativeTolerance ??
                0,

              maxAttempts:
                step.maxAttempts ||
                this.options
                  .maximumAttempts,

              hint:
                step.hint ||
                "Verifică din nou scala instrumentului.",

              onCorrect:
                (result) => {
                  this.state
                    .measurements[
                    step.id
                  ] =
                    result.studentValue;

                  this.state
                    .answers[
                    step.id
                  ] =
                    result.studentValue;

                  this.completeStep(
                    step.id
                  );

                  this.emit(
                    "measurement",
                    {
                      step,
                      value:
                        result.studentValue
                    }
                  );

                  this.updateNavigation(
                    step
                  );
                }
            }
          );

      if (
        reading &&
        reading.input
      ) {
        reading.input.focus();
      }
    }

    /* =======================================================
       TABEL
       ======================================================= */

    getTableDefinition(step) {
      return (
        step.table ||
        this.experiment
          .dataTable ||
        null
      );
    }

    renderTable(step) {
      const definition =
        this.getTableDefinition(
          step
        );

      if (
        !definition ||
        !Array.isArray(
          definition.columns
        )
      ) {
        return null;
      }

      const tableId =
        step.tableId ||
        step.id;

      if (
        !this.state.tables[
          tableId
        ]
      ) {
        this.state.tables[
          tableId
        ] = {};
      }

      const wrapper =
        createElement(
          "div",
          "experiment-table-wrapper"
        );

      const table =
        createElement(
          "table",
          "experiment-data-table"
        );

      const thead =
        document.createElement(
          "thead"
        );

      const headerRow =
        document.createElement(
          "tr"
        );

      definition.columns
        .forEach(
          (column) => {
            const th =
              document.createElement(
                "th"
              );

            th.scope = "col";

            th.textContent =
              column.unit
                ? `${column.label} (${column.unit})`
                : column.label;

            headerRow.appendChild(
              th
            );
          }
        );

      thead.appendChild(
        headerRow
      );

      const tbody =
        document.createElement(
          "tbody"
        );

      const rowCount =
        step.rows ||
        definition.suggestedRows ||
        this.data
          .labDefaults
          ?.minimumRepeats ||
        1;

      for (
        let rowIndex = 0;
        rowIndex < rowCount;
        rowIndex += 1
      ) {
        const row =
          document.createElement(
            "tr"
          );

        definition.columns
          .forEach(
            (column) => {
              const cell =
                document.createElement(
                  "td"
                );

              if (
                column.key ===
                  "trial" ||
                column.autoIndex
              ) {
                cell.textContent =
                  String(
                    rowIndex + 1
                  );

                row.appendChild(
                  cell
                );

                return;
              }

              const input =
                document.createElement(
                  "input"
                );

              const isText =
                column.inputType ===
                  "text" ||
                column.key ===
                  "surface";

              input.type =
                "text";

              input.inputMode =
                isText
                  ? "text"
                  : "decimal";

              input.autocomplete =
                "off";

              input.className =
                "experiment-table-input";

              const cellKey =
                `${rowIndex}:${column.key}`;

              input.value =
                this.state.tables[
                  tableId
                ][cellKey] ||
                "";

              input.setAttribute(
                "aria-label",
                `${column.label}, rândul ${
                  rowIndex + 1
                }`
              );

              input.addEventListener(
                "input",
                () => {
                  this.state.tables[
                    tableId
                  ][cellKey] =
                    input.value.trim();

                  this.saveState();
                }
              );

              cell.appendChild(
                input
              );

              row.appendChild(
                cell
              );
            }
          );

        tbody.appendChild(
          row
        );
      }

      table.append(
        thead,
        tbody
      );

      wrapper.appendChild(
        table
      );

      return wrapper;
    }

    tableIsComplete(step) {
      const definition =
        this.getTableDefinition(
          step
        );

      if (!definition) {
        return true;
      }

      const tableId =
        step.tableId ||
        step.id;

      const stored =
        this.state.tables[
          tableId
        ] ||
        {};

      const rowCount =
        step.rows ||
        definition.suggestedRows ||
        this.data
          .labDefaults
          ?.minimumRepeats ||
        1;

      for (
        let rowIndex = 0;
        rowIndex < rowCount;
        rowIndex += 1
      ) {
        for (
          const column of
          definition.columns
        ) {
          if (
            column.key ===
              "trial" ||
            column.autoIndex
          ) {
            continue;
          }

          const key =
            `${rowIndex}:${column.key}`;

          if (
            stored[key] ===
              undefined ||
            String(
              stored[key]
            ).trim() === ""
          ) {
            return false;
          }
        }
      }

      return true;
    }

    /* =======================================================
       RECORD
       ======================================================= */

    renderRecord(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-record"
        );

      wrapper.appendChild(
        createElement(
          "div",
          "experiment-notebook-reminder",
          step.notebookInstruction ||
            "Completează tabelul folosind valorile notate în caiet."
        )
      );

      const table =
        this.renderTable(step);

      if (table) {
        wrapper.appendChild(
          table
        );
      }

      if (
        this.isStepCompleted(
          step.id
        )
      ) {
        wrapper.appendChild(
          createElement(
            "div",
            "experiment-success",
            "✓ Tabel completat."
          )
        );

        this.elements.stepArea
          .appendChild(wrapper);

        return;
      }

      const feedback =
        createElement(
          "div",
          "experiment-feedback"
        );

      const button =
        createElement(
          "button",
          "experiment-action-button",
          step.buttonLabel ||
            "Am completat tabelul"
        );

      button.type =
        "button";

      button.addEventListener(
        "click",
        () => {
          if (
            !this.tableIsComplete(
              step
            )
          ) {
            feedback.textContent =
              "Completează toate căsuțele tabelului.";

            feedback.className =
              "experiment-feedback is-hint";

            return;
          }

          this.completeStep(
            step.id
          );

          this.render();
        }
      );

      wrapper.append(
        button,
        feedback
      );

      this.elements.stepArea
        .appendChild(wrapper);
    }

    /* =======================================================
       CALCULATION
       ======================================================= */

    renderCalculation(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-calculation"
        );

      const savedValue =
        this.state
          .calculations[
          step.id
        ];

      if (
        isFiniteNumber(
          savedValue
        )
      ) {
        wrapper.appendChild(
          createElement(
            "div",
            "experiment-success",
            `✓ Rezultat: ${formatNumber(
              savedValue,
              step.decimals ?? 2
            )} ${step.unit || ""}`
          )
        );

        this.elements.stepArea
          .appendChild(wrapper);

        return;
      }

      let expectedValue;

      try {
        expectedValue =
          this.resolveValue(
            step.expectedValue ??
            step.expected
          );
      } catch (error) {
        this.renderConfigurationError(
          error.message
        );
        return;
      }

      if (
        !isFiniteNumber(
          expectedValue
        )
      ) {
        this.renderConfigurationError(
          `Rezultatul pentru pasul "${step.id}" nu este numeric.`
        );
        return;
      }

      wrapper.appendChild(
        createElement(
          "div",
          "experiment-notebook-reminder",
          step.notebookInstruction ||
            "Efectuează calculul în caiet, apoi introdu rezultatul."
        )
      );

      const row =
        createElement(
          "div",
          "experiment-answer-row"
        );

      const input =
        document.createElement(
          "input"
        );

      input.type = "text";
      input.inputMode =
        "decimal";
      input.autocomplete =
        "off";
      input.className =
        "experiment-answer-input";

      const unit =
        createElement(
          "span",
          "experiment-answer-unit",
          step.unit || ""
        );

      const button =
        createElement(
          "button",
          "experiment-check-button",
          "Verifică"
        );

      button.type =
        "button";

      const feedback =
        createElement(
          "div",
          "experiment-feedback"
        );

      let attempts = 0;

      const check = () => {
        const result =
          Tools.measurement
            .checkCalculation({
              studentValue:
                input.value,

              expectedValue,

              relativeTolerance:
                step.relativeTolerance ??
                this.options
                  .calculationTolerance,

              absoluteTolerance:
                step.absoluteTolerance ??
                0
            });

        if (!result.valid) {
          feedback.textContent =
            "Introdu un număr valid.";

          feedback.className =
            "experiment-feedback is-error";

          return;
        }

        attempts += 1;

        if (result.accepted) {
          this.state
            .calculations[
            step.id
          ] =
            result.studentValue;

          this.state
            .answers[
            step.id
          ] =
            result.studentValue;

          this.completeStep(
            step.id
          );

          input.disabled = true;
          button.disabled = true;

          feedback.textContent =
            "✓ Calcul corect.";

          feedback.className =
            "experiment-feedback is-correct";

          this.updateNavigation(
            step
          );

          return;
        }

        feedback.textContent =
          step.hint ||
          (
            attempts >= 2
              ? "Verifică formula, unitățile și calculele."
              : "Rezultatul nu este încă în limitele acceptate."
          );

        feedback.className =
          "experiment-feedback is-hint";
      };

      button.addEventListener(
        "click",
        check
      );

      input.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key ===
            "Enter"
          ) {
            check();
          }
        }
      );

      row.append(
        input,
        unit,
        button
      );

      wrapper.append(
        row,
        feedback
      );

      this.elements.stepArea
        .appendChild(wrapper);
    }

    /* =======================================================
       COMPARISON
       ======================================================= */

    renderComparison(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-comparison"
        );

      let measured = null;
      let calculated = null;

      if (
        step.measuredSource
      ) {
        measured =
          this.state
            .measurements[
            step.measuredSource
          ];
      }

      if (
        step.calculatedSource
      ) {
        calculated =
          this.state
            .calculations[
            step.calculatedSource
          ];
      }

      if (
        isFiniteNumber(
          measured
        ) &&
        isFiniteNumber(
          calculated
        )
      ) {
        const grid =
          createElement(
            "div",
            "comparison-grid"
          );

        const measuredBox =
          createElement(
            "div",
            "comparison-value"
          );

        measuredBox.innerHTML =
          "<strong>Valoare măsurată</strong><br>" +
          `${escapeHtml(
            formatNumber(
              measured,
              step.decimals ?? 2
            )
          )} ${escapeHtml(
            step.unit || ""
          )}`;

        const calculatedBox =
          createElement(
            "div",
            "comparison-value"
          );

        calculatedBox.innerHTML =
          "<strong>Valoare calculată</strong><br>" +
          `${escapeHtml(
            formatNumber(
              calculated,
              step.decimals ?? 2
            )
          )} ${escapeHtml(
            step.unit || ""
          )}`;

        grid.append(
          measuredBox,
          calculatedBox
        );

        wrapper.appendChild(
          grid
        );
      }

      const saved =
        this.state
          .comparisons[
          step.id
        ];

      if (saved) {
        const result =
          createElement(
            "div",
            "experiment-success"
          );

        result.innerHTML =
          "<strong>Interpretarea ta:</strong><br>" +
          escapeHtml(saved);

        wrapper.appendChild(
          result
        );

        this.elements.stepArea
          .appendChild(wrapper);

        return;
      }

      const question =
        createElement(
          "p",
          "comparison-question",
          step.question ||
            "Compară rezultatele și explică observația."
        );

      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.className =
        "experiment-interpretation";

      textarea.rows =
        step.rows || 4;

      textarea.placeholder =
        "Scrie observația ta...";

      const feedback =
        createElement(
          "div",
          "experiment-feedback"
        );

      const button =
        createElement(
          "button",
          "experiment-action-button",
          step.buttonLabel ||
            "Salvează comparația"
        );

      button.type =
        "button";

      button.addEventListener(
        "click",
        () => {
          const text =
            textarea.value.trim();

          const minimum =
            step.minimumLength ||
            this.options
              .minimumComparisonLength;

          if (
            text.length <
            minimum
          ) {
            feedback.textContent =
              `Scrie cel puțin ${minimum} caractere.`;

            feedback.className =
              "experiment-feedback is-hint";

            return;
          }

          this.state
            .comparisons[
            step.id
          ] = text;

          this.state
            .answers[
            step.id
          ] = text;

          this.completeStep(
            step.id
          );

          this.render();
        }
      );

      wrapper.append(
        question,
        textarea,
        button,
        feedback
      );

      this.elements.stepArea
        .appendChild(wrapper);
    }

    /* =======================================================
       CHOICE
       ======================================================= */

    renderChoice(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-choice"
        );

      wrapper.appendChild(
        createElement(
          "p",
          "experiment-question",
          step.question || ""
        )
      );

      if (
        this.isStepCompleted(
          step.id
        )
      ) {
        wrapper.appendChild(
          createElement(
            "div",
            "experiment-success",
            "✓ Răspuns corect."
          )
        );

        this.elements.stepArea
          .appendChild(wrapper);

        return;
      }

      const feedback =
        createElement(
          "div",
          "experiment-feedback"
        );

      (
        step.options ||
        []
      ).forEach(
        (option, index) => {
          const button =
            createElement(
              "button",
              "experiment-choice-button",
              option
            );

          button.type =
            "button";

          button.addEventListener(
            "click",
            () => {
              if (
                index ===
                step.correctAnswer
              ) {
                this.state
                  .choices[
                  step.id
                ] = index;

                this.state
                  .answers[
                  step.id
                ] = index;

                this.completeStep(
                  step.id
                );

                feedback.textContent =
                  step.feedbackCorrect ||
                  "✓ Corect.";

                feedback.className =
                  "experiment-feedback is-correct";

                wrapper
                  .querySelectorAll(
                    "button"
                  )
                  .forEach(
                    (item) => {
                      item.disabled =
                        true;
                    }
                  );

                this.updateNavigation(
                  step
                );
              } else {
                feedback.textContent =
                  step.feedbackWrong ||
                  step.hint ||
                  "Analizează din nou rezultatele experimentului.";

                feedback.className =
                  "experiment-feedback is-hint";
              }
            }
          );

          wrapper.appendChild(
            button
          );
        }
      );

      wrapper.appendChild(
        feedback
      );

      this.elements.stepArea
        .appendChild(wrapper);
    }

    /* =======================================================
       CONCLUSION
       ======================================================= */

    renderConclusion(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-conclusion"
        );

      const saved =
        this.state
          .conclusions[
          step.id
        ];

      if (saved) {
        const result =
          createElement(
            "div",
            "experiment-conclusion-saved"
          );

        result.innerHTML =
          "<strong>Concluzia ta:</strong><br>" +
          escapeHtml(saved);

        wrapper.appendChild(
          result
        );

        this.elements.stepArea
          .appendChild(wrapper);

        return;
      }

      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.className =
        "experiment-conclusion-input";

      textarea.rows =
        step.rows || 5;

      textarea.placeholder =
        "Scrie concluzia în 2–3 enunțuri...";

      const feedback =
        createElement(
          "div",
          "experiment-feedback"
        );

      const button =
        createElement(
          "button",
          "experiment-action-button",
          step.buttonLabel ||
            "Salvează concluzia"
        );

      button.type =
        "button";

      button.addEventListener(
        "click",
        () => {
          const text =
            textarea.value.trim();

          const minimum =
            step.minimumLength ||
            this.options
              .minimumConclusionLength;

          if (
            text.length <
            minimum
          ) {
            feedback.textContent =
              `Scrie cel puțin ${minimum} caractere.`;

            feedback.className =
              "experiment-feedback is-hint";

            return;
          }

          this.state
            .conclusions[
            step.id
          ] = text;

          this.state
            .answers[
            step.id
          ] = text;

          this.completeStep(
            step.id
          );

          this.render();
        }
      );

      wrapper.append(
        textarea,
        button,
        feedback
      );

      this.elements.stepArea
        .appendChild(wrapper);
    }

    /* =======================================================
       NAVIGARE
       ======================================================= */

    previousStep() {
      if (
        this.state.currentStep ===
        0
      ) {
        return;
      }

      this.state.currentStep -=
        1;

      this.saveState();
      this.render();
      this.scrollToExperiment();
    }

    nextStep() {
      const step =
        this.getCurrentStep();

      if (
        !step ||
        !this.isStepCompleted(
          step.id
        )
      ) {
        return;
      }

      if (
        this.state.currentStep ===
        this.steps.length - 1
      ) {
        this.finishExperiment();
        return;
      }

      this.state.currentStep +=
        1;

      this.saveState();
      this.render();
      this.scrollToExperiment();
    }

    updateNavigation(step) {
      const allowBack =
        this.defaults
          .navigation
          ?.allowBack !==
        false;

      this.elements
        .previousButton
        .hidden =
        !allowBack;

      this.elements
        .previousButton
        .disabled =
        this.state.currentStep ===
        0;

      this.elements
        .nextButton
        .disabled =
        !this.isStepCompleted(
          step.id
        );

      this.elements
        .nextButton
        .textContent =
        this.state.currentStep ===
        this.steps.length - 1
          ? "Finalizează experimentul"
          : "Pasul următor →";
    }

    /* =======================================================
       PROGRES
       ======================================================= */

    updateProgress() {
      const completed =
        this.state
          .completedSteps
          .length;

      const total =
        this.steps.length;

      const percentage =
        total > 0
          ? Math.round(
              Tools.progress
                .calculateProgress(
                  completed,
                  total
                )
            )
          : 0;

      if (
        this.elements
          .progressText
      ) {
        this.elements
          .progressText
          .textContent =
          `${completed} din ${total} pași realizați`;
      }

      if (
        this.elements
          .progressBar
      ) {
        this.elements
          .progressBar
          .style.width =
          `${percentage}%`;
      }

      if (
        this.elements
          .progressTrack
      ) {
        this.elements
          .progressTrack
          .setAttribute(
            "aria-valuenow",
            String(percentage)
          );
      }
    }

    /* =======================================================
       FINALIZARE EXPERIMENT
       ======================================================= */

    finishExperiment() {
      const allCompleted =
        this.steps.every(
          (step) =>
            this.isStepCompleted(
              step.id
            )
        );

      if (!allCompleted) {
        return;
      }

      this.state.completed =
        true;

      if (
        !this.state.session
          .finishedAt
      ) {
        this.state.session
          .finishedAt =
          new Date()
            .toISOString();
      }

      this.saveState();

      this.emit(
        "complete",
        {
          state:
            deepClone(
              this.state
            )
        }
      );

      this.renderCompletion();
    }

    /* =======================================================
       IDENTITATE ELEV
       ======================================================= */

    createStudentForm() {
      const profile =
        loadStudentProfile();

      const wrapper =
        createElement(
          "div",
          "experiment-student-form"
        );

      const heading =
        createElement(
          "h4",
          "",
          "Datele elevului"
        );

      const nameLabel =
        document.createElement(
          "label"
        );

      nameLabel.textContent =
        "Nume și prenume";

      const nameInput =
        document.createElement(
          "input"
        );

      nameInput.type =
        "text";

      nameInput.autocomplete =
        "name";

      nameInput.className =
        "experiment-student-name";

      nameInput.value =
        profile.name;

      nameInput.placeholder =
        "Ex.: Popescu Andrei";

      nameLabel.appendChild(
        nameInput
      );

      const classLabel =
        document.createElement(
          "label"
        );

      classLabel.textContent =
        "Clasa";

      const classSelect =
        document.createElement(
          "select"
        );

      classSelect.className =
        "experiment-student-class";

      const classOptions =
        this.reporting
          .classOptions ||
        [
          {
            value: "",
            label: "Alege clasa"
          },
          {
            value: "9 A",
            label: "IX A"
          },
          {
            value: "9 B",
            label: "IX B"
          },
          {
            value: "9 C",
            label: "IX C"
          },
          {
            value: "9 D",
            label: "IX D"
          }
        ];

      classOptions.forEach(
        (item) => {
          const option =
            document.createElement(
              "option"
            );

          if (
            typeof item ===
            "string"
          ) {
            option.value = item;
            option.textContent =
              item;
          } else {
            option.value =
              item.value;

            option.textContent =
              item.label;
          }

          classSelect.appendChild(
            option
          );
        }
      );

      if (
        profile.className
      ) {
        classSelect.value =
          profile.className;
      }

      classLabel.appendChild(
        classSelect
      );

      wrapper.append(
        heading,
        nameLabel,
        classLabel
      );

      return {
        wrapper,
        nameInput,
        classSelect
      };
    }

    validateStudentData(
      name,
      className
    ) {
      const cleanName =
        String(name || "")
          .trim()
          .replace(/\s+/g, " ");

      const cleanClass =
        String(
          className || ""
        ).trim();

      if (
        cleanName.length < 3
      ) {
        return {
          valid: false,
          message:
            "Completează numele și prenumele."
        };
      }

      if (!cleanClass) {
        return {
          valid: false,
          message:
            "Selectează clasa."
        };
      }

      return {
        valid: true,

        student: {
          name:
            cleanName,

          className:
            cleanClass
        }
      };
    }

    /* =======================================================
       PAYLOAD GOOGLE SHEETS
       ======================================================= */

    getMainConclusion() {
      const values =
        Object.values(
          this.state.conclusions
        );

      return values.length
        ? values[
            values.length - 1
          ]
        : "";
    }

    getUnitTitle() {
      if (
        this.experiment.unitTitle
      ) {
        return this.experiment
          .unitTitle;
      }

      return (
        this.experiment.unitId ||
        ""
      );
    }

    buildSubmissionPayload(
      student
    ) {
      const duration =
        durationSeconds(
          this.state.session
            .startedAt,

          this.state.session
            .finishedAt
        );

      return {
        schemaVersion:
          "2.0.0",

        reportId:
          this.state.submission
            .reportId,

        revision:
          this.state.submission
            .revision + 1,

        student: {
          name:
            student.name,

          className:
            student.className
        },

        experiment: {
          id:
            this.experimentId,

          title:
            this.experiment
              .officialTitle ||
            this.experiment.title ||
            this.experimentId,

          classLevel:
            "9",

          domain:
            this.getUnitTitle(),

          totalSteps:
            this.steps.length,

          dataSetId:
            this.state.submission
              .datasetId
        },

        session: {
          sessionId:
            this.state.session
              .sessionId,

          startedAt:
            this.state.session
              .startedAt,

          finishedAt:
            this.state.session
              .finishedAt,

          durationSeconds:
            duration,

          totalSteps:
            this.steps.length,

          completed:
            this.state.completed
        },

        measurements:
          deepClone(
            this.state
              .measurements
          ),

        calculations:
          deepClone(
            this.state
              .calculations
          ),

        comparison:
          deepClone(
            this.state
              .comparisons
          ),

        conclusions:
          deepClone(
            this.state
              .conclusions
          ),

        completedSteps:
          deepClone(
            this.state
              .completedSteps
          ),

        totalSteps:
          this.steps.length,

        completed:
          this.state.completed,

        evaluation: {
          score: null,
          maximumScore: null,
          percent: null,
          passed: null,

          conclusion:
            this.getMainConclusion()
        },

        dataset: {
          id:
            this.state.submission
              .datasetId
        },

        application: {
          pageUrl:
            window.location.href,

          engineVersion:
            ENGINE_VERSION
        }
      };
    }

    /* =======================================================
       TRIMITERE GOOGLE APPS SCRIPT
       ======================================================= */

    async submitResults(
      student,
      isResubmission = false
    ) {
      if (!this.appScriptUrl) {
        throw new Error(
          "URL-ul Web App Google Apps Script nu este configurat."
        );
      }

      const payload =
        this.buildSubmissionPayload(
          student
        );

      const controller =
        typeof AbortController !==
        "undefined"
          ? new AbortController()
          : null;

      let timeoutId = null;

      if (controller) {
        timeoutId =
          window.setTimeout(
            () =>
              controller.abort(),
            this.options
              .submissionTimeoutMs
          );
      }

      try {
        const body =
          new URLSearchParams();

        body.set(
          "payload",
          JSON.stringify(payload)
        );

        const response =
          await fetch(
            this.appScriptUrl,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded;charset=UTF-8"
              },

              body:
                body.toString(),

              redirect:
                "follow",

              signal:
                controller
                  ? controller.signal
                  : undefined
            }
          );

        const text =
          await response.text();

        let result;

        try {
          result =
            JSON.parse(text);
        } catch (error) {
          throw new Error(
            "Serverul nu a returnat un răspuns JSON valid. Verifică implementarea Web App."
          );
        }

        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result.error ||
            result.message ||
            "Rezultatele nu au putut fi trimise."
          );
        }

        this.state.submission
          .submitted = true;

        this.state.submission
          .revision =
          Number(
            result.revision ||
            payload.revision
          );

        this.state.submission
          .lastSubmittedAt =
          result.serverTime ||
          new Date()
            .toISOString();

        this.state.submission
          .lastServerMessage =
          result.message ||
          (
            isResubmission
              ? "Rezultatele au fost actualizate."
              : "Rezultatele au fost înregistrate."
          );

        this.state.submission
          .lastStatus =
          "success";

        saveStudentProfile(
          student
        );

        this.saveState();

        this.emit(
          isResubmission
            ? "resubmit"
            : "submit",
          {
            result,
            payload
          }
        );

        return result;
      } catch (error) {
        this.state.submission
          .lastStatus =
          "error";

        this.state.submission
          .lastServerMessage =
          error.name ===
          "AbortError"
            ? "Trimiterea a durat prea mult. Verifică conexiunea la internet."
            : error.message;

        this.saveState();

        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(
            timeoutId
          );
        }
      }
    }

    /* =======================================================
       RAPORT FINAL
       ======================================================= */

    renderCompletion() {
      this.elements.stepArea
        .hidden = true;

      this.elements.navigation
        .hidden = true;

      this.elements.completionArea
        .hidden = false;

      clearElement(
        this.elements
          .completionArea
      );

      const card =
        createElement(
          "div",
          "experiment-final-card"
        );

      const title =
        createElement(
          "h3",
          "experiment-final-title",
          "Experiment finalizat ✓"
        );

      const summary =
        createElement(
          "p",
          "experiment-final-text",
          "Ai parcurs toate etapele experimentului. Completează datele tale, apoi poți trimite rezultatele profesorului și salva raportul în format PDF."
        );

      card.append(
        title,
        summary
      );

      /* ---------- DATE ELEV ---------- */

      const studentForm =
        this.createStudentForm();

      card.appendChild(
        studentForm.wrapper
      );

      /* ---------- STARE TRIMITERE ---------- */

      const status =
        createElement(
          "div",
          "experiment-submission-status"
        );

      status.setAttribute(
        "aria-live",
        "polite"
      );

      if (
        this.state.submission
          .submitted
      ) {
        status.className =
          "experiment-submission-status is-success";

        status.textContent =
          `✓ ${
            this.state.submission
              .lastServerMessage ||
            "Rezultatele au fost înregistrate."
          }`;
      }

      card.appendChild(
        status
      );

      /* ---------- BUTOANE ---------- */

      const actions =
        createElement(
          "div",
          "experiment-final-actions"
        );

      const sendButton =
        createElement(
          "button",
          "experiment-submit-button",
          "Trimite rezultatele"
        );

      sendButton.type =
        "button";

      /*
       * După prima trimitere butonul principal
       * nu mai este necesar.
       */
      sendButton.hidden =
        this.state.submission
          .submitted;

      const resendButton =
        createElement(
          "button",
          "experiment-resubmit-button",
          "Retrimite rezultatele"
        );

      resendButton.type =
        "button";

      resendButton.hidden =
        !this.state.submission
          .submitted;

      const pdfButton =
        createElement(
          "button",
          "experiment-pdf-button",
          "Descarcă PDF"
        );

      pdfButton.type =
        "button";

      const restartButton =
        createElement(
          "button",
          "experiment-restart-button",
          "Reia experimentul cu alte valori"
        );

      restartButton.type =
        "button";

      const validateIdentity =
        () => {
          const result =
            this.validateStudentData(
              studentForm
                .nameInput.value,

              studentForm
                .classSelect.value
            );

          if (!result.valid) {
            status.textContent =
              result.message;

            status.className =
              "experiment-submission-status is-error";

            return null;
          }

          return result.student;
        };

      /* ---------- TRIMITE ---------- */

      sendButton.addEventListener(
        "click",
        async () => {
          const student =
            validateIdentity();

          if (!student) {
            return;
          }

          sendButton.disabled =
            true;

          status.textContent =
            "Se trimit rezultatele…";

          status.className =
            "experiment-submission-status is-pending";

          try {
            const result =
              await this.submitResults(
                student,
                false
              );

            status.textContent =
              "✓ " +
              (
                result.message ||
                "Rezultatele au fost înregistrate."
              );

            status.className =
              "experiment-submission-status is-success";

            sendButton.hidden =
              true;

            resendButton.hidden =
              false;
          } catch (error) {
            status.textContent =
              "Trimiterea nu a reușit. " +
              (
                this.state
                  .submission
                  .lastServerMessage ||
                error.message
              ) +
              " Rezultatele sunt păstrate pe acest dispozitiv.";

            status.className =
              "experiment-submission-status is-error";

            sendButton.disabled =
              false;
          }
        }
      );

      /* ---------- RETRIMITE ---------- */

      resendButton.addEventListener(
        "click",
        async () => {
          const student =
            validateIdentity();

          if (!student) {
            return;
          }

          resendButton.disabled =
            true;

          status.textContent =
            "Se retrimit rezultatele…";

          status.className =
            "experiment-submission-status is-pending";

          try {
            const result =
              await this.submitResults(
                student,
                true
              );

            status.textContent =
              "✓ " +
              (
                result.message ||
                "Rezultatele au fost actualizate."
              ) +
              ` Revizia ${this.state.submission.revision}.`;

            status.className =
              "experiment-submission-status is-success";
          } catch (error) {
            status.textContent =
              "Retrimiterea nu a reușit. " +
              (
                this.state
                  .submission
                  .lastServerMessage ||
                error.message
              );

            status.className =
              "experiment-submission-status is-error";
          } finally {
            resendButton.disabled =
              false;
          }
        }
      );

      /* ---------- PDF ---------- */

      pdfButton.addEventListener(
        "click",
        () => {
          const student =
            validateIdentity();

          if (!student) {
            return;
          }

          saveStudentProfile(
            student
          );

          this.printPdfReport(
            student
          );
        }
      );

      /* ---------- RESTART ---------- */

      restartButton.addEventListener(
        "click",
        () => {
          this.restartWithNewData();
        }
      );

      actions.append(
        sendButton,
        resendButton,
        pdfButton,
        restartButton
      );

      card.appendChild(
        actions
      );

      /* ---------- INFORMAȚII RAPORT ---------- */

      const metadata =
        createElement(
          "div",
          "experiment-report-metadata"
        );

      metadata.innerHTML =
        `<small>` +
        `ID raport: ${escapeHtml(
          this.state.submission
            .reportId
        )}` +
        `<br>` +
        `Revizie: ${escapeHtml(
          this.state.submission
            .revision
        )}` +
        `</small>`;

      card.appendChild(
        metadata
      );

      this.elements
        .completionArea
        .appendChild(card);

      this.updateProgress();
    }

    /* =======================================================
       PDF / RAPORT IMPRIMABIL
       ======================================================= */

    getStepTitle(stepId) {
      const step =
        this.steps.find(
          (item) =>
            item.id === stepId
        );

      return step
        ? (
            step.title ||
            step.id
          )
        : stepId;
    }

    createKeyValueRows(
      data,
      includeUnits = true
    ) {
      return Object.entries(
        data || {}
      )
        .map(
          ([key, value]) => {
            const step =
              this.steps.find(
                (item) =>
                  item.id === key
              );

            const title =
              step
                ? (
                    step.title ||
                    key
                  )
                : key;

            const unit =
              includeUnits &&
              step &&
              step.unit
                ? ` ${step.unit}`
                : "";

            const formatted =
              typeof value ===
              "number"
                ? formatNumber(
                    value,
                    4
                  )
                : String(
                    value ?? ""
                  );

            return (
              "<tr>" +
              `<td>${escapeHtml(
                title
              )}</td>` +
              `<td>${escapeHtml(
                formatted
              )}${escapeHtml(
                unit
              )}</td>` +
              "</tr>"
            );
          }
        )
        .join("");
    }

    createComparisonHtml() {
      const entries =
        Object.entries(
          this.state.comparisons
        );

      if (!entries.length) {
        return (
          "<p>Nu au fost introduse comparații.</p>"
        );
      }

      return entries
        .map(
          ([key, value]) =>
            `<p><strong>${escapeHtml(
              this.getStepTitle(
                key
              )
            )}</strong><br>` +
            `${escapeHtml(
              value
            )}</p>`
        )
        .join("");
    }

    createConclusionHtml() {
      const entries =
        Object.entries(
          this.state.conclusions
        );

      if (!entries.length) {
        return (
          "<p>Nu a fost introdusă o concluzie.</p>"
        );
      }

      return entries
        .map(
          ([key, value]) =>
            `<p>${escapeHtml(
              value
            )}</p>`
        )
        .join("");
    }

    createTablesHtml() {
      const tableEntries =
        Object.entries(
          this.state.tables
        );

      if (!tableEntries.length) {
        return "";
      }

      return tableEntries
        .map(
          ([tableId, values]) => {
            const rows =
              Object.entries(values)
                .map(
                  ([key, value]) =>
                    "<tr>" +
                    `<td>${escapeHtml(
                      key
                    )}</td>` +
                    `<td>${escapeHtml(
                      value
                    )}</td>` +
                    "</tr>"
                )
                .join("");

            return (
              `<h3>${escapeHtml(
                tableId
              )}</h3>` +
              `<table>` +
              `<thead>` +
              `<tr>` +
              `<th>Câmp</th>` +
              `<th>Valoare</th>` +
              `</tr>` +
              `</thead>` +
              `<tbody>${rows}</tbody>` +
              `</table>`
            );
          }
        )
        .join("");
    }

    printPdfReport(student) {
      const reportWindow =
        window.open(
          "",
          "_blank"
        );

      if (!reportWindow) {
        window.alert(
          "Browserul a blocat fereastra raportului. Permite ferestrele pop-up pentru această pagină."
        );
        return;
      }

      const finishedAt =
        this.state.session
          .finishedAt ||
        new Date()
          .toISOString();

      const date =
        new Date(
          finishedAt
        );

      const localDate =
        Number.isNaN(
          date.getTime()
        )
          ? ""
          : date.toLocaleString(
              "ro-RO"
            );

      const measurementRows =
        this.createKeyValueRows(
          this.state.measurements
        );

      const calculationRows =
        this.createKeyValueRows(
          this.state.calculations
        );

      const tablesHtml =
        this.createTablesHtml();

      const comparisonsHtml =
        this.createComparisonHtml();

      const conclusionsHtml =
        this.createConclusionHtml();

      const reportId =
        this.state.submission
          .reportId;

      const revision =
        this.state.submission
          .revision;

      reportWindow.document.open();

      reportWindow.document.write(`
<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<title>Raport ${escapeHtml(this.experimentId)}</title>

<style>
  @page {
    size: A4;
    margin: 16mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    color: #111827;
    font-family:
      Arial,
      Helvetica,
      sans-serif;
    font-size: 11pt;
    line-height: 1.45;
  }

  h1 {
    margin: 0 0 6px;
    font-size: 20pt;
    color: #1d4ed8;
  }

  h2 {
    margin-top: 24px;
    padding-bottom: 5px;
    border-bottom: 1px solid #cbd5e1;
    font-size: 14pt;
  }

  h3 {
    font-size: 12pt;
  }

  .meta {
    margin: 16px 0;
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
  }

  .meta p {
    margin: 3px 0;
  }

  table {
    width: 100%;
    margin: 10px 0 18px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 7px 8px;
    border: 1px solid #94a3b8;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #e2e8f0;
  }

  .footer {
    margin-top: 32px;
    padding-top: 10px;
    border-top: 1px solid #cbd5e1;
    color: #475569;
    font-size: 9pt;
  }

  .print-note {
    margin-bottom: 15px;
    padding: 10px;
    background: #fef3c7;
    border: 1px solid #f59e0b;
  }

  @media print {
    .print-note {
      display: none;
    }
  }
</style>
</head>

<body>

<div class="print-note">
  Pentru salvare în format PDF alege
  <strong>Salvare ca PDF / Save as PDF</strong>
  în dialogul de imprimare.
</div>

<h1>
  ${escapeHtml(
    this.experiment
      .officialTitle ||
    this.experimentId
  )}
</h1>

<p>
  <strong>Fizică – clasa a IX-a</strong>
</p>

<div class="meta">

  <p>
    <strong>Elev:</strong>
    ${escapeHtml(student.name)}
  </p>

  <p>
    <strong>Clasa:</strong>
    ${escapeHtml(student.className)}
  </p>

  <p>
    <strong>Data:</strong>
    ${escapeHtml(localDate)}
  </p>

  <p>
    <strong>Experiment:</strong>
    ${escapeHtml(this.experimentId)}
  </p>

  <p>
    <strong>Prof. Dănuț Andronie</strong>
  </p>

  <p>
    e-Mail: danutmg@gmail.com
  </p>

</div>

<h2>Scopul lucrării</h2>

<p>
  ${escapeHtml(
    this.experiment.objective ||
    ""
  )}
</p>

<h2>Rezultate experimentale</h2>

<table>
  <thead>
    <tr>
      <th>Mărime / măsurare</th>
      <th>Valoare</th>
    </tr>
  </thead>

  <tbody>
    ${
      measurementRows ||
      '<tr><td colspan="2">Nu sunt date.</td></tr>'
    }
  </tbody>
</table>

${
  tablesHtml
    ? `
      <h2>Tabelul de date</h2>
      ${tablesHtml}
    `
    : ""
}

<h2>Calcule</h2>

<table>
  <thead>
    <tr>
      <th>Calcul</th>
      <th>Rezultat</th>
    </tr>
  </thead>

  <tbody>
    ${
      calculationRows ||
      '<tr><td colspan="2">Nu sunt calcule înregistrate.</td></tr>'
    }
  </tbody>
</table>

<h2>Compararea și interpretarea rezultatelor</h2>

${comparisonsHtml}

<h2>Concluzia elevului</h2>

${conclusionsHtml}

<div class="footer">

  <p>
    ID raport:
    ${escapeHtml(reportId)}
  </p>

  <p>
    Revizie:
    ${escapeHtml(revision)}
  </p>

  <p>
    Raport generat de
    fizica-liceu.
  </p>

</div>

<script>
  window.addEventListener(
    "load",
    function () {
      window.setTimeout(
        function () {
          window.print();
        },
        250
      );
    }
  );
<\/script>

</body>
</html>
      `);

      reportWindow.document.close();
    }

    /* =======================================================
       RESTART
       ======================================================= */

    restartWithNewData() {
      /*
       * restartWithNewData trebuie să șteargă
       * progresul și seed-ul vechi.
       *
       * La reîncărcare se vor genera:
       * - un nou dataset;
       * - un nou sessionId;
       * - un nou reportId.
       */
      Tools.storage
        .restartWithNewData(
          this.experimentId
        );

      window.location.reload();
    }

    /* =======================================================
       ERORI
       ======================================================= */

    renderConfigurationError(
      message
    ) {
      const error =
        createElement(
          "div",
          "experiment-developer-error"
        );

      error.innerHTML =
        "<strong>Eroare de configurare:</strong> " +
        escapeHtml(message);

      this.elements.stepArea
        .appendChild(error);

      console.error(
        `[${this.experimentId}]`,
        message
      );
    }

    /* =======================================================
       EVENIMENTE
       ======================================================= */

    emit(
      name,
      detail = {}
    ) {
      const event =
        new CustomEvent(
          `experiment:${name}`,
          {
            bubbles: true,

            detail: {
              experimentId:
                this.experimentId,

              engine: this,

              ...detail
            }
          }
        );

      this.container
        .dispatchEvent(event);
    }

    scrollToExperiment() {
      this.container
        .scrollIntoView({
          behavior: "auto",
          block: "start"
        });
    }
  }

  /* =========================================================
     MOUNT
     ========================================================= */

  async function mount(
    container,
    options = {}
  ) {
    const element =
      typeof container ===
      "string"
        ? document.querySelector(
            container
          )
        : container;

    if (!element) {
      throw new Error(
        "Containerul experimentului nu există."
      );
    }

    if (
      instances.has(element)
    ) {
      return instances.get(
        element
      );
    }

    const engine =
      new ExperimentEngine(
        element,
        options
      );

    instances.set(
      element,
      engine
    );

    try {
      await engine.init();
    } catch (error) {
      console.error(error);

      clearElement(element);

      const message =
        createElement(
          "div",
          "experiment-load-error"
        );

      message.innerHTML =
        "<strong>Experimentul nu a putut fi încărcat.</strong>" +
        `<br>${escapeHtml(
          error.message
        )}`;

      element.appendChild(
        message
      );
    }

    return engine;
  }

  /* =========================================================
     INIȚIALIZARE AUTOMATĂ
     ========================================================= */

  async function autoInit() {
    const containers =
      document.querySelectorAll(
        "[data-experiment-engine]"
      );

    for (
      const container of
      containers
    ) {
      await mount(
        container
      );
    }
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      autoInit
    );
  } else {
    autoInit();
  }

  /* =========================================================
     API PUBLIC
     ========================================================= */

  window.ExperimentEngine = {
    version:
      ENGINE_VERSION,

    Engine:
      ExperimentEngine,

    mount,

    getInstance(container) {
      const element =
        typeof container ===
        "string"
          ? document.querySelector(
              container
            )
          : container;

      return instances.get(
        element
      );
    }
  };

})(window, document);
