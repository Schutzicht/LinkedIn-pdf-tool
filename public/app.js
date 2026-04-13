/**
 * LinkedIn Carousel Tool — Frontend Logic
 * Connects AI generation to the interactive canvas editor.
 */

let currentCarouselData = null;

// ── AI Generation Options ───────────────────────────────────────
const aiOptions = {
    postLength: 'medium',  // kort | medium | lang
};

function toggleAiOptions() {
    const body = document.getElementById('aiOptionsBody');
    const toggle = document.querySelector('.ai-options-toggle');
    if (body.style.display === 'none') {
        body.style.display = 'flex';
        toggle.classList.add('open');
    } else {
        body.style.display = 'none';
        toggle.classList.remove('open');
    }
}

function setupAiOptions() {
    document.querySelectorAll('.opt-pills').forEach(group => {
        group.addEventListener('click', (e) => {
            const pill = e.target.closest('.opt-pill');
            if (!pill) return;
            const opt = group.dataset.opt;
            const value = pill.dataset.value;
            group.querySelectorAll('.opt-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            aiOptions[opt] = value;
            updateOptionsSummary();
        });
    });
    updateOptionsSummary();
}

function updateOptionsSummary() {
    const labels = { kort: 'Kort', medium: 'Medium', lang: 'Lang' };
    const summaryEl = document.getElementById('aiOptionsSummary');
    if (summaryEl) {
        summaryEl.textContent = labels[aiOptions.postLength] || 'Medium';
    }
}

document.addEventListener('DOMContentLoaded', setupAiOptions);

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

    // Show loading overlay with spinning logo
    btn.disabled = true;
    emptyState.classList.add('hidden');
    canvasSection.classList.add('hidden');
    loading.classList.remove('hidden');
    editorSection.classList.add('hidden');
    postSection.classList.add('hidden');

    if (!editor) initCanvasEditor();

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, options: aiOptions }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `Server fout (${response.status})`);
        }

        if (result.success) {
            currentCarouselData = result.data;

            // Load real slides
            await editor.loadSlides(result.data);

            // Hide loading + empty state, show everything
            loading.classList.add('hidden');
            emptyState.classList.add('hidden');
            canvasSection.classList.remove('hidden');
            editorSection.classList.remove('hidden');
            postSection.classList.remove('hidden');

            // Post body
            document.getElementById('postBodyOutput').value = result.data.postBody || 'Geen tekst gegenereerd.';

            // Build text editor
            renderEditor(result.data.slides);

            showToast('Carousel gegenereerd!');

            // On mobile: auto-switch to canvas view
            if (window.innerWidth <= 1024) {
                toggleMobilePanel('canvas');
            }
        } else {
            throw new Error(result.error || 'Onbekende API fout');
        }
    } catch (error) {
        console.error(error);
        loading.classList.add('hidden');
        canvasSection.classList.add('hidden');
        emptyState.classList.remove('hidden');
        showToast(error.message || 'Fout bij het genereren', 'error');
    } finally {
        btn.disabled = false;
    }
}

// --- Manual Mode: start with empty/template slides ---
async function startManual() {
    const emptyState = document.getElementById('emptyState');
    const canvasSection = document.getElementById('canvasEditorSection');
    const editorSection = document.getElementById('editorSection');
    const postSection = document.getElementById('postSection');
    const loading = document.getElementById('loading');

    if (!editor) initCanvasEditor();

    // Build a blank carousel with editable placeholder content
    const topic = document.getElementById('topicInput').value || 'Mijn onderwerp';
    currentCarouselData = {
        title: topic,
        topic: topic,
        postBody: '',
        slides: [
            {
                type: 'intro',
                id: 'slide-1',
                content: {
                    subtitle: '~~~ ONDERTITEL ~~~',
                    title: 'Jouw titel hier',
                    cta: 'Swipe',
                    blokken: ['Woord 1', 'Woord 2', 'Woord 3'],
                },
                visuals: { style: 'cover', layout: 'grid' },
            },
            {
                type: 'content',
                id: 'slide-2',
                content: {
                    body: 'Schrijf hier je verhaal...',
                    title: 'Conclusie of kop',
                    footer: '',
                },
            },
            {
                type: 'content',
                id: 'slide-3',
                content: {
                    body: 'Nog een punt dat je wilt maken...',
                    title: 'Tweede inzicht',
                    footer: '',
                },
            },
            {
                type: 'engagement',
                id: 'slide-4',
                content: {
                    title: 'En jij?',
                    body: 'Stel hier je vraag aan de lezer...',
                    cta: 'Like & comment',
                },
            },
            {
                type: 'outro',
                id: 'slide-5',
                content: {
                    title: 'DANKJEWEL!',
                    subtitle: 'MEER VRAGEN?',
                    body: 'businessverbeteraars.nl',
                    cta: 'Connect',
                },
            },
        ],
        metadata: { author: 'Handmatig', date: new Date().toISOString() },
    };

    await editor.loadSlides(currentCarouselData);

    // Show everything
    loading.classList.add('hidden');
    emptyState.classList.add('hidden');
    canvasSection.classList.remove('hidden');
    editorSection.classList.remove('hidden');
    postSection.classList.remove('hidden');

    document.getElementById('postBodyOutput').value = '';
    renderEditor(currentCarouselData.slides);

    showToast('Handmatige modus — vul je eigen teksten in');

    if (window.innerWidth <= 1024) {
        toggleMobilePanel('canvas');
    }
}

// --- Mobile Panel Toggle ---
function toggleMobilePanel(panel) {
    const panelLeft = document.getElementById('panelLeft');
    const canvasCenter = document.getElementById('canvasCenter');
    const editorSection = document.getElementById('editorSection');
    const postSection = document.getElementById('postSection');

    // Reset all tabs
    document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));

    // Hide all
    panelLeft.style.display = 'none';
    canvasCenter.style.display = 'none';

    switch (panel) {
        case 'input':
            panelLeft.style.display = '';
            canvasCenter.style.display = 'none';
            document.getElementById('mobileTabInput').classList.add('active');
            break;
        case 'canvas':
            panelLeft.style.display = 'none';
            canvasCenter.style.display = '';
            document.getElementById('mobileTabCanvas').classList.add('active');
            // Recalculate canvas scale after becoming visible
            if (editor) requestAnimationFrame(() => editor._updateCanvasScale());
            break;
        case 'text':
            panelLeft.style.display = '';
            canvasCenter.style.display = 'none';
            // Scroll to editor section
            if (editorSection) editorSection.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('mobileTabText').classList.add('active');
            break;
    }
}

// Reset mobile panel visibility on resize to desktop
window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
        const panelLeft = document.getElementById('panelLeft');
        const canvasCenter = document.getElementById('canvasCenter');
        if (panelLeft) panelLeft.style.display = '';
        if (canvasCenter) canvasCenter.style.display = '';
    }
});

// --- Text Editor (sidebar) ---
const INTRO_LAYOUTS = ['grid', 'hero', 'sidebar', 'diagonal', 'bottom-row', 'pyramid', 'scattered', 'stack', 'overlap'];
const LAYOUT_LABELS = {
    'grid': 'Grid 2x2',
    'hero': 'Hero',
    'sidebar': 'Sidebar',
    'diagonal': 'Diagonaal',
    'bottom-row': 'Bottom Row',
    'pyramid': 'Piramide',
    'scattered': 'Scattered',
    'stack': 'Stack',
    'overlap': 'Overlap',
};

function renderEditor(slides) {
    const container = document.getElementById('slidesEditor');
    container.innerHTML = '';

    slides.forEach((slide, index) => {
        const div = document.createElement('div');
        div.className = 'p-3 border border-slate-100 rounded-lg bg-slate-50 space-y-2';

        // Layout dropdown for intro slides with blokken
        const hasBlokken = slide.type === 'intro' && slide.content.blokken && slide.content.blokken.length > 0;
        const currentLayout = (slide.visuals && slide.visuals.layout) || 'grid';
        const layoutHtml = hasBlokken ? `
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-0.5">Layout</label>
                <select class="w-full p-1.5 rounded border border-slate-200 text-xs bg-white" data-index="${index}" data-field="layout">
                    ${INTRO_LAYOUTS.map(l => `<option value="${l}" ${l === currentLayout ? 'selected' : ''}>${LAYOUT_LABELS[l]}</option>`).join('')}
                </select>
            </div>
        ` : '';

        div.innerHTML = `
            <div class="font-bold text-xs text-slate-400 uppercase">Slide ${index + 1} (${slide.type})</div>

            ${layoutHtml}

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
    container.addEventListener('input', handleEditorInput);
    container.addEventListener('change', handleEditorInput);
}

function handleEditorInput(e) {
    const target = e.target;
    if (!target.dataset || target.dataset.index === undefined || !target.dataset.field) return;

    const index = parseInt(target.dataset.index, 10);
    const field = target.dataset.field;

    if (field === 'layout') {
        // Update layout without re-generating — just re-render canvas
        setSlideLayout(index, target.value);
    } else {
        updateSlideData(index, field, target.value);
    }
}

function setSlideLayout(slideIndex, layout) {
    if (!currentCarouselData || !currentCarouselData.slides[slideIndex]) return;
    const slide = currentCarouselData.slides[slideIndex];

    if (!slide.visuals) slide.visuals = {};
    slide.visuals.layout = layout;

    // Re-render only the canvas, not the text
    if (editor) {
        editor.loadSlides(currentCarouselData).then(() => {
            editor.switchToSlide(slideIndex);
            showToast(`Layout → ${LAYOUT_LABELS[layout] || layout}`);
        });
    }
}

// --- Shuffle Layout: cycle through layouts on intro slide ---
function shuffleLayout() {
    if (!currentCarouselData || !editor) return;

    // Find intro slide(s) with blokken
    currentCarouselData.slides.forEach((slide, i) => {
        if (slide.type !== 'intro' || !slide.content.blokken || slide.content.blokken.length === 0) return;

        const current = (slide.visuals && slide.visuals.layout) || 'grid';
        const currentIdx = INTRO_LAYOUTS.indexOf(current);
        const nextIdx = (currentIdx + 1) % INTRO_LAYOUTS.length;
        const next = INTRO_LAYOUTS[nextIdx];

        if (!slide.visuals) slide.visuals = {};
        slide.visuals.layout = next;

        // Update dropdown if visible
        const dropdown = document.querySelector(`select[data-index="${i}"][data-field="layout"]`);
        if (dropdown) dropdown.value = next;
    });

    // Re-render canvas with new layout
    editor.loadSlides(currentCarouselData).then(() => {
        const introIdx = currentCarouselData.slides.findIndex(s => s.type === 'intro');
        if (introIdx >= 0) editor.switchToSlide(introIdx);
        const current = currentCarouselData.slides.find(s => s.type === 'intro');
        const layoutName = current && current.visuals ? (LAYOUT_LABELS[current.visuals.layout] || current.visuals.layout) : '';
        showToast(`Layout → ${layoutName}`);
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

// ── Element Library ─────────────────────────────────────────────────

const BLOK_COLORS_LIB = ['blauw', 'grijs', 'oranje', 'witte', 'zwarte'];

function toggleLibrary() {
    const el = document.getElementById('elementLibrary');
    const chevron = document.getElementById('libraryChevron');
    if (el.style.display === 'none') {
        el.style.display = '';
        chevron.style.transform = '';
    } else {
        el.style.display = 'none';
        chevron.style.transform = 'rotate(-90deg)';
    }
}

async function addBlokToCanvas(colorIndex, variant) {
    if (!editor) return;
    const color = BLOK_COLORS_LIB[colorIndex % BLOK_COLORS_LIB.length];
    const v = (variant % 3) + 1;
    const url = `/assets/blokken/blokken ${color} ${v}.png`;

    try {
        const img = await new Promise((resolve, reject) => {
            fabric.Image.fromURL(url, (img) => {
                if (img && img.width > 0) resolve(img);
                else reject(new Error('Failed'));
            }, { crossOrigin: 'anonymous' });
        });

        const targetW = 200;
        const scale = targetW / img.width;
        img.set({
            left: 300,
            top: 400,
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true,
            layerName: `${color} blok`,
        });

        editor.fabricCanvas.add(img);
        editor.fabricCanvas.setActiveObject(img);
        editor.fabricCanvas.renderAll();
        editor._pushHistory();
        showToast(`${color} blok toegevoegd`);
    } catch (e) {
        showToast('Kon blok niet laden', 'error');
    }
}

function addTextToCanvas(type) {
    if (!editor) return;

    const configs = {
        'heading': {
            text: 'Kop tekst',
            fontFamily: 'Outfit',
            fontSize: 48,
            fontWeight: '800',
            fontStyle: 'italic',
            fill: '#0081C6',
            layerName: 'Kop',
        },
        'body': {
            text: 'Body tekst hier...',
            fontFamily: 'Outfit',
            fontSize: 36,
            fontWeight: '300',
            fontStyle: 'italic',
            fill: '#0081C6',
            layerName: 'Body',
        },
        'hand': {
            text: 'Handschrift',
            fontFamily: 'Caveat',
            fontSize: 32,
            fontWeight: '700',
            fontStyle: 'normal',
            fill: '#0081C6',
            layerName: 'Handschrift',
        },
        'label': {
            text: 'Label',
            fontFamily: 'Outfit',
            fontSize: 24,
            fontWeight: '700',
            fontStyle: 'italic',
            fill: '#FFFFFF',
            layerName: 'Label',
        },
    };

    const cfg = configs[type] || configs['body'];

    const textbox = new fabric.Textbox(cfg.text, {
        left: 300,
        top: 400,
        width: 400,
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        fontWeight: cfg.fontWeight,
        fontStyle: cfg.fontStyle,
        fill: cfg.fill,
        textAlign: 'center',
        selectable: true,
        layerName: cfg.layerName,
    });

    editor.fabricCanvas.add(textbox);
    editor.fabricCanvas.setActiveObject(textbox);
    editor.fabricCanvas.renderAll();
    editor._pushHistory();
    showToast(`${cfg.layerName} toegevoegd`);
}

function addShapeToCanvas(type) {
    if (!editor) return;
    let obj;

    switch (type) {
        case 'line-h':
            obj = new fabric.Line([0, 0, 300, 0], {
                left: 300, top: 500,
                stroke: '#0081C6', strokeWidth: 3,
                selectable: true, layerName: 'Lijn',
            });
            break;
        case 'line-v':
            obj = new fabric.Line([0, 0, 0, 200], {
                left: 500, top: 300,
                stroke: '#0081C6', strokeWidth: 3,
                selectable: true, layerName: 'Lijn',
            });
            break;
        case 'circle':
            obj = new fabric.Circle({
                left: 400, top: 400,
                radius: 60,
                fill: 'transparent', stroke: '#0081C6', strokeWidth: 3,
                selectable: true, layerName: 'Cirkel',
            });
            break;
        case 'dot':
            obj = new fabric.Circle({
                left: 500, top: 500,
                radius: 20,
                fill: '#0081C6',
                selectable: true, layerName: 'Punt',
            });
            break;
        case 'arrow':
            obj = new fabric.Text('\u2197', {
                left: 500, top: 400,
                fontSize: 60,
                fill: '#3D2E32',
                selectable: true, layerName: 'Pijl',
            });
            break;
        case 'rect':
            obj = new fabric.Rect({
                left: 350, top: 400,
                width: 200, height: 120,
                fill: 'transparent', stroke: '#BF6A01', strokeWidth: 3,
                rx: 12, ry: 12,
                selectable: true, layerName: 'Rechthoek',
            });
            break;
    }

    if (obj) {
        editor.fabricCanvas.add(obj);
        editor.fabricCanvas.setActiveObject(obj);
        editor.fabricCanvas.renderAll();
        editor._pushHistory();
        showToast('Element toegevoegd');
    }
}

async function addArrowToCanvas(name) {
    if (!editor) return;
    const url = `/assets/pijlen/${name}.png`;

    try {
        const img = await new Promise((resolve, reject) => {
            fabric.Image.fromURL(url, (img) => {
                if (img && img.width > 0) resolve(img);
                else reject(new Error('Failed'));
            }, { crossOrigin: 'anonymous' });
        });

        // Scale: short arrows to ~200px wide, long arrows to ~400px wide
        const isLong = name.startsWith('lange');
        const targetW = isLong ? 400 : 200;
        const scale = targetW / img.width;
        img.set({
            left: 350,
            top: 450,
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true,
            layerName: `Pijl`,
        });

        editor.fabricCanvas.add(img);
        editor.fabricCanvas.setActiveObject(img);
        editor.fabricCanvas.renderAll();
        editor._pushHistory();
        showToast('Pijl toegevoegd');
    } catch (e) {
        showToast('Kon pijl niet laden', 'error');
    }
}

function deleteSelected() {
    if (!editor) return;
    const active = editor.fabricCanvas.getActiveObject();
    if (active && active.layerName !== 'Papier') {
        editor.fabricCanvas.remove(active);
        editor.fabricCanvas.renderAll();
        editor._pushHistory();
        showToast('Element verwijderd');
    } else {
        showToast('Selecteer eerst een element', 'error');
    }
}
