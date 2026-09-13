/* ======================================================================
   FIZICA-LICEU - EVALUAREA FINALA

   Incarcare recomandata:
   <script src="../assets/js/evaluare.js" defer></script>

   Intrebarile generale sunt definite in configurare-generala.json.
   Intrebarile specifice se definesc in LAB_EXPERIMENT_CONFIG.evaluation.

   Eveniment emis la finalizare: laborator:evaluation-complete
   ====================================================================== */

(() => {
  "use strict";

  const SCRIPT_URL = document.currentScript?.src || document.baseURI;
  const DEFAULT_CONFIG_URL = new URL(
    "../data/configurare-generala.json",
    SCRIPT_URL
  ).href;

  const COMPONENT_SELECTOR =
    '[data-lab-component="evaluare-finala"]';

  const INITIALIZED_ATTRIBUTE =
    "data-evaluation-initialized";

  const state = {
    root: null,
    form: null,
    generalConfig: null,
    experimentConfig: null,
    answerKey: new Map(),
    explanations: new Map(),
    weights: new Map(),
    graded: false,
    result: null
  };

  const asArray = value =>
    Array.isArray(value) ? value : [];

  const select = (selector, root = state.root) =>
    root?.querySelector(selector) || null;

  const selectAll = (selector, root = state.root) =>
    [...(root?.querySelectorAll(selector) || [])];

  const normalize = value =>
    String(value ?? "").trim();

  function escapeSelector(value) {
    if (globalThis.CSS?.escape) {
      return globalThis.CSS.escape(String(value));
    }

    return String(value).replace(
      /[^a-zA-Z0-9_-]/g,
      character => `\\${character}`
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

      if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint32Array(1);
        globalThis.crypto.getRandomValues(bytes);
        random = bytes[0] / 4294967296;
      } else {
        random = Math.random();
      }

      const target = Math.floor(
        random * (index + 1)
      );

      [result[index], result[target]] =
        [result[target], result[index]];
    }

    return result;
  }

  async function loadGeneralConfig(url) {
    if (globalThis.LAB_GENERAL_CONFIG) {
      return globalThis.LAB_GENERAL_CONFIG;
    }

    const response = await fetch(url, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Configurația generală nu a putut fi încărcată (${response.status}).`
      );
    }

    const configuration = await response.json();

    globalThis.LAB_GENERAL_CONFIG =
      configuration;

    return configuration;
  }

  function getEvaluationConfig() {
    return {
      required: true,
      randomizeAnswerOrder: true,
      allowRetry: false,
      showCorrectAnswersAfterSubmission: true,
      score: {
        maximum: 10,
        passingPercent: 50,
        roundToDecimals: 2
      },
      feedbackThresholds: [],
      ...(state.generalConfig?.evaluation || {}),
      ...(state.experimentConfig?.evaluation || {})
    };
  }

  function setFeedback(message, type = "") {
    const feedback = select(
      "[data-evaluation-feedback]"
    );

    if (!feedback) {
      return;
    }

    feedback.textContent = message;

    feedback.classList.remove(
      "is-success",
      "is-warning",
      "is-error"
    );

    if (type) {
      feedback.classList.add(`is-${type}`);
    }
  }

  function buildAnswerKey() {
    state.answerKey.clear();
    state.explanations.clear();
    state.weights.clear();

    const generalAnswers =
      state.generalConfig?.evaluation
        ?.generalQuestionAnswers || {};

    for (
      const [questionId, answer]
      of Object.entries(generalAnswers)
    ) {
      state.answerKey.set(
        questionId,
        String(answer)
      );

      state.weights.set(questionId, 1);
    }

    const questions = asArray(
      state.experimentConfig
        ?.evaluation?.questions
    );

    for (const question of questions) {
      if (
        !question?.id ||
        question.correctAnswer === undefined
      ) {
        continue;
      }

      const questionId = String(question.id);

      state.answerKey.set(
        questionId,
        String(question.correctAnswer)
      );

      state.weights.set(
        questionId,
        Number(question.points) > 0
          ? Number(question.points)
          : 1
      );

      if (question.explanation) {
        state.explanations.set(
          questionId,
          String(question.explanation)
        );
      }
    }
  }

  function createChoice(question, option) {
    const questionId = String(question.id);

    const label =
      document.createElement("label");

    label.className = "lab-choice";

    const input =
      document.createElement("input");

    input.type = "radio";
    input.name = questionId;
    input.value = String(
      option.id ?? option.value ?? ""
    );
    input.required = true;

    const text =
      document.createElement("span");

    text.textContent = String(
      option.text ?? option.label ?? ""
    );

    label.append(input, text);

    return label;
  }

  function renderExperimentQuestions() {
    const container = select(
      "[data-experiment-questions]"
    );

    if (!container) {
      return;
    }

    container.replaceChildren();

    const configuration =
      getEvaluationConfig();

    const questions = asArray(
      state.experimentConfig
        ?.evaluation?.questions
    );

    for (
      const [index, question]
      of questions.entries()
    ) {
      if (
        !question?.id ||
        !question?.prompt ||
        !asArray(question.options).length
      ) {
        continue;
      }

      const questionId =
        String(question.id);

      const fieldset =
        document.createElement("fieldset");

      fieldset.className = "lab-question";
      fieldset.dataset.questionId =
        questionId;

      const legend =
        document.createElement("legend");

      legend.textContent =
        `${index + 4}. ${question.prompt}`;

      fieldset.append(legend);

      const options =
        configuration.randomizeAnswerOrder
          ? shuffle(question.options)
          : [...question.options];

      for (const option of options) {
        fieldset.append(
          createChoice(question, option)
        );
      }

      const feedback =
        document.createElement("p");

      feedback.className = "lab-feedback";
      feedback.dataset.feedbackFor =
        questionId;

      feedback.setAttribute(
        "aria-live",
        "polite"
      );

      fieldset.append(feedback);
      container.append(fieldset);
    }
  }

  function randomizeExistingChoices() {
    if (
      !getEvaluationConfig()
        .randomizeAnswerOrder
    ) {
      return;
    }

    for (
      const fieldset
      of selectAll("[data-question-id]")
    ) {
      const choices = selectAll(
        ":scope > .lab-choice",
        fieldset
      );

      const feedback = select(
        ":scope > .lab-feedback",
        fieldset
      );

      for (
        const choice of shuffle(choices)
      ) {
        fieldset.insertBefore(
          choice,
          feedback
        );
      }
    }
  }

  function getQuestionElements() {
    return selectAll("[data-question-id]");
  }

  function getQuestionId(fieldset) {
    return fieldset.dataset.questionId || "";
  }

  function getChosenValue(questionId) {
    return select(
      `input[name="${escapeSelector(
        questionId
      )}"]:checked`,
      state.form
    )?.value || "";
  }

  function getPrompt(fieldset) {
    return normalize(
      select("legend", fieldset)?.textContent
    ).replace(/^\d+\.\s*/, "");
  }

  function validateQuestions() {
    const missing = [];

    for (
      const fieldset
      of getQuestionElements()
    ) {
      const questionId =
        getQuestionId(fieldset);

      if (!getChosenValue(questionId)) {
        missing.push(questionId);
      }
    }

    return missing;
  }

  function validateWrittenWork() {
    const conclusion = select(
      "[data-student-conclusion]"
    );

    const notebook = select(
      "[data-notebook-confirmation]"
    );

    const individual = select(
      "[data-individual-work]"
    );

    const minimumLength = Number(
      state.generalConfig?.notebook
        ?.minimumConclusionLength ?? 30
    );

    const problems = [];

    conclusion?.setAttribute(
      "aria-invalid",
      String(
        normalize(conclusion.value).length <
        minimumLength
      )
    );

    notebook?.setAttribute(
      "aria-invalid",
      String(!notebook.checked)
    );

    individual?.setAttribute(
      "aria-invalid",
      String(!individual.checked)
    );

    if (
      !conclusion ||
      normalize(conclusion.value).length <
        minimumLength
    ) {
      problems.push(
        `Concluzia trebuie să conțină cel puțin ${minimumLength} de caractere.`
      );
    }

    if (!notebook?.checked) {
      problems.push(
        "Confirmă că ai înregistrat datele în caiet."
      );
    }

    if (!individual?.checked) {
      problems.push(
        "Confirmă realizarea individuală a activității."
      );
    }

    return problems;
  }

  function reviewEvaluation() {
    const missing = validateQuestions();
    const problems = validateWrittenWork();

    if (missing.length) {
      problems.unshift(
        `Mai ai ${missing.length} întrebări fără răspuns.`
      );
    }

    if (problems.length) {
      setFeedback(
        problems.join(" "),
        "error"
      );

      const firstInvalid = select(
        '[aria-invalid="true"], ' +
        ".lab-question input:invalid",
        state.form
      );

      firstInvalid?.focus();

      return false;
    }

    setFeedback(
      "Toate răspunsurile și confirmările sunt completate. Poți finaliza evaluarea.",
      "success"
    );

    return true;
  }

  function gradeQuestions() {
    const answers = [];

    let earnedPoints = 0;
    let maximumPoints = 0;
    let correctCount = 0;

    for (
      const fieldset
      of getQuestionElements()
    ) {
      const questionId =
        getQuestionId(fieldset);

      const expected =
        state.answerKey.get(questionId);

      const selectedValue =
        getChosenValue(questionId);

      const weight =
        state.weights.get(questionId) || 1;

      const correct =
        expected !== undefined &&
        selectedValue === expected;

      maximumPoints += weight;

      if (correct) {
        earnedPoints += weight;
        correctCount += 1;
      }

      answers.push({
        id: questionId,
        prompt: getPrompt(fieldset),
        selectedAnswer: selectedValue,
        correctAnswer: expected || "",
        correct,
        points: correct ? weight : 0,
        maximumPoints: weight
      });
    }

    return {
      answers,
      earnedPoints,
      maximumPoints,
      correctCount,
      totalCount: answers.length
    };
  }

  function markAnswers(grade) {
    const showCorrect =
      getEvaluationConfig()
        .showCorrectAnswersAfterSubmission;

    for (const answer of grade.answers) {
      const fieldset = select(
        `[data-question-id="${escapeSelector(
          answer.id
        )}"]`
      );

      if (!fieldset) {
        continue;
      }

      for (
        const input
        of selectAll("input", fieldset)
      ) {
        const choice =
          input.closest(".lab-choice");

        choice?.classList.remove(
          "is-correct",
          "is-wrong"
        );

        if (input.checked) {
          choice?.classList.add(
            answer.correct
              ? "is-correct"
              : "is-wrong"
          );
        }

        if (
          showCorrect &&
          input.value ===
            answer.correctAnswer
        ) {
          choice?.classList.add(
            "is-correct"
          );
        }
      }

      const feedback = select(
        `[data-feedback-for="${escapeSelector(
          answer.id
        )}"]`
      );

      if (feedback) {
        const explanation =
          state.explanations.get(
            answer.id
          );

        feedback.textContent =
          answer.correct
            ? "Răspuns corect."
            : explanation ||
              "Răspuns incorect. Recitește explicațiile experimentului.";

        feedback.classList.remove(
          "is-success",
          "is-error"
        );

        feedback.classList.add(
          answer.correct
            ? "is-success"
            : "is-error"
        );
      }
    }
  }

  function round(value, decimals) {
    const factor =
      10 ** Math.max(
        0,
        Number(decimals) || 0
      );

    return Math.round(
      (value + Number.EPSILON) * factor
    ) / factor;
  }

  function feedbackForPercent(percent) {
    const thresholds = [
      ...asArray(
        getEvaluationConfig()
          .feedbackThresholds
      )
    ].sort(
      (first, second) =>
        Number(second.minimumPercent) -
        Number(first.minimumPercent)
    );

    return thresholds.find(
      item =>
        percent >=
        Number(item.minimumPercent)
    )?.message ||
      "Evaluarea a fost finalizată.";
  }

  function collectErrorSources() {
    const selectedSources = selectAll(
      'input[name="errorSources"]:checked',
      state.form
    ).map(input => input.value);

    const other = normalize(
      select(
        '[name="otherErrorSource"]',
        state.form
      )?.value
    );

    if (other) {
      selectedSources.push(other);
    }

    return selectedSources;
  }

  function buildResult(grade) {
    const configuration =
      getEvaluationConfig();

    const percent =
      grade.maximumPoints > 0
        ? grade.earnedPoints /
          grade.maximumPoints * 100
        : 0;

    const maximumScore = Number(
      configuration.score?.maximum ?? 10
    );

    const decimals = Number(
      configuration.score
        ?.roundToDecimals ?? 2
    );

    const score = round(
      percent / 100 * maximumScore,
      decimals
    );

    const finishedAt = new Date();

    return {
      score,
      maximumScore,
      percent: round(percent, decimals),
      passed:
        percent >= Number(
          configuration.score
            ?.passingPercent ?? 50
        ),
      correctAnswers:
        grade.correctCount,
      totalQuestions:
        grade.totalCount,
      earnedPoints:
        grade.earnedPoints,
      maximumPoints:
        grade.maximumPoints,
      answers: grade.answers,
      conclusion: normalize(
        select(
          "[data-student-conclusion]"
        )?.value
      ),
      errorSources:
        collectErrorSources(),
      notebookConfirmed: Boolean(
        select(
          "[data-notebook-confirmation]"
        )?.checked
      ),
      individualWorkConfirmed: Boolean(
        select(
          "[data-individual-work]"
        )?.checked
      ),
      finishedAt:
        finishedAt.toISOString(),
      finishedAtDisplay:
        new Intl.DateTimeFormat(
          state.generalConfig
            ?.application?.locale ||
            "ro-RO",
          {
            dateStyle: "long",
            timeStyle: "medium"
          }
        ).format(finishedAt)
    };
  }

  function showResult(result) {
    const resultSection = select(
      "[data-evaluation-result]"
    );

    if (!resultSection) {
      return;
    }

    resultSection.hidden = false;

    const scoreElement = select(
      "[data-result-score]"
    );

    const correctElement = select(
      "[data-result-correct]"
    );

    const finishedElement = select(
      "[data-result-finished-at]"
    );

    const messageElement = select(
      "[data-result-message]"
    );

    const statusElement = select(
      "[data-submission-status]"
    );

    if (scoreElement) {
      scoreElement.textContent =
        `${result.score}/${result.maximumScore}`;
    }

    if (correctElement) {
      correctElement.textContent =
        `${result.correctAnswers}/${result.totalQuestions}`;
    }

    if (finishedElement) {
      finishedElement.textContent =
        result.finishedAtDisplay;
    }

    if (messageElement) {
      messageElement.textContent =
        feedbackForPercent(
          result.percent
        );
    }

    if (statusElement) {
      statusElement.textContent =
        "Evaluarea este pregătită pentru includerea în raportul final.";

      statusElement.classList.remove(
        "is-sending",
        "is-error"
      );
    }

    const printScore = select(
      "[data-print-score]"
    );

    const printFinished = select(
      "[data-print-finished-at]"
    );

    const studentName = select(
      "[data-print-student-name]"
    );

    const studentClass = select(
      "[data-print-student-class]"
    );

    const experimentTitle = select(
      "[data-print-experiment-title]"
    );

    if (printScore) {
      printScore.textContent =
        `${result.score}/${result.maximumScore}`;
    }

    if (printFinished) {
      printFinished.textContent =
        result.finishedAtDisplay;
    }

    if (studentName) {
      studentName.textContent =
        globalThis.LAB_SESSION
          ?.studentName || "—";
    }

    if (studentClass) {
      studentClass.textContent =
        globalThis.LAB_SESSION
          ?.studentClass || "—";
    }

    if (experimentTitle) {
      experimentTitle.textContent =
        state.experimentConfig?.title ||
        state.experimentConfig
          ?.experimentTitle ||
        "—";
    }

    resultSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function lockEvaluation() {
    if (
      getEvaluationConfig().allowRetry
    ) {
      return;
    }

    for (
      const control
      of selectAll(
        "input, textarea, select",
        state.form
      )
    ) {
      control.disabled = true;
    }

    const reviewButton = select(
      '[data-action="review-evaluation"]'
    );

    const submitButton = select(
      '[data-action="submit-evaluation"]'
    );

    if (reviewButton) {
      reviewButton.disabled = true;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }
  }

  function structuredCloneSafe(value) {
    if (
      typeof globalThis.structuredClone ===
      "function"
    ) {
      return globalThis.structuredClone(
        value
      );
    }

    return JSON.parse(
      JSON.stringify(value)
    );
  }

  function submitEvaluation(event) {
    event?.preventDefault();

    if (
      state.graded &&
      !getEvaluationConfig().allowRetry
    ) {
      return state.result;
    }

    if (!reviewEvaluation()) {
      return null;
    }

    const grade = gradeQuestions();

    markAnswers(grade);

    state.result =
      buildResult(grade);

    state.graded = true;

    showResult(state.result);
    lockEvaluation();

    setFeedback(
      "Evaluarea a fost finalizată și adăugată în raport.",
      "success"
    );

    state.root.dispatchEvent(
      new CustomEvent(
        "laborator:evaluation-complete",
        {
          bubbles: true,
          detail: structuredCloneSafe(
            state.result
          )
        }
      )
    );

    return state.result;
  }

  function retrySubmission() {
    state.root.dispatchEvent(
      new CustomEvent(
        "laborator:submission-retry",
        {
          bubbles: true,
          detail: state.result
            ? structuredCloneSafe(
                state.result
              )
            : null
        }
      )
    );
  }

  function addEventListeners() {
    select(
      '[data-action="review-evaluation"]'
    )?.addEventListener(
      "click",
      reviewEvaluation
    );

    select(
      '[data-action="print-report"]'
    )?.addEventListener(
      "click",
      () => globalThis.print()
    );

    select(
      '[data-action="retry-submission"]'
    )?.addEventListener(
      "click",
      retrySubmission
    );

    state.form.addEventListener(
      "submit",
      submitEvaluation
    );
  }

  async function init(
    root = document,
    experimentConfiguration =
      globalThis.LAB_EXPERIMENT_CONFIG || {}
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
      "[data-evaluation-form]"
    );

    state.experimentConfig =
      experimentConfiguration;

    try {
      if (!state.form) {
        throw new Error(
          "Formularul evaluării finale nu există în componentă."
        );
      }

      state.generalConfig =
        await loadGeneralConfig(
          DEFAULT_CONFIG_URL
        );

      renderExperimentQuestions();
      buildAnswerKey();
      randomizeExistingChoices();
      addEventListeners();

      component.setAttribute(
        INITIALIZED_ATTRIBUTE,
        "true"
      );

      component.dispatchEvent(
        new CustomEvent(
          "laborator:evaluation-ready",
          {
            bubbles: true
          }
        )
      );

      return true;
    } catch (error) {
      component.setAttribute(
        INITIALIZED_ATTRIBUTE,
        "error"
      );

      setFeedback(
        error.message ||
          "Evaluarea nu a putut fi inițializată.",
        "error"
      );

      console.error(
        "[LaboratorEvaluare]",
        error
      );

      return false;
    }
  }

  function getResult() {
    return state.result
      ? structuredCloneSafe(state.result)
      : null;
  }

  globalThis.LaboratorEvaluare =
    Object.freeze({
      init,
      review: reviewEvaluation,
      submit: submitEvaluation,
      getResult
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
          .LAB_EXPERIMENT_CONFIG || {}
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
