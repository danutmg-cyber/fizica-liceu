/* ======================================================================
   FIZICA-LICEU - NAVIGAREA INTRE ETAPELE LABORATORULUI

   Incarcare recomandata:
   <script src="../assets/js/navigare.js" defer></script>

   Marcaje HTML recunoscute:
   - data-lab-step-panel="identification"
   - data-lab-step-indicator="identification"
   - data-action="previous-step"
   - data-action="next-step"
   - data-go-to-step="safety"

   API public: window.LaboratorNavigare
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

  const STORAGE_PREFIX =
    "fizica-laborator-navigare";

  const state = {
    initialized: false,
    generalConfig: null,
    experimentConfig: null,
    steps: [],
    currentStepId: null,
    completedSteps: new Set(),
    ownsNavigation: false,
    controller: null
  };

  const asArray = value =>
    Array.isArray(value) ? value : [];

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

    return JSON.parse(
      JSON.stringify(value)
    );
  }

  async function loadGeneralConfig() {
    if (globalThis.LAB_GENERAL_CONFIG) {
      return globalThis.LAB_GENERAL_CONFIG;
    }

    const response = await fetch(
      DEFAULT_CONFIG_URL,
      {
        cache: "no-cache"
      }
    );

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

  function experimentId() {
    return (
      state.experimentConfig?.id ||
      state.experimentConfig?.slug ||
      globalThis.location?.pathname
        ?.split("/")
        .pop()
        ?.replace(/\.html?$/i, "") ||
      "experiment"
    );
  }

  function storageKey() {
    const configuredPrefix =
      state.generalConfig?.session
        ?.storagePrefix;

    return (
      `${configuredPrefix || STORAGE_PREFIX}` +
      `:navigare:${experimentId()}`
    );
  }

  function stepIndex(stepId) {
    return state.steps.findIndex(
      step => step.id === stepId
    );
  }

  function currentIndex() {
    return Math.max(
      0,
      stepIndex(state.currentStepId)
    );
  }

  function getStep(stepId) {
    return state.steps.find(
      step => step.id === stepId
    ) || null;
  }

  function saveState() {
    if (
      state.generalConfig?.workflow
        ?.saveProgressLocally === false
    ) {
      return;
    }

    try {
      sessionStorage.setItem(
        storageKey(),
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
        "[LaboratorNavigare] Progresul nu a putut fi salvat.",
        error
      );
    }
  }

  function restoreState() {
    if (
      state.generalConfig?.workflow
        ?.saveProgressLocally === false
    ) {
      return;
    }

    try {
      const saved = JSON.parse(
        sessionStorage.getItem(
          storageKey()
        ) || "null"
      );

      if (!saved) {
        return;
      }

      const completed = asArray(
        saved.completedSteps
      ).filter(
        id => stepIndex(id) >= 0
      );

      state.completedSteps =
        new Set(completed);

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
        "[LaboratorNavigare] Progresul anterior nu a putut fi restaurat.",
        error
      );
    }
  }

  function progressPercent() {
    if (state.steps.length <= 1) {
      return 100;
    }

    return Math.round(
      currentIndex() /
      (state.steps.length - 1) *
      100
    );
  }

  function updateProgress() {
    const percentage =
      progressPercent();

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
        "role",
        "progressbar"
      );

      bar.setAttribute(
        "aria-valuemin",
        "0"
      );

      bar.setAttribute(
        "aria-valuemax",
        "100"
      );

      bar.setAttribute(
        "aria-valuenow",
        String(percentage)
      );

      bar.setAttribute(
        "aria-label",
        "Progresul laboratorului"
      );
    }

    for (
      const text
      of document.querySelectorAll(
        ".lab-progress-text, " +
        "[data-lab-progress-text]"
      )
    ) {
      const step = getStep(
        state.currentStepId
      );

      text.textContent =
        `Etapa ${currentIndex() + 1} ` +
        `din ${state.steps.length}: ` +
        `${step?.label || state.currentStepId} ` +
        `— ${percentage}%`;
    }
  }

  function updateIndicators() {
    for (
      const indicator
      of document.querySelectorAll(
        "[data-lab-step-indicator], " +
        "[data-step-id]"
      )
    ) {
      const stepId =
        indicator.dataset
          .labStepIndicator ||
        indicator.dataset.stepId;

      const index =
        stepIndex(stepId);

      const active =
        stepId === state.currentStepId;

      const complete =
        state.completedSteps.has(stepId);

      const locked = Boolean(
        state.generalConfig?.workflow
          ?.requireStepsInOrder &&
        index > currentIndex() + 1 &&
        !complete
      );

      indicator.classList.toggle(
        "is-active",
        active
      );

      indicator.classList.toggle(
        "is-complete",
        complete
      );

      indicator.classList.toggle(
        "is-locked",
        locked
      );

      indicator.setAttribute(
        "aria-disabled",
        String(locked)
      );

      if (active) {
        indicator.setAttribute(
          "aria-current",
          "step"
        );
      } else {
        indicator.removeAttribute(
          "aria-current"
        );
      }

      if (
        indicator instanceof
        HTMLButtonElement
      ) {
        indicator.disabled = locked;
      }
    }
  }

  function updatePanels() {
    for (
      const panel
      of document.querySelectorAll(
        "[data-lab-step-panel]"
      )
    ) {
      const active =
        panel.dataset.labStepPanel ===
        state.currentStepId;

      panel.hidden = !active;

      panel.classList.toggle(
        "is-active",
        active
      );

      panel.setAttribute(
        "aria-hidden",
        String(!active)
      );
    }
  }

  function updateButtons() {
    const index = currentIndex();
    const current =
      state.steps[index];

    const canContinue =
      current?.required === false ||
      state.completedSteps.has(
        current?.id
      );

    for (
      const button
      of document.querySelectorAll(
        '[data-action="previous-step"]'
      )
    ) {
      button.disabled =
        index <= 0 ||
        state.generalConfig?.workflow
          ?.allowBackNavigation === false;
    }

    for (
      const button
      of document.querySelectorAll(
        '[data-action="next-step"]'
      )
    ) {
      button.disabled =
        index >= state.steps.length - 1 ||
        !canContinue;

      button.setAttribute(
        "aria-disabled",
        String(button.disabled)
      );

      const next =
        state.steps[index + 1];

      if (next) {
        button.dataset.nextStep =
          next.id;
      } else {
        delete button.dataset.nextStep;
      }
    }
  }

  function updateInterface() {
    updatePanels();
    updateProgress();
    updateIndicators();
    updateButtons();
  }

  function showNavigationMessage(
    message,
    type = "warning"
  ) {
    let feedback =
      document.querySelector(
        "[data-navigation-feedback]"
      );

    if (!feedback) {
      feedback =
        document.createElement("p");

      feedback.dataset
        .navigationFeedback = "";

      feedback.setAttribute(
        "role",
        "status"
      );

      feedback.setAttribute(
        "aria-live",
        "polite"
      );

      const actions =
        document.querySelector(
          ".lab-actions, " +
          "[data-lab-navigation]"
        );

      actions?.before(feedback);
    }

    if (!feedback) {
      return;
    }

    feedback.className =
      `lab-feedback is-${type}`;

    feedback.textContent = message;
  }

  function clearNavigationMessage() {
    const feedback =
      document.querySelector(
        "[data-navigation-feedback]"
      );

    if (feedback) {
      feedback.textContent = "";
    }
  }

  function focusCurrentPanel() {
    const panel =
      document.querySelector(
        `[data-lab-step-panel="${state.currentStepId}"]`
      );

    if (!panel) {
      return;
    }

    const heading =
      panel.querySelector(
        "h1, h2, h3"
      );

    if (heading) {
      heading.tabIndex = -1;

      heading.focus({
        preventScroll: true
      });
    }

    const reducedMotion =
      globalThis.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      )?.matches;

    panel.scrollIntoView({
      behavior: reducedMotion
        ? "auto"
        : "smooth",

      block: "start"
    });
  }

  function canOpenStep(stepId) {
    const targetIndex =
      stepIndex(stepId);

    if (targetIndex < 0) {
      return false;
    }

    if (
      !state.generalConfig?.workflow
        ?.requireStepsInOrder
    ) {
      return true;
    }

    if (
      targetIndex <=
      currentIndex() + 1
    ) {
      return true;
    }

    return state.completedSteps.has(
      stepId
    );
  }

  function setCurrentStep(
    stepId,
    options = {}
  ) {
    if (
      !canOpenStep(stepId) &&
      !options.force
    ) {
      showNavigationMessage(
        "Finalizează etapele anterioare înainte de a continua.",
        "warning"
      );

      return false;
    }

    if (stepIndex(stepId) < 0) {
      return false;
    }

    state.currentStepId = stepId;

    clearNavigationMessage();
    updateInterface();
    saveState();

    if (options.focus !== false) {
      focusCurrentPanel();
    }

    document.dispatchEvent(
      new CustomEvent(
        "laborator:step-change",
        {
          detail: {
            stepId,
            index:
              stepIndex(stepId)
          }
        }
      )
    );

    return true;
  }

  function completeStep(
    stepId,
    detail = {}
  ) {
    if (
      globalThis.LaboratorApp
        ?.completeStep
    ) {
      return globalThis.LaboratorApp
        .completeStep(
          stepId,
          detail
        );
    }

    if (stepIndex(stepId) < 0) {
      return false;
    }

    state.completedSteps.add(stepId);

    updateInterface();
    saveState();

    document.dispatchEvent(
      new CustomEvent(
        "laborator:step-complete",
        {
          detail: {
            stepId,
            detail: clone(detail)
          }
        }
      )
    );

    return true;
  }

  function standaloneNext() {
    const step = getStep(
      state.currentStepId
    );

    if (!step) {
      return false;
    }

    if (
      step.required !== false &&
      !state.completedSteps.has(
        step.id
      )
    ) {
      showNavigationMessage(
        state.generalConfig?.messages
          ?.stepLocked ||
        "Finalizează etapa curentă înainte de a continua.",
        "warning"
      );

      document.dispatchEvent(
        new CustomEvent(
          "laborator:step-blocked",
          {
            detail: {
              stepId: step.id
            }
          }
        )
      );

      return false;
    }

    const next =
      state.steps[
        currentIndex() + 1
      ];

    return next
      ? setCurrentStep(next.id)
      : false;
  }

  function standalonePrevious() {
    if (
      state.generalConfig?.workflow
        ?.allowBackNavigation === false
    ) {
      return false;
    }

    const previous =
      state.steps[
        currentIndex() - 1
      ];

    return previous
      ? setCurrentStep(
          previous.id,
          {
            force: true
          }
        )
      : false;
  }

  function nextStep() {
    return globalThis.LaboratorApp
      ?.nextStep
      ? globalThis.LaboratorApp
          .nextStep()
      : standaloneNext();
  }

  function previousStep() {
    return globalThis.LaboratorApp
      ?.previousStep
      ? globalThis.LaboratorApp
          .previousStep()
      : standalonePrevious();
  }

  function goToStep(stepId) {
    return globalThis.LaboratorApp
      ?.setCurrentStep
      ? globalThis.LaboratorApp
          .setCurrentStep(stepId)
      : setCurrentStep(stepId);
  }

  function handleNavigationClick(
    event
  ) {
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
    } else if (previous) {
      event.preventDefault();
      previousStep();
    } else if (direct) {
      event.preventDefault();

      goToStep(
        direct.dataset.goToStep
      );
    }
  }

  function registerStandaloneClicks() {
    if (globalThis.LaboratorApp) {
      state.ownsNavigation = false;
      return;
    }

    state.ownsNavigation = true;

    document.addEventListener(
      "click",
      handleNavigationClick,
      {
        signal:
          state.controller.signal
      }
    );
  }

  function synchronizeFromApp(event) {
    const appState =
      event?.detail?.currentStepId
        ? event.detail
        : globalThis.LaboratorApp
            ?.getState?.();

    if (!appState) {
      return;
    }

    state.currentStepId =
      appState.currentStepId ||
      state.currentStepId;

    state.completedSteps =
      new Set(
        asArray(
          appState.completedSteps
        )
      );

    updateInterface();
  }

  function handleAppReady(event) {
    if (
      state.ownsNavigation &&
      globalThis.LaboratorApp
    ) {
      state.controller?.abort();
      state.controller = null;
      registerEvents();
    }

    synchronizeFromApp(event);
  }

  function registerEvents() {
    state.controller?.abort();

    state.controller =
      new AbortController();

    const options = {
      signal:
        state.controller.signal
    };

    registerStandaloneClicks();

    document.addEventListener(
      "laborator:app-ready",
      handleAppReady,
      options
    );

    document.addEventListener(
      "laborator:step-change",
      event => {
        if (event.detail?.stepId) {
          state.currentStepId =
            event.detail.stepId;
        }

        updateInterface();
      },
      options
    );

    document.addEventListener(
      "laborator:step-complete",
      event => {
        if (event.detail?.stepId) {
          state.completedSteps.add(
            event.detail.stepId
          );
        }

        updateInterface();
        saveState();
      },
      options
    );

    document.addEventListener(
      "laborator:step-blocked",
      () => {
        showNavigationMessage(
          state.generalConfig
            ?.messages?.stepLocked ||
          "Finalizează etapa curentă înainte de a continua.",
          "warning"
        );
      },
      options
    );
  }

  function reset() {
    state.completedSteps.clear();

    state.currentStepId =
      state.steps[0]?.id || null;

    try {
      sessionStorage.removeItem(
        storageKey()
      );
    } catch (_) {
      // Nu este necesară nicio acțiune.
    }

    updateInterface();
  }

  function getState() {
    return {
      initialized:
        state.initialized,

      ownsNavigation:
        state.ownsNavigation,

      currentStepId:
        state.currentStepId,

      currentStepIndex:
        currentIndex(),

      completedSteps: [
        ...state.completedSteps
      ],

      progressPercent:
        progressPercent(),

      steps:
        clone(state.steps)
    };
  }

  async function init(
    options = {}
  ) {
    if (state.initialized) {
      return getState();
    }

    try {
      state.generalConfig =
        await loadGeneralConfig();

      state.experimentConfig =
        options.experimentConfig ||
        globalThis
          .LAB_EXPERIMENT_CONFIG ||
        {};

      state.steps =
        asArray(options.steps).length
          ? clone(options.steps)
          : clone(
              state.generalConfig
                .workflow?.steps ||
              []
            );

      if (!state.steps.length) {
        throw new Error(
          "Nu sunt configurate etapele laboratorului."
        );
      }

      state.currentStepId =
        state.steps[0].id;

      restoreState();
      registerEvents();

      state.initialized = true;

      synchronizeFromApp();
      updateInterface();

      document.dispatchEvent(
        new CustomEvent(
          "laborator:navigation-ready",
          {
            detail: getState()
          }
        )
      );

      return getState();
    } catch (error) {
      console.error(
        "[LaboratorNavigare]",
        error
      );

      showNavigationMessage(
        error.message ||
        "Navigarea nu a putut fi inițializată.",
        "error"
      );

      return null;
    }
  }

  globalThis.LaboratorNavigare =
    Object.freeze({
      init,
      nextStep,
      previousStep,
      goToStep,
      completeStep,
      reset,
      getState
    });

  if (
    document.readyState === "loading"
  ) {
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
