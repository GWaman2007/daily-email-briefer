/**
 * DailyBriefer v2 - Client Cryptographic Vault
 * Implements PBKDF2 (100k rounds, SHA-256) + AES-GCM-256 for zero-trust browser key storage.
 */

const VAULT_STORAGE_KEY = 'dailybriefer_vault';
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// Ephemeral in-memory keyring (never persisted in plaintext)
let sessionKeyring = null;

// Utility: ArrayBuffer to Base64
function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Utility: Base64 to Uint8Array
function base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Derive AES-GCM-256 CryptoKey from user passphrase and salt using PBKDF2.
 */
async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const passphraseKey = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        passphraseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt secrets payload and store in localStorage.
 * @param {string} passphrase 
 * @param {Object} payloadObj { supabaseUrl, supabaseAnonKey, geminiApiKey, githubPat, githubRepo }
 */
export async function encryptVault(passphrase, payloadObj) {
    if (!passphrase || passphrase.length < 4) {
        throw new Error('Passphrase must be at least 4 characters long.');
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(passphrase, salt);

    const enc = new TextEncoder();
    const plaintext = JSON.stringify(payloadObj);
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        enc.encode(plaintext)
    );

    const vaultRecord = {
        salt: bufferToBase64(salt),
        iv: bufferToBase64(iv),
        data: bufferToBase64(ciphertextBuffer),
    };

    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vaultRecord));
    sessionKeyring = { ...payloadObj };
    return sessionKeyring;
}

/**
 * Decrypt secrets from localStorage into ephemeral session memory.
 * @param {string} passphrase 
 */
export async function decryptVault(passphrase) {
    const rawVault = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!rawVault) {
        throw new Error('No encrypted vault found. Please configure your credentials first.');
    }

    let vaultRecord;
    try {
        vaultRecord = JSON.parse(rawVault);
    } catch (e) {
        throw new Error('Corrupted vault storage data.');
    }

    const { salt, iv, data } = vaultRecord;
    if (!salt || !iv || !data) {
        throw new Error('Invalid vault record structure.');
    }

    const saltBytes = base64ToBuffer(salt);
    const ivBytes = base64ToBuffer(iv);
    const ciphertextBytes = base64ToBuffer(data);

    try {
        const key = await deriveKey(passphrase, saltBytes);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBytes },
            key,
            ciphertextBytes
        );

        const dec = new TextDecoder();
        const jsonStr = dec.decode(decryptedBuffer);
        const payload = JSON.parse(jsonStr);

        sessionKeyring = payload;
        return sessionKeyring;
    } catch (err) {
        throw new Error('Incorrect passphrase or authentication tag verification failed.');
    }
}

/**
 * Check if an encrypted vault exists in browser storage.
 */
export function isVaultConfigured() {
    return !!localStorage.getItem(VAULT_STORAGE_KEY);
}

/**
 * Check if the session is currently unlocked with decrypted keys in memory.
 */
export function isSessionUnlocked() {
    return sessionKeyring !== null;
}

/**
 * Get decrypted secrets from ephemeral memory.
 */
export function getSessionKeys() {
    return sessionKeyring;
}

/**
 * Update the in-memory session and re-encrypt the stored vault.
 */
export async function updateVaultPayload(passphrase, updatedPayload) {
    return await encryptVault(passphrase, updatedPayload);
}

/**
 * Lock session by erasing secrets from ephemeral RAM.
 */
export function lockVault() {
    sessionKeyring = null;
}

/**
 * Clear vault completely from localStorage.
 */
export function clearVault() {
    sessionKeyring = null;
    localStorage.removeItem(VAULT_STORAGE_KEY);
}
