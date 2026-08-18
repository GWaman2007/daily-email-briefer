/**
 * DailyBriefer v2 - AI Preference Tuning Engine (Client Side)
 * Direct browser-to-Gemini REST client for interactive preference adjustments and event extraction.
 */

import { updateProfile, createEvent } from './db.js';

const CANDIDATE_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
];

/**
 * Call Gemini API endpoint with direct REST fetch and automatic model fallback.
 */
async function callGeminiRest(geminiApiKey, prompt, preferredModel = 'gemini-3.5-flash-lite') {
    const modelsToTry = [preferredModel, ...CANDIDATE_MODELS.filter(m => m !== preferredModel)];
    let lastError = null;

    for (const model of modelsToTry) {
        const cleanModel = model.replace('models/', '');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

        const payload = {
            contents: [
                {
                    parts: [
                        { text: prompt }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.3,
                responseMimeType: 'application/json',
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status} (${cleanModel}): ${errText}`);
            }

            const data = await response.json();
            const candidates = data.candidates || [];
            if (candidates.length === 0) {
                throw new Error(`Empty candidates returned from Gemini (${cleanModel})`);
            }

            const parts = candidates[0].content?.parts || [];
            if (parts.length === 0) {
                throw new Error(`Empty content parts returned from Gemini (${cleanModel})`);
            }

            return parts[0].text;
        } catch (err) {
            console.warn(`Model ${cleanModel} failed: ${err.message}. Trying next fallback model...`);
            lastError = err;
        }
    }

    throw new Error(`All Gemini candidate models failed. Last error: ${lastError?.message}`);
}

/**
 * Process conversational preference adjustment and extract any upcoming milestones.
 * @param {string} userMessage User's chat message
 * @param {Object} currentProfile Current profile row from DB
 * @param {string} geminiApiKey User's decrypted Gemini API key
 */
export async function processTuningMessage(userMessage, currentProfile, geminiApiKey) {
    const today = new Date().toISOString().split('T')[0];
    const currentSummary = currentProfile?.preferences_summary || 'Focus on software engineering, AI breakthroughs, and world news.';
    const currentTone = currentProfile?.persona_tone || 'Analytical & Direct';
    const preferredModel = currentProfile?.primary_model || 'gemini-3.5-flash-lite';

    const prompt = `You are DailyBriefer's AI Preference Tuning & Event Extraction Assistant.
Today's date is: ${today}.

Current User Profile State:
- Preferences Summary: "${currentSummary}"
- Persona Tone: "${currentTone}"

User Request / Instruction:
"${userMessage}"

Tasks:
1. Analyze the user's request.
2. If the user wants to adjust their interests, focus topics, or briefing tone, synthesize an updated concise preferences summary (under 200 words) and updated persona tone. If unchanged, keep the existing values.
3. Extract any specific future dates, deadlines, product launches, conferences, or milestones mentioned in the message into the "extracted_events" array with title and ISO date (YYYY-MM-DD). If no future events are mentioned, return an empty array [].
4. Write a friendly, conversational confirmation response in "reply_message" explaining what was updated.

Output STRICT JSON with the following structure:
{
  "updated_preferences_summary": "...",
  "updated_persona_tone": "...",
  "extracted_events": [
    {
      "title": "Concise event title",
      "date": "YYYY-MM-DD"
    }
  ],
  "reply_message": "..."
}
`;

    const rawText = await callGeminiRest(geminiApiKey, prompt, preferredModel);

    let parsedResult;
    try {
        const cleaned = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        parsedResult = JSON.parse(cleaned);
    } catch (e) {
        console.error('Failed to parse Gemini JSON output:', rawText);
        throw new Error('Received non-JSON response from Gemini. Please try again.');
    }

    const {
        updated_preferences_summary = currentSummary,
        updated_persona_tone = currentTone,
        extracted_events = [],
        reply_message = 'Preferences updated successfully.'
    } = parsedResult;

    // Automatically commit profile changes to Supabase DB
    const profileChanged = (
        updated_preferences_summary !== currentSummary ||
        updated_persona_tone !== currentTone
    );

    let updatedProfile = currentProfile;
    if (profileChanged) {
        updatedProfile = await updateProfile({
            preferences_summary: updated_preferences_summary,
            persona_tone: updated_persona_tone,
        });
    }

    // Automatically commit extracted events to Supabase DB
    const createdEvents = [];
    if (Array.isArray(extracted_events) && extracted_events.length > 0) {
        for (const ev of extracted_events) {
            if (ev.title && ev.date) {
                try {
                    const newEv = await createEvent(ev.title, ev.date);
                    if (newEv) createdEvents.push(newEv);
                } catch (evErr) {
                    console.warn('Failed to auto-create event:', evErr);
                }
            }
        }
    }

    return {
        replyMessage: reply_message,
        updatedProfile: updatedProfile,
        createdEvents: createdEvents,
        raw: parsedResult,
    };
}
