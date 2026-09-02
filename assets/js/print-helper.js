document.addEventListener("DOMContentLoaded", function () {
    const pages = document.querySelectorAll('.lesson-page');

    pages.forEach(page => {
        if (!page.querySelector('.btn-print')) {
            const printButton = document.createElement('button');

            printButton.innerHTML = '🖨️ Printează / Salvează PDF';
            printButton.className = 'lesson-button secondary btn-print';

            printButton.addEventListener('click', function () {
                window.print();
            });

            page.insertBefore(printButton, page.firstChild);
        }
    });
});
