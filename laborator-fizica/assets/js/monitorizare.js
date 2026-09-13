/* ======================================================================
   FIZICA-LICEU - MONITORIZAREA ACTIVITATII IN PAGINA LABORATORULUI

   Incarcare recomandata:
   <script src="../assets/js/monitorizare.js" defer></script>

   Limitare importanta:
   Browserul poate raporta doar evenimente legate de pagina laboratorului.
   Modulul nu vede ce aplicatie, site sau continut a accesat elevul.

   API public: window.LaboratorMonitorizare
   Eveniment emis: laborator:monitoring-update
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
    "fizica-laborator-monitorizare";

  const state = {
    initialized: false,
    active: false,
    paused: false,
    startedAt: null,
    stoppedAt: null,
    sessionId: null,
    configuration: null,
    controller: null,
    hadFullscreen: false,

    counters: {
      tabSwitches: 0,
      windowBlurs: 0,
      fullscreenExits: 0,
      copyAttempts: 0,
      cutAttempts: 0,
      pasteAttempts: 0,
      contextMenuAttempts: 0,
      blockedShortcuts: 0
    },

    events: []
  };

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

  function storageKey() {
    return (
      `${STORAGE_PREFIX}:` +
      `${state.sessionId || "fara-sesiune"}`
    );
  }

  function saveState() {
    try {
      sessionStorage.setItem(
        storageKey(),
        JSON.stringify(getState())
      );
    } catch (error) {
      console.warn(
        "[LaboratorMonitorizare] Starea nu a putut fi salvată local.",
        error
      );
    }
  }

  function restoreState() {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(
          storageKey()
        ) || "null"
      );

      if (
        !saved ||
        saved.sessionId !==
          state.sessionId
      ) {
        return;
      }

      state.startedAt =
        saved.startedAt ||
        state.startedAt;

      state.hadFullscreen =
        Boolean(saved.hadFullscreen);

      state.counters = {
        ...state.counters,
        ...(saved.counters || {})
      };

      state.events =
        Array.isArray(saved.events)
          ? saved.events
          : [];
    } catch (error) {
      console.warn(
        "[LaboratorMonitorizare] Starea anterioară nu a putut fi restaurată.",
        error
      );
    }
  }

  function maximumEvents() {
    return Math.max(
      10,
      Number(
        state.configuration
          ?.maximumStoredEvents ||
        200
      )
    );
  }

  function createEvent(
    type,
    details = {}
  ) {
    return {
      index: state.events.length + 1,
      type,
      timestamp:
        new Date().toISOString(),

      elapsedSeconds:
        state.startedAt
          ? Math.max(
              0,
              Math.round(
                (
                  Date.now() -
                  Date.parse(
                    state.startedAt
                  )
                ) / 1000
              )
            )
          : 0,

      ...details
    };
  }

  function publish() {
    const snapshot = getState();

    globalThis.LAB_MONITORING =
      clone(snapshot);

    updateInterface(snapshot);

    document.dispatchEvent(
      new CustomEvent(
        "laborator:monitoring-update",
        {
          detail: clone(snapshot)
        }
      )
    );

    saveState();
  }

  function log(
    type,
    counterName = null,
    details = {}
  ) {
    if (
      !state.active ||
      state.paused
    ) {
      return;
    }

    if (
      counterName &&
      Object.hasOwn(
        state.counters,
        counterName
      )
    ) {
      state.counters[counterName] += 1;
    }

    state.events.push(
      createEvent(type, details)
    );

    if (
      state.events.length >
      maximumEvents()
    ) {
      state.events.splice(
        0,
        state.events.length -
          maximumEvents()
      );

      state.events.forEach(
        (event, index) => {
          event.index = index + 1;
        }
      );
    }

    publish();
  }

  function updateInterface(snapshot) {
    const values = {
      tabSwitches:
        snapshot.counters.tabSwitches,

      windowBlurs:
        snapshot.counters.windowBlurs,

      fullscreenExits:
        snapshot.counters.fullscreenExits,

      copyAttempts:
        snapshot.counters.copyAttempts,

      cutAttempts:
        snapshot.counters.cutAttempts,

      pasteAttempts:
        snapshot.counters.pasteAttempts,

      contextMenuAttempts:
        snapshot.counters
          .contextMenuAttempts,

      blockedShortcuts:
        snapshot.counters
          .blockedShortcuts
    };

    for (
      const [name, value]
      of Object.entries(values)
    ) {
      for (
        const element
        of document.querySelectorAll(
          `[data-monitoring-count="${name}"]`
        )
      ) {
        element.textContent =
          String(value);
      }
    }

    for (
      const element
      of document.querySelectorAll(
        "[data-monitoring-status]"
      )
    ) {
      element.textContent =
        snapshot.active
          ? "Monitorizare activă"
          : "Monitorizare oprită";

      element.dataset.status =
        snapshot.active
          ? "active"
          : "stopped";
    }
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    const ignored =
      state.configuration
        ?.ignoredElements ||
      [
        "input",
        "textarea",
        "select",
        "[contenteditable='true']"
      ];

    return ignored.some(selector => {
      try {
        return Boolean(
          target.closest(selector)
        );
      } catch (_) {
        return false;
      }
    });
  }

  function shouldPrevent(
    action,
    target
  ) {
    if (
      !state.configuration
        ?.prevention?.[action]
    ) {
      return false;
    }

    if (
      action === "copy" ||
      action === "cut"
    ) {
      return !isEditableTarget(target);
    }

    return true;
  }

  function handleVisibilityChange() {
    if (
      !state.configuration
        ?.events?.visibilityChange
    ) {
      return;
    }

    if (
      document.visibilityState ===
      "hidden"
    ) {
      log(
        "page-hidden",
        "tabSwitches",
        {
          visibilityState:
            document.visibilityState
        }
      );
    } else if (
      state.active &&
      !state.paused
    ) {
      log(
        "page-visible",
        null,
        {
          visibilityState:
            document.visibilityState
        }
      );
    }
  }

  function handleWindowBlur() {
    if (
      !state.configuration
        ?.events?.windowBlur
    ) {
      return;
    }

    log(
      "window-blur",
      "windowBlurs"
    );
  }

  function handleWindowFocus() {
    if (
      state.active &&
      !state.paused
    ) {
      log("window-focus");
    }
  }

  function handleFullscreenChange() {
    if (document.fullscreenElement) {
      state.hadFullscreen = true;

      log("fullscreen-entered");

      return;
    }

    if (
      state.hadFullscreen &&
      state.configuration
        ?.events?.fullscreenExit
    ) {
      log(
        "fullscreen-exited",
        "fullscreenExits"
      );
    }
  }

  function handleClipboardEvent(
    event,
    action,
    counterName
  ) {
    if (
      !state.configuration
        ?.events?.[action]
    ) {
      return;
    }

    const prevented = shouldPrevent(
      action,
      event.target
    );

    if (prevented) {
      event.preventDefault();
    }

    log(
      `${action}-attempt`,
      counterName,
      {
        prevented,
        editableTarget:
          isEditableTarget(
            event.target
          )
      }
    );
  }

  function handleContextMenu(event) {
    if (
      !state.configuration
        ?.events?.contextMenu
    ) {
      return;
    }

    const prevented = shouldPrevent(
      "contextMenu",
      event.target
    );

    if (prevented) {
      event.preventDefault();
    }

    log(
      "context-menu-attempt",
      "contextMenuAttempts",
      {
        prevented,
        editableTarget:
          isEditableTarget(
            event.target
          )
      }
    );
  }

  function shortcutAction(event) {
    if (
      !(event.ctrlKey || event.metaKey) ||
      event.altKey
    ) {
      return null;
    }

    const key =
      event.key.toLocaleLowerCase(
        "en-US"
      );

    if (key === "c") {
      return {
        action: "copy",
        counter: "copyAttempts"
      };
    }

    if (key === "x") {
      return {
        action: "cut",
        counter: "cutAttempts"
      };
    }

    if (key === "v") {
      return {
        action: "paste",
        counter: "pasteAttempts"
      };
    }

    return null;
  }

  function handleKeyboardShortcut(
    event
  ) {
    if (
      !state.configuration
不得        ?.events?.keyboardShortcuts
    ) {
      return;
    }

    const shortcut =
      shortcutAction(event);

    if (!shortcut) {
      return;
    }

    const prevented = shouldPrevent(
      shortcut.action,
      event.target
    );

    if (!prevented) {
      return;
    }

    event.preventDefault();

    log(
      `${shortcut.action}-shortcut-attempt`,
      shortcut.counter,
      {
        prevented: true,
        editableTarget:
          isEditableTarget(
            event.target
          ),
        key: event.key
      }
    );

    state.counters
      .blockedShortcuts += 1;

    publish();
  }

  function handleSelectionStart(event) {
    if (
      !state.configuration
        ?.prevention
        ?.selectionOutsideInputs
    ) {
      return;
    }

    if (
      !isEditableTarget(event.target)
    ) {
      event.preventDefault();
    }
  }

  function pause(
    reason = "manual"
  ) {
    if (
      !state.active ||
      state.paused
    ) {
      return;
    }

    state.paused = true;

    state.events.push(
      createEvent(
        "monitoring-paused",
        {
          reason
        }
      )
    );

    publish();
  }

  function resume(
    reason = "manual"
  ) {
    if (
      !state.active ||
      !state.paused
    ) {
      return;
    }

    state.paused = false;

    state.events.push(
      createEvent(
        "monitoring-resumed",
        {
          reason
        }
      )
    );

    publish();
  }

  function registerListeners() {
    state.controller?.abort();

    state.controller =
      new AbortController();

    const options = {
      signal:
        state.controller.signal
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
      options
    );

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange,
      options
    );

    document.addEventListener(
      "copy",
      event =>
        handleClipboardEvent(
          event,
          "copy",
          "copyAttempts"
        ),
      options
    );

    document.addEventListener(
      "cut",
      event =>
        handleClipboardEvent(
          event,
          "cut",
          "cutAttempts"
        ),
      options
    );

    document.addEventListener(
      "paste",
      event =>
        handleClipboardEvent(
          event,
          "paste",
          "pasteAttempts"
        ),
      options
    );

    document.addEventListener(
      "contextmenu",
      handleContextMenu,
      options
    );

    document.addEventListener(
      "keydown",
      handleKeyboardShortcut,
      options
    );

    document.addEventListener(
      "selectstart",
      handleSelectionStart,
      options
    );

    globalThis.addEventListener(
      "blur",
      handleWindowBlur,
      options
    );

    globalThis.addEventListener(
      "focus",
      handleWindowFocus,
      options
    );

    globalThis.addEventListener(
      "beforeprint",
      () => pause("print"),
      options
    );

    globalThis.addEventListener(
      "afterprint",
      () => resume("print"),
      options
    );

    document.addEventListener(
      "laborator:submission-start",
      () => pause("submission"),
      options
    );

    document.addEventListener(
      "laborator:submission-failed",
      () =>
        resume(
          "submission-failed"
        ),
      options
    );

    document.addEventListener(
      "laborator:submission-sent",
      () => {
        if (
          state.configuration
            ?.stopAfterSubmission !==
          false
        ) {
          stop("submission-sent");
        } else {
          resume("submission-sent");
        }
      },
      options
    );
  }

  function start(
    session =
      globalThis.LAB_SESSION ||
      {}
  ) {
    if (!state.initialized) {
      throw new Error(
        "Modulul de monitorizare nu este inițializat."
      );
    }

    if (
      !state.configuration?.enabled
    ) {
      return false;
    }

    if (
      state.configuration
        .requiresAcknowledgement &&
      !session.monitoringAcknowledged
    ) {
      throw new Error(
        "Monitorizarea nu poate începe înaintea confirmării elevului."
      );
    }

    if (state.active) {
      return true;
    }

    state.sessionId =
      session.sessionId ||
      state.sessionId ||
      "fara-sesiune";

    restoreState();

    state.startedAt =
      state.startedAt ||
      new Date().toISOString();

    state.stoppedAt = null;
    state.active = true;
    state.paused = false;

    state.hadFullscreen =
      Boolean(
        document.fullscreenElement
      ) ||
      state.hadFullscreen;

    registerListeners();

    state.events.push(
      createEvent(
        "monitoring-started",
        {
          disclosureAccepted:
            Boolean(
              session
                .monitoringAcknowledged
            )
        }
      )
    );

    publish();

    return true;
  }

  function stop(
    reason = "manual"
  ) {
    if (!state.active) {
      return getState();
    }

    state.events.push(
      createEvent(
        "monitoring-stopped",
        {
          reason
        }
      )
    );

    state.active = false;
    state.paused = false;

    state.stoppedAt =
      new Date().toISOString();

    state.controller?.abort();
    state.controller = null;

    publish();

    return getState();
  }

  function reset() {
    state.controller?.abort();

    try {
      sessionStorage.removeItem(
        storageKey()
      );
    } catch (_) {
      // Nu este necesară nicio acțiune.
    }

    state.active = false;
    state.paused = false;
    state.startedAt = null;
    state.stoppedAt = null;
    state.hadFullscreen = false;
    state.events = [];

    for (
      const key
      of Object.keys(state.counters)
    ) {
      state.counters[key] = 0;
    }

    publish();
  }

  function getState() {
    return {
      sessionId:
        state.sessionId,

      active:
        state.active,

      paused:
        state.paused,

      startedAt:
        state.startedAt,

      stoppedAt:
        state.stoppedAt,

      hadFullscreen:
        state.hadFullscreen,

      counters: {
        ...state.counters
      },

      tabSwitches:
        state.counters.tabSwitches,

      windowBlurs:
        state.counters.windowBlurs,

      fullscreenExits:
        state.counters.fullscreenExits,

      copyAttempts:
        state.counters.copyAttempts,

      cutAttempts:
        state.counters.cutAttempts,

      pasteAttempts:
        state.counters.pasteAttempts,

      contextMenuAttempts:
        state.counters
          .contextMenuAttempts,

      blockedShortcuts:
        state.counters
          .blockedShortcuts,

      events:
        clone(state.events),

      limitationNotice:
        "Sunt înregistrate numai evenimentele observabile în pagina laboratorului; destinația schimbării de fereastră nu poate fi identificată."
    };
  }

  async function init(
    options = {}
  ) {
    if (state.initialized) {
      return getState();
    }

    try {
      const general =
        await loadGeneralConfig();

      state.configuration = {
        enabled: true,
        requiresAcknowledgement: true,
        startAfterIdentification: true,
        stopAfterSubmission: true,
        maximumStoredEvents: 200,
        events: {},
        prevention: {},
        ...(general.monitoring || {}),
        ...(options.monitoring ||
          options ||
          {})
      };

      state.initialized = true;

      document.addEventListener(
        "laborator:identification-complete",
        event => {
          if (
            state.configuration
              .startAfterIdentification !==
            false
          ) {
            start(
              event.detail ||
              globalThis.LAB_SESSION ||
              {}
            );
          }
        }
      );

      const session =
        globalThis.LAB_SESSION;

      if (
        session?.monitoringAcknowledged &&
        state.configuration
          .startAfterIdentification !==
        false
      ) {
        start(session);
      }

      document.dispatchEvent(
        new CustomEvent(
          "laborator:monitoring-ready",
          {
            detail: {
              enabled: Boolean(
                state.configuration
                  .enabled
              )
            }
          }
        )
      );

      return getState();
    } catch (error) {
      console.error(
        "[LaboratorMonitorizare]",
        error
      );

      return null;
    }
  }

  globalThis.LaboratorMonitorizare =
    Object.freeze({
      init,
      start,
      stop,
      pause,
      resume,
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
