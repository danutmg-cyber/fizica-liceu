document.addEventListener("DOMContentLoaded", function() {
    const pages = document.querySelectorAll('.lesson-page');
    pages.forEach(page => {
        if (!page.querySelector('.btn-print')) {
            const printButton = document.createElement('button');
            printButton.innerHTML = '🖨️ Printează / Salvează PDF';
            printButton.className = 'lesson-button secondary btn-print';
            printButton.onclick = function() {
                // Forțează eliminarea oricărui atribut hidden sau stil de ascunzire de pe pagini
                pages.forEach(p => {
                    p.removeAttribute('hidden');
                    p.style.display = 'block';
                });
                window.print();
            };
            page.insertBefore(printButton, page.firstChild);
        }
    });
});
