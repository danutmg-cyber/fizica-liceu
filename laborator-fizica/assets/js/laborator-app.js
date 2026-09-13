/* ======================================================================
   FIZICA-LICEU - APLICATIA CENTRALA A LABORATORULUI

   Acest fisier:
   - incarca configurarea generala si componentele HTML reutilizabile;
   - incarca stilurile si modulele JavaScript comune;
   - coordoneaza etapele, progresul si starea sesiunii;
   - transmite evenimente intre componente fara a dubla logica lor interna.

   Incarcare recomandata, dupa definirea LAB_EXPERIMENT_CONFIG:
   <script src="../assets/js/laborator-app.js" defer></script>
   ====================================================================== */

(() => {
  "use strict";

  const SCRIPT_ELEMENT = document.currentScript;
  const SCRIPT_URL =
    SCRIPT_ELEMENT?.src || document.baseURI;

  const ASSETS_ROOT = new URL(
    "../",
    SCRIPT_URL
  );

  const CONFIG_URL = new URL(
    "data/configurare-generala.json",
    ASSETS_ROOT
  ).href;

  const APP_ROOT_SELECTOR =
    "[data-lab-app]";

  const COMPONENT_ORDER = [
    "identification",
    "safety",
    "equipmentSelection",
    "notebookForm",
    "finalEvaluation",
    "finalReport"
  ];

  const DEFAULT_MODULES = [
    {
      id: "identification",
      file: "identificare-elev.js",
      global: "LaboratorIdentificare",
      required: true
    },
    {
      id: "equipment",
      file: "echipamente.js",
      global: "LaboratorEchipamente",
      required: true
    },
    {
      id: "evaluation",
      file: "evaluare.js",
      global: "LaboratorEvaluare",
      required: true
    },
    {
      id: "googleSheets",
      file: "google-sheets.js",
      global: "LaboratorGoogleSheets",
      required: true
    },
    {
      id: "safety",
      file: "securitate.js",
      global: "LaboratorSecuritate",
      required: false
    },
    {
      id: "notebook",
      file: "formular-caiet.js",
      global: "LaboratorCaiet",
      required: false
    },
    {
      id: "monitoring",
      file: "monitorizare.js",
      global: "LaboratorMonitorizare",
      required: false
    },
    {
      id: "report",
      file: "raport-final.js",
      global: "LaboratorRaport",
      required: false
    }
  ];

  const state = {
    root: null,
    generalConfig: null,
    experimentConfig: null,
    components: new Map(),
    completedSteps: new Set(),
    currentStepId: null,
    initialized: false,
    loading: false,
    errors: [],
    componentData: {}
  };

  let readyResolve;
  let readyReject;

  const ready = new Promise(
    (resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    }
  );

  const asArray = value =>
    Array.isArray(value) ? value : [];

  const clone = value => {
    if (value === undefined) {
      return undefined;
    }

    if (
      typeof globalThis.structuredClone ===
      "function"
    ) {
      return globalThis.structuredClone(value);
    }

    return JSON.parse(
      JSON.stringify(value)
    );
  };

  function emit(
    name,
    detail = {}
  ) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }

  async function fetchText(url) {
    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Resursa ${url} nu a putut fi încărcată (${response.status}).`
      );
    }

    return response.text();
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Configurația nu a putut fi încărcată (${response.status}).`
      );
    }

    return response.json();
  }

  function resolveAssetPath(
    path,
    fallback = ""
  ) {
    const value = String(
      path || fallback
    ).trim();

    if (!value) {
      return "";
    }

    if (/^(https?:)?\/\//i.test(value)) {
      return new URL(
        value,
        document.baseURI
      ).href;
    }

    const normalized = value
      .replace(
        /^\.\.\/assets\//,
        ""
      )
      .replace(
        /^assets\//,
        ""
      );

    return new URL(
      normalized,
      ASSETS_ROOT
    ).href;
  }

  function showApplicationError(
    error,
    context = ""
  ) {
    const message = context
      ? `${context}: ${error.message}`
      : error.message;

    state.errors.push(message);

    console.error(
      "[LaboratorApp]",
      message,
      error
    );

    let box = document.querySelector(
      "[data-lab-application-error]"
    );

    if (!box) {
      box =
        document.createElement("div");

      box.className = "lab-danger";
      box.dataset.labApplicationError = "";

      box.setAttribute(
        "role",
        "alert"
      );

      (
        state.root ||
        document.body
      ).prepend(box);
    }

    box.textContent =
      "Laboratorul nu a putut fi " +
      "inițializat complet. " +
      message;
  }

  function validateExperimentConfig(
    configuration
  ) {
    if (
      !configuration ||
      typeof configuration !== "object"
    ) {
      throw new TypeError(
        "Lipsește obiectul window.LAB_EXPERIMENT_CONFIG."
      );
    }

    const title =
      configuration.title ||
      configuration.experimentTitle;

    if (!String(title || "").trim()) {
      throw new Error(
        "Configurația experimentului nu conține titlul."
      );
    }

    return configuration;
  }

  async function loadGeneralConfiguration() {
    const configuration =
      globalThis.LAB_GENERAL_CONFIG ||
      await fetchJson(CONFIG_URL);

    globalThis.LAB_GENERAL_CONFIG =
      configuration;

    return configuration;
  }

  function ensureStylesheet(
    id,
    path,
    media = "all"
  ) {
    if (
      !path ||
      document.querySelector(
        `link[data-lab-style="${id}"]`
      )
    ) {
      return;
    }

    const link =
      document.createElement("link");

    link.rel = "stylesheet";
    link.href =
      resolveAssetPath(path);
    link.media = media;
    link.dataset.labStyle = id;

    document.head.append(link);
  }

  function loadStyles() {
    const styles =
      state.generalConfig.assets
        ?.styles ||
      {};

    ensureStylesheet(
      "core",
      styles.core ||
      "css/laborator-core.css"
    );

    ensureStylesheet(
      "simulation2d",
      styles.simulation2d ||
      "css/laborator-2d.css"
    );

    ensureStylesheet(
           "print",
      styles.print ||
      "css/print.css",
      "print"
    );
  }

  function ensureApplicationRoot() {
    state.root =
      document.querySelector(
        APP_ROOT_SELECTOR
      );

    if (state.root) {
      return state.root;
    }

    state.root =
      document.createElement("main");

    state.root.className = "lab-main";
    state.root.dataset.labApp = "";

    document.body.append(state.root);

    return state.root;
  }

  function getComponentTarget(
    componentId
  ) {
    const explicit =
      document.querySelector(
        `[data-component-slot="${componentId}"]`
      );

    if (explicit) {
      return explicit;
    }

    if (
      componentId ===
      "identification"
    ) {
      return document.body;
    }

    let container =
      state.root.querySelector(
        "[data-lab-components]"
      );

    if (!container) {
      container =
        document.createElement("div");

      container.dataset.labComponents = "";

      state.root.append(container);
    }

    return container;
  }

  function parseComponent(
    html,
    componentId
  ) {
    const template =
      document.createElement("template");

    template.innerHTML = html.trim();

    const elements = [
      ...template.content.children
    ];

    if (!elements.length) {
      throw new Error(
        `Componenta ${componentId} nu conține elemente HTML.`
      );
    }

    return template.content;
  }

  async function loadComponent(
    componentId,
    path
  ) {
    if (!path) {
      return null;
    }

    const existing =
      document.querySelector(
        `[data-component-slot="${componentId}"] > [data-lab-component], ` +
        `[data-loaded-component="${componentId}"]`
      );

    if (existing) {
      state.components.set(
        componentId,
        existing
      );

      return existing;
    }

    const url =
      resolveAssetPath(path);

    const html =
      await fetchText(url);

    const fragment =
      parseComponent(
        html,
        componentId
      );

    const firstElement =
      fragment.firstElementChild;

    firstElement.dataset.loadedComponent =
      componentId;

    const target =
      getComponentTarget(componentId);

    target.append(fragment);

    state.components.set(
      componentId,
      firstElement
    );

    emit(
      "laborator:component-loaded",
      {
        id: componentId,
        element: firstElement
      }
    );

    return firstElement;
  }

  async function loadComponents() {
    const configured =
      state.generalConfig.assets
        ?.components ||
      {};

    for (
      const componentId
      of COMPONENT_ORDER
    ) {
      const path =
        configured[componentId];

      if (!path) {
        continue;
      }

      try {
        await loadComponent(
          componentId,
          path
        );
      } catch (error) {
        showApplicationError(
          error,
          `Componenta ${componentId}`
        );
      }
    }

    emit(
      "laborator:components-loaded",
      {
        ids: [
          ...state.components.keys()
        ]
      }
    );
  }

  function scriptAlreadyLoaded(module) {
    return Boolean(
      globalThis[module.global]
    ) || Boolean(
      document.querySelector(
        `script[data-lab-module="${module.id}"]`
      )
    );
  }

  function loadScript(module) {
    if (scriptAlreadyLoaded(module)) {
      return Promise.resolve(true);
    }

    return new Promise(
      (resolve, reject) => {
        const script =
          document.createElement("script");

        script.src = new URL(
          module.file,
          new URL(
            "js/",
            ASSETS_ROOT
          )
        ).href;

        script.defer = true;

        script.dataset.labModule =
          module.id;

        script.addEventListener(
          "load",
          () => resolve(true),
          {
            once: true
          }
        );

        script.addEventListener(
          "error",
          () => reject(
            new Error(
              `Modulul ${module.file} nu a putut fi încărcat.`
            )
          ),
          {
            once: true
          }
        );

        document.head.append(script);
      }
    );
  }

  async function loadModules() {
    const overrides =
      state.experimentConfig.modules ||
      {};

    for (
      const defaultModule
      of DEFAULT_MODULES
    ) {
      const override =
        overrides[defaultModule.id];

      if (override === false) {
        continue;
      }

      if (
        !defaultModule.required &&
        override === undefined
      ) {
        continue;
      }

      const module =
        typeof override === "string"
          ? {
              ...defaultModule,
              file: override
            }
          : {
              ...defaultModule,
              ...(override || {})
            };

      try {
        await loadScript(module);
      } catch (error) {
        if (module.required) {
          showApplicationError(
            error,
            `Modulul ${module.id}`
          );
        } else {
          console.info(
            `[LaboratorApp] Modulul opțional ${module.id} nu este disponibil.`
          );
        }
      }
    }
  }

  function workflowSteps() {
    return asArray(
      state.generalConfig.workflow
        ?.steps
    );
  }

  function stepIndex(stepId) {
    return workflowSteps().findIndex(
      step => step.id === stepId
    );
  }

  function progressStorageKey() {
    const prefix =
      state.generalConfig.session
        ?.storagePrefix ||
      "fizica-laborator";

    const experimentId =
      state.experimentConfig.id ||
      state.experimentConfig.slug ||
      "experiment";

    return `${prefix}:progres:${experimentId}`;
  }

  function saveProgress() {
    if (
      state.generalConfig.workflow
        ?.saveProgressLocally === false
    ) {
      return;
    }

    try {
      sessionStorage.setItem(
        progressStorageKey(),
        JSON.stringify({
          currentStepId:
            state.currentStepId,
          completedSteps: [
            ...state.completedSteps
          ],
          updatedAt:
            new Date().toISOString()
        })
      );
    } catch (error) {
      console.warn(
        "[LaboratorApp] Progresul nu a putut fi salvat.",
        error
      );
    }
  }

  function restoreProgress() {
    if (
      state.generalConfig.workflow
        ?.saveProgressLocally === false
    ) {
      return;
    }

    try {
      const saved = JSON.parse(
        sessionStorage.getItem(
          progressStorageKey()
        ) || "null"
      );

      if (!saved) {
        return;
      }

      state.completedSteps =
        new Set(
          asArray(
            saved.completedSteps
          )
        );

      if (
        stepIndex(
          saved.currentStepId
        ) >= 0
      ) {
        state.currentStepId =
          saved.currentStepId;
      }
    } catch (error) {
      console.warn(
        "[LaboratorApp] Progresul anterior nu a putut fi restaurat.",
        error
      );
    }
  }

  function updateProgressInterface() {
    const steps = workflowSteps();

    const index = Math.max(
      0,
      stepIndex(
        state.currentStepId
      )
    );

    const percentage =
      steps.length > 1
        ? Math.round(
            index /
            (steps.length - 1) *
            100
          )
        : 100;

    for (
      const bar
      of document.querySelectorAll(
        ".lab-progress-bar, " +
        "[data-lab-progress-bar]"
      )
    ) {
      bar.style.setProperty(
        "--progress",
        `${percentage}%`
      );

      bar.style.width =
        `${percentage}%`;

      bar.setAttribute(
        "aria-valuenow",
        String(percentage)
      );
    }

    for (
      const text
      of document.querySelectorAll(
        ".lab-progress-text, " +
        "[data-lab-progress-text]"
      )
    ) {
      text.textContent =
        `Etapa ${index + 1} din ` +
        `${steps.length} — ` +
        `${percentage}%`;
    }

    for (
      const indicator
      of document.querySelectorAll(
        "[data-step-id], " +
        "[data-lab-step-indicator]"
      )
    ) {
      const id =
        indicator.dataset.stepId ||
        indicator.dataset
          .labStepIndicator;

      indicator.classList.toggle(
        "is-active",
        id === state.currentStepId
      );

      indicator.classList.toggle(
        "is-complete",
        state.completedSteps.has(id)
      );

      if (
        id === state.currentStepId
      ) {
        indicator.setAttribute(
          "aria-current",
          "step"
        );
      } else {
        indicator.removeAttribute(
          "aria-current"
        );
      }
    }
  }

  function updatePanels() {
    const panels =
      document.querySelectorAll(
        "[data-lab-step-panel]"
      );

    for (const panel of panels) {
      const active =
        panel.dataset.labStepPanel ===
        state.currentStepId;

      panel.hidden = !active;

      panel.classList.toggle(
        "is-active",
        active
      );
    }
  }

  function setCurrentStep(
    stepId,
    options = {}
  ) {
    if (stepIndex(stepId) < 0) {
      return false;
    }

    const currentIndex =
      stepIndex(
        state.currentStepId
      );

    const targetIndex =
      stepIndex(stepId);

    if (
      !options.force &&
      state.generalConfig.workflow
        ?.requireStepsInOrder &&
      targetIndex > currentIndex + 1
    ) {
      return false;
    }

    state.currentStepId = stepId;

    updatePanels();
    updateProgressInterface();
    saveProgress();

    emit(
      "laborator:step-change",
      {
        stepId,
        index: targetIndex
      }
    );

    if (options.focus !== false) {
      const panel =
        document.querySelector(
          `[data-lab-step-panel="${stepId}"]`
        );

      const heading =
        panel?.querySelector(
          "h1, h2, h3"
        );

      if (heading) {
        heading.tabIndex = -1;

        heading.focus({
          preventScroll: true
        });

        panel.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    }

    return true;
  }

  function completeStep(
    stepId,
    detail = {}
  ) {
    if (stepIndex(stepId) < 0) {
      return false;
    }

    state.completedSteps.add(stepId);

    state.componentData[stepId] =
      clone(detail);

    updateProgressInterface();
    saveProgress();

    emit(
      "laborator:step-complete",
      {
        stepId,
        detail
      }
    );

    return true;
  }

  function nextStep() {
    const steps = workflowSteps();

    const index =
      stepIndex(
        state.currentStepId
      );

    const current =
      steps[index];

    if (!current) {
      return false;
    }

    if (
      current.required !== false &&
      !state.completedSteps.has(
        current.id
      )
    ) {
      emit(
        "laborator:step-blocked",
        {
          stepId: current.id
        }
      );

      return false;
    }

    return steps[index + 1]
      ? setCurrentStep(
          steps[index + 1].id
        )
      : false;
  }

  function previousStep() {
    if (
      state.generalConfig.workflow
        ?.allowBackNavigation === false
    ) {
      return false;
    }

    const steps = workflowSteps();

    const index =
      stepIndex(
        state.currentStepId
      );

    return steps[index - 1]
      ? setCurrentStep(
          steps[index - 1].id,
          {
            force: true
          }
        )
      : false;
  }

  function registerWorkflowEvents() {
    const mappings = {
      "laborator:identification-complete":
        "identification",
      "laborator:safety-complete":
        "safety",
      "laborator:equipment-complete":
        "equipment",
      "laborator:notebook-complete":
        "initial-data",
      "laborator:evaluation-complete":
        "evaluation",
      "laborator:report-ready":
        "report"
    };

    for (
      const [eventName, stepId]
      of Object.entries(mappings)
    ) {
      document.addEventListener(
        eventName,
        event => {
          completeStep(
            stepId,
            event.detail || {}
          );

          if (
            eventName ===
              "laborator:identification-complete" &&
            state.currentStepId ===
              "identification"
          ) {
            setCurrentStep(
              "safety",
              {
                force: true
              }
            );
          }
        }
      );
    }

    document.addEventListener(
      "laborator:submission-sent",
      event => {
        completeStep(
          "report",
          event.detail || {}
        );
      }
    );

    document.addEventListener(
      "click",
      event => {
        const next =
          event.target.closest(
            '[data-action="next-step"]'
          );

        const previous =
          event.target.closest(
            '[data-action="previous-step"]'
          );

        const direct =
          event.target.closest(
            "[data-go-to-step]"
          );

        if (next) {
          event.preventDefault();
          nextStep();
        }

        if (previous) {
          event.preventDefault();
          previousStep();
        }

        if (direct) {
          event.preventDefault();

          setCurrentStep(
            direct.dataset.goToStep
          );
        }
      }
    );
  }

  async function initializeModules() {
    const modules = [
      [
        "LaboratorIdentificare",
        "identification"
      ],
      [
        "LaboratorSecuritate",
        "safety"
      ],
      [
        "LaboratorEchipamente",
        "equipmentSelection"
      ],
      [
        "LaboratorCaiet",
        "notebookForm"
      ],
      [
        "LaboratorEvaluare",
        "finalEvaluation"
      ],
      [
        "LaboratorRaport",
        "finalReport"
      ]
    ];

    for (
      const [globalName, componentId]
      of modules
    ) {
      const module =
        globalThis[globalName];

      const component =
        state.components.get(
          componentId
        );

      if (
        !module?.init ||
        !component
      ) {
        continue;
      }

      try {
        await module.init(
          component,
          state.experimentConfig
        );
      } catch (error) {
        showApplicationError(
          error,
          `Inițializarea ${globalName}`
        );
      }
    }

    if (
      globalThis
        .LaboratorGoogleSheets?.init
    ) {
      await globalThis
        .LaboratorGoogleSheets
        .init();
    }
  }

  async function init(
    options = {}
  ) {
    if (state.initialized) {
      return getState();
    }

    if (state.loading) {
      return ready;
    }

    state.loading = true;

    try {
      ensureApplicationRoot();

      state.generalConfig =
        await loadGeneralConfiguration();

      state.experimentConfig =
        validateExperimentConfig(
          options.experimentConfig ||
          globalThis
            .LAB_EXPERIMENT_CONFIG ||
          {}
        );

      globalThis.LAB_EXPERIMENT_CONFIG =
        state.experimentConfig;

      loadStyles();
      registerWorkflowEvents();

      state.currentStepId =
        workflowSteps()[0]?.id ||
        "identification";

      restoreProgress();

      await loadComponents();
      await loadModules();
      await initializeModules();

      updatePanels();
      updateProgressInterface();

      state.initialized = true;
      state.loading = false;

      document.documentElement
        .dataset.labReady = "true";

      emit(
        "laborator:app-ready",
        getState()
      );

      readyResolve(getState());

      return getState();
    } catch (error) {
      state.loading = false;

      showApplicationError(
        error,
        "Inițializarea aplicației"
      );

      readyReject(error);

      throw error;
    }
  }

  function getState() {
    return {
      initialized:
        state.initialized,
      currentStepId:
        state.currentStepId,
      completedSteps: [
        ...state.completedSteps
      ],
      errors: [
        ...state.errors
      ],
      componentData:
        clone(
          state.componentData
        ),
      experimentConfig:
        clone(
          state.experimentConfig
        )
    };
  }

  globalThis.LaboratorApp =
    Object.freeze({
      init,
      ready,
      nextStep,
      previousStep,
      setCurrentStep,
      completeStep,
      getState
    });

  const autoStart =
    SCRIPT_ELEMENT
      ?.dataset.autostart !==
    "false";

  if (autoStart) {
    const start = () =>
      init().catch(() => {});

    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        start,
        {
          once: true
        }
      );
    } else {
      start();
    }
  }
})();
