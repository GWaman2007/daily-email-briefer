/**
 * DailyBriefer v2 - Supabase Client Bridge
 * Interacts with PostgreSQL directly using @supabase/supabase-js with decrypted anon credentials.
 */

let supabaseClient = null;

/**
 * Initialize Supabase JS Client with project URL and public Anon key.
 */
export function initDb(supabaseUrl, supabaseAnonKey) {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase JS library not loaded. Please ensure script tag is present.');
    }
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    window.__dailyBrieferDb = supabaseClient;
    return supabaseClient;
}

/**
 * Ensure database client is initialized.
 */
function getClient() {
    const client = supabaseClient || window.__dailyBrieferDb;
    if (!client) {
        throw new Error('Database client not initialized. Please unlock your vault first.');
    }
    return client;
}

/**
 * Fetch singleton user profile (id=1).
 */
export async function fetchProfile() {
    const client = getClient();
    const { data, error } = await client
        .from('profile')
        .select('*')
        .eq('id', 1)
        .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
}

/**
 * Update user profile settings.
 * @param {Object} updates Dictionary of fields to update on the profile row.
 */
export async function updateProfile(updates) {
    const client = getClient();
    const payload = {
        ...updates,
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
        .from('profile')
        .update(payload)
        .eq('id', 1)
        .select();

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
}

/**
 * Fetch active event milestones ordered by date ascending.
 */
export async function fetchActiveEvents() {
    const client = getClient();
    const { data, error } = await client
        .from('events')
        .select('*')
        .eq('status', 'active')
        .order('event_date', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Fetch expired event history.
 */
export async function fetchExpiredEvents() {
    const client = getClient();
    const { data, error } = await client
        .from('events')
        .select('*')
        .eq('status', 'expired')
        .order('event_date', { ascending: false })
        .limit(20);

    if (error) throw error;
    return data || [];
}

/**
 * Create a new active milestone event.
 * @param {string} title 
 * @param {string} eventDate ISO date (YYYY-MM-DD)
 */
export async function createEvent(title, eventDate) {
    const client = getClient();
    const { data, error } = await client
        .from('events')
        .insert([
            {
                title: title.trim(),
                event_date: eventDate,
                status: 'active',
            }
        ])
        .select();

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
}

/**
 * Delete an event by UUID.
 */
export async function deleteEvent(id) {
    const client = getClient();
    const { error } = await client
        .from('events')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}

/**
 * Fetch historical briefs archive list.
 * @param {number} limit 
 * @param {number} offset 
 */
export async function fetchBriefs(limit = 15, offset = 0) {
    const client = getClient();
    const { data, error } = await client
        .from('briefs')
        .select('id, subject, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
}

/**
 * Fetch full brief by UUID (including full HTML content).
 */
export async function fetchBriefById(id) {
    const client = getClient();
    const { data, error } = await client
        .from('briefs')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}
