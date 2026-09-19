/**
 * measurement-tools.js
 * Instrumente virtuale statice pentru experimentele de fizică
 * Fizică – clasa a IX-a
 *
 * Principii:
 * - fără animații;
 * - fără requestAnimationFrame;
 * - elevul citește instrumentul;
 * - valoarea măsurată nu este completată automat;
 * - elevul notează în caiet și introduce manual valoarea;
 * - verificarea acceptă toleranța determinată de rezoluția instrumentului.
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
      document.createElementNS(
        SVG_NS,
        name
      );

    Object.entries(attributes)
      .forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null
        ) {
          element.setAttribute(
            key,
            String(value)
          );
        }
      });

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
        document.querySelector(
          target
        );

      if (!element) {
        throw new Error(
          `Containerul "${target}" nu există.`
        );
      }

      return element;
    }

    if (
      target instanceof
      HTMLElement
    ) {
      return target;
    }

    throw new Error(
      "Container invalid pentru instrument."
    );
  }

  function clamp(
    value,
    min,
    max
  ) {
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
    if (
      inputMax === inputMin
    ) {
      return outputMin;
    }

    const ratio =
      (
        value -
        inputMin
      ) /
      (
        inputMax -
        inputMin
      );

    return (
      outputMin +
      ratio *
      (
        outputMax -
        outputMin
      )
    );
  }

  function nearlyInteger(
    value,
    tolerance = 1e-6
  ) {
    return (
      Math.abs(
        value -
        Math.round(value)
      ) <
      tolerance
    );
  }

  function decimalsFromResolution(
    resolution
  ) {
    if (
      !Number.isFinite(
        resolution
      ) ||
      resolution <= 0
    ) {
      return 2;
    }

    const text =
      resolution.toString();

    if (
      text.includes("e-")
    ) {
      return Number(
        text.split("e-")[1]
      );
    }

    const point =
      text.indexOf(".");

    return point < 0
      ? 0
      : text.length -
        point -
        1;
  }

  function formatNumber(
    value,
    decimals = 2
  ) {
    return Tools.numbers
      .formatNumber(
        value,
        decimals
      );
  }

  function addTitle(
    container,
    text
  ) {
    if (!text) {
      return null;
    }

    const title =
      document.createElement(
        "div"
      );

    title.className =
      "measurement-tool-title";

    title.textContent =
      text;

    container.appendChild(
      title
    );

    return title;
  }

  function createToolWrapper(
    container,
    className
  ) {
    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.className =
      `measurement-tool ${className}`;

    container.appendChild(
      wrapper
    );

    return wrapper;
  }

  /* =========================================================
     RIGLĂ
     ========================================================= */

  function createRuler(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(
      container
    );

    const config = {
      min: 0,
      max: 0.30,

      majorStep: 0.01,
      minorStep: 0.001,

      resolution: 0.001,

      unit: "m",

      orientation: "vertical",

      value: 0,

      showLabels: true,

      decimals: null,

      title: "Riglă",

      markerColor: "#dc2626",

      ...options
    };

    if (
      config.decimals ===
      null
    ) {
      config.decimals =
        decimalsFromResolution(
          config.majorStep
        );
    }

    addTitle(
      container,
      config.title
    );

    const vertical =
      config.orientation ===
      "vertical";

    const width =
      vertical ? 130 : 400;

    const height =
      vertical ? 430 : 125;

    const svg =
      svgElement(
        "svg",
        {
          viewBox:
            `0 0 ${width} ${height}`,

          role: "img",

          "aria-label":
            "Riglă gradată"
        }
      );

    svg.classList.add(
      "measurement-ruler"
    );

    const margin =
      vertical ? 28 : 32;

    const usable =
      vertical
        ? height -
          2 * margin
        : width -
          2 * margin;

    const axisX = 55;
    const axisY = 42;

    const axis =
      vertical
        ? svgElement(
            "line",
            {
              x1: axisX,
              y1: margin,
              x2: axisX,
              y2:
                height -
                margin,
              stroke: "#334155",
              "stroke-width": 2
            }
          )
        : svgElement(
            "line",
            {
              x1: margin,
              y1: axisY,
              x2:
                width -
                margin,
              y2: axisY,
              stroke: "#334155",
              "stroke-width": 2
            }
          );

    svg.appendChild(axis);

    const interval =
      config.max -
      config.min;

    const count =
      Math.round(
        interval /
        config.minorStep
      );

    for (
      let i = 0;
      i <= count;
      i += 1
    ) {
      const value =
        config.min +
        i *
        config.minorStep;

      const majorRatio =
        (
          value -
          config.min
        ) /
        config.majorStep;

      const isMajor =
        nearlyInteger(
          majorRatio
        );

      const halfStep =
        config.majorStep /
        2;

      const mediumRatio =
        (
          value -
          config.min
        ) /
        halfStep;

      const isMedium =
        !isMajor &&
        nearlyInteger(
          mediumRatio
        );

      const tickLength =
        isMajor
          ? 24
          : isMedium
            ? 16
            : 9;

      const position =
        mapValue(
          value,
          config.min,
          config.max,
          0,
          usable
        );

      if (vertical) {
        const y =
          height -
          margin -
          position;

        svg.appendChild(
          svgElement(
            "line",
            {
              x1: axisX,
              y1: y,
              x2:
                axisX +
                tickLength,
              y2: y,
              stroke: "#334155",
              "stroke-width":
                isMajor
                  ? 2
                  : 1
            }
          )
        );

        if (
          isMajor &&
          config.showLabels
        ) {
          const label =
            svgElement(
              "text",
              {
                x:
                  axisX -
                  6,
                y:
                  y +
                  4,
                "text-anchor":
                  "end",
                "font-size":
                  11,
                fill:
                  "#334155"
              }
            );

          label.textContent =
            formatNumber(
              value,
              config.decimals
            );

          svg.appendChild(
            label
          );
        }
      } else {
        const x =
          margin +
          position;

        svg.appendChild(
          svgElement(
            "line",
            {
              x1: x,
              y1: axisY,
              x2: x,
              y2:
                axisY +
                tickLength,
              stroke:
                "#334155",
              "stroke-width":
                isMajor
                  ? 2
                  : 1
            }
          )
        );

        if (
          isMajor &&
          config.showLabels
        ) {
          const label =
            svgElement(
              "text",
              {
                x,
                y: 88,
                "text-anchor":
                  "middle",
                "font-size":
                  11,
                fill:
                  "#334155"
              }
            );

          label.textContent =
            formatNumber(
              value,
              config.decimals
            );

          svg.appendChild(
            label
          );
        }
      }
    }

    const unitLabel =
      svgElement(
        "text",
        vertical
          ? {
              x:
                width -
                12,
              y: 20,
              "text-anchor":
                "end",
              "font-size": 12,
              "font-weight":
                "600",
              fill:
                "#334155"
            }
          : {
              x:
                width -
                8,
              y: 20,
              "text-anchor":
                "end",
              "font-size": 12,
              "font-weight":
                "600",
              fill:
                "#334155"
            }
      );

    unitLabel.textContent =
      config.unit;

    svg.appendChild(
      unitLabel
    );

    /*
     * Reperul este vizual.
     * Valoarea numerică nu este afișată.
     */
    const marker =
      svgElement(
        "line",
        {
          stroke:
            config.markerColor,
          "stroke-width": 3,
          "stroke-linecap":
            "round"
        }
      );

    svg.appendChild(
      marker
    );

    function setValue(value) {
      const safe =
        clamp(
          Number(value),
          config.min,
          config.max
        );

      config.value =
        safe;

      const position =
        mapValue(
          safe,
          config.min,
          config.max,
          0,
          usable
        );

      if (vertical) {
        const y =
          height -
          margin -
          position;

        marker.setAttribute(
          "x1",
          "22"
        );

        marker.setAttribute(
          "x2",
          "114"
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
          "17"
        );

        marker.setAttribute(
          "y2",
          "105"
        );
      }
    }

    setValue(
      config.value
    );

    container.appendChild(
      svg
    );

    return {
      type: "ruler",

      element: svg,

      config,

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
     CRONOMETRU STATIC
     ========================================================= */

  function createStopwatch(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(
      container
    );

    const config = {
      title: "Cronometru",

      value: null,

      resolution: 0.01,

      revealValue: false,

      ...options
    };

    addTitle(
      container,
      config.title
    );

    const wrapper =
      createToolWrapper(
        container,
        "virtual-stopwatch"
      );

    const display =
      document.createElement(
        "div"
      );

    display.className =
      "stopwatch-display";

    display.setAttribute(
      "role",
      "timer"
    );

    display.textContent =
      "00:00.00";

    const note =
      document.createElement(
        "div"
      );

    note.className =
      "stopwatch-status";

    note.textContent =
      "Cronometru pregătit";

    wrapper.append(
      display,
      note
    );

    function setValue(value) {
      config.value =
        Tools.numbers.quantize(
          Math.max(
            0,
            Number(value)
          ),
          config.resolution
        );

      if (
        config.revealValue
      ) {
        display.textContent =
          `${formatNumber(
            config.value,
            decimalsFromResolution(
              config.resolution
            )
          )} s`;
      }
    }

    function reveal() {
      if (
        !Number.isFinite(
          config.value
        )
      ) {
        return;
      }

      display.textContent =
        `${formatNumber(
          config.value,
          decimalsFromResolution(
            config.resolution
          )
        )} s`;

      note.textContent =
        "Cronometru oprit";
    }

    function showRunning() {
      display.textContent =
        "În măsurare…";

      note.textContent =
        "Cronometrul funcționează";
    }

    function reset() {
      display.textContent =
        "00:00.00";

      note.textContent =
        "Cronometru pregătit";
    }

    if (
      Number.isFinite(
        config.value
      )
    ) {
      setValue(
        config.value
      );
    }

    return {
      type: "stopwatch",

      element: wrapper,

      config,

      setValue,
      reveal,
      showRunning,
      reset,

      getValue() {
        return config.value;
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

    clearContainer(
      container
    );

    const config = {
      min: 0,
      max: 5,

      majorStep: 1,
      minorStep: 0.1,

      resolution: 0.1,

      unit: "N",

      value: 0,

      title:
        "Dinamometru",

      ...options
    };

    addTitle(
      container,
      config.title
    );

    const width = 150;
    const height = 440;

    const svg =
      svgElement(
        "svg",
        {
          viewBox:
            `0 0 ${width} ${height}`,

          role: "img",

          "aria-label":
            "Dinamometru analogic"
        }
      );

    svg.classList.add(
      "measurement-dynamometer"
    );

    const body =
      svgElement(
        "rect",
        {
          x: 20,
          y: 16,
          width: 105,
          height: 355,
          rx: 20,
          fill: "#f8fafc",
          stroke: "#475569",
          "stroke-width": 3
        }
      );

    svg.appendChild(
      body
    );

    const top = 58;
    const bottom = 335;
    const axisX = 67;

    svg.appendChild(
      svgElement(
        "line",
        {
          x1: axisX,
          y1: top,
          x2: axisX,
          y2: bottom,
          stroke: "#334155",
          "stroke-width": 2
        }
      )
    );

    const count =
      Math.round(
        (
          config.max -
          config.min
        ) /
        config.minorStep
      );

    for (
      let i = 0;
      i <= count;
      i += 1
    ) {
      const value =
        config.min +
        i *
        config.minorStep;

      const isMajor =
        nearlyInteger(
          (
            value -
            config.min
          ) /
          config.majorStep
        );

      const y =
        mapValue(
          value,
          config.min,
          config.max,
          top,
          bottom
        );

      svg.appendChild(
        svgElement(
          "line",
          {
            x1: axisX,
            y1: y,

            x2:
              axisX +
              (
                isMajor
                  ? 30
                  : 15
              ),

            y2: y,

            stroke:
              "#334155",

            "stroke-width":
              isMajor
                ? 2
                : 1
          }
        )
      );

      if (isMajor) {
        const label =
          svgElement(
            "text",
            {
              x:
                axisX -
                8,
              y:
                y +
                4,
              "text-anchor":
                "end",
              "font-size":
                12,
              fill:
                "#334155"
            }
          );

        label.textContent =
          formatNumber(
            value,
            decimalsFromResolution(
              config.majorStep
            )
          );

        svg.appendChild(
          label
        );
      }
    }

    const unit =
      svgElement(
        "text",
        {
          x: 73,
          y: 43,
          "text-anchor":
            "middle",
          "font-size": 14,
          "font-weight":
            "700",
          fill: "#334155"
        }
      );

    unit.textContent =
      config.unit;

    svg.appendChild(unit);

    const pointer =
      svgElement(
        "polygon",
        {
          fill: "#dc2626"
        }
      );

    svg.appendChild(
      pointer
    );

    /*
     * Cârligul dinamometrului.
     */
    svg.appendChild(
      svgElement(
        "path",
        {
          d:
            "M72 371 V393 " +
            "C72 416 105 416 105 391",

          fill: "none",
          stroke: "#475569",
          "stroke-width": 4,
          "stroke-linecap":
            "round"
        }
      )
    );

    function setValue(value) {
      config.value =
        clamp(
          Number(value),
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
        [
          `101,${y}`,
          `119,${y - 8}`,
          `119,${y + 8}`
        ].join(" ")
      );
    }

    setValue(
      config.value
    );

    container.appendChild(
      svg
    );

    return {
      type:
        "dynamometer",

      element: svg,

      config,

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

    clearContainer(
      container
    );

    const config = {
      min: 0,
      max: 2,

      resolution: 0.001,

      unit: "kg",

      value: 0,

      title: "Balanță",

      ...options
    };

    addTitle(
      container,
      config.title
    );

    const wrapper =
      createToolWrapper(
        container,
        "virtual-balance"
      );

    const plate =
      document.createElement(
        "div"
      );

    plate.className =
      "balance-plate";

    plate.setAttribute(
      "aria-hidden",
      "true"
    );

    const body =
      document.createElement(
        "div"
      );

    body.className =
      "balance-body";

    const display =
      document.createElement(
        "div"
      );

    display.className =
      "balance-display";

    display.setAttribute(
      "role",
      "status"
    );

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
            Number(value),
            config.min,
            config.max
          ),
          config.resolution
        );

      const decimals =
        decimalsFromResolution(
          config.resolution
        );

      /*
       * Balanța digitală afișează legitim
       * valoarea numerică: aceasta este
       * indicația instrumentului real.
       */
      display.textContent =
        `${formatNumber(
          config.value,
          decimals
        )} ${config.unit}`;
    }

    setValue(
      config.value
    );

    return {
      type: "balance",

      element: wrapper,

      config,

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
     CILINDRU GRADAT
     ========================================================= */

  function createGraduatedCylinder(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(
      container
    );

    const config = {
      capacity: 1000,

      majorStep: 100,
      minorStep: 10,

      resolution: 10,

      value: 0,

      unit: "mL",

      title:
        "Cilindru gradat",

      ...options
    };

    addTitle(
      container,
      config.title
    );

    const width = 220;
    const height = 460;

    const svg =
      svgElement(
        "svg",
        {
          viewBox:
            `0 0 ${width} ${height}`,

          role: "img",

          "aria-label":
            "Cilindru gradat cu lichid"
        }
      );

    svg.classList.add(
      "measurement-cylinder"
    );

    const top = 35;
    const bottom = 405;

    const left = 55;
    const right = 130;

    const clipId =
      "cylinder-clip-" +
      Math.random()
        .toString(36)
        .slice(2);

    const defs =
      svgElement("defs");

    const clip =
      svgElement(
        "clipPath",
        {
          id: clipId
        }
      );

    clip.appendChild(
      svgElement(
        "rect",
        {
          x: left,
          y: top,
          width:
            right -
            left,
          height:
            bottom -
            top,
          rx: 7
        }
      )
    );

    defs.appendChild(
      clip
    );

    svg.appendChild(
      defs
    );

    const glass =
      svgElement(
        "path",
        {
          d:
            `M${left} ${top} ` +
            `L${left} ${bottom} ` +
            `Q${left} 425 92 425 ` +
            `Q${right} 425 ${right} ${bottom} ` +
            `L${right} ${top}`,

          fill: "#ffffff",

          stroke:
            "#475569",

          "stroke-width": 3
        }
      );

    svg.appendChild(
      glass
    );

    const liquid =
      svgElement(
        "rect",
        {
          x: left,
          y: bottom,

          width:
            right -
            left,

          height: 0,

          fill: "#38bdf8",

          opacity: 0.62,

          "clip-path":
            `url(#${clipId})`
        }
      );

    svg.appendChild(
      liquid
    );

    const meniscus =
      svgElement(
        "path",
        {
          fill: "none",
          stroke: "#0284c7",
          "stroke-width": 2.5
        }
      );

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
        nearlyInteger(
          value /
          config.majorStep
        );

      const y =
        mapValue(
          value,
          0,
          config.capacity,
          bottom,
          top
        );

      svg.appendChild(
        svgElement(
          "line",
          {
            x1: right,
            y1: y,

            x2:
              right +
              (
                isMajor
                  ? 32
                  : 17
              ),

            y2: y,

            stroke:
              "#334155",

            "stroke-width":
              isMajor
                ? 2
                : 1
          }
        )
      );

      if (isMajor) {
        const label =
          svgElement(
            "text",
            {
              x:
                right +
                38,
              y:
                y +
                4,
              "font-size":
                11,
              fill:
                "#334155"
            }
          );

        label.textContent =
          formatNumber(
            value,
            0
          );

        svg.appendChild(
          label
        );
      }
    }

    const unit =
      svgElement(
        "text",
        {
          x:
            width -
            10,
          y: 20,
          "text-anchor":
            "end",
          "font-size":
            12,
          "font-weight":
            "600",
          fill:
            "#334155"
        }
      );

    unit.textContent =
      config.unit;

    svg.appendChild(
      unit
    );

    function setValue(value) {
      config.value =
        clamp(
          Number(value),
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
        bottom -
        levelY
      );

      /*
       * Pentru apă citirea se face
       * la baza meniscului concav.
       */
      meniscus.setAttribute(
        "d",
        `M${left + 2} ${levelY - 3} ` +
        `Q${(left + right) / 2} ${levelY + 5} ` +
        `${right - 2} ${levelY - 3}`
      );
    }

    setValue(
      config.value
    );

    container.appendChild(
      svg
    );

    return {
      type:
        "graduatedCylinder",

      element: svg,

      config,

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

    clearContainer(
      container
    );

    const config = {
      min: 0,
      max: 180,

      resolution: 1,

      value: 30,

      unit: "°",

      title: "Raportor",

      ...options
    };

    addTitle(
      container,
      config.title
    );

    const width = 360;
    const height = 200;

    const cx =
      width / 2;

    const cy =
      height - 12;

    const radius = 160;

    const svg =
      svgElement(
        "svg",
        {
          viewBox:
            `0 0 ${width} ${height}`,

          role: "img",

          "aria-label":
            "Raportor gradat"
        }
      );

    svg.classList.add(
      "measurement-protractor"
    );

    svg.appendChild(
      svgElement(
        "line",
        {
          x1:
            cx -
            radius,
          y1: cy,
          x2:
            cx +
            radius,
          y2: cy,
          stroke:
            "#475569",
          "stroke-width": 2
        }
      )
    );

    svg.appendChild(
      svgElement(
        "path",
        {
          d:
            `M${cx - radius} ${cy} ` +
            `A${radius} ${radius} 0 0 1 ` +
            `${cx + radius} ${cy}`,

          fill: "none",

          stroke:
            "#475569",

          "stroke-width": 3
        }
      )
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
        angle % 10 ===
        0;

      const inner =
        radius -
        (
          major
            ? 18
            : 10
        );

      const x1 =
        cx -
        radius *
        Math.cos(
          radians
        );

      const y1 =
        cy -
        radius *
        Math.sin(
          radians
        );

      const x2 =
        cx -
        inner *
        Math.cos(
          radians
        );

      const y2 =
        cy -
        inner *
        Math.sin(
          radians
        );

      svg.appendChild(
        svgElement(
          "line",
          {
            x1,
            y1,
            x2,
            y2,
            stroke:
              "#334155",
            "stroke-width":
              major
                ? 2
                : 1
          }
        )
      );

      if (
        major &&
        angle !== 0 &&
        angle !== 180
      ) {
        const labelRadius =
          radius - 34;

        const tx =
          cx -
          labelRadius *
          Math.cos(
            radians
          );

        const ty =
          cy -
          labelRadius *
          Math.sin(
            radians
          );

        const label =
          svgElement(
            "text",
            {
              x: tx,
              y:
                ty +
                4,
              "text-anchor":
                "middle",
              "font-size":
                10,
              fill:
                "#334155"
            }
          );

        label.textContent =
          `${angle}`;

        svg.appendChild(
          label
        );
      }
    }

    const pointer =
      svgElement(
        "line",
        {
          x1: cx,
          y1: cy,
          x2: cx,
          y2: cy,
          stroke: "#dc2626",
          "stroke-width": 3,
          "stroke-linecap":
            "round"
        }
      );

    svg.appendChild(
      pointer
    );

    function setValue(value) {
      config.value =
        clamp(
          Number(value),
          config.min,
          config.max
        );

      const radians =
        config.value *
        Math.PI /
        180;

      const pointerRadius =
        radius - 8;

      pointer.setAttribute(
        "x2",
        cx -
        pointerRadius *
        Math.cos(
          radians
        )
      );

      pointer.setAttribute(
        "y2",
        cy -
        pointerRadius *
        Math.sin(
          radians
        )
      );
    }

    setValue(
      config.value
    );

    container.appendChild(
      svg
    );

    return {
      type: "protractor",

      element: svg,

      config,

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
     TERMOMETRU
     ========================================================= */

  function createThermometer(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(
      container
    );

    const config = {
      min: -10,
      max: 110,

      majorStep: 10,
      minorStep: 1,

      resolution: 1,

      value: 20,

      unit: "°C",

      title: "Termometru",

      ...options
    };

    addTitle(
      container,
      config.title
    );

    const width = 155;
    const height = 440;

    const svg =
      svgElement(
        "svg",
        {
          viewBox:
            `0 0 ${width} ${height}`,

          role: "img",

          "aria-label":
            "Termometru gradat"
        }
      );

    svg.classList.add(
      "measurement-thermometer"
    );

    const top = 35;
    const bottom = 365;

    const tubeX = 76;

    /*
     * Tub exterior.
     */
    svg.appendChild(
      svgElement(
        "rect",
        {
          x: 66,
          y: top,
          width: 20,
          height:
            bottom -
            top,
          rx: 10,
          fill: "#ffffff",
          stroke:
            "#475569",
          "stroke-width": 3
        }
      )
    );

    /*
     * Bulb.
     */
    svg.appendChild(
      svgElement(
        "circle",
        {
          cx: tubeX,
          cy: 385,
          r: 27,
          fill: "#ffffff",
          stroke:
            "#475569",
          "stroke-width": 3
        }
      )
    );

    const liquid =
      svgElement(
        "rect",
        {
          x: 71,
          y: bottom,
          width: 10,
          height: 0,
          rx: 5,
          fill: "#dc2626"
        }
      );

    svg.appendChild(
      liquid
    );

    svg.appendChild(
      svgElement(
        "circle",
        {
          cx: tubeX,
          cy: 385,
          r: 19,
          fill: "#dc2626"
        }
      )
    );

    const count =
      Math.round(
        (
          config.max -
          config.min
        ) /
        config.minorStep
      );

    for (
      let i = 0;
      i <= count;
      i += 1
    ) {
      const value =
        config.min +
        i *
        config.minorStep;

      const isMajor =
        nearlyInteger(
          (
            value -
            config.min
          ) /
          config.majorStep
        );

      const y =
        mapValue(
          value,
          config.min,
          config.max,
          bottom,
          top
        );

      svg.appendChild(
        svgElement(
          "line",
          {
            x1: 90,
            y1: y,
            x2:
              isMajor
                ? 120
                : 104,
            y2: y,
            stroke:
              "#334155",
            "stroke-width":
              isMajor
                ? 2
                : 1
          }
        )
      );

      if (isMajor) {
        const label =
          svgElement(
            "text",
            {
              x: 126,
              y:
                y +
                4,
              "font-size":
                11,
              fill:
                "#334155"
            }
          );

        label.textContent =
          `${formatNumber(
            value,
            0
          )}`;

        svg.appendChild(
          label
        );
      }
    }

    const unit =
      svgElement(
        "text",
        {
          x: 125,
          y: 20,
          "font-size": 12,
          "font-weight":
            "600",
          fill:
            "#334155"
        }
      );

    unit.textContent =
      config.unit;

    svg.appendChild(unit);

    function setValue(value) {
      config.value =
        clamp(
          Number(value),
          config.min,
          config.max
        );

      const levelY =
        mapValue(
          config.value,
          config.min,
          config.max,
          bottom,
          top
        );

      liquid.setAttribute(
        "y",
        levelY
      );

      liquid.setAttribute(
        "height",
        bottom -
        levelY +
        23
      );
    }

    setValue(
      config.value
    );

    container.appendChild(
      svg
    );

    return {
      type: "thermometer",

      element: svg,

      config,

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
     APARAT DIGITAL GENERIC
     ========================================================= */

  function createDigitalMeter(
    target,
    options = {}
  ) {
    const container =
      resolveContainer(target);

    clearContainer(
      container
    );

    const config = {
      min: -Infinity,
      max: Infinity,

      resolution: 0.01,

      value: 0,

      unit: "",

      title:
        "Aparat digital",

      label: "",

      ...options
    };

    addTitle(
      container,
      config.title
    );

    const wrapper =
      createToolWrapper(
        container,
        "virtual-digital-meter"
      );

    if (config.label) {
      const label =
        document.createElement(
          "div"
        );

      label.className =
        "digital-meter-label";

      label.textContent =
        config.label;

      wrapper.appendChild(
        label
      );
    }

    const display =
      document.createElement(
        "div"
      );

    display.className =
      "digital-meter-display";

    display.setAttribute(
      "role",
      "status"
    );

    wrapper.appendChild(
      display
    );

    function setValue(value) {
      const numeric =
        Number(value);

      config.value =
        Tools.numbers.quantize(
          clamp(
            numeric,
            config.min,
            config.max
          ),
          config.resolution
        );

      display.textContent =
        `${formatNumber(
          config.value,
          decimalsFromResolution(
            config.resolution
          )
        )} ${config.unit}`.trim();
    }

    setValue(
      config.value
    );

    return {
      type:
        "digitalMeter",

      element: wrapper,

      config,

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
     VALIDAREA CITIRII
     ========================================================= */

  function validateReading(
    options
  ) {
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
     CÂMPUL ÎN CARE ELEVUL INTRODUCE CITIREA
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

      absoluteTolerance: 0,

      relativeTolerance: 0,

      maxAttempts: 3,

      hint:
        "Privește cu atenție scala instrumentului.",

      notebookReminder: false,

      onCorrect: null,

      onWrong: null,

      onComplete: null,

      ...options
    };

    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.className =
      "measurement-reading";

    const label =
      document.createElement(
        "label"
      );

    label.className =
      "measurement-reading-label";

    label.textContent =
      config.label;

    const inputId =
      "measurement-input-" +
      Math.random()
        .toString(36)
        .slice(2);

    label.htmlFor =
      inputId;

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "measurement-reading-row";

    const input =
      document.createElement(
        "input"
      );

    input.id =
      inputId;

    input.type =
      "text";

    input.inputMode =
      "decimal";

    input.autocomplete =
      "off";

    input.spellcheck =
      false;

    input.placeholder =
      config.placeholder;

    input.className =
      "measurement-reading-input";

    const unit =
      document.createElement(
        "span"
      );

    unit.className =
      "measurement-reading-unit";

    unit.textContent =
      config.unit;

    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "measurement-check-button";

    button.textContent =
      "Verifică";

    const feedback =
      document.createElement(
        "div"
      );

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

    function showInvalidNumber() {
      feedback.textContent =
        "Introdu o valoare numerică. Poți folosi virgulă sau punct zecimal.";

      feedback.className =
        "measurement-feedback is-error";
    }

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

          absoluteTolerance:
            config.absoluteTolerance,

          relativeTolerance:
            config.relativeTolerance
        });

      if (!result.valid) {
        showInvalidNumber();
        return;
      }

      attempts += 1;

      if (result.accepted) {
        completed = true;

        feedback.textContent =
          "✓ Citire corectă.";

        feedback.className =
          "measurement-feedback is-correct";

        input.disabled =
          true;

        button.disabled =
          true;

        if (
          typeof
            config.onCorrect ===
          "function"
        ) {
          config.onCorrect(
            result
          );
        }

        if (
          typeof
            config.onComplete ===
          "function"
        ) {
          config.onComplete(
            result
          );
        }

        return;
      }

      /*
       * Nu afișăm răspunsul corect,
       * nici după mai multe încercări.
       * Elevul trebuie să recitească
       * instrumentul.
       */
      if (
        attempts === 1
      ) {
        feedback.textContent =
          `Mai încearcă. ${config.hint}`;
      } else if (
        attempts <
        config.maxAttempts
      ) {
        feedback.textContent =
          "Verifică unitatea de măsură și numărul diviziunilor dintre două gradații principale.";
      } else {
        feedback.textContent =
          "Valoarea nu este încă în intervalul acceptat. Recitește instrumentul cu atenție și verifică unitatea de măsură.";
      }

      feedback.className =
        "measurement-feedback is-hint";

      if (
        typeof
          config.onWrong ===
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
          event.key ===
          "Enter"
        ) {
          event.preventDefault();
          check();
        }
      }
    );

    return {
      element:
        wrapper,

      input,

      button,

      feedback,

      check,

      setExpectedValue(value) {
        config.expectedValue =
          value;
      },

      reset() {
        attempts = 0;
        completed = false;

        input.disabled =
          false;

        button.disabled =
          false;

        input.value = "";

        feedback.textContent =
          "";

        feedback.className =
          "measurement-feedback";
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
        return createRuler(
          target,
          options
        );

      case "verticalRuler":
        return createRuler(
          target,
          {
            ...options,
            orientation:
              "vertical"
          }
        );

      case "horizontalRuler":
        return createRuler(
          target,
          {
            ...options,
            orientation:
              "horizontal"
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
      case "digitalBalance":
        return createBalance(
          target,
          options
        );

      case "graduatedCylinder":
      case "cylinder":
        return createGraduatedCylinder(
          target,
          options
        );

      case "protractor":
        return createProtractor(
          target,
          options
        );

      case "thermometer":
        return createThermometer(
          target,
          options
        );

      case "digitalMeter":
      case "speedSensor":
        return createDigitalMeter(
          target,
          options
        );

      default:
        throw new Error(
          `Instrument necunoscut: "${type}".`
        );
    }
  }

  /* =========================================================
     API PUBLIC
     ========================================================= */

  window.MeasurementTools = {
    version: "2.0.0",

    create,

    createRuler,

    createStopwatch,

    createDynamometer,

    createBalance,

    createGraduatedCylinder,

    createProtractor,

    createThermometer,

    createDigitalMeter,

    createReadingInput,

    validateReading
  };

})(window, document);
