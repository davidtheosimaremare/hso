/**
 * PushProduct - Gemini Flash AI Service
 * Utilizes Google Gemini Flash API to generate 100% accurate, standardized
 * product titles and classifications for Siemens switchgear & automation catalog.
 */

(function (global) {
  'use strict';

  const DEFAULT_MODEL = 'gemini-3.8-flash';
  const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

  const DEFAULT_CATEGORIES = [
    'ACB',
    'MCB',
    'MCCB',
    'RCCB',
    'RCBO',
    'CONTACTOR',
    'CONTACTOR_RELAY',
    'TOR',
    'MPCB',
    'SOFT_STARTER',
    'VFD',
    'PILOT_DEVICE',
    'POWER_SUPPLY',
    'PLC_AUTOMATION',
    'SPD_MODULAR',
    'ACCESSORIES',
    'OTHER'
  ];

  function buildSystemPrompt(categories = DEFAULT_CATEGORIES) {
    const categoryListStr = JSON.stringify(categories);
    return `You are an expert Siemens Industrial Switchgear & Automation Catalog Engineer for ERP Inventory Master data (Accurate Online).

Your task: Transform raw Siemens product codes (MLFB) and messy catalog descriptions into the strictly standardized Accurate Item Master Title and Category.

TARGET TITLE FORMAT:
Format: SIEMENS [DEVICE_TYPE], [PRODUCT_CODE], [SERIES], [POLES], [AMPERE], [CURVE], [BREAKING_CAPACITY], [VOLTAGE], [ACCESSORIES/CONTACTS]

EXACT CONVERSION EXAMPLES:
1. MCB Example:
   - Code: 5TJ4110-6
   - Raw: SINOPLUS, Miniature Circuit Breaker 240/415V 10kA, 1-pole B, 10 A
   - Name: SIEMENS MCB, 5TJ4110-6, SINOPLUS, 1P, 10A, CURVE B, 10KA, 240/415V AC
   - Category: MCB

2. Sentron MCB Example:
   - Code: 5SL6116-7CC
   - Raw: SENTRON, Miniature Circuit Breaker 230/400V 6kA, 1-pole C, 16 A
   - Name: SIEMENS MCB, 5SL6116-7CC, SENTRON, 1P, 16A, CURVE C, 6KA, 230/400V AC
   - Category: MCB

3. MCCB Example:
   - Code: 3VA1110-3ED32-0AA0
   - Raw: SENTRON, Molded Case Circuit Breaker 3VA1, 3-pole, In=100A, Icu=25kA @ 415V, TM210
   - Name: SIEMENS MCCB, 3VA1110-3ED32-0AA0, SENTRON 3VA1, 3P, 100A, 25KA, 415V AC
   - Category: MCCB

4. Contactor Example:
   - Code: 3RT2026-1AP00
   - Raw: SIRIUS, Power Contactor, AC-3 25 A, 11 kW / 400 V, 1 NO + 1 NC, 230 V AC, 50/60 Hz, 3-pole
   - Name: SIEMENS CONTACTOR, 3RT2026-1AP00, SIRIUS 3RT2, 3P, 25A, 11KW, 230V AC, 1NO+1NC
   - Category: CONTACTOR

5. Thermal Overload Relay Example:
   - Code: 3RU2126-4BB0
   - Raw: SIRIUS, Thermal Overload Relay, 14...20 A, Class 10, 1 NO + 1 NC
   - Name: SIEMENS TOR, 3RU2126-4BB0, SIRIUS 3RU21, 14-20A, CLASS 10, 1NO+1NC
   - Category: TOR

6. RCCB Example:
   - Code: 5SV3312-6
   - Raw: SENTRON, Residual current operated circuit breaker, 2-pole, type A, In: 25 A, 30 mA, Un AC: 230 V
   - Name: SIEMENS RCCB, 5SV3312-6, SENTRON 5SV, 2P, 25A, 30MA, 230V AC
   - Category: RCCB

7. LV HRC / NH Fuse Link Example:
   - Code: 3NA3820-6
   - Raw: SENTRON, LV HRC fuse link, with blade contacts, NH00, In: 50 A, gG, Un AC: 690 V, Un DC: 250 V, Front indicator, live grip lugs
   - Name: SIEMENS FUSE LINK, 3NA3820-6, SENTRON, NH00, 50A, GG, 690V AC / 250V DC
   - Category: ACCESSORIES

8. Cylindrical / SITOR Fuse Example:
   - Code: 3NE1818-0
   - Raw: SITOR fuse link, with female contact on both sides, size 000, In: 63 A, gR, Un AC: 690 V, Un DC: 250 V
   - Name: SIEMENS SITOR FUSE, 3NE1818-0, SITOR, SIZE 000, 63A, GR, 690V AC / 250V DC
   - Category: ACCESSORIES

9. Motor Starter Protector / MPCB Example:
   - Code: 3RV2011-1EA10
   - Raw: SIRIUS, Motor starter protector size S00 for motor protection, CLASS 10, A-release 2.8...4 A, N-release 52 A, screw terminal
   - Name: SIEMENS MPCB, 3RV2011-1EA10, SIRIUS 3RV2, 2.8-4A, CLASS 10, SIZE S00
   - Category: MPCB

DEVICE TYPE ABBREVIATIONS:
- Miniature Circuit Breaker -> MCB
- Molded/Moulded Case Circuit Breaker -> MCCB
- Air Circuit Breaker -> ACB
- Residual Current Circuit Breaker / ELCB -> RCCB
- RCBO -> RCBO
- Fuse Link (LV HRC, NH, SITOR, Cylindrical) -> FUSE LINK
- Contactor / Kontaktor -> CONTACTOR
- Auxiliary Contactor / Contactor Relay -> CONTACTOR_RELAY
- Thermal Overload Relay -> TOR
- Motor Starter Protector / Motor Protection Circuit Breaker -> MPCB
- Soft Starter -> SOFT_STARTER
- Frequency Converter / Inverter -> VFD
- Pilot Device / Push Button / Indicator -> PILOT_DEVICE
- Industrial Power Supply -> POWER_SUPPLY
- PLC / SIMATIC / LOGO! -> PLC_AUTOMATION
- Surge Protection Device -> SPD_MODULAR
- Accessories -> ACCESSORIES

ACCURATE CATEGORIES (MANDATORY REQUIREMENT):
You MUST select the "category" value strictly from this list of authentic Accurate Item Categories:
${categoryListStr}

Do NOT output any category outside of this list!

RULES:
- Always start with "SIEMENS [DEVICE_TYPE]"
- All letters in title must be UPPERCASE except brand casing if applicable (use comma and space separator)
- Brand is always "Siemens"
- Item Type is always "Persediaan"
- Unit is always "pcs"
- Only omit fields (like Curve or Contacts) if they genuinely do not apply to that product category.
- Output strictly pure valid JSON without markdown code blocks.`;
  }

  // Robust JSON extractor
  function extractJson(text) {
    if (!text) return null;
    const cleaned = text.replace(/```json\s*|```\s*/gi, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (e) {
        console.warn('[GeminiService] JSON slice parse error:', e);
      }
    }
    try {
      return JSON.parse(cleaned);
    } catch {}
    return null;
  }

  /**
   * Normalize and sanitize model name to ensure deprecated/unsupported models
   * (e.g. gemini-2.5-flash, gemini-1.5-flash) are automatically upgraded to gemini-3.8-flash.
   */
  function sanitizeModelName(modelName) {
    if (!modelName) return DEFAULT_MODEL;
    let clean = String(modelName).trim().replace(/^models\//, '');
    if (clean.includes('2.5') || clean.includes('1.5') || clean === 'gemini-flash') {
      return DEFAULT_MODEL;
    }
    return clean || DEFAULT_MODEL;
  }

  /**
   * Pick the most modern and reliable available model from a list.
   * Strictly prioritizes gemini-3.8-flash and rejects deprecated 2.5/1.5 models.
   */
  function pickBestModel(models = []) {
    if (!models || models.length === 0) return DEFAULT_MODEL;

    // Filter out deprecated models that fail with 404 for new users
    const valid = models.filter(m => {
      const id = (typeof m === 'string' ? m : m.id || '').toLowerCase();
      return !id.includes('2.5') && !id.includes('1.5');
    });

    const candidates = valid.length > 0 ? valid : models;

    // 1. Look for gemini-3.8-flash
    const m38Flash = candidates.find(m => {
      const id = (typeof m === 'string' ? m : m.id || '');
      return id === 'gemini-3.8-flash' || id.includes('3.8-flash');
    });
    if (m38Flash) return (typeof m38Flash === 'string' ? m38Flash : m38Flash.id);

    // 2. Look for any 3.8 model
    const m38 = candidates.find(m => {
      const id = (typeof m === 'string' ? m : m.id || '');
      return id.includes('3.8');
    });
    if (m38) return (typeof m38 === 'string' ? m38 : m38.id);

    // 3. Look for gemini-2.0-flash
    const m20 = candidates.find(m => {
      const id = (typeof m === 'string' ? m : m.id || '');
      return id.includes('2.0-flash');
    });
    if (m20) return (typeof m20 === 'string' ? m20 : m20.id);

    // 4. Any other flash model (excluding 2.5 and 1.5)
    const anyFlash = candidates.find(m => {
      const id = (typeof m === 'string' ? m : m.id || '');
      return /flash/i.test(id);
    });
    if (anyFlash) return (typeof anyFlash === 'string' ? anyFlash : anyFlash.id);

    const first = candidates[0];
    return (typeof first === 'string' ? first : first.id) || DEFAULT_MODEL;
  }

  /**
   * Call Gemini Flash API with automatic retry and model failover
   */
  async function callGeminiFlash({ apiKey, model, code, description, price, extraContext = '', categories = DEFAULT_CATEGORIES, _retryCount = 0 }) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API Key Google Gemini belum diatur. Silakan atur di Tab Pengaturan ekstensi.');
    }

    let cleanModel = sanitizeModelName(model);
    const cleanKey = apiKey.trim();
    const endpoint = `${BASE_URL}/models/${cleanModel}:generateContent?key=${cleanKey}`;
    const activeCategories = (categories && Array.isArray(categories) && categories.length > 0) ? categories : DEFAULT_CATEGORIES;
    const systemPrompt = buildSystemPrompt(activeCategories);

    const userMessage = `PRODUCT TO ANALYZE:
Product Code (MLFB): ${code || '-'}
Raw Catalog Description: ${description || '-'}
${extraContext ? `Additional Web Context: ${extraContext}` : ''}

Respond with strictly valid JSON format:
{
  "name": "<Standardized Item Title>",
  "code": "<Product Code>",
  "category": "<Exact match from ${JSON.stringify(activeCategories)}>",
  "brand": "Siemens",
  "itemType": "Persediaan",
  "unit": "pcs",
  "series": "<Series Name>",
  "specs": {
    "deviceType": "...",
    "poles": "...",
    "ampere": "...",
    "curve": "...",
    "breakingCapacity": "...",
    "voltage": "..."
  },
  "explanation": "<Brief 1-sentence explanation of detected specs>"
}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userMessage}` }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } catch (netErr) {
      if (_retryCount < 1) {
        await new Promise(r => setTimeout(r, 1200));
        return await callGeminiFlash({
          apiKey, model: cleanModel, code, description, price, extraContext, categories, _retryCount: _retryCount + 1
        });
      }
      throw netErr;
    }

    if (!response.ok) {
      // 1. Handle 503 (High Demand) or 429 (Rate Limit):
      // First attempt: Wait 1.5 seconds and retry same model
      if ((response.status === 503 || response.status === 429) && _retryCount === 0) {
        console.warn(`[GeminiService] Model ${cleanModel} high demand (503). Retrying in 1.5s...`);
        await new Promise(r => setTimeout(r, 1500));
        return await callGeminiFlash({
          apiKey,
          model: cleanModel,
          code,
          description,
          price,
          extraContext,
          categories,
          _retryCount: 1
        });
      }

      // Second attempt or persistent 503: Switch to alternate model (3.8-flash <-> 2.0-flash)
      if (response.status === 503 || response.status === 429) {
        const altModel = cleanModel.includes('3.8') ? 'gemini-2.0-flash' : 'gemini-3.8-flash';
        console.warn(`[GeminiService] Model ${cleanModel} is experiencing high demand (503). Auto-failing over to ${altModel}...`);
        try {
          const altResult = await callGeminiFlash({
            apiKey,
            model: altModel,
            code,
            description,
            price,
            extraContext,
            categories,
            _retryCount: 2
          });
          altResult.usedModel = altModel;
          return altResult;
        } catch (altErr) {
          console.warn(`[GeminiService] Alternative model ${altModel} also busy:`, altErr);
        }
      }

      // 2. If model returned 404 (not found or deprecated), query available models and auto-retry
      if (response.status === 404) {
        console.warn(`[GeminiService] Model ${cleanModel} not available (404). Querying available models...`);
        try {
          const available = await listAvailableModels(apiKey);
          const fallbackModel = pickBestModel(available);
          if (fallbackModel && fallbackModel !== cleanModel) {
            console.log(`[GeminiService] Auto-retrying with best available model: ${fallbackModel}`);
            return await callGeminiFlash({
              apiKey,
              model: fallbackModel,
              code,
              description,
              price,
              extraContext,
              categories,
              _retryCount: _retryCount + 1
            });
          }
        } catch (e) {
          console.warn('[GeminiService] Model auto-fallback failed:', e);
        }
      }

      // 3. If responseMimeType is unsupported on some older flash variants, retry without it
      if (response.status === 400 && requestBody.generationConfig?.responseMimeType) {
        delete requestBody.generationConfig.responseMimeType;
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr = jsonErr.error?.message || errText;
      } catch (e) {}
      throw new Error(`Gemini Flash Error (${response.status}): ${parsedErr}`);
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsedData = extractJson(candidateText);

    if (!parsedData || !parsedData.name) {
      throw new Error('Gagal memproses respons JSON dari Gemini Flash: ' + candidateText.slice(0, 100));
    }

    parsedData.usedModel = cleanModel;
    return parsedData;
  }

  /**
   * Fetch all models available for the provided API key
   */
  async function listAvailableModels(apiKey) {
    if (!apiKey || !apiKey.trim()) return [];
    const cleanKey = apiKey.trim();
    const url = `${BASE_URL}/models?key=${cleanKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        msg = JSON.parse(errText).error?.message || errText;
      } catch (e) {}
      throw new Error(`Gagal memuat daftar model (${res.status}): ${msg}`);
    }
    const json = await res.json();
    const models = (json.models || [])
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => {
        const id = m.name.replace(/^models\//, '');
        return {
          id,
          name: id,
          displayName: m.displayName || id,
          description: m.description || ''
        };
      })
      // Strictly filter out models deprecated by Google (like 2.5 and 1.5)
      .filter(m => !m.id.includes('2.5') && !m.id.includes('1.5'));

    // Sort to place 3.8-flash first
    models.sort((a, b) => {
      if (a.id === 'gemini-3.8-flash') return -1;
      if (b.id === 'gemini-3.8-flash') return 1;
      if (a.id.includes('3.8')) return -1;
      if (b.id.includes('3.8')) return 1;
      if (a.id.includes('2.0-flash')) return -1;
      if (b.id.includes('2.0-flash')) return 1;
      return a.id.localeCompare(b.id);
    });

    return models;
  }

  /**
   * Test Connection to Gemini & dynamically discover available models
   */
  async function testGeminiConnection(apiKey, model = DEFAULT_MODEL) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('API Key Google Gemini belum diatur.');
    }

    // 1. Fetch live models available for this user's API Key
    const availableModels = await listAvailableModels(apiKey);
    if (!availableModels || availableModels.length === 0) {
      throw new Error('Tidak ada model Gemini yang mendukung generateContent pada API Key ini.');
    }

    // 2. Select target model:
    let targetModel = sanitizeModelName(model);
    const modelExists = availableModels.some(m => m.id === targetModel);

    if (!modelExists) {
      targetModel = pickBestModel(availableModels);
    }

    // 3. Test generateContent with the validated model, with automatic fallback if 503
    try {
      const testResult = await callGeminiFlash({
        apiKey,
        model: targetModel,
        code: '5TJ4110-6',
        description: 'SINOPLUS, Miniature Circuit Breaker 240/415V 10kA, 1-pole B, 10 A'
      });

      return {
        ...testResult,
        usedModel: testResult.usedModel || targetModel,
        availableModels
      };
    } catch (testErr) {
      if (testErr.message && (testErr.message.includes('503') || testErr.message.includes('high demand'))) {
        const altModel = targetModel.includes('3.8') ? 'gemini-2.0-flash' : 'gemini-3.8-flash';
        console.warn(`[GeminiService] Primary model ${targetModel} is high demand (503). Testing alternative: ${altModel}...`);
        const altResult = await callGeminiFlash({
          apiKey,
          model: altModel,
          code: '5TJ4110-6',
          description: 'SINOPLUS, Miniature Circuit Breaker 240/415V 10kA, 1-pole B, 10 A'
        });
        return {
          ...altResult,
          usedModel: altModel,
          note: `Model ${altModel} aktif (dialihkan karena ${targetModel} sedang antre di server Google)`,
          availableModels
        };
      }
      throw testErr;
    }
  }

  // Export
  const GeminiService = {
    DEFAULT_MODEL,
    callGeminiFlash,
    listAvailableModels,
    testGeminiConnection,
    extractJson
  };

  if (typeof globalThis !== 'undefined') globalThis.GeminiService = GeminiService;
  if (typeof window !== 'undefined') window.GeminiService = GeminiService;
  if (typeof self !== 'undefined') self.GeminiService = GeminiService;
  if (typeof module !== 'undefined' && module.exports) module.exports = GeminiService;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
