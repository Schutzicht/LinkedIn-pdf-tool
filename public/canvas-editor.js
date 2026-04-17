/**
 * LinkedIn Carousel Canvas Editor
 * Interactive Fabric.js-based slide editor with layers, drag & drop, and PDF export.
 *
 * Design based on WIDEA brand PDF carousels:
 * - Grey blok (large) as border/frame
 * - White blok (slightly smaller) on top as "paper"
 * - Large italic body text filling most of the paper
 * - Engagement slide has light blue canvas background
 * - Logo bottom-right on every slide
 */

// ── Fix Fabric.js v5 'alphabetical' textBaseline bug ──────────────
// Fabric.js sets ctx.textBaseline = 'alphabetical' but browsers only accept 'alphabetic'.
if (typeof fabric !== 'undefined' && fabric.Text) {
    const origRender = fabric.Text.prototype._renderTextCommon;
    if (origRender) {
        fabric.Text.prototype._renderTextCommon = function(ctx, method) {
            if (ctx.textBaseline === 'alphabetical') ctx.textBaseline = 'alphabetic';
            return origRender.call(this, ctx, method);
        };
    }
}

// ── Constants ──────────────────────────────────────────────────────
const SLIDE_SIZE = 1080;

const BRAND = {
    primary: '#3D2E32',
    secondary: '#0081C6',
    accent: '#BF6A01',
    grey2: '#56565A',
    grey3: '#989798',
    grey4: '#D0CFCC',
    paper: '#F6F6F6',
    background: '#FFFFFF',         // Default canvas bg (white)
    engagementBg: '#A8D4E6',       // Light blue bg for engagement slides
};

// Verb font (Widea huisstijl), geladen via @font-face in input.css
// Light gewicht (300-500) voor body, CondRegular (600-900) voor titels/bold
const FONT_MAIN = 'Verb';
const FONT_HAND = 'Caveat';

// The single paper background image used on ALL slides
const PAPER_IMAGE = '/assets/blokken/Lichtgrijze-slides-achtergrond.png';

// ── Blokken image paths (3 colors, 3 variants each) ──────────────
// Colors assigned per blok position: [0]=blauw, [1]=grijs, [2]=oranje
const BLOKKEN_COLORS = ['blauw', 'grijs', 'oranje'];

function getBlokImagePath(colorIndex, variant) {
    const color = BLOKKEN_COLORS[colorIndex % BLOKKEN_COLORS.length];
    const v = ((variant || 0) % 3) + 1;
    return `/assets/blokken/blokken ${color} ${v}.png`;
}

// ── Paper preset ───────────────────────────────────────────────────
// The PNG is already 1:1 (2480x2480), so we scale uniformly to fit ~1020px.
const PAPER_PRESET = {
    left: 30,
    top: 30,
    renderedSize: 1020,  // uniform scale, no stretching
    angle: -1,
};

// ── Safe area (text margins within the paper) ─────────────────────
const SAFE_AREA = {
    left: 100,
    top: 90,
    right: 990,
    bottom: 830,
};

// ── Unified slide zones — gives every layout consistent vertical rhythm ──
const ZONES = {
    header:  { top: 95,  bottom: 155 },   // subtitle (~35-40px tall + padding)
    title:   { top: 165, bottom: 305 },   // 1-3 lines title
    content: { top: 320, bottom: 770 },   // bloks + decorations area
    footer:  { top: 780, bottom: 1000 },  // CTA + logo area
};

// ── LinkedIn next-slide swipe anchor — op de rechterrand van het papier, verticaal midden ──
// Papier loopt van x=30 tot x=1050 (renderedSize 1020). Tip eindigt net binnen de paper rand.
const LINKEDIN_NEXT_ANCHOR = { x: 1000, y: 540 };

// ── Helpers ─────────────────────────────────────────────────────────

function loadImageAsync(url) {
    return new Promise((resolve, reject) => {
        fabric.Image.fromURL(url, (img) => {
            if (img && img.width > 0) resolve(img);
            else reject(new Error('Failed to load image: ' + url));
        }, { crossOrigin: 'anonymous' });
    });
}

/**
 * Apply bold (800) fontWeight and optionally larger fontSize
 * to a character range in a Fabric.js Textbox.
 * Fabric styles are indexed by line number, then char index within that line.
 */
function applyBoldRange(textbox, fullText, startIdx, endIdx, largerSize) {
    const styles = {};
    let line = 0;
    let charInLine = 0;

    for (let i = 0; i < fullText.length; i++) {
        if (fullText[i] === '\n') {
            line++;
            charInLine = 0;
            continue;
        }

        if (i >= startIdx && i < endIdx) {
            if (!styles[line]) styles[line] = {};
            const charStyle = { fontWeight: '800' };
            if (largerSize) charStyle.fontSize = largerSize;
            styles[line][charInLine] = charStyle;
        }

        charInLine++;
    }

    textbox.styles = styles;
}

/**
 * Auto-shrink a Fabric.js Textbox fontSize until it fits within maxHeight.
 * Also shrinks the bold title portion proportionally.
 */
function autoFitTextbox(textbox, maxHeight, boldStart, boldEnd, baseFontSize, titleFontSize) {
    const MIN_FONT = 24;
    let currentBase = baseFontSize;
    let currentTitle = titleFontSize;
    const ratio = titleFontSize / baseFontSize;

    // Force initial calculation
    textbox.set({ fontSize: currentBase });
    if (boldStart >= 0 && boldEnd > boldStart) {
        applyBoldRange(textbox, textbox.text, boldStart, boldEnd, currentTitle);
    }
    textbox.initDimensions();

    while (textbox.height > maxHeight && currentBase > MIN_FONT) {
        currentBase -= 2;
        currentTitle = Math.round(currentBase * ratio);
        textbox.set({ fontSize: currentBase });
        if (boldStart >= 0 && boldEnd > boldStart) {
            applyBoldRange(textbox, textbox.text, boldStart, boldEnd, currentTitle);
        }
        textbox.initDimensions();
    }

    return textbox;
}

async function ensureFontsLoaded() {
    try {
        // Verb light (300-500) — voor body tekst
        await document.fonts.load('300 42px "Verb"');
        await document.fonts.load('italic 300 42px "Verb"');
        // Verb cond regular (600-900) — voor titels
        await document.fonts.load('800 52px "Verb"');
        await document.fonts.load('italic 800 52px "Verb"');
        // Caveat handschrift
        await document.fonts.load('700 28px "Caveat"');
    } catch (e) {
        console.warn('Font preload failed, continuing anyway:', e);
    }
}

// ── SlideCanvasEditor Class ─────────────────────────────────────────

class SlideCanvasEditor {
    constructor(canvasId, layerPanelId, slidesTabsId) {
        this.canvasEl = document.getElementById(canvasId);
        this.layerPanelEl = document.getElementById(layerPanelId);
        this.slidesTabsEl = document.getElementById(slidesTabsId);

        this.fabricCanvas = new fabric.Canvas(canvasId, {
            width: SLIDE_SIZE,
            height: SLIDE_SIZE,
            backgroundColor: BRAND.background,
            selection: true,
            preserveObjectStacking: true,
        });

        this.slideObjects = [];
        this.slidesData = [];
        this.activeSlideIndex = -1;

        // Undo/Redo history
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;
        this.suppressHistory = false;

        this.fabricCanvas.on('selection:created', () => this._syncLayerSelection());
        this.fabricCanvas.on('selection:updated', () => this._syncLayerSelection());
        this.fabricCanvas.on('selection:cleared', () => this._syncLayerSelection());

        // Track only user modifications — added/removed are handled manually
        this.fabricCanvas.on('object:modified', () => this._pushHistory());

        // Keyboard shortcuts: backspace/delete = remove, ctrl+z = undo, ctrl+shift+z = redo
        this._keyHandler = (e) => {
            // Skip if user is typing in an input/textarea
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;

            // Skip if Fabric.js is actively editing text
            const active = this.fabricCanvas.getActiveObject();
            if (active && active.isEditing) return;

            const key = e.key;
            const isMod = e.metaKey || e.ctrlKey;

            // Delete / Backspace → remove selected
            if ((key === 'Delete' || key === 'Backspace') && active && !active.layerLocked) {
                e.preventDefault();
                this._deleteActive();
                return;
            }

            // Cmd/Ctrl + Z → undo
            if (isMod && !e.shiftKey && (key === 'z' || key === 'Z')) {
                e.preventDefault();
                this.undo();
                return;
            }

            // Cmd/Ctrl + Shift + Z → redo
            if (isMod && e.shiftKey && (key === 'z' || key === 'Z')) {
                e.preventDefault();
                this.redo();
                return;
            }

            // Cmd/Ctrl + Y → redo (alternative)
            if (isMod && (key === 'y' || key === 'Y')) {
                e.preventDefault();
                this.redo();
                return;
            }
        };
        document.addEventListener('keydown', this._keyHandler);

        this._updateCanvasScale();
        window.addEventListener('resize', () => this._updateCanvasScale());
    }

    // ── Undo/Redo ─────────────────────────────────────────────────
    _pushHistory() {
        if (this.suppressHistory) return;
        try {
            const snapshot = JSON.stringify(this.fabricCanvas.toJSON(['layerName', 'layerLocked', 'layerVisible']));
            this.undoStack.push(snapshot);
            if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
            this.redoStack = []; // clear redo on new action
        } catch (e) {
            console.warn('History push failed:', e);
        }
    }

    undo() {
        if (this.undoStack.length < 2) return; // need at least one previous state
        const current = this.undoStack.pop();
        this.redoStack.push(current);
        const prev = this.undoStack[this.undoStack.length - 1];
        this._restoreSnapshot(prev);
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const next = this.redoStack.pop();
        this.undoStack.push(next);
        this._restoreSnapshot(next);
    }

    _restoreSnapshot(json) {
        this.suppressHistory = true;
        this.fabricCanvas.loadFromJSON(json, () => {
            this.fabricCanvas.renderAll();
            // Use rAF to ensure all events are flushed before re-enabling
            requestAnimationFrame(() => {
                this.suppressHistory = false;
            });
        });
    }

    _deleteActive() {
        const active = this.fabricCanvas.getActiveObject();
        if (!active) return;
        if (active.layerName === 'Papier' || active.layerLocked) return;

        // Handle multi-selection
        if (active.type === 'activeSelection') {
            active.forEachObject(obj => {
                if (obj.layerName !== 'Papier' && !obj.layerLocked) {
                    this.fabricCanvas.remove(obj);
                }
            });
            this.fabricCanvas.discardActiveObject();
        } else {
            this.fabricCanvas.remove(active);
        }
        this.fabricCanvas.renderAll();
        this._pushHistory();
    }

    // ── Public API ──────────────────────────────────────────────────

    /**
     * Show skeleton/placeholder slides while AI is generating.
     * Shows paper backgrounds, logo, and "Laden..." placeholder text.
     */
    async showSkeleton(slideCount = 5) {
        await ensureFontsLoaded();

        const types = ['intro', 'content', 'content', 'content', 'engagement', 'outro'];
        this.slidesData = [];
        this.slideObjects = [];

        for (let i = 0; i < slideCount; i++) {
            const type = types[i] || 'content';
            this.slidesData.push({ type, id: `skeleton-${i}`, content: {} });

            const objects = [];

            // Paper background
            try {
                const paper = await this._createPaperBlok();
                if (paper) objects.push(paper);
            } catch {
                objects.push(this._createFallbackPaper());
            }

            // Placeholder text blocks (pulsing grey)
            if (type === 'intro') {
                objects.push(this._createSkeletonBlock(200, 140, 700, 40));
                objects.push(this._createSkeletonBlock(160, 320, 760, 70));
                objects.push(this._createSkeletonBlock(200, 420, 680, 70));
            } else if (type === 'outro') {
                objects.push(this._createSkeletonBlock(250, 260, 580, 60));
                objects.push(this._createSkeletonBlock(220, 420, 640, 50));
                objects.push(this._createSkeletonBlock(300, 530, 480, 30));
            } else {
                objects.push(this._createSkeletonBlock(180, 180, 720, 50));
                objects.push(this._createSkeletonBlock(160, 300, 760, 45));
                objects.push(this._createSkeletonBlock(200, 380, 680, 45));
                objects.push(this._createSkeletonBlock(220, 460, 640, 45));
                objects.push(this._createSkeletonBlock(240, 540, 600, 45));
            }

            // "Laden..." label
            objects.push(new fabric.Text('Genereren...', {
                left: SLIDE_SIZE / 2 - 120,
                top: SLIDE_SIZE / 2 + 200,
                fontSize: 26,
                fontFamily: FONT_HAND,
                fontWeight: '700',
                fill: '#BBBBBB',
                selectable: false,
                evented: false,
                layerName: '_skeleton',
            }));

            // Logo
            try {
                const logo = await this._createLogo();
                if (logo) objects.push(logo);
            } catch {}

            this.slideObjects.push(objects);
        }

        this._renderSlideTabs();
        this.switchToSlide(0);
        requestAnimationFrame(() => this._updateCanvasScale());
    }

    _createSkeletonBlock(x, y, w, h) {
        return new fabric.Rect({
            left: x,
            top: y,
            width: w,
            height: h,
            fill: '#E8E8E8',
            rx: 8,
            ry: 8,
            selectable: false,
            evented: false,
            layerName: '_skeleton',
        });
    }

    async loadSlides(carouselData) {
        await ensureFontsLoaded();

        // Lazy-load slide layout overrides (alle exact gepositioneerde elementen per preset)
        if (!this._slideLayouts) {
            try {
                const res = await fetch('/assets/slideLayouts.json');
                this._slideLayouts = await res.json();
            } catch (e) {
                console.warn('slideLayouts.json niet geladen:', e);
                this._slideLayouts = { presets: {} };
            }
        }

        // Suppress history during initial load
        this.suppressHistory = true;

        // Reset state so switchToSlide doesn't skip index 0
        this.activeSlideIndex = -1;
        this.slidesData = carouselData.slides;
        this.carouselMeta = carouselData.metadata || {};
        this.presetId = (this.carouselMeta && this.carouselMeta.presetId) || null;
        this.slideObjects = [];
        this.undoStack = [];
        this.redoStack = [];

        for (let i = 0; i < this.slidesData.length; i++) {
            const objects = await this._buildSlideObjects(this.slidesData[i], i);
            // Apply exact layout overrides if defined for this preset/slide
            await this._applyLayoutOverrides(objects, i);
            this.slideObjects.push(objects);
        }

        this._renderSlideTabs();
        this.switchToSlide(0);
        requestAnimationFrame(() => this._updateCanvasScale());

        // Re-enable history and capture initial state
        this.suppressHistory = false;
        setTimeout(() => this._pushHistory(), 100);
    }

    switchToSlide(index) {
        if (index === this.activeSlideIndex) return;
        this.suppressHistory = true;
        this._saveCurrentSlide();

        const current = this.fabricCanvas.getObjects().slice();
        current.forEach(obj => this.fabricCanvas.remove(obj));

        // Set canvas background per slide type
        const slideType = this.slidesData[index]?.type;
        if (slideType === 'engagement') {
            this.fabricCanvas.backgroundColor = BRAND.engagementBg;
        } else {
            this.fabricCanvas.backgroundColor = BRAND.background;
        }

        if (this.slideObjects[index]) {
            this.slideObjects[index].forEach(obj => this.fabricCanvas.add(obj));
        }

        this.activeSlideIndex = index;
        this.fabricCanvas.discardActiveObject();
        this.fabricCanvas.renderAll();
        this._renderLayerPanel();
        this._renderSlideTabs();

        // Reset history per slide so undo doesn't cross slides
        this.undoStack = [];
        this.redoStack = [];
        this.suppressHistory = false;
        setTimeout(() => this._pushHistory(), 50);
    }

    async exportPDF() {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            unit: 'px',
            format: [SLIDE_SIZE, SLIDE_SIZE],
            hotfixes: ['px_scaling'],
        });

        const startSlide = this.activeSlideIndex;

        for (let i = 0; i < this.slideObjects.length; i++) {
            if (i > 0) pdf.addPage([SLIDE_SIZE, SLIDE_SIZE]);
            this.switchToSlide(i);
            this.fabricCanvas.discardActiveObject();
            this.fabricCanvas.renderAll();

            const dataUrl = this.fabricCanvas.toDataURL({ format: 'png', multiplier: 1, quality: 1 });
            pdf.addImage(dataUrl, 'PNG', 0, 0, SLIDE_SIZE, SLIDE_SIZE);
        }

        this.switchToSlide(startSlide);
        pdf.save('carousel.pdf');
    }

    exportSlidePNG(index) {
        const prevIndex = this.activeSlideIndex;
        if (index !== this.activeSlideIndex) this.switchToSlide(index);
        this.fabricCanvas.discardActiveObject();
        this.fabricCanvas.renderAll();
        const dataUrl = this.fabricCanvas.toDataURL({ format: 'png', multiplier: 1, quality: 1 });
        if (prevIndex !== index) this.switchToSlide(prevIndex);
        return dataUrl;
    }

    /**
     * Export all element positions for calibration.
     * Drag elements to the right spot, click "Export Posities",
     * then share the JSON to update presets.
     */
    exportPositions() {
        this._saveCurrentSlide();
        const allPositions = {};

        for (let s = 0; s < this.slideObjects.length; s++) {
            const slideType = this.slidesData[s]?.type || 'unknown';
            const objs = this.slideObjects[s] || [];
            const elements = {};

            objs.forEach(obj => {
                const name = obj.layerName || 'unnamed';
                const info = {
                    left: Math.round(obj.left),
                    top: Math.round(obj.top),
                };
                if (obj.width) info.width = Math.round(obj.width);
                if (obj.height) info.height = Math.round(obj.height);
                if (obj.scaleX && obj.scaleX !== 1) info.scaleX = +obj.scaleX.toFixed(3);
                if (obj.scaleY && obj.scaleY !== 1) info.scaleY = +obj.scaleY.toFixed(3);
                if (obj.angle) info.angle = +obj.angle.toFixed(1);
                if (obj.fontSize) info.fontSize = obj.fontSize;
                if (obj.opacity !== undefined && obj.opacity !== 1) info.opacity = +obj.opacity.toFixed(2);
                elements[name] = info;
            });

            allPositions[`slide_${s + 1}_${slideType}`] = elements;
        }

        const json = JSON.stringify(allPositions, null, 2);
        console.log('=== SLIDE POSITIES ===\n' + json);

        navigator.clipboard.writeText(json).then(() => {
            showToast('Posities gekopieerd naar clipboard!');
        }).catch(() => {
            prompt('Kopieer deze posities:', json);
        });

        return allPositions;
    }

    // ── Slide Object Building ───────────────────────────────────────

    async _buildSlideObjects(slide, index) {
        const objects = [];

        // 1. Paper shape — single blok (grijs or blauw for engagement)
        try {
            const paper = await this._createPaperBlok();
            if (paper) objects.push(paper);
        } catch (e) {
            console.warn('Paper blok loading failed, using fallback:', e);
            objects.push(this._createFallbackPaper());
        }

        // 3. Content elements per slide type
        let contentObjects;
        switch (slide.type) {
            case 'intro':
                contentObjects = await this._buildIntroContent(slide);
                break;
            case 'content':
                contentObjects = await this._buildContentContent(slide);
                break;
            case 'engagement':
                contentObjects = await this._buildEngagementContent(slide);
                break;
            case 'outro':
                contentObjects = this._buildOutroContent(slide);
                break;
            default:
                contentObjects = await this._buildContentContent(slide);
        }
        objects.push(...contentObjects);

        // 4. Footer logo (every slide, bottom-right)
        try {
            const logo = await this._createLogo();
            if (logo) objects.push(logo);
        } catch (e) {
            console.warn('Logo loading failed:', e);
        }

        return objects;
    }

    /**
     * Paper shape: single blok (grijs normally, blauw for engagement).
     * Uses calibrated PAPER_PRESET — same size/position on every slide.
     */
    async _createPaperBlok() {
        const img = await loadImageAsync(PAPER_IMAGE);

        const uniformScale = PAPER_PRESET.renderedSize / img.width;

        img.set({
            left: PAPER_PRESET.left,
            top: PAPER_PRESET.top,
            scaleX: uniformScale,
            scaleY: uniformScale,
            angle: PAPER_PRESET.angle,
            opacity: 1,
            selectable: false,
            evented: false,
            layerName: 'Papier',
            layerLocked: true,
        });

        return img;
    }

    _createFallbackPaper() {
        return new fabric.Rect({
            left: 80,
            top: 80,
            width: 920,
            height: 920,
            fill: BRAND.paper,
            rx: 40,
            ry: 40,
            angle: -1,
            selectable: false,
            evented: false,
            layerName: 'Papier',
            layerLocked: true,
        });
    }

    async _createLogo() {
        try {
            const img = await loadImageAsync('/assets/logo.svg');
            img.set({
                left: 714,
                top: 860,
                scaleX: 0.628,
                scaleY: 0.628,
                selectable: true,
                layerName: 'Logo',
            });
            return img;
        } catch {
            return null;
        }
    }

    /**
     * Create a row of decorative blokken with text labels centered on each.
     * Returns array of fabric objects (images + text overlays).
     * @param {string[]} labels - e.g. ["Ja?", "Nee?", "Misschien?"]
     * @param {number} centerY - vertical center position for the row
     */
    async _createBlokkenRow(labels, centerY) {
        if (!labels || labels.length === 0) return [];

        const objects = [];
        const blokSize = 160; // rendered size per blok
        const gap = 30;
        const count = labels.length;
        const totalWidth = count * blokSize + (count - 1) * gap;
        const startX = (SLIDE_SIZE - totalWidth) / 2;

        for (let i = 0; i < count; i++) {
            const x = startX + i * (blokSize + gap);
            const variant = i; // each blok gets a different variant shape

            try {
                const img = await loadImageAsync(getBlokImagePath(i, variant));
                const scale = blokSize / Math.max(img.width, img.height);
                img.set({
                    left: x,
                    top: centerY - blokSize / 2,
                    scaleX: scale,
                    scaleY: scale,
                    selectable: true,
                    evented: true,
                    layerName: `Blok ${i + 1}`,
                });
                objects.push(img);
            } catch (e) {
                // Fallback: colored circle
                const colors = [BRAND.secondary, BRAND.grey3, BRAND.accent];
                objects.push(new fabric.Circle({
                    left: x,
                    top: centerY - blokSize / 2,
                    radius: blokSize / 2,
                    fill: colors[i % 3],
                    selectable: true,
                    layerName: `Blok ${i + 1}`,
                }));
            }

            // Text label centered on the blok — auto-shrink for longer words
            let blokFontSize = 26;
            if (labels[i].length > 10) blokFontSize = 18;
            else if (labels[i].length > 7) blokFontSize = 20;
            else if (labels[i].length > 5) blokFontSize = 22;

            objects.push(new fabric.Text(labels[i], {
                left: x + blokSize / 2,
                top: centerY,
                fontSize: blokFontSize,
                fontFamily: FONT_MAIN,
                fontWeight: '700',
                fill: '#FFFFFF',
                textAlign: 'center',
                originX: 'center',
                originY: 'center',
                selectable: true,
                evented: true,
                layerName: `Blok ${i + 1} Tekst`,
            }));
        }

        return objects;
    }

    // ── Template Builders ───────────────────────────────────────────
    // Positions and sizes calibrated from the example PDF.
    //
    // Key design rules from the PDF:
    // - Content slides: body text is LARGE (~42px), fills most of the paper
    // - No separate title on content slides — body IS the main content
    // - Intro: header top, big title, visual element, CTA
    // - Engagement: same as content but with "Like & comment"
    // - Outro: "DANKJEWEL!", "MEER VRAGEN?", URL, "Like & comment"

    async _buildIntroContent(slide) {
        const objects = [];
        const contentLeft = SAFE_AREA.left + 40;
        const contentWidth = SAFE_AREA.right - SAFE_AREA.left - 80;

        const hasBlokken = slide.content.blokken && slide.content.blokken.length > 0;
        const blokCount = hasBlokken ? slide.content.blokken.length : 0;
        const layout = (slide.visuals && slide.visuals.layout) || 'grid';

        // ── Layout-specific positioning ────────────────────────────
        const layoutConfig = this._getIntroLayoutConfig(layout, hasBlokken);

        // Compute blok-grid geometry for collision-aware decorations
        this._currentBlokGeometry = this._getBlokGeometry(layout, blokCount);

        // ── Header / Subtitle ──
        // Always horizontally centered — stack blijft links uitgelijnd (blokken zijn links)
        const isSideLayout = layout === 'stack';
        const headerLeft = isSideLayout ? 380 : 140;
        const headerWidth = isSideLayout ? 540 : 800;
        const headerAlign = isSideLayout ? 'left' : 'center';

        if (slide.content.subtitle) {
            objects.push(new fabric.Textbox(slide.content.subtitle, {
                left: headerLeft,
                top: ZONES.header.top,
                width: headerWidth,
                fontFamily: FONT_MAIN,
                fontSize: 28,
                fontWeight: '800',
                fontStyle: 'italic',
                fill: BRAND.secondary,
                textAlign: headerAlign,
                selectable: true,
                layerName: 'Header',
            }));
        }

        // ── Title — auto-sizing based on length ──
        if (slide.content.title) {
            const upperTitle = slide.content.title.toUpperCase();
            // Auto-fit font size: shorter titles = larger
            let titleFontSize;
            if (upperTitle.length <= 25) titleFontSize = 56;
            else if (upperTitle.length <= 45) titleFontSize = 48;
            else if (upperTitle.length <= 65) titleFontSize = 42;
            else titleFontSize = 36;

            objects.push(new fabric.Textbox(upperTitle, {
                left: headerLeft,
                top: ZONES.title.top,
                width: headerWidth,
                fontFamily: FONT_MAIN,
                fontSize: titleFontSize,
                fontWeight: '300',
                fontStyle: 'italic',
                fill: BRAND.secondary,
                textAlign: headerAlign,
                lineHeight: 1.15,
                selectable: true,
                layerName: 'Titel',
            }));
        }

        // ── Blokken ──
        if (hasBlokken) {
            const blokkenObjects = await this._createIntroBlokkenLayout(slide.content.blokken, layout);
            objects.push(...blokkenObjects);
        }

        // ── CTA "Klik hier" — per layout een passende positie + pijlhoek ──
        // De pijlpunt eindigt ALTIJD op LINKEDIN_NEXT_ANCHOR (paper rechterrand, midden)
        // De tekst staat aan de basis van de pijl, niet bij de tip
        const ctaPreset = this._getCtaPreset(layout, blokCount, slide);

        objects.push(new fabric.Textbox('Klik\nhier', {
            left: ctaPreset.textLeft,
            top: ctaPreset.textTop,
            width: 100,
            fontFamily: FONT_HAND,
            fontSize: 32,
            fontWeight: '700',
            fill: BRAND.primary,
            textAlign: 'center',
            lineHeight: 0.85,
            scaleX: 1.477,
            scaleY: 1.477,
            selectable: true,
            layerName: 'CTA',
        }));

        // Arrow — pijlpunt eindigt EXACT op LinkedIn next-anker (paper rand, midden)
        // CTA pijl is ALTIJD zwart voor herkenbaarheid (niet random)
        try {
            const arrowImg = await loadImageAsync('/assets/pijlen/korte pijl dikgedrukt links zwart.png');
            const TIP_NATIVE = { x: 15, y: 88 };
            const PNG_W = 375, PNG_H = 177;
            const FLIP_X = true;
            const SCALE = 0.213;
            const ANGLE = ctaPreset.arrowAngle;

            const tipLocalX = FLIP_X ? (PNG_W - TIP_NATIVE.x) : TIP_NATIVE.x;
            const tipLocalY = TIP_NATIVE.y;

            const props = this._positionAtTipAnchor(
                PNG_W, PNG_H, SCALE, SCALE, ANGLE, tipLocalX, tipLocalY, LINKEDIN_NEXT_ANCHOR
            );

            arrowImg.set({
                left: props.left,
                top: props.top,
                scaleX: SCALE,
                scaleY: SCALE,
                flipX: FLIP_X,
                angle: ANGLE,
                selectable: true,
                evented: true,
                layerName: 'CTA Pijl',
            });
            objects.push(arrowImg);
        } catch (e) {
            objects.push(new fabric.Text('\u2197', {
                left: layoutConfig.arrow.left,
                top: layoutConfig.arrow.top,
                fontSize: 40, scaleX: 1.576, scaleY: 1.576,
                fill: BRAND.primary, selectable: true, layerName: 'CTA Pijl',
            }));
        }

        // ── Lamp icon (alleen bij relevante onderwerpen) ─────────
        if (this.carouselMeta && this.carouselMeta.lampIcoon) {
            try {
                const lamp = await loadImageAsync('/assets/lamp-icon.svg');
                const lampScale = 90 / lamp.width;
                lamp.set({
                    left: 100,
                    top: 760,
                    scaleX: lampScale,
                    scaleY: lampScale,
                    angle: -8,
                    selectable: true,
                    evented: true,
                    layerName: 'Idee Lamp',
                });
                objects.push(lamp);
            } catch (e) {
                // ignore if not found
            }
        }

        // ── Decorations from preset (arrows, business graphics, frames, lines) ──
        if (slide.decorations && Array.isArray(slide.decorations)) {
            for (let i = 0; i < slide.decorations.length; i++) {
                let dec = slide.decorations[i];
                // Resolve anchor-based positioning if specified
                if (dec.anchor && this._currentBlokGeometry) {
                    dec = this._resolveAnchoredDecoration(dec, this._currentBlokGeometry);
                    if (!dec) continue;
                }
                const decObj = await this._buildDecoration(dec, i);
                if (decObj) objects.push(decObj);
            }
        }

        return objects;
    }

    /**
     * Pas exact-positie overrides toe op een slide.
     * Leest uit this._slideLayouts (geladen uit /assets/slideLayouts.json).
     * Per element kan worden overschreven: positie, scale, angle, flipX, fontSize, opacity, src (image url).
     * Speciale support: voor pijlen kan een "color" of "src" worden meegegeven om een andere afbeelding te tonen.
     */
    async _applyLayoutOverrides(objects, slideIndex) {
        if (!this._slideLayouts || !this.presetId) return;
        const presetEntry = this._slideLayouts.presets[this.presetId];
        if (!presetEntry || !presetEntry.slides) return;
        const slideEntry = presetEntry.slides.find(s => s.slideIndex === slideIndex);
        if (!slideEntry || !slideEntry.elements) return;

        const overrides = slideEntry.elements;

        // Helper: vind override entry via exacte naam OF via prefix-match
        // (zodat "Lange Pijl lichtoranje" in JSON matched met huidige "Lange Pijl blauw" object)
        const findOverride = (objName) => {
            if (overrides[objName]) return overrides[objName];
            // Voor pijlen: probeer prefix te matchen ("Pijl Dik X", "Pijl Dun X", "Lange Pijl X", "CTA Pijl")
            const PREFIXES = ['Pijl Dik', 'Pijl Dun', 'Lange Pijl', 'CTA Pijl', 'Frame', 'Lijn'];
            for (const prefix of PREFIXES) {
                if (objName.startsWith(prefix)) {
                    // Zoek een key in overrides die met dezelfde prefix begint
                    for (const key of Object.keys(overrides)) {
                        if (key.startsWith(prefix)) return overrides[key];
                    }
                }
            }
            return null;
        };

        for (const obj of objects) {
            const name = obj.layerName;
            if (!name) continue;
            const o = findOverride(name);
            if (!o) continue;

            // Optionele image-source swap (kleur wisselen voor pijlen, etc.)
            if ((o.src || o.color) && obj.type === 'image') {
                let newSrc = o.src;
                // Helper: bepaal asset URL op basis van layer name + nieuwe kleur
                if (!newSrc && o.color) {
                    newSrc = this._resolveColorSwap(name, o.color);
                }
                if (newSrc) {
                    try {
                        const img = await loadImageAsync(newSrc);
                        // Vervang de source van het bestaande Fabric Image object
                        obj.setElement(img.getElement());
                    } catch (e) {
                        console.warn('Kon kleur-swap niet laden:', newSrc);
                    }
                }
            }

            const props = {};
            if (o.left !== undefined) props.left = o.left;
            if (o.top !== undefined) props.top = o.top;
            if (o.scaleX !== undefined) props.scaleX = o.scaleX;
            if (o.scaleY !== undefined) props.scaleY = o.scaleY;
            if (o.angle !== undefined) props.angle = o.angle;
            if (o.flipX !== undefined) props.flipX = o.flipX;
            if (o.flipY !== undefined) props.flipY = o.flipY;
            if (o.fontSize !== undefined) props.fontSize = o.fontSize;
            if (o.opacity !== undefined) props.opacity = o.opacity;

            obj.set(props);
            if (obj.setCoords) obj.setCoords();
        }
    }

    /**
     * Bepaal nieuwe image URL op basis van layer-naam + gewenste kleur.
     * Werkt voor pijlen (Pijl Dik, Pijl Dun, Lange Pijl) en CTA Pijl.
     */
    _resolveColorSwap(layerName, color) {
        const c = color.toLowerCase();
        // Pijl Dik {color}
        if (/^pijl dik/i.test(layerName)) {
            return `/assets/pijlen/korte pijl dikgedrukt links ${c}.png`;
        }
        // Pijl Dun {color}
        if (/^pijl dun/i.test(layerName)) {
            return `/assets/pijlen/korte pijl ${c} links wijzend.png`;
        }
        // Lange Pijl {color}
        if (/^lange pijl/i.test(layerName)) {
            if (c === 'blauw') return `/assets/pijlen/lange pijl blauw 1.png`;
            return `/assets/pijlen/lange pijl ${c} rechts wijzend.png`;
        }
        // CTA Pijl — altijd korte dikke pijl, kleur naar keuze
        if (layerName === 'CTA Pijl') {
            return `/assets/pijlen/korte pijl dikgedrukt links ${c}.png`;
        }
        return null;
    }

    /**
     * Schat de bounding box van een decoratie op basis van type + native dimensies.
     * Wordt gebruikt door _getCtaPreset om CTA over decoraties te voorkomen.
     */
    _estimateDecorationBox(dec) {
        if (!dec || dec.x === undefined || dec.y === undefined) return null;

        // Native dimensies per asset type
        const NATIVE_DIMS = {
            'arrow-thick': { w: 375, h: 177 },
            'arrow-thin': { w: 372, h: 154 },
            'long-arrow': { w: 1900, h: 130 },
            'frame-square': { w: 470, h: 604 },
            'frame-portrait': { w: 857, h: 1131 },
            'frame-landscape': { w: 914, h: 604 },
            'line-h': { w: 814, h: 85 },
            'line-v': { w: 74, h: 1131 },
            'business-svg': { w: 600, h: 600 }, // approximation
        };
        const native = NATIVE_DIMS[dec.type] || { w: 400, h: 400 };
        const scaleX = dec.scaleX !== undefined ? dec.scaleX : (dec.scale || 0.3);
        const scaleY = dec.scaleY !== undefined ? dec.scaleY : (dec.scale || 0.3);

        return {
            x: dec.x,
            y: dec.y,
            w: native.w * scaleX,
            h: native.h * scaleY,
        };
    }

    /**
     * CTA placement — vaste positie met klassieke hoek.
     * Gevalideerd voor alle layouts: blokken zitten nooit boven y<492 in de rechter helft (x>855).
     * Pijl gaat van (855, 380) richting LinkedIn anchor (1000, 540), hoek -25°.
     *
     * Voor specifieke layouts waar blokken de tekst-zone bezetten (bottom-row 5 blokken)
     * worden alternatieve posities gebruikt.
     */
    _getCtaPreset(layout, blokCount, _slide) {
        // Default: rechts boven anker, klassieke hoek
        let textLeft = 855;
        let textTop = 380;
        let arrowAngle = -25;

        // Geen overrides nodig — alle layouts hebben rechts-bovenhoek vrij
        // Als specifieke layouts dit later wel nodig hebben, voeg hier toe:
        // if (layout === 'bottom-row' && blokCount >= 5) { ... }

        return { textLeft, textTop, arrowAngle };
    }

    /**
     * Compute left/top for an image so that a specific point on the image
     * (tipLocalX, tipLocalY in original PNG coords) lands EXACTLY on `anchor`
     * after applying scaleX, scaleY, angle (in degrees) and flipX.
     *
     * Fabric.js rotates around the object center by default with originX/Y='left'/'top'.
     * We compute where the tip would be relative to center, rotate it, and back-solve left/top.
     */
    _positionAtTipAnchor(pngW, pngH, scaleX, scaleY, angleDeg, tipLocalX, tipLocalY, anchor) {
        // Object dimensions on canvas
        const w = pngW * scaleX;
        const h = pngH * scaleY;

        // Tip in object's local frame (relative to top-left)
        const tipObjX = tipLocalX * scaleX;
        const tipObjY = tipLocalY * scaleY;

        // Center of object in local frame
        const cx = w / 2;
        const cy = h / 2;

        // Vector from center to tip (local frame)
        const dx = tipObjX - cx;
        const dy = tipObjY - cy;

        // Apply rotation (Fabric rotates clockwise positive)
        const rad = angleDeg * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rotatedDx = dx * cos - dy * sin;
        const rotatedDy = dx * sin + dy * cos;

        // Object center should be at (anchor - rotatedDelta)
        const targetCenterX = anchor.x - rotatedDx;
        const targetCenterY = anchor.y - rotatedDy;

        // left/top is top-left corner = center - half size
        return {
            left: targetCenterX - w / 2,
            top: targetCenterY - h / 2,
        };
    }

    /**
     * Returns geometry of the blok grid for the given layout + blok count.
     * Returns: { bloks: [{x,y,w,h}], gridLeft, gridTop, gridRight, gridBottom, gapH (between cols), gapV (between rows) }
     * This MUST mirror what _createIntroBlokkenLayout actually places.
     */
    _getBlokGeometry(layout, count) {
        const SLIDE = SLIDE_SIZE;
        const contentMidY = (ZONES.content.top + ZONES.content.bottom) / 2;

        switch (layout) {
            case 'sidebar': {
                const blokW = 220, blokH = 150, gap = 12;
                const x = (SLIDE - blokW) / 2; // horizontaal gecentreerd
                const totalH = count * blokH + (count - 1) * gap;
                const startY = contentMidY - totalH / 2;
                const bloks = [];
                for (let i = 0; i < count; i++) {
                    bloks.push({ x, y: startY + i * (blokH + gap), w: blokW, h: blokH });
                }
                return this._geomFromBloks(bloks);
            }
            case 'hero': {
                const heroW = 320, heroH = 228;
                const heroX = (SLIDE - heroW) / 2;
                const smallW = 160, smallH = 114, smallGap = 18;
                const smallCount = Math.max(0, count - 1);
                const totalH = heroH + (smallCount > 0 ? 30 + smallH : 0);
                const startY = contentMidY - totalH / 2;
                const bloks = [{ x: heroX, y: startY, w: heroW, h: heroH }];
                if (smallCount > 0) {
                    const totalSmallW = smallCount * smallW + (smallCount - 1) * smallGap;
                    const smallStartX = (SLIDE - totalSmallW) / 2;
                    const smallY = startY + heroH + 30;
                    for (let i = 1; i < count; i++) {
                        const x = smallStartX + (i - 1) * (smallW + smallGap);
                        bloks.push({ x, y: smallY, w: smallW, h: smallH });
                    }
                }
                return this._geomFromBloks(bloks);
            }
            case 'diagonal': {
                const blokW = 220, blokH = 156;
                const maxX = SLIDE - blokW - 80;
                const maxY = ZONES.content.bottom - blokH;
                const minX = 80;
                const minY = ZONES.content.top;
                const stepX = count > 1 ? Math.min(160, (maxX - minX) / (count - 1)) : 0;
                const stepY = count > 1 ? Math.min(120, (maxY - minY) / (count - 1)) : 0;
                const totalSpanX = (count - 1) * stepX;
                const totalSpanY = (count - 1) * stepY;
                const startX = (SLIDE - totalSpanX - blokW) / 2;
                const startY = contentMidY - (totalSpanY + blokH) / 2;
                const bloks = [];
                for (let i = 0; i < count; i++) {
                    bloks.push({ x: startX + i * stepX, y: startY + i * stepY, w: blokW, h: blokH });
                }
                return this._geomFromBloks(bloks);
            }
            case 'bottom-row': {
                const gap = 18;
                const maxW = 880;
                const blokW = Math.min(210, (maxW - (count - 1) * gap) / count);
                const blokH = Math.round(blokW * 0.71);
                const totalW = count * blokW + (count - 1) * gap;
                const startX = (SLIDE - totalW) / 2;
                const y = ZONES.content.top + (ZONES.content.bottom - ZONES.content.top) * 0.55 - blokH / 2;
                const bloks = [];
                for (let i = 0; i < count; i++) {
                    bloks.push({ x: startX + i * (blokW + gap), y, w: blokW, h: blokH });
                }
                return this._geomFromBloks(bloks);
            }
            case 'pyramid': {
                const blokW = 250, blokH = 178, gap = 20, verticalGap = 30;
                const bloks = [];
                if (count === 3) {
                    const totalH = blokH * 2 + verticalGap;
                    const startY = contentMidY - totalH / 2;
                    bloks.push({ x: (SLIDE - blokW) / 2, y: startY, w: blokW, h: blokH });
                    const bottomX = (SLIDE - (2 * blokW + gap)) / 2;
                    for (let i = 1; i < 3; i++) bloks.push({ x: bottomX + (i - 1) * (blokW + gap), y: startY + blokH + verticalGap, w: blokW, h: blokH });
                } else if (count === 4) {
                    const smallW = 200, smallH = 142;
                    const totalH = blokH + verticalGap + smallH;
                    const startY = contentMidY - totalH / 2;
                    bloks.push({ x: (SLIDE - blokW) / 2, y: startY, w: blokW, h: blokH });
                    const bottomX = (SLIDE - (3 * smallW + 2 * gap)) / 2;
                    for (let i = 1; i < 4; i++) bloks.push({ x: bottomX + (i - 1) * (smallW + gap), y: startY + blokH + verticalGap, w: smallW, h: smallH });
                } else {
                    const totalW = count * blokW + (count - 1) * gap;
                    const startX = (SLIDE - totalW) / 2;
                    const startY = contentMidY - blokH / 2;
                    for (let i = 0; i < count; i++) bloks.push({ x: startX + i * (blokW + gap), y: startY, w: blokW, h: blokH });
                }
                return this._geomFromBloks(bloks);
            }
            case 'scattered': {
                const cTop = ZONES.content.top;
                const cBot = ZONES.content.bottom;
                const zoneH = cBot - cTop;
                const placements5 = [
                    { rx: 0.13, ry: 0.05, w: 230, h: 164 }, { rx: 0.50, ry: 0.02, w: 220, h: 156 },
                    { rx: 0.13, ry: 0.45, w: 220, h: 156 }, { rx: 0.45, ry: 0.45, w: 220, h: 156 },
                    { rx: 0.18, ry: 0.85, w: 210, h: 150 },
                ];
                const placements4 = [
                    { rx: 0.13, ry: 0.05, w: 240, h: 170 }, { rx: 0.50, ry: 0.02, w: 230, h: 164 },
                    { rx: 0.18, ry: 0.55, w: 230, h: 164 }, { rx: 0.50, ry: 0.55, w: 220, h: 156 },
                ];
                const pl = count >= 5 ? placements5 : placements4;
                const bloks = [];
                for (let i = 0; i < count; i++) {
                    const p = pl[i % pl.length];
                    bloks.push({ x: p.rx * SLIDE, y: cTop + p.ry * zoneH, w: p.w, h: p.h });
                }
                return this._geomFromBloks(bloks);
            }
            case 'stack': {
                const blokW = 220, blokH = 130, gap = 12, x = 130;
                const totalH = count * blokH + (count - 1) * gap;
                const startY = contentMidY - totalH / 2;
                const bloks = [];
                for (let i = 0; i < count; i++) bloks.push({ x, y: startY + i * (blokH + gap), w: blokW, h: blokH });
                return this._geomFromBloks(bloks);
            }
            case 'overlap': {
                const blokW = 220, blokH = 157, step = 156;
                const totalW = blokW + (count - 1) * step;
                const startX = (SLIDE - totalW) / 2;
                const y = contentMidY - blokH / 2;
                const bloks = [];
                for (let i = 0; i < count; i++) bloks.push({ x: startX + i * step, y, w: blokW, h: blokH });
                return this._geomFromBloks(bloks);
            }
            case 'grid':
            default: {
                if (count === 4) {
                    const blokW = 230, blokH = 164, gap = 20;
                    const gridW = 2 * blokW + gap;
                    const gridH = 2 * blokH + gap;
                    const startX = (SLIDE - gridW) / 2;
                    const startY = contentMidY - gridH / 2;
                    const bloks = [
                        { x: startX, y: startY, w: blokW, h: blokH },
                        { x: startX + blokW + gap, y: startY, w: blokW, h: blokH },
                        { x: startX, y: startY + blokH + gap, w: blokW, h: blokH },
                        { x: startX + blokW + gap, y: startY + blokH + gap, w: blokW, h: blokH },
                    ];
                    const geom = this._geomFromBloks(bloks);
                    geom.cols = 2;
                    geom.rows = 2;
                    geom.colGapX = startX + blokW + gap / 2;
                    geom.rowGapY = startY + blokH + gap / 2;
                    return geom;
                } else {
                    const blokW = 230, blokH = 164, gap = 20;
                    const totalWidth = count * blokW + (count - 1) * gap;
                    const startX = (SLIDE - totalWidth) / 2;
                    const startY = contentMidY - blokH / 2;
                    const bloks = [];
                    for (let i = 0; i < count; i++) bloks.push({ x: startX + i * (blokW + gap), y: startY, w: blokW, h: blokH });
                    return this._geomFromBloks(bloks);
                }
            }
        }
    }

    /** Helper: compute bounding box from list of bloks */
    _geomFromBloks(bloks) {
        if (bloks.length === 0) return { bloks: [], gridLeft: 0, gridTop: 0, gridRight: 0, gridBottom: 0 };
        let gridLeft = Infinity, gridTop = Infinity, gridRight = -Infinity, gridBottom = -Infinity;
        for (const b of bloks) {
            if (b.x < gridLeft) gridLeft = b.x;
            if (b.y < gridTop) gridTop = b.y;
            if (b.x + b.w > gridRight) gridRight = b.x + b.w;
            if (b.y + b.h > gridBottom) gridBottom = b.y + b.h;
        }
        return { bloks, gridLeft, gridTop, gridRight, gridBottom };
    }

    /**
     * Resolve anchor-based decoration position to absolute x/y/scale.
     * Anchor types:
     *   - "grid-divider-h": horizontale lijn tussen rij 1 en rij 2 (alleen voor 2x2 grid)
     *   - "grid-divider-v": verticale lijn tussen kol 1 en kol 2
     *   - "grid-frame": frame om alle blokken heen
     *   - "between-blokken-v": verticale lijn tussen 2 blokken (voor 2-blok layouts)
     */
    _resolveAnchoredDecoration(dec, geom) {
        if (!dec.anchor || !geom) return dec;
        const result = { ...dec };

        // Natural dimensions of decoration assets
        const LINE_H_W = 814, LINE_H_H = 85;
        const LINE_V_W = 74, LINE_V_H = 1131;
        const FRAME_SQ_W = 470, FRAME_SQ_H = 604;
        // Uniform line thickness on canvas (in pixels) — same for h and v
        const LINE_THICKNESS_PX = 32;

        switch (dec.anchor) {
            case 'grid-divider-h': {
                // Horizontale lijn op de gap tussen rijen, BUITEN de blokken
                if (geom.rowGapY === undefined) return null;
                const targetW = geom.gridRight - geom.gridLeft;
                const scaleX = targetW / LINE_H_W;
                // Vaste dikte-scale onafhankelijk van lengte
                const scaleY = LINE_THICKNESS_PX / LINE_H_H;
                const renderedH = LINE_H_H * scaleY;
                result.x = geom.gridLeft;
                result.y = geom.rowGapY - renderedH / 2;
                result.scaleX = scaleX;
                result.scaleY = scaleY;
                result.scale = undefined;
                break;
            }
            case 'grid-divider-v': {
                if (geom.colGapX === undefined) return null;
                const targetH = geom.gridBottom - geom.gridTop;
                const scaleY = targetH / LINE_V_H;
                // Vaste dikte-scale onafhankelijk van lengte
                const scaleX = LINE_THICKNESS_PX / LINE_V_W;
                const renderedW = LINE_V_W * scaleX;
                result.x = geom.colGapX - renderedW / 2;
                result.y = geom.gridTop;
                result.scaleX = scaleX;
                result.scaleY = scaleY;
                result.scale = undefined;
                break;
            }
            case 'grid-frame': {
                // Frame om alle blokken met padding
                const pad = 30;
                const targetW = (geom.gridRight - geom.gridLeft) + pad * 2;
                const targetH = (geom.gridBottom - geom.gridTop) + pad * 2;
                result.x = geom.gridLeft - pad;
                result.y = geom.gridTop - pad;
                result.scaleX = targetW / FRAME_SQ_W;
                result.scaleY = targetH / FRAME_SQ_H;
                result.scale = undefined;
                break;
            }
            case 'between-blokken-v': {
                if (!geom.bloks || geom.bloks.length < 2) return null;
                const b0 = geom.bloks[0], b1 = geom.bloks[1];
                const midX = (b0.x + b0.w + b1.x) / 2;
                const lineTop = Math.min(b0.y, b1.y) - 20;
                const lineBot = Math.max(b0.y + b0.h, b1.y + b1.h) + 20;
                const targetH = lineBot - lineTop;
                const scaleY = targetH / LINE_V_H;
                const scaleX = LINE_THICKNESS_PX / LINE_V_W;
                const renderedW = LINE_V_W * scaleX;
                result.x = midX - renderedW / 2;
                result.y = lineTop;
                result.scaleX = scaleX;
                result.scaleY = scaleY;
                result.scale = undefined;
                break;
            }
        }
        return result;
    }

    /**
     * Build a decoration element (arrow, business graphic, etc.).
     * Decoration types:
     *  - arrow-thick: dikke korte pijl in kleur (default left, kan flipX)
     *  - arrow-thin: dunne korte pijl
     *  - long-arrow: lange handgetekende pijl
     *  - business-svg: SVG uit assets/business
     */
    async _buildDecoration(dec, index) {
        let url;
        let layerName = `Decoratie ${index + 1}`;

        switch (dec.type) {
            case 'arrow-thick': {
                const THICK_COLORS = ['blauw', 'feloranje', 'lichtblauw', 'lichtoranje', 'wijnrood-bruin', 'zwart'];
                const color = dec.color || THICK_COLORS[Math.floor(Math.random() * THICK_COLORS.length)];
                url = `/assets/pijlen/korte pijl dikgedrukt links ${color}.png`;
                layerName = `Pijl Dik ${color}`;
                break;
            }
            case 'arrow-thin': {
                const THIN_COLORS = ['blauw', 'lichtoranje', 'grijs'];
                const color = dec.color || THIN_COLORS[Math.floor(Math.random() * THIN_COLORS.length)];
                url = `/assets/pijlen/korte pijl ${color} links wijzend.png`;
                layerName = `Pijl Dun ${color}`;
                break;
            }
            case 'long-arrow': {
                const LONG_COLORS = ['blauw', 'lichtoranje', 'grijs'];
                const color = dec.color || LONG_COLORS[Math.floor(Math.random() * LONG_COLORS.length)];
                if (color === 'blauw') {
                    url = `/assets/pijlen/lange pijl blauw 1.png`;
                } else {
                    url = `/assets/pijlen/lange pijl ${color} rechts wijzend.png`;
                }
                layerName = `Lange Pijl ${color}`;
                break;
            }
            case 'business-svg': {
                url = `/assets/business/${dec.asset}`;
                layerName = (dec.asset || 'svg').replace(/\.svg$/, '');
                break;
            }
            case 'frame-square': {
                url = '/assets/lijnen/frame van lijnen vierkant.png';
                layerName = 'Frame Vierkant';
                break;
            }
            case 'frame-portrait': {
                url = '/assets/lijnen/frame van lijnen rechthoekig staand.png';
                layerName = 'Frame Staand';
                break;
            }
            case 'frame-landscape': {
                url = '/assets/lijnen/frame van lijnen rechthoekig liggend.png';
                layerName = 'Frame Liggend';
                break;
            }
            case 'line-h': {
                url = '/assets/lijnen/lijn horizontaal grijs.png';
                layerName = 'Lijn Horizontaal';
                break;
            }
            case 'line-v': {
                url = '/assets/lijnen/lijn verticaal grijs.png';
                layerName = 'Lijn Verticaal';
                break;
            }
            default:
                return null;
        }

        try {
            const img = await loadImageAsync(url);
            const scaleX = dec.scaleX !== undefined ? dec.scaleX : (dec.scale !== undefined ? dec.scale : 0.3);
            const scaleY = dec.scaleY !== undefined ? dec.scaleY : (dec.scale !== undefined ? dec.scale : 0.3);
            img.set({
                left: dec.x || 100,
                top: dec.y || 100,
                scaleX,
                scaleY,
                angle: dec.angle || 0,
                flipX: !!dec.flipX,
                flipY: !!dec.flipY,
                selectable: true,
                evented: true,
                layerName,
            });
            return img;
        } catch (e) {
            console.warn('Kon decoratie niet laden:', url);
            return null;
        }
    }

    /**
     * Returns positioning config per layout type.
     * Each layout places header, title, CTA, arrow differently.
     */
    _getIntroLayoutConfig(layout, hasBlokken) {
        const cL = SAFE_AREA.left + 40;
        const cW = SAFE_AREA.right - SAFE_AREA.left - 80;

        const configs = {
            // ── Default grid (calibrated from export) ──
            'grid': {
                header: { left: 140, top: 110, width: 810 },
                title:  { left: 140, top: 170, width: 810, fontSize: 48 },
                cta:    { left: 849, top: 520 },
                arrow:  { left: 918, top: 500 },
            },
            // ── Sidebar (calibrated from export) ──
            'sidebar': {
                header: { left: 400, top: 120, width: 520, textAlign: 'left' },
                title:  { left: 400, top: 180, width: 520, fontSize: 44, textAlign: 'left' },
                cta:    { left: 849, top: 560 },
                arrow:  { left: 918, top: 540 },
            },
            // ── Hero (calibrated from export) ──
            'hero': {
                header: { left: 140, top: 110, width: 810 },
                title:  { left: 140, top: 560, width: 810, fontSize: 44 },
                cta:    { left: 849, top: 680 },
                arrow:  { left: 918, top: 660 },
            },
            // ── Diagonal ──
            'diagonal': {
                header: { left: 140, top: 110, width: 810 },
                title:  { left: 140, top: 170, width: 810, fontSize: 46 },
                cta:    { left: 849, top: 700 },
                arrow:  { left: 918, top: 680 },
            },
            // ── Bottom row (calibrated from export) ──
            'bottom-row': {
                header: { left: 140, top: 110, width: 810 },
                title:  { left: 140, top: 170, width: 810, fontSize: 52 },
                cta:    { left: 873, top: 593 },
                arrow:  { left: 918, top: 573 },
            },
            // ── Pyramid ──
            'pyramid': {
                header: { left: 140, top: 110, width: 810 },
                title:  { left: 140, top: 170, width: 810, fontSize: 46 },
                cta:    { left: 849, top: 700 },
                arrow:  { left: 918, top: 680 },
            },
            // ── Scattered ──
            'scattered': {
                header: { left: 140, top: 110, width: 810 },
                title:  { left: 140, top: 170, width: 810, fontSize: 46 },
                cta:    { left: 849, top: 700 },
                arrow:  { left: 918, top: 680 },
            },
            // ── Stack (calibrated from export) ──
            'stack': {
                header: { left: 380, top: 110, width: 540, textAlign: 'left' },
                title:  { left: 380, top: 170, width: 540, fontSize: 44, textAlign: 'left' },
                cta:    { left: 849, top: 560 },
                arrow:  { left: 918, top: 540 },
            },
            // ── Overlap ──
            'overlap': {
                header: { left: 140, top: 110, width: 810 },
                title:  { left: 140, top: 170, width: 810, fontSize: 46 },
                cta:    { left: 849, top: 620 },
                arrow:  { left: 918, top: 600 },
            },
        };

        // Fallback for no-blokken plain intro
        if (!hasBlokken) {
            return {
                header: { left: cL, top: 110, width: cW },
                title:  { left: cL, top: 220, width: cW, fontSize: 58 },
                cta:    { left: 849, top: 482 },
                arrow:  { left: 945, top: 422 },
            };
        }

        return configs[layout] || configs['grid'];
    }

    /**
     * Create intro blokken with the specified layout style.
     * Supports: grid, sidebar, hero, diagonal, bottom-row, pyramid, scattered, stack
     */
    async _createIntroBlokkenLayout(labels, layout) {
        const objects = [];
        const count = labels.length;
        // Multiple tint palettes — randomly picked per render for variety
        const PALETTES = [
            // Blauw gradient → oranje accent
            [[0,1.0], [0,0.8], [0,0.6], [2,0.8], [2,0.6]],
            // Afwisselend blauw/oranje donker-licht
            [[0,1.0], [2,0.7], [0,0.6], [2,1.0], [0,0.8]],
            // Oranje gradient → blauw accent
            [[2,1.0], [2,0.8], [2,0.6], [0,0.8], [0,0.6]],
            // Blauw dominant, oranje pop
            [[0,1.0], [0,0.7], [2,1.0], [0,0.6], [2,0.7]],
            // Oranje dominant, blauw pop
            [[2,1.0], [2,0.7], [0,1.0], [2,0.6], [0,0.7]],
            // Warm→cool gradient
            [[2,1.0], [2,0.7], [0,0.7], [0,1.0], [0,0.6]],
            // Cool→warm gradient
            [[0,1.0], [0,0.7], [2,0.7], [2,1.0], [2,0.6]],
        ];
        const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
        const colors = palette.map(t => t[0]);
        const tints = palette.map(t => t[1]);

        // Helper: bereken vertical center binnen content zone
        const contentMidY = (ZONES.content.top + ZONES.content.bottom) / 2;

        switch (layout) {

            // ── SIDEBAR: blokken verticaal links gestapeld, vertical centered ──
            case 'sidebar': {
                const blokW = 220;
                const blokH = 150;
                const gap = 12;
                const x = (SLIDE_SIZE - blokW) / 2; // horizontaal gecentreerd
                const totalH = count * blokH + (count - 1) * gap;
                const startY = contentMidY - totalH / 2;
                for (let i = 0; i < count; i++) {
                    const y = startY + i * (blokH + gap);
                    await this._placeIntroBlok(objects, labels[i], x, y, blokW, blokH, colors[i], i, i, 0, tints[i]);
                }
                break;
            }

            // ── HERO: 1 groot blok centraal boven, kleinere onder ──
            case 'hero': {
                const heroW = 320;
                const heroH = 228;
                const heroX = (SLIDE_SIZE - heroW) / 2;
                const smallW = 160;
                const smallH = 114;
                const smallGap = 18;
                const smallCount = Math.max(0, count - 1);
                const totalH = heroH + (smallCount > 0 ? 30 + smallH : 0);
                const startY = contentMidY - totalH / 2;

                // Hero blok bovenin
                await this._placeIntroBlok(objects, labels[0], heroX, startY, heroW, heroH, colors[0], 0, 0, 0, tints[0]);

                // Kleinere blokken onder, horizontaal gecentreerd
                if (smallCount > 0) {
                    const totalSmallW = smallCount * smallW + (smallCount - 1) * smallGap;
                    const smallStartX = (SLIDE_SIZE - totalSmallW) / 2;
                    const smallY = startY + heroH + 30;
                    for (let i = 1; i < count; i++) {
                        const x = smallStartX + (i - 1) * (smallW + smallGap);
                        await this._placeIntroBlok(objects, labels[i], x, smallY, smallW, smallH, colors[i], i, i, 0, tints[i]);
                    }
                }
                break;
            }

            // ── DIAGONAL: blokken trap-gewijs schuin, gecentreerd ──
            case 'diagonal': {
                const blokW = 220;
                const blokH = 156;
                // Bereken span: max breedte = 800, max hoogte = content zone
                const maxX = SLIDE_SIZE - blokW - 80;  // 80px marge rechts
                const maxY = ZONES.content.bottom - blokH;
                const minX = 80;
                const minY = ZONES.content.top;

                const stepX = count > 1 ? Math.min(160, (maxX - minX) / (count - 1)) : 0;
                const stepY = count > 1 ? Math.min(120, (maxY - minY) / (count - 1)) : 0;

                // Centreer de diagonaal binnen de content zone
                const totalSpanX = (count - 1) * stepX;
                const totalSpanY = (count - 1) * stepY;
                const startX = (SLIDE_SIZE - totalSpanX - blokW) / 2;
                const startY = contentMidY - (totalSpanY + blokH) / 2;

                for (let i = 0; i < count; i++) {
                    const x = startX + i * stepX;
                    const y = startY + i * stepY;
                    await this._placeIntroBlok(objects, labels[i], x, y, blokW, blokH, colors[i], i, i, 0, tints[i]);
                }
                break;
            }

            // ── BOTTOM ROW: blokken naast elkaar in onderste deel content zone ──
            case 'bottom-row': {
                const gap = 18;
                const maxW = 880;
                const blokW = Math.min(210, (maxW - (count - 1) * gap) / count);
                const blokH = Math.round(blokW * 0.71);
                const totalW = count * blokW + (count - 1) * gap;
                const startX = (SLIDE_SIZE - totalW) / 2;
                // Plaats in onderste 60% van content zone
                const y = ZONES.content.top + (ZONES.content.bottom - ZONES.content.top) * 0.55 - blokH / 2;
                for (let i = 0; i < count; i++) {
                    const x = startX + i * (blokW + gap);
                    await this._placeIntroBlok(objects, labels[i], x, y, blokW, blokH, colors[i], i, i, 0, tints[i]);
                }
                break;
            }

            // ── PYRAMID: 1 of 2 boven, rest eronder, alles gecentreerd ──
            case 'pyramid': {
                const blokW = 250;
                const blokH = 178;
                const gap = 20;
                const verticalGap = 30;

                if (count === 3) {
                    // 1 boven, 2 onder
                    const totalH = blokH * 2 + verticalGap;
                    const startY = contentMidY - totalH / 2;
                    const topX = (SLIDE_SIZE - blokW) / 2;
                    await this._placeIntroBlok(objects, labels[0], topX, startY, blokW, blokH, colors[0], 0, 0, 0, tints[0]);
                    const bottomW = 2 * blokW + gap;
                    const bottomX = (SLIDE_SIZE - bottomW) / 2;
                    for (let i = 1; i < 3; i++) {
                        await this._placeIntroBlok(objects, labels[i], bottomX + (i - 1) * (blokW + gap), startY + blokH + verticalGap, blokW, blokH, colors[i], i, i, 0, tints[i]);
                    }
                } else if (count === 4) {
                    // 1 groot boven, 3 kleiner onder
                    const smallW = 200;
                    const smallH = 142;
                    const totalH = blokH + verticalGap + smallH;
                    const startY = contentMidY - totalH / 2;
                    const topX = (SLIDE_SIZE - blokW) / 2;
                    await this._placeIntroBlok(objects, labels[0], topX, startY, blokW, blokH, colors[0], 0, 0, 0, tints[0]);
                    const bottomW = 3 * smallW + 2 * gap;
                    const bottomX = (SLIDE_SIZE - bottomW) / 2;
                    for (let i = 1; i < 4; i++) {
                        await this._placeIntroBlok(objects, labels[i], bottomX + (i - 1) * (smallW + gap), startY + blokH + verticalGap, smallW, smallH, colors[i], i, i, 0, tints[i]);
                    }
                } else {
                    // 2 of meer naast elkaar, gecentreerd
                    const totalW = count * blokW + (count - 1) * gap;
                    const startX = (SLIDE_SIZE - totalW) / 2;
                    const startY = contentMidY - blokH / 2;
                    for (let i = 0; i < count; i++) {
                        await this._placeIntroBlok(objects, labels[i], startX + i * (blokW + gap), startY, blokW, blokH, colors[i], i, i, 0, tints[i]);
                    }
                }
                break;
            }

            // ── SCATTERED: organische posities binnen content zone, gecentreerd ──
            case 'scattered': {
                // Posities zijn relatief tot content zone bounds — geen overlap
                const cTop = ZONES.content.top;
                const cBot = ZONES.content.bottom;
                const cMid = contentMidY;

                const placements5 = [
                    { rx: 0.13, ry: 0.05, w: 230, h: 164, rot: -3 },
                    { rx: 0.50, ry: 0.02, w: 220, h: 156, rot: 2 },
                    { rx: 0.13, ry: 0.45, w: 220, h: 156, rot: 3 },
                    { rx: 0.45, ry: 0.45, w: 220, h: 156, rot: -2 },
                    { rx: 0.18, ry: 0.85, w: 210, h: 150, rot: 1 },
                ];
                const placements4 = [
                    { rx: 0.13, ry: 0.05, w: 240, h: 170, rot: -4 },
                    { rx: 0.50, ry: 0.02, w: 230, h: 164, rot: 3 },
                    { rx: 0.18, ry: 0.55, w: 230, h: 164, rot: 2 },
                    { rx: 0.50, ry: 0.55, w: 220, h: 156, rot: -3 },
                ];
                const pl = count >= 5 ? placements5 : placements4;
                const zoneH = cBot - cTop;
                for (let i = 0; i < count; i++) {
                    const p = pl[i % pl.length];
                    const x = p.rx * SLIDE_SIZE;
                    const y = cTop + p.ry * zoneH;
                    await this._placeIntroBlok(objects, labels[i], x, y, p.w, p.h, colors[i], i, i, p.rot, tints[i]);
                }
                break;
            }

            // ── STACK: verticaal onder elkaar links, vertical centered ──
            case 'stack': {
                const blokW = 220;
                const blokH = 130;
                const gap = 12;
                const x = 130;
                const totalH = count * blokH + (count - 1) * gap;
                const startY = contentMidY - totalH / 2;
                for (let i = 0; i < count; i++) {
                    const y = startY + i * (blokH + gap);
                    await this._placeIntroBlok(objects, labels[i], x, y, blokW, blokH, colors[i], i, i, 0, tints[i]);
                }
                break;
            }

            // ── OVERLAP: horizontale ketting, gecentreerd, vertical centered ──
            case 'overlap': {
                const overlapColors = colors;
                const overlapTints = tints;
                const blokW = 220;
                const blokH = 157;
                const step = 156;
                const totalW = blokW + (count - 1) * step;
                const startX = (SLIDE_SIZE - totalW) / 2;
                const y = contentMidY - blokH / 2;
                for (let i = 0; i < count; i++) {
                    const x = startX + i * step;
                    const ci = overlapColors[i % overlapColors.length];
                    const ot = overlapTints[i % overlapTints.length] * 0.9;
                    await this._placeIntroBlok(objects, labels[i], x, y, blokW, blokH, ci, i, i, 0, ot);
                }
                break;
            }

            // ── DEFAULT GRID: 2x2 of horizontal row ──
            case 'grid':
            default: {
                if (count === 4) {
                    // 2x2 grid — horizontaal en verticaal gecentreerd in content zone
                    const blokW = 230;
                    const blokH = 164;
                    const gap = 20;
                    const gridW = 2 * blokW + gap;
                    const gridH = 2 * blokH + gap;
                    const startX = (SLIDE_SIZE - gridW) / 2;
                    const contentMid = (ZONES.content.top + ZONES.content.bottom) / 2;
                    const startY = contentMid - gridH / 2;
                    const grid = [
                        { x: startX,              y: startY },
                        { x: startX + blokW + gap, y: startY },
                        { x: startX,              y: startY + blokH + gap },
                        { x: startX + blokW + gap, y: startY + blokH + gap },
                    ];
                    for (let i = 0; i < 4; i++) {
                        await this._placeIntroBlok(objects, labels[i], grid[i].x, grid[i].y, blokW, blokH, colors[i], i, i, 0, tints[i]);
                    }
                } else {
                    // Horizontale rij — gecentreerd
                    const blokW = 230;
                    const blokH = 164;
                    const gap = 20;
                    const totalWidth = count * blokW + (count - 1) * gap;
                    const startX = (SLIDE_SIZE - totalWidth) / 2;
                    const contentMid = (ZONES.content.top + ZONES.content.bottom) / 2;
                    const startY = contentMid - blokH / 2;
                    for (let i = 0; i < count; i++) {
                        const x = startX + i * (blokW + gap);
                        await this._placeIntroBlok(objects, labels[i], x, startY, blokW, blokH, colors[i], i, i, 0, tints[i]);
                    }
                }
                break;
            }
        }

        return objects;
    }

    /**
     * Place a single intro blok (image + text label centered).
     * Text auto-shrinks for longer words. Optional rotation.
     */
    async _placeIntroBlok(objects, label, x, y, targetW, targetH, colorIndex, variant, index, rotation, opacity) {
        // Track the actual rendered dimensions for centering
        let renderedW = targetW;
        let renderedH = targetH;
        const blokOpacity = opacity || 1;

        try {
            const img = await loadImageAsync(getBlokImagePath(colorIndex, variant));
            const scaleX = targetW / img.width;
            const scaleY = targetH / img.height;
            const scale = Math.min(scaleX, scaleY);
            renderedW = img.width * scale;
            renderedH = img.height * scale;
            img.set({
                left: x,
                top: y,
                scaleX: scale,
                scaleY: scale,
                angle: rotation || 0,
                opacity: blokOpacity,
                selectable: true,
                evented: true,
                layerName: `Intro Blok ${index + 1}`,
            });
            objects.push(img);
        } catch (e) {
            const fallbackColors = [BRAND.secondary, BRAND.accent, BRAND.grey3, BRAND.secondary];
            objects.push(new fabric.Rect({
                left: x,
                top: y,
                width: targetW,
                height: targetH,
                rx: 20,
                ry: 20,
                fill: fallbackColors[colorIndex % fallbackColors.length],
                angle: rotation || 0,
                selectable: true,
                layerName: `Intro Blok ${index + 1}`,
            }));
        }

        // Auto-size font based on label length AND blok size
        let fontSize = 24;
        if (label.length > 10) fontSize = 16;
        else if (label.length > 7) fontSize = 18;
        else if (label.length > 5) fontSize = 20;
        // Scale font with blok size
        if (renderedW >= 250) fontSize += 4;
        else if (renderedW <= 130) fontSize -= 2;
        else if (renderedW <= 100) fontSize -= 4;

        // Center text exactly on the actual rendered blok dimensions
        const centerX = x + renderedW / 2;
        const centerY = y + renderedH / 2;

        objects.push(new fabric.Text(label, {
            left: centerX,
            top: centerY,
            fontSize: fontSize,
            fontFamily: FONT_MAIN,
            fontWeight: '700',
            fontStyle: 'italic',
            fill: '#FFFFFF',
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            angle: rotation || 0,
            selectable: true,
            evented: true,
            layerName: `Intro Blok ${index + 1} Tekst`,
        }));
    }

    async _buildContentContent(slide) {
        const objects = [];
        const contentLeft = SAFE_AREA.left + 40;
        const contentWidth = SAFE_AREA.right - SAFE_AREA.left - 80;

        // Body (light) + title (bold) in one textbox with mixed weights.
        // Matches the PDF style: light body text then bold emphasis line.
        const bodyText = (slide.content.body || '').replace(/\*([^*]+)\*/g, '$1');
        const titleText = slide.content.title || '';

        let combined = '';
        let boldStart = -1;
        let boldEnd = -1;

        if (bodyText && titleText) {
            combined = bodyText + '\n\n' + titleText;
            boldStart = bodyText.length + 2; // after \n\n
            boldEnd = combined.length;
        } else if (bodyText) {
            combined = bodyText;
        } else if (titleText) {
            combined = titleText;
            boldStart = 0;
            boldEnd = titleText.length;
        }

        if (combined) {
            const textTop = SAFE_AREA.top + 70;
            const maxTextHeight = SAFE_AREA.bottom - textTop - 60; // leave room for footer

            const textbox = new fabric.Textbox(combined, {
                left: contentLeft,
                top: textTop,
                width: contentWidth,
                fontFamily: FONT_MAIN,
                fontSize: 42,
                fontWeight: '300',
                fontStyle: 'italic',
                fill: BRAND.secondary,
                textAlign: 'center',
                lineHeight: 1.3,
                selectable: true,
                layerName: 'Tekst',
            });

            // Apply bold weight and auto-fit within available height
            autoFitTextbox(textbox, maxTextHeight, boldStart, boldEnd, 42, 52);

            objects.push(textbox);
        }

        // Decorative blokken (if AI provided them)
        if (slide.content.blokken && Array.isArray(slide.content.blokken) && slide.content.blokken.length > 0) {
            // Position blokken between text bottom and footer area
            const blokY = SAFE_AREA.bottom - 120;
            const blokObjects = await this._createBlokkenRow(slide.content.blokken, blokY);
            objects.push(...blokObjects);
        }

        // Footer citation (Caveat, bottom-left)
        if (slide.content.footer && !/business\s*verbeteraars/i.test(slide.content.footer)) {
            objects.push(new fabric.Textbox(slide.content.footer, {
                left: SAFE_AREA.left + 40,
                top: SAFE_AREA.bottom - 50,
                width: 400,
                fontFamily: FONT_HAND,
                fontSize: 26,
                fontWeight: '700',
                fill: BRAND.secondary,
                textAlign: 'center',
                lineHeight: 1.2,
                selectable: true,
                layerName: 'Bron / Footer',
            }));
        }

        return objects;
    }

    async _buildEngagementContent(slide) {
        const objects = [];
        const contentLeft = SAFE_AREA.left + 40;
        const contentWidth = SAFE_AREA.right - SAFE_AREA.left - 80;

        // Same mixed-weight text as content slides
        const bodyText = (slide.content.body || '').replace(/\*([^*]+)\*/g, '$1');
        const titleText = slide.content.title || '';

        let combined = '';
        let boldStart = -1;
        let boldEnd = -1;

        if (bodyText && titleText) {
            combined = bodyText + '\n\n' + titleText;
            boldStart = bodyText.length + 2;
            boldEnd = combined.length;
        } else if (bodyText) {
            combined = bodyText;
        } else if (titleText) {
            combined = titleText;
            boldStart = 0;
            boldEnd = titleText.length;
        }

        if (combined) {
            const textTop = SAFE_AREA.top + 70;
            const maxTextHeight = SAFE_AREA.bottom - textTop - 100; // room for Like & comment

            const textbox = new fabric.Textbox(combined, {
                left: contentLeft,
                top: textTop,
                width: contentWidth,
                fontFamily: FONT_MAIN,
                fontSize: 42,
                fontWeight: '300',
                fontStyle: 'italic',
                fill: BRAND.secondary,
                textAlign: 'center',
                lineHeight: 1.3,
                selectable: true,
                layerName: 'Tekst',
            });

            autoFitTextbox(textbox, maxTextHeight, boldStart, boldEnd, 42, 52);

            objects.push(textbox);
        }

        // "Like & comment" bottom-left (calibrated)
        objects.push(new fabric.Textbox('Like &\ncomment', {
            left: 119,
            top: 854,
            width: 180,
            fontFamily: FONT_HAND,
            fontSize: 40,
            fontWeight: '700',
            fill: BRAND.primary,
            textAlign: 'right',
            lineHeight: 1.1,
            selectable: true,
            layerName: 'Like & Comment',
        }));

        // Arrow down — pijlpunt eindigt EXACT op de "Like & comment" tekst (rechtsboven van de tekst)
        try {
            const engArrow = await loadImageAsync('/assets/pijlen/korte pijl dikgedrukt links zwart.png');
            const TIP_NATIVE = { x: 15, y: 88 };
            const PNG_W = 375, PNG_H = 177;
            const SCALE = 0.18;
            const ANGLE = -90; // wijst naar beneden (na geen flip → tip wijst nu omlaag)
            // Tip moet eindigen ongeveer bij top-rechts van "Like & comment" tekst (rond 295, 850)
            const TIP_ANCHOR = { x: 295, y: 850 };

            const tipLocalX = TIP_NATIVE.x; // geen flip
            const tipLocalY = TIP_NATIVE.y;

            const props = this._positionAtTipAnchor(
                PNG_W, PNG_H, SCALE, SCALE, ANGLE, tipLocalX, tipLocalY, TIP_ANCHOR
            );

            engArrow.set({
                left: props.left,
                top: props.top,
                scaleX: SCALE,
                scaleY: SCALE,
                angle: ANGLE,
                selectable: true,
                evented: true,
                layerName: 'Pijl',
            });
            objects.push(engArrow);
        } catch (e) {
            objects.push(new fabric.Text('\u2193', {
                left: 312,
                top: 834,
                fontSize: 55,
                scaleX: 1.815,
                scaleY: 1.815,
                fontWeight: '700',
                fill: BRAND.primary,
                selectable: true,
                layerName: 'Pijl',
            }));
        }

        return objects;
    }

    _buildOutroContent(slide) {
        const objects = [];
        const contentLeft = SAFE_AREA.left + 40;
        const contentWidth = SAFE_AREA.right - SAFE_AREA.left - 80;

        // "DANKJEWEL!" — big, upper area
        objects.push(new fabric.Textbox('DANKJEWEL!', {
            left: contentLeft,
            top: 220,
            width: contentWidth,
            fontFamily: FONT_MAIN,
            fontSize: 60,
            fontWeight: '800',
            fontStyle: 'italic',
            fill: BRAND.secondary,
            textAlign: 'center',
            lineHeight: 1.1,
            selectable: true,
            layerName: 'Dankjewel Tekst',
        }));

        // "MEER VRAGEN?" — below
        objects.push(new fabric.Textbox('MEER VRAGEN?', {
            left: contentLeft,
            top: 410,
            width: contentWidth,
            fontFamily: FONT_MAIN,
            fontSize: 54,
            fontWeight: '800',
            fontStyle: 'italic',
            fill: BRAND.secondary,
            textAlign: 'center',
            lineHeight: 1.2,
            selectable: true,
            layerName: 'Meer Vragen Tekst',
        }));

        // Website URL
        objects.push(new fabric.Textbox('www.businessverbeteraars.nl', {
            left: contentLeft,
            top: 530,
            width: contentWidth,
            fontFamily: FONT_MAIN,
            fontSize: 30,
            fontWeight: '900',
            fontStyle: 'italic',
            fill: BRAND.secondary,
            textAlign: 'center',
            selectable: true,
            layerName: 'Website URL',
        }));

        // "Like & comment" bottom-left (calibrated)
        objects.push(new fabric.Textbox('Like &\ncomment', {
            left: 119,
            top: 854,
            width: 180,
            fontFamily: FONT_HAND,
            fontSize: 40,
            fontWeight: '700',
            fill: BRAND.primary,
            textAlign: 'right',
            lineHeight: 1.1,
            selectable: true,
            layerName: 'Like & Comment',
        }));

        // Big arrow down (calibrated)
        objects.push(new fabric.Text('\u2193', {
            left: 312,
            top: 834,
            fontSize: 55,
            scaleX: 1.815,
            scaleY: 1.815,
            fontWeight: '700',
            fill: BRAND.primary,
            selectable: true,
            layerName: 'Pijl',
        }));

        return objects;
    }

    // ── Slide Management ────────────────────────────────────────────

    _saveCurrentSlide() {
        if (this.activeSlideIndex >= 0 && this.activeSlideIndex < this.slideObjects.length) {
            this.slideObjects[this.activeSlideIndex] = this.fabricCanvas.getObjects().slice();
        }
    }

    /**
     * Exporteer alle slide objects per slide als serializeerbare JSON.
     * Wordt door auto-save gebruikt om browser-state te bewaren.
     */
    exportAllSlideObjects() {
        this._saveCurrentSlide();
        const result = [];
        for (let s = 0; s < this.slideObjects.length; s++) {
            const objs = this.slideObjects[s] || [];
            const exported = objs.map(obj => obj.toJSON(['layerName', 'layerLocked', 'layerVisible']));
            result.push(exported);
        }
        return result;
    }

    /**
     * Importeer eerder geëxporteerde slide objects en plaats ze op de canvas.
     * Wordt gebruikt om een opgeslagen project te herstellen.
     */
    async importAllSlideObjects(serializedSlides) {
        if (!Array.isArray(serializedSlides)) return;
        this.suppressHistory = true;

        for (let s = 0; s < serializedSlides.length && s < this.slideObjects.length; s++) {
            const serializedObjs = serializedSlides[s];
            const restored = [];
            for (const objJSON of serializedObjs) {
                try {
                    const obj = await new Promise((resolve) => {
                        fabric.util.enlivenObjects([objJSON], (objs) => resolve(objs[0]));
                    });
                    if (obj) restored.push(obj);
                } catch (e) {
                    console.warn('Kon object niet herstellen:', e);
                }
            }
            if (restored.length > 0) {
                this.slideObjects[s] = restored;
            }
        }

        // Re-render huidige slide
        if (this.activeSlideIndex >= 0) {
            const idx = this.activeSlideIndex;
            this.activeSlideIndex = -1;
            this.switchToSlide(idx);
        }
        this.suppressHistory = false;
    }

    // ── Layer Panel ─────────────────────────────────────────────────

    _renderLayerPanel() {
        if (!this.layerPanelEl) return;

        const objects = this.fabricCanvas.getObjects().slice().reverse();
        const activeObj = this.fabricCanvas.getActiveObject();

        let html = '';
        objects.forEach((obj, reverseIdx) => {
            const realIdx = objects.length - 1 - reverseIdx;
            const name = obj.layerName || `Element ${realIdx + 1}`;
            const isActive = obj === activeObj;
            const isLocked = obj.layerLocked || !obj.selectable;
            const isVisible = obj.visible !== false;

            html += `
                <div class="layer-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}"
                     data-object-index="${realIdx}">
                    <button class="layer-visibility" data-action="toggle-visible" data-index="${realIdx}"
                            title="${isVisible ? 'Verbergen' : 'Tonen'}">
                        ${isVisible ? '&#128065;' : '&#128064;'}
                    </button>
                    <span class="layer-name" data-action="select" data-index="${realIdx}">${name}</span>
                    <button class="layer-lock" data-action="toggle-lock" data-index="${realIdx}"
                            title="${isLocked ? 'Ontgrendelen' : 'Vergrendelen'}">
                        ${isLocked ? '&#128274;' : '&#128275;'}
                    </button>
                </div>
            `;
        });

        this.layerPanelEl.innerHTML = html;

        this.layerPanelEl.onclick = (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.index, 10);
            const allObjects = this.fabricCanvas.getObjects();
            const obj = allObjects[idx];
            if (!obj) return;

            switch (action) {
                case 'select':
                    if (!obj.layerLocked && obj.selectable) {
                        this.fabricCanvas.setActiveObject(obj);
                        this.fabricCanvas.renderAll();
                    }
                    break;
                case 'toggle-visible':
                    obj.visible = !obj.visible;
                    this.fabricCanvas.renderAll();
                    this._renderLayerPanel();
                    break;
                case 'toggle-lock':
                    if (obj.layerLocked) {
                        obj.layerLocked = false;
                        obj.selectable = true;
                        obj.evented = true;
                    } else {
                        obj.layerLocked = true;
                        obj.selectable = false;
                        obj.evented = false;
                        if (this.fabricCanvas.getActiveObject() === obj) {
                            this.fabricCanvas.discardActiveObject();
                        }
                    }
                    this.fabricCanvas.renderAll();
                    this._renderLayerPanel();
                    break;
            }
        };
    }

    _syncLayerSelection() {
        this._renderLayerPanel();
    }

    /**
     * Clamp an object so it stays within SAFE_AREA bounds.
     * Skips non-content layers like Papier.
     */
    _clampToSafeArea(obj) {
        if (!obj || obj.layerLocked) return;

        // Use lightweight position check instead of expensive getBoundingRect
        const w = (obj.width || 0) * (obj.scaleX || 1);
        const h = (obj.height || 0) * (obj.scaleY || 1);

        // Skip clamping for objects larger than safe area (blokken, paper)
        if (w > (SAFE_AREA.right - SAFE_AREA.left) || h > (SAFE_AREA.bottom - SAFE_AREA.top)) return;

        let left = obj.left;
        let top = obj.top;

        // Account for originX/originY center
        const offX = obj.originX === 'center' ? w / 2 : 0;
        const offY = obj.originY === 'center' ? h / 2 : 0;

        const objLeft = left - offX;
        const objTop = top - offY;

        if (objLeft < SAFE_AREA.left) left = SAFE_AREA.left + offX;
        if (objTop < SAFE_AREA.top) top = SAFE_AREA.top + offY;
        if (objLeft + w > SAFE_AREA.right) left = SAFE_AREA.right - w + offX;
        if (objTop + h > SAFE_AREA.bottom) top = SAFE_AREA.bottom - h + offY;

        obj.set({ left, top });
    }

    // ── Slide Tabs ──────────────────────────────────────────────────

    _renderSlideTabs() {
        if (!this.slidesTabsEl) return;

        let html = '';
        this.slidesData.forEach((slide, i) => {
            const isActive = i === this.activeSlideIndex;
            const typeLabel = slide.type.charAt(0).toUpperCase() + slide.type.slice(1);
            html += `
                <button class="slide-tab ${isActive ? 'active' : ''}"
                        data-slide-index="${i}"
                        title="Slide ${i + 1}: ${typeLabel}">
                    <span class="slide-tab-num">${i + 1}</span>
                    <span class="slide-tab-type">${typeLabel}</span>
                </button>
            `;
        });

        this.slidesTabsEl.innerHTML = html;

        this.slidesTabsEl.onclick = (e) => {
            const tab = e.target.closest('[data-slide-index]');
            if (tab) {
                this.switchToSlide(parseInt(tab.dataset.slideIndex, 10));
            }
        };
    }

    // ── Canvas Scaling ──────────────────────────────────────────────

    _updateCanvasScale() {
        const wrapper = document.getElementById('canvasWrapper');
        if (!wrapper) return;

        const available = wrapper.clientWidth;
        if (available <= 0) {
            requestAnimationFrame(() => this._updateCanvasScale());
            return;
        }

        const scale = Math.min(available / SLIDE_SIZE, 1);

        const container = document.getElementById('canvasScaleContainer');
        if (container) {
            container.style.transform = `scale(${scale})`;
            container.style.transformOrigin = 'top left';
            container.style.width = SLIDE_SIZE + 'px';
            container.style.height = SLIDE_SIZE + 'px';
        }

        wrapper.style.height = Math.round(SLIDE_SIZE * scale) + 'px';
    }
}

// ── Global Instance ─────────────────────────────────────────────────
let editor = null;

function initCanvasEditor() {
    editor = new SlideCanvasEditor('slideCanvas', 'layerPanel', 'slidesTabs');
    return editor;
}

function exportPositions() {
    if (editor) return editor.exportPositions();
    console.warn('Editor not initialized');
}
