/**
 * measurement-tools.js
 * Instrumente virtuale pentru experimentele de fizică
 * Fizică – clasa a IX-a
 *
 * Prof. Dănuț Andronie
 * e-Mail: danutmg@gmail.com
 *
 * Dependență:
 * assets/js/experiment-tools.js
 */

(function (window, document) {
  "use strict";

  if (!window.ExperimentTools) {
    throw new Error(
      "measurement-tools.js necesită experiment-tools.js încărcat anterior."
    );
  }

  const Tools = window.ExperimentTools;

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* =========================================================
     FUNCȚII GENERALE
     ========================================================= */

  function svgElement(name, attributes = {}) {
    const element =
      document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(
      ([key, value]) => {
        element.setAttribute(
          key,
          String(value)
        );
      }
    );

    return element;
  }

  function clearContainer(container) {
    while (container.firstChild) {
      container.removeChild(
        container.firstChild
      );
    }
  }

  function resolveContainer(target) {
    if (typeof target === "string") {
      const element =
        document.querySelector(target);

      if (!element) {
        throw new Error(
          `Containerul "${target}" nu există.`
        );
      }

      return element;
    }

    if (target instanceof HTMLElement) {
      return target;
    }

    throw new Error(
      "Container invalid pentru instrument."
    );
  }

  function clamp(value, min, max) {
    return Tools.numbers.clamp(
      value,
      min,
      max
    );
  }

  function mapValue(
    value,
    inputMin,
    inputMax,
    outputMin,
    outputMax
  ) {
    const ratio =
      (value - inputMin) /
      (inputMax - inputMin);

    return (
      outputMin +
      ratio *
      (outputMax - outputMin)
    );
  }

  function formatScaleValue(
    value,
    decimals = 0
  ) {
    return Tools.numbers.formatNumber(
      value,
      decimals
    );
  }

  function addTitle(
    container,
    text
  ) {
    if (!text) {
      return;
    }

    const title =
      document.createElement("div");

    title.className =
      "measurement-tool-title";

    title.textContent = text;

    container.appendChild(title);
  }

  /* =========================================================
     RIGLĂ
     ========================================================= */

  function createRuler(target, options = {}) {
    const container =
      resolveContainer(target);

    clearContainer(container);

    const config = {
      min: 0,
      max: 0.30,
      majorStep: 0.01,
      minorStep: 0.001,
      unit: "m",
      orientation: "vertical",
      value: 0,
      width: 110,
      height: 420,
      showLabels: true,
      decimals: 2,
      title: "Riglă",
      ...options
    };

    addTitle(
      container,
      config.title
    );

    const svg =
      svgElement("svg", {
        viewBox:
          `0 0 ${config.width} ${config.height}`,
        role: "img",
        "aria-label":
          "Riglă gradată"
      });

    svg.classList.add(
      "measurement-ruler"
    );

    const margin = 25;

    const vertical =
      config.orientation === "vertical";

    const usableLength =
      vertical
        ? config.height - 2 * margin
        : config.width - 2 * margin;

    const scaleLine =
      svgElement("line", vertical
        ? {
            x1: 45,
            y1: margin,
            x2: 45,
            y2:
              config.height - margin,
            stroke: "currentColor",
            "stroke-width": 2
          }
        : {
            x1: margin,
            y1: 45,
            x2:
              config.width - margin,
            y2: 45,
            stroke: "currentColor",
            "stroke-width": 2
          }
      );

    svg.appendChild(scaleLine);

    const count =
      Math.round(
        (config.max - config.min) /
        config.minorStep
      );

    for (
      let i = 0;
      i <= count;
      i += 1
    ) {
      const value =
        config.min +
        i * config.minorStep;

      const majorRatio =
        value / config.majorStep;

      const isMajor =
        Math.abs(
          majorRatio -
          Math.round(majorRatio)
        ) < 1e-6;

      const mediumStep =
        config.majorStep / 2;

      const mediumRatio =
        value / mediumStep;

      const isMedium =
        !isMajor &&
        Math.abs(
          mediumRatio -
          Math.round(mediumRatio)
        ) < 1e-6;

      const length =
        isMajor
          ? 22
          : isMedium
            ? 15
            : 9;

      const position =
        mapValue(
          value,
          config.min,
          config.max,
          0,
          usableLength
        );

      let tick;

      if (vertical) {
        const y =
          config.height -
          margin -
          position;

        tick =
          svgElement("line", {
            x1: 45,
            y1: y,
            x2: 45 + length,
            y2: y,
            stroke: "currentColor",
            "stroke-width":
              isMajor ? 2 : 1
          });

        if (
          isMajor &&
          config.showLabels
        ) {
          const label =
            svgElement("text", {
              x: 40,
              y: y + 4,
              "text-anchor": "end",
              "font-size": 11,
              fill: "currentColor"
            });

          label.textContent =
            formatScaleValue(
              value,
              config.decimals
            );

          svg.appendChild(label);
        }
      } else {
        const x =
          margin +
          position;

        tick =
          svgElement("line", {
            x1: x,
            y1: 45,
            x2: x,
            y2: 45 + length,
            stroke: "currentColor",
            "stroke-width":
              isMajor ? 2 : 1
          });

        if (
          isMajor &&
          config.showLabels
        ) {
          const label =
            svgElement("text", {
              x,
              y: 82,
              "text-anchor": "middle",
              "font-size": 11,
              fill: "currentColor"
            });

          label.textContent =
            formatScaleValue(
              value,
              config.decimals
            );

          svg.appendChild(label);
        }
      }

      svg.appendChild(tick);
    }

    const unit =
      svgElement("text", vertical
        ? {
            x: config.width / 2,
            y: 16,
            "text-anchor": "middle",
            "font-size": 12,
            fill: "currentColor"
          }
        : {
            x:
              config.width - 8,
            y: 20,
            "text-anchor": "end",
            "font-size": 12,
            fill: "currentColor"
          }
      );

    unit.textContent =
      config.unit;

    svg.appendChild(unit);

    /*
     * Markerul indică poziția obiectului,
     * NU afișează numeric valoarea.
     */
    const marker =
      svgElement("line", {
        stroke: "#e53935",
        "stroke-width": 3
      });

    svg.appendChild(marker);

    function setValue(value) {
      const safeValue =
        clamp(
          value,
          config.min,
          config.max
        );

      config.value =
        safeValue;

      const position =
        mapValue(
          safeValue,
          config.min,
          config.max,
          0,
          usableLength
        );

      if (vertical) {
        const y =
          config.height -
          margin -
          position;

        marker.setAttribute(
          "x1",
          "20"
        );

        marker.setAttribute(
          "x2",
          "92"
        );

        marker.setAttribute(
          "y1",
          y
        );

        marker.setAttribute(
          "y2",
          y
        );
      } else {
        const x =
          margin +
          position;

        marker.setAttribute(
          "x1",
          x
        );

        marker.setAttribute(
          "x2",
          x
        );

        marker.setAttribute(
          "y1",
          "18"
        );

        marker.setAttribute(
          "y2",
          "92"
        );
      }
    }

    setValue(config.value);

    container.appendChild(svg);

    return {
      type: "ruler",

      element: svg,

      config,

      setValue,

      getValue() {
        return config.value;
      }
    };
  }

  /* =========================================================
     CRONOMETRU
     ========================================================= */

  function createStopwatch(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(container);

    const config = {
      resolution: 0.01,
      title: "Cronometru",
      showControls: true,
      onStart: null,
      onStop: null,
      onReset: null,
      ...options
    };

    addTitle(
      container,
      config.title
    );

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "virtual-stopwatch";

    const display =
      document.createElement("div");

    display.className =
      "stopwatch-display";

    display.setAttribute(
      "role",
      "timer"
    );

    display.textContent =
      "00:00.00";

    wrapper.appendChild(display);

    const controls =
      document.createElement("div");

    controls.className =
      "stopwatch-controls";

    const startButton =
      document.createElement("button");

    startButton.type = "button";
    startButton.textContent = "START";

    const stopButton =
      document.createElement("button");

    stopButton.type = "button";
    stopButton.textContent = "STOP";

    const resetButton =
      document.createElement("button");

    resetButton.type = "button";
    resetButton.textContent = "RESET";

    controls.append(
      startButton,
      stopButton,
      resetButton
    );

    if (config.showControls) {
      wrapper.appendChild(
        controls
      );
    }

    container.appendChild(
      wrapper
    );

    let running = false;
    let startTime = 0;
    let accumulated = 0;
    let frameId = null;

    function formatTime(seconds) {
      const minutes =
        Math.floor(
          seconds / 60
        );

      const remaining =
        seconds -
        minutes * 60;

      const sec =
        Math.floor(
          remaining
        );

      const hundredths =
        Math.floor(
          (
            remaining -
            sec
          ) * 100
        );

      return (
        String(minutes)
          .padStart(2, "0") +
        ":" +
        String(sec)
          .padStart(2, "0") +
        "." +
        String(hundredths)
          .padStart(2, "0")
      );
    }

    function currentTime() {
      if (!running) {
        return accumulated;
      }

      return (
        accumulated +
        (
          performance.now() -
          startTime
        ) /
        1000
      );
    }

    function updateDisplay() {
      display.textContent =
        formatTime(
          currentTime()
        );

      if (running) {
        frameId =
          requestAnimationFrame(
            updateDisplay
          );
      }
    }

    function start() {
      if (running) {
        return;
      }

      running = true;

      startTime =
        performance.now();

      updateDisplay();

      if (
        typeof config.onStart ===
        "function"
      ) {
        config.onStart(
          currentTime()
        );
      }
    }

    function stop() {
      if (!running) {
        return currentTime();
      }

      accumulated =
        currentTime();

      running = false;

      if (frameId) {
        cancelAnimationFrame(
          frameId
        );
      }

      updateDisplay();

      const measured =
        Tools.numbers.quantize(
          accumulated,
          config.resolution
        );

      if (
        typeof config.onStop ===
        "function"
      ) {
        config.onStop(
          measured
        );
      }

      return measured;
    }

    function reset() {
      running = false;

      accumulated = 0;
      startTime = 0;

      if (frameId) {
        cancelAnimationFrame(
          frameId
        );
      }

      display.textContent =
        "00:00.00";

      if (
        typeof config.onReset ===
        "function"
      ) {
        config.onReset();
      }
    }

    function setTime(seconds) {
      accumulated =
        Math.max(
          0,
          seconds
        );

      display.textContent =
        formatTime(
          accumulated
        );
    }

    startButton.addEventListener(
      "click",
      start
    );

    stopButton.addEventListener(
      "click",
      stop
    );

    resetButton.addEventListener(
      "click",
      reset
    );

    return {
      type: "stopwatch",

      element: wrapper,

      start,
      stop,
      reset,
      setTime,

      getTime() {
        return Tools.numbers.quantize(
          currentTime(),
          config.resolution
        );
      },

      isRunning() {
        return running;
      }
    };
  }

  /* =========================================================
     DINAMOMETRU ANALOGIC
     ========================================================= */

  function createDynamometer(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(container);

    const config = {
      min: 0,
      max: 5,
      majorStep: 1,
      minorStep: 0.1,
      resolution: 0.1,
      unit: "N",
      value: 0,
      height: 430,
      width: 120,
      title: "Dinamometru",
      ...options
    };

    addTitle(
      container,
      config.title
    );

    const svg =
      svgElement("svg", {
        viewBox:
          `0 0 ${config.width} ${config.height}`,
        role: "img",
        "aria-label":
          "Dinamometru analogic"
      });

    svg.classList.add(
      "measurement-dynamometer"
    );

    const body =
      svgElement("rect", {
        x: 20,
        y: 20,
        width:
          config.width - 40,
        height:
          config.height - 70,
        rx: 18,
        fill: "#f8fafc",
        stroke: "#475569",
        "stroke-width": 3
      });

    svg.appendChild(body);

    const top = 55;
    const bottom =
      config.height - 75;

    const axis =
      svgElement("line", {
        x1: 58,
        y1: top,
        x2: 58,
        y2: bottom,
        stroke: "#334155",
        "stroke-width": 2
      });

    svg.appendChild(axis);

    const count =
      Math.round(
        (config.max - config.min) /
        config.minorStep
      );

    for (
      let i = 0;
      i <= count;
      i += 1
    ) {
      const value =
        config.min +
        i * config.minorStep;

      const ratio =
        value /
        config.majorStep;

      const isMajor =
        Math.abs(
          ratio -
          Math.round(ratio)
        ) < 1e-6;

      const y =
        mapValue(
          value,
          config.min,
          config.max,
          top,
          bottom
        );

      const tick =
        svgElement("line", {
          x1: 58,
          y1: y,
          x2:
            isMajor ? 83 : 72,
          y2: y,
          stroke: "#334155",
          "stroke-width":
            isMajor ? 2 : 1
        });

      svg.appendChild(tick);

      if (isMajor) {
        const label =
          svgElement("text", {
            x: 50,
            y: y + 4,
            "text-anchor": "end",
            "font-size": 12,
            fill: "#334155"
          });

        label.textContent =
          formatScaleValue(
            value,
            0
          );

        svg.appendChild(label);
      }
    }

    const unitLabel =
      svgElement("text", {
        x: 60,
        y: 44,
        "text-anchor": "middle",
        "font-size": 13,
        "font-weight": "bold",
        fill: "#334155"
      });

    unitLabel.textContent =
      config.unit;

    svg.appendChild(
      unitLabel
    );

    const pointer =
      svgElement("polygon", {
        fill: "#dc2626"
      });

    svg.appendChild(pointer);

    const hook =
      svgElement("path", {
        d:
          `M60 ${config.height - 48}
           V${config.height - 30}
           C60 ${config.height - 15},
            85 ${config.height - 15},
            85 ${config.height - 32}`,
        fill: "none",
        stroke: "#475569",
        "stroke-width": 4,
        "stroke-linecap": "round"
      });

    svg.appendChild(hook);

    function setValue(value) {
      config.value =
        clamp(
          value,
          config.min,
          config.max
        );

      const y =
        mapValue(
          config.value,
          config.min,
          config.max,
          top,
          bottom
        );

      pointer.setAttribute(
        "points",
        `88,${y}
         104,${y - 8}
         104,${y + 8}`
      );
    }

    setValue(
      config.value
    );

    container.appendChild(svg);

    return {
      type: "dynamometer",

      element: svg,

      setValue,

      getValue() {
        return config.value;
      },

      getResolution() {
        return config.resolution;
      }
    };
  }

  /* =========================================================
     BALANȚĂ DIGITALĂ
     ========================================================= */

  function createBalance(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(container);

    const config = {
      min: 0,
      max: 2000,
      resolution: 1,
      unit: "g",
      value: 0,
      title: "Balanță",
      ...options
    };

    addTitle(
      container,
      config.title
    );

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "virtual-balance";

    const plate =
      document.createElement("div");

    plate.className =
      "balance-plate";

    const body =
      document.createElement("div");

    body.className =
      "balance-body";

    const display =
      document.createElement("div");

    display.className =
      "balance-display";

    body.appendChild(
      display
    );

    wrapper.append(
      plate,
      body
    );

    function setValue(value) {
      config.value =
        Tools.numbers.quantize(
          clamp(
            value,
            config.min,
            config.max
          ),
          config.resolution
        );

      /*
       * La balanța digitală afișarea numerică
       * este parte din instrumentul real.
       */
      display.textContent =
        `${Tools.numbers.formatNumber(
          config.value,
          config.resolution < 1
            ? 1
            : 0
        )} ${config.unit}`;
    }

    setValue(
      config.value
    );

    container.appendChild(
      wrapper
    );

    return {
      type: "balance",

      element: wrapper,

      setValue,

      getValue() {
        return config.value;
      }
    };
  }

  /* =========================================================
     CILINDRU GRADAT
     ========================================================= */

  function createGraduatedCylinder(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(container);

    const config = {
      capacity: 1000,
      resolution: 10,
      majorStep: 100,
      minorStep: 10,
      value: 0,
      unit: "mL",
      width: 180,
      height: 440,
      title: "Cilindru gradat",
      ...options
    };

    addTitle(
      container,
      config.title
    );

    const svg =
      svgElement("svg", {
        viewBox:
          `0 0 ${config.width} ${config.height}`,
        role: "img",
        "aria-label":
          "Cilindru gradat"
      });

    svg.classList.add(
      "measurement-cylinder"
    );

    const top = 35;
    const bottom =
      config.height - 55;

    const left = 55;
    const right = 125;

    const liquidClipId =
      `cylinder-clip-${Math.random()
        .toString(36)
        .slice(2)}`;

    const defs =
      svgElement("defs");

    const clip =
      svgElement("clipPath", {
        id: liquidClipId
      });

    const clipRect =
      svgElement("rect", {
        x: left,
        y: top,
        width:
          right - left,
        height:
          bottom - top,
        rx: 8
      });

    clip.appendChild(
      clipRect
    );

    defs.appendChild(
      clip
    );

    svg.appendChild(defs);

    const body =
      svgElement("path", {
        d:
          `M${left} ${top}
           L${left} ${bottom}
           Q${left} ${bottom + 15}
            ${(left + right) / 2}
            ${bottom + 15}
           Q${right} ${bottom + 15}
            ${right} ${bottom}
           L${right} ${top}`,
        fill: "#ffffff",
        stroke: "#475569",
        "stroke-width": 3
      });

    svg.appendChild(body);

    const liquid =
      svgElement("rect", {
        x: left,
        y: bottom,
        width:
          right - left,
        height: 0,
        fill: "#38bdf8",
        opacity: 0.65,
        "clip-path":
          `url(#${liquidClipId})`
      });

    svg.appendChild(
      liquid
    );

    /*
     * Menisc concav pentru apă.
     */
    const meniscus =
      svgElement("path", {
        fill: "none",
        stroke: "#0284c7",
        "stroke-width": 2
      });

    svg.appendChild(
      meniscus
    );

    const count =
      Math.round(
        config.capacity /
        config.minorStep
      );

    for (
      let i = 0;
      i <= count;
      i += 1
    ) {
      const value =
        i *
        config.minorStep;

      const isMajor =
        value %
          config.majorStep ===
        0;

      const y =
        mapValue(
          value,
          0,
          config.capacity,
          bottom,
          top
        );

      const tick =
        svgElement("line", {
          x1: right,
          y1: y,
          x2:
            right +
            (
              isMajor
                ? 28
                : 15
            ),
          y2: y,
          stroke: "#334155",
          "stroke-width":
            isMajor ? 2 : 1
        });

      svg.appendChild(tick);

      if (isMajor) {
        const label =
          svgElement("text", {
            x:
              right + 34,
            y: y + 4,
            "font-size": 11,
            fill: "#334155"
          });

        label.textContent =
          String(value);

        svg.appendChild(
          label
        );
      }
    }

    const unit =
      svgElement("text", {
        x:
          config.width - 8,
        y: 20,
        "text-anchor": "end",
        "font-size": 12,
        fill: "#334155"
      });

    unit.textContent =
      config.unit;

    svg.appendChild(unit);

    function setValue(value) {
      config.value =
        clamp(
          value,
          0,
          config.capacity
        );

      const levelY =
        mapValue(
          config.value,
          0,
          config.capacity,
          bottom,
          top
        );

      liquid.setAttribute(
        "y",
        levelY
      );

      liquid.setAttribute(
        "height",
        bottom - levelY
      );

      /*
       * Curba este intenționat puțin accentuată
       * pentru ca elevul să poată identifica
       * partea inferioară a meniscului.
       */
      meniscus.setAttribute(
        "d",
        `M${left + 2} ${levelY - 3}
         Q${(left + right) / 2}
          ${levelY + 4}
          ${right - 2}
          ${levelY - 3}`
      );
    }

    setValue(
      config.value
    );

    container.appendChild(svg);

    return {
      type:
        "graduatedCylinder",

      element: svg,

      setValue,

      getValue() {
        return config.value;
      },

      getResolution() {
        return config.resolution;
      }
    };
  }

  /* =========================================================
     RAPORTOR
     ========================================================= */

  function createProtractor(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(container);

    const config = {
      min: 0,
      max: 180,
      value: 30,
      resolution: 1,
      width: 340,
      height: 190,
      title: "Raportor",
      ...options
    };

    addTitle(
      container,
      config.title
    );

    const svg =
      svgElement("svg", {
        viewBox:
          `0 0 ${config.width} ${config.height}`,
        role: "img",
        "aria-label": "Raportor"
      });

    const cx =
      config.width / 2;

    const cy =
      config.height - 15;

    const radius =
      Math.min(
        cx - 20,
        cy - 10
      );

    const semicircle =
      svgElement("path", {
        d:
          `M${cx - radius} ${cy}
           A${radius} ${radius}
           0 0 1
           ${cx + radius} ${cy}`,
        fill: "none",
        stroke: "#475569",
        "stroke-width": 3
      });

    svg.appendChild(
      semicircle
    );

    for (
      let angle = 0;
      angle <= 180;
      angle += 5
    ) {
      const radians =
        angle *
        Math.PI /
        180;

      const major =
        angle % 10 === 0;

      const innerRadius =
        radius -
        (
          major
            ? 18
            : 10
        );

      const x1 =
        cx -
        radius *
        Math.cos(radians);

      const y1 =
        cy -
        radius *
        Math.sin(radians);

      const x2 =
        cx -
        innerRadius *
        Math.cos(radians);

      const y2 =
        cy -
        innerRadius *
        Math.sin(radians);

      svg.appendChild(
        svgElement("line", {
          x1,
          y1,
          x2,
          y2,
          stroke: "#334155",
          "stroke-width":
            major ? 2 : 1
        })
      );

      if (
        major &&
        angle > 0 &&
        angle < 180
      ) {
        const labelRadius =
          radius - 33;

        const tx =
          cx -
          labelRadius *
          Math.cos(radians);

        const ty =
          cy -
          labelRadius *
          Math.sin(radians);

        const label =
          svgElement("text", {
            x: tx,
            y: ty + 4,
            "text-anchor": "middle",
            "font-size": 10,
            fill: "#334155"
          });

        label.textContent =
          String(angle);

        svg.appendChild(
          label
        );
      }
    }

    const pointer =
      svgElement("line", {
        x1: cx,
        y1: cy,
        stroke: "#dc2626",
        "stroke-width": 3
      });

    svg.appendChild(pointer);

    function setValue(value) {
      config.value =
        clamp(
          value,
          0,
          180
        );

      const radians =
        config.value *
        Math.PI /
        180;

      const pointerRadius =
        radius - 10;

      pointer.setAttribute(
        "x2",
        cx -
          pointerRadius *
          Math.cos(radians)
      );

      pointer.setAttribute(
        "y2",
        cy -
          pointerRadius *
          Math.sin(radians)
      );
    }

    setValue(
      config.value
    );

    container.appendChild(svg);

    return {
      type: "protractor",

      element: svg,

      setValue,

      getValue() {
        return config.value;
      }
    };
  }

  /* =========================================================
     VALIDAREA CITIRII INSTRUMENTULUI
     ========================================================= */

  function validateReading(options) {
    const {
      studentValue,
      expectedValue,
      resolution = 0,
      absoluteTolerance = 0,
      relativeTolerance = 0
    } = options;

    return Tools.measurement
      .checkMeasurement({
        studentValue,
        expectedValue,
        resolution,
        absoluteTolerance,
        relativeTolerance
      });
  }

  /* =========================================================
     CÂMP PENTRU CITIREA ELEVULUI
     ========================================================= */

  function createReadingInput(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    const config = {
      label:
        "Valoarea citită",
      unit: "",
      placeholder: "",
      expectedValue: null,
      resolution: 0,
      relativeTolerance: 0,
      maxAttempts: 3,
      hint:
        "Privește cu atenție scala instrumentului.",
      onCorrect: null,
      onWrong: null,
      onComplete: null,
      ...options
    };

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "measurement-reading";

    const label =
      document.createElement("label");

    label.className =
      "measurement-reading-label";

    label.textContent =
      config.label;

    const row =
      document.createElement("div");

    row.className =
      "measurement-reading-row";

    const input =
      document.createElement("input");

    input.type = "text";

    input.inputMode =
      "decimal";

    input.autocomplete =
      "off";

    input.placeholder =
      config.placeholder;

    input.setAttribute(
      "aria-label",
      config.label
    );

    const unit =
      document.createElement("span");

    unit.className =
      "measurement-reading-unit";

    unit.textContent =
      config.unit;

    const button =
      document.createElement("button");

    button.type = "button";

    button.textContent =
      "Verifică";

    button.className =
      "measurement-check-button";

    const feedback =
      document.createElement("div");

    feedback.className =
      "measurement-feedback";

    feedback.setAttribute(
      "aria-live",
      "polite"
    );

    row.append(
      input,
      unit,
      button
    );

    wrapper.append(
      label,
      row,
      feedback
    );

    container.appendChild(
      wrapper
    );

    let attempts = 0;
    let completed = false;

    function check() {
      if (completed) {
        return;
      }

      const result =
        validateReading({
          studentValue:
            input.value,

          expectedValue:
            config.expectedValue,

          resolution:
            config.resolution,

          relativeTolerance:
            config.relativeTolerance
        });

      if (!result.valid) {
        feedback.textContent =
          "Introdu o valoare numerică.";

        feedback.className =
          "measurement-feedback is-error";

        return;
      }

      attempts += 1;

      if (result.accepted) {
        completed = true;

        feedback.textContent =
          "✓ Citire corectă.";

        feedback.className =
          "measurement-feedback is-correct";

        input.disabled = true;
        button.disabled = true;

        if (
          typeof config.onCorrect ===
          "function"
        ) {
          config.onCorrect(
            result
          );
        }

        if (
          typeof config.onComplete ===
          "function"
        ) {
          config.onComplete(
            result
          );
        }

        return;
      }

      if (
        attempts <
        config.maxAttempts
      ) {
        feedback.textContent =
          `Mai încearcă. ${config.hint}`;

        feedback.className =
          "measurement-feedback is-hint";
      } else {
        /*
         * Nu afișăm automat valoarea reală.
         * Elevul este îndrumat să citească din nou.
         */
        feedback.textContent =
          "Citirea nu este încă în limitele acceptate. Verifică poziția indicatorului și diviziunile scalei.";

        feedback.className =
          "measurement-feedback is-error";
      }

      if (
        typeof config.onWrong ===
        "function"
      ) {
        config.onWrong(
          result,
          attempts
        );
      }
    }

    button.addEventListener(
      "click",
      check
    );

    input.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter"
        ) {
          check();
        }
      }
    );

    return {
      element: wrapper,

      input,

      check,

      reset() {
        attempts = 0;
        completed = false;

        input.disabled = false;
        button.disabled = false;

        input.value = "";

        feedback.textContent = "";

        feedback.className =
          "measurement-feedback";
      },

      setExpectedValue(value) {
        config.expectedValue =
          value;
      },

      getAttempts() {
        return attempts;
      },

      isCompleted() {
        return completed;
      }
    };
  }

  /* =========================================================
     FACTORY GENERALĂ
     ========================================================= */

  function create(
    type,
    target,
    options = {}
  ) {
    switch (type) {
      case "ruler":
      case "verticalRuler":
        return createRuler(
          target,
          {
            orientation:
              type ===
              "verticalRuler"
                ? "vertical"
                : options.orientation,
            ...options
          }
        );

      case "stopwatch":
        return createStopwatch(
          target,
          options
        );

      case "dynamometer":
      case "analogDynamometer":
        return createDynamometer(
          target,
          options
        );

      case "balance":
        return createBalance(
          target,
          options
        );

      case "graduatedCylinder":
        return createGraduatedCylinder(
          target,
          options
        );

      case "protractor":
        return createProtractor(
          target,
          options
        );

      default:
        throw new Error(
          `Instrument necunoscut: ${type}`
        );
    }
  }

  /* =========================================================
     API PUBLIC
     ========================================================= */

  window.MeasurementTools = {
    version: "1.0.0",

    create,

    createRuler,
    createStopwatch,
    createDynamometer,
    createBalance,
    createGraduatedCylinder,
    createProtractor,

    createReadingInput,

    validateReading
  };

})(window, document);
