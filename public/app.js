/**
 * LinkedIn Carousel Tool — Frontend Logic
 * Connects AI generation to the interactive canvas editor.
 */

let currentCarouselData = null;

// --- Toast Notifications ---
function showToast(message, type = 'success') {
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
    const emptyState = document.getElementById('emptyState');
    const canvasSection = document.getElementById('canvasEditorSection');
    const editorSection = document.getElementById('editorSection');
    const postSection = document.getElementById('postSection');

    // UI: show canvas with skeleton immediately (no overlay)
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    emptyState.classList.add('hidden');
    loading.classList.add('hidden');
    canvasSection.classList.remove('hidden');
    editorSection.classList.add('hidden');
    postSection.classList.add('hidden');

    // Show skeleton preview while AI generates
    if (!editor) initCanvasEditor();
    await editor.showSkeleton(5);

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `Server fout (${response.status})`);
        }

        if (result.success) {
            currentCarouselData = result.data;

            // Replace skeleton with real slide data
            await editor.loadSlides(result.data);

            // Show UI sections
            loading.classList.add('hidden');
            canvasSection.classList.remove('hidden');
            editorSection.classList.remove('hidden');
            postSection.classList.remove('hidden');

            // Post body
            document.getElementById('postBodyOutput').value = result.data.postBody || 'Geen tekst gegenereerd.';

            // Build text editor
            renderEditor(result.data.slides);

            showToast('Carousel gegenereerd!');
        } else {
            throw new Error(result.error || 'Onbekende API fout');
        }
    } catch (error) {
        console.error(error);
        canvasSection.classList.add('hidden');
        emptyState.classList.remove('hidden');
        showToast(error.message || 'Fout bij het genereren', 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// --- Text Editor (sidebar) ---
function renderEditor(slides) {
    const container = document.getElementById('slidesEditor');
    container.innerHTML = '';

    slides.forEach((slide, index) => {
        const div = document.createElement('div');
        div.className = 'p-3 border border-slate-100 rounded-lg bg-slate-50 space-y-2';
        div.innerHTML = `
            <div class="font-bold text-xs text-slate-400 uppercase">Slide ${index + 1} (${slide.type})</div>

            ${slide.content.subtitle !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-0.5">Header</label>
                    <input type="text" class="w-full p-1.5 rounded border border-slate-200 text-xs" value="${escapeAttr(slide.content.subtitle || '')}" data-index="${index}" data-field="subtitle">
                </div>
            ` : ''}

            ${slide.content.title !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-0.5">Titel</label>
                    <input type="text" class="w-full p-1.5 rounded border border-slate-200 text-xs font-bold" value="${escapeAttr(slide.content.title || '')}" data-index="${index}" data-field="title">
                </div>
            ` : ''}

            ${slide.content.body !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-0.5">Body</label>
                    <textarea class="w-full p-1.5 rounded border border-slate-200 text-xs h-16 resize-none" data-index="${index}" data-field="body">${escapeAttr(slide.content.body || '')}</textarea>
                </div>
            ` : ''}

            ${slide.content.footer !== undefined ? `
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-0.5">Footer / Bron</label>
                    <input type="text" class="w-full p-1.5 rounded border border-slate-200 text-xs" value="${escapeAttr(slide.content.footer || '')}" data-index="${index}" data-field="footer">
                </div>
            ` : ''}
        `;
        container.appendChild(div);
    });

    // Live update slide data on input change
    container.addEventListener('input', (e) => {
        const target = e.target;
        if (target.dataset && target.dataset.index !== undefined && target.dataset.field) {
            const index = parseInt(target.dataset.index, 10);
            const field = target.dataset.field;
            updateSlideData(index, field, target.value);
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

// --- Apply text edits to canvas ---
async function applyTextEdits() {
    if (!currentCarouselData || !editor) return;

    const btn = document.getElementById('applyEditsBtn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = 'Laden...';
    btn.disabled = true;

    try {
        // Reload slides with updated data
        await editor.loadSlides(currentCarouselData);
        showToast('Canvas bijgewerkt!');
    } catch (e) {
        console.error(e);
        showToast('Fout bij bijwerken', 'error');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// --- Export PDF ---
async function exportPDF() {
    if (!editor) return;

    showToast('PDF wordt gegenereerd...');
    try {
        await editor.exportPDF();
        showToast('PDF gedownload!');
    } catch (e) {
        console.error(e);
        showToast('Fout bij PDF export', 'error');
    }
}

// --- Copy Post Text ---
async function copyPostText() {
    const textarea = document.getElementById('postBodyOutput');
    try {
        await navigator.clipboard.writeText(textarea.value);
        showToast('Tekst gekopieerd!');
    } catch {
        textarea.select();
        document.execCommand('copy');
        showToast('Tekst gekopieerd!');
    }
}
