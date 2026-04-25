document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.livery-card');
    const customColorInput = document.getElementById('customColorInput');
    const hexValue = document.getElementById('hexValue');
    const applyCustomBtn = document.getElementById('applyCustomBtn');

    // Load current livery
    let currentLivery;
    try {
        currentLivery = JSON.parse(localStorage.getItem('car_livery')) || { primary: '#a50000', accent1: '#a50000', accent2: '#a50000' };
    } catch (e) {
        currentLivery = { primary: localStorage.getItem('car_livery') || '#a50000', accent1: '#a50000', accent2: '#a50000' };
    }
    
    // Set initial state
    updateSelection(currentLivery.primary);

    cards.forEach(card => {
        card.addEventListener('click', () => {
            const primary = card.getAttribute('data-primary');
            const accent1 = card.getAttribute('data-accent1');
            const accent2 = card.getAttribute('data-accent2');
            
            const livery = { primary, accent1, accent2 };
            saveLivery(livery);
            updateSelection(primary);
        });
    });

    customColorInput.addEventListener('input', (e) => {
        hexValue.textContent = e.target.value.toUpperCase();
    });

    applyCustomBtn.addEventListener('click', () => {
        const color = customColorInput.value;
        const livery = { primary: color, accent1: color, accent2: color };
        saveLivery(livery);
        updateSelection(color);
        alert('Custom livery applied!');
    });

    function saveLivery(livery) {
        localStorage.setItem('car_livery', JSON.stringify(livery));
    }

    function updateSelection(primaryColor) {
        cards.forEach(card => {
            if (card.getAttribute('data-primary').toLowerCase() === primaryColor.toLowerCase()) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        // Update the custom input and hex value to reflect primary choice
        customColorInput.value = primaryColor;
        hexValue.textContent = primaryColor.toUpperCase();
    }
});
