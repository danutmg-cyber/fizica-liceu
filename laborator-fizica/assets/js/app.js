/* Fizica-liceu: introducere accesibila a numerelor si simbolurilor.
 * Compatibil cu input[type=number][data-signed-number].
 * Optiuni: data-physics-symbols, data-no-physics-symbols,
 * data-no-signed-number, data-physics-kind="formula|number|text".
 * Nu converteste automat proza si nu inlocuieste baremele experimentelor.
 */
(function () {
  "use strict";
  if (window.PhysicsInput && window.PhysicsInput.version === "2.0.1") return;

  const symbols = [
    ["=", "egal"], ["−", "minus"], ["±", "plus-minus"], ["μ", "miu"],
    ["ν", "niu"], ["ε", "epsilon"], ["ω", "omega mic"],
    ["Ω", "omega mare / ohm"], ["Δ", "delta mare"],
    ["δ", "delta mic"], ["α", "alfa"], ["β", "beta"],
    ["γ", "gama"], ["θ", "teta"], ["λ", "lambda"],
    ["ρ", "ro"], ["η", "eta"], ["σ", "sigma"],
    ["π", "pi"], ["Σ", "suma"], ["√", "radical"],
    ["²", "la patrat"], ["³", "la cub"], ["×", "inmultire"],
    ["·", "punct de inmultire"], ["°", "grade"]
  ];
  const aliases = {
    miu: "μ", mu: "μ", niu: "ν", nu: "ν", epsilon: "ε",
    omega: "ω", Omega: "Ω", ohm: "Ω", Ohm: "Ω",
    Delta: "Δ", delta: "δ", alfa: "α", alpha: "α",
    beta: "β", gama: "γ", gamma: "γ", teta: "θ", theta: "θ",
    lambda: "λ", rho: "ρ", eta: "η", sigma: "σ", pi: "π"
  };
  const aliasPattern = new RegExp("(^|[^\\p{L}\\p{N}_])(" +
    Object.keys(aliases).join("|") + ")(?=$|[^\\p{L}\\p{N}_])", "gu");

  function normalizeFormula(value) {
    return String(value).normalize("NFC")
      .replace(/\+\s*\/\s*-/g, "±")
      .replace(/[−﹣－]/g, "-")
      .replace(aliasPattern, function (_, prefix, word) {
        return prefix + aliases[word];
      });
  }

  // Strict: "12abc" nu devine 12, iar "0,34 ± 0,02" nu devine 0,34.
  function parseNumber(value) {
    const text = String(value).trim().replace(/[−﹣－]/g, "-")
      .replace(/,/g, ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
      return NaN;
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }

  function parseUncertainty(value) {
    const parts = String(value).trim().split(/\s*(?:±|\+\s*\/\s*-)\s*/);
    if (parts.length !== 2) return null;
    const number = parseNumber(parts[0]);
    const uncertainty = parseNumber(parts[1]);
    return Number.isFinite(number) && Number.isFinite(uncertainty) && uncertainty >= 0
      ? { value: number, uncertainty: uncertainty } : null;
  }

  const installed = new WeakSet();
  let sequence = 0;

  function signal(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fieldDescription(input) {
    return [input.id, input.name, input.autocomplete,
      input.getAttribute("aria-label"), input.getAttribute("placeholder"),
      ...Array.from(input.labels || [], function (label) { return label.textContent; })]
      .filter(Boolean).join(" ").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function identityField(input) {
    return /(?:\b(?:nume|prenume|clasa|catalog|email|mail|telefon|parola|scoala|profesor|elev|username|password)\b|family-name|given-name|full.?name|student.?name|nr.?catalog)/
      .test(fieldDescription(input));
  }

  function canUseSymbols(input) {
    if (input.hasAttribute("data-no-physics-symbols")) return false;
    if (input.dataset.physicsKind === "number") return false;
    if (input.tagName !== "TEXTAREA" && !["text", "search"].includes(input.type)) return false;
    if (input.type === "search") return false;
    if (input.hasAttribute("data-physics-symbols")) return true;
    return !identityField(input);
  }

  function canChangeSign(input) {
    if (input.hasAttribute("data-no-signed-number") || identityField(input)) return false;
    if (input.type !== "number" && input.dataset.physicsKind !== "number") return false;
    const min = input.getAttribute("min");
    // Respecta restrictiile fizice declarate in formular.
    if (min !== null && min !== "" && Number.isFinite(Number(min)) && Number(min) >= 0) return false;
    return true;
  }

  function addStyle() {
    if (document.getElementById("physics-input-style-v2")) return;
    const style = document.createElement("style");
    style.id = "physics-input-style-v2";
    style.textContent = `
      .physics-input-tools{display:flex;flex-wrap:wrap;gap:6px;margin:5px 0 10px}
      .physics-input-tools button,.physics-symbol-panel button{font:inherit;min-height:44px;min-width:44px;padding:7px 10px;border:1px solid #94a3b8;border-radius:8px;background:#eff6ff;color:#17324d;cursor:pointer;touch-action:manipulation}
      .physics-input-tools button:focus-visible,.physics-symbol-panel button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
      .physics-input-tools button:disabled,.physics-symbol-panel button:disabled{opacity:.45;cursor:default}
      .physics-symbol-panel{display:flex;flex-wrap:wrap;gap:6px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;margin:5px 0 12px}
      .physics-symbol-panel[hidden]{display:none!important}
      .physics-symbol-note{flex-basis:100%;font-size:.9rem;color:#334155;margin:0 0 5px}
      .physics-symbol-status{font-size:.85rem;align-self:center;color:#334155}
      @media print{.physics-input-tools,.physics-symbol-panel{display:none!important}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function makeButton(text, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label || text);
    button.title = label || text;
    return button;
  }

  function enhance(input) {
    if (installed.has(input) || !input.parentNode) return;
    const signed = canChangeSign(input);
    const symbolic = canUseSymbols(input);
    if (!signed && !symbolic) return;
    installed.add(input);
    addStyle();
    const tools = document.createElement("div");
    tools.className = "physics-input-tools";
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", "Ajutor pentru introducerea raspunsului");
    input.insertAdjacentElement("afterend", tools);
    const status = document.createElement("span");
    status.className = "physics-symbol-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    let selection = { start: input.value.length, end: input.value.length };

    function remember() {
      if (typeof input.selectionStart === "number") {
        selection = { start: input.selectionStart, end: input.selectionEnd };
      }
    }
    ["select", "keyup", "click", "input", "blur"].forEach(function (event) {
      input.addEventListener(event, remember);
    });
    tools.addEventListener("pointerdown", remember);

    function insert(text) {
      if (input.disabled || input.readOnly) return;
      const start = Math.min(selection.start, input.value.length);
      const end = Math.min(selection.end, input.value.length);
      input.value = input.value.slice(0, start) + text + input.value.slice(end);
      const position = start + text.length;
      input.focus({ preventScroll: true });
      input.setSelectionRange(position, position);
      selection = { start: position, end: position };
      signal(input);
      status.textContent = "Simbol introdus.";
    }

    if (signed) {
      // Ascunde vechiul buton daca un formular are deja un wrapper legacy.
      const wrapper = input.closest(".signed-number-field");
      if (wrapper) wrapper.querySelectorAll(".signed-number-toggle").forEach(function (b) { b.hidden = true; });
      const toggle = makeButton("+/−", input.dataset.signLabel || "Schimba semnul valorii");
      toggle.addEventListener("click", function () {
        if (input.disabled || input.readOnly) return;
        const number = parseNumber(input.value);
        if (!Number.isFinite(number)) {
          status.textContent = "Introdu mai intai numarul, apoi schimba semnul.";
          input.focus(); return;
        }
        const value = -number;
        const min = input.getAttribute("min"), max = input.getAttribute("max");
        if ((min !== null && min !== "" && value < Number(min)) ||
            (max !== null && max !== "" && value > Number(max))) {
          status.textContent = "Semnul nu este permis de limitele acestui camp."; return;
        }
        input.value = String(value);
        signal(input); input.focus({ preventScroll: true });
        status.textContent = "Semnul a fost schimbat.";
      });
      tools.appendChild(toggle);
      input.dataset.signedNumberReady = "true";
    }

    if (symbolic) {
      const panel = document.createElement("div");
      panel.className = "physics-symbol-panel";
      panel.id = "physics-symbol-panel-" + (++sequence);
      panel.hidden = true;
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "Simboluri de fizica");
      tools.insertAdjacentElement("afterend", panel);
      const open = makeButton("Simboluri", "Deschide sau inchide simbolurile de fizica");
      open.setAttribute("aria-controls", panel.id);
      open.setAttribute("aria-expanded", "false");
      function close() { panel.hidden = true; open.setAttribute("aria-expanded", "false"); }
      open.addEventListener("click", function () {
        if (input.disabled || input.readOnly) return;
        panel.hidden = !panel.hidden;
        open.setAttribute("aria-expanded", String(!panel.hidden));
      });
      tools.appendChild(open);
      const note = document.createElement("p");
      note.className = "physics-symbol-note";
      note.textContent = "Alege simbolul. ω = omega mic; Ω = ohm; ν = niu, diferit de v.";
      panel.appendChild(note);
      symbols.forEach(function (pair) {
        const button = makeButton(pair[0] + " — " + pair[1]);
        button.addEventListener("click", function () { insert(pair[0]); });
        panel.appendChild(button);
      });
      // Conversia denumirilor numai la cerere si numai in campuri de formula.
      if (input.dataset.physicsKind === "formula") {
        const normalize = makeButton("Converteste denumirile", "Converteste miu, niu, epsilon si alte denumiri in simboluri");
        normalize.addEventListener("click", function () {
          if (input.disabled || input.readOnly) return;
          input.value = normalizeFormula(input.value);
          selection = { start: input.value.length, end: input.value.length };
          signal(input); status.textContent = "Denumirile au fost convertite.";
        });
        panel.appendChild(normalize);
      }
      const dismiss = makeButton("Inchide", "Inchide paleta de simboluri");
      dismiss.addEventListener("click", function () { close(); open.focus(); });
      panel.appendChild(dismiss);
      panel.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { close(); open.focus(); }
      });
    }
    tools.appendChild(status);
    function sync() {
      const disabled = input.disabled || input.readOnly;
      tools.querySelectorAll("button").forEach(function (b) { b.disabled = disabled; });
      const panel = tools.nextElementSibling;
      if (panel && panel.classList.contains("physics-symbol-panel")) {
        panel.querySelectorAll("button").forEach(function (b) { b.disabled = disabled; });
        if (disabled) panel.hidden = true;
      }
    }
    sync();
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ["disabled", "readonly"] });
  }

  function init(root) {
    root = root || document;
    if (root.matches && root.matches("input,textarea")) enhance(root);
    root.querySelectorAll("input,textarea").forEach(enhance);
  }

  window.PhysicsInput = {
    version: "2.0.1", init: init, normalizeFormula: normalizeFormula,
    parseNumber: parseNumber, parseUncertainty: parseUncertainty
  };
  // Alias pastrat pentru experimentele existente.
  window.initSignedNumberInputs = init;
  function start() {
    init();
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) init(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
