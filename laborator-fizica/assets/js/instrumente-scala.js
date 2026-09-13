/* ======================================================================
   FIZICA-LICEU - BIBLIOTECA PENTRU CITIREA INSTRUMENTELOR CU SCALA

   Instrumente disponibile:
   - thermometer       termometru cu lichid
   - graduated-cylinder cilindru gradat cu menisc
   - ruler              rigla
   - tape-measure       ruleta
   - dynamometer        dinamometru
   - analog-meter       ampermetru/voltmetru analogic
   - caliper            subler cu nonius
   - micrometer         micrometru

   Exemplu:
   const instrument = LaboratorInstrumente.afiseaza({
     target: "#instrument",
     type: "thermometer",
     minimum: 40,
     maximum: 50,
     value: 46.3,
     minorDivision: 1,
     majorDivision: 5,
     unit: "Â°C",
     tolerance: 0.5
   });

   instrument.verifica(46);
   ====================================================================== */

(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const instances = new WeakMap();
  let nextId = 1;

  const DEFAULTS = Object.freeze({
    type: "thermometer",
    minimum: 0,
    maximum: 100,
    value: 50,
    minorDivision: 1,
    majorDivision: 10,
    unit: "",
    tolerance: null,
    decimals: null,
    width: 760,
    height: 360,
    orientation: "auto",
    showNumericValue: false,
    showMinorLabels: false,
    allowZoom: true,
    label: "Instrument de mÄƒsurÄƒ",
    instruction: "CiteÈ™te indicaÈ›ia instrumentului È™i noteazÄƒ valoarea Ã®n caiet.",
    answerInput: null,
    feedbackTarget: null,
    verifyButton: null,
    requireNotebookConfirmation: false,
    notebookConfirmation: null
  });

  const TYPE_ALIASES = Object.freeze({
    termometru: "thermometer",
    thermometer: "thermometer",
    cilindru: "graduated-cylinder",
    "graduated-cylinder": "graduated-cylinder",
    rigla: "ruler",
    ruler: "ruler",
    ruleta: "tape-measure",
    "tape-measure": "tape-measure",
    dinamometru: "dynamometer",
    dynamometer: "dynamometer",
    ampermetru: "analog-meter",
    voltmetru: "analog-meter",
    "analog-meter": "analog-meter",
    subler: "caliper",
    È™ubler: "caliper",
    caliper: "caliper",
    micrometru: "micrometer",
    micrometer: "micrometer"
  });

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function decimalPlaces(value) {
    const text = String(value);
    if (/e-/i.test(text)) return Number(text.split(/e-/i)[1]);
    return text.includes(".") ? text.split(".")[1].length : 0;
  }

  function round(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function format(value, decimals) {
    return new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  }

  function resolveElement(reference, root = document) {
    if (!reference) return null;
    if (reference instanceof Element) return reference;
    return root.querySelector(String(reference));
  }

  function svgElement(name, attributes = {}, text = "") {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) element.setAttribute(key, String(value));
    }
    if (text !== "") element.textContent = text;
    return element;
  }

  function append(parent, name, attributes = {}, text = "") {
    const child = svgElement(name, attributes, text);
    parent.append(child);
    return child;
  }

  function line(parent, x1, y1, x2, y2, className) {
    return append(parent, "line", { x1, y1, x2, y2, class: className });
  }

  function text(parent, x, y, content, className, anchor = "middle") {
    return append(parent, "text", {
      x, y, class: className, "text-anchor": anchor, "dominant-baseline": "middle"
    }, content);
  }

  function normalizedConfig(options) {
    const config = { ...DEFAULTS, ...(options || {}) };
    config.type = TYPE_ALIASES[String(config.type).toLocaleLowerCase("ro-RO")] || config.type;
    config.minimum = finite(config.minimum);
    config.maximum = finite(config.maximum, 100);
    config.minorDivision = Math.abs(finite(config.minorDivision, 1)) || 1;
    config.majorDivision = Math.abs(finite(config.majorDivision, config.minorDivision * 5)) || config.minorDivision;
    config.value = finite(config.value, config.minimum);
    config.width = Math.max(320, finite(config.width, 760));
    config.height = Math.max(260, finite(config.height, 360));
    config.decimals = config.decimals === null
      ? decimalPlaces(config.minorDivision)
      : Math.max(0, Math.round(finite(config.decimals)));
    config.tolerance = config.tolerance === null
      ? config.minorDivision / 2
      : Math.abs(finite(config.tolerance));

    if (config.maximum <= config.minimum) throw new Error("Valoarea maximÄƒ trebuie sÄƒ fie mai mare decÃ¢t valoarea minimÄƒ.");
    if (config.value < config.minimum || config.value > config.maximum) {
      throw new Error("Valoarea indicatÄƒ trebuie sÄƒ se afle Ã®n domeniul scalei.");
    }
    return config;
  }

  function scaleValues(config) {
    const count = Math.round((config.maximum - config.minimum) / config.minorDivision);
    if (count < 1 || count > 500) throw new Error("Scala trebuie sÄƒ conÈ›inÄƒ Ã®ntre 1 È™i 500 de diviziuni.");
    return Array.from({ length: count + 1 }, (_, index) =>
      round(config.minimum + index * config.minorDivision, Math.max(config.decimals + 2, 6))
    );
  }

  function isMajor(value, config) {
    const ratio = (value - config.minimum) / config.majorDivision;
    return Math.abs(ratio - Math.round(ratio)) < 1e-7
      || Math.abs(value - config.maximum) < 1e-7;
  }

  function position(value, config, start, end) {
    const ratio = (value - config.minimum) / (config.maximum - config.minimum);
    return start + ratio * (end - start);
  }

  function baseSvg(config, description) {
    const svg = svgElement("svg", {
      viewBox: `0 0 ${config.width} ${config.height}`,
      role: "img",
      tabindex: "0",
      class: `lab-scale-svg lab-scale-${config.type}`,
      "aria-labelledby": `${config.uid}-title ${config.uid}-description`,
      preserveAspectRatio: "xMidYMid meet"
    });
    append(svg, "title", { id: `${config.uid}-title` }, config.label);
    append(svg, "desc", { id: `${config.uid}-description` }, description || config.instruction);
    append(svg, "style", {}, `
      .lab-scale-axis,.lab-scale-tick-major,.lab-scale-tick-minor,.lab-object-guide,.lab-eye-level-guide{stroke:#17324d;vector-effect:non-scaling-stroke}
      .lab-scale-axis{stroke-width:3}.lab-scale-tick-major{stroke-width:3}.lab-scale-tick-minor{stroke-width:1.5}
      .lab-scale-number,.lab-scale-unit{fill:#17324d;font:600 15px system-ui,sans-serif}.lab-scale-unit{font-size:18px}
      .lab-thermometer-tube{fill:#eef7fb;stroke:#526b80;stroke-width:3}.lab-thermometer-liquid,.lab-thermometer-bulb{fill:#d72c3f;stroke:#a41829;stroke-width:2}
      .lab-cylinder-outline{fill:#eaf7fc55;stroke:#27647d;stroke-width:4}.lab-cylinder-liquid{fill:#43aee080}.lab-cylinder-meniscus{fill:none;stroke:#1478a6;stroke-width:3}
      .lab-eye-level-guide{stroke:#7c8792;stroke-width:1;stroke-dasharray:7 7}.lab-ruler-body{fill:#f8df8b;stroke:#8d6b22;stroke-width:3}.lab-tape-body{fill:#ffd45c;stroke:#7c5a00;stroke-width:3}
      .lab-measured-object{fill:#5b8def;stroke:#244f9e;stroke-width:2}.lab-object-guide{stroke-width:2;stroke-dasharray:5 4}
      .lab-dynamometer-body{fill:#edf4f8;stroke:#315c72;stroke-width:4}.lab-dynamometer-spring,.lab-dynamometer-hook{fill:none;stroke:#56616a;stroke-width:4}.lab-scale-pointer{stroke:#cf2634;stroke-width:4}
      .lab-meter-arc{fill:none;stroke:#17324d;stroke-width:4}.lab-meter-needle{stroke:#d22132;stroke-width:5}.lab-meter-pivot{fill:#17324d}
      .lab-caliper-slider,.lab-micrometer-sleeve{fill:#dbe3e8;stroke:#425b68;stroke-width:3}.lab-caliper-jaw{fill:none;stroke:#425b68;stroke-width:9}
      .lab-vernier-tick{stroke:#17324d;stroke-width:2}.lab-vernier-coincidence{stroke:#d22132;stroke-width:4}.lab-micrometer-drum{fill:#c8d2d8;stroke:#425b68;stroke-width:3}
    `);
    return svg;
  }

  function drawHorizontalScale(group, config, geometry = {}) {
    const x1 = geometry.x1 ?? 70;
    const x2 = geometry.x2 ?? config.width - 50;
    const y = geometry.y ?? config.height * 0.58;
    const majorLength = geometry.majorLength ?? 34;
    const minorLength = geometry.minorLength ?? 19;
    const direction = geometry.direction ?? 1;
    const values = scaleValues(config);

    line(group, x1, y, x2, y, "lab-scale-axis");
    for (const value of values) {
      const x = position(value, config, x1, x2);
      const major = isMajor(value, config);
      const length = major ? majorLength : minorLength;
      line(group, x, y, x, y + direction * length, major ? "lab-scale-tick-major" : "lab-scale-tick-minor");
      if (major || config.showMinorLabels) {
        text(group, x, y + direction * (length + 19), format(value, config.decimals), "lab-scale-number");
      }
    }
    return { x1, x2, y };
  }

  function drawVerticalScale(group, config, geometry = {}) {
    const x = geometry.x ?? config.width * 0.57;
    const y1 = geometry.y1 ?? 35;
    const y2 = geometry.y2 ?? config.height - 40;
    const majorLength = geometry.majorLength ?? 38;
    const minorLength = geometry.minorLength ?? 21;
    const direction = geometry.direction ?? 1;
    const values = scaleValues(config);

    line(group, x, y1, x, y2, "lab-scale-axis");
    for (const value of values) {
      const y = position(value, config, y2, y1);
      const major = isMajor(value, config);
      const length = major ? majorLength : minorLength;
      line(group, x, y, x + direction * length, y, major ? "lab-scale-tick-major" : "lab-scale-tick-minor");
      if (major || config.showMinorLabels) {
        text(group, x + direction * (length + 10), y, format(value, config.decimals), "lab-scale-number", direction > 0 ? "start" : "end");
      }
    }
    return { x, y1, y2 };
  }

  function drawThermometer(config) {
    const svg = baseSvg(config, "Termometru vertical cu gradaÈ›ii È™i coloanÄƒ de lichid fÄƒrÄƒ valoare numericÄƒ afiÈ™atÄƒ.");
    const group = append(svg, "g", { class: "lab-scale-drawing" });
    const scale = drawVerticalScale(group, config, { x: config.width * 0.56, direction: 1 });
    const tubeX = scale.x - 38;
    const bulbY = scale.y2 + 3;
    const levelY = position(config.value, config, scale.y2, scale.y1);

    append(group, "rect", { x: tubeX - 9, y: scale.y1 - 8, width: 18, height: scale.y2 - scale.y1 + 12, rx: 9, class: "lab-thermometer-tube" });
    append(group, "rect", { x: tubeX - 4, y: levelY, width: 8, height: bulbY - levelY, rx: 4, class: "lab-thermometer-liquid" });
    append(group, "circle", { cx: tubeX, cy: bulbY + 12, r: 20, class: "lab-thermometer-bulb" });
    text(group, scale.x + 92, scale.y1 - 12, config.unit, "lab-scale-unit", "start");
    return svg;
  }

  function drawCylinder(config) {
    const svg = baseSvg(config, "Cilindru gradat cu suprafaÈ›a curbatÄƒ a lichidului. Citirea se face la baza meniscului.");
    const group = append(svg, "g", { class: "lab-scale-drawing" });
    const scale = drawVerticalScale(group, config, { x: config.width * 0.66, direction: 1, majorLength: 32, minorLength: 17 });
    const left = config.width * 0.27;
    const right = scale.x - 18;
    const bottom = scale.y2;
    const meniscusY = position(config.value, config, scale.y2, scale.y1);

    append(group, "path", { d: `M ${left} ${scale.y1} L ${left + 10} ${bottom} Q ${(left + right) / 2} ${bottom + 17} ${right - 10} ${bottom} L ${right} ${scale.y1}`, class: "lab-cylinder-outline" });
    append(group, "path", { d: `M ${left + 10} ${meniscusY - 5} Q ${(left + right) / 2} ${meniscusY + 7} ${right - 10} ${meniscusY - 5} L ${right - 10} ${bottom} Q ${(left + right) / 2} ${bottom + 12} ${left + 10} ${bottom} Z`, class: "lab-cylinder-liquid" });
    append(group, "path", { d: `M ${left + 10} ${meniscusY - 5} Q ${(left + right) / 2} ${meniscusY + 7} ${right - 10} ${meniscusY - 5}`, class: "lab-cylinder-meniscus" });
    line(group, left - 35, meniscusY + 7, right + 8, meniscusY + 7, "lab-eye-level-guide");
    text(group, scale.x + 78, scale.y1 - 12, config.unit, "lab-scale-unit", "start");
    return svg;
  }

  function drawRuler(config, tapeMeasure = false) {
    const svg = baseSvg(config, `${tapeMeasure ? "RuletÄƒ" : "RiglÄƒ"} cu obiect poziÈ›ionat Ã®ntre douÄƒ gradaÈ›ii.`);
    const group = append(svg, "g", { class: "lab-scale-drawing" });
    const y = config.height * 0.42;
    append(group, "rect", { x: 52, y: y - 20, width: config.width - 84, height: 64, rx: tapeMeasure ? 8 : 2, class: tapeMeasure ? "lab-tape-body" : "lab-ruler-body" });
    const scale = drawHorizontalScale(group, config, { y, direction: 1, majorLength: 40, minorLength: 23 });
    const objectStart = clamp(finite(config.objectStart, config.minimum), config.minimum, config.maximum);
    const objectEnd = clamp(finite(config.objectEnd, config.value), config.minimum, config.maximum);
    const startX = position(Math.min(objectStart, objectEnd), config, scale.x1, scale.x2);
    const endX = position(Math.max(objectStart, objectEnd), config, scale.x1, scale.x2);

    append(group, "rect", { x: startX, y: y - 76, width: Math.max(4, endX - startX), height: 38, rx: 5, class: "lab-measured-object" });
    line(group, startX, y - 84, startX, y - 15, "lab-object-guide");
    line(group, endX, y - 84, endX, y - 15, "lab-object-guide");
    text(group, config.width / 2, y + 91, config.unit, "lab-scale-unit");
    return svg;
  }

  function drawDynamometer(config) {
    const svg = baseSvg(config, "Dinamometru vertical. Citirea se face Ã®n dreptul indicatorului resortului.");
    const group = append(svg, "g", { class: "lab-scale-drawing" });
    const scale = drawVerticalScale(group, config, { x: config.width * 0.62, direction: 1 });
    const bodyX = scale.x - 105;
    const indicatorY = position(config.value, config, scale.y2, scale.y1);

    append(group, "rect", { x: bodyX, y: scale.y1 - 18, width: 75, height: scale.y2 - scale.y1 + 36, rx: 20, class: "lab-dynamometer-body" });
    append(group, "path", { d: springPath(bodyX + 37, scale.y1 + 8, indicatorY - 13, 10), class: "lab-dynamometer-spring" });
    append(group, "path", { d: `M ${bodyX + 12} ${indicatorY} L ${scale.x + 12} ${indicatorY}`, class: "lab-scale-pointer" });
    append(group, "path", { d: `M ${bodyX + 37} ${scale.y2 + 18} q 0 30 18 30 q 18 0 18 -18`, class: "lab-dynamometer-hook" });
    text(group, scale.x + 92, scale.y1 - 12, config.unit, "lab-scale-unit", "start");
    return svg;
  }

  function springPath(x, top, bottom, amplitude) {
    const turns = 9;
    let path = `M ${x} ${top}`;
    for (let index = 1; index <= turns * 2; index += 1) {
      const y = top + (bottom - top) * index / (turns * 2);
      path += ` L ${x + (index % 2 ? amplitude : -amplitude)} ${y}`;
    }
    path += ` L ${x} ${bottom}`;
    return path;
  }

  function drawAnalogMeter(config) {
    const svg = baseSvg(config, "Aparat analogic cu ac indicator. Domeniul È™i unitatea sunt indicate pe cadran.");
    const group = append(svg, "g", { class: "lab-scale-drawing" });
    const cx = config.width / 2;
    const cy = config.height * 0.82;
    const radius = Math.min(config.width * 0.38, config.height * 0.66);
    const values = scaleValues(config);

    append(group, "path", { d: arcPath(cx, cy, radius, 205, 335), class: "lab-meter-arc" });
    for (const value of values) {
      const ratio = (value - config.minimum) / (config.maximum - config.minimum);
      const angle = 205 + ratio * 130;
      const major = isMajor(value, config);
      const outer = polar(cx, cy, radius, angle);
      const inner = polar(cx, cy, radius - (major ? 28 : 16), angle);
      line(group, inner.x, inner.y, outer.x, outer.y, major ? "lab-scale-tick-major" : "lab-scale-tick-minor");
      if (major || config.showMinorLabels) {
        const label = polar(cx, cy, radius - 49, angle);
        text(group, label.x, label.y, format(value, config.decimals), "lab-scale-number");
      }
    }

    const valueAngle = 205 + (config.value - config.minimum) / (config.maximum - config.minimum) * 130;
    const point = polar(cx, cy, radius - 22, valueAngle);
    line(group, cx, cy, point.x, point.y, "lab-meter-needle");
    append(group, "circle", { cx, cy, r: 13, class: "lab-meter-pivot" });
    text(group, cx, cy - 45, config.unit, "lab-scale-unit");
    return svg;
  }

  function polar(cx, cy, radius, degrees) {
    const radians = degrees * Math.PI / 180;
    return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
  }

  function arcPath(cx, cy, radius, startDegrees, endDegrees) {
    const start = polar(cx, cy, radius, startDegrees);
    const end = polar(cx, cy, radius, endDegrees);
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
  }

  function drawCaliper(config) {
    const svg = baseSvg(config, "È˜ubler cu scalÄƒ principalÄƒ È™i nonius. Se citeÈ™te poziÈ›ia zero-ului È™i diviziunea care coincide.");
    const group = append(svg, "g", { class: "lab-scale-drawing" });
    const y = config.height * 0.34;
    const scale = drawHorizontalScale(group, config, { y, direction: 1, majorLength: 35, minorLength: 19 });
    const precision = Math.abs(finite(config.vernierPrecision, config.minorDivision / 10));
    const mainReading = Math.floor(config.value / config.minorDivision) * config.minorDivision;
    const vernierIndex = Math.round((config.value - mainReading) / precision);
    const zeroX = position(config.value, config, scale.x1, scale.x2);
    const vernierDivisionWidth = (scale.x2 - scale.x1) * config.minorDivision / (config.maximum - config.minimum) * 0.9;

    append(group, "rect", { x: zeroX - 10, y: y + 48, width: vernierDivisionWidth * 10 + 20, height: 75, rx: 5, class: "lab-caliper-slider" });
    for (let index = 0; index <= 10; index += 1) {
      const x = zeroX + index * vernierDivisionWidth;
      const length = index === 0 || index === 10 || index === vernierIndex ? 35 : 23;
      line(group, x, y + 48, x, y + 48 + length, index === vernierIndex ? "lab-vernier-coincidence" : "lab-vernier-tick");
      if (index === 0 || index === 5 || index === 10) text(group, x, y + 101, String(index), "lab-scale-number");
    }
    append(group, "path", { d: `M ${scale.x1 - 35} ${y - 75} L ${scale.x1 - 35} ${y + 35} L ${scale.x1 - 12} ${y + 35} L ${scale.x1 - 12} ${y - 42}`, class: "lab-caliper-jaw" });
    append(group, "path", { d: `M ${zeroX - 8} ${y - 65} L ${zeroX - 8} ${y + 45} L ${zeroX + 15} ${y + 45} L ${zeroX + 15} ${y - 35}`, class: "lab-caliper-jaw" });
    text(group, config.width / 2, config.height - 18, `Nonius: ${format(precision, decimalPlaces(precision))} ${config.unit}`, "lab-scale-unit");
    return svg;
  }

  function drawMicrometer(config) {
    const svg = baseSvg(config, "Micrometru cu scalÄƒ longitudinalÄƒ È™i tambur gradat.");
    const group = append(svg, "g", { class: "lab-scale-drawing" });
    const cx = config.width * 0.54;
    const cy = config.height * 0.52;
    const sleeveWidth = config.width * 0.42;
    const sleeveHeight = 105;
    const precision = Math.abs(finite(config.micrometerPrecision, 0.01));
    const sleeveValue = Math.floor(config.value * 2) / 2;
    const drumValue = Math.round((config.value - sleeveValue) / precision);

    append(group, "rect", { x: cx - sleeveWidth, y: cy - sleeveHeight / 2, width: sleeveWidth, height: sleeveHeight, rx: 8, class: "lab-micrometer-sleeve" });
    line(group, cx - sleeveWidth + 20, cy, cx + 190, cy, "lab-scale-axis");
    const sleeveConfig = { ...config, minimum: 0, maximum: Math.max(1, finite(config.sleeveMaximum, config.maximum)), minorDivision: 0.5, majorDivision: 1, decimals: 0 };
    const values = scaleValues(sleeveConfig);
    for (const value of values) {
      const x = position(value, sleeveConfig, cx - sleeveWidth + 25, cx - 15);
      const above = Math.round(value * 2) % 2 === 0;
      line(group, x, cy, x, cy + (above ? -34 : 27), above ? "lab-scale-tick-major" : "lab-scale-tick-minor");
      if (above) text(group, x, cy - 49, format(value, 0), "lab-scale-number");
    }
    append(group, "rect", { x: cx - 15, y: cy - 78, width: 215, height: 156, rx: 16, class: "lab-micrometer-drum" });
    const drumDivisions = Math.max(10, Math.round(finite(config.drumDivisions, 50)));
    for (let index = 0; index < drumDivisions; index += 1) {
      if (index % 5 !== 0 && index !== drumValue) continue;
      const y = cy + (index - drumValue) * 3.1;
      if (y < cy - 73 || y > cy + 73) continue;
      line(group, cx - 15, y, cx + (index === drumValue ? 70 : 42), y, index === drumValue ? "lab-vernier-coincidence" : "lab-scale-tick-minor");
      text(group, cx + 82, y, String(index), "lab-scale-number", "start");
    }
    text(group, config.width / 2, config.height - 22, `Precizie: ${format(precision, decimalPlaces(precision))} ${config.unit}`, "lab-scale-unit");
    return svg;
  }

  function renderer(config) {
    switch (config.type) {
      case "thermometer": return drawThermometer(config);
      case "graduated-cylinder": return drawCylinder(config);
      case "ruler": return drawRuler(config, false);
      case "tape-measure": return drawRuler(config, true);
      case "dynamometer": return drawDynamometer(config);
      case "analog-meter": return drawAnalogMeter(config);
      case "caliper": return drawCaliper(config);
      case "micrometer": return drawMicrometer(config);
      default: throw new Error(`Tip de instrument necunoscut: ${config.type}.`);
    }
  }

  function createInterface(container, config) {
    container.replaceChildren();
    container.classList.add("lab-scale-instrument");
    container.dataset.instrumentType = config.type;

    const heading = document.createElement("h3");
    heading.className = "lab-scale-title";
    heading.textContent = config.label;

    const instruction = document.createElement("p");
    instruction.className = "lab-scale-instruction";
    instruction.textContent = config.instruction;

    const metadata = document.createElement("p");
    metadata.className = "lab-scale-metadata";
    metadata.textContent = `Domeniu: ${format(config.minimum, config.decimals)}â€“${format(config.maximum, config.decimals)} ${config.unit}. Valoarea unei diviziuni: ${format(config.minorDivision, config.decimals)} ${config.unit}.`;

    const viewport = document.createElement("div");
    viewport.className = "lab-scale-viewport";
    viewport.dataset.scaleViewport = "";
    viewport.append(renderer(config));

    container.append(heading, instruction, metadata, viewport);

    if (config.allowZoom) {
      const zoomButton = document.createElement("button");
      zoomButton.type = "button";
      zoomButton.className = "lab-button lab-button-secondary lab-scale-zoom";
      zoomButton.textContent = "MÄƒreÈ™te scala";
      zoomButton.setAttribute("aria-pressed", "false");
      zoomButton.addEventListener("click", () => {
        const zoomed = viewport.classList.toggle("is-zoomed");
        zoomButton.setAttribute("aria-pressed", String(zoomed));
        zoomButton.textContent = zoomed ? "MicÈ™oreazÄƒ scala" : "MÄƒreÈ™te scala";
        if (zoomed) viewport.querySelector("svg")?.focus();
      });
      container.append(zoomButton);
    }
  }

  function answerValue(config, explicitAnswer) {
    if (explicitAnswer !== undefined && explicitAnswer !== null) return finite(String(explicitAnswer).replace(",", "."), NaN);
    const input = resolveElement(config.answerInput);
    return input ? finite(String(input.value).replace(",", "."), NaN) : NaN;
  }

  function setFeedback(config, message, status) {
    const element = resolveElement(config.feedbackTarget);
    if (!element) return;
    element.textContent = message;
    element.dataset.status = status;
    element.classList.toggle("is-success", status === "correct");
    element.classList.toggle("is-error", status === "incorrect" || status === "invalid");
  }

  function createInstance(container, config) {
    const state = {
      attempts: 0,
      correct: false,
      studentReading: null,
      verifiedAt: null
    };

    function verifica(explicitAnswer) {
      const notebookCheckbox = resolveElement(config.notebookConfirmation);
      if (config.requireNotebookConfirmation && !notebookCheckbox?.checked) {
        const result = { correct: false, reason: "notebook-not-confirmed" };
        setFeedback(config, "ConfirmÄƒ mai Ã®ntÃ¢i cÄƒ ai notat citirea Ã®n caiet.", "invalid");
        return result;
      }

      const reading = answerValue(config, explicitAnswer);
      if (!Number.isFinite(reading)) {
        const result = { correct: false, reason: "invalid-answer" };
        setFeedback(config, "Introdu o valoare numericÄƒ validÄƒ.", "invalid");
        return result;
      }

      state.attempts += 1;
      state.studentReading = reading;
      state.verifiedAt = new Date().toISOString();
      const error = Math.abs(reading - config.value);
      state.correct = error <= config.tolerance + Number.EPSILON;
      const result = getResult();

      setFeedback(
        config,
        state.correct
          ? "Citirea este corectÄƒ. PÄƒstreazÄƒ valoarea Ã®n caiet."
          : `Citirea nu corespunde scalei. VerificÄƒ valoarea unei diviziuni (${format(config.minorDivision, config.decimals)} ${config.unit}) È™i citeÈ™te din nou.`,
        state.correct ? "correct" : "incorrect"
      );

      container.dispatchEvent(new CustomEvent("laborator:instrument-reading", {
        bubbles: true,
        detail: clone(result)
      }));
      return result;
    }

    function getResult() {
      const readingError = state.studentReading === null ? null : Math.abs(state.studentReading - config.value);
      return {
        instrumentId: config.id,
        instrumentType: config.type,
        label: config.label,
        unit: config.unit,
        minimum: config.minimum,
        maximum: config.maximum,
        resolution: config.minorDivision,
        simulatedValue: config.value,
        studentReading: state.studentReading,
        readingError: readingError === null ? null : round(readingError, Math.max(config.decimals + 2, 4)),
        tolerance: config.tolerance,
        correct: state.correct,
        attempts: state.attempts,
        verifiedAt: state.verifiedAt
      };
    }

    function setValue(newValue) {
      const value = finite(newValue, NaN);
      if (!Number.isFinite(value) || value < config.minimum || value > config.maximum) {
        throw new Error("Noua valoare nu se aflÄƒ Ã®n domeniul instrumentului.");
      }
      config.value = value;
      state.correct = false;
      state.studentReading = null;
      state.verifiedAt = null;
      createInterface(container, config);
      bindVerifyButton();
      return api;
    }

    function bindVerifyButton() {
      const button = resolveElement(config.verifyButton);
      if (!button || button.dataset.scaleVerifyBound === config.uid) return;
      button.dataset.scaleVerifyBound = config.uid;
      button.addEventListener("click", () => verifica());
    }

    const api = Object.freeze({
      verifica,
      verify: verifica,
      getResult,
      getConfig: () => clone(config),
      setValue
    });
    bindVerifyButton();
    return api;
  }

  function afiseaza(options = {}) {
    const config = normalizedConfig(options);
    const container = resolveElement(config.target);
    if (!container) throw new Error("Containerul instrumentului nu a fost gÄƒsit.");
    config.uid = `lab-scale-${nextId++}`;
    config.id = config.id || config.uid;
    createInterface(container, config);
    const instance = createInstance(container, config);
    instances.set(container, instance);
    return instance;
  }

  function getInstance(target) {
    const element = resolveElement(target);
    return element ? instances.get(element) || null : null;
  }

  function citireAleatorie(options = {}) {
    const config = normalizedConfig(options);
    const minimumIndex = Math.ceil(config.minimum / config.minorDivision);
    const maximumIndex = Math.floor(config.maximum / config.minorDivision);
    const range = maximumIndex - minimumIndex + 1;
    if (range < 1) throw new Error("Domeniul nu permite generarea unei citiri.");

    let randomIndex;
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / range) * range;
      do globalThis.crypto.getRandomValues(values); while (values[0] >= limit);
      randomIndex = values[0] % range;
    } else {
      randomIndex = Math.floor(Math.random() * range);
    }
    return round((minimumIndex + randomIndex) * config.minorDivision, config.decimals);
  }

  globalThis.LaboratorInstrumente = Object.freeze({
    afiseaza,
    render: afiseaza,
    getInstance,
    citireAleatorie,
    randomReading: citireAleatorie,
    tipuri: Object.freeze([...new Set(Object.values(TYPE_ALIASES))])
  });
})();
