/**
 * experiment-tools.js
 * Utilitare comune pentru experimentele virtuale de fizică
 * Clasa a IX-a
 *
 * Prof. Dănuț Andronie
 * e-Mail: danutmg@gmail.com
 */

(function (window) {
  "use strict";

  const STORAGE_PREFIX = "fizica-liceu:experiment:";

  /**
   * Verifică dacă o valoare este un număr finit.
   */
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  /**
   * Limitează o valoare numerică într-un interval.
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Rotunjire la un anumit număr de zecimale.
   */
  function roundTo(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  /**
   * Rotunjire la rezoluția unui instrument.
   *
   * Exemplu:
   * quantize(2.347, 0.1) -> 2.3
   */
  function quantize(value, resolution) {
    if (!resolution || resolution <= 0) {
      return value;
    }

    return Math.round(value / resolution) * resolution;
  }

  /**
   * Transformă un răspuns introdus de elev într-un număr.
   *
   * Acceptă:
   * 2,35
   * 2.35
   * " 2,35 "
   */
  function parseNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== "string") {
      return null;
    }

    const normalized = value
      .trim()
      .replace(/\s+/g, "")
      .replace(",", ".");

    if (normalized === "") {
      return null;
    }

    const result = Number(normalized);

    return Number.isFinite(result) ? result : null;
  }

  /**
   * Afișează un număr utilizând separatorul zecimal românesc.
   */
  function formatNumber(value, decimals = 2) {
    if (!isFiniteNumber(value)) {
      return "";
    }

    return value.toLocaleString("ro-RO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Hash pentru transformarea unui text într-un seed numeric.
   */
  function hashString(text) {
    let hash = 2166136261;

    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  /**
   * Generator pseudo-aleator reproductibil Mulberry32.
   */
  function createSeededRandom(seed) {
    let state = seed >>> 0;

    return function () {
      state += 0x6D2B79F5;

      let t = state;

      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Creează un seed nou.
   */
  function generateSeed() {
    if (
      window.crypto &&
      typeof window.crypto.getRandomValues === "function"
    ) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0];
    }

    return Math.floor(
      Date.now() +
      Math.random() * 1000000000
    ) >>> 0;
  }

  /**
   * Returnează cheia localStorage pentru un experiment.
   */
  function storageKey(experimentId, suffix) {
    return `${STORAGE_PREFIX}${experimentId}:${suffix}`;
  }

  /**
   * Obține un seed persistent pentru experiment.
   *
   * Același elev / același telefon păstrează aceleași valori
   * după refresh.
   */
  function getPersistentSeed(experimentId) {
    const key = storageKey(experimentId, "seed");

    try {
      const existing = window.localStorage.getItem(key);

      if (existing !== null) {
        return Number(existing) >>> 0;
      }

      const seed = generateSeed();

      window.localStorage.setItem(key, String(seed));

      return seed;
    } catch (error) {
      return generateSeed();
    }
  }

  /**
   * Generează alt set de date pentru experiment.
   *
   * Utilizat la:
   * "Reia experimentul cu alte valori"
   */
  function resetExperimentSeed(experimentId) {
    const seed = generateSeed();

    try {
      window.localStorage.setItem(
        storageKey(experimentId, "seed"),
        String(seed)
      );
    } catch (error) {
      // localStorage poate fi indisponibil.
    }

    return seed;
  }

  /**
   * Creează generatorul aleator al experimentului.
   */
  function createExperimentRandom(experimentId) {
    const seed = getPersistentSeed(experimentId);

    /*
     * Introducem și ID-ul experimentului în seed pentru
     * ca EXP-01 și EXP-02 să nu producă aceeași succesiune.
     */
    const combinedSeed =
      seed ^ hashString(String(experimentId));

    return createSeededRandom(combinedSeed);
  }

  /**
   * Număr real aleator din intervalul [min, max).
   */
  function randomRange(min, max, rng = Math.random) {
    return min + rng() * (max - min);
  }

  /**
   * Număr întreg aleator inclusiv între min și max.
   */
  function randomInt(min, max, rng = Math.random) {
    return Math.floor(
      randomRange(min, max + 1, rng)
    );
  }

  /**
   * Distribuție aproximativ normală.
   *
   * Utilă pentru erorile aleatoare ale măsurărilor.
   */
  function randomNormal(
    mean = 0,
    standardDeviation = 1,
    rng = Math.random
  ) {
    let u1 = rng();
    let u2 = rng();

    /*
     * Evităm log(0).
     */
    if (u1 <= Number.EPSILON) {
      u1 = Number.EPSILON;
    }

    const z =
      Math.sqrt(-2 * Math.log(u1)) *
      Math.cos(2 * Math.PI * u2);

    return mean + z * standardDeviation;
  }

  /**
   * Adaugă eroare aleatoare unei valori.
   */
  function addNoise(
    value,
    standardDeviation,
    rng = Math.random
  ) {
    return randomNormal(
      value,
      standardDeviation,
      rng
    );
  }

  /**
   * Simulează citirea unui instrument.
   *
   * Exemplu:
   * const reading = simulateInstrumentReading({
   *   trueValue: 2.37,
   *   resolution: 0.1,
   *   randomError: 0.03,
   *   min: 0,
   *   max: 5,
   *   rng
   * });
   */
  function simulateInstrumentReading(options) {
    const {
      trueValue,
      resolution = 0,
      randomError = 0,
      systematicError = 0,
      min = -Infinity,
      max = Infinity,
      rng = Math.random
    } = options;

    let measured =
      trueValue +
      systematicError;

    if (randomError > 0) {
      measured = addNoise(
        measured,
        randomError,
        rng
      );
    }

    measured = clamp(measured, min, max);

    if (resolution > 0) {
      measured = quantize(
        measured,
        resolution
      );
    }

    return measured;
  }

  /**
   * Calculează media aritmetică.
   */
  function mean(values) {
    const valid = values.filter(isFiniteNumber);

    if (valid.length === 0) {
      return null;
    }

    return (
      valid.reduce(
        (sum, value) => sum + value,
        0
      ) / valid.length
    );
  }

  /**
   * Valoarea minimă.
   */
  function minValue(values) {
    const valid = values.filter(isFiniteNumber);

    return valid.length
      ? Math.min(...valid)
      : null;
  }

  /**
   * Valoarea maximă.
   */
  function maxValue(values) {
    const valid = values.filter(isFiniteNumber);

    return valid.length
      ? Math.max(...valid)
      : null;
  }

  /**
   * Abaterea standard de eșantion.
   */
  function standardDeviation(values) {
    const valid = values.filter(isFiniteNumber);

    if (valid.length < 2) {
      return 0;
    }

    const avg = mean(valid);

    const variance =
      valid.reduce(
        (sum, value) =>
          sum + Math.pow(value - avg, 2),
        0
      ) /
      (valid.length - 1);

    return Math.sqrt(variance);
  }

  /**
   * Incertitudine estimată prin semidispersie.
   *
   * Δx = (xmax - xmin) / 2
   */
  function halfRangeUncertainty(values) {
    const min = minValue(values);
    const max = maxValue(values);

    if (min === null || max === null) {
      return null;
    }

    return (max - min) / 2;
  }

  /**
   * Incertitudine relativă.
   *
   * Rezultatul este o fracție:
   * 0.05 = 5%
   */
  function relativeUncertainty(
    absoluteUncertainty,
    value
  ) {
    if (
      !isFiniteNumber(absoluteUncertainty) ||
      !isFiniteNumber(value) ||
      value === 0
    ) {
      return null;
    }

    return Math.abs(
      absoluteUncertainty / value
    );
  }

  /**
   * Transformă o incertitudine relativă în procente.
   */
  function percentUncertainty(
    absoluteUncertainty,
    value
  ) {
    const result =
      relativeUncertainty(
        absoluteUncertainty,
        value
      );

    return result === null
      ? null
      : result * 100;
  }

  /**
   * Pentru produse și rapoarte:
   *
   * Δz/z ≈ Δa/a + Δb/b + ...
   */
  function combineRelativeUncertainties(values) {
    return values
      .filter(isFiniteNumber)
      .reduce(
        (sum, value) =>
          sum + Math.abs(value),
        0
      );
  }

  /**
   * Diferența relativă dintre două valori.
   */
  function relativeDifference(a, b) {
    if (
      !isFiniteNumber(a) ||
      !isFiniteNumber(b)
    ) {
      return null;
    }

    const denominator =
      (Math.abs(a) + Math.abs(b)) / 2;

    if (denominator === 0) {
      return 0;
    }

    return (
      Math.abs(a - b) /
      denominator
    );
  }

  /**
   * Verifică răspunsul numeric al elevului.
   *
   * absoluteTolerance:
   * toleranță absolută
   *
   * relativeTolerance:
   * toleranță relativă, ex. 0.02 = 2%
   *
   * resolution:
   * rezoluția instrumentului
   */
  function checkMeasurement(options) {
    const {
      studentValue,
      expectedValue,
      absoluteTolerance = 0,
      relativeTolerance = 0,
      resolution = 0
    } = options;

    const student =
      parseNumber(studentValue);

    if (
      student === null ||
      !isFiniteNumber(expectedValue)
    ) {
      return {
        valid: false,
        accepted: false,
        reason: "invalid-number"
      };
    }

    const relativeAbsoluteTolerance =
      Math.abs(expectedValue) *
      relativeTolerance;

    /*
     * Pentru citirea unui instrument permitem cel puțin
     * jumătate din rezoluția scalei.
     */
    const instrumentTolerance =
      resolution > 0
        ? resolution / 2 + Number.EPSILON
        : 0;

    const tolerance = Math.max(
      absoluteTolerance,
      relativeAbsoluteTolerance,
      instrumentTolerance
    );

    const difference =
      Math.abs(
        student - expectedValue
      );

    return {
      valid: true,
      accepted:
        difference <= tolerance,
      studentValue: student,
      expectedValue,
      difference,
      tolerance
    };
  }

  /**
   * Verificarea unui calcul efectuat de elev.
   */
  function checkCalculation(options) {
    const {
      studentValue,
      expectedValue,
      relativeTolerance = 0.02,
      absoluteTolerance = 0
    } = options;

    return checkMeasurement({
      studentValue,
      expectedValue,
      relativeTolerance,
      absoluteTolerance,
      resolution: 0
    });
  }

  /**
   * Formatarea unui rezultat experimental.
   *
   * Exemplu:
   * 24,9 ± 1,1 N/m
   */
  function formatMeasurement(
    value,
    uncertainty,
    unit = "",
    decimals = 2
  ) {
    if (!isFiniteNumber(value)) {
      return "";
    }

    const formattedValue =
      formatNumber(value, decimals);

    if (!isFiniteNumber(uncertainty)) {
      return `${formattedValue} ${unit}`.trim();
    }

    const formattedUncertainty =
      formatNumber(
        uncertainty,
        decimals
      );

    return (
      `${formattedValue} ± ` +
      `${formattedUncertainty} ${unit}`
    ).trim();
  }

  /**
   * Conversii de unități uzuale.
   */
  const conversions = {
    mmToM(value) {
      return value / 1000;
    },

    cmToM(value) {
      return value / 100;
    },

    mToCm(value) {
      return value * 100;
    },

    mToMm(value) {
      return value * 1000;
    },

    gToKg(value) {
      return value / 1000;
    },

    kgToG(value) {
      return value * 1000;
    },

    mlToM3(value) {
      return value / 1000000;
    },

    literToM3(value) {
      return value / 1000;
    },

    m3ToLiter(value) {
      return value * 1000;
    },

    kmhToMs(value) {
      return value / 3.6;
    },

    msToKmh(value) {
      return value * 3.6;
    }
  };

  /**
   * Salvează progresul experimentului.
   */
  function saveState(
    experimentId,
    state
  ) {
    try {
      window.localStorage.setItem(
        storageKey(
          experimentId,
          "state"
        ),
        JSON.stringify(state)
      );

      return true;
    } catch (error) {
      console.warn(
        "Progresul experimentului nu a putut fi salvat.",
        error
      );

      return false;
    }
  }

  /**
   * Încarcă progresul experimentului.
   */
  function loadState(experimentId) {
    try {
      const raw =
        window.localStorage.getItem(
          storageKey(
            experimentId,
            "state"
          )
        );

      if (!raw) {
        return null;
      }

      return JSON.parse(raw);
    } catch (error) {
      console.warn(
        "Progresul experimentului nu a putut fi încărcat.",
        error
      );

      return null;
    }
  }

  /**
   * Șterge progresul, dar păstrează seed-ul.
   */
  function clearState(experimentId) {
    try {
      window.localStorage.removeItem(
        storageKey(
          experimentId,
          "state"
        )
      );

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Reia experimentul cu un set complet nou de valori.
   */
  function restartWithNewData(
    experimentId
  ) {
    clearState(experimentId);

    return resetExperimentSeed(
      experimentId
    );
  }

  /**
   * Merge recursiv pentru configurări.
   *
   * Folosit pentru:
   * simulationDefaults + experiment.simulation
   */
  function deepMerge(
    target = {},
    source = {}
  ) {
    const result = {
      ...target
    };

    Object.keys(source).forEach(
      (key) => {
        const sourceValue =
          source[key];

        const targetValue =
          result[key];

        if (
          sourceValue &&
          typeof sourceValue === "object" &&
          !Array.isArray(sourceValue)
        ) {
          result[key] =
            deepMerge(
              targetValue &&
                typeof targetValue === "object" &&
                !Array.isArray(targetValue)
                ? targetValue
                : {},
              sourceValue
            );
        } else if (
          Array.isArray(sourceValue)
        ) {
          result[key] =
            [...sourceValue];
        } else {
          result[key] =
            sourceValue;
        }
      }
    );

    return result;
  }

  /**
   * Calculează progresul elevului.
   */
  function calculateProgress(
    completedSteps,
    totalSteps
  ) {
    if (
      !Number.isFinite(totalSteps) ||
      totalSteps <= 0
    ) {
      return 0;
    }

    return clamp(
      (completedSteps / totalSteps) *
        100,
      0,
      100
    );
  }

  /**
   * API public.
   */
  window.ExperimentTools = {
    version: "1.0.0",

    numbers: {
      isFiniteNumber,
      clamp,
      roundTo,
      quantize,
      parseNumber,
      formatNumber
    },

    random: {
      hashString,
      createSeededRandom,
      generateSeed,
      getPersistentSeed,
      resetExperimentSeed,
      createExperimentRandom,
      randomRange,
      randomInt,
      randomNormal,
      addNoise
    },

    measurement: {
      simulateInstrumentReading,
      checkMeasurement,
      checkCalculation,
      mean,
      minValue,
      maxValue,
      standardDeviation,
      halfRangeUncertainty,
      relativeUncertainty,
      percentUncertainty,
      combineRelativeUncertainties,
      relativeDifference,
      formatMeasurement
    },

    conversions,

    storage: {
      saveState,
      loadState,
      clearState,
      restartWithNewData
    },

    config: {
      deepMerge
    },

    progress: {
      calculateProgress
    }
  };

})(window);
