/* ======================================================================
   FIZICA-LICEU - SELECTAREA ECHIPAMENTELOR

   Incarcare recomandata in pagina experimentului:
   <script src="../assets/js/echipamente.js" defer></script>

   Configuratie minima a experimentului:
   window.LAB_EXPERIMENT_CONFIG = {
     title: "Titlul experimentului",
     domain: "thermal",
     risks: ["thermal", "glass"],
     equipment: {
       required: ["lab-coat", "safety-glasses", "calorimeter"],
       optional: ["paper-towels"],
       distractors: ["ammeter", "optical-prism"]
     }
   };

   Biblioteca expune window.LaboratorEchipamente si emite evenimentul:
   laborator:equipment-complete
   ====================================================================== */

(() => {
  "use strict";

  const SCRIPT_URL = document.currentScript?.src || document.baseURI;
  const DEFAULT_CATALOG_URL = new URL("../data/echipamente.json", SCRIPT_URL).href;
  const COMPONENT_SELECTOR = '[data-lab-component="selectie-echipamente"]';
  const INITIALIZED_ATTRIBUTE = "data-equipment-initialized";

  const state = {
    root: null,
    form: null,
    catalog: null,
    options: null,
    experiment: null,
    requiredIds: new Set(),
    displayedIds: new Set(),
    protectionVerified: false,
    apparatusVerified: false,
    completed: false,
    selectedAt: null
  };

  const asArray = value => Array.isArray(value) ? value : [];
  const unique = values => [...new Set(values.filter(Boolean))];
  const query = (selector, root = state.root) => root?.querySelector(selector) || null;
  const queryAll = (selector, root = state.root) => [...(root?.querySelectorAll(selector) || [])];

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function getExperimentConfiguration(configuration = {}) {
    const equipment = configuration.equipment || {};
    const required = unique([
      ...asArray(equipment.required),
      ...asArray(equipment.requiredEquipment),
      ...asArray(configuration.requiredEquipment),
      ...asArray(configuration.equipmentRequired)
    ]);
    const optional = unique([
      ...asArray(equipment.optional),
      ...asArray(equipment.optionalEquipment),
      ...asArray(configuration.optionalEquipment)
    ]);
    const distractors = unique([
      ...asArray(equipment.distractors),
      ...asArray(equipment.distractorEquipment),
      ...asArray(configuration.distractorEquipment)
    ]);
    const domains = unique([
      ...asArray(configuration.domains),
      ...asArray(configuration.physicsDomains),
      configuration.domain,
      configuration.physicsDomain
    ]);

    return {
      title: normalizeText(configuration.title || configuration.experimentTitle || "Experiment de fizicÄƒ"),
      domains,
      risks: unique([
        ...asArray(configuration.risks),
        ...asArray(configuration.safetyDomains),
        ...asArray(configuration.safety?.domains)
      ]),
      required,
      optional,
      distractors
    };
  }

  function shuffle(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      let randomValue;
      if (globalThis.crypto?.getRandomValues) {
        const buffer = new Uint32Array(1);
        globalThis.crypto.getRandomValues(buffer);
        randomValue = buffer[0] / 4294967296;
      } else {
        randomValue = Math.random();
      }
      const target = Math.floor(randomValue * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Catalogul echipamentelor nu a putut fi Ã®ncÄƒrcat (${response.status}).`);
    }
    return response.json();
  }

  function validateCatalog(catalog) {
    if (!catalog || !Array.isArray(catalog.items) || !Array.isArray(catalog.categories)) {
      throw new TypeError("Structura fiÈ™ierului echipamente.json nu este validÄƒ.");
    }

    const itemIds = new Set();
    for (const item of catalog.items) {
      if (!item?.id || !item?.name || !item?.category) {
        throw new TypeError("Un echipament nu are identificator, nume sau categorie.");
      }
      if (itemIds.has(item.id)) {
        throw new TypeError(`Identificator de echipament duplicat: ${item.id}`);
      }
      itemIds.add(item.id);
    }
    return catalog;
  }

  function getItemMap() {
    return new Map(state.catalog.items.map(item => [item.id, item]));
  }

  function setText(selector, value) {
    const element = query(selector);
    if (element) element.textContent = value || "â€”";
  }

  function setFeedback(section, message, type = "") {
    const element = query(`[data-equipment-feedback="${section}"]`);
    if (!element) return;
    element.textContent = message;
    element.classList.remove("is-success", "is-warning", "is-error");
    if (type) element.classList.add(`is-${type}`);
  }

  function announceLoading(message, type = "info") {
    const element = query("[data-equipment-loading-status]");
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.classList.remove("lab-info", "lab-danger", "lab-success");
    element.classList.add(type === "error" ? "lab-danger" : type === "success" ? "lab-success" : "lab-info");
  }

  function resolveRequiredIds(itemMap) {
    const configured = state.experiment.required;
    const defaults = asArray(state.options.defaultProtectiveEquipment || ["lab-coat"]);
    const required = unique([...defaults, ...configured]);
    const unknown = required.filter(id => !itemMap.has(id));
    if (unknown.length) {
      throw new Error(`Echipamente inexistente Ã®n catalog: ${unknown.join(", ")}`);
    }
    return new Set(required);
  }

  function chooseDisplayedItems(itemMap) {
    const protectionIds = new Set(
      state.catalog.items.filter(item => item.category === "protection").map(item => item.id)
    );
    const requiredApparatus = [...state.requiredIds].filter(id => !protectionIds.has(id));
    const optional = state.experiment.optional.filter(id => itemMap.has(id) && !protectionIds.has(id));
    let distractors = state.experiment.distractors.filter(id => itemMap.has(id) && !protectionIds.has(id));

    if (!distractors.length) {
      const candidates = state.catalog.items.filter(item => {
        if (item.category === "protection" || state.requiredIds.has(item.id) || optional.includes(item.id)) return false;
        if (!state.experiment.domains.length) return true;
        return asArray(item.domains).some(domain => state.experiment.domains.includes(domain));
      });
      distractors = shuffle(candidates.map(item => item.id));
    }

    const maximumDistractors = Number.isInteger(state.options.maximumDistractorsPerExperiment)
      ? state.options.maximumDistractorsPerExperiment
      : Number(state.catalog.selectionRules?.maximumDistractorsPerExperiment ?? 6);

    return shuffle(unique([
      ...requiredApparatus,
      ...optional,
      ...distractors.slice(0, Math.max(0, maximumDistractors))
    ])).map(id => itemMap.get(id)).filter(Boolean);
  }

  function configureProtectionCards(itemMap) {
    for (const card of queryAll('[data-equipment-stage="protection"] [data-equipment-card]')) {
      const id = card.dataset.equipmentId;
      const item = itemMap.get(id);
      const input = card.querySelector("[data-equipment-checkbox]");
      const badge = card.querySelector("[data-required-badge]");
      if (!item || !input) {
        card.hidden = true;
        continue;
      }
      card.hidden = false;
      input.value = id;
      input.dataset.equipmentCategory = item.category;
      input.dataset.equipmentName = item.name;
      input.setAttribute("aria-label", item.name);
      input.checked = false;
      if (badge) badge.hidden = true;
      card.classList.remove("is-correct", "is-wrong");
      state.displayedIds.add(id);
    }
  }

  function buildEquipmentCard(item, template) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector("[data-equipment-card]");
    const input = fragment.querySelector("[data-equipment-checkbox]");
    const icon = fragment.querySelector("[data-equipment-icon]");
    const name = fragment.querySelector("[data-equipment-name]");
    const description = fragment.querySelector("[data-equipment-description]");
    const badge = fragment.querySelector("[data-required-badge]");

    card.dataset.equipmentId = item.id;
    input.value = item.id;
    input.dataset.equipmentCategory = item.category;
    input.dataset.equipmentName = item.name;
    input.setAttribute("aria-label", item.name);
    icon.textContent = item.icon || "â—»";
    name.textContent = item.name;
    description.textContent = item.description || "";
    badge.hidden = true;
    return fragment;
  }

  function renderApparatus(items) {
    const template = query('template[data-template="equipment-card"]');
    if (!template) throw new Error("LipseÈ™te È™ablonul equipment-card din componentÄƒ.");

    for (const container of queryAll("[data-equipment-category]")) container.replaceChildren();
    for (const section of queryAll("[data-equipment-category-section]")) section.hidden = true;

    for (const item of items) {
      const container = query(`[data-equipment-category="${CSS.escape(item.category)}"]`);
      const section = query(`[data-equipment-category-section="${CSS.escape(item.category)}"]`);
      if (!container || !section) continue;
      container.append(buildEquipmentCard(item, template));
      section.hidden = false;
      state.displayedIds.add(item.id);
    }
  }

  function getSelectedIds(scope = state.root) {
    return new Set(
      queryAll("[data-equipment-checkbox]:checked", scope).map(input => input.value)
    );
  }

  function getRequiredIdsForStage(stage) {
    const protection = stage === "protection";
    const itemMap = getItemMap();
    return new Set([...state.requiredIds].filter(id => {
      const isProtection = itemMap.get(id)?.category === "protection";
      return protection ? isProtection : !isProtection;
    }));
  }

  function compareSelection(stage) {
    const stageRoot = query(`[data-equipment-stage="${stage}"]`);
    const required = getRequiredIdsForStage(stage);
    const selected = getSelectedIds(stageRoot);
    const missing = [...required].filter(id => !selected.has(id));
    const extra = [...selected].filter(id => !required.has(id));
    return { required, selected, missing, extra, correct: missing.length === 0 && extra.length === 0 };
  }

  function revealValidation(stage, comparison) {
    const stageRoot = query(`[data-equipment-stage="${stage}"]`);
    for (const card of queryAll("[data-equipment-card]", stageRoot)) {
      const id = card.dataset.equipmentId;
      const selected = card.querySelector("[data-equipment-checkbox]")?.checked;
      const required = comparison.required.has(id);
      card.classList.toggle("is-correct", selected && required);
      card.classList.toggle("is-wrong", selected && !required);
      const badge = card.querySelector("[data-required-badge]");
      if (badge) badge.hidden = !required;
    }
  }

  function namesFor(ids) {
    const itemMap = getItemMap();
    return ids.map(id => itemMap.get(id)?.name || id);
  }

  function verificationMessage(comparison) {
    if (comparison.correct) return "SelecÈ›ia este corectÄƒ.";
    const parts = [];
    if (comparison.missing.length) parts.push(`Lipsesc: ${namesFor(comparison.missing).join(", ")}.`);
    if (comparison.extra.length) parts.push(`Nu sunt necesare: ${namesFor(comparison.extra).join(", ")}.`);
    return parts.join(" ");
  }

  function verifyStage(stage) {
    const comparison = compareSelection(stage);
    revealValidation(stage, comparison);
    setFeedback(stage, verificationMessage(comparison), comparison.correct ? "success" : "error");
    if (stage === "protection") state.protectionVerified = comparison.correct;
    if (stage === "apparatus") state.apparatusVerified = comparison.correct;
    updateSummary();
    return comparison.correct;
  }

  function updateSummary() {
    const selected = getSelectedIds();
    const correct = [...selected].filter(id => state.requiredIds.has(id)).length;
    setText("[data-equipment-required-count]", String(state.requiredIds.size));
    setText("[data-equipment-selected-count]", String(selected.size));
    setText("[data-equipment-correct-count]", String(correct));

    const kitStatus = query("[data-equipment-kit-status]");
    if (kitStatus) {
      kitStatus.textContent = state.protectionVerified && state.apparatusVerified
        ? "SelecÈ›ie corectÄƒ"
        : "ÃŽn verificare";
    }
  }

  function clearApparatusSelection() {
    const apparatus = query('[data-equipment-stage="apparatus"]');
    for (const input of queryAll("[data-equipment-checkbox]", apparatus)) input.checked = false;
    for (const card of queryAll("[data-equipment-card]", apparatus)) {
      card.classList.remove("is-correct", "is-wrong");
      const badge = card.querySelector("[data-required-badge]");
      if (badge) badge.hidden = true;
    }
    state.apparatusVerified = false;
    setFeedback("apparatus", "SelecÈ›ia aparatelor a fost È™tearsÄƒ.", "warning");
    updateSummary();
  }

  function inspectEquipmentIssue() {
    const field = query("[data-equipment-issue]");
    const warning = query("[data-equipment-issue-warning]");
    const hasIssue = Boolean(field?.value.trim());
    if (warning) warning.hidden = !hasIssue;
    return hasIssue;
  }

  function validateInspection() {
    const section = query('[data-equipment-stage="inspection"]');
    const requiredInputs = queryAll('input[type="checkbox"][required]', section);
    const unchecked = requiredInputs.filter(input => !input.checked);
    for (const input of requiredInputs) input.setAttribute("aria-invalid", String(!input.checked));
    return unchecked.length === 0;
  }

  function buildSelectionDetail() {
    const itemMap = getItemMap();
    const selectedIds = [...getSelectedIds()];
    return {
      completed: state.completed,
      selectedAt: state.selectedAt,
      requiredIds: [...state.requiredIds],
      selectedIds,
      items: selectedIds.map(id => {
        const item = itemMap.get(id);
        return {
          id,
          name: item?.name || id,
          category: item?.category || "unknown",
          required: state.requiredIds.has(id),
          selected: true
        };
      })
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    const protectionCorrect = verifyStage("protection");
    const apparatusCorrect = verifyStage("apparatus");
    const inspectionComplete = validateInspection();
    const hasIssue = inspectEquipmentIssue();

    if (hasIssue) {
      setFeedback("final", "Ai semnalat o problemÄƒ. OpreÈ™te pregÄƒtirea È™i anunÈ›Äƒ profesorul.", "error");
      return;
    }
    if (!protectionCorrect || !apparatusCorrect || !inspectionComplete) {
      setFeedback("final", "CorecteazÄƒ selecÈ›ia È™i bifeazÄƒ toate verificÄƒrile obligatorii.", "error");
      return;
    }

    state.completed = true;
    state.selectedAt = new Date().toISOString();
    setText("[data-equipment-kit-status]", "PregÄƒtitÄƒ");
    setFeedback("final", "Trusa este completÄƒ. PoÈ›i continua cu descrierea experimentului.", "success");

    state.root.dispatchEvent(new CustomEvent("laborator:equipment-complete", {
      bubbles: true,
      detail: buildSelectionDetail()
    }));
  }

  function addEventListeners() {
    query('[data-action="verify-protection-equipment"]')?.addEventListener("click", () => verifyStage("protection"));
    query('[data-action="verify-apparatus-selection"]')?.addEventListener("click", () => verifyStage("apparatus"));
    query('[data-action="clear-equipment-selection"]')?.addEventListener("click", clearApparatusSelection);
    query("[data-equipment-issue]")?.addEventListener("input", inspectEquipmentIssue);
    state.form.addEventListener("change", updateSummary);
    state.form.addEventListener("submit", handleSubmit);
  }

  async function init(root = document, configuration = globalThis.LAB_EXPERIMENT_CONFIG || {}) {
    const component = root.matches?.(COMPONENT_SELECTOR) ? root : root.querySelector?.(COMPONENT_SELECTOR);
    if (!component || component.hasAttribute(INITIALIZED_ATTRIBUTE)) return null;

    component.setAttribute(INITIALIZED_ATTRIBUTE, "loading");
    state.root = component;
    state.form = query("[data-equipment-form]");
    state.options = {
      catalogUrl: DEFAULT_CATALOG_URL,
      maximumDistractorsPerExperiment: 6,
      defaultProtectiveEquipment: ["lab-coat"],
      ...(globalThis.LAB_GENERAL_CONFIG?.equipmentSelection || {}),
      ...(configuration.equipmentOptions || {})
    };
    state.experiment = getExperimentConfiguration(configuration);

    try {
      if (!state.form) throw new Error("Formularul de selecÈ›ie nu existÄƒ Ã®n componentÄƒ.");
      state.catalog = validateCatalog(await loadJson(state.options.catalogUrl));
      const itemMap = getItemMap();
      state.requiredIds = resolveRequiredIds(itemMap);
      state.displayedIds.clear();
      configureProtectionCards(itemMap);
      renderApparatus(chooseDisplayedItems(itemMap));

      setText("[data-equipment-experiment-title]", state.experiment.title);
      setText("[data-equipment-experiment-domain]", state.experiment.domains.join(", ") || "General");
      setText("[data-equipment-risk-summary]", state.experiment.risks.join(", ") || "Reguli generale");
      announceLoading("Aparatele È™i materialele au fost Ã®ncÄƒrcate.", "success");
      addEventListeners();
      updateSummary();
      component.setAttribute(INITIALIZED_ATTRIBUTE, "true");
      component.dispatchEvent(new CustomEvent("laborator:equipment-ready", {
        bubbles: true,
        detail: { displayedIds: [...state.displayedIds], requiredIds: [...state.requiredIds] }
      }));
      return buildSelectionDetail();
    } catch (error) {
      component.setAttribute(INITIALIZED_ATTRIBUTE, "error");
      announceLoading(error.message || "Echipamentele nu au putut fi Ã®ncÄƒrcate.", "error");
      console.error("[LaboratorEchipamente]", error);
      return null;
    }
  }

  function reset() {
    if (!state.root) return;
    state.form?.reset();
    state.protectionVerified = false;
    state.apparatusVerified = false;
    state.completed = false;
    state.selectedAt = null;
    for (const card of queryAll("[data-equipment-card]")) {
      card.classList.remove("is-correct", "is-wrong");
      const badge = card.querySelector("[data-required-badge]");
      if (badge) badge.hidden = true;
    }
    for (const feedback of queryAll("[data-equipment-feedback]")) {
      feedback.textContent = "";
      feedback.classList.remove("is-success", "is-warning", "is-error");
    }
    inspectEquipmentIssue();
    updateSummary();
  }

  globalThis.LaboratorEchipamente = Object.freeze({
    init,
    reset,
    verifyProtection: () => verifyStage("protection"),
    verifyApparatus: () => verifyStage("apparatus"),
    getState: buildSelectionDetail
  });

  function autoInit() {
    const component = document.querySelector(COMPONENT_SELECTOR);
    if (component && !component.hasAttribute(INITIALIZED_ATTRIBUTE)) {
      init(document, globalThis.LAB_EXPERIMENT_CONFIG || {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  } else {
    autoInit();
  }

  document.addEventListener("laborator:components-loaded", autoInit);
  document.addEventListener("laborator:component-loaded", autoInit);
})();
