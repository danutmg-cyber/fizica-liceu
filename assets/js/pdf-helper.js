/**
 * pdf-helper.js
 * Gestionarea descărcării / salvării PDF pentru lecțiile de fizică
 *
 * Prof. Dănuț Andronie
 * e-Mail: danutmg@gmail.com
 */

(function (window, document) {
  "use strict";

  const DEFAULT_OPTIONS = {
    selector: "[data-pdf-button]",
    printClass: "pdf-print-mode",
    beforePrintDelay: 150,
    restoreDelay: 300
  };

  /**
   * Verifică dacă o adresă PDF a fost definită.
   */
  function hasPdfUrl(url) {
    return (
      typeof url === "string" &&
      url.trim() !== ""
    );
  }

  /**
   * Returnează URL-ul PDF asociat lecției.
   *
   * Se caută în această ordine:
   *
   * 1. data-pdf pe buton
   * 2. data-pdf-url pe <body>
   * 3. <meta name="lesson-pdf" content="...">
   */
  function getPdfUrl(button) {
    if (
      button &&
      hasPdfUrl(button.dataset.pdf)
    ) {
      return button.dataset.pdf.trim();
    }

    if (
      document.body &&
      hasPdfUrl(document.body.dataset.pdfUrl)
    ) {
      return document.body.dataset.pdfUrl.trim();
    }

    const meta = document.querySelector(
      'meta[name="lesson-pdf"]'
    );

    if (
      meta &&
      hasPdfUrl(meta.content)
    ) {
      return meta.content.trim();
    }

    return null;
  }

  /**
   * Determină numele fișierului PDF.
   */
  function getPdfFilename(url) {
    if (!url) {
      return "lectie-fizica.pdf";
    }

    try {
      const cleanUrl = url.split("?")[0];
      const parts = cleanUrl.split("/");
      const filename = parts[parts.length - 1];

      return filename || "lectie-fizica.pdf";
    } catch (error) {
      return "lectie-fizica.pdf";
    }
  }

  /**
   * Afișează toate paginile interne ale lecției
   * înainte de imprimare.
   */
  function prepareLessonForPrint() {
    document.documentElement.classList.add(
      DEFAULT_OPTIONS.printClass
    );

    document.body.classList.add(
      DEFAULT_OPTIONS.printClass
    );

    const pages =
      document.querySelectorAll(
        ".lesson-page"
      );

    pages.forEach((page) => {
      /*
       * Memorăm starea pentru restaurare.
       */
      page.dataset.pdfWasHidden =
        page.hidden ? "true" : "false";

      page.hidden = false;

      page.removeAttribute(
        "aria-hidden"
      );
    });

    /*
     * Ascundem controalele interactive care nu
     * trebuie să apară în PDF.
     */
    const noPrint =
      document.querySelectorAll(
        [
          "[data-no-print]",
          ".no-print",
          ".pdf-button",
          ".lesson-navigation",
          ".lesson-page-nav",
          ".quiz-controls",
          ".experiment-controls",
          ".interactive-controls"
        ].join(",")
      );

    noPrint.forEach((element) => {
      element.dataset.pdfPreviousDisplay =
        element.style.display || "";

      element.style.display = "none";
    });
  }

  /**
   * Restaurează pagina după imprimare.
   */
  function restoreLessonAfterPrint() {
    document.documentElement.classList.remove(
      DEFAULT_OPTIONS.printClass
    );

    document.body.classList.remove(
      DEFAULT_OPTIONS.printClass
    );

    const pages =
      document.querySelectorAll(
        ".lesson-page"
      );

    pages.forEach((page) => {
      if (
        page.dataset.pdfWasHidden ===
        "true"
      ) {
        page.hidden = true;
        page.setAttribute(
          "aria-hidden",
          "true"
        );
      }

      delete page.dataset.pdfWasHidden;
    });

    const restored =
      document.querySelectorAll(
        "[data-pdf-previous-display]"
      );

    restored.forEach((element) => {
      element.style.display =
        element.dataset
          .pdfPreviousDisplay || "";

      delete element.dataset
        .pdfPreviousDisplay;
    });
  }

  /**
   * Actualizează MathJax înainte de imprimare.
   */
  async function refreshMathJax() {
    if (
      !window.MathJax ||
      !window.MathJax.typesetPromise
    ) {
      return;
    }

    try {
      await window.MathJax.typesetPromise();
    } catch (error) {
      console.warn(
        "MathJax nu a putut fi actualizat înainte de generarea PDF.",
        error
      );
    }
  }

  /**
   * Deschide dialogul browserului pentru
   * imprimare / salvare ca PDF.
   */
  async function printLesson() {
    prepareLessonForPrint();

    await refreshMathJax();

    window.setTimeout(
      function () {
        window.print();
      },
      DEFAULT_OPTIONS.beforePrintDelay
    );
  }

  /**
   * Descarcă un fișier PDF existent.
   */
  function downloadPdf(
    url,
    filename
  ) {
    if (!hasPdfUrl(url)) {
      return false;
    }

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      filename ||
      getPdfFilename(url);

    /*
     * Pentru accesibilitate și pentru a evita
     * afișarea temporară a linkului.
     */
    link.style.display = "none";

    document.body.appendChild(link);

    link.click();

    link.remove();

    return true;
  }

  /**
   * Schimbă temporar starea vizuală a butonului.
   */
  function setButtonState(
    button,
    state
  ) {
    if (!button) {
      return;
    }

    if (
      !button.dataset.originalLabel
    ) {
      button.dataset.originalLabel =
        button.textContent.trim();
    }

    switch (state) {
      case "loading":
        button.classList.add(
          "is-loading"
        );

        button.setAttribute(
          "aria-busy",
          "true"
        );
        break;

      case "ready":
      default:
        button.classList.remove(
          "is-loading"
        );

        button.removeAttribute(
          "aria-busy"
        );
        break;
    }
  }

  /**
   * Gestionează acțiunea butonului PDF.
   */
  async function handlePdfButton(
    event
  ) {
    event.preventDefault();

    const button =
      event.currentTarget;

    if (
      button.getAttribute(
        "aria-busy"
      ) === "true"
    ) {
      return;
    }

    setButtonState(
      button,
      "loading"
    );

    const pdfUrl =
      getPdfUrl(button);

    /*
     * Dacă există un PDF real, îl descărcăm.
     */
    if (pdfUrl) {
      downloadPdf(
        pdfUrl,
        button.dataset.filename
      );

      setButtonState(
        button,
        "ready"
      );

      return;
    }

    /*
     * Dacă încă nu există un PDF pre-generat,
     * permitem elevului să salveze lecția
     * folosind funcția nativă a browserului.
     */
    await printLesson();

    setButtonState(
      button,
      "ready"
    );
  }

  /**
   * Configurează butoanele existente.
   */
  function initPdfButtons() {
    const buttons =
      document.querySelectorAll(
        DEFAULT_OPTIONS.selector
      );

    buttons.forEach((button) => {
      /*
       * Evităm inițializarea de două ori.
       */
      if (
        button.dataset.pdfInitialized ===
        "true"
      ) {
        return;
      }

      button.dataset.pdfInitialized =
        "true";

      button.addEventListener(
        "click",
        handlePdfButton
      );
    });
  }

  /**
   * Creează automat un buton PDF.
   *
   * Poate fi utilizat de lesson.js.
   */
  function createButton(options = {}) {
    const {
      pdfUrl = "",
      filename = "",
      label = "Descarcă PDF",
      className =
        "lesson-button pdf-button"
    } = options;

    const button =
      document.createElement("button");

    button.type = "button";

    button.className =
      className;

    button.dataset.pdfButton = "";

    if (pdfUrl) {
      button.dataset.pdf =
        pdfUrl;
    }

    if (filename) {
      button.dataset.filename =
        filename;
    }

    button.setAttribute(
      "aria-label",
      label
    );

    /*
     * Iconița poate fi stilizată din CSS.
     */
    button.innerHTML = `
      <span
        class="lesson-icon lesson-icon-pdf"
        aria-hidden="true"
      ></span>
      <span>${label}</span>
    `;

    button.addEventListener(
      "click",
      handlePdfButton
    );

    button.dataset.pdfInitialized =
      "true";

    return button;
  }

  /**
   * Folosit de browser după terminarea
   * dialogului de imprimare.
   */
  window.addEventListener(
    "afterprint",
    function () {
      window.setTimeout(
        restoreLessonAfterPrint,
        DEFAULT_OPTIONS.restoreDelay
      );
    }
  );

  /**
   * Inițializare automată.
   */
  function init() {
    initPdfButtons();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

  /**
   * API public.
   */
  window.PdfHelper = {
    version: "1.0.0",

    init,
    createButton,
    downloadPdf,
    printLesson,
    prepareLessonForPrint,
    restoreLessonAfterPrint,
    getPdfUrl
  };

})(window, document);
