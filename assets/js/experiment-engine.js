/**
 * experiment-engine.js
 * Motor generic pentru experimente interactive pas-cu-pas
 * Fizică – clasa a IX-a
 *
 * Principii:
 * - fără animații;
 * - fiecare modificare apare după o acțiune explicită a elevului;
 * - elevul citește instrumentul;
 * - elevul notează în caiet;
 * - elevul introduce valoarea;
 * - elevul efectuează calculele;
 * - elevul compară rezultatele;
 * - elevul formulează concluzia.
 *
 * Prof. Dănuț Andronie
 * e-Mail: danutmg@gmail.com
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
     CONFIGURARE
     ========================================================= */

  const DEFAULT_OPTIONS = {
    minimumConclusionLength: 20,
    minimumComparisonLength: 10,
    calculationTolerance: 0.02,
    maximumAttempts: 3
  };

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

  function deepClone(value) {
    return JSON.parse(
      JSON.stringify(value)
    );
  }

  /* =========================================================
     LOCALIZAREA FIȘIERULUI JSON
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

      this.data = null;
      this.defaults = {};
      this.experiment = null;
      this.simulation = {};
      this.model = null;
      this.steps = [];

      this.state = {
        version: "2.0.0",

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
          `Experimentul ${this.experimentId} nu există în experiments-clasa9.json.`
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
       PERSISTENȚĂ
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
            : []
      };
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
       REZOLVAREA DESCRIPTORILOR DIN JSON
       ======================================================= */

    resolveValue(descriptor) {
      /*
       * Numerele sunt valori literale.
       */
      if (
        typeof descriptor ===
        "number"
      ) {
        return descriptor;
      }

      /*
       * Stringurile sunt valori literale.
       *
       * Important pentru:
       * "wood"
       * "rubber"
       * "plastic"
       */
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
            this.resolveValue(
              item
            )
        );
      }

      if (
        typeof descriptor !==
        "object"
      ) {
        return descriptor;
      }

      /* ---------- VALOARE LITERALĂ ---------- */

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

      /* ---------- MĂSURARE ---------- */

      if (
        descriptor.measurement
      ) {
        return this.state
          .measurements[
            descriptor.measurement
          ];
      }

      /* ---------- CALCUL ---------- */

      if (
        descriptor.calculation
      ) {
        return this.state
          .calculations[
            descriptor.calculation
          ];
      }

      /* ---------- RĂSPUNS ---------- */

      if (
        descriptor.answer
      ) {
        return this.state
          .answers[
            descriptor.answer
          ];
      }

      /* ---------- PROPRIETATE MODEL ---------- */

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

      /* ---------- METODĂ MODEL ---------- */

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

      /* ---------- FUNCȚIE FIZICĂ GENERALĂ ---------- */

      if (
        descriptor.physicsCalculation
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
       STRUCTURA VIZUALĂ
       ======================================================= */

    renderShell() {
      clearElement(
        this.container
      );

      this.container.classList.add(
        "experiment-engine"
      );

      /* ---------- HEADER ---------- */

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
            "Notează valorile și calculele și în caiet."
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

      /* ---------- CONȚINUT ---------- */

      const stepArea =
        createElement(
          "section",
          "experiment-step-area"
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

      previousButton
        .addEventListener(
          "click",
          () =>
            this.previousStep()
        );

      nextButton
        .addEventListener(
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
          "experiment-step-instruction"
        );

      instruction.textContent =
        step.instruction ||
        "";

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
        const warning =
          createElement(
            "div",
            "experiment-step-locked",
            "Finalizează pașii anteriori înainte de a continua."
          );

        this.elements.stepArea
          .appendChild(
            warning
          );

        this.updateNavigation(
          step
        );

        return;
      }

      switch (step.type) {
        case "action":
          this.renderAction(
            step
          );
          break;

        case "measurement":
          this.renderMeasurement(
            step
          );
          break;

        case "record":
          this.renderRecord(
            step
          );
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
          this.renderChoice(
            step
          );
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

      this.emit(
        "stepchange",
        {
          step,
          index:
            this.state.currentStep
        }
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

      display.setAttribute(
        "role",
        "timer"
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

      /*
       * Cronometrul este intenționat static:
       * nu folosim requestAnimationFrame.
       */
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

      const reminder =
        createElement(
          "div",
          "experiment-notebook-reminder",
          step.notebookInstruction ||
            "Citește instrumentul, notează valoarea în caiet, apoi introdu valoarea mai jos."
        );

      answerArea.appendChild(
        reminder
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

              relativeTolerance:
                step.relativeTolerance ??
                0,

              maxAttempts:
                step.maxAttempts ||
                this.options
                  .maximumAttempts,

              hint:
                step.hint ||
                "Verifică din nou poziția indicatorului și diviziunile scalei.",

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
       TABEL EXPERIMENTAL
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

          const cellKey =
            `${rowIndex}:${column.key}`;

          const value =
            stored[cellKey];

          if (
            value === undefined ||
            value === null ||
            String(value).trim() ===
              ""
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
            "Completează tabelul folosind valorile pe care le-ai notat în caiet."
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

      feedback.setAttribute(
        "aria-live",
        "polite"
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
              "Completează toate căsuțele tabelului înainte de a continua.";

            feedback.className =
              "experiment-feedback is-hint";

            return;
          }

          this.completeStep(
            step.id
          );

          this.emit(
            "record",
            {
              step,
              table:
                deepClone(
                  this.state.tables[
                    step.tableId ||
                    step.id
                  ] ||
                  {}
                )
            }
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
            `✓ Rezultat înregistrat: ${formatNumber(
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
            "Efectuează calculul în caiet. Introdu aici numai rezultatul obținut."
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

      input.setAttribute(
        "aria-label",
        step.inputLabel ||
          "Rezultat calculat"
      );

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
          step.buttonLabel ||
            "Verifică"
        );

      button.type =
        "button";

      const feedback =
        createElement(
          "div",
          "experiment-feedback"
        );

      feedback.setAttribute(
        "aria-live",
        "polite"
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

          this.emit(
            "calculation",
            {
              step,
              value:
                result.studentValue
            }
          );

          this.updateNavigation(
            step
          );

          return;
        }

        feedback.textContent =
          step.hint ||
          (
            attempts >= 2
              ? "Verifică formula, transformarea unităților și operațiile numerice."
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

      input.focus();
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
      } else if (
        step.measured
      ) {
        measured =
          this.resolveValue(
            step.measured
          );
      }

      if (
        step.calculatedSource
      ) {
        calculated =
          this.state
            .calculations[
            step.calculatedSource
          ];
      } else if (
        step.calculated
      ) {
        calculated =
          this.resolveValue(
            step.calculated
          );
      }

      if (
        isFiniteNumber(measured) &&
        isFiniteNumber(calculated)
      ) {
        const values =
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
          "<strong>Valoare măsurată</strong>" +
          `<br>${escapeHtml(
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
          "<strong>Valoare calculată</strong>" +
          `<br>${escapeHtml(
            formatNumber(
              calculated,
              step.decimals ?? 2
            )
          )} ${escapeHtml(
            step.unit || ""
          )}`;

        values.append(
          measuredBox,
          calculatedBox
        );

        wrapper.appendChild(
          values
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
            "Compară cele două valori. Ce observi?"
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
        step.placeholder ||
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
              `Scrie o observație de cel puțin ${minimum} caractere.`;

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

          this.emit(
            "comparison",
            {
              step,
              text
            }
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

      const question =
        createElement(
          "p",
          "experiment-question",
          step.question ||
            ""
        );

      wrapper.appendChild(
        question
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

      const options =
        Array.isArray(
          step.options
        )
          ? step.options
          : [];

      options.forEach(
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
                  "Analizează din nou datele experimentului.";

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

      const prompt =
        createElement(
          "p",
          "experiment-conclusion-prompt",
          step.question ||
            step.instruction ||
            "Formulează concluzia experimentului."
        );

      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.className =
        "experiment-conclusion-input";

      textarea.rows =
        step.rows || 5;

      textarea.placeholder =
        step.placeholder ||
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
              `Scrie o concluzie de cel puțin ${minimum} caractere.`;

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

          this.emit(
            "conclusion",
            {
              step,
              text
            }
          );

          this.render();
        }
      );

      wrapper.append(
        prompt,
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

      const completed =
        this.isStepCompleted(
          step.id
        );

      this.elements
        .nextButton
        .disabled =
        !completed;

      if (
        this.state.currentStep ===
        this.steps.length - 1
      ) {
        this.elements
          .nextButton
          .textContent =
          "Finalizează experimentul";
      } else {
        this.elements
          .nextButton
          .textContent =
          "Pasul următor →";
      }
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
       FINALIZARE
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

      const text =
        createElement(
          "p",
          "experiment-final-text",
          "Ai parcurs toate etapele: acțiuni experimentale, măsurări, înregistrarea datelor, calcule, comparații și concluzii."
        );

      const restart =
        createElement(
          "button",
          "experiment-restart-button",
          "Reia experimentul cu alte valori"
        );

      restart.type =
        "button";

      restart.addEventListener(
        "click",
        () =>
          this.restartWithNewData()
      );

      card.append(
        title,
        text,
        restart
      );

      this.elements
        .completionArea
        .appendChild(card);

      this.updateProgress();
    }

    restartWithNewData() {
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
      typeof container === "string"
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
    version: "2.0.0",

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
