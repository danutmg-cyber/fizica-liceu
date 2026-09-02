// assets/js/print-helper.js

document.addEventListener("DOMContentLoaded", function() {
    // Verificăm dacă butonul nu cumva există deja pe pagină
    if (!document.querySelector('.btn-print')) {
        // Creăm elementul buton
        const printButton = document.createElement('button');
        printButton.innerHTML = '🖨️ Printează / Salvează PDF';
        printButton.className = 'btn-print';
        
        // Adăugăm acțiunea de click
        printButton.onclick = function() {
            window.print();
        };

        // Găsim un loc potrivit unde să îl inserăm automat (de exemplu, la începutul tagului <main> sau al elementului de conținut)
        // Poți schimba '.content' sau 'main' cu selectorul containerului tău principal de lecție
        const targetContainer = document.querySelector('main') || document.querySelector('.content') || document.body;
        
        // Inserăm butonul la începutul conținutului
        targetContainer.insertBefore(printButton, targetContainer.firstChild);
    }
});
