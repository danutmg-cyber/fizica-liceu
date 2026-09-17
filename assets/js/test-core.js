/* =========================================================
   MOTOR COMUN PENTRU TESTELE DE FIZICĂ
   assets/js/test-core.js

   Se ocupă de:
   - inițializarea testului;
   - generarea variantei;
   - selecția echilibrată a întrebărilor;
   - amestecarea întrebărilor și variantelor;
   - afișarea întrebărilor;
   - verificarea răspunsurilor;
   - progresul testului;
   - calculul notei;
   - raportul final din pagină;
   - jurnalul anti-copiere;
   - pregătirea payload-ului.

   NU se ocupă de:
   - Google Sheets -> sheets.js
   - generarea PDF -> pdf-report.js

   Configurarea fiecărui test se face prin:

   window.PHYSICS_TEST_CONFIG = {
     testId: "...",
     testTitle: "...",
     variantPrefix: "...",
     questionCount: 20,
     officialPoints: 1,
     testPoints: 9,
     questionBank: questionBank,
     questionDistribution: QUESTION_DISTRIBUTION
   };
   ========================================================= */

(function () {
  "use strict";


  /* =========================================================
     STAREA INTERNĂ A TESTULUI
     ========================================================= */

  const state = {
    currentQuestions: [],
    currentQuestionIndex: 0,
    variantId: "",
    submitted: false,

    integrityAlertOpen: false,

    integrityLog: {
      exitCount: 0,
      awayStart: null,
      awayItem: null,
      awayQuestion: "",
      totalAwaySeconds: 0,
      events: []
    }
  };


  const DEFAULT_INTEGRITY_WARNING =
    "Atenție! Ai părăsit ecranul testului. " +
    "Profesorul va vedea acest eveniment în raportul testului.";


  /* =========================================================
     UTILITARE DOM
     ========================================================= */

  function byId(id) {
    return document.getElementById(id);
  }


  function showElement(id) {
    const element = byId(id);

    if (element) {
      element.classList.remove("hidden");
    }
  }


  function hideElement(id) {
    const element = byId(id);

    if (element) {
      element.classList.add("hidden");
    }
  }


  /* =========================================================
     CONFIGURAREA TESTULUI
     ========================================================= */

  function getConfig() {
    const custom =
      window.PHYSICS_TEST_CONFIG || {};


    /* BANCA DE ÎNTREBĂRI */

    let bank =
      Array.isArray(custom.questionBank)
        ? custom.questionBank
        : [];


    /*
      Compatibilitate temporară cu testele vechi
      care folosesc:

      const questionBank = [...]
    */

    if (!bank.length) {
      try {
        if (
          typeof questionBank !== "undefined" &&
          Array.isArray(questionBank)
        ) {
          bank = questionBank;
        }
      } catch (error) {
        bank = [];
      }
    }


    /* DISTRIBUȚIA PE CATEGORII */

    let distribution =
      Array.isArray(custom.questionDistribution)
        ? custom.questionDistribution
        : [];


    if (!distribution.length) {
      try {
        if (
          typeof QUESTION_DISTRIBUTION !== "undefined" &&
          Array.isArray(QUESTION_DISTRIBUTION)
        ) {
          distribution =
            QUESTION_DISTRIBUTION;
        }
      } catch (error) {
        distribution = [];
      }
    }


    /* NUMĂR ÎNTREBĂRI */

    let questionCount =
      Number(custom.questionCount);


    if (
      !Number.isInteger(questionCount) ||
      questionCount <= 0
    ) {
      try {
        if (
          typeof QUESTION_COUNT !== "undefined" &&
          Number.isInteger(Number(QUESTION_COUNT))
        ) {
          questionCount =
            Number(QUESTION_COUNT);
        } else {
          questionCount = 20;
        }
      } catch (error) {
        questionCount = 20;
      }
    }


    /* PUNCT DIN OFICIU */

    let officialPoints =
      Number(custom.officialPoints);


    if (!Number.isFinite(officialPoints)) {
      try {
        if (
          typeof OFFICIAL_POINTS !== "undefined" &&
          Number.isFinite(Number(OFFICIAL_POINTS))
        ) {
          officialPoints =
            Number(OFFICIAL_POINTS);
        } else {
          officialPoints = 1;
        }
      } catch (error) {
        officialPoints = 1;
      }
    }


    /* PUNCTAJ TEST */

    let testPoints =
      Number(custom.testPoints);


    if (!Number.isFinite(testPoints)) {
      try {
        if (
          typeof TEST_POINTS !== "undefined" &&
          Number.isFinite(Number(TEST_POINTS))
        ) {
          testPoints =
            Number(TEST_POINTS);
        } else {
          testPoints = 9;
        }
      } catch (error) {
        testPoints = 9;
      }
    }


    /* TITLU TEST */

    let testTitle =
      String(
        custom.testTitle ||
        custom.test ||
        ""
      ).trim();


    if (!testTitle) {
      testTitle =
        document.title
          .replace(/^Test online\s*[–-]\s*/i, "")
          .trim();
    }


    if (!testTitle) {
      testTitle = "Test de fizică";
    }


    /* IDENTIFICATOR TEST */

    const testId =
      String(
        custom.testId ||
        testTitle
      ).trim();


    /* PREFIX VARIANTĂ */

    let variantPrefix =
      String(
        custom.variantPrefix ||
        "FIZ"
      )
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");


    if (!variantPrefix) {
      variantPrefix = "FIZ";
    }


    /* MESAJ ANTI-COPIERE */

    const integrityWarningMessage =
      String(
        custom.integrityWarningMessage ||
        DEFAULT_INTEGRITY_WARNING
      );


    return {
      testId,
      testTitle,
      variantPrefix,

      questionCount,

      officialPoints,
      testPoints,

      questionBank: bank,
      questionDistribution: distribution,

      integrityWarningMessage
    };
  }


  /* =========================================================
     FUNCȚII GENERALE
     ========================================================= */

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function stripHtml(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }


  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ă/g, "a")
      .replace(/â/g, "a")
      .replace(/î/g, "i")
      .replace(/ș/g, "s")
      .replace(/ş/g, "s")
      .replace(/ț/g, "t")
      .replace(/ţ/g, "t")
      .replace(/\s+/g, " ");
  }


  function parseNumeric(value) {
    const cleaned =
      String(value ?? "")
        .trim()
        .replace(/\s+/g, "")
        .replace(",", ".")
        .replace(/[^0-9.\-]/g, "");


    if (
      cleaned === "" ||
      cleaned === "-" ||
      cleaned === "."
    ) {
      return null;
    }


    const number =
      parseFloat(cleaned);


    return Number.isFinite(number)
      ? number
      : null;
  }


  /* =========================================================
     NUMERE ALEATOARE
     ========================================================= */

  function getRandomInt(max) {
    if (
      window.crypto &&
      window.crypto.getRandomValues
    ) {
      const array =
        new Uint32Array(1);

      window.crypto.getRandomValues(
        array
      );

      return array[0] % max;
    }


    return Math.floor(
      Math.random() * max
    );
  }


  function shuffle(array) {
    const copy =
      [...array];


    for (
      let i = copy.length - 1;
      i > 0;
      i--
    ) {
      const j =
        getRandomInt(i + 1);

      [
        copy[i],
        copy[j]
      ] = [
        copy[j],
        copy[i]
      ];
    }


    return copy;
  }


  /* =========================================================
     IDENTIFICATOR VARIANTĂ
     ========================================================= */

  function generateVariantId() {
    const config =
      getConfig();

    const now =
      new Date();


    const randomPart =
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();


    const datePart =
      now.getFullYear() +
      String(
        now.getMonth() + 1
      ).padStart(2, "0") +
      String(
        now.getDate()
      ).padStart(2, "0");


    const timePart =
      String(
        now.getHours()
      ).padStart(2, "0") +
      String(
        now.getMinutes()
      ).padStart(2, "0");


    return (
      `${config.variantPrefix}-` +
      `${datePart}-` +
      `${timePart}-` +
      `${randomPart}`
    );
  }


  /* =========================================================
     SELECȚIA ÎNTREBĂRILOR
     ========================================================= */

  function selectBalancedQuestions() {
    const config =
      getConfig();

    const bank =
      config.questionBank;


    if (!bank.length) {
      return [];
    }


    const targetCount =
      Math.min(
        config.questionCount,
        bank.length
      );


    let selected = [];

    const usedSubtypes =
      new Set();


    function subtypeKey(question) {
      return (
        question.subtype ||
        question.prompt
      );
    }


    /*
      Dacă testul are distribuție pe categorii,
      o respectăm.
    */

    if (
      config.questionDistribution.length
    ) {

      config.questionDistribution
        .forEach(rule => {

          const pool =
            shuffle(
              bank.filter(
                question =>
                  question.category ===
                  rule.category
              )
            );


          let count = 0;


          /*
            PASUL 1

            Alegem cu prioritate subtype-uri
            care nu au mai fost folosite.
          */

          for (const question of pool) {

            if (
              count >=
              Number(rule.count)
            ) {
              break;
            }


            const key =
              subtypeKey(question);


            if (
              usedSubtypes.has(key)
            ) {
              continue;
            }


            selected.push(
              question
            );

            usedSubtypes.add(
              key
            );

            count++;
          }


          /*
            PASUL 2

            Dacă nu sunt suficiente subtype-uri
            distincte, completăm categoria.
          */

          if (
            count <
            Number(rule.count)
          ) {

            for (const question of pool) {

              if (
                count >=
                Number(rule.count)
              ) {
                break;
              }


              if (
                selected.includes(
                  question
                )
              ) {
                continue;
              }


              selected.push(
                question
              );

              count++;
            }
          }

        });
    }


    /*
      Dacă distribuția nu a furnizat suficiente
      întrebări, completăm din întreaga bancă.
    */

    if (
      selected.length <
      targetCount
    ) {

      const remaining =
        shuffle(
          bank.filter(
            question =>
              !selected.includes(
                question
              )
          )
        );


      selected.push(
        ...remaining.slice(
          0,
          targetCount -
          selected.length
        )
      );
    }


    /*
      Amestecarea finală a întrebărilor.
    */

    return shuffle(selected)
      .slice(0, targetCount)
      .map(
        (question, index) => ({

          ...question,

          id: `q${index + 1}`,

          answer:
            Array.isArray(
              question.answer
            )
              ? [...question.answer]
              : [question.answer],

          options:
            Array.isArray(
              question.options
            )
              ? shuffle(
                  question.options
                )
              : undefined,

          studentAnswer: "",

          checked: false,

          correct: false

        })
      );
  }


  /* =========================================================
     JURNAL ANTI-COPIERE
     ========================================================= */

  function resetIntegrityLog() {
    state.integrityLog = {
      exitCount: 0,
      awayStart: null,
      awayItem: null,
      awayQuestion: "",
      totalAwaySeconds: 0,
      events: []
    };


    state.integrityAlertOpen =
      false;
  }


  function isTestActive() {
    const testArea =
      byId("testArea");


    return Boolean(
      testArea &&
      !testArea.classList.contains(
        "hidden"
      ) &&
      state.currentQuestions.length > 0 &&
      !state.submitted
    );
  }


  function getCurrentIntegrityItem() {
    return (
      state.currentQuestionIndex + 1
    );
  }


  function getCurrentIntegrityQuestion() {
    const question =
      state.currentQuestions[
        state.currentQuestionIndex
      ];


    return question
      ? stripHtml(question.prompt)
      : "";
  }


  function formatDuration(seconds) {
    const total =
      Math.max(
        0,
        Math.round(
          Number(seconds) || 0
        )
      );


    const minutes =
      Math.floor(total / 60);

    const remainingSeconds =
      total % 60;


    if (minutes === 0) {
      return (
        `${remainingSeconds} secunde`
      );
    }


    if (remainingSeconds === 0) {
      return (
        `${minutes} minut` +
        `${minutes === 1 ? "" : "e"}`
      );
    }


    return (
      `${minutes} minut` +
      `${minutes === 1 ? "" : "e"} ` +
      `și ${remainingSeconds} secunde`
    );
  }


  function getIntegrityExitEvents() {
    return state.integrityLog.events
      .filter(
        event =>
          event.tip ===
          "iesire_din_ecran"
      );
  }


  function getIntegrityReturnEvents() {
    return state.integrityLog.events
      .filter(
        event =>
          event.tip ===
          "revenire_in_test"
      );
  }


  function getIntegrityItemsSummary() {
    const items =
      getIntegrityExitEvents()
        .map(
          event => event.item
        )
        .filter(
          item =>
            item !== undefined &&
            item !== null &&
            item !== ""
        );


    const uniqueItems =
      [...new Set(items)];


    if (!uniqueItems.length) {
      return (
        "Nu s-au înregistrat " +
        "părăsiri ale ecranului."
      );
    }


    return uniqueItems
      .map(
        item => `Item ${item}`
      )
      .join(", ");
  }


  function handleScreenExit() {
    if (
      !isTestActive() ||
      state.integrityAlertOpen ||
      state.integrityLog.awayStart
    ) {
      return;
    }


    state.integrityLog.awayStart =
      Date.now();

    state.integrityLog.awayItem =
      getCurrentIntegrityItem();

    state.integrityLog.awayQuestion =
      getCurrentIntegrityQuestion();

    state.integrityLog.exitCount++;


    state.integrityLog.events.push({
      tip: "iesire_din_ecran",

      item:
        state.integrityLog.awayItem,

      intrebare:
        state.integrityLog
          .awayQuestion,

      ora:
        new Date()
          .toLocaleString("ro-RO")
    });
  }


  function handleScreenReturn() {
    if (
      !isTestActive() ||
      !state.integrityLog.awayStart
    ) {
      return;
    }


    const durationSeconds =
      Math.max(
        1,
        Math.round(
          (
            Date.now() -
            state.integrityLog.awayStart
          ) / 1000
        )
      );


    state.integrityLog
      .totalAwaySeconds +=
      durationSeconds;


    state.integrityLog.events.push({
      tip: "revenire_in_test",

      item:
        state.integrityLog.awayItem,

      intrebare:
        state.integrityLog
          .awayQuestion,

      durataSecunde:
        durationSeconds,

      oraPlecare:
        new Date(
          state.integrityLog.awayStart
        ).toLocaleString(
          "ro-RO"
        ),

      oraRevenire:
        new Date()
          .toLocaleString(
            "ro-RO"
          )
    });


    state.integrityLog.awayStart =
      null;

    state.integrityLog.awayItem =
      null;

    state.integrityLog.awayQuestion =
      "";


    state.integrityAlertOpen =
      true;


    alert(
      getConfig()
        .integrityWarningMessage
    );


    setTimeout(() => {
      state.integrityAlertOpen =
        false;
    }, 500);
  }


  /* =========================================================
     EVENIMENTE ANTI-COPIERE
     ========================================================= */

  document.addEventListener(
    "visibilitychange",
    function () {

      if (document.hidden) {
        handleScreenExit();
      } else {
        handleScreenReturn();
      }

    }
  );


  document.addEventListener(
    "contextmenu",
    function (event) {

      if (!isTestActive()) {
        return;
      }


      event.preventDefault();


      alert(
        "Click dreapta nu este permis " +
        "în timpul testului."
      );

    }
  );


  document.addEventListener(
    "copy",
    function (event) {

      if (!isTestActive()) {
        return;
      }


      event.preventDefault();


      alert(
        "Copierea nu este permisă " +
        "în timpul testului."
      );

    }
  );


  document.addEventListener(
    "cut",
    function (event) {

      if (!isTestActive()) {
        return;
      }


      event.preventDefault();


      alert(
        "Decuparea textului nu este " +
        "permisă în timpul testului."
      );

    }
  );


  document.addEventListener(
    "paste",
    function (event) {

      if (!isTestActive()) {
        return;
      }


      event.preventDefault();


      alert(
        "Lipirea textului nu este permisă " +
        "în timpul testului."
      );

    }
  );


  /* =========================================================
     MESAJ VERIFICARE ÎNCERCARE ANTERIOARĂ
     ========================================================= */

  function setStartMessage(
    text,
    isError
  ) {

    /*
      Dacă sheets.js este încărcat,
      folosim funcția lui.
    */

    if (
      typeof window
        .setStartCheckMessage ===
      "function"
    ) {

      window.setStartCheckMessage(
        text,
        isError
      );

      return;
    }


    /*
      Fallback local.
    */

    const element =
      byId("startCheckMessage");


    if (!element) {
      return;
    }


    if (!text) {

      element.classList.add(
        "hidden"
      );

      element.innerText = "";

      return;
    }


    element.classList.remove(
      "hidden"
    );


    element.style.color =
      isError
        ? "var(--red, #c0392b)"
        : "var(--muted, #667085)";


    element.innerText =
      text;
  }


  /* =========================================================
     PORNIRE TEST
     ========================================================= */

  async function startTest() {
    const config =
      getConfig();


    const nameInput =
      byId("studentName");

    const classInput =
      byId("studentClass");


    const name =
      nameInput
        ? nameInput.value.trim()
        : "";


    const studentClass =
      classInput
        ? classInput.value.trim()
        : "";


    if (
      !name ||
      !studentClass
    ) {

      alert(
        "Completează numele, prenumele " +
        "și clasa înainte de a începe testul."
      );

      return;
    }


    if (
      !config.questionBank.length
    ) {

      alert(
        "Banca de întrebări nu este configurată."
      );

      return;
    }


    const startButton =
      byId("startTestBtn");


    if (startButton) {

      startButton.disabled =
        true;

      startButton.innerText =
        "Se verifică...";
    }


    setStartMessage(
      "Se verifică dacă ai mai " +
      "susținut acest test...",
      false
    );


    /*
      Verificare Google Sheets.
    */

    let priorAttempt = {
      found: false,
      checked: false
    };


    if (
      typeof window
        .checkPriorAttempt ===
      "function"
    ) {

      try {

        priorAttempt =
          await window
            .checkPriorAttempt(
              name,
              studentClass,
              config.testId
            );

      } catch (error) {

        console.error(
          "Eroare verificare încercare:",
          error
        );

      }
    }


    /*
      Elevul are deja un rezultat.
    */

    if (priorAttempt.found) {

      if (startButton) {

        startButton.disabled =
          false;

        startButton.innerText =
          "Începe testul";
      }


      const gradeText =
        priorAttempt.nota !==
          undefined &&
        priorAttempt.nota !== null
          ? ` (nota ${priorAttempt.nota})`
          : "";


      setStartMessage(
        `Ai susținut deja acest test${gradeText}. ` +
        "Testul se dă o singură dată. " +
        "Dacă ai un motiv întemeiat pentru o nouă " +
        "încercare, vorbește cu profesorul.",
        true
      );


      return;
    }


    /*
      Verificarea nu a putut fi făcută.
      Testul continuă, exact ca în versiunea existentă.
    */

    if (!priorAttempt.checked) {

      setStartMessage(
        "Nu s-a putut verifica automat dacă ai mai " +
        "susținut testul. Testul poate continua, " +
        "iar profesorul va putea verifica situația.",
        true
      );

    } else {

      setStartMessage(
        "",
        false
      );
    }


    /* Inițializare test */

    state.submitted =
      false;


    state.variantId =
      generateVariantId();


    state.currentQuestions =
      selectBalancedQuestions();


    state.currentQuestionIndex =
      0;


    resetIntegrityLog();


    if (
      !state.currentQuestions.length
    ) {

      if (startButton) {

        startButton.disabled =
          false;

        startButton.innerText =
          "Începe testul";
      }


      alert(
        "Nu există suficiente întrebări " +
        "pentru generarea testului."
      );

      return;
    }


    hideElement(
      "startCard"
    );


    showElement(
      "testArea"
    );


    const studentInfo =
      byId("studentInfo");


    if (studentInfo) {
      studentInfo.innerText =
        `${name} – ${studentClass}`;
    }


    const variantLabel =
      byId("variantIdLabel");


    if (variantLabel) {
      variantLabel.innerText =
        state.variantId;
    }


    const totalCount =
      byId("totalCount");


    if (totalCount) {
      totalCount.innerText =
        state.currentQuestions.length;
    }


    renderCurrentQuestion();

    updateProgress();

    scrollToTop();
  }


  /* =========================================================
     AFIȘARE ÎNTREBARE
     ========================================================= */

  function renderCurrentQuestion() {
    const container =
      byId("questionsContainer");


    const question =
      state.currentQuestions[
        state.currentQuestionIndex
      ];


    if (
      !container ||
      !question
    ) {
      return;
    }


    container.innerHTML = "";


    const card =
      document.createElement(
        "div"
      );


    card.className =
      "question-card";

    card.id =
      `card-${question.id}`;


    let answerHtml = "";


    /* ITEM CU ALEGERE */

    if (
      question.type ===
      "choice"
    ) {

      const options =
        Array.isArray(
          question.options
        )
          ? question.options
          : [];


      answerHtml = `
        <div class="answer-options">

          ${options.map(option => `

            <label>

              <input
                type="radio"
                name="${question.id}"
                value="${escapeHtml(option)}"

                ${
                  question.studentAnswer ===
                  option
                    ? "checked"
                    : ""
                }

                ${
                  question.checked
                    ? "disabled"
                    : ""
                }
              />

              ${escapeHtml(option)}

            </label>

          `).join("")}

        </div>
      `;

    } else {

      /* ITEM CU RĂSPUNS SCRIS */

      const placeholder =
        question.numeric
          ? "Scrie doar numărul (ex: 2.5 sau 2,5)"
          : "Scrie răspunsul aici";


      answerHtml = `
        <input
          id="${question.id}"
          type="text"

          inputmode="${
            question.numeric
              ? "decimal"
              : "text"
          }"

          placeholder="${placeholder}"

          value="${
            escapeHtml(
              question.studentAnswer
            )
          }"

          ${
            question.checked
              ? "disabled"
              : ""
          }
        />
      `;
    }


    /* FEEDBACK */

    let feedbackHtml = "";


    if (question.checked) {

      feedbackHtml =
        question.correct

          ? `
            <div
              class="question-status status-correct"
            >
              Corect.
            </div>
          `

          : `
            <div
              class="question-status status-wrong"
            >
              Greșit.
            </div>
          `;
    }


    card.innerHTML = `

      <div class="question-title">

        ${
          state.currentQuestionIndex + 1
        }.

        ${question.prompt}

      </div>

      ${answerHtml}

      <div
        id="feedback-${question.id}"
        class="feedback"
      >
        ${feedbackHtml}
      </div>
    `;


    container.appendChild(
      card
    );


    const currentLabel =
      byId(
        "currentQuestionLabel"
      );


    if (currentLabel) {
      currentLabel.innerText =
        state.currentQuestionIndex + 1;
    }


    updateButtons();

    updateProgress();
  }


  /* =========================================================
     CITIRE RĂSPUNS
     ========================================================= */

  function getCurrentAnswer() {
    const question =
      state.currentQuestions[
        state.currentQuestionIndex
      ];


    if (!question) {
      return "";
    }


    if (
      question.type ===
      "choice"
    ) {

      const checked =
        document.querySelector(
          `input[name="${question.id}"]:checked`
        );


      return checked
        ? checked.value
        : "";
    }


    const input =
      byId(question.id);


    return input
      ? input.value
      : "";
  }


  /* =========================================================
     VERIFICARE RĂSPUNS CORECT
     ========================================================= */

  function isCorrect(
    question,
    value
  ) {

    const acceptedAnswers =
      Array.isArray(
        question.answer
      )
        ? question.answer
        : [question.answer];


    /* RĂSPUNS NUMERIC */

    if (question.numeric) {

      const studentValue =
        parseNumeric(value);


      if (
        studentValue === null
      ) {
        return false;
      }


      const tolerance =
        question.tolerance !==
          undefined
          ? Number(
              question.tolerance
            )
          : 0.1;


      return acceptedAnswers
        .some(answer => {

          const correctValue =
            parseNumeric(answer);


          return (
            correctValue !== null &&
            Math.abs(
              correctValue -
              studentValue
            ) <= tolerance
          );

        });
    }


    /* RĂSPUNS TEXT */

    const normalizedValue =
      normalizeText(value);


    return acceptedAnswers
      .some(
        answer =>
          normalizeText(answer) ===
          normalizedValue
      );
  }


  /* =========================================================
     VERIFICAREA ÎNTREBĂRII CURENTE
     ========================================================= */

  function checkCurrentQuestion() {
    const question =
      state.currentQuestions[
        state.currentQuestionIndex
      ];


    if (
      !question ||
      question.checked
    ) {
      return;
    }


    const studentAnswer =
      String(
        getCurrentAnswer()
      ).trim();


    if (!studentAnswer) {

      alert(
        "Scrie sau alege un răspuns " +
        "înainte de verificare."
      );

      return;
    }


    const correct =
      isCorrect(
        question,
        studentAnswer
      );


    question.studentAnswer =
      studentAnswer;

    question.checked =
      true;

    question.correct =
      correct;


    renderCurrentQuestion();
  }


  /* =========================================================
     URMĂTOAREA ÎNTREBARE
     ========================================================= */

  function goToNextQuestion() {
    const question =
      state.currentQuestions[
        state.currentQuestionIndex
      ];


    if (!question) {
      return;
    }


    if (!question.checked) {

      alert(
        "Mai întâi verifică răspunsul " +
        "la această întrebare."
      );

      return;
    }


    if (
      state.currentQuestionIndex <
      state.currentQuestions.length - 1
    ) {

      state.currentQuestionIndex++;

      renderCurrentQuestion();

      scrollToTop();
    }
  }


  /* =========================================================
     BUTOANE
     ========================================================= */

  function updateButtons() {
    const question =
      state.currentQuestions[
        state.currentQuestionIndex
      ];


    if (!question) {
      return;
    }


    const isLast =
      state.currentQuestionIndex ===
      state.currentQuestions.length - 1;


    const checkButton =
      byId("checkBtn");

    const nextButton =
      byId("nextBtn");

    const finishButton =
      byId("finishBtn");


    if (checkButton) {
      checkButton.disabled =
        question.checked;
    }


    if (nextButton) {

      nextButton.disabled =
        !question.checked ||
        isLast;


      nextButton.classList.toggle(
        "hidden",
        isLast
      );
    }


    if (finishButton) {

      finishButton.classList.toggle(
        "hidden",
        !isLast
      );


      finishButton.disabled =
        !question.checked ||
        state.submitted;
    }
  }


  /* =========================================================
     PROGRES
     ========================================================= */

  function updateProgress() {
    const answered =
      state.currentQuestions
        .filter(
          question =>
            question.checked
        )
        .length;


    const answeredCount =
      byId("answeredCount");


    if (answeredCount) {
      answeredCount.innerText =
        answered;
    }


    const percent =
      state.currentQuestions.length

        ? (
            answered /
            state.currentQuestions.length
          ) * 100

        : 0;


    const progressFill =
      byId("progressFill");


    if (progressFill) {
      progressFill.style.width =
        `${percent}%`;
    }
  }


  /* =========================================================
     FINALIZAREA TESTULUI
     ========================================================= */

  function submitTest() {
    if (state.submitted) {
      return;
    }


    const unchecked =
      state.currentQuestions
        .filter(
          question =>
            !question.checked
        )
        .length;


    if (unchecked > 0) {

      alert(
        `Mai ai ${unchecked} ` +
        "întrebări neverificate."
      );

      return;
    }


    state.submitted =
      true;


    const config =
      getConfig();


    const correct =
      state.currentQuestions
        .filter(
          question =>
            question.correct
        )
        .length;


    const answerRows =
      state.currentQuestions
        .map(
          (question, index) => ({

            nr:
              index + 1,

            prompt:
              stripHtml(
                question.prompt
              ),

            category:
              question.category ||
              "",

            studentAnswer:
              question.studentAnswer,

            correct:
              question.correct

          })
        );


    const percentage =
      state.currentQuestions.length
        ? (
            correct /
            state.currentQuestions.length
          )
        : 0;


    const grade =
      Math.max(
        1,
        config.officialPoints +
        percentage *
        config.testPoints
      );


    const roundedGrade =
      Math.round(
        grade * 100
      ) / 100;


    const payload = {

      timestamp:
        new Date()
          .toISOString(),

      test:
        config.testTitle,

      testId:
        config.testId,

      variantId:
        state.variantId,

      studentName:
        byId("studentName")
          ? byId("studentName")
              .value.trim()
          : "",

      studentClass:
        byId("studentClass")
          ? byId("studentClass")
              .value.trim()
          : "",

      correct,

      total:
        state.currentQuestions.length,

      officialPoints:
        config.officialPoints,

      testPoints:
        config.testPoints,

      grade:
        roundedGrade,

      answers:
        answerRows,

      integrityExitCount:
        state.integrityLog
          .exitCount,

      integrityTotalAwaySeconds:
        state.integrityLog
          .totalAwaySeconds,

      integrityTotalAwayFormatted:
        formatDuration(
          state.integrityLog
            .totalAwaySeconds
        ),

      integrityItemsSummary:
        getIntegrityItemsSummary(),

      integrityEvents:
        [...state.integrityLog.events]
    };


    /*
      Raportul PDF citește această variabilă.
    */

    window.lastReportPayload =
      payload;


    hideElement(
      "testArea"
    );


    showResult(
      payload
    );


    /*
      Salvarea în Sheets este delegată
      către sheets.js.
    */

    if (
      typeof window
        .sendToGoogleSheet ===
      "function"
    ) {

      window.sendToGoogleSheet(
        payload
      );

    } else {

      console.warn(
        "sheets.js nu este încărcat."
      );


      const sheetStatus =
        byId("sheetStatus");


      if (sheetStatus) {

        sheetStatus.innerText =
          "Rezultatul a fost calculat local, " +
          "dar modulul de salvare nu este disponibil.";
      }


      enableResultButtons();
    }
  }


  /* =========================================================
     AFIȘARE REZULTAT
     ========================================================= */

  function showResult(payload) {
    window.lastReportPayload =
      payload;


    showElement(
      "resultArea"
    );


    const gradeDisplay =
      byId("gradeDisplay");


    if (gradeDisplay) {

      gradeDisplay.innerText =
        `Nota ${payload.grade}`;
    }


    /* RAPORT ANTI-COPIERE */

    const integrityReturns =
      Array.isArray(
        payload.integrityEvents
      )

        ? payload.integrityEvents
            .filter(
              event =>
                event.tip ===
                "revenire_in_test"
            )

        : [];


    const integrityDetailsRows =
      integrityReturns
        .map(event => `

          <tr>

            <td>
              ${escapeHtml(event.item)}
            </td>

            <td>
              ${
                escapeHtml(
                  event.durataSecunde
                )
              }
              secunde
            </td>

            <td>
              ${
                escapeHtml(
                  event.oraPlecare ||
                  ""
                )
              }
            </td>

            <td>
              ${
                escapeHtml(
                  event.oraRevenire ||
                  ""
                )
              }
            </td>

          </tr>

        `)
        .join("");


    const integrityDetailsHtml =
      integrityReturns.length

        ? `
          <div
            class="review-table-wrapper"
          >

            <table
              class="review-table"
            >

              <thead>
                <tr>
                  <th>Item</th>
                  <th>Durată lipsă</th>
                  <th>Ora ieșirii</th>
                  <th>Ora revenirii</th>
                </tr>
              </thead>

              <tbody>
                ${integrityDetailsRows}
              </tbody>

            </table>

          </div>
        `

        : `
          <p class="small">
            Nu s-au înregistrat părăsiri
            ale ecranului testului.
          </p>
        `;


    const earnedTestPoints =
      payload.total

        ? Math.round(
            (
              payload.correct /
              payload.total
            ) *
            payload.testPoints *
            100
          ) / 100

        : 0;


    const resultDetails =
      byId("resultDetails");


    if (resultDetails) {

      resultDetails.innerHTML = `

        Elev:
        <b>
          ${
            escapeHtml(
              payload.studentName
            )
          }
        </b>

        <br>

        Clasa:
        <b>
          ${
            escapeHtml(
              payload.studentClass
            )
          }
        </b>

        <br>

        Răspunsuri corecte:
        <b>${payload.correct}</b>
        din
        <b>${payload.total}</b>

        <br>

        Punctaj:
        ${payload.officialPoints}
        punct(e) din oficiu
        +
        ${earnedTestPoints}
        puncte din test.

        <div class="warning">

          <b>
            Raport anti-copiere
          </b>

          <br>

          Ieșiri din ecran:
          <b>
            ${
              escapeHtml(
                payload
                  .integrityExitCount
              )
            }
          </b>

          <br>

          Timp total lipsă:
          <b>
            ${
              escapeHtml(
                payload
                  .integrityTotalAwayFormatted
              )
            }
          </b>

          <br>

          Itemi la care a părăsit ecranul:
          <b>
            ${
              escapeHtml(
                payload
                  .integrityItemsSummary
              )
            }
          </b>

          ${integrityDetailsHtml}

        </div>
      `;
    }


    /* REZUMAT RĂSPUNSURI */

    const reviewRows =
      payload.answers
        .map(item => {

          const resultText =
            item.correct
              ? "Corect"
              : "Greșit";


          const resultClass =
            item.correct
              ? "review-ok"
              : "review-wrong";


          return `

            <tr>

              <td>
                ${item.nr}
              </td>

              <td>
                ${
                  escapeHtml(
                    item.prompt
                  )
                }
              </td>

              <td>
                ${
                  escapeHtml(
                    item.studentAnswer
                  )
                }
              </td>

              <td
                class="${resultClass}"
              >
                ${resultText}
              </td>

            </tr>
          `;

        })
        .join("");


    const resultReview =
      byId("resultReview");


    if (resultReview) {

      resultReview.innerHTML = `

        <h3>
          Rezumatul răspunsurilor
        </h3>

        <p class="small">
          Se afișează doar dacă răspunsul
          a fost corect sau greșit,
          fără răspunsul corect.
        </p>

        <div
          class="review-table-wrapper"
        >

          <table
            class="review-table"
          >

            <thead>

              <tr>

                <th>Nr.</th>

                <th>
                  Întrebarea
                </th>

                <th>
                  Răspunsul elevului
                </th>

                <th>
                  Rezultat
                </th>

              </tr>

            </thead>

            <tbody>
              ${reviewRows}
            </tbody>

          </table>

        </div>
      `;
    }


    const resultArea =
      byId("resultArea");


    if (resultArea) {

      resultArea.scrollIntoView({
        behavior: "smooth"
      });
    }
  }


  /* =========================================================
     ACTIVARE BUTOANE REZULTAT – FALLBACK
     ========================================================= */

  function enableResultButtons() {
    if (
      typeof window
        .setResultButtonsEnabled ===
      "function"
    ) {

      window.setResultButtonsEnabled(
        true
      );

      return;
    }


    const pdfButton =
      byId("downloadPdfBtn");

    const newTestButton =
      byId("newTestBtn");


    if (pdfButton) {
      pdfButton.disabled =
        false;
    }


    if (newTestButton) {
      newTestButton.disabled =
        false;
    }
  }


  /* =========================================================
     SCROLL SUS
     ========================================================= */

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }


  /* =========================================================
     FUNCȚII PUBLICE

     Sunt expuse deoarece HTML-ul actual folosește:
     onclick="startTest()"
     onclick="checkCurrentQuestion()"
     etc.
     ========================================================= */

  window.startTest =
    startTest;

  window.checkCurrentQuestion =
    checkCurrentQuestion;

  window.goToNextQuestion =
    goToNextQuestion;

  window.submitTest =
    submitTest;

  window.scrollToTop =
    scrollToTop;


  /* =========================================================
     API OPȚIONAL PENTRU DEZVOLTARE
     ========================================================= */

  window.PhysicsTestCore = {

    getConfig,

    generateVariantId,

    selectBalancedQuestions,

    normalizeText,

    parseNumeric,

    escapeHtml,

    formatDuration,

    isCorrect,

    getState: function () {

      return {
        currentQuestionIndex:
          state.currentQuestionIndex,

        variantId:
          state.variantId,

        submitted:
          state.submitted,

        questionCount:
          state.currentQuestions.length,

        integrityLog:
          state.integrityLog
      };
    }

  };

})();
