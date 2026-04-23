/**
 * LinkedIn Carousel Tool — Frontend Logic
 * Connects AI generation to the interactive canvas editor.
 */

let currentCarouselData = null;

// ── Auto-save naar localStorage ────────────────────────────────
const STORAGE_KEY = 'bv_carousel_autosave';
const STORAGE_TIMESTAMP_KEY = 'bv_carousel_autosave_ts';
let autoSaveTimer = null;

function saveProject() {
    if (!currentCarouselData) return;
    try {
        const payload = {
            carouselData: currentCarouselData,
            topic: document.getElementById('topicInput')?.value || '',
            postBody: document.getElementById('postBodyOutput')?.value || '',
            options: aiOptions,
            // Per slide: object positions/properties (vanaf canvas)
            slideObjects: editor ? editor.exportAllSlideObjects?.() : null,
            savedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, payload.savedAt);
    } catch (e) {
        console.warn('Kon project niet opslaan:', e);
    }
}

function getSavedProject() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function clearSavedProject() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
}

function startAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(saveProject, 5000); // elke 5 sec
}

function stopAutoSave() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
}

// Save ook bij elke canvas-wijziging (debounced)
let saveDebounceTimer = null;
function scheduleSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(saveProject, 1000);
}

// Save bij browser sluiten/refresh
window.addEventListener('beforeunload', () => {
    if (currentCarouselData) saveProject();
});

// Bij page load: check of er een opgeslagen project is en vraag of restoren
async function checkRestoreOnLoad() {
    const saved = getSavedProject();
    if (!saved || !saved.carouselData) return;

    const savedDate = new Date(saved.savedAt);
    const minutesAgo = Math.round((Date.now() - savedDate.getTime()) / 60000);
    let timeText;
    if (minutesAgo < 1) timeText = 'zojuist';
    else if (minutesAgo < 60) timeText = `${minutesAgo} minuten geleden`;
    else if (minutesAgo < 1440) timeText = `${Math.round(minutesAgo / 60)} uur geleden`;
    else timeText = `${Math.round(minutesAgo / 1440)} dagen geleden`;

    const topicPreview = (saved.topic || '').slice(0, 60) || 'Eerder werk';
    const ok = confirm(
        `📂 Eerder werk gevonden\n\n` +
        `"${topicPreview}"\n` +
        `Opgeslagen ${timeText}.\n\n` +
        `Wil je dit project terug laden?`
    );

    if (ok) {
        await restoreProject(saved);
    } else {
        clearSavedProject();
    }
}

async function restoreProject(saved) {
    try {
        currentCarouselData = saved.carouselData;
        if (saved.topic) {
            const topicEl = document.getElementById('topicInput');
            if (topicEl) topicEl.value = saved.topic;
        }
        if (saved.options) {
            Object.assign(aiOptions, saved.options);
            // Update active pills
            document.querySelectorAll('.opt-pills').forEach(group => {
                const opt = group.dataset.opt;
                const val = aiOptions[opt];
                group.querySelectorAll('.opt-pill').forEach(p => {
                    p.classList.toggle('active', p.dataset.value === val);
                });
            });
            // Update preset-select (na loadPresets vullen de opties dit alsnog)
            const presetSelect = document.getElementById('presetSelect');
            if (presetSelect && aiOptions.presetId) {
                presetSelect.value = aiOptions.presetId;
            }
            updateOptionsSummary();
        }

        if (!editor) initCanvasEditor();
        await editor.loadSlides(currentCarouselData);

        // Restore object positions per slide if present
        if (saved.slideObjects && editor.importAllSlideObjects) {
            editor.importAllSlideObjects(saved.slideObjects);
        }

        // Show UI
        document.getElementById('emptyState')?.classList.add('hidden');
        document.getElementById('canvasEditorSection')?.classList.remove('hidden');
        document.getElementById('editorSection')?.classList.remove('hidden');
        document.getElementById('postSection')?.classList.remove('hidden');

        if (saved.postBody) {
            const postEl = document.getElementById('postBodyOutput');
            if (postEl) postEl.value = saved.postBody;
        }

        renderEditor(currentCarouselData.slides);
        startAutoSave();
        showToast('Project hersteld');
    } catch (e) {
        console.error('Restore mislukt:', e);
        showToast('Kon project niet herstellen', 'error');
    }
}

// Run restore check after DOM ready (localStorage + URL project)
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkRestoreOnLoad, 500);
});

// ── Cloud opslag (Supabase) ────────────────────────────────────
let currentProjectId = null;
let currentAccessToken = null;

// ── Owner-auth (single-tenant password) ────────────────────────
const OWNER_TOKEN_KEY = 'bv_owner_token';

function getOwnerToken() {
    try { return localStorage.getItem(OWNER_TOKEN_KEY) || ''; } catch (_) { return ''; }
}

function setOwnerToken(token) {
    try {
        if (token) localStorage.setItem(OWNER_TOKEN_KEY, token);
        else localStorage.removeItem(OWNER_TOKEN_KEY);
    } catch (_) {}
}

function authHeaders() {
    const t = getOwnerToken();
    return t ? { 'x-owner-token': t } : {};
}

async function verifyOwnerToken(token) {
    try {
        const res = await fetch('/api/projects/verify', {
            headers: { 'x-owner-token': token },
        });
        return res.ok;
    } catch (_) {
        return false;
    }
}

async function ensureOwnerLogin() {
    const existing = getOwnerToken();
    if (existing && await verifyOwnerToken(existing)) return true;
    if (existing) setOwnerToken(''); // opgeslagen token werkt niet meer
    return showLoginModal();
}

function showLoginModal() {
    return new Promise((resolve) => {
        const existing = document.getElementById('ownerLoginModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'ownerLoginModal';
        modal.className = 'login-modal';
        modal.innerHTML = `
            <div class="login-card">
                <h2 class="login-title">Inloggen</h2>
                <p class="login-subtitle">Voer je wachtwoord in om bij je projecten te komen.</p>
                <form id="loginForm" autocomplete="off">
                    <input type="password" id="loginPassword" class="login-input" placeholder="Wachtwoord" autocomplete="current-password" required>
                    <div id="loginError" class="login-error"></div>
                    <button type="submit" class="login-btn">Inloggen</button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        const form = modal.querySelector('#loginForm');
        const input = modal.querySelector('#loginPassword');
        const errEl = modal.querySelector('#loginError');
        const btn = modal.querySelector('.login-btn');
        setTimeout(() => input.focus(), 50);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errEl.textContent = '';
            btn.disabled = true;
            btn.textContent = 'Controleren...';
            const token = input.value.trim();
            const ok = token && await verifyOwnerToken(token);
            if (ok) {
                setOwnerToken(token);
                modal.remove();
                resolve(true);
            } else {
                errEl.textContent = 'Verkeerd wachtwoord';
                btn.disabled = false;
                btn.textContent = 'Inloggen';
                input.select();
            }
        });
    });
}

function logoutOwner() {
    if (!confirm('Uitloggen? Je blijft je projecten in de cloud behouden, maar moet opnieuw inloggen.')) return;
    setOwnerToken('');
    window.location.reload();
}

// ── Vorige ontwerpen (server-side lijst) ───────────────────────
let recentProjectsCache = [];

async function fetchRecentProjects() {
    try {
        const res = await fetch('/api/projects', { headers: authHeaders() });
        if (res.status === 401) {
            recentProjectsCache = [];
            renderRecentProjects();
            await ensureOwnerLogin();
            return fetchRecentProjects();
        }
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
            recentProjectsCache = data.projects;
            renderRecentProjects();
        }
    } catch (e) {
        console.warn('Kon vorige ontwerpen niet laden:', e);
    }
}

async function deleteProjectFromCloud(projectId) {
    if (!confirm('Dit project definitief verwijderen?\nKan niet ongedaan worden gemaakt.')) return;
    try {
        const res = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Verwijderen mislukt');
        }
        recentProjectsCache = recentProjectsCache.filter(p => p.projectId !== projectId);
        renderRecentProjects();
        showToast('Project verwijderd');
    } catch (e) {
        showToast('Kon niet verwijderen: ' + (e.message || e), 'error');
    }
}

function formatRelativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    const mins = Math.round((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return 'zojuist';
    if (mins < 60) return `${mins} min geleden`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} uur geleden`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} dag${days === 1 ? '' : 'en'} geleden`;
    return then.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderRecentProjects() {
    const wrapper = document.getElementById('recentProjects');
    const list = document.getElementById('recentProjectsList');
    if (!wrapper || !list) return;

    if (!recentProjectsCache || recentProjectsCache.length === 0) {
        wrapper.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    wrapper.classList.remove('hidden');
    list.innerHTML = recentProjectsCache.map(p => `
        <button type="button" class="recent-item" data-project-id="${escapeHtml(p.projectId)}" data-access-token="${escapeHtml(p.accessToken)}">
            <div class="recent-item-main">
                <div class="recent-item-name">${escapeHtml(p.name || p.topic || 'Naamloos')}</div>
                <div class="recent-item-meta"><span>${escapeHtml(formatRelativeTime(p.updatedAt))}</span></div>
            </div>
            <span class="recent-item-remove" data-remove="${escapeHtml(p.projectId)}" title="Project verwijderen">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </span>
        </button>
    `).join('');

    list.querySelectorAll('.recent-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-remove]');
            if (removeBtn) {
                e.stopPropagation();
                deleteProjectFromCloud(removeBtn.dataset.remove);
                return;
            }
            const id = btn.dataset.projectId;
            const tok = btn.dataset.accessToken;
            if (id && tok) loadFromCloud(id, tok);
        });
    });
}

// Legacy: behoudt oude onclick handler in HTML header, verwijst naar de nieuwe flow
function clearProjectsHistory() {
    logoutOwner();
}

document.addEventListener('DOMContentLoaded', async () => {
    await ensureOwnerLogin();
    fetchRecentProjects();
});

async function saveToCloud() {
    if (!currentCarouselData) {
        showToast('Niets om op te slaan', 'error');
        return;
    }

    const btn = document.getElementById('btnSaveCloud');
    if (btn) btn.textContent = 'Opslaan...';

    try {
        const payload = {
            name: document.getElementById('topicInput')?.value?.slice(0, 60) || 'Naamloos',
            topic: document.getElementById('topicInput')?.value || '',
            carouselData: currentCarouselData,
            postBody: document.getElementById('postBodyOutput')?.value || '',
            slideObjects: editor ? editor.exportAllSlideObjects?.() : null,
            options: aiOptions,
            presetId: currentCarouselData?.metadata?.presetId || null,
        };

        let result;

        if (currentProjectId && currentAccessToken) {
            // Update bestaand project
            payload.accessToken = currentAccessToken;
            const res = await fetch(`/api/projects/${currentProjectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            result = await res.json();
        } else {
            // Nieuw project aanmaken
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            result = await res.json();

            if (result.success) {
                currentProjectId = result.projectId;
                currentAccessToken = result.accessToken;
                // Sla project ref op in localStorage zodat we het kunnen restoren
                localStorage.setItem('bv_cloud_project_id', currentProjectId);
                localStorage.setItem('bv_cloud_access_token', currentAccessToken);
                // Update URL zodat hij deelbaar is
                window.history.replaceState(null, '', `?project=${currentProjectId}&token=${currentAccessToken}`);
            }
        }

        if (result.success) {
            fetchRecentProjects(); // ververs server-lijst op de achtergrond
            showToast('Project opgeslagen in de cloud');
        } else {
            throw new Error(result.error || 'Opslaan mislukt');
        }
    } catch (e) {
        console.error('Cloud save error:', e);
        showToast('Kon niet opslaan: ' + (e.message || e), 'error');
    } finally {
        if (btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg><span class="btn-tool-label">Opslaan</span>';
    }
}

async function loadFromCloud(projectId, token) {
    try {
        const res = await fetch(`/api/projects/${projectId}?token=${encodeURIComponent(token)}`, {
            headers: authHeaders(),
        });
        const data = await res.json();

        if (!data.success || !data.project) {
            throw new Error(data.error || 'Project niet gevonden');
        }

        const project = data.project;
        currentProjectId = projectId;
        currentAccessToken = token;
        currentCarouselData = project.carouselData;

        localStorage.setItem('bv_cloud_project_id', projectId);
        localStorage.setItem('bv_cloud_access_token', token);

        if (project.topic) {
            const topicEl = document.getElementById('topicInput');
            if (topicEl) topicEl.value = project.topic;
        }
        if (project.options) {
            Object.assign(aiOptions, project.options);
            updateOptionsSummary();
        }

        if (!editor) initCanvasEditor();
        await editor.loadSlides(currentCarouselData);

        if (project.slideObjects && editor.importAllSlideObjects) {
            await editor.importAllSlideObjects(project.slideObjects);
        }

        document.getElementById('emptyState')?.classList.add('hidden');
        document.getElementById('canvasEditorSection')?.classList.remove('hidden');
        document.getElementById('editorSection')?.classList.remove('hidden');
        document.getElementById('postSection')?.classList.remove('hidden');

        if (project.postBody) {
            const postEl = document.getElementById('postBodyOutput');
            if (postEl) postEl.value = project.postBody;
        }

        renderEditor(currentCarouselData.slides);
        startAutoSave();

        window.history.replaceState(null, '', `?project=${projectId}&token=${token}`);
        showToast('Project geladen uit de cloud');
    } catch (e) {
        console.error('Cloud load error:', e);
        showToast('Kon project niet laden: ' + (e.message || e), 'error');
    }
}

// Check URL params bij page load voor cloud project link
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project');
    const token = params.get('token');
    if (projectId && token) {
        // Cloud project in URL → laad dat (overschrijft localStorage restore)
        setTimeout(() => loadFromCloud(projectId, token), 600);
    }
});

// ── AI Generation Options ───────────────────────────────────────
const aiOptions = {
    postLength: 'medium',  // kort | medium | lang
    presetId: '',          // '' = automatisch (AI kiest)
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

    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
        presetSelect.addEventListener('change', () => {
            aiOptions.presetId = presetSelect.value || '';
            updateOptionsSummary();
        });
        loadPresets();
    }

    updateOptionsSummary();
}

async function loadPresets() {
    const select = document.getElementById('presetSelect');
    if (!select) return;
    try {
        const res = await fetch('/api/presets');
        const data = await res.json();
        if (!data.success || !Array.isArray(data.presets)) return;

        const sorted = [...data.presets].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'nl'));
        for (const preset of sorted) {
            const opt = document.createElement('option');
            opt.value = preset.id;
            opt.textContent = preset.name || preset.id;
            select.appendChild(opt);
        }

        // Restore eventuele eerdere keuze (via localStorage-autosave)
        if (aiOptions.presetId) {
            select.value = aiOptions.presetId;
        }
    } catch (e) {
        console.warn('Kon presets niet laden:', e);
    }
}

function updateOptionsSummary() {
    const lengthLabels = { kort: 'Kort', medium: 'Medium', lang: 'Lang' };
    const summaryEl = document.getElementById('aiOptionsSummary');
    if (!summaryEl) return;

    const parts = [lengthLabels[aiOptions.postLength] || 'Medium'];
    if (aiOptions.presetId) {
        const select = document.getElementById('presetSelect');
        const chosen = select ? select.options[select.selectedIndex]?.textContent : null;
        if (chosen) parts.push(chosen);
    } else {
        parts.push('Auto-formaat');
    }
    summaryEl.textContent = parts.join(' · ');
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

    // Nieuw ontwerp → reset cloud-project-ref zodat Opslaan een nieuw project maakt
    currentProjectId = null;
    currentAccessToken = null;
    localStorage.removeItem('bv_cloud_project_id');
    localStorage.removeItem('bv_cloud_access_token');
    window.history.replaceState(null, '', window.location.pathname);

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

            // Start auto-save voor dit project
            startAutoSave();
            saveProject(); // direct opslaan

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

    // Start auto-save
    startAutoSave();
    saveProject();

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

    const topic = (document.getElementById('topicInput')?.value || '').trim();
    const title = currentCarouselData?.title
        || topic
        || 'LinkedIn Carousel';

    showToast('PDF wordt gegenereerd...');
    try {
        await editor.exportPDF({ title, subject: topic, filename: makePdfFilename(title) });
        showToast('PDF gedownload!');
    } catch (e) {
        console.error(e);
        showToast('Fout bij PDF export', 'error');
    }
}

function makePdfFilename(title) {
    const clean = (title || 'carousel')
        .replace(/[\\/:*?"<>|]+/g, '')     // verboden filename-tekens weghalen
        .replace(/\s+/g, ' ')              // meerdere spaties → één
        .trim()
        .replace(/\.+$/, '')               // geen trailing dots
        .slice(0, 80);
    return (clean || 'carousel') + '.pdf';
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

async function addAssetToCanvas(url, layerName, targetWidth = 260) {
    if (!editor) return;
    try {
        const img = await new Promise((resolve, reject) => {
            fabric.Image.fromURL(url, (img) => {
                if (img && img.width > 0) resolve(img);
                else reject(new Error('Failed'));
            }, { crossOrigin: 'anonymous' });
        });

        const scale = targetWidth / img.width;
        img.set({
            left: (1080 - targetWidth) / 2,
            top: (1080 - img.height * scale) / 2,
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true,
            layerName,
        });

        editor.fabricCanvas.add(img);
        editor.fabricCanvas.setActiveObject(img);
        editor.fabricCanvas.renderAll();
        editor._pushHistory();
        showToast(`${layerName} toegevoegd`);
    } catch (e) {
        console.error(e);
        showToast(`Kon ${layerName.toLowerCase()} niet laden`, 'error');
    }
}

function addBusinessSvg(filename, label) {
    return addAssetToCanvas(`/assets/business/${filename}`, label, 260);
}

function addFrameToCanvas(filename, label) {
    return addAssetToCanvas(`/assets/lijnen/${filename}`, label, 600);
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
