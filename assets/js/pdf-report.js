/* =========================================================
   RAPORT PDF COMUN PENTRU TESTELE DE FIZICĂ
   assets/js/pdf-report.js

   Necesită:
   - html2pdf.js încărcat în pagina testului
   - variabila lastReportPayload creată de test
   - buton cu id="downloadPdfBtn"

   Funcția publică:
   downloadReportPDF()
   ========================================================= */

(function () {
  "use strict";

  const PDF_AUTHOR = "prof. Dănuț Andronie";


  /* =========================================================
     PROTECȚIE TEXT HTML
     ========================================================= */

  function pdfEscapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  /* =========================================================
     NUME SIGUR PENTRU FIȘIER
     ========================================================= */

  function safeFilenamePart(value, fallback = "raport") {
    const text = String(value || fallback)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    return text || fallback;
  }


  /* =========================================================
     OBȚINERE TITLU TEST
     ========================================================= */

  function getTestTitle(payload) {
    if (payload && payload.test) {
      return String(payload.test);
    }

    return "Test de fizică";
  }


  /* =========================================================
     RÂNDURI RAPORT ANTI-COPIERE
     ========================================================= */

  function buildIntegrityRows(payload) {
    const events = Array.isArray(payload.integrityEvents)
      ? payload.integrityEvents
      : [];

    const returns = events.filter(
      event => event && event.tip === "revenire_in_test"
    );

    if (!returns.length) {
      return `
        <tr>
          <td colspan="4"
              style="
                border:1px solid #d8e1ec;
                padding:8px;
                text-align:center;
              ">
            Nu s-au înregistrat părăsiri ale ecranului testului.
          </td>
        </tr>
      `;
    }

    return returns.map(event => `
      <tr>
        <td style="
          border:1px solid #d8e1ec;
          padding:7px;
          text-align:center;
        ">
          ${pdfEscapeHtml(event.item || "")}
        </td>

        <td style="
          border:1px solid #d8e1ec;
          padding:7px;
          text-align:center;
        ">
          ${pdfEscapeHtml(event.durataSecunde || 0)} secunde
        </td>

        <td style="
          border:1px solid #d8e1ec;
          padding:7px;
        ">
          ${pdfEscapeHtml(event.oraPlecare || "")}
        </td>

        <td style="
          border:1px solid #d8e1ec;
          padding:7px;
        ">
          ${pdfEscapeHtml(event.oraRevenire || "")}
        </td>
      </tr>
    `).join("");
  }


  /* =========================================================
     RÂNDURI REZUMAT RĂSPUNSURI
     ========================================================= */

  function buildAnswerRows(payload) {
    const answers = Array.isArray(payload.answers)
      ? payload.answers
      : [];

    if (!answers.length) {
      return `
        <tr>
          <td colspan="3"
              style="
                border:1px solid #d8e1ec;
                padding:8px;
                text-align:center;
              ">
            Nu există răspunsuri disponibile.
          </td>
        </tr>
      `;
    }

    return answers.map((item, index) => {
      const isCorrect = Boolean(item.correct);
      const resultText = isCorrect ? "Corect" : "Greșit";
      const resultColor = isCorrect ? "#176b3a" : "#962d22";

      return `
        <tr>
          <td style="
            border:1px solid #d8e1ec;
            padding:7px;
            text-align:center;
          ">
            ${pdfEscapeHtml(item.nr ?? index + 1)}
          </td>

          <td style="
            border:1px solid #d8e1ec;
            padding:7px;
          ">
            ${pdfEscapeHtml(item.prompt || "")}
          </td>

          <td style="
            border:1px solid #d8e1ec;
            padding:7px;
            font-weight:bold;
            color:${resultColor};
            text-align:center;
          ">
            ${resultText}
          </td>
        </tr>
      `;
    }).join("");
  }


  /* =========================================================
     CONSTRUIRE RAPORT HTML
     ========================================================= */

  function buildReportHtml(payload) {
    const testTitle = getTestTitle(payload);
    const integrityRows = buildIntegrityRows(payload);
    const reviewRows = buildAnswerRows(payload);

    return `
      <div style="
        text-align:center;
        font-family:Arial, sans-serif;
        color:#243447;
        margin:8px 0 12px;
      ">
        <b>Se generează raportul PDF...</b>
      </div>

      <div
        id="pdfReportContent"
        style="
          width:760px;
          max-width:100%;
          margin:0 auto;
          background:#ffffff;
          color:#243447;
          font-family:Arial, sans-serif;
          padding:24px;
          border:1px solid #d8e1ec;
        "
      >

        <!-- TITLU -->

        <div style="
          text-align:center;
          margin-bottom:16px;
        ">
          <h1 style="
            margin:0 0 6px;
            font-size:23px;
            line-height:1.25;
          ">
            Raport final
          </h1>

          <div style="
            font-size:15px;
            font-weight:bold;
          ">
            ${pdfEscapeHtml(testTitle)}
          </div>

          <div style="
            font-size:13px;
            color:#667085;
            margin-top:5px;
          ">
            Material realizat de ${pdfEscapeHtml(PDF_AUTHOR)}
          </div>
        </div>


        <!-- DATE ELEV -->

        <table style="
          width:100%;
          border-collapse:collapse;
          margin-bottom:14px;
          font-size:13px;
        ">
          <tbody>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
                width:35%;
              ">
                <b>Numele și prenumele elevului</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                ${pdfEscapeHtml(payload.studentName)}
              </td>
            </tr>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                <b>Clasa</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                ${pdfEscapeHtml(payload.studentClass)}
              </td>
            </tr>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                <b>Nota obținută</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
                font-size:20px;
              ">
                <b>${pdfEscapeHtml(payload.grade)}</b>
              </td>
            </tr>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                <b>Răspunsuri corecte</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                ${pdfEscapeHtml(payload.correct)}
                din
                ${pdfEscapeHtml(payload.total)}
              </td>
            </tr>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                <b>ID variantă</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:8px;
              ">
                ${pdfEscapeHtml(payload.variantId || "-")}
              </td>
            </tr>

          </tbody>
        </table>


        <!-- RAPORT ANTI-COPIERE -->

        <h2 style="
          font-size:17px;
          margin:12px 0 8px;
        ">
          Raport anti-copiere
        </h2>

        <table style="
          width:100%;
          border-collapse:collapse;
          margin-bottom:12px;
          font-size:12px;
        ">
          <tbody>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:7px;
                width:35%;
              ">
                <b>Ieșiri din ecran</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:7px;
              ">
                ${pdfEscapeHtml(payload.integrityExitCount || 0)}
              </td>
            </tr>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:7px;
              ">
                <b>Timp total lipsă</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:7px;
              ">
                ${pdfEscapeHtml(
                  payload.integrityTotalAwayFormatted || "0 secunde"
                )}
              </td>
            </tr>

            <tr>
              <td style="
                border:1px solid #d8e1ec;
                padding:7px;
              ">
                <b>Itemi afectați</b>
              </td>

              <td style="
                border:1px solid #d8e1ec;
                padding:7px;
              ">
                ${pdfEscapeHtml(
                  payload.integrityItemsSummary ||
                  "Nu s-au înregistrat părăsiri ale ecranului."
                )}
              </td>
            </tr>

          </tbody>
        </table>


        <!-- DETALII IEȘIRI -->

        <table style="
          width:100%;
          border-collapse:collapse;
          margin-bottom:12px;
          font-size:11px;
        ">

          <thead>
            <tr>
              <th style="
                border:1px solid #d8e1ec;
                padding:7px;
                background:#edf6ff;
              ">
                Item
              </th>

              <th style="
                border:1px solid #d8e1ec;
                padding:7px;
                background:#edf6ff;
              ">
                Durată lipsă
              </th>

              <th style="
                border:1px solid #d8e1ec;
                padding:7px;
                background:#edf6ff;
              ">
                Ora ieșirii
              </th>

              <th style="
                border:1px solid #d8e1ec;
                padding:7px;
                background:#edf6ff;
              ">
                Ora revenirii
              </th>
            </tr>
          </thead>

          <tbody>
            ${integrityRows}
          </tbody>

        </table>


        <!-- REZUMAT RĂSPUNSURI -->

        <h2 style="
          font-size:17px;
          margin:12px 0 8px;
        ">
          Rezumatul răspunsurilor
        </h2>

        <p style="
          font-size:12px;
          color:#667085;
          margin-top:0;
        ">
          Raportul afișează doar dacă răspunsul a fost corect
          sau greșit, fără răspunsul corect.
        </p>

        <table style="
          width:100%;
          border-collapse:collapse;
          font-size:11px;
        ">

          <thead>
            <tr>

              <th style="
                border:1px solid #d8e1ec;
                padding:7px;
                background:#edf6ff;
                width:42px;
              ">
                Nr.
              </th>

              <th style="
                border:1px solid #d8e1ec;
                padding:7px;
                background:#edf6ff;
              ">
                Întrebarea
              </th>

              <th style="
                border:1px solid #d8e1ec;
                padding:7px;
                background:#edf6ff;
                width:85px;
              ">
                Rezultat
              </th>

            </tr>
          </thead>

          <tbody>
            ${reviewRows}
          </tbody>

        </table>


        <!-- SUBSOL -->

        <div style="
          font-size:11px;
          color:#667085;
          margin-top:14px;
          text-align:center;
        ">
          Testul se susține o singură dată.
          Nota finală o decide profesorul.
        </div>

      </div>
    `;
  }


  /* =========================================================
     FUNCȚIA PRINCIPALĂ
     ========================================================= */

  window.downloadReportPDF = function downloadReportPDF() {

    /* Verifică existența raportului */

    if (
      typeof lastReportPayload === "undefined" ||
      !lastReportPayload
    ) {
      alert("Raportul nu este disponibil încă.");
      return;
    }


    /* Verifică html2pdf */

    if (typeof html2pdf === "undefined") {
      alert(
        "Modulul pentru generarea PDF nu s-a încărcat. " +
        "Verifică conexiunea la internet și încearcă din nou."
      );
      return;
    }


    const payload = lastReportPayload;


    /* Previne două generări simultane */

    const existingOverlay =
      document.getElementById("pdfReportOverlay");

    if (existingOverlay) {
      return;
    }


    /* Numele fișierului */

    const safeName = safeFilenamePart(
      payload.studentName,
      "elev"
    );

    const safeTest = safeFilenamePart(
      getTestTitle(payload),
      "test-fizica"
    ).substring(0, 60);

    const filename =
      `${safeTest}-${safeName}.pdf`;


    /* Creează zona temporară pentru PDF */

    const reportOverlay =
      document.createElement("div");

    reportOverlay.id = "pdfReportOverlay";

    reportOverlay.style.position = "fixed";
    reportOverlay.style.left = "0";
    reportOverlay.style.top = "0";
    reportOverlay.style.width = "100vw";
    reportOverlay.style.height = "100vh";
    reportOverlay.style.background =
      "rgba(255,255,255,0.98)";
    reportOverlay.style.zIndex = "999999";
    reportOverlay.style.overflow = "auto";
    reportOverlay.style.padding = "10px";

    reportOverlay.innerHTML =
      buildReportHtml(payload);

    document.body.appendChild(reportOverlay);


    const reportContent =
      document.getElementById("pdfReportContent");


    if (!reportContent) {
      reportOverlay.remove();

      alert(
        "Nu s-a putut construi raportul PDF."
      );

      return;
    }


    /* Configurare html2pdf */

    const options = {

      margin: 0.35,

      filename: filename,

      image: {
        type: "jpeg",
        quality: 0.98
      },

      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: 900
      },

      jsPDF: {
        unit: "in",
        format: "a4",
        orientation: "portrait"
      },

      pagebreak: {
        mode: ["css", "legacy"]
      }
    };


    /* Butonul de descărcare */

    const downloadButton =
      document.getElementById("downloadPdfBtn") ||
      document.querySelector(
        'button[onclick="downloadReportPDF()"]'
      );

    const originalButtonText =
      downloadButton
        ? downloadButton.innerText
        : "Descarcă rezultatele testului";


    if (downloadButton) {
      downloadButton.disabled = true;
      downloadButton.innerText =
        "Se generează PDF-ul...";
    }


    /* =====================================================
       IMPORTANT

       Nu folosim setTimeout aici.

       Generarea pornește direct în urma clickului elevului,
       pentru a evita blocarea descărcării de către browser.
       ===================================================== */

    void reportContent.offsetHeight;


    html2pdf()
      .set(options)
      .from(reportContent)
      .save()

      .then(() => {

        reportOverlay.remove();

        if (downloadButton) {
          downloadButton.disabled = false;
          downloadButton.innerText =
            originalButtonText;
        }

      })

      .catch(error => {

        console.error(
          "Eroare la generarea PDF:",
          error
        );

        reportOverlay.remove();

        if (downloadButton) {
          downloadButton.disabled = false;
          downloadButton.innerText =
            originalButtonText;
        }

        alert(
          "Nu s-a putut genera raportul PDF. " +
          "Încearcă din nou."
        );

      });

  };

})();
