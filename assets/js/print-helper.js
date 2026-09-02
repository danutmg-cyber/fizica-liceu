document.addEventListener("DOMContentLoaded", function() {
    const pages = document.querySelectorAll('.lesson-page');
    pages.forEach(page => {
        if (!page.querySelector('.btn-print')) {
            const printButton = document.createElement('button');
            printButton.innerHTML = '🖨️ Printează / Salvează PDF';
            printButton.className = 'lesson-button secondary btn-print';
            printButton.onclick = function() {
                // Forțează afișarea tuturor paginilor înainte de printare
                pages.forEach(p => p.removeAttribute('hidden'));
                window.print();
            };
            page.insertBefore(printButton, page.firstChild);
        }
    });
});
