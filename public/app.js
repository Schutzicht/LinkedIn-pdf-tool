/**
 * LinkedIn Carousel Tool — Frontend Logic
 * Extracted from inline script for better maintainability.
 */

let currentCarouselData = null;

// --- Toast Notifications (vervangt alert()) ---
function showToast(message, type = 'success') {
    // Verwijder bestaande toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Generate Carousel ---
async function generateCarousel() {
    const topic = document.getElementById('topicInput').value;
    if (!topic) {
        showToast('Voer eerst een onderwerp in!', 'error');
        return;
    }

    const btn = document.getElementById('generateBtn');
    const loading = document.getElementById('loading');
    const preview = document.getElementById('previewSection');
    const emptyState = document.getElementById('emptyState');
    const grid = document.getElementById('grid');
    const editor = document.getElementById('editorSection');

    // UI Updates
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    loading.classList.remove('hidden');
    emptyState.classList.add('hidden');
    preview.classList.add('hidden');
    editor.classList.add('hidden');
    grid.innerHTML = '';

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic }),
        });

        const result = await response.json();

        if (!response.ok) {
            // Rate limiting of server error
            throw new Error(result.error || `Server fout (${response.status})`);
        }

        if (result.success) {
            currentCarouselData = result.data;
            loading.classList.add('hidden');
            preview.classList.remove('hidden');
            editor.classList.remove('hidden');

            document.getElementById('postBodyOutput').value = result.data.postBody || 'Geen tekst gegenereerd.';
            renderEditor(result.data.slides);
            updatePreviewUI(result);
        } else {
            throw new Error(result.error || 'Onbekende API fout');
        }
    } catch (error) {
        console.error(error);
        loading.classList.add('hidden');
        emptyState.classList.remove('hidden');
        showToast(error.message || 'Fout bij het genereren', 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// --- Editor ---
function renderEditor(slides) {
    const container = document.getElementById('slidesEditor');
    container.innerHTML = '';

    slides.forEach((slide, index) => {
        const div = document.createElement('div');
        div.className = 'p-4 border border-slate-100 rounded-lg bg-slate-50 space-y-3';
        div.innerHTML = `
            <div class="font-bold text-sm text-slate-400 uppercase">Slide ${index + 1} (${slide.type})</div>
            
            ${slide.content.subtitle !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">Header / Subtitle</label>
                    <input type="text" class="w-full p-2 rounded border border-slate-200 text-sm" value="${escapeAttr(slide.content.subtitle || '')}" data-index="${index}" data-field="subtitle">
                </div>
            ` : ''}

            ${slide.content.title !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">Titel</label>
                    <input type="text" class="w-full p-2 rounded border border-slate-200 text-sm font-bold" value="${escapeAttr(slide.content.title || '')}" data-index="${index}" data-field="title">
                </div>
            ` : ''}

            ${slide.content.body !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">Body Tekst</label>
                    <textarea class="w-full p-2 rounded border border-slate-200 text-sm h-24 resize-none" data-index="${index}" data-field="body">${escapeAttr(slide.content.body || '')}</textarea>
                </div>
            ` : ''}
            
            ${slide.content.footer !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">Footer / Bron</label>
                    <input type="text" class="w-full p-2 rounded border border-slate-200 text-sm" value="${escapeAttr(slide.content.footer || '')}" data-index="${index}" data-field="footer">
                </div>
            ` : ''}
        `;
        container.appendChild(div);
    });

    // Event delegation voor alle editor inputs
    container.addEventListener('change', (e) => {
        const target = e.target;
        if (target.dataset && target.dataset.index !== undefined && target.dataset.field) {
            const index = parseInt(target.dataset.index, 10);
            const field = target.dataset.field;
            const value = target.value;
            updateSlideData(index, field, value);
        }
    });
}

function escapeAttr(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function updateSlideData(index, field, value) {
    if (currentCarouselData && currentCarouselData.slides[index]) {
        currentCarouselData.slides[index].content[field] = value;
    }
}

// --- Update Visuals ---
async function updateVisuals() {
    if (!currentCarouselData) return;

    const btn = document.getElementById('updateVisualsBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Rendering...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slides: currentCarouselData.slides }),
        });

        const result = await response.json();

        if (result.success) {
            updatePreviewUI(result);
            showToast('Visuals bijgewerkt!');
        } else {
            showToast('Fout bij updaten: ' + result.error, 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Verbindingsfout', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- Preview UI ---
function updatePreviewUI(result) {
    const pdfBtn = document.getElementById('downloadPdfBtn');
    const grid = document.getElementById('grid');

    if (result.pdfUrl) {
        pdfBtn.href = result.pdfUrl;
        pdfBtn.classList.remove('hidden');
    } else {
        pdfBtn.classList.add('hidden');
    }

    grid.innerHTML = '';
    result.images.forEach((imgUrl, index) => {
        const card = document.createElement('div');
        card.className = 'group relative rounded-xl overflow-hidden shadow-lg transition-transform hover:scale-[1.02] duration-300 bg-white';

        const img = document.createElement('img');
        img.src = `${imgUrl}?t=${Date.now()}`;
        img.alt = `Slide ${index + 1}`;
        img.className = 'w-full h-auto block';

        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center';
        overlay.innerHTML = `<a href="${imgUrl}" download="slide-${index + 1}.png" class="bg-white text-primary font-bold py-2 px-6 rounded-full hover:bg-accent hover:text-white transition-colors">Download</a>`;

        card.appendChild(img);
        card.appendChild(overlay);
        grid.appendChild(card);
    });
}

// --- Copy Post Text ---
async function copyPostText() {
    const textarea = document.getElementById('postBodyOutput');
    try {
        await navigator.clipboard.writeText(textarea.value);
        showToast('Tekst gekopieerd! 📋');
    } catch {
        // Fallback voor oudere browsers
        textarea.select();
        document.execCommand('copy');
        showToast('Tekst gekopieerd! 📋');
    }
}
