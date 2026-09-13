/* ======================================================================
   FIZICA-LICEU - INSTRUCTAJUL DE SECURITATE

   Incarcare recomandata:
   <script src="../assets/js/securitate.js" defer></script>

   Surse:
   - componente/instructaj-securitate.html
   - data/reguli-securitate.json
   - data/configurare-generala.json

   API public: window.LaboratorSecuritate
   Eveniment emis la acceptare: laborator:safety-complete
   ====================================================================== */

(() => {
  "use strict";

  const SCRIPT_URL =
    document.currentScript?.src ||
    document.baseURI;

  const GENERAL_CONFIG_URL = new URL(
    "../data/configurare-generala.json",
    SCRIPT_URL
  ).href;

  const SAFETY_DATA_URL = new URL(
    "../data/reguli-securitate.json",
    SCRIPT_URL
  ).href;

  const COMPONENT_SELECTOR =
    '[data-lab-component="instructaj-securitate"]';

  const INITIALIZED_ATTRIBUTE =
    "data-safety-initialized";

  const state = {
    root: null,
    form: null,
    generalConfig: null,
    safetyData: null,
    experimentConfig: null,
    activeDomains: new Set(["general"]),
    answerKey: new Map(),
    quizVerified: false,
    accepted: false,
    result: null
  };

  const asArray = value =>
    Array.isArray(value) ? value : [];

  const select = (
    selector,
    root = state.root
  ) => root?.querySelector(selector) || null;

  const selectAll = (
    selector,
    root = state.root
  ) => [
    ...(root?.querySelectorAll(selector) || [])
  ];

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

  function shuffle(values) {
    const result = [...values];

    for (
      let index = result.length - 1;
      index > 0;
      index -= 1
    ) {
      let random;

      if (
        globalThis.crypto?.getRandomValues
      ) {
        const bytes =
          new Uint32Array(1);

        globalThis.crypto
          .getRandomValues(bytes);

        random =
          bytes[0] / 4294967296;
      } else {
        random = Math.random();
      }

      const target = Math.floor(
        random * (index + 1)
      );

      [
        result[index],
        result[target]
      ] = [
        result[target],
        result[index]
      ];
    }

    return result;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Datele de securitate nu au putut fi încărcate (${response.status}).`
      );
    }

    return response.json();
  }

  async function loadData() {
    const generalPromise =
      globalThis.LAB_GENERAL_CONFIG
        ? Promise.resolve(
            globalThis.LAB_GENERAL_CONFIG
          )
        : fetchJson(
            GENERAL_CONFIG_URL
          );

    const [
      general,
      safety
    ] = await Promise.all([
      generalPromise,
      fetchJson(SAFETY_DATA_URL)
    ]);

    globalThis.LAB_GENERAL_CONFIG =
      general;

    return {
      general,
      safety
    };
  }

  function validateSafetyData(data) {
    if (
      !Array.isArray(data?.domains) ||
      !Array.isArray(data?.rules)
    ) {
      throw new TypeError(
        "Structura fișierului reguli-securitate.json nu este validă."
      );
    }

    const domains = new Set(
      data.domains.map(
        domain => domain.id
      )
    );

    for (const rule of data.rules) {
      if (
        !rule.id ||
        !domains.has(rule.domain) ||
        !rule.text
      ) {
        throw new TypeError(
          "O regulă de securitate este incompletă sau folosește un domeniu inexistent."
        );
      }
    }

    return data;
  }

  function determineActiveDomains() {
    const configured = [
      ...asArray(
        state.experimentConfig?.risks
      ),

      ...asArray(
        state.experimentConfig
          ?.safetyDomains
      ),

      ...asArray(
        state.experimentConfig
          ?.safety?.domains
      )
    ];

    const available = new Set(
      state.safetyData.domains.map(
        domain => domain.id
      )
    );

    state.activeDomains = new Set([
      "general",

      ...configured.filter(
        domain => available.has(domain)
      )
    ]);
  }

  function phaseLabel(phase) {
    return {
      before:
        "Înainte de experiment",

      during:
        "În timpul experimentului",

      incident:
        "În cazul unui incident",

      after:
        "După terminarea experimentului"
    }[phase] || "Reguli aplicabile";
  }

  function createRuleElement(rule) {
    const item =
      document.createElement("li");

    item.className =
      "lab-safety-rule";

    item.dataset.ruleId = rule.id;
    item.dataset.domain = rule.domain;

    item.dataset.severity =
      rule.severity || "required";

    item.textContent = rule.text;

    return item;
  }

  function renderDomainSection(
    section,
    domain
  ) {
    const headingId =
      `safety-domain-${domain.id}-title`;

    const heading =
      document.createElement("h3");

    heading.id = headingId;
    heading.textContent = domain.label;

    section.setAttribute(
      "aria-labelledby",
      headingId
    );

    section.replaceChildren(heading);

    const phaseOrder = [
      "before",
      "during",
      "incident",
      "after"
    ];

    const rules =
      state.safetyData.rules.filter(
        rule =>
          rule.domain === domain.id
      );

    for (const phase of phaseOrder) {
      const phaseRules = rules.filter(
        rule =>
          rule.phase === phase
      );

      if (!phaseRules.length) {
        continue;
      }

      const subtitle =
        document.createElement("h4");

      subtitle.textContent =
        phaseLabel(phase);

      const list =
        document.createElement("ul");

      list.className =
        "lab-safety-list";

      for (
        const rule
        of phaseRules
      ) {
        list.append(
          createRuleElement(rule)
        );
      }

      section.append(
        subtitle,
        list
      );
    }
  }

  function renderRules() {
    const domainMap = new Map(
      state.safetyData.domains.map(
        domain => [
          domain.id,
          domain
        ]
      )
    );

    for (
      const section
      of selectAll(
        "[data-safety-domain]"
      )
    ) {
      const domainId =
        section.dataset.safetyDomain;

      const active =
        state.activeDomains.has(
          domainId
        );

      section.hidden = !active;

      if (
        active &&
        domainMap.has(domainId)
      ) {
        renderDomainSection(
          section,
          domainMap.get(domainId)
        );
      }
    }
  }

  function renderRiskCards() {
    const specificDomains = [
      ...state.activeDomains
    ].filter(
      domain => domain !== "general"
    );

    for (
      const card
      of selectAll("[data-risk-card]")
    ) {
      card.hidden =
        !state.activeDomains.has(
          card.dataset.riskCard
        );
    }

    const empty = select(
      "[data-no-specific-risks]"
    );

    if (empty) {
      empty.hidden =
        specificDomains.length > 0;
    }
  }

  function renderIncidentProcedure() {
    const heading = select(
      "#procedura-incident-titlu"
    );

    const section =
      heading?.closest("section");

    if (
      !section ||
      !state.safetyData
        .incidentProcedure
    ) {
      return;
    }

    const procedure =
      state.safetyData
        .incidentProcedure;

    const list =
      document.createElement("ol");

    list.className =
      "lab-safety-list";

    const steps = asArray(
      procedure.steps
    ).sort(
      (first, second) =>
        first.order - second.order
    );

    for (const step of steps) {
      const item =
        document.createElement("li");

      item.className =
        "lab-safety-rule";

      item.textContent = step.action;

      list.append(item);
    }

    const specific = asArray(
      procedure.specificCases
    ).filter(
      item =>
        state.activeDomains.has(
          item.domain
        )
    );

    const note =
      document.createElement("div");

    note.className = "lab-danger";

    note.textContent = specific
      .map(item => item.instruction)
      .join(" ");

    section.replaceChildren(
      heading,
      list
    );

    if (specific.length) {
      section.append(note);
    }
  }

  function renderFiveStepRule() {
    const heading = select(
      "#regula-cinci-pasi-titlu"
    );

    const section =
      heading?.closest("section");

    if (!section) {
      return;
    }

    const grid =
      document.createElement("div");

    grid.className =
      "lab-result-grid";

    const steps = asArray(
      state.safetyData.fiveStepRule
    ).sort(
      (first, second) =>
        first.order - second.order
    );

    for (const step of steps) {
      const card =
        document.createElement("div");

      card.className =
        "lab-result-item";

      const title =
        document.createElement("strong");

      title.textContent =
        `${step.order}. ${step.label}`;

      const instruction =
        document.createElement("span");

      instruction.textContent =
        step.instruction;

      card.append(
        title,
        instruction
      );

      grid.append(card);
    }

    section.replaceChildren(
      heading,
      grid
    );
  }

  function applicableQuestions() {
    const questions = asArray(
      state.sData
    );
  }

  function applicableQuestions() {
    return asArray(
      state.safetyData
        .knowledgeCheck?.questions
    ).filter(
      question =>
        asArray(
          question.domains
        ).some(
          domain =>
            state.activeDomains.has(
              domain
            )
        )
    );
  }

  function createChoice(
    question,
    option
  ) {
    const label =
      document.createElement("label");

    label.className =
      "lab-choice";

    const input =
      document.createElement("input");

    input.type = "radio";
    input.name = question.id;
    input.value = option.id;
    input.required = true;

    const text =
      document.createElement("span");

    text.textContent = option.text;

    label.append(
      input,
      text
    );

    return label;
  }

  function renderQuiz() {
    const firstQuestion = select(
      "[data-safety-question]"
    );

    const section =
      firstQuestion?.closest("section");

    if (!section) {
      return;
    }

    const heading =
      section.querySelector("h3");

    const actions =
      section.querySelector(
        ".lab-actions"
      );

    section.replaceChildren(heading);

    state.answerKey.clear();

    const randomize =
      state.safetyData
        .knowledgeCheck
        ?.randomizeAnswerOrder !== false;

    const questions =
      applicableQuestions();

    for (
      const [index, question]
      of questions.entries()
    ) {
      state.answerKey.set(
        question.id,
        {
          correctAnswer: String(
            question.correctAnswer
          ),

          explanation:
            question.explanation || ""
        }
      );

      const fieldset =
        document.createElement(
          "fieldset"
        );

      fieldset.className =
        "lab-question";

      fieldset.dataset.safetyQuestion =
        question.id;

      const legend =
        document.createElement("legend");

      legend.textContent =
        `${index + 1}. ${question.prompt}`;

      fieldset.append(legend);

      const options =
        randomize
          ? shuffle(question.options)
          : [...question.options];

      for (const option of options) {
        fieldset.append(
          createChoice(
            question,
            option
          )
        );
      }

      const feedback =
        document.createElement("p");

      feedback.className =
        "lab-feedback";

      feedback.dataset.safetyFeedback =
        question.id;

      feedback.setAttribute(
        "aria-live",
        "polite"
      );

      fieldset.append(feedback);
      section.append(fieldset);
    }

    if (actions) {
      section.append(actions);
    }
  }

  function selectedAnswer(
    questionId
  ) {
    const safeId =
      globalThis.CSS?.escape
        ? CSS.escape(questionId)
        : questionId;

    return select(
      `input[name="${safeId}"]:checked`,
      state.form
    )?.value || "";
  }

  function verifyQuiz() {
    let correct = 0;
    let missing = 0;

    const answers = [];

    for (
      const [
        questionId,
        answerData
      ] of state.answerKey
    ) {
      const selected =
        selectedAnswer(questionId);

      const isCorrect =
        selected ===
        answerData.correctAnswer;

      if (!selected) {
        missing += 1;
      }

      if (isCorrect) {
        correct += 1;
      }

      answers.push({
        id: questionId,
        selectedAnswer: selected,
        correctAnswer:
          answerData.correctAnswer,
        correct: isCorrect
      });

      const fieldset = select(
        `[data-safety-question="${questionId}"]`
      );

      for (
        const input
        of selectAll(
          "input",
          fieldset
        )
      ) {
        const choice =
          input.closest(
            ".lab-choice"
          );

        choice?.classList.remove(
          "is-correct",
          "is-wrong"
        );

        if (input.checked) {
          choice?.classList.add(
            isCorrect
              ? "is-correct"
              : "is-wrong"
          );
        }

        if (
          input.value ===
          answerData.correctAnswer
        ) {
          choice?.classList.add(
            "is-correct"
          );
        }
      }

      const feedback = select(
        `[data-safety-feedback="${questionId}"]`
      );

      if (feedback) {
        feedback.textContent =
          !selected
            ? "Selectează un răspuns."
            : isCorrect
              ? "Răspuns corect."
              : answerData.explanation;

        feedback.className =
          `lab-feedback ${
            isCorrect
              ? "is-success"
              : "is-error"
          }`;
      }
    }

    const total =
      state.answerKey.size;

    const percent = total
      ? Math.round(
          correct / total * 100
        )
      : 0;

    const requiredPercent = Number(
      state.safetyData
        .knowledgeCheck
        ?.minimumScorePercent ||
      100
    );

    state.quizVerified =
      missing === 0 &&
      percent >= requiredPercent;

    state.result = {
      answers,
      correctAnswers: correct,
      totalQuestions: total,
      scorePercent: percent
    };

    const feedback = select(
      "[data-safety-form-feedback]"
    );

    if (feedback) {
      feedback.textContent =
        state.quizVerified
          ? `Ai răspuns corect la toate cele ${total} întrebări.`
          : missing
            ? `Mai ai ${missing} întrebări fără răspuns.`
            : `Ai ${correct} din ${total} răspunsuri corecte. Corectează răspunsurile marcate.`;

      feedback.className =
        `lab-feedback ${
          state.quizVerified
            ? "is-success"
            : "is-error"
        }`;
    }

    return state.quizVerified;
  }

  function updateStudentName(
    session =
      globalThis.LAB_SESSION ||
      {}
  ) {
    const field = select(
      "[data-safety-student-name]"
    );

    if (field) {
      field.value =
        session.studentName ||
        "Se completează automat";
    }
  }

  function acceptedDateDisplay(date) {
    return new Intl.DateTimeFormat(
      state.generalConfig
        .application?.locale ||
      "ro-RO",
      {
        timeZone:
          state.generalConfig
            .application?.timeZone ||
          "Europe/Bucharest",

        dateStyle: "long",
        timeStyle: "medium"
      }
    ).format(date);
  }

  function acceptInstruction(event) {
    event.preventDefault();

    const commitment = select(
      "[data-safety-commitment]"
    );

    if (!state.quizVerified) {
      const valid = verifyQuiz();

      if (!valid) {
        return;
      }
    }

    if (!commitment?.checked) {
      commitment?.setAttribute(
        "aria-invalid",
        "true"
      );

      const error = select(
        "[data-safety-commitment-error]"
      );

      if (error) {
        error.textContent =
          "Bifează angajamentul înainte de a continua.";
      }

      commitment?.focus();

      return;
    }

    commitment.setAttribute(
      "aria-invalid",
      "false"
    );

    const error = select(
      "[data-safety-commitment-error]"
    );

    if (error) {
      error.textContent = "";
    }

    const now = new Date();

    const acceptedAtField = select(
      "[data-safety-accepted-at]"
    );

    if (acceptedAtField) {
      acceptedAtField.value =
        acceptedDateDisplay(now);
    }

    state.accepted = true;

    state.result = {
      ...state.result,
      accepted: true,
      acceptedAt:
        now.toISOString(),

      acceptedAtDisplay:
        acceptedDateDisplay(now),

      studentName:
        globalThis.LAB_SESSION
          ?.studentName ||
        "",

      studentClass:
        globalThis.LAB_SESSION
          ?.studentClass ||
        "",

      activeDomains: [
        ...state.activeDomains
      ],

      commitmentText:
        state.safetyData
          .commitment?.text ||
        ""
    };

    globalThis.LAB_SAFETY_STATE =
      clone(state.result);

    for (
      const control
      of selectAll(
        "input, button",
        state.form
      )
    ) {
      control.disabled = true;
    }

    const feedback = select(
      "[data-safety-form-feedback]"
    );

    if (feedback) {
      feedback.textContent =
        "Instructajul a fost acceptat. Poți continua cu selectarea echipamentelor.";

      feedback.className =
        "lab-feedback is-success";
    }

    document.dispatchEvent(
      new CustomEvent(
        "laborator:safety-complete",
        {
          detail:
            clone(state.result)
        }
      )
    );
  }

  function addEventListeners() {
    select(
      '[data-action="verify-safety-quiz"]'
    )?.addEventListener(
      "click",
      verifyQuiz
    );

    select(
      "[data-safety-commitment]"
    )?.addEventListener(
      "change",
      event => {
        event.target.setAttribute(
          "aria-invalid",
          String(
            !event.target.checked
          )
        );

        if (event.target.checked) {
          const error = select(
            "[data-safety-commitment-error]"
          );

          if (error) {
            error.textContent = "";
          }
        }
      }
    );

    state.form.addEventListener(
      "submit",
      acceptInstruction
    );

    document.addEventListener(
      "laborator:identification-complete",
      event =>
        updateStudentName(
          event.detail
        )
    );
  }

  function getState() {
    return state.result
      ? clone(state.result)
      : {
          accepted: false,

          activeDomains: [
            ...state.activeDomains
          ],

          quizVerified:
            state.quizVerified
        };
  }

  async function init(
    root = document,
    experimentConfiguration =
      globalThis.LAB_EXPERIMENT_CONFIG ||
      {}
  ) {
    const component =
      root.matches?.(COMPONENT_SELECTOR)
        ? root
        : root.querySelector?.(
            COMPONENT_SELECTOR
          );

    if (
      !component ||
      component.hasAttribute(
        INITIALIZED_ATTRIBUTE
      )
    ) {
      return null;
    }

    component.setAttribute(
      INITIALIZED_ATTRIBUTE,
      "loading"
    );

    state.root = component;

    state.form = select(
      "[data-safety-form]"
    );

    state.experimentConfig =
      experimentConfiguration;

    try {
      if (!state.form) {
        throw new Error(
          "Formularul instructajului nu există în componentă."
        );
      }

      const {
        general,
        safety
      } = await loadData();

      state.generalConfig = general;

      state.safetyData =
        validateSafetyData(safety);

      determineActiveDomains();
      renderRiskCards();
      renderRules();
      renderIncidentProcedure();
      renderFiveStepRule();
      renderQuiz();
      updateStudentName();
      addEventListeners();

      component.setAttribute(
        INITIALIZED_ATTRIBUTE,
        "true"
      );

      document.dispatchEvent(
        new CustomEvent(
          "laborator:safety-ready",
          {
            detail: {
              activeDomains: [
                ...state.activeDomains
              ]
            }
          }
        )
      );

      return getState();
    } catch (error) {
      component.setAttribute(
        INITIALIZED_ATTRIBUTE,
        "error"
      );

      const feedback = select(
        "[data-safety-form-feedback]"
      );

      if (feedback) {
        feedback.textContent =
          error.message ||
          "Instructajul nu a putut fi încărcat.";

        feedback.className =
          "lab-feedback is-error";
      }

      console.error(
        "[LaboratorSecuritate]",
        error
      );

      return null;
    }
  }

  globalThis.LaboratorSecuritate =
    Object.freeze({
      init,
      verifyQuiz,
      getState
    });

  function autoInit() {
    const component =
      document.querySelector(
        COMPONENT_SELECTOR
      );

    if (
      component &&
      !component.hasAttribute(
        INITIALIZED_ATTRIBUTE
      )
    ) {
      init(
        document,
        globalThis
          .LAB_EXPERIMENT_CONFIG ||
        {}
      );
    }
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      autoInit,
      {
        once: true
      }
    );
  } else {
    autoInit();
  }

  document.addEventListener(
    "laborator:components-loaded",
    autoInit
  );

  document.addEventListener(
    "laborator:component-loaded",
    autoInit
  );
})();
