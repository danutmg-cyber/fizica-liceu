/**
 * experiment-engine.js
 * Motor generic pentru experimentele interactive
 * Fizică – clasa a IX-a
 *
 * Filosofie:
 * - fără animații;
 * - pași discreți;
 * - fiecare pas necesită o acțiune explicită;
 * - elevul citește instrumentele;
 * - elevul introduce manual valorile;
 * - elevul efectuează calculele;
 * - elevul compară rezultatele;
 * - elevul formulează concluziile.
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
     VERIFICAREA DEPENDENȚELOR
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
  const Instruments = window.MeasurementTools;

  const instances = new Map();

  /* =========================================================
     CONFIGURARE GENERALĂ
     ========================================================= */

  const DEFAULTS = {
    minimumConclusionLength: 20,
    calculationTolerance: 0.02,
    maximumAttempts: 3,

    labels: {
      verify: "Verifică",
      continue: "Continuă",
      previous: "Pasul anterior",
      next: "Pasul următor",
      completeAction: "Am realizat acțiunea",
      recordComplete: "Am completat tabelul",
      finish: "Finalizează experimentul",
      restart: "Reia experimentul cu alte valori",
      notebook:
        "Notează mai întâi valoarea și calculele în caiet.",
      correct:
        "Corect.",
      retry:
        "Mai încearcă.",
      completed:
        "Experiment finalizat."
    }
  };

  /* =========================================================
     FUNCȚII AJUTĂTOARE
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
    const div =
      document.createElement("div");

    div.textContent =
      String(value ?? "");

    return div.innerHTML;
  }

  function parseStudentNumber(value) {
    return Tools.numbers
      .parseNumber(value);
  }

  function getByPath(
    object,
    path
  ) {
    if (
      !object ||
      !path
    ) {
      return undefined;
    }

    return String(path)
      .split(".")
      .reduce(
        (current, key) =>
          current == null
            ? undefined
            : current[key],
        object
      );
  }

  function deepClone(value) {
    return JSON.parse(
      JSON.stringify(value)
    );
  }

  /* =========================================================
     LOCALIZAREA AUTOMATĂ A JSON-ULUI
     ========================================================= */

  function getEngineScript() {
    return (
      document.currentScript ||
      Array.from(
        document.scripts
      ).find((script) =>
        script.src.includes(
          "experiment-engine.js"
        )
      )
    );
  }

  function getDefaultDataUrl() {
    const script =
      getEngineScript();

    if (!script || !script.src) {
      return (
        "../../../assets/data/" +
        "experiments-clasa9.json"
      );
    }

    /*
     * Pornim de la:
     * assets/js/experiment-engine.js
     *
     * și ajungem la:
     * assets/data/experiments-clasa9.json
     */
    return new URL(
      "../data/experiments-clasa9.json",
      script.src
    ).href;
  }

  async function loadExperimentsData(
    url
  ) {
    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Nu s-a putut încărca " +
        `experiments-clasa9.json (${response.status}).`
      );
    }

    return response.json();
  }

  /* =========================================================
     MOTORUL PRINCIPAL
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
        ...DEFAULTS,
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
      this.defaults = null;
      this.experiment = null;
      this.simulation = null;
      this.model = null;

      this.steps = [];

      this.state = {
        experimentId:
          this.experimentId,

        currentStep: 0,

        completedSteps: [],

        answers: {},

        actions: {},

        calculations: {},

        measurements: {},

        choices: {},

        table: {},

        conclusions: {},

        completed: false
      };

      this.elements = {};
    }

    /* =======================================================
       INIȚIALIZARE
       ======================================================= */

    async init() {
      this.data =
        await loadExperimentsData(
          this.dataUrl
        );

      this.defaults =
        this.data.simulationDefaults ||
        {};

      this.experiment =
        this.data.experiments?.find(
          (item) =>
            item.id ===
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
          this.experiment.simulation ||
            {}
        );

      /*
       * Modelul fizic este creat numai dacă
       * experimentul are simulation.type.
       */
      if (
        this.experiment.simulation
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

      this.renderShell();

      if (
        this.steps.length === 0
      ) {
        this.renderMissingSteps();
        return this;
      }

      this.ensureValidStep();

      this.render();

      return this;
    }

    /* =======================================================
       STARE / PERSISTENȚĂ
       ======================================================= */

    restoreState() {
      const saved =
        Tools.storage.loadState(
          this.experimentId
        );

      if (
        saved &&
        saved.experimentId ===
          this.experimentId
      ) {
        this.state = {
          ...this.state,
          ...saved
        };
      }
    }

    saveState() {
      Tools.storage.saveState(
        this.experimentId,
        this.state
      );
    }

    ensureValidStep() {
      if (
        this.state.currentStep < 0
      ) {
        this.state.currentStep = 0;
      }

      if (
        this.state.currentStep >=
        this.steps.length
      ) {
        this.state.currentStep =
          this.steps.length - 1;
      }
    }

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
        (stepId) =>
          this.isStepCompleted(
            stepId
          )
      );
    }

    /* =======================================================
       STRUCTURA GENERALĂ
       ======================================================= */

    renderShell() {
      clearElement(
        this.container
      );

      this.container.classList.add(
        "experiment-engine"
      );

      this.container.dataset
        .experimentActive = "true";

      const header =
        createElement(
          "header",
          "experiment-header"
        );

      const badge =
        createElement(
          "div",
          "experiment-badge",
          this.experimentId
        );

      const title =
        createElement(
          "h2",
          "experiment-title",
          this.experiment
            .officialTitle ||
            this.experiment.title ||
            "Experiment interactiv"
        );

      const notebook =
        createElement(
          "div",
          "experiment-notebook-note",
          this.defaults.notebook
            ?.instruction ||
            DEFAULTS.labels.notebook
        );

      header.append(
        badge,
        title,
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

      /* ---------- ZONA PASULUI ---------- */

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
          "div",
          "experiment-navigation"
        );

      const previousButton =
        createElement(
          "button",
          "experiment-nav-button experiment-prev",
          DEFAULTS.labels.previous
        );

      previousButton.type =
        "button";

      previousButton.addEventListener(
        "click",
        () => this.previousStep()
      );

      const nextButton =
        createElement(
          "button",
          "experiment-nav-button experiment-next",
          DEFAULTS.labels.next
        );

      nextButton.type =
        "button";

      nextButton.addEventListener(
        "click",
        () => this.nextStep()
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
        progressBar,
        stepArea,
        navigation,
        previousButton,
        nextButton,
        completionArea
      };
    }

    renderMissingSteps() {
      const box =
        createElement(
          "div",
          "experiment-warning"
        );

      box.innerHTML = `
        <strong>Experimentul nu are încă pașii definiți.</strong>
        <p>
          Adaugă proprietatea
          <code>"steps": [...]</code>
          în obiectul ${escapeHtml(
            this.experimentId
          )}
          din
          <code>experiments-clasa9.json</code>.
        </p>
      `;

      this.elements.stepArea
        .appendChild(box);

      this.elements.navigation
        .hidden = true;
    }

    /* =======================================================
       RANDĂRI GENERALE
       ======================================================= */

    render() {
      this.updateProgress();

      if (this.state.completed) {
        this.renderCompletion();
        return;
      }

      this.elements.navigation
        .hidden = false;

      this.elements.completionArea
        .hidden = true;

      const step =
        this.steps[
          this.state.currentStep
        ];

      if (!step) {
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

      instruction.innerHTML =
        step.instruction || "";

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
        this.renderLockedStep(
          step
        );

        this.updateNavigation(
          step
        );

        return;
      }

      switch (step.type) {
        case "action":
          this.renderActionStep(
            step
          );
          break;

        case "measurement":
          this.renderMeasurementStep(
            step
          );
          break;

        case "record":
          this.renderRecordStep(
            step
          );
          break;

        case "calculation":
          this.renderCalculationStep(
            step
          );
          break;

        case "comparison":
          this.renderComparisonStep(
            step
          );
          break;

        case "choice":
          this.renderChoiceStep(
            step
          );
          break;

        case "conclusion":
          this.renderConclusionStep(
            step
          );
          break;

        default:
          this.renderUnknownStep(
            step
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

    renderLockedStep(step) {
      const warning =
        createElement(
          "div",
          "experiment-step-locked"
        );

      warning.innerHTML =
        "Finalizează pașii anteriori înainte de a continua.";

      this.elements.stepArea
        .appendChild(warning);
    }

    renderUnknownStep(step) {
      const warning =
        createElement(
          "div",
          "experiment-warning",
          `Tip de pas necunoscut: ${step.type}`
        );

      this.elements.stepArea
        .appendChild(warning);
    }

    /* =======================================================
       PAS DE TIP ACTION
       ======================================================= */

    renderActionStep(step) {
      const alreadyCompleted =
        this.isStepCompleted(
          step.id
        );

      const actionBox =
        createElement(
          "div",
          "experiment-action-box"
        );

      if (alreadyCompleted) {
        const done =
          createElement(
            "div",
            "experiment-success",
            "✓ Acțiune realizată."
          );

        actionBox.appendChild(
          done
        );
      } else {
        const button =
          createElement(
            "button",
            "experiment-action-button",
            step.buttonLabel ||
              DEFAULTS.labels
                .completeAction
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

        actionBox.appendChild(
          button
        );
      }

      this.elements.stepArea
        .appendChild(actionBox);
    }

    /* =======================================================
       REZOLVAREA VALORILOR ASCUNSE
       ======================================================= */

    resolveValue(descriptor) {
      if (
        descriptor === null ||
        descriptor === undefined
      ) {
        return null;
      }

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
        /*
         * Exemplu:
         * "measurements.step-01"
         */
        return getByPath(
          this.state,
          descriptor
        );
      }

      if (
        typeof descriptor !==
        "object"
      ) {
        return null;
      }

      if (
        Number.isFinite(
          descriptor.value
        )
      ) {
        return descriptor.value;
      }

      /* ---------- RĂSPUNS ANTERIOR ---------- */

      if (
        descriptor.answer
      ) {
        return this.state.answers[
          descriptor.answer
        ];
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

      /* ---------- MODEL FIZIC ---------- */

      if (
        descriptor.modelProperty &&
        this.model
      ) {
        return getByPath(
          this.model,
          descriptor.modelProperty
        );
      }

      if (
        descriptor.modelMethod &&
        this.model
      ) {
        const method =
          this.model[
            descriptor.modelMethod
          ];

        if (
          typeof method !==
          "function"
        ) {
          throw new Error(
            `Metoda fizică ${descriptor.modelMethod} nu există.`
          );
        }

        const args =
          (
            descriptor.args ||
            []
          ).map(
            (arg) =>
              this.resolveValue(
                arg
              )
          );

        return method.apply(
          this.model,
          args
        );
      }

      /* ---------- CALCUL STANDARD ---------- */

      if (
        descriptor.physicsCalculation
      ) {
        const fn =
          Physics.calculations[
            descriptor
              .physicsCalculation
          ];

        if (
          typeof fn !==
          "function"
        ) {
          throw new Error(
            `Calcul fizic necunoscut: ${descriptor.physicsCalculation}`
          );
        }

        const args =
          (
            descriptor.args ||
            []
          ).map(
            (arg) =>
              this.resolveValue(
                arg
              )
          );

        return fn(...args);
      }

      return null;
    }

    /* =======================================================
       INSTRUMENTE
       ======================================================= */

    getInstrumentConfig(
      instrumentName
    ) {
      const list =
        this.experiment
          .simulation
          ?.instruments ||
        [];

      return (
        list.find(
          (instrument) =>
            instrument.type ===
            instrumentName ||
            instrument.id ===
            instrumentName
        ) || {}
      );
    }

    normalizeInstrumentOptions(
      instrument
    ) {
      const options = {
        ...instrument
      };

      if (
        Array.isArray(
          instrument.range
        )
      ) {
        options.min =
          instrument.range[0];

        options.max =
          instrument.range[1];
      }

      return options;
    }

    renderStaticStopwatch(
      target,
      value,
      step
    ) {
      clearElement(target);

      const wrapper =
        createElement(
          "div",
          "static-stopwatch"
        );

      const display =
        createElement(
          "div",
          "stopwatch-display",
          "--:--.--"
        );

      const controls =
        createElement(
          "div",
          "stopwatch-controls"
        );

      const start =
        createElement(
          "button",
          "",
          "START"
        );

      const stop =
        createElement(
          "button",
          "",
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

          display.textContent =
            "Cronometrul funcționează…";

          start.disabled =
            true;

          stop.disabled =
            false;
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

          const measured =
            Tools.numbers.quantize(
              value,
              resolution
            );

          display.textContent =
            `${Tools.numbers.formatNumber(
              measured,
              2
            )} s`;

          stop.disabled =
            true;
        }
      );

      controls.append(
        start,
        stop
      );

      wrapper.append(
        display,
        controls
      );

      target.appendChild(
        wrapper
      );
    }

    /* =======================================================
       PAS DE TIP MEASUREMENT
       ======================================================= */

    renderMeasurementStep(step) {
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

      const inputArea =
        createElement(
          "div",
          "experiment-measurement-input"
        );

      wrapper.append(
        instrumentArea,
        inputArea
      );

      this.elements.stepArea
        .appendChild(wrapper);

      let expectedValue;

      try {
        expectedValue =
          this.resolveValue(
            step.expectedValue ||
            step.expected
          );
      } catch (error) {
        this.renderDeveloperError(
          error.message
        );

        return;
      }

      if (
        !Number.isFinite(
          expectedValue
        )
      ) {
        this.renderDeveloperError(
          `Pasul ${step.id} nu are expectedValue valid.`
        );

        return;
      }

      const instrumentType =
        step.instrument;

      const baseConfig =
        this.getInstrumentConfig(
          instrumentType
        );

      const instrumentConfig =
        this.normalizeInstrumentOptions({
          ...baseConfig,
          ...(step.instrumentOptions ||
            {}),
          value:
            expectedValue
        });

      /*
       * Cronometrul este tratat separat,
       * fără animație continuă.
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
      } else if (
        instrumentType
      ) {
        try {
          Instruments.create(
            instrumentType,
            instrumentArea,
            instrumentConfig
          );
        } catch (error) {
          this.renderDeveloperError(
            error.message
          );
        }
      }

      const existing =
        this.state
          .measurements[
          step.id
        ];

      if (
        Number.isFinite(
          existing
        )
      ) {
        const result =
          createElement(
            "div",
            "experiment-success",
            `✓ Valoare înregistrată: ${
              Tools.numbers
                .formatNumber(
                  existing,
                  step.decimals ?? 2
                )
            } ${step.unit || ""}`
          );

        inputArea.appendChild(
          result
        );

        return;
      }

      const notebook =
        createElement(
          "div",
          "experiment-notebook-reminder",
          step.notebookInstruction ||
            DEFAULTS.labels.notebook
        );

      inputArea.appendChild(
        notebook
      );

      const reading =
        Instruments
          .createReadingInput(
            inputArea,
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
                "Privește cu atenție scala instrumentului.",

              onCorrect:
                (result) => {
                  this.state
                    .measurements[
                    step.id
                  ] =
                    result.studentValue;

                  this.state.answers[
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

      if (reading?.input) {
        reading.input
          .focus();
      }
    }

    /* =======================================================
       TABEL EXPERIMENTAL
       ======================================================= */

    renderExperimentTable(
      step
    ) {
      const definition =
        step.table ||
        this.experiment
          .dataTable;

      if (
        !definition ||
        !Array.isArray(
          definition.columns
        )
      ) {
        return null;
      }

      const tableWrapper =
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

      definition.columns.forEach(
        (column) => {
          const th =
            document.createElement(
              "th"
            );

          th.scope =
            "col";

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
        this.data.labDefaults
          ?.minimumRepeats ||
        3;

      const tableId =
        step.tableId ||
        step.id;

      if (
        !this.state.table[
          tableId
        ]
      ) {
        this.state.table[
          tableId
        ] = {};
      }

      for (
        let rowIndex = 0;
        rowIndex < rowCount;
        rowIndex += 1
      ) {
        const tr =
          document.createElement(
            "tr"
          );

        definition.columns.forEach(
          (column) => {
            const td =
              document.createElement(
                "td"
              );

            /*
             * Coloana de număr de determinare
             * poate fi automată.
             */
            if (
              column.key ===
                "trial" ||
              column.autoIndex
            ) {
              td.textContent =
                String(
                  rowIndex + 1
                );

              tr.appendChild(td);
              return;
            }

            const input =
              document.createElement(
                "input"
              );

            input.type =
              "text";

            input.inputMode =
              "decimal";

            input.autocomplete =
              "off";

            input.className =
              "experiment-table-input";

            input.setAttribute(
              "aria-label",
              `${column.label}, determinarea ${
                rowIndex + 1
              }`
            );

            const cellKey =
              `${rowIndex}:${column.key}`;

            input.value =
              this.state.table[
                tableId
              ][cellKey] ??
              "";

            input.addEventListener(
              "input",
              () => {
                this.state.table[
                  tableId
                ][cellKey] =
                  input.value;

                this.saveState();
              }
            );

            td.appendChild(
              input
            );

            tr.appendChild(td);
          }
        );

        tbody.appendChild(
          tr
        );
      }

      table.append(
        thead,
        tbody
      );

      tableWrapper.appendChild(
        table
      );

      return tableWrapper;
    }

    /* =======================================================
       PAS DE TIP RECORD
       ======================================================= */

    renderRecordStep(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-record"
        );

      const note =
        createElement(
          "div",
          "experiment-notebook-reminder",
          step.notebookInstruction ||
            "Notează valorile în caiet și completează tabelul."
        );

      wrapper.appendChild(note);

      const table =
        this.renderExperimentTable(
          step
        );

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
            "✓ Date înregistrate."
          )
        );
      } else {
        const button =
          createElement(
            "button",
            "experiment-action-button",
            step.buttonLabel ||
              DEFAULTS.labels
                .recordComplete
          );

        button.type =
          "button";

        button.addEventListener(
          "click",
          () => {
            this.completeStep(
              step.id
            );

            this.emit(
              "record",
              {
                step,
                table:
                  this.state.table[
                    step.tableId ||
                    step.id
                  ]
              }
            );

            this.render();
          }
        );

        wrapper.appendChild(
          button
        );
      }

      this.elements.stepArea
        .appendChild(wrapper);
    }

    /* =======================================================
       PAS DE TIP CALCULATION
       ======================================================= */

    renderCalculationStep(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-calculation"
        );

      if (step.formulaLabel) {
        const formula =
          createElement(
            "div",
            "experiment-formula"
          );

        formula.innerHTML =
          step.formulaLabel;

        wrapper.appendChild(
          formula
        );
      }

      const reminder =
        createElement(
          "div",
          "experiment-notebook-reminder",
          step.notebookInstruction ||
            "Efectuează calculul în caiet, apoi introdu rezultatul."
        );

      wrapper.appendChild(
        reminder
      );

      const existing =
        this.state
          .calculations[
          step.id
        ];

      if (
        Number.isFinite(
          existing
        )
      ) {
        wrapper.appendChild(
          createElement(
            "div",
            "experiment-success",
            `✓ Rezultat: ${
              Tools.numbers
                .formatNumber(
                  existing,
                  step.decimals ?? 2
                )
            } ${step.unit || ""}`
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
            step.expectedValue ||
            step.expected
          );
      } catch (error) {
        this.renderDeveloperError(
          error.message
        );

        return;
      }

      if (
        !Number.isFinite(
          expectedValue
        )
      ) {
        this.renderDeveloperError(
          `Pasul ${step.id} nu are un rezultat calculat valid.`
        );

        return;
      }

      const row =
        createElement(
          "div",
          "experiment-answer-row"
        );

      const input =
        document.createElement(
          "input"
        );

      input.type =
        "text";

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
            DEFAULTS.labels.verify
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

      const verify = () => {
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
            "Introdu o valoare numerică.";

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

          this.state.answers[
            step.id
          ] =
            result.studentValue;

          feedback.textContent =
            "✓ Calcul corect.";

          feedback.className =
            "experiment-feedback is-correct";

          input.disabled =
            true;

          button.disabled =
            true;

          this.completeStep(
            step.id
          );

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

        if (
          attempts >=
          (
            step.showHintAfterAttempts ||
            1
          )
        ) {
          feedback.textContent =
            step.hint ||
            "Verifică formula, unitățile și operațiile efectuate.";

          feedback.className =
            "experiment-feedback is-hint";
        } else {
          feedback.textContent =
            DEFAULTS.labels.retry;

          feedback.className =
            "experiment-feedback is-error";
        }
      };

      button.addEventListener(
        "click",
        verify
      );

      input.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key ===
            "Enter"
          ) {
            verify();
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
       PAS DE TIP COMPARISON
       ======================================================= */

    renderComparisonStep(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-comparison"
        );

      const measured =
        this.resolveValue(
          step.measuredSource
            ? {
                measurement:
                  step.measuredSource
              }
            : step.measured
        );

      const calculated =
        this.resolveValue(
          step.calculatedSource
            ? {
                calculation:
                  step.calculatedSource
              }
            : step.calculated
        );

      if (
        Number.isFinite(
          measured
        ) &&
        Number.isFinite(
          calculated
        )
      ) {
        const comparisonGrid =
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
          `<strong>Valoare măsurată</strong><br>` +
          `${escapeHtml(
            Tools.numbers.formatNumber(
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
          `<strong>Valoare calculată</strong><br>` +
          `${escapeHtml(
            Tools.numbers.formatNumber(
              calculated,
              step.decimals ?? 2
            )
          )} ${escapeHtml(
            step.unit || ""
          )}`;

        comparisonGrid.append(
          measuredBox,
          calculatedBox
        );

        wrapper.appendChild(
          comparisonGrid
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
            "✓ Rezultatele au fost comparate."
          )
        );
      } else {
        const prompt =
          createElement(
            "p",
            "comparison-prompt",
            step.question ||
              "Compară cele două rezultate. Sunt apropiate în limitele experimentului?"
          );

        const textarea =
          document.createElement(
            "textarea"
          );

        textarea.className =
          "experiment-interpretation";

        textarea.rows =
          step.rows || 3;

        textarea.placeholder =
          step.placeholder ||
          "Scrie aici observația ta...";

        const button =
          createElement(
            "button",
            "experiment-action-button",
            step.buttonLabel ||
              "Salvează comparația"
          );

        button.type =
          "button";

        const feedback =
          createElement(
            "div",
            "experiment-feedback"
          );

        button.addEventListener(
          "click",
          () => {
            const text =
              textarea.value.trim();

            if (
              text.length <
              (
                step.minimumLength ||
                10
              )
            ) {
              feedback.textContent =
                "Scrie o observație puțin mai detaliată.";

              feedback.className =
                "experiment-feedback is-hint";

              return;
            }

            this.state.answers[
              step.id
            ] = text;

            this.completeStep(
              step.id
            );

            this.emit(
              "comparison",
              {
                step,
                interpretation:
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
      }

      this.elements.stepArea
        .appendChild(wrapper);
    }

    /* =======================================================
       PAS DE TIP CHOICE
       ======================================================= */

    renderChoiceStep(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-choice"
        );

      const question =
        createElement(
          "p",
          "experiment-question",
          step.question || ""
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
            "✓ Interpretare corectă."
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

                this.state.answers[
                  step.id
                ] = index;

                feedback.textContent =
                  step.feedbackCorrect ||
                  "✓ Corect.";

                feedback.className =
                  "experiment-feedback is-correct";

                this.completeStep(
                  step.id
                );

                Array.from(
                  wrapper.querySelectorAll(
                    "button"
                  )
                ).forEach(
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
       PAS DE TIP CONCLUSION
       ======================================================= */

    renderConclusionStep(step) {
      const wrapper =
        createElement(
          "div",
          "experiment-conclusion"
        );

      if (
        this.isStepCompleted(
          step.id
        )
      ) {
        const saved =
          this.state
            .conclusions[
            step.id
          ];

        const result =
          createElement(
            "div",
            "experiment-conclusion-saved"
          );

        result.innerHTML =
          `<strong>Concluzia ta:</strong><br>` +
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
          "",
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
        "Scrie concluzia în 2-3 enunțuri...";

      const button =
        createElement(
          "button",
          "experiment-action-button",
          step.buttonLabel ||
            "Salvează concluzia"
        );

      button.type =
        "button";

      const feedback =
        createElement(
          "div",
          "experiment-feedback"
        );

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
              `Concluzia trebuie să conțină cel puțin ${minimum} caractere.`;

            feedback.className =
              "experiment-feedback is-hint";

            return;
          }

          this.state
            .conclusions[
            step.id
          ] = text;

          this.state.answers[
            step.id
          ] = text;

          this.completeStep(
            step.id
          );

          this.emit(
            "conclusion",
            {
              step,
              conclusion:
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
       NAVIGAREA ÎNTRE PAȘI
       ======================================================= */

    previousStep() {
      if (
        this.state.currentStep <=
        0
      ) {
        return;
      }

      this.state.currentStep -=
        1;

      this.saveState();
      this.render();
      this.scrollToTop();
    }

    nextStep() {
      const current =
        this.steps[
          this.state.currentStep
        ];

      if (
        !current ||
        !this.isStepCompleted(
          current.id
        )
      ) {
        return;
      }

      if (
        this.state.currentStep >=
        this.steps.length - 1
      ) {
        this.finishExperiment();
        return;
      }

      this.state.currentStep +=
        1;

      this.saveState();
      this.render();
      this.scrollToTop();
    }

    updateNavigation(step) {
      const allowBack =
        this.defaults.navigation
          ?.allowBack !== false;

      this.elements.previousButton
        .hidden = !allowBack;

      this.elements.previousButton
        .disabled =
        this.state.currentStep ===
        0;

      const completed =
        this.isStepCompleted(
          step.id
        );

      this.elements.nextButton
        .disabled = !completed;

      if (
        this.state.currentStep ===
        this.steps.length - 1
      ) {
        this.elements.nextButton
          .textContent =
          DEFAULTS.labels.finish;
      } else {
        this.elements.nextButton
          .textContent =
          DEFAULTS.labels.next;
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
          `${completed}/${total} pași realizați`;
      }

      if (
        this.elements
          .progressBar
      ) {
        this.elements
          .progressBar
          .style.width =
          `${percentage}%`;

        this.elements
          .progressBar
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
          experimentId:
            this.experimentId,

          state:
            deepClone(
              this.state
            )
        }
      );

      this.renderCompletion();
    }

    renderCompletion() {
      this.elements.navigation
        .hidden = true;

      this.elements.stepArea
        .hidden = true;

      this.elements.completionArea
        .hidden = false;

      clearElement(
        this.elements
          .completionArea
      );

      const success =
        createElement(
          "div",
          "experiment-final-card"
        );

      const title =
        createElement(
          "h3",
          "",
          "Experiment finalizat ✓"
        );

      const summary =
        createElement(
          "div",
          "experiment-final-summary"
        );

      summary.innerHTML = `
        <p>
          Ai parcurs toți cei
          <strong>${this.steps.length}</strong>
          pași ai experimentului.
        </p>

        <p>
          Măsurările, calculele și concluziile tale
          au fost păstrate pe acest dispozitiv.
        </p>
      `;

      const restart =
        createElement(
          "button",
          "experiment-restart-button",
          DEFAULTS.labels.restart
        );

      restart.type =
        "button";

      restart.addEventListener(
        "click",
        () => {
          this.restartWithNewData();
        }
      );

      success.append(
        title,
        summary,
        restart
      );

      this.elements.completionArea
        .appendChild(success);

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
       ERORI DE CONFIGURARE
       ======================================================= */

    renderDeveloperError(
      message
    ) {
      const error =
        createElement(
          "div",
          "experiment-developer-error"
        );

      error.innerHTML =
        `<strong>Eroare de configurare:</strong> ` +
        escapeHtml(message);

      this.elements.stepArea
        .appendChild(error);

      console.error(
        `[${this.experimentId}] ${message}`
      );
    }

    /* =======================================================
       EVENIMENTE
       ======================================================= */

    emit(name, detail = {}) {
      const event =
        new CustomEvent(
          `experiment:${name}`,
          {
            bubbles: true,
            detail: {
              engine: this,
              experimentId:
                this.experimentId,
              ...detail
            }
          }
        );

      this.container.dispatchEvent(
        event
      );
    }

    scrollToTop() {
      this.container
        .scrollIntoView({
          behavior: "auto",
          block: "start"
        });
    }
  }

  /* =========================================================
     INIȚIALIZARE AUTOMATĂ
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
        `<strong>Experimentul nu a putut fi încărcat.</strong><br>` +
        escapeHtml(
          error.message
        );

      element.appendChild(
        message
      );
    }

    return engine;
  }

  async function autoInit() {
    const containers =
      document.querySelectorAll(
        "[data-experiment-engine]"
      );

    for (
      const container of containers
    ) {
      await mount(container);
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
    version: "1.0.0",

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
