/**
 * DailyBriefer v2 - Frontend Application Controller
 * Handles UI interactions, vault lifecycle, DB sync, AI tuning, and GitHub Actions dispatch.
 */

import {
    encryptVault,
    decryptVault,
    isVaultConfigured,
    isSessionUnlocked,
    getSessionKeys,
    lockVault,
    clearVault
} from './vault.js';

import {
    initDb,
    fetchProfile,
    updateProfile,
    fetchActiveEvents,
    fetchExpiredEvents,
    createEvent,
    deleteEvent,
    fetchBriefs,
    fetchBriefById
} from './db.js';

import { processTuningMessage } from './chat.js';

// Global application state
let currentProfile = null;
let activeEvents = [];
let currentBriefDetail = null;

// DOM Elements
const elements = {
    // Top Nav
    navStatusBadge: document.getElementById('navStatusBadge'),
    btnTriggerDispatch: document.getElementById('btnTriggerDispatch'),
    triggerIcon: document.getElementById('triggerIcon'),
    triggerText: document.getElementById('triggerText'),
    btnVaultControl: document.getElementById('btnVaultControl'),
    vaultIcon: document.getElementById('vaultIcon'),
    vaultStatusText: document.getElementById('vaultStatusText'),
    btnThemeToggle: document.getElementById('btnThemeToggle'),
    themeIconSun: document.getElementById('themeIconSun'),
    themeIconMoon: document.getElementById('themeIconMoon'),
    btnOpenVaultSettings: document.getElementById('btnOpenVaultSettings'),

    // Main Deck
    vaultLockedNotice: document.getElementById('vaultLockedNotice'),
    btnPromptUnlock: document.getElementById('btnPromptUnlock'),
    dashboardDeck: document.getElementById('dashboardDeck'),

    // Status Strips
    statActiveState: document.getElementById('statActiveState'),
    toggleActiveStatus: document.getElementById('toggleActiveStatus'),
    statRecipientEmail: document.getElementById('statRecipientEmail'),
    statPersonaTone: document.getElementById('statPersonaTone'),
    statEventCount: document.getElementById('statEventCount'),
    btnQuickAddEvent: document.getElementById('btnQuickAddEvent'),

    // AI Chat
    chatHistory: document.getElementById('chatHistory'),
    chatForm: document.getElementById('chatForm'),
    chatInput: document.getElementById('chatInput'),
    btnSendChat: document.getElementById('btnSendChat'),

    // Milestones
    btnOpenAddEventModal: document.getElementById('btnOpenAddEventModal'),
    activeEventsContainer: document.getElementById('activeEventsContainer'),
    expiredEventsContainer: document.getElementById('expiredEventsContainer'),

    // Direct Settings
    btnSaveProfileDirect: document.getElementById('btnSaveProfileDirect'),
    inputRecipientEmail: document.getElementById('inputRecipientEmail'),
    inputPersonaTone: document.getElementById('inputPersonaTone'),
    inputPrimaryModel: document.getElementById('inputPrimaryModel'),
    inputFallbackModel: document.getElementById('inputFallbackModel'),
    selectSearchTopic: document.getElementById('selectSearchTopic'),
    selectSearchDepth: document.getElementById('selectSearchDepth'),
    selectTheme: document.getElementById('selectTheme'),
    inputPreferencesSummary: document.getElementById('inputPreferencesSummary'),

    // Briefs Archive
    briefsListContainer: document.getElementById('briefsListContainer'),
    btnRefreshBriefs: document.getElementById('btnRefreshBriefs'),
    btnPreviewDraft: document.getElementById('btnPreviewDraft'),

    // Modals
    modalUnlockVault: document.getElementById('modalUnlockVault'),
    btnCloseUnlockVault: document.getElementById('btnCloseUnlockVault'),
    formUnlockVault: document.getElementById('formUnlockVault'),
    inputUnlockPassphrase: document.getElementById('inputUnlockPassphrase'),
    unlockErrorMsg: document.getElementById('unlockErrorMsg'),
    btnSwitchToVaultConfig: document.getElementById('btnSwitchToVaultConfig'),

    modalVaultConfig: document.getElementById('modalVaultConfig'),
    btnCloseVaultConfig: document.getElementById('btnCloseVaultConfig'),
    formVaultConfig: document.getElementById('formVaultConfig'),
    cfgSupabaseUrl: document.getElementById('cfgSupabaseUrl'),
    cfgSupabaseAnonKey: document.getElementById('cfgSupabaseAnonKey'),
    cfgGeminiKey: document.getElementById('cfgGeminiKey'),
    cfgMasterPassphrase: document.getElementById('cfgMasterPassphrase'),
    btnClearStoredVault: document.getElementById('btnClearStoredVault'),

    modalAddEvent: document.getElementById('modalAddEvent'),
    btnCloseAddEvent: document.getElementById('btnCloseAddEvent'),
    btnCancelAddEvent: document.getElementById('btnCancelAddEvent'),
    formAddEvent: document.getElementById('formAddEvent'),
    inputEventTitle: document.getElementById('inputEventTitle'),
    inputEventDate: document.getElementById('inputEventDate'),

    modalInspectBrief: document.getElementById('modalInspectBrief'),
    btnCloseInspectBrief: document.getElementById('btnCloseInspectBrief'),
    inspectBriefSubject: document.getElementById('inspectBriefSubject'),
    inspectBriefDate: document.getElementById('inspectBriefDate'),
    btnTabRendered: document.getElementById('btnTabRendered'),
    btnTabRaw: document.getElementById('btnTabRaw'),
    btnCopyRawBrief: document.getElementById('btnCopyRawBrief'),
    briefIframe: document.getElementById('briefIframe'),
    briefRawCode: document.getElementById('briefRawCode'),

    toastContainer: document.getElementById('toastContainer'),
};

/**
 * Display toast notification.
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast pointer-events-auto p-3.5 rounded-lg shadow-md border text-xs font-medium flex items-center justify-between space-x-3 transition-all duration-300 ${type === 'success' ? 'bg-[var(--bg-card)] border-[#c3dfc3] dark:border-[#29462f] text-[#286638] dark:text-[#6bc97b]' :
            type === 'error' ? 'bg-[var(--bg-card)] border-[#ffe2dd] dark:border-[#502828] text-[#c4554d] dark:text-[#ff8585]' :
                type === 'warning' ? 'bg-[var(--bg-card)] border-[#faebdd] dark:border-[#50371a] text-[#d9730d] dark:text-[#e89547]' :
                    'bg-[var(--toast-bg)] border-[var(--toast-border)] text-[var(--toast-text)]'
        }`;

    toast.innerHTML = `
        <div class="flex items-center space-x-2">
            <span>${message}</span>
        </div>
        <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold text-sm">&times;</button>
    `;

    toast.querySelector('button').onclick = () => toast.remove();
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 4500);
}

/**
 * Initialize theme from localStorage or system preference.
 */
function initTheme() {
    const savedTheme = localStorage.getItem('dailybriefer_theme');
    const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';
    applyTheme(initialTheme, false, false);

    // Listen for system theme changes if no explicit user override is stored
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('dailybriefer_theme')) {
                applyTheme(e.matches ? 'dark' : 'light', false, false);
            }
        });
    }
}

/**
 * Apply selected theme to DOM and optionally sync to storage/profile.
 */
function applyTheme(theme, saveToStorage = true, syncToProfile = false) {
    const isDark = theme === 'dark';
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        if (elements.themeIconSun) elements.themeIconSun.classList.remove('hidden');
        if (elements.themeIconMoon) elements.themeIconMoon.classList.add('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        if (elements.themeIconSun) elements.themeIconSun.classList.add('hidden');
        if (elements.themeIconMoon) elements.themeIconMoon.classList.remove('hidden');
    }

    if (elements.selectTheme) {
        elements.selectTheme.value = theme;
    }

    if (saveToStorage) {
        localStorage.setItem('dailybriefer_theme', theme);
    }

    if (syncToProfile && isSessionUnlocked() && currentProfile) {
        currentProfile.theme = theme;
        updateProfile({ theme }).catch(err => {
            console.warn('Could not auto-sync theme preference to database:', err);
        });
    }
}

/**
 * Toggle between light and dark modes.
 */
function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const nextTheme = isDark ? 'light' : 'dark';
    applyTheme(nextTheme, true, true);
    showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
}

/**
 * Initialize application lifecycle.
 */
function init() {
    initTheme();
    setupEventListeners();
    checkVaultState();
}

/**
 * Check vault state on page load.
 */
function checkVaultState() {
    if (!isVaultConfigured()) {
        openVaultConfigModal();
    } else if (!isSessionUnlocked()) {
        openUnlockModal();
    } else {
        onVaultUnlocked();
    }
}

/**
 * Called once vault is unlocked with in-memory session keys.
 */
async function onVaultUnlocked() {
    const keys = getSessionKeys();
    if (!keys) return;

    // Update Nav status
    if (elements.vaultStatusText) elements.vaultStatusText.textContent = 'Vault Unlocked';
    if (elements.vaultIcon) elements.vaultIcon.setAttribute('class', 'w-3.5 h-3.5 mr-1.5 text-[#286638]');
    if (elements.vaultLockedNotice) elements.vaultLockedNotice.classList.add('hidden');
    if (elements.dashboardDeck) elements.dashboardDeck.classList.remove('hidden');

    try {
        initDb(keys.supabaseUrl, keys.supabaseAnonKey);
        await refreshAllData();
        showToast('Decrypted vault keys loaded successfully.', 'success');
    } catch (err) {
        console.error('Failed to initialize database:', err);
        showToast(`Database error: ${err.message}`, 'error');
    }
}

/**
 * Refresh full dashboard state from Supabase.
 */
async function refreshAllData() {
    await Promise.all([
        loadProfileData(),
        loadEventsData(),
        loadBriefsData(),
    ]);
}

/**
 * Load and render user profile.
 */
async function loadProfileData() {
    try {
        currentProfile = await fetchProfile();
        if (!currentProfile) {
            showToast('No profile found in database. Please run schema.sql.', 'warning');
            return;
        }

        // Render top status cards
        const isActive = currentProfile.is_active !== false;
        elements.toggleActiveStatus.checked = isActive;
        elements.statActiveState.textContent = isActive ? 'Active & Running' : 'Paused';
        elements.statActiveState.className = isActive ? 'text-sm font-semibold text-[#286638] mt-1' : 'text-sm font-semibold text-[#9b9a97] mt-1';

        elements.statRecipientEmail.textContent = currentProfile.recipient_email || 'Not configured';
        elements.statPersonaTone.textContent = currentProfile.persona_tone || 'Analytical & Direct';

        // Populate manual config form
        elements.inputRecipientEmail.value = currentProfile.recipient_email || '';
        elements.inputPersonaTone.value = currentProfile.persona_tone || '';
        elements.inputPrimaryModel.value = currentProfile.primary_model || 'gemini-3.5-flash-lite';
        elements.inputFallbackModel.value = currentProfile.fallback_model || 'gemini-3.1-flash-lite';
        elements.selectSearchTopic.value = currentProfile.search_topic || 'news';
        elements.selectSearchDepth.value = currentProfile.search_depth || 'basic';
        if (elements.inputMaxQueries) elements.inputMaxQueries.value = currentProfile.max_search_queries || 4;
        elements.inputPreferencesSummary.value = currentProfile.preferences_summary || '';

        // Synchronize theme preference from profile if set
        if (currentProfile.theme) {
            applyTheme(currentProfile.theme, true, false);
        } else if (elements.selectTheme) {
            elements.selectTheme.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        }

    } catch (err) {
        console.error('Error loading profile:', err);
        showToast(`Failed to load profile: ${err.message}`, 'error');
    }
}

/**
 * Load and render milestone events.
 */
async function loadEventsData() {
    try {
        activeEvents = await fetchActiveEvents();
        const expiredEvents = await fetchExpiredEvents();

        elements.statEventCount.textContent = `${activeEvents.length} Active`;

        // Render active events
        if (activeEvents.length === 0) {
            elements.activeEventsContainer.innerHTML = '<div class="text-center py-6 text-xs text-[#9b9a97]">No active milestones configured.</div>';
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            elements.activeEventsContainer.innerHTML = activeEvents.map(ev => {
                const parts = (ev.event_date || '').split('-').map(Number);
                const eventDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0) : new Date(ev.event_date);
                const diffDays = Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                let badge = '';
                if (diffDays === 0) {
                    badge = '<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--accent-coral-bg)] text-[var(--accent-coral-text)] border border-[var(--accent-coral-text)]/30 animate-pulse">TODAY!</span>';
                } else if (diffDays === 1) {
                    badge = '<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--tag-amber-bg)] text-[var(--tag-amber-text)] border border-[var(--tag-amber-border)]">Tomorrow</span>';
                } else if (diffDays > 1) {
                    badge = `<span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)] border border-[var(--tag-blue-border)]">in ${diffDays} days</span>`;
                } else {
                    badge = '<span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[var(--tag-gray-bg)] text-[var(--tag-gray-text)]">Passed</span>';
                }

                return `
                    <div class="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition">
                        <div class="flex items-center space-x-2.5 truncate mr-2">
                            <span class="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)]"></span>
                            <span class="font-medium text-[var(--text-primary)] truncate">${escapeHtml(ev.title)}</span>
                            <span class="text-[var(--text-secondary)] text-[11px] font-mono">(${ev.event_date})</span>
                            ${badge}
                        </div>
                        <button data-delete-event="${ev.id}" class="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--accent-coral-text)] hover:bg-[var(--accent-coral-bg)] transition" title="Delete Milestone">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                `;
            }).join('');
        }

        // Render expired events
        if (expiredEvents.length === 0) {
            elements.expiredEventsContainer.innerHTML = '<div class="text-[var(--text-muted)] italic">No expired milestones.</div>';
        } else {
            elements.expiredEventsContainer.innerHTML = expiredEvents.map(ev => `
                <div class="flex items-center justify-between py-1 px-2 rounded hover:bg-[var(--bg-hover)]">
                    <span class="line-through text-[var(--text-muted)]">${escapeHtml(ev.title)}</span>
                    <span class="text-[var(--text-muted)] text-[10px] font-mono">${ev.event_date}</span>
                </div>
            `).join('');
        }

    } catch (err) {
        console.error('Error loading events:', err);
    }
}

/**
 * Load and render historical briefs archive list.
 */
async function loadBriefsData() {
    try {
        const briefs = await fetchBriefs(20, 0);
        if (briefs.length === 0) {
            elements.briefsListContainer.innerHTML = '<div class="text-center py-10 text-[#9b9a97]">No historical briefs generated yet. Trigger your first brief to see digests!</div>';
            return;
        }

        elements.briefsListContainer.innerHTML = briefs.map(b => {
            const dateStr = new Date(b.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div data-brief-id="${b.id}" class="brief-item p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--text-primary)] hover:bg-[var(--bg-card)] transition cursor-pointer group shadow-2xs">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] font-mono text-[var(--text-secondary)]">${dateStr}</span>
                        <span class="text-[10px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] font-medium transition">View Digest →</span>
                    </div>
                    <h4 class="font-medium text-[var(--text-primary)] line-clamp-2 leading-snug">${escapeHtml(b.subject)}</h4>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading briefs:', err);
        elements.briefsListContainer.innerHTML = `<div class="text-[#c4554d] text-center py-6">Failed to load briefs: ${err.message}</div>`;
    }
}

/**
 * Generate and display a sample executive briefing draft in the requested/current theme.
 */
function openSampleDraftModal() {
    const isDark = document.documentElement.classList.contains('dark');
    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const subject = `DailyBriefer · Executive Intelligence Brief (${today})`;

    // Palette tokens tailored for the email draft
    const outerBg = isDark ? '#191919' : '#fcfbf9';
    const cardBg = isDark ? '#202020' : '#ffffff';
    const cardBorder = isDark ? '#2e2e2e' : '#e9e9e7';
    const storyBg = isDark ? '#262626' : '#f7f6f5';
    const storyBorder = isDark ? '#333333' : '#e9e9e7';
    const textPrimary = isDark ? '#ebebeb' : '#2f3437';
    const textBody = isDark ? '#d4d4d4' : '#37352f';
    const textMuted = isDark ? '#9b9a97' : '#787774';
    const coralAccent = isDark ? '#eb5757' : '#e16259';
    const badgeBg = isDark ? '#2f2f2f' : '#2f3437';
    const badgeText = isDark ? '#ebebeb' : '#ffffff';
    const milestoneBorder = isDark ? '#b388ff' : '#6940a5';

    const draftHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="margin:0; padding:20px 14px; background-color:${outerBg}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
    <div style="max-width:660px; margin:0 auto; background-color:${cardBg}; padding:28px 24px; border-radius:12px; border:1px solid ${cardBorder}; box-shadow:0 1px 3px rgba(0,0,0,0.04); color:${textPrimary};">
        <!-- Header -->
        <div style="border-bottom:1px solid ${cardBorder}; padding-bottom:20px; margin-bottom:24px;">
            <div style="display:inline-block; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; background-color:${badgeBg}; color:${badgeText}; letter-spacing:1px; text-transform:uppercase;">
                DailyBriefer · Executive Digest
            </div>
            <h1 style="margin:12px 0 4px 0; font-size:22px; font-weight:700; color:${textPrimary}; line-height:1.3;">
                Daily Intelligence Brief
            </h1>
            <p style="margin:0; font-size:13px; color:${textMuted}; font-family:monospace;">
                ${today} · Prepared for ${currentProfile?.recipient_email || 'subscriber@example.com'}
            </p>
            <p style="margin:12px 0 0 0; font-size:14px; color:${textBody}; line-height:1.5; font-style:italic;">
                "Key breakthroughs across AI reasoning systems, distributed cloud architecture, and semiconductor technology."
            </p>
        </div>

        <!-- Section: AI & Machine Intelligence -->
        <div style="margin-bottom:24px;">
            <div style="font-size:11px; font-weight:700; color:${coralAccent}; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:12px;">
                ◆ AI & Autonomous Systems
            </div>

            <!-- Story 1 -->
            <div style="margin-bottom:16px; padding:18px; background-color:${storyBg}; border-radius:8px; border:1px solid ${storyBorder}; border-left:4px solid ${coralAccent};">
                <h3 style="margin:0 0 8px 0; font-size:16px; font-weight:600; color:${textPrimary}; line-height:1.4;">
                    Next-Gen Latent Reasoning Models Show Sublinear Compute Scaling
                </h3>
                <p style="margin:0 0 10px 0; font-size:14px; color:${textBody}; line-height:1.6;">
                    Recent benchmarks demonstrate frontier models reducing inferencing overhead by 40% while preserving test-time reflection depth. Engineering teams are leveraging test-time compute scaling for code synthesis and formal verification.
                </p>
                <a href="https://example.com/ai-reasoning" style="color:${coralAccent}; text-decoration:none; font-size:13px; font-weight:600;">
                    Read Analysis & Benchmarks →
                </a>
            </div>

            <!-- Story 2 -->
            <div style="margin-bottom:16px; padding:18px; background-color:${storyBg}; border-radius:8px; border:1px solid ${storyBorder}; border-left:4px solid ${coralAccent};">
                <h3 style="margin:0 0 8px 0; font-size:16px; font-weight:600; color:${textPrimary}; line-height:1.4;">
                    Open-Weights Ecosystem Converges on Standard Agent Protocol
                </h3>
                <p style="margin:0 0 10px 0; font-size:14px; color:${textBody}; line-height:1.6;">
                    A coalition of research labs released an interoperable standard for multi-agent tool execution and memory isolation, simplifying zero-trust deployments across edge environments.
                </p>
                <a href="https://example.com/agent-protocol" style="color:${coralAccent}; text-decoration:none; font-size:13px; font-weight:600;">
                    Explore Specification →
                </a>
            </div>
        </div>

        <!-- Section: Upcoming Milestones -->
        <div style="margin-top:28px; padding:18px; background-color:${storyBg}; border-radius:8px; border:1px solid ${storyBorder}; border-left:4px solid ${milestoneBorder};">
            <h3 style="margin:0 0 10px 0; font-size:15px; font-weight:600; color:${textPrimary};">
                📅 Active Milestones & Countdown Reminders
            </h3>
            <ul style="margin:0; padding-left:20px; font-size:13px; color:${textBody}; line-height:1.7;">
                <li><strong>Quarterly Tech Review</strong> — Oct 15, 2026 (in 29 days)</li>
                <li><strong>Cloud Infrastructure Migration</strong> — Nov 01, 2026 (in 46 days)</li>
            </ul>
        </div>

        <!-- Footer -->
        <div style="margin-top:32px; padding-top:18px; border-top:1px solid ${cardBorder}; text-align:center; font-size:12px; color:${textMuted}; line-height:1.6;">
            DailyBriefer v2 · Serverless AI News Intelligence<br>
            <span style="font-size:11px;">You are receiving this draft formatted in <strong>Notion Light Aesthetic</strong>. Preferences and theme can be adjusted anytime on your dashboard.</span>
        </div>
    </div>
</body>
</html>`;

    elements.inspectBriefSubject.textContent = subject;
    elements.inspectBriefDate.textContent = `${today} (Live Draft Preview)`;
    elements.briefIframe.srcdoc = draftHtml;
    elements.briefRawCode.textContent = draftHtml;
    currentBriefDetail = { subject, html_content: draftHtml };
    switchBriefTab('rendered');
    elements.modalInspectBrief.classList.remove('hidden');
}

/**
 * Open Inspect Brief modal with rendered iframe and raw code.
 */
async function openBriefModal(briefId) {
    try {
        elements.inspectBriefSubject.textContent = 'Loading brief...';
        elements.inspectBriefDate.textContent = '';
        elements.modalInspectBrief.classList.remove('hidden');

        currentBriefDetail = await fetchBriefById(briefId);
        if (!currentBriefDetail) {
            showToast('Brief not found.', 'error');
            return;
        }

        const dateStr = new Date(currentBriefDetail.created_at).toLocaleString();
        elements.inspectBriefSubject.textContent = currentBriefDetail.subject;
        elements.inspectBriefDate.textContent = dateStr;

        elements.briefIframe.srcdoc = currentBriefDetail.html_content;
        elements.briefRawCode.textContent = currentBriefDetail.html_content;

        switchBriefTab('rendered');
    } catch (err) {
        console.error('Error inspecting brief:', err);
        showToast(`Failed to load brief detail: ${err.message}`, 'error');
    }
}

function switchBriefTab(tab) {
    if (tab === 'rendered') {
        elements.btnTabRendered.className = 'px-3 py-1 rounded bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-medium';
        elements.btnTabRaw.className = 'px-3 py-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]';
        elements.briefIframe.classList.remove('hidden');
        elements.briefRawCode.classList.add('hidden');
        if (elements.btnCopyRawBrief) elements.btnCopyRawBrief.classList.add('hidden');
    } else {
        elements.btnTabRaw.className = 'px-3 py-1 rounded bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs font-medium';
        elements.btnTabRendered.className = 'px-3 py-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]';
        elements.briefRawCode.classList.remove('hidden');
        elements.briefIframe.classList.add('hidden');
        if (elements.btnCopyRawBrief) elements.btnCopyRawBrief.classList.remove('hidden');
    }
}

/**
 * Trigger GitHub Actions workflow dispatch.
 */
function triggerWorkflowDispatch() {
    window.open('https://github.com/GWaman2007/daily-email-briefer/actions/workflows/daily-brief.yml', '_blank');
    showToast('Opened GitHub Actions runner page. Click "Run workflow" to execute immediately.', 'info');
}

/**
 * Process AI Preference Tuning Chat Message.
 */
async function handleChatSubmit(e) {
    if (e) e.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message) return;

    const keys = getSessionKeys();
    if (!keys || !keys.geminiApiKey) {
        showToast('Gemini API Key missing from Vault.', 'warning');
        openVaultConfigModal();
        return;
    }

    // Append User Message to UI
    appendChatMessage('user', message);
    elements.chatInput.value = '';
    elements.btnSendChat.disabled = true;

    // Append Thinking Indicator
    const thinkingId = appendChatThinking();

    try {
        const result = await processTuningMessage(message, currentProfile, keys.geminiApiKey);

        // Remove thinking indicator
        removeChatElement(thinkingId);

        // Append AI Reply
        appendChatMessage('ai', result.replyMessage);

        if (result.createdEvents && result.createdEvents.length > 0) {
            showToast(`Added ${result.createdEvents.length} new milestone event(s)!`, 'success');
        }

        // Refresh UI state
        await refreshAllData();

    } catch (err) {
        removeChatElement(thinkingId);
        appendChatMessage('error', `Tuning error: ${err.message}`);
        console.error('Tuning error:', err);
    } finally {
        elements.btnSendChat.disabled = false;
    }
}
function appendChatMessage(sender, text) {
    const div = document.createElement('div');
    if (sender === 'user') {
        div.className = 'flex items-start justify-end space-x-2.5';
        div.innerHTML = `
            <div class="p-3.5 rounded-xl rounded-tr-sm bg-[var(--chat-user-bg)] border border-[var(--chat-user-border)] text-[var(--chat-user-text)] text-xs leading-relaxed max-w-[85%]">
                ${escapeHtml(text)}
            </div>
            <div class="w-6 h-6 rounded-md bg-[#2f3437] dark:bg-[#383838] dark:border dark:border-[#444444] text-white flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5 font-bold">U</div>
        `;
    } else if (sender === 'error') {
        div.className = 'flex items-start space-x-2.5';
        div.innerHTML = `
            <div class="w-6 h-6 rounded-md bg-[#ffe2dd] dark:bg-[#3c2424] text-[#c4554d] dark:text-[#ff8585] flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold">!</div>
            <div class="p-3.5 rounded-xl rounded-tl-sm bg-[#ffe2dd]/50 dark:bg-[#3c2424]/50 border border-[#f5c6cb] dark:border-[#502828] text-[#c4554d] dark:text-[#ff8585] text-xs leading-relaxed max-w-[85%]">
                ${escapeHtml(text)}
            </div>
        `;
    } else {
        div.className = 'flex items-start space-x-2.5';
        div.innerHTML = `
            <div class="w-6 h-6 rounded-md bg-[var(--tag-gray-bg)] border border-[var(--tag-gray-border)] text-[var(--tag-gray-text)] flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5 font-bold">✨</div>
            <div class="p-3.5 rounded-xl rounded-tl-sm bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)] text-[var(--chat-ai-text)] text-xs leading-relaxed max-w-[85%] shadow-2xs">
                ${escapeHtml(text)}
            </div>
        `;
    }

    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
}

function appendChatThinking() {
    const id = 'thinking-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'flex items-start space-x-2.5';
    div.innerHTML = `
        <div class="w-6 h-6 rounded-md bg-[var(--tag-gray-bg)] border border-[var(--tag-gray-border)] text-[var(--tag-gray-text)] flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5 font-bold">✨</div>
        <div class="p-3.5 rounded-xl rounded-tl-sm bg-[var(--chat-ai-bg)] border border-[var(--chat-ai-border)] text-[var(--text-secondary)] text-xs flex items-center space-x-1.5 shadow-2xs">
            <span class="w-1.5 h-1.5 rounded-full bg-[#6940a5] dark:bg-[#b388ff] animate-bounce"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-[#6940a5] dark:bg-[#b388ff] animate-bounce" style="animation-delay: 0.15s"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-[#6940a5] dark:bg-[#b388ff] animate-bounce" style="animation-delay: 0.3s"></span>
            <span class="ml-1 text-[11px] text-[var(--text-muted)] font-mono">Synthesizing adjustments...</span>
        </div>
    `;
    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
    return id;
}

function removeChatElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/**
 * Setup all DOM Event Listeners.
 */
function setupEventListeners() {
    // Vault Modals & Controls
    elements.btnPromptUnlock.onclick = openUnlockModal;
    elements.btnVaultControl.onclick = () => {
        if (isSessionUnlocked()) {
            lockVault();
            if (elements.vaultStatusText) elements.vaultStatusText.textContent = 'Vault Locked';
            if (elements.vaultIcon) elements.vaultIcon.setAttribute('class', 'w-3.5 h-3.5 mr-1.5 text-[#d9730d]');
            if (elements.dashboardDeck) elements.dashboardDeck.classList.add('hidden');
            if (elements.vaultLockedNotice) elements.vaultLockedNotice.classList.remove('hidden');
            showToast('Session locked. Keys cleared from ephemeral memory.', 'info');
        } else {
            openUnlockModal();
        }
    };

    elements.btnOpenVaultSettings.onclick = openVaultConfigModal;
    elements.btnCloseVaultConfig.onclick = closeVaultConfigModal;
    elements.btnSwitchToVaultConfig.onclick = () => {
        closeUnlockModal();
        openVaultConfigModal();
    };

    elements.formUnlockVault.onsubmit = async (e) => {
        e.preventDefault();
        const passphrase = elements.inputUnlockPassphrase.value;
        elements.unlockErrorMsg.classList.add('hidden');

        try {
            await decryptVault(passphrase);
            closeUnlockModal();
            elements.inputUnlockPassphrase.value = '';
            onVaultUnlocked();
        } catch (err) {
            elements.unlockErrorMsg.textContent = err.message;
            elements.unlockErrorMsg.classList.remove('hidden');
        }
    };

    elements.formVaultConfig.onsubmit = async (e) => {
        e.preventDefault();
        const supabaseUrl = elements.cfgSupabaseUrl?.value?.trim() || '';
        const supabaseAnonKey = elements.cfgSupabaseAnonKey?.value?.trim() || '';
        const geminiApiKey = elements.cfgGeminiKey?.value?.trim() || '';
        const passphrase = elements.cfgMasterPassphrase?.value || '';

        if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) {
            showToast('Please fill in Supabase URL, Anon Key, and Gemini API Key.', 'warning');
            return;
        }
        if (!passphrase || passphrase.length < 4) {
            showToast('Master passphrase must be at least 4 characters long.', 'warning');
            return;
        }

        const payload = {
            supabaseUrl,
            supabaseAnonKey,
            geminiApiKey,
        };

        try {
            await encryptVault(passphrase, payload);
            closeVaultConfigModal();
            if (elements.cfgMasterPassphrase) elements.cfgMasterPassphrase.value = '';
            showToast('Credentials encrypted and stored successfully!', 'success');
            onVaultUnlocked();
        } catch (err) {
            showToast(`Encryption error: ${err.message}`, 'error');
        }
    };

    elements.btnClearStoredVault.onclick = () => {
        if (confirm('Are you sure you want to clear your stored encrypted vault from this browser?')) {
            clearVault();
            closeVaultConfigModal();
            elements.dashboardDeck.classList.add('hidden');
            elements.vaultLockedNotice.classList.remove('hidden');
            showToast('Vault wiped from browser storage.', 'info');
        }
    };

    // Active Status Toggle
    elements.toggleActiveStatus.onchange = async () => {
        const isActive = elements.toggleActiveStatus.checked;
        try {
            await updateProfile({ is_active: isActive });
            elements.statActiveState.textContent = isActive ? 'Active & Running' : 'Paused';
            elements.statActiveState.className = isActive ? 'text-sm font-semibold text-[#286638] mt-1' : 'text-sm font-semibold text-[#9b9a97] mt-1';
            showToast(isActive ? 'Daily briefing enabled.' : 'Daily briefing paused.', 'info');
        } catch (err) {
            showToast(`Failed to update status: ${err.message}`, 'error');
            elements.toggleActiveStatus.checked = !isActive;
        }
    };

    // Direct Profile Save
    elements.btnSaveProfileDirect.onclick = async () => {
        const recipientEmail = elements.inputRecipientEmail.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!recipientEmail || !emailRegex.test(recipientEmail)) {
            showToast('Please provide a valid recipient email address.', 'warning');
            elements.inputRecipientEmail.focus();
            return;
        }

        const maxQueriesVal = parseInt(elements.inputMaxQueries?.value || '4', 10);
        const maxQueries = Math.min(6, Math.max(1, isNaN(maxQueriesVal) ? 4 : maxQueriesVal));

        try {
            const updates = {
                recipient_email: recipientEmail,
                persona_tone: elements.inputPersonaTone.value.trim() || 'Analytical & Direct',
                primary_model: elements.inputPrimaryModel.value.trim() || 'gemini-3.5-flash-lite',
                fallback_model: elements.inputFallbackModel.value.trim() || 'gemini-3.1-flash-lite',
                search_topic: elements.selectSearchTopic.value,
                search_depth: elements.selectSearchDepth.value,
                max_search_queries: maxQueries,
                preferences_summary: elements.inputPreferencesSummary.value.trim(),
                theme: elements.selectTheme ? elements.selectTheme.value : (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
            };

            await updateProfile(updates);
            await loadProfileData();
            showToast('Profile and engine settings saved!', 'success');
        } catch (err) {
            showToast(`Failed to save settings: ${err.message}`, 'error');
        }
    };

    // Theme Mode Toggle Listeners
    if (elements.btnThemeToggle) {
        elements.btnThemeToggle.onclick = toggleTheme;
    }
    if (elements.selectTheme) {
        elements.selectTheme.onchange = (e) => {
            applyTheme(e.target.value, true, true);
        };
    }

    // Milestone Event Actions
    elements.btnOpenAddEventModal.onclick = openAddEventModal;
    elements.btnQuickAddEvent.onclick = openAddEventModal;
    elements.btnCloseAddEvent.onclick = closeAddEventModal;
    elements.btnCancelAddEvent.onclick = closeAddEventModal;

    elements.formAddEvent.onsubmit = async (e) => {
        e.preventDefault();
        const title = elements.inputEventTitle.value.trim();
        const date = elements.inputEventDate.value;
        if (!title || !date) return;

        try {
            await createEvent(title, date);
            closeAddEventModal();
            elements.inputEventTitle.value = '';
            elements.inputEventDate.value = '';
            await loadEventsData();
            showToast('Milestone event created!', 'success');
        } catch (err) {
            showToast(`Failed to create event: ${err.message}`, 'error');
        }
    };

    elements.activeEventsContainer.onclick = async (e) => {
        const btn = e.target.closest('[data-delete-event]');
        if (!btn) return;
        const eventId = btn.getAttribute('data-delete-event');
        if (confirm('Delete this milestone reminder?')) {
            try {
                await deleteEvent(eventId);
                await loadEventsData();
                showToast('Milestone deleted.', 'info');
            } catch (err) {
                showToast(`Failed to delete event: ${err.message}`, 'error');
            }
        }
    };

    // Chat AI Actions
    elements.chatForm.onsubmit = handleChatSubmit;
    document.querySelectorAll('.chat-chip').forEach(chip => {
        chip.onclick = () => {
            const text = chip.textContent.trim();
            if (text.toLowerCase().includes('milestone')) {
                openAddEventModal();
                return;
            }
            elements.chatInput.value = text.replace(/^[^\w]+/, '');
            handleChatSubmit();
        };
    });

    // Historical Briefs Actions
    elements.btnRefreshBriefs.onclick = loadBriefsData;
    if (elements.btnPreviewDraft) {
        elements.btnPreviewDraft.onclick = openSampleDraftModal;
    }
    elements.briefsListContainer.onclick = (e) => {
        const item = e.target.closest('[data-brief-id]');
        if (item) {
            const id = item.getAttribute('data-brief-id');
            openBriefModal(id);
        }
    };

    elements.btnCloseInspectBrief.onclick = () => elements.modalInspectBrief.classList.add('hidden');
    elements.btnTabRendered.onclick = () => switchBriefTab('rendered');
    elements.btnTabRaw.onclick = () => switchBriefTab('raw');

    if (elements.btnCopyRawBrief) {
        elements.btnCopyRawBrief.onclick = async () => {
            if (!currentBriefDetail?.html_content) return;
            try {
                await navigator.clipboard.writeText(currentBriefDetail.html_content);
                showToast('Raw HTML copied to clipboard!', 'success');
            } catch (copyErr) {
                showToast(`Failed to copy: ${copyErr.message}`, 'error');
            }
        };
    }

    if (elements.btnCloseUnlockVault) {
        elements.btnCloseUnlockVault.onclick = closeUnlockModal;
    }

    // Modal backdrop click-to-dismiss listeners
    [
        { modal: elements.modalUnlockVault, closeFn: closeUnlockModal },
        { modal: elements.modalVaultConfig, closeFn: closeVaultConfigModal },
        { modal: elements.modalAddEvent, closeFn: closeAddEventModal },
        { modal: elements.modalInspectBrief, closeFn: () => elements.modalInspectBrief.classList.add('hidden') },
    ].forEach(({ modal, closeFn }) => {
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeFn();
            }
        });
    });

    // Global Escape key listener to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeUnlockModal();
            closeVaultConfigModal();
            closeAddEventModal();
            if (elements.modalInspectBrief) elements.modalInspectBrief.classList.add('hidden');
        }
    });

    // Trigger Brief Dispatch
    elements.btnTriggerDispatch.onclick = triggerWorkflowDispatch;
}

function openUnlockModal() {
    elements.unlockErrorMsg.classList.add('hidden');
    elements.inputUnlockPassphrase.value = '';
    elements.modalUnlockVault.classList.remove('hidden');
    elements.inputUnlockPassphrase?.focus();
}
function closeUnlockModal() {
    elements.modalUnlockVault.classList.add('hidden');
}

function openVaultConfigModal() {
    const keys = getSessionKeys();
    elements.cfgSupabaseUrl.value = keys?.supabaseUrl || '';
    elements.cfgSupabaseAnonKey.value = keys?.supabaseAnonKey || '';
    elements.cfgGeminiKey.value = keys?.geminiApiKey || '';
    elements.modalVaultConfig.classList.remove('hidden');
}
function closeVaultConfigModal() {
    elements.modalVaultConfig.classList.add('hidden');
}

function openAddEventModal() {
    if (elements.inputEventDate) {
        elements.inputEventDate.min = new Date().toISOString().split('T')[0];
    }
    elements.modalAddEvent.classList.remove('hidden');
    elements.inputEventTitle?.focus();
}
function closeAddEventModal() {
    elements.modalAddEvent.classList.add('hidden');
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Start application
window.addEventListener('DOMContentLoaded', init);
