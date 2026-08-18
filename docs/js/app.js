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
    inputPreferencesSummary: document.getElementById('inputPreferencesSummary'),

    // Briefs Archive
    briefsListContainer: document.getElementById('briefsListContainer'),
    btnRefreshBriefs: document.getElementById('btnRefreshBriefs'),

    // Modals
    modalUnlockVault: document.getElementById('modalUnlockVault'),
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
    briefIframe: document.getElementById('briefIframe'),
    briefRawCode: document.getElementById('briefRawCode'),

    toastContainer: document.getElementById('toastContainer'),
};

/**
 * Display toast notification.
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast pointer-events-auto p-3.5 rounded-xl shadow-lg border text-xs font-medium flex items-center justify-between space-x-3 transition-all duration-300 ${
        type === 'success' ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200' :
        type === 'error' ? 'bg-rose-950/90 border-rose-500/30 text-rose-200' :
        type === 'warning' ? 'bg-amber-950/90 border-amber-500/30 text-amber-200' :
        'bg-slate-900/90 border-slate-700 text-slate-200'
    }`;

    toast.innerHTML = `
        <div class="flex items-center space-x-2">
            <span>${message}</span>
        </div>
        <button class="text-slate-400 hover:text-white">&times;</button>
    `;

    toast.querySelector('button').onclick = () => toast.remove();
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 4500);
}

/**
 * Initialize application lifecycle.
 */
function init() {
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
    if (elements.vaultIcon) elements.vaultIcon.setAttribute('class', 'w-4 h-4 mr-1.5 text-emerald-400');
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
        elements.statActiveState.className = isActive ? 'text-sm font-bold text-emerald-400 mt-0.5' : 'text-sm font-bold text-slate-500 mt-0.5';

        elements.statRecipientEmail.textContent = currentProfile.recipient_email || 'Not configured';
        elements.statPersonaTone.textContent = currentProfile.persona_tone || 'Analytical & Direct';

        // Populate manual config form
        elements.inputRecipientEmail.value = currentProfile.recipient_email || '';
        elements.inputPersonaTone.value = currentProfile.persona_tone || '';
        elements.inputPrimaryModel.value = currentProfile.primary_model || 'gemini-3.5-flash-lite';
        elements.inputFallbackModel.value = currentProfile.fallback_model || 'gemini-3.1-flash-lite';
        elements.selectSearchTopic.value = currentProfile.search_topic || 'news';
        elements.selectSearchDepth.value = currentProfile.search_depth || 'basic';
        elements.inputPreferencesSummary.value = currentProfile.preferences_summary || '';

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
            elements.activeEventsContainer.innerHTML = '<div class="text-center py-6 text-xs text-slate-500">No active milestones configured.</div>';
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            elements.activeEventsContainer.innerHTML = activeEvents.map(ev => {
                const eventDate = new Date(ev.event_date + 'T00:00:00');
                const diffTime = eventDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let badge = '';
                if (diffDays === 0) {
                    badge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">TODAY!</span>';
                } else if (diffDays === 1) {
                    badge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Tomorrow</span>';
                } else if (diffDays > 1) {
                    badge = `<span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">in ${diffDays} days</span>`;
                } else {
                    badge = '<span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-800 text-slate-500">Passed</span>';
                }

                return `
                    <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition">
                        <div class="flex items-center space-x-2.5 truncate mr-2">
                            <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                            <span class="font-medium text-slate-200 truncate">${escapeHtml(ev.title)}</span>
                            <span class="text-slate-500 text-[11px] font-mono">(${ev.event_date})</span>
                            ${badge}
                        </div>
                        <button data-delete-event="${ev.id}" class="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition" title="Delete Milestone">
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
            elements.expiredEventsContainer.innerHTML = '<div class="text-slate-600 italic">No expired milestones.</div>';
        } else {
            elements.expiredEventsContainer.innerHTML = expiredEvents.map(ev => `
                <div class="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-900">
                    <span class="line-through text-slate-500">${escapeHtml(ev.title)}</span>
                    <span class="text-slate-600 text-[10px] font-mono">${ev.event_date}</span>
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
            elements.briefsListContainer.innerHTML = '<div class="text-center py-10 text-slate-500">No historical briefs generated yet. Trigger your first brief to see digests!</div>';
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
                <div data-brief-id="${b.id}" class="brief-item p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900 transition cursor-pointer group">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] font-mono text-cyan-400">${dateStr}</span>
                        <span class="text-[10px] text-slate-500 group-hover:text-cyan-300 transition">View Digest →</span>
                    </div>
                    <h4 class="font-medium text-slate-200 group-hover:text-white line-clamp-2 leading-snug">${escapeHtml(b.subject)}</h4>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading briefs:', err);
        elements.briefsListContainer.innerHTML = `<div class="text-rose-400 text-center py-6">Failed to load briefs: ${err.message}</div>`;
    }
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
        elements.btnTabRendered.className = 'px-3 py-1 rounded-md bg-cyan-500/20 text-cyan-400 font-semibold';
        elements.btnTabRaw.className = 'px-3 py-1 rounded-md text-slate-400 hover:text-white';
        elements.briefIframe.classList.remove('hidden');
        elements.briefRawCode.classList.add('hidden');
    } else {
        elements.btnTabRaw.className = 'px-3 py-1 rounded-md bg-cyan-500/20 text-cyan-400 font-semibold';
        elements.btnTabRendered.className = 'px-3 py-1 rounded-md text-slate-400 hover:text-white';
        elements.briefRawCode.classList.remove('hidden');
        elements.briefIframe.classList.add('hidden');
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
        div.className = 'flex items-start justify-end space-x-2';
        div.innerHTML = `
            <div class="p-3 rounded-2xl rounded-tr-none bg-purple-600/30 border border-purple-500/40 text-purple-100 text-xs leading-relaxed max-w-[85%]">
                ${escapeHtml(text)}
            </div>
            <div class="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold">U</div>
        `;
    } else if (sender === 'error') {
        div.className = 'flex items-start space-x-2';
        div.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-rose-600/30 text-rose-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">!</div>
            <div class="p-3 rounded-2xl rounded-tl-none bg-rose-950/80 border border-rose-800 text-rose-200 text-xs leading-relaxed max-w-[85%]">
                ${escapeHtml(text)}
            </div>
        `;
    } else {
        div.className = 'flex items-start space-x-2';
        div.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-purple-600/30 text-purple-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold">AI</div>
            <div class="p-3 rounded-2xl rounded-tl-none bg-slate-900/90 border border-slate-800 text-slate-200 text-xs leading-relaxed max-w-[85%]">
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
    div.className = 'flex items-start space-x-2';
    div.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-purple-600/30 text-purple-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold">AI</div>
        <div class="p-3 rounded-2xl rounded-tl-none bg-slate-900/90 border border-slate-800 text-slate-400 text-xs flex items-center space-x-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.2s]"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.4s]"></span>
            <span class="ml-1 text-[11px] text-slate-400">Synthesizing adjustments...</span>
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
            if (elements.vaultIcon) elements.vaultIcon.setAttribute('class', 'w-4 h-4 mr-1.5 text-amber-400');
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
            elements.statActiveState.className = isActive ? 'text-sm font-bold text-emerald-400 mt-0.5' : 'text-sm font-bold text-slate-500 mt-0.5';
            showToast(isActive ? 'Daily briefing enabled.' : 'Daily briefing paused.', 'info');
        } catch (err) {
            showToast(`Failed to update status: ${err.message}`, 'error');
            elements.toggleActiveStatus.checked = !isActive;
        }
    };

    // Direct Profile Save
    elements.btnSaveProfileDirect.onclick = async () => {
        try {
            const updates = {
                recipient_email: elements.inputRecipientEmail.value.trim(),
                persona_tone: elements.inputPersonaTone.value.trim(),
                primary_model: elements.inputPrimaryModel.value.trim(),
                fallback_model: elements.inputFallbackModel.value.trim(),
                search_topic: elements.selectSearchTopic.value,
                search_depth: elements.selectSearchDepth.value,
                preferences_summary: elements.inputPreferencesSummary.value.trim(),
            };

            await updateProfile(updates);
            await loadProfileData();
            showToast('Profile and engine settings saved!', 'success');
        } catch (err) {
            showToast(`Failed to save settings: ${err.message}`, 'error');
        }
    };

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
            elements.chatInput.value = chip.textContent.trim().replace(/^[^\w]+/, '');
            handleChatSubmit();
        };
    });

    // Historical Briefs Actions
    elements.btnRefreshBriefs.onclick = loadBriefsData;
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

    // Trigger Brief Dispatch
    elements.btnTriggerDispatch.onclick = triggerWorkflowDispatch;
}

function openUnlockModal() {
    elements.unlockErrorMsg.classList.add('hidden');
    elements.inputUnlockPassphrase.value = '';
    elements.modalUnlockVault.classList.remove('hidden');
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
    elements.modalAddEvent.classList.remove('hidden');
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
