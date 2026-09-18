/**
 * experiment-physics.js
 * Modelele fizice pentru experimentele virtuale
 * Fizică – clasa a IX-a
 *
 * Prof. Dănuț Andronie
 * e-Mail: danutmg@gmail.com
 *
 * Dependență:
 * assets/js/experiment-tools.js
 */

(function (window) {
  "use strict";

  if (!window.ExperimentTools) {
    throw new Error(
      "experiment-physics.js necesită experiment-tools.js încărcat anterior."
    );
  }

  const Tools = window.ExperimentTools;

  /* =========================================================
     CONSTANTE FIZICE
     ========================================================= */

  const CONSTANTS = Object.freeze({
    g: 9.81,                 // m/s²
    rhoWater: 1000,          // kg/m³
    pi: Math.PI
  });

  /* =========================================================
     FUNCȚII AJUTĂTOARE
     ========================================================= */

  function requirePositive(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `${name} trebuie să fie un număr pozitiv.`
      );
    }

    return value;
  }

  function rangeValue(
    range,
    fallbackMin,
    fallbackMax,
    rng
  ) {
    const min =
      Array.isArray(range) &&
      Number.isFinite(range[0])
        ? range[0]
        : fallbackMin;

    const max =
      Array.isArray(range) &&
      Number.isFinite(range[1])
        ? range[1]
        : fallbackMax;

    return Tools.random.randomRange(
      min,
      max,
      rng
    );
  }

  function vary(
    value,
    relativeVariation,
    rng
  ) {
    if (!relativeVariation) {
      return value;
    }

    const factor =
      1 +
      Tools.random.randomRange(
        -relativeVariation,
        relativeVariation,
        rng
      );

    return value * factor;
  }

  /* =========================================================
     CALCULE GENERALE
     ========================================================= */

  const calculations = {

    /* ---------- CINEMATICĂ ---------- */

    averageSpeed(distance, time) {
      requirePositive(time, "Timpul");

      return distance / time;
    },

    period(totalTime, rotations) {
      requirePositive(
        rotations,
        "Numărul de rotații"
      );

      return totalTime / rotations;
    },

    frequencyFromPeriod(period) {
      requirePositive(period, "Perioada");

      return 1 / period;
    },

    angularVelocityFromPeriod(period) {
      requirePositive(period, "Perioada");

      return 2 * Math.PI / period;
    },

    angularVelocityFromFrequency(frequency) {
      return 2 * Math.PI * frequency;
    },

    linearSpeedAngular(
      angularVelocity,
      radius
    ) {
      return angularVelocity * radius;
    },

    centripetalAcceleration(
      speed,
      radius
    ) {
      requirePositive(radius, "Raza");

      return speed * speed / radius;
    },

    centripetalAccelerationAngular(
      angularVelocity,
      radius
    ) {
      return (
        angularVelocity *
        angularVelocity *
        radius
      );
    },

    /* ---------- DINAMICĂ ---------- */

    weight(mass, g = CONSTANTS.g) {
      return mass * g;
    },

    hookeForce(
      springConstant,
      elongation
    ) {
      return springConstant * elongation;
    },

    springElongation(
      force,
      springConstant
    ) {
      requirePositive(
        springConstant,
        "Constanta elastică"
      );

      return force / springConstant;
    },

    springConstant(
      force,
      elongation
    ) {
      requirePositive(
        elongation,
        "Alungirea"
      );

      return force / elongation;
    },

    normalForceHorizontal(
      mass,
      g = CONSTANTS.g
    ) {
      return mass * g;
    },

    frictionForce(
      coefficient,
      normalForce
    ) {
      return coefficient * normalForce;
    },

    frictionCoefficient(
      frictionForce,
      normalForce
    ) {
      requirePositive(
        normalForce,
        "Reacțiunea normală"
      );

      return frictionForce / normalForce;
    },

    /* ---------- ENERGIE ---------- */

    gravitationalPotentialEnergy(
      mass,
      height,
      g = CONSTANTS.g
    ) {
      return mass * g * height;
    },

    kineticEnergy(mass, speed) {
      return 0.5 * mass * speed * speed;
    },

    speedFromKineticEnergy(
      energy,
      mass
    ) {
      requirePositive(mass, "Masa");

      if (energy < 0) {
        throw new Error(
          "Energia nu poate fi negativă."
        );
      }

      return Math.sqrt(
        2 * energy / mass
      );
    },

    mechanicalEfficiency(
      usefulWork,
      inputWork
    ) {
      requirePositive(
        inputWork,
        "Lucrul mecanic consumat"
      );

      return usefulWork / inputWork;
    },

    relativeEnergyDifference(
      initialEnergy,
      finalEnergy
    ) {
      requirePositive(
        initialEnergy,
        "Energia inițială"
      );

      return (
        Math.abs(
          initialEnergy - finalEnergy
        ) / initialEnergy
      );
    },

    /* ---------- PLAN ÎNCLINAT ---------- */

    inclinedPlaneHeight(
      length,
      angleRadians
    ) {
      return (
        length *
        Math.sin(angleRadians)
      );
    },

    normalForceInclined(
      mass,
      angleRadians,
      g = CONSTANTS.g
    ) {
      return (
        mass *
        g *
        Math.cos(angleRadians)
      );
    },

    pullingForceUniform(
      mass,
      angleRadians,
      frictionCoefficient,
      g = CONSTANTS.g
    ) {
      const gravityComponent =
        mass *
        g *
        Math.sin(angleRadians);

      const normal =
        calculations.normalForceInclined(
          mass,
          angleRadians,
          g
        );

      const friction =
        frictionCoefficient *
        normal;

      return gravityComponent + friction;
    },

    /* ---------- FLUIDE ---------- */

    volumeFlow(volume, time) {
      requirePositive(time, "Timpul");

      return volume / time;
    },

    massFlow(mass, time) {
      requirePositive(time, "Timpul");

      return mass / time;
    },

    massFromVolume(
      volume,
      density = CONSTANTS.rhoWater
    ) {
      return density * volume;
    },

    volumeFromMass(
      mass,
      density = CONSTANTS.rhoWater
    ) {
      requirePositive(
        density,
        "Densitatea"
      );

      return mass / density;
    },

    massFlowFromVolumeFlow(
      volumeFlow,
      density = CONSTANTS.rhoWater
    ) {
      return density * volumeFlow;
    }
  };

  /* =========================================================
     EXP-01
     DETERMINAREA VITEZEI MEDII
     ========================================================= */

  function createLinearMotion(
    config = {},
    rng
  ) {
    const hidden =
      config.hiddenParameters || {};

    const speed =
      rangeValue(
        hidden.speedRange,
        0.35,
        1.20,
        rng
      );

    const speedVariation =
      Number.isFinite(
        hidden.speedVariation
      )
        ? hidden.speedVariation
        : 0.03;

    return {
      type: "linearMotion",

      hidden: {
        speed,
        speedVariation
      },

      /**
       * Viteza reală pentru o anumită încercare.
       */
      trialSpeed() {
        return vary(
          speed,
          speedVariation,
          rng
        );
      },

      /**
       * Timpul real necesar parcurgerii distanței.
       */
      travelTime(distance) {
        const trialSpeed =
          this.trialSpeed();

        return {
          speed: trialSpeed,
          time:
            distance / trialSpeed
        };
      },

      positionAt(time, trialSpeed = speed) {
        return trialSpeed * time;
      }
    };
  }

  /* =========================================================
     EXP-02
     MIȘCAREA CIRCULARĂ UNIFORMĂ
     ========================================================= */

  function createCircularMotion(
    config = {},
    rng
  ) {
    const hidden =
      config.hiddenParameters || {};

    const omega =
      rangeValue(
        hidden.angularVelocityRange,
        1.5,
        5.0,
        rng
      );

    const radius =
      rangeValue(
        hidden.radiusRange,
        0.08,
        0.18,
        rng
      );

    const period =
      2 * Math.PI / omega;

    const frequency =
      1 / period;

    return {
      type: "uniformCircularMotion",

      hidden: {
        angularVelocity: omega,
        radius,
        period,
        frequency
      },

      angleAt(time) {
        return (
          omega * time
        ) % (2 * Math.PI);
      },

      positionAt(time) {
        const angle =
          this.angleAt(time);

        return {
          x:
            radius *
            Math.cos(angle),

          y:
            radius *
            Math.sin(angle),

          angle
        };
      },

      timeForRotations(rotations) {
        return rotations * period;
      },

      linearSpeed() {
        return omega * radius;
      },

      centripetalAcceleration() {
        return (
          omega *
          omega *
          radius
        );
      }
    };
  }

  /* =========================================================
     EXP-03
     LEGEA LUI HOOKE
     ========================================================= */

  function createHookeLaw(
    config = {},
    rng
  ) {
    const hidden =
      config.hiddenParameters || {};

    const springConstant =
      rangeValue(
        hidden.springConstantRange,
        18,
        35,
        rng
      );

    const naturalLength =
      rangeValue(
        hidden.naturalLengthRange,
        0.08,
        0.14,
        rng
      );

    return {
      type: "hookeLaw",

      hidden: {
        springConstant,
        naturalLength
      },

      /**
       * Alungirea de echilibru pentru o masă.
       */
      elongationForMass(mass) {
        const force =
          mass * CONSTANTS.g;

        return (
          force /
          springConstant
        );
      },

      /**
       * Lungimea resortului după atașarea masei.
       */
      lengthForMass(mass) {
        return (
          naturalLength +
          this.elongationForMass(
            mass
          )
        );
      },

      forceForMass(mass) {
        return (
          mass *
          CONSTANTS.g
        );
      },

      /**
       * Poziție oscilantă înainte de stabilizare.
       * Poate fi folosită de animație.
       */
      animatedLength(
        mass,
        elapsedTime
      ) {
        const equilibrium =
          this.lengthForMass(mass);

        const amplitude =
          0.012 *
          Math.exp(
            -2.2 * elapsedTime
          );

        const oscillation =
          amplitude *
          Math.cos(
            11 * elapsedTime
          );

        return (
          equilibrium +
          oscillation
        );
      }
    };
  }

  /* =========================================================
     EXP-04
     FRECAREA LA ALUNECARE
     ========================================================= */

  const BASE_FRICTION = Object.freeze({
    "wood-wood": 0.32,
    "wood-plastic": 0.24,
    "wood-rubber": 0.62,
    "wood-textile": 0.43,

    "plastic-wood": 0.24,
    "rubber-wood": 0.62,
    "textile-wood": 0.43
  });

  function createSlidingFriction(
    config = {},
    rng
  ) {
    const hidden =
      config.hiddenParameters || {};

    const variation =
      Number.isFinite(
        hidden.frictionCoefficientVariation
      )
        ? hidden.frictionCoefficientVariation
        : 0.04;

    const mass =
      rangeValue(
        hidden.massRange,
        0.30,
        0.70,
        rng
      );

    function coefficientFor(
      materialA,
      materialB
    ) {
      const key =
        `${materialA}-${materialB}`;

      const reverseKey =
        `${materialB}-${materialA}`;

      const base =
        BASE_FRICTION[key] ??
        BASE_FRICTION[reverseKey] ??
        0.30;

      /*
       * Mică variație între telefoane /
       * seturi de date.
       */
      return Tools.numbers.clamp(
        base +
          Tools.random.randomRange(
            -variation,
            variation,
            rng
          ),
        0.05,
        0.95
      );
    }

    return {
      type: "slidingFriction",

      hidden: {
        mass
      },

      mass,

      normalForce() {
        return (
          mass *
          CONSTANTS.g
        );
      },

      coefficientFor,

      frictionForce(
        materialA,
        materialB
      ) {
        const mu =
          coefficientFor(
            materialA,
            materialB
          );

        return (
          mu *
          this.normalForce()
        );
      },

      /**
       * Forța indicată de dinamometru.
       *
       * acceleration = 0:
       * mișcare uniformă.
       */
      pullingForce(
        materialA,
        materialB,
        acceleration = 0
      ) {
        return (
          this.frictionForce(
            materialA,
            materialB
          ) +
          mass * acceleration
        );
      }
    };
  }

  /* =========================================================
     EXP-05
     ENERGIA MECANICĂ
     ========================================================= */

  function createEnergyInclinedPlane(
    config = {},
    rng
  ) {
    const hidden =
      config.hiddenParameters || {};

    const mass =
      rangeValue(
        hidden.massRange,
        0.15,
        0.40,
        rng
      );

    const lossFraction =
      rangeValue(
        hidden.frictionLossRange,
        0.01,
        0.08,
        rng
      );

    return {
      type: "energyInclinedPlane",

      hidden: {
        mass,
        lossFraction
      },

      mass,

      potentialEnergy(height) {
        return (
          mass *
          CONSTANTS.g *
          height
        );
      },

      availableKineticEnergy(
        height
      ) {
        return (
          this.potentialEnergy(
            height
          ) *
          (1 - lossFraction)
        );
      },

      finalSpeed(height) {
        const kineticEnergy =
          this.availableKineticEnergy(
            height
          );

        return Math.sqrt(
          2 *
          kineticEnergy /
          mass
        );
      },

      kineticEnergyAtBottom(
        height
      ) {
        const speed =
          this.finalSpeed(height);

        return (
          0.5 *
          mass *
          speed *
          speed
        );
      },

      energyLost(height) {
        return (
          this.potentialEnergy(
            height
          ) -
          this.kineticEnergyAtBottom(
            height
          )
        );
      },

      relativeLoss() {
        return lossFraction;
      }
    };
  }

  /* =========================================================
     EXP-06
     RANDAMENTUL PLANULUI ÎNCLINAT
     ========================================================= */

  function createInclinedPlaneEfficiency(
    config = {},
    rng
  ) {
    const hidden =
      config.hiddenParameters || {};

    const mass =
      rangeValue(
        hidden.massRange,
        0.25,
        0.70,
        rng
      );

    const angleDegrees =
      rangeValue(
        hidden.angleRangeDegrees,
        15,
        35,
        rng
      );

    const planeLength =
      rangeValue(
        hidden.planeLengthRange,
        0.60,
        1.20,
        rng
      );

    const frictionCoefficient =
      rangeValue(
        hidden.frictionCoefficientRange,
        0.10,
        0.28,
        rng
      );

    const angleRadians =
      angleDegrees *
      Math.PI /
      180;

    const height =
      planeLength *
      Math.sin(angleRadians);

    return {
      type:
        "inclinedPlaneEfficiency",

      hidden: {
        mass,
        angleDegrees,
        angleRadians,
        planeLength,
        height,
        frictionCoefficient
      },

      mass,
      angleDegrees,
      planeLength,
      height,

      normalForce() {
        return (
          mass *
          CONSTANTS.g *
          Math.cos(
            angleRadians
          )
        );
      },

      frictionForce() {
        return (
          frictionCoefficient *
          this.normalForce()
        );
      },

      /**
       * Forța necesară pentru urcare uniformă.
       */
      uniformPullingForce() {
        return (
          mass *
          CONSTANTS.g *
          Math.sin(angleRadians) +
          this.frictionForce()
        );
      },

      usefulWork() {
        return (
          mass *
          CONSTANTS.g *
          height
        );
      },

      inputWork() {
        return (
          this.uniformPullingForce() *
          planeLength
        );
      },

      efficiency() {
        return (
          this.usefulWork() /
          this.inputWork()
        );
      }
    };
  }

  /* =========================================================
     EXP-07
     DEBITUL UNUI FLUID
     ========================================================= */

  function createFluidFlow(
    config = {},
    rng
  ) {
    const hidden =
      config.hiddenParameters || {};

    /*
     * Configurația din JSON este în mL/s.
     */
    const flowMlPerSecond =
      rangeValue(
        hidden.volumeFlowRangeMlPerSecond,
        20,
        90,
        rng
      );

    const density =
      Number.isFinite(
        hidden.density
      )
        ? hidden.density
        : CONSTANTS.rhoWater;

    /*
     * Transformare:
     * 1 mL = 1e-6 m³
     */
    const nominalFlow =
      flowMlPerSecond *
      1e-6;

    const variation =
      Number.isFinite(
        hidden.flowVariation
      )
        ? hidden.flowVariation
        : 0.015;

    return {
      type: "fluidFlow",

      hidden: {
        flowMlPerSecond,
        nominalFlow,
        density,
        flowVariation: variation
      },

      /**
       * Debit instantaneu ușor variabil,
       * pentru comportament mai realist.
       */
      instantaneousFlow() {
        return vary(
          nominalFlow,
          variation,
          rng
        );
      },

      /**
       * Volumul colectat în intervalul dat.
       */
      collectedVolume(time) {
        requirePositive(
          time,
          "Timpul"
        );

        const flow =
          this.instantaneousFlow();

        return {
          flow,
          volume:
            flow * time
        };
      },

      massFromVolume(volume) {
        return (
          density *
          volume
        );
      },

      massCollected(time) {
        const result =
          this.collectedVolume(time);

        return {
          ...result,

          mass:
            density *
            result.volume
        };
      }
    };
  }

  /* =========================================================
     CREAREA AUTOMATĂ A SIMULĂRII
     ========================================================= */

  const factories = {
    linearMotion:
      createLinearMotion,

    uniformCircularMotion:
      createCircularMotion,

    hookeLaw:
      createHookeLaw,

    slidingFriction:
      createSlidingFriction,

    energyInclinedPlane:
      createEnergyInclinedPlane,

    inclinedPlaneEfficiency:
      createInclinedPlaneEfficiency,

    fluidFlow:
      createFluidFlow
  };

  /**
   * Creează modelul fizic după `simulation.type`
   * din experiments-clasa9.json.
   *
   * Exemplu:
   *
   * ExperimentPhysics.create(
   *   "EXP-03",
   *   experiment.simulation
   * );
   */
  function create(
    experimentId,
    simulationConfig = {}
  ) {
    if (!experimentId) {
      throw new Error(
        "Lipsește ID-ul experimentului."
      );
    }

    const type =
      simulationConfig.type;

    if (!type) {
      throw new Error(
        `Experimentul ${experimentId} nu are simulation.type.`
      );
    }

    const factory =
      factories[type];

    if (!factory) {
      throw new Error(
        `Tip de simulare necunoscut: ${type}`
      );
    }

    /*
     * Generatorul pseudo-aleator este persistent.
     * După refresh, elevul primește aceleași
     * proprietăți fizice ale experimentului.
     */
    const rng =
      Tools.random
        .createExperimentRandom(
          experimentId
        );

    const model =
      factory(
        simulationConfig,
        rng
      );

    return {
      experimentId,
      ...model
    };
  }

  /* =========================================================
     API PUBLIC
     ========================================================= */

  window.ExperimentPhysics = {
    version: "1.0.0",

    constants: CONSTANTS,

    calculations,

    create,

    models: {
      createLinearMotion,
      createCircularMotion,
      createHookeLaw,
      createSlidingFriction,
      createEnergyInclinedPlane,
      createInclinedPlaneEfficiency,
      createFluidFlow
    }
  };

})(window);
