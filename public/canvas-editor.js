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

const FONT_MAIN = 'Outfit';
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
// Text/content elements are clamped to this region so they never
// overlap the paper edges or the bottom logo area.
const SAFE_AREA = {
    left: 100,
    top: 90,
    right: 990,   // paper right edge minus margin
    bottom: 830,  // above logo zone
};

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
        await document.fonts.load('300 42px "Outfit"');
        await document.fonts.load('800 52px "Outfit"');
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

        this.fabricCanvas.on('selection:created', () => this._syncLayerSelection());
        this.fabricCanvas.on('selection:updated', () => this._syncLayerSelection());
        this.fabricCanvas.on('selection:cleared', () => this._syncLayerSelection());

        // Clamp movable objects within the safe area (paper margins)
        this.fabricCanvas.on('object:moving', (e) => this._clampToSafeArea(e.target));
        this.fabricCanvas.on('object:scaling', (e) => this._clampToSafeArea(e.target));

        this._updateCanvasScale();
        window.addEventListener('resize', () => this._updateCanvasScale());
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

        // Reset state so switchToSlide doesn't skip index 0
        this.activeSlideIndex = -1;
        this.slidesData = carouselData.slides;
        this.slideObjects = [];

        for (let i = 0; i < this.slidesData.length; i++) {
            const objects = await this._buildSlideObjects(this.slidesData[i], i);
            this.slideObjects.push(objects);
        }

        this._renderSlideTabs();
        this.switchToSlide(0);
        requestAnimationFrame(() => this._updateCanvasScale());
    }

    switchToSlide(index) {
        if (index === this.activeSlideIndex) return;
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
                contentObjects = this._buildIntroContent(slide);
                break;
            case 'content':
                contentObjects = await this._buildContentContent(slide);
                break;
            case 'engagement':
                contentObjects = this._buildEngagementContent(slide);
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

            // Text label centered on the blok
            objects.push(new fabric.Text(labels[i], {
                left: x + blokSize / 2,
                top: centerY,
                fontSize: 26,
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

    _buildIntroContent(slide) {
        const objects = [];
        const contentLeft = SAFE_AREA.left + 40;
        const contentWidth = SAFE_AREA.right - SAFE_AREA.left - 80;

        // Header / Subtitle (Caveat, top center — "~~~ DE VRAAG VAN VANDAAG ~~~")
        if (slide.content.subtitle) {
            objects.push(new fabric.Textbox(slide.content.subtitle, {
                left: contentLeft,
                top: 110,
                width: contentWidth,
                fontFamily: FONT_HAND,
                fontSize: 28,
                fontWeight: '700',
                fill: BRAND.secondary,
                textAlign: 'center',
                selectable: true,
                layerName: 'Header',
            }));
        }

        // Title (big, bold, italic, uppercase — takes up large center area)
        if (slide.content.title) {
            objects.push(new fabric.Textbox(slide.content.title.toUpperCase(), {
                left: contentLeft,
                top: 220,
                width: contentWidth,
                fontFamily: FONT_MAIN,
                fontSize: 58,
                fontWeight: '800',
                fontStyle: 'italic',
                fill: BRAND.secondary,
                textAlign: 'center',
                lineHeight: 1.15,
                selectable: true,
                layerName: 'Titel',
            }));
        }

        // CTA "Klik hier" (calibrated from user)
        objects.push(new fabric.Textbox('Klik\nhier', {
            left: 849,
            top: 482,
            width: 100,
            fontFamily: FONT_HAND,
            fontSize: 32,
            fontWeight: '700',
            fill: BRAND.primary,
            textAlign: 'center',
            lineHeight: 1.1,
            scaleX: 1.477,
            scaleY: 1.477,
            selectable: true,
            layerName: 'CTA',
        }));

        // Arrow pointing up-right (calibrated from user)
        objects.push(new fabric.Text('\u2197', {
            left: 945,
            top: 422,
            fontSize: 40,
            scaleX: 1.576,
            scaleY: 1.576,
            fill: BRAND.primary,
            selectable: true,
            layerName: 'CTA Pijl',
        }));

        return objects;
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

    _buildEngagementContent(slide) {
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

        // Arrow down (calibrated)
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
        if (!obj || obj.layerName === 'Papier') return;

        const bound = obj.getBoundingRect(true);

        // Clamp left edge
        if (bound.left < SAFE_AREA.left) {
            obj.set('left', obj.left + (SAFE_AREA.left - bound.left));
        }
        // Clamp top edge
        if (bound.top < SAFE_AREA.top) {
            obj.set('top', obj.top + (SAFE_AREA.top - bound.top));
        }
        // Clamp right edge
        if (bound.left + bound.width > SAFE_AREA.right) {
            obj.set('left', obj.left - (bound.left + bound.width - SAFE_AREA.right));
        }
        // Clamp bottom edge
        if (bound.top + bound.height > SAFE_AREA.bottom) {
            obj.set('top', obj.top - (bound.top + bound.height - SAFE_AREA.bottom));
        }
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
