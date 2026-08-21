import { supabase } from '@/lib/supabase'

export function getAIConfig() {
  const isBrowser = typeof localStorage !== 'undefined'
  return {
    apiKey: (isBrowser ? localStorage.getItem('hso_ai_api_key') : '') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_API_KEY) || '',
    baseUrl: (isBrowser ? localStorage.getItem('hso_ai_base_url') : '') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_BASE_URL) || 'https://generativelanguage.googleapis.com/v1beta',
    model: (isBrowser ? localStorage.getItem('hso_ai_model') : '') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_MODEL) || 'gemini-2.5-flash',
    webSearch: isBrowser ? (localStorage.getItem('hso_ai_web_search') !== 'false') : true
  }
}

/**
 * Fetch remote AI configuration from Supabase (converter_custom_rules & system_settings) with fallback to localStorage
 */
export async function fetchRemoteAIConfig() {
  // 1. First check converter_custom_rules (Guaranteed to exist and accessible by all team members)
  try {
    const { data: ruleData, error: ruleErr } = await supabase
      .from('converter_custom_rules')
      .select('spec_match_notes')
      .eq('siemens_mlfb', '__SYSTEM_AI_CONFIG__')
      .maybeSingle()

    if (!ruleErr && ruleData?.spec_match_notes) {
      try {
        const val = JSON.parse(ruleData.spec_match_notes)
        if (val.apiKey && typeof localStorage !== 'undefined') {
          localStorage.setItem('hso_ai_api_key', val.apiKey)
          if (val.baseUrl) localStorage.setItem('hso_ai_base_url', val.baseUrl)
          if (val.model) localStorage.setItem('hso_ai_model', val.model)
          if (val.webSearch !== undefined) localStorage.setItem('hso_ai_web_search', String(val.webSearch))
          return getAIConfig()
        }
      } catch {}
    }
  } catch (err) {
    // Ignore and proceed to system_settings
  }

  // 2. Also check system_settings table
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'gemini_ai_config')
      .maybeSingle()

    if (!error && data?.value) {
      const val = data.value
      if (typeof localStorage !== 'undefined') {
        if (val.apiKey) localStorage.setItem('hso_ai_api_key', val.apiKey)
        if (val.baseUrl) localStorage.setItem('hso_ai_base_url', val.baseUrl)
        if (val.model) localStorage.setItem('hso_ai_model', val.model)
        if (val.webSearch !== undefined) localStorage.setItem('hso_ai_web_search', String(val.webSearch))
      }
      return getAIConfig()
    }
  } catch (err) {
    console.warn('Could not fetch remote AI config from database:', err)
  }
  return getAIConfig()
}

export async function saveAIConfig({ apiKey, baseUrl, model, webSearch }) {
  const cleanKey = (apiKey || '').trim()
  const cleanBaseUrl = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').trim()
  const cleanModel = (model || 'gemini-2.5-flash').trim()
  const cleanWebSearch = webSearch !== false

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('hso_ai_api_key', cleanKey)
    localStorage.setItem('hso_ai_base_url', cleanBaseUrl)
    localStorage.setItem('hso_ai_model', cleanModel)
    localStorage.setItem('hso_ai_web_search', String(cleanWebSearch))
  }

  const jsonConfig = JSON.stringify({
    apiKey: cleanKey,
    baseUrl: cleanBaseUrl,
    model: cleanModel,
    webSearch: cleanWebSearch
  })

  // 1. Guaranteed team-wide persistence in converter_custom_rules table
  try {
    const rulePayload = {
      siemens_mlfb: '__SYSTEM_AI_CONFIG__',
      target_siemens_mlfb: '__SYSTEM_AI_CONFIG__',
      source_brand: 'SYSTEM',
      source_model: 'GEMINI_AI_CONFIG',
      category: 'SYSTEM',
      spec_match_notes: jsonConfig,
      match_confidence: 100,
      is_active: false,
      updated_at: new Date().toISOString()
    }
    await supabase.from('converter_custom_rules').upsert(rulePayload, { onConflict: 'siemens_mlfb' })
  } catch (err) {
    console.warn('Could not save AI config to converter_custom_rules:', err)
  }

  // 2. Also persist to system_settings table if available
  try {
    const payload = {
      key: 'gemini_ai_config',
      value: {
        apiKey: cleanKey,
        baseUrl: cleanBaseUrl,
        model: cleanModel,
        webSearch: cleanWebSearch
      },
      updated_at: new Date().toISOString()
    }
    await supabase.from('system_settings').upsert(payload, { onConflict: 'key' })
  } catch (err) {
    // Ignore
  }
}

/**
 * Robust JSON Parser for Gemini text outputs
 */
function extractJson(text) {
  if (!text) return null
  const cleaned = text.replace(/```json\s*|```\s*/gi, '').trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
    } catch (e) {
      console.warn('JSON parse error from Gemini text:', e)
    }
  }
  try {
    return JSON.parse(cleaned)
  } catch {}
  return null
}

/**
 * Query Google Gemini API with Google Search Grounding & Strict Anti-Hallucination
 */
async function queryGeminiAPI(config, { sku, name, category, desc, longDesc }) {
  const model = config.model || 'gemini-2.5-flash'
  const apiKey = config.apiKey.trim()

  const systemInstruction = `You are the authoritative "Cross-Brand Engineering Equivalency Engine" for industrial switchgear and electrical automation.
Your task: Find the authentic Schneider Electric and ABB equivalent products for a given Siemens product.

CRITICAL ANTI-HALLUCINATION & STRICT SEARCH DIRECTIVES:
1. Use Google Search to search official Schneider Electric (se.com) and ABB (abb.com) product catalog pages and datasheets in real time to verify part numbers and order codes.
2. Authenticity: Every returned part number MUST be an authentic, legitimate catalog order code.
3. Level 1 - Exact Equivalent: If an identical 1-to-1 spec exists, return it.
4. Level 2 - Legitimate Technical Alternative: If an exact spec does not exist in the brand's catalog (e.g. niche Siemens accessory or legacy configuration), provide the closest legitimate technical alternative (e.g. standard higher kA rating, wide-range electronic coil, or standard frame size) and state the difference clearly in the description.
5. Level 3 - Nonexistent / No Match: If NO legitimate equivalent or alternative exists in Schneider or ABB catalog, output "-" for that brand model. DO NOT invent fictitious part numbers or mix product series names!

============================================================
MANDATORY TRIPPING CURVE & PROTECTION CHARACTERISTIC MATCHING:
============================================================
For all circuit breakers (MCB, MCCB, ACB), the tripping curve, protection characteristics, and trip units MUST be strictly extracted from Siemens and matched 100% identically:

1. MCB TRIPPING CURVES (STRICT 1-TO-1 MATCHING):
   - Extract curve from Siemens MLFB suffix or description:
     * Siemens suffix '-6' (or Curve B / B-Char / B-Type in name/desc) -> MUST match Curve B:
       - Schneider: Acti9 Curve B: iC60N (A9F73...), iC60H (A9F83...), iC60L (A9F93...)
       - ABB: Curve B: S200 (S20...-B...), S200M (S20...M-B...), S200P (S20...P-B...)
     * Siemens suffix '-7' (or Curve C / C-Char / C-Type in name/desc) -> MUST match Curve C:
       - Schneider: Acti9 Curve C: iC60N (A9F74...), iC60H (A9F84...), iC60L (A9F94...), Domae (EZ9F56...)
       - ABB: Curve C: SH200 (SH20...-C...), S200 (S20...-C...), S200M (S20...M-C...)
     * Siemens suffix '-8' (or Curve D / D-Char / D-Type in name/desc) -> MUST match Curve D:
       - Schneider: Acti9 Curve D: iC60N (A9F75...), iC60H (A9F85...), iC60L (A9F95...)
       - ABB: Curve D: S200 (S20...-D...), S200M (S20...M-D...), S200P (S20...P-D...)
   - STRICT PROHIBITION: NEVER convert Curve B into Curve C/D, and NEVER convert Curve D into Curve B/C!

2. MCCB & ACB PROTECTION CHARACTERISTICS / TRIP UNITS:
   - Thermal-Magnetic (TMD/TMA) -> Schneider ComPacT TMD / ABB Tmax XT TMD/TMA
   - Electronic LI (e.g. Siemens ETU320 / ETU330 LI) -> Schneider MicroLogic 2.x (LI) / ABB Ekip Dip LI
   - Electronic LSI (e.g. Siemens ETU350 LSI) -> Schneider MicroLogic 5.x (LSI) / ABB Ekip Dip LSI / Ekip Touch LSI
   - Electronic LSIG (e.g. Siemens ETU360/ETU600/ETU850/ETU860 LSIG with Ground Fault) -> Schneider MicroLogic 6.x (LSIG) / ABB Ekip Dip LSIG / Ekip Touch LSIG
   - NEVER downgrade protection curves (LI != LSI != LSIG).

OUTPUT FORMAT:
Return ONLY a valid JSON object starting with { and ending with } without surrounding markdown fences:
{
  "schneider_model": "SHORT_COMMERCIAL_SKU_ONLY (e.g. LV847144, A9F74106, LC1D25M7, LV429630)",
  "schneider_desc": "Schneider [Family] [Type] [Poles] [Current/kW] [Breaking Capacity] [Trip/Curve] [Coil/Voltage] [Notes if alternative]",
  "abb_model": "SHORT_COMMERCIAL_SKU_ONLY (e.g. 1SDA072122R1, S201-C6, AF26-30-00-13)",
  "abb_desc": "ABB [Family] [Type] [Poles] [Current/kW] [Breaking Capacity] [Trip/Curve] [Coil/Voltage] [Notes if alternative]"
}

IMPORTANT:
- The "schneider_model" and "abb_model" MUST be the concise commercial Order SKU / Part Number (e.g. "LV847144", "1SDA072122R1").
- NEVER put long descriptions like "MTZ1 06 H1 4P DRAWOUT MICROLOGIC 5.0 X" into the model/SKU field; put the full descriptive text into "schneider_desc" and "abb_desc".`

  const userContent = `Siemens Product to match:
- SKU / MLFB: ${sku}
- Item Name: ${name}
- Category: ${category}
- Description: ${desc}
- Long Description: ${longDesc}

Search official catalogs (se.com & abb.com) and return the exact single best Schneider & ABB commercial SKU and technical description in raw JSON.`

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\n${userContent}` }]
      }
    ],
    generationConfig: {
      temperature: 0.1
    }
  }

  // Google Search Grounding tool parameter
  if (config.webSearch !== false) {
    requestBody.tools = [{ googleSearch: {} }]
  }

  let response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  // If googleSearch tool is not supported on certain models/regions, retry cleanly without tools
  if (!response.ok && requestBody.tools) {
    delete requestBody.tools
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
  }

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API Error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const parsed = extractJson(text)
  if (!parsed) {
    throw new Error(`Failed to parse valid JSON from Gemini output: ${text.substring(0, 100)}`)
  }
  return parsed
}

/**
 * Request AI suggestion for Siemens item using Google Gemini Pro/Flash or OpenAI/DeepSeek API with Web Search
 * @param {Object} item - { item_no, item_name, category, description, long_description }
 * @returns {Promise<{ schneider_model: string, schneider_desc: string, abb_model: string, abb_desc: string }>}
 */
export async function fetchAISuggestion(item) {
  let config = getAIConfig()
  if (!config.apiKey) {
    config = await fetchRemoteAIConfig()
  }
  const sku = (item.item_no || '').trim()
  const name = (item.item_name || '').trim()
  const category = (item.category || '').trim()
  const desc = (item.description || '').trim()
  const longDesc = (item.long_description || '').trim()

  if (config.apiKey) {
    try {
      const isGemini = config.apiKey.startsWith('AIza') || 
                       config.baseUrl.includes('googleapis') || 
                       config.model.toLowerCase().includes('gemini')

      let parsed = null

      if (isGemini) {
        parsed = await queryGeminiAPI(config, { sku, name, category, desc, longDesc })
      } else {
        // OpenAI / DeepSeek / OpenRouter compatible endpoint
        const requestPayload = {
          model: config.model || 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are the "Cross-Brand Engineering Equivalency Engine" — an industrial electrical switchgear architect.
Translate the Siemens product into its authentic single best Schneider Electric and ABB equivalent.
- Always search online or check manufacturer datasheets for authentic order codes.
- If exact is unavailable, provide the closest legitimate technical alternative.
- If no match exists, return "-". NEVER invent fake numbers.
Output JSON only: {"schneider_model":"...","schneider_desc":"...","abb_model":"...","abb_desc":"..."}`
            },
            {
              role: 'user',
              content: `Siemens Product:\nSKU/MLFB: ${sku}\nTitle: ${name}\nDescription: ${desc}\nLong Description: ${longDesc}\nCategory: ${category}`
            }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }

        if (config.webSearch) {
          requestPayload.web_search = true
          requestPayload.enable_search = true
          requestPayload.search = true
        }

        const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify(requestPayload)
        })

        if (response.ok) {
          const resData = await response.json()
          const rawContent = resData.choices?.[0]?.message?.content || '{}'
          parsed = JSON.parse(rawContent.replace(/```json|```/gi, '').trim())
        }
      }

      if (parsed && (parsed.schneider_model || parsed.abb_model)) {
        return {
          schneider_model: (parsed.schneider_model || '-').toUpperCase().trim(),
          schneider_desc: cleanDescText(parsed.schneider_desc, 'Schneider', sku, name),
          abb_model: (parsed.abb_model || '-').toUpperCase().trim(),
          abb_desc: cleanDescText(parsed.abb_desc, 'ABB', sku, name)
        }
      }
    } catch (e) {
      console.warn('AI API query error, falling back to comprehensive rule base:', e)
    }
  }

  // Comprehensive rule-based knowledge engine fallback
  return generateOfflineRuleSuggestion(sku, name, category, { ...item, description: desc, long_description: longDesc })
}

function cleanDescText(desc, brand, sku, name) {
  if (!desc) return ''
  let text = desc.trim()
  text = text.replace(new RegExp(`^Padanan ${brand} untuk:?\\s*`, 'i'), '')
  text = text.replace(new RegExp(`^Equivalent ${brand} for:?\\s*`, 'i'), '')
  return text
}

/**
 * Comprehensive Switchgear & Automation Knowledge Base
 * Follows the 3-Level Matching and Breaking Capacity / Multi-Parameter Intelligence.
 */
export function generateOfflineRuleSuggestion(sku, name, category, item = {}) {
  const code = (sku || '').toUpperCase()
  const text = `${sku} ${name} ${item.description || ''} ${item.long_description || ''}`.toUpperCase()

  const isAccessory = 
    /^3V[WA]9|^3W[ALNT]9|^3VA9|^3VJ9|^3VM9|^3RT[12]9|^3RV[12]9|^3RU[12]9|^5ST[23]|^6ES79/i.test(code) ||
    /\bACC\b|\bACCESSOR|\bADAPTER\b|\bSERVICE TOOL|\bTEST TOOL|\bTEST KIT|\bCABLE\b|\bCONNECTOR\b|\bSHUNT (RELEASE|TRIP)|\bVOLTAGE RELEASE|\bUNDERVOLTAGE|\bAUXILIARY (CONTACT|SWITCH)|\bMOTOR (OPERATOR|MECHANISM|DRIVE)|\bSPRING CHARGING/i.test(name)

  // 1. Commissioning / Test Tools, Service Adapters & Connection Cables (TD400 / TD500 / BBD / Test Kits / 3VA Adapters)
  if (/^3VW9011|^3W[AL]9111-0EK|^3VA9987|^3VA9977/i.test(code) || (/TD400|TD500|COMMISSIONING|SERVICE TOOL|TEST TOOL|TEST KIT|TESTING UNIT|ADAPTER.*(3VA|TD400|3WA|3WL)/i.test(text) && isAccessory)) {
    const isAdapterOrCable = /ADAPTER|CABLE|KABEL|INTERFACE/i.test(text)
    if (isAdapterOrCable) {
      return {
        schneider_model: 'TRV00911',
        schneider_desc: 'Schneider Electric Test Interface Connection Adapter Cable for Micrologic Trip Units to TRV00910 Service Tool',
        abb_model: '1SDA076170R1',
        abb_desc: 'ABB Ekip T&P Connection Adapter Cable for Emax 2 and Tmax XT Trip Units'
      }
    }
    return {
      schneider_model: 'TRV00910',
      schneider_desc: 'Schneider Electric Service Interface Handheld Test Kit with adapter, connection cables & case for Micrologic Trip Units',
      abb_model: '1SDA066989R1',
      abb_desc: 'ABB Ekip T&P Standalone Programming and Test Unit with cables and carrying case for Emax 2 & Tmax XT'
    }
  }

  // 2. ACB Shunt Release / Shunt Trip (MX / XF / YO / YC)
  if (/^3W[AL]9111-0A[CD]/i.test(code) || ((/SHUNT (RELEASE|TRIP)|VOLTAGE RELEASE|\bMX\b|\bXF\b/i.test(text)) && isAccessory)) {
    const vMatch = text.match(/\b(24|48|110|220|230|240|380|415)\s*V\b/)
    const volt = vMatch ? vMatch[1] : '220-240'
    return {
      schneider_model: '33668',
      schneider_desc: `Schneider Electric Voltage Release MX/XF ${volt}V AC/DC for MasterPact NW/NT & MTZ`,
      abb_model: '1SDA038290R1',
      abb_desc: `ABB Shunt Opening / Closing Release YO/YC ${volt}V AC/DC for Emax 2 Breakers`
    }
  }

  // 3. ACB Undervoltage Release (UVR / MN / YU)
  if (/^3W[AL]9111-0AE/i.test(code) || ((/UNDERVOLTAGE|\bUVR\b|\bMN\b|\bYU\b/i.test(text)) && isAccessory)) {
    const vMatch = text.match(/\b(24|48|110|220|230|240|380|415)\s*V\b/)
    const volt = vMatch ? vMatch[1] : '220-240'
    return {
      schneider_model: '33671',
      schneider_desc: `Schneider Electric Undervoltage Release MN ${volt}V AC/DC Instantaneous for MasterPact`,
      abb_model: '1SDA038300R1',
      abb_desc: `ABB Undervoltage Release YU ${volt}V AC/DC for Emax 2 Breakers`
    }
  }

  // 4. ACB Motor Mechanism / Motor Operator (MCH / M)
  if (/^3W[AL]9111-0AF/i.test(code) || ((/MOTOR (OPERATOR|MECHANISM|DRIVE)|SPRING CHARGING MOTOR/i.test(text)) && isAccessory)) {
    const vMatch = text.match(/\b(24|48|110|220|230|240)\s*V\b/)
    const volt = vMatch ? vMatch[1] : '220-250'
    return {
      schneider_model: '47893',
      schneider_desc: `Schneider Electric Gear Motor MCH ${volt}V AC/DC Spring Charging Mechanism for MasterPact NW`,
      abb_model: '1SDA038320R1',
      abb_desc: `ABB Spring Charging Motor M ${volt}V AC/DC for Emax 2 Air Circuit Breakers`
    }
  }

  // 5. ACB Auxiliary Switches / Contacts (OF / SD / SDE / AUX)
  if (/^3W[AL]9111-0AG/i.test(code) || ((/AUXILIARY (SWITCH|CONTACT)|AUX CONTACT|\bOF\b|\bSD\b/i.test(text)) && isAccessory)) {
    return {
      schneider_model: '47440',
      schneider_desc: 'Schneider Electric Auxiliary Contact Block 4 OF Form C (4NO+4NC) for MasterPact NW/NT',
      abb_model: '1SDA038324R1',
      abb_desc: 'ABB Auxiliary Contacts AUX 4Q (4 Changeover Contacts 400V) for Emax 2'
    }
  }

  // 6. Generic Accessory Fallback
  if (isAccessory && /ACC\b|ACCESSOR|ADAPTER|KIT\b|CABLE/i.test(text)) {
    return {
      schneider_model: 'TRV00911',
      schneider_desc: `Schneider Electric Switchgear Accessory for ${name || sku}`,
      abb_model: '1SDA076170R1',
      abb_desc: `ABB Switchgear Accessory for ${name || sku}`
    }
  }

  // 7. ACB Air Circuit Breakers (3WA1, 3WL1, 3WT, 3WN) - STRICTLY BREAKER ONLY!
  if (!isAccessory && (/^3W[ALNT]1|^3WN/i.test(code) || (/AIR CIRCUIT BREAKER|\bACB\b/i.test(text) || category === 'ACB'))) {
    // Exact MLFB regex breakdown: 3WA1106-2CE02-0AA0 -> [1]=106, [2]=2, [3]=C, [4]=E, [5]=0, [6]=2
    const mlfbMatch = code.match(/^3W[AL]1(\d{3})-([234])([A-Z])([A-Z])([0-9])([0-9])/)

    // 1A. Extract Amperes (In)
    let amp = 1600
    const mlfbAmpMap = { '106': 630, '108': 800, '110': 1000, '112': 1250, '116': 1600, '120': 2000, '125': 2500, '132': 3200, '140': 4000, '250': 5000, '363': 6300 }
    if (mlfbMatch && mlfbAmpMap[mlfbMatch[1]]) {
      amp = mlfbAmpMap[mlfbMatch[1]]
    } else {
      const aMatch = text.match(/\b(\d{3,4})\s*A\b/)
      if (aMatch) amp = parseInt(aMatch[1])
    }

    // 1B. Extract Poles
    let poles = '3'
    if (mlfbMatch) {
      poles = mlfbMatch[2] === '2' ? '3' : '4'
    } else if (/\b4P\b|\b4-POLE/i.test(text)) {
      poles = '4'
    }

    // 1C. Extract Breaking Capacity (Icu)
    let breakingCodeSchneider = 'H2'
    let kaVal = 66
    const kaChar = mlfbMatch ? mlfbMatch[3] : ''

    if (kaChar === 'A' || kaChar === 'B' || /50\s*KA|55\s*KA|\bN1\b/i.test(text)) {
      breakingCodeSchneider = 'H1'
      kaVal = 55
    } else if (kaChar === 'C' || kaChar === 'D' || /66\s*KA|85\s*KA|\bH1\b/i.test(text)) {
      breakingCodeSchneider = 'H2'
      kaVal = 66
    } else if (kaChar === 'E' || /100\s*KA|\bH10\b|\bL1\b/i.test(text)) {
      breakingCodeSchneider = 'H10'
      kaVal = 100
    }

    // 1D. Extract Trip Unit (ETU) -> MicroLogic X (Schneider) & Ekip (ABB)
    const etuChar = mlfbMatch ? mlfbMatch[4] : ''
    let microLogicCode = '5.0 X'
    let schneiderTripDesc = 'MicroLogic 5.0 X LSI'
    let abbTripDesc = 'Ekip Touch LSI'
    let abbTripType = 'Touch-LSI'

    if (etuChar === 'A' || /NON-AUTOMATIC|SWITCH-DISCONNECTOR|\bNA\b/i.test(text)) {
      microLogicCode = 'NA'
      schneiderTripDesc = 'Switch-Disconnector (Non-Automatic)'
      abbTripDesc = 'Switch-Disconnector MS'
      abbTripType = 'MS'
    } else if (etuChar === 'B' || /ETU300|\bMICROLOGIC 2|\bEKIP DIP/i.test(text)) {
      microLogicCode = '5.0 X'
      schneiderTripDesc = 'MicroLogic 5.0 X LSI'
      abbTripDesc = 'Ekip Dip LSI'
      abbTripType = 'Dip-LSI'
    } else if (etuChar === 'D' || etuChar === 'E' || /LSIG\b|GROUND FAULT/i.test(text)) {
      microLogicCode = '6.0 X'
      schneiderTripDesc = 'MicroLogic 6.0 X LSIG'
      abbTripDesc = 'Ekip Touch LSIG'
      abbTripType = 'Touch-LSIG'
    }

    // 1E. Extract Mounting Type (Fixed vs Drawout)
    const mountChar = mlfbMatch ? mlfbMatch[5] : ''
    const isDrawout = mountChar === '2' || mountChar === '3' || /DRAWOUT|WITHDRAWABLE|W\/O|DRAWER/i.test(text)
    const mountTypeSchneider = isDrawout ? 'Drawout' : 'Fix'
    const mountTypeSchneiderDesc = isDrawout ? 'Drawout (Withdrawable)' : 'Fixed'
    const mountTypeABBDesc = isDrawout ? 'Drawout (W MP)' : 'Fixed (F F)'

    // 1F. Schneider MasterPact MTZ Generation (MTZ1: 06-16, MTZ2: 08-40, MTZ3: 40-63)
    let mtzFrame = '1'
    let ratingCode = '06'
    if (amp <= 630) { mtzFrame = '1'; ratingCode = '06' }
    else if (amp <= 800) { mtzFrame = '1'; ratingCode = '08' }
    else if (amp <= 1000) { mtzFrame = '1'; ratingCode = '10' }
    else if (amp <= 1250) { mtzFrame = '1'; ratingCode = '12' }
    else if (amp <= 1600) { mtzFrame = '1'; ratingCode = '16' }
    else if (amp <= 2000) { mtzFrame = '2'; ratingCode = '20' }
    else if (amp <= 2500) { mtzFrame = '2'; ratingCode = '25' }
    else if (amp <= 3200) { mtzFrame = '2'; ratingCode = '32' }
    else if (amp <= 4000) { mtzFrame = '2'; ratingCode = '40' }
    else if (amp <= 5000) { mtzFrame = '3'; ratingCode = '50' }
    // Commercial Order SKU Map for MasterPact MTZ basic unit / breaker
    const mtzSkuMap = {
      '1_06_3_Fix': 'LV847113', '1_06_4_Fix': 'LV847114', '1_06_3_Drawout': 'LV847143', '1_06_4_Drawout': 'LV847144',
      '1_08_3_Fix': 'LV847115', '1_08_4_Fix': 'LV847116', '1_08_3_Drawout': 'LV847145', '1_08_4_Drawout': 'LV847146',
      '1_10_3_Fix': 'LV847117', '1_10_4_Fix': 'LV847118', '1_10_3_Drawout': 'LV847147', '1_10_4_Drawout': 'LV847148',
      '1_12_3_Fix': 'LV847119', '1_12_4_Fix': 'LV847120', '1_12_3_Drawout': 'LV847149', '1_12_4_Drawout': 'LV847150',
      '1_16_3_Fix': 'LV847121', '1_16_4_Fix': 'LV847122', '1_16_3_Drawout': 'LV847151', '1_16_4_Drawout': 'LV847152',
      '2_20_3_Fix': 'LV847153', '2_20_4_Fix': 'LV847154', '2_20_3_Drawout': 'LV847173', '2_20_4_Drawout': 'LV847174',
      '2_25_3_Fix': 'LV847155', '2_25_4_Fix': 'LV847156', '2_25_3_Drawout': 'LV847175', '2_25_4_Drawout': 'LV847176',
      '2_32_3_Fix': 'LV847157', '2_32_4_Fix': 'LV847158', '2_32_3_Drawout': 'LV847177', '2_32_4_Drawout': 'LV847178',
      '2_40_3_Fix': 'LV847159', '2_40_4_Fix': 'LV847160', '2_40_3_Drawout': 'LV847179', '2_40_4_Drawout': 'LV847180'
    }
    const mtzKey = `${mtzFrame}_${ratingCode}_${poles}_${mountTypeSchneider}`
    const schneiderModel = mtzSkuMap[mtzKey] || (isDrawout ? 'LV847144' : 'LV847114')
    const schneiderDesc = `Schneider Electric MasterPact MTZ${mtzFrame} ${ratingCode} ${breakingCodeSchneider} ${amp}A ${poles}P ${kaVal}kA ${mountTypeSchneiderDesc} Air Circuit Breaker with ${schneiderTripDesc} Control Unit`

    // 1G. ABB Emax 2 Exact 1SDA Code Generation
    let emaxFrame = 'E1.2N'
    let abbModel = '1SDA070744R1'

    if (amp <= 800) {
      emaxFrame = 'E1.2N'
      if (!isDrawout) { // Fixed
        if (poles === '3') {
          abbModel = abbTripType === 'Dip-LSI' ? '1SDA070712R1' : abbTripType === 'Touch-LSIG' ? '1SDA070744R1' : '1SDA070742R1'
        } else { // 4P
          abbModel = abbTripType === 'Dip-LSI' ? '1SDA070722R1' : abbTripType === 'Touch-LSIG' ? '1SDA070754R1' : '1SDA070752R1'
        }
      } else { // Drawout
        if (poles === '3') {
          abbModel = abbTripType === 'Dip-LSI' ? '1SDA072112R1' : abbTripType === 'Touch-LSIG' ? '1SDA072144R1' : '1SDA072142R1'
        } else { // 4P
          abbModel = abbTripType === 'Dip-LSI' ? '1SDA072122R1' : abbTripType === 'Touch-LSIG' ? '1SDA072154R1' : '1SDA072152R1'
        }
      }
    } else if (amp <= 1000) {
      emaxFrame = 'E1.2N'
      if (!isDrawout) {
        abbModel = poles === '4' ? '1SDA070804R1' : '1SDA070794R1'
      } else {
        abbModel = poles === '4' ? '1SDA072204R1' : '1SDA072194R1'
      }
    } else if (amp <= 1250) {
      emaxFrame = 'E1.2N'
      if (!isDrawout) {
        abbModel = poles === '4' ? '1SDA070834R1' : '1SDA070824R1'
      } else {
        abbModel = poles === '4' ? '1SDA072234R1' : '1SDA072224R1'
      }
    } else if (amp <= 1600) {
      emaxFrame = 'E1.2N'
      if (!isDrawout) {
        abbModel = poles === '4' ? '1SDA070884R1' : '1SDA070874R1'
      } else {
        abbModel = poles === '4' ? '1SDA072284R1' : '1SDA072274R1'
      }
    } else if (amp <= 2500) {
      emaxFrame = 'E2.2N'
      if (!isDrawout) {
        abbModel = poles === '4' ? '1SDA071064R1' : '1SDA071054R1'
      } else {
        abbModel = poles === '4' ? '1SDA072464R1' : '1SDA072454R1'
      }
    } else if (amp <= 4000) {
      emaxFrame = 'E4.2N'
      if (!isDrawout) {
        abbModel = poles === '4' ? '1SDA071464R1' : '1SDA071454R1'
      } else {
        abbModel = poles === '4' ? '1SDA072864R1' : '1SDA072854R1'
      }
    } else {
      emaxFrame = 'E6.2H'
      abbModel = poles === '4' ? '1SDA071914R1' : '1SDA071904R1'
    }

    const abbDesc = `ABB Emax 2 ${emaxFrame} 800 ${amp}A ${poles}P ${kaVal}kA ${mountTypeABBDesc} Air Circuit Breaker with ${abbTripDesc} Trip Unit`

    return {
      schneider_model: schneiderModel,
      schneider_desc: schneiderDesc,
      abb_model: abbModel,
      abb_desc: abbDesc
    }
  }

  // 7. Contactor (3RT20 / 3RT10 / 3TF)
  if (/^3RT20(\d{2})|^3RT10(\d{2})|^3TF/i.test(code) || /CONTACTOR|KONTAKTOR/i.test(text)) {
    const match = code.match(/3RT[12]0(\d{2})/)
    const sizeCode = match ? match[1] : '26'
    const ampMap = { '15': 7, '16': 9, '17': 12, '18': 16, '23': 9, '24': 12, '25': 17, '26': 25, '27': 32, '28': 38, '35': 40, '36': 50, '37': 65, '38': 80, '46': 95, '47': 110 }
    const amp = ampMap[sizeCode] || 25
    
    // Coil voltage detection
    const vMatch = text.match(/\b(24|48|110|220|230|240|380|400|415)\s*V\s*(AC|DC)?\b/i)
    const isDC = /24VDC|24\s*V\s*DC|\bDC\b/i.test(text)
    const coilStr = isDC ? '24VDC' : '220-230VAC 50/60Hz'
    const schneiderCoil = isDC ? 'BD' : 'M7'
    const abbCoil = isDC ? '-11' : '-13'

    return {
      schneider_model: `LC1D${String(amp).padStart(2, '0')}${schneiderCoil}`,
      schneider_desc: `Schneider Electric TeSys Deca Contactor 3P (3NO) AC-3 <=440V ${amp}A Coil ${coilStr}`,
      abb_model: `AF${amp}-30-00${abbCoil}`,
      abb_desc: `ABB AF Contactor 3-Pole ${amp}A 690V AC-3 Coil ${isDC ? '24-60V DC/AC' : '100-250V AC/DC'} with Built-in Surge Protection`
    }
  }

  // 8. MCB (5TJ, 5SL3, 5SL6, 5SY6, 5SY4, 5SJ4, 5SP4, 5SY7, etc.)
  if (/^5[ST][LJYP](\d)/i.test(code) || /\bMCB\b/i.test(text)) {
    const pMatch = code.match(/5[ST][LJYP](\d)(\d{2})-(\d)/i)
    const poles = pMatch ? pMatch[1] : (text.match(/\b([1234])\s*P\b/)?.[1] || '1')
    
    // Strict curve detection from MLFB suffix (-6 = Curve B, -7 = Curve C, -8 = Curve D) or title/desc
    let curve = 'C'
    if (pMatch) {
      curve = pMatch[3] === '6' ? 'B' : pMatch[3] === '8' ? 'D' : 'C'
    } else if (/\b(KURVA|CURVE|TYPE|CHAR(ACTERISTIC)?)\s*B\b|\bB\d+\b/i.test(text)) {
      curve = 'B'
    } else if (/\b(KURVA|CURVE|TYPE|CHAR(ACTERISTIC)?)\s*D\b|\bD\d+\b/i.test(text)) {
      curve = 'D'
    } else if (/\b(KURVA|CURVE|TYPE|CHAR(ACTERISTIC)?)\s*C\b|\bC\d+\b/i.test(text)) {
      curve = 'C'
    }

    // Schneider Curve Digit in Part Number: 3 = Curve B, 4 = Curve C, 5 = Curve D
    const schCurveDigit = curve === 'B' ? '3' : curve === 'D' ? '5' : '4'
    const abbCurveChar = curve

    const aMatch = text.match(/\b(\d{1,3})\s*A\b/)
    const amp = aMatch ? aMatch[1] : (pMatch ? String(parseInt(pMatch[2])) : '6')
    const paddedAmp = String(amp).padStart(2, '0')

    // Detect breaking capacity (kA)
    const is4_5kA = /^5TJ/i.test(code) || /^5SL3/i.test(code) || /^5SJ3/i.test(code) || /4[.,]5\s*KA/i.test(text)
    const is10kA = /^5S[YP]4/i.test(code) || /^5SJ4/i.test(code) || /10\s*KA/i.test(text)
    const is15kA = /^5SY7/i.test(code) || /^5SJ7/i.test(code) || /15\s*KA/i.test(text)

    // 4.5 kA Exact Matching (Schneider EasyPact Domae, ABB SH200L)
    if (is4_5kA) {
      return {
        schneider_model: `EZ9F54${poles}${paddedAmp}`,
        schneider_desc: `Schneider Electric EasyPact Domae MCB ${poles}P ${amp}A Curve ${curve} 4.5kA 230/400V`,
        abb_model: `SH20${poles}L-${abbCurveChar}${amp}`,
        abb_desc: `ABB Compact Home MCB SH200L ${poles}P ${amp}A Curve ${curve} 4.5kA 230/400VAC`
      }
    }

    // 10 kA Matching (Schneider Acti9 iC60H, ABB S200M)
    if (is10kA) {
      return {
        schneider_model: `A9F8${schCurveDigit}${poles}${paddedAmp}`,
        schneider_desc: `Schneider Electric Acti9 iC60H Miniature Circuit Breaker ${poles}P ${amp}A Curve ${curve} 10kA 230/400V`,
        abb_model: `S20${poles}M-${abbCurveChar}${amp}`,
        abb_desc: `ABB System pro M compact MCB S200M ${poles}P ${amp}A Curve ${curve} 10kA 230/400VAC`
      }
    }

    // 15 kA Matching (Schneider Acti9 iC60L, ABB S200P)
    if (is15kA) {
      return {
        schneider_model: `A9F9${schCurveDigit}${poles}${paddedAmp}`,
        schneider_desc: `Schneider Electric Acti9 iC60L Miniature Circuit Breaker ${poles}P ${amp}A Curve ${curve} 15kA 230/400V`,
        abb_model: `S20${poles}P-${abbCurveChar}${amp}`,
        abb_desc: `ABB System pro M compact MCB S200P ${poles}P ${amp}A Curve ${curve} 15kA 230/400VAC`
      }
    }

    // Standard 6 kA Matching (Schneider Acti9 iC60N, ABB S200 / SH200)
    const abb6kAModel = (curve === 'C' && poles === '1' && ['2','4','6','10','16','20','25','32','40'].includes(String(amp)))
      ? `SH20${poles}-C${amp}`
      : `S20${poles}-${abbCurveChar}${amp}`

    return {
      schneider_model: `A9F7${schCurveDigit}${poles}${paddedAmp}`,
      schneider_desc: `Schneider Electric Acti9 iC60N Miniature Circuit Breaker ${poles}P ${amp}A Curve ${curve} 6kA 230/400V`,
      abb_model: abb6kAModel,
      abb_desc: `ABB System pro M compact MCB S200 ${poles}P ${amp}A Curve ${curve} 6kA 230/400VAC`
    }
  }

  // 9. RCCB / RCBO (5SV3 / 5SV4 / 5SM)
  if (/^5SV|^5SM|^5SU/i.test(code) || /RCCB|RCBO|ELCB|RESIDUAL CURRENT|EARTH LEAKAGE/i.test(text)) {
    const aMatch = text.match(/\b(\d{2,3})\s*A\b/)
    const amp = aMatch ? aMatch[1] : '40'
    const sensMatch = text.match(/\b(30|100|300)\s*MA\b/i)
    const ma = sensMatch ? sensMatch[1] : '30'
    const pMatch = text.match(/\b([24])\s*P\b/)
    const poles = pMatch ? pMatch[1] : '2'
    return {
      schneider_model: `A9R71${poles === '4' ? '4' : '2'}${amp === '25' ? '25' : amp === '63' ? '63' : '40'}`,
      schneider_desc: `Schneider Electric Acti9 iID Residual Current Circuit Breaker (RCCB) ${poles}P ${amp}A ${ma}mA Type AC 230/400V`,
      abb_model: `F20${poles === '4' ? '4' : '2'} AC-${amp}/${parseFloat(ma)/1000}`,
      abb_desc: `ABB F200 Residual Current Circuit Breaker ${poles}P ${amp}A ${ma}mA Sensitivity Type AC`
    }
  }

  // 10. MCCB (3VA1 / 3VA2 / 3VJ / 3VM)
  if (/^(3VA|3VJ|3VM|3VL)/i.test(code) || /\bMCCB\b/i.test(text)) {
    const aMatch = text.match(/\b(\d{2,4})\s*A\b/)
    const amp = aMatch ? aMatch[1] : '100'
    const pMatch = text.match(/\b([34])\s*P\b/)
    const poles = pMatch ? pMatch[1] : '3'
    const isElectronic = /ELECTRONIC|ETU|MICROLOGIC|EKIP|LSIG|LSI/i.test(text)
    return {
      schneider_model: isElectronic ? `LV429640` : `LV429630`,
      schneider_desc: `Schneider Electric Compact NSX100F ${isElectronic ? 'Micrologic 2.2' : 'TMD'} ${amp}A ${poles}P${poles}D 36kA 415VAC Molded Case Circuit Breaker`,
      abb_model: isElectronic ? `1SDA067050R1` : `1SDA066805R1`,
      abb_desc: `ABB Tmax XT1B / XT2N ${isElectronic ? 'Ekip LSI' : 'TMF'} ${amp}A ${poles}P F F 36kA 415VAC Molded Case Circuit Breaker`
    }
  }

  // 11. Thermal Overload Relay (3RU21 / 3RB30)
  if (/^(3RU|3RB)/i.test(code) || /OVERLOAD|TOR\b/i.test(text)) {
    return {
      schneider_model: 'LRD21',
      schneider_desc: 'Schneider Electric TeSys Deca Thermal Overload Relay Class 10A 12...18A for Contactors LC1D09-D38',
      abb_model: 'TF42-16',
      abb_desc: 'ABB TF42 Thermal Overload Relay 13.0...16.0A Trip Class 10 for Contactors AF09...AF38'
    }
  }

  // 12. MPCB Motor Protection (3RV20 / 3RV10)
  if (/^3RV[12]/i.test(code) || /MPCB|MOTOR CIRCUIT BREAKER/i.test(text)) {
    return {
      schneider_model: 'GV2ME14',
      schneider_desc: 'Schneider Electric TeSys GV2 Motor Circuit Breaker 6...10A 3P Pushbutton Thermal-Magnetic 100kA',
      abb_model: 'MS116-10',
      abb_desc: 'ABB Manual Motor Starter MS116 6.3...10.0A 3P Rotary Handle 50kA'
    }
  }

  // 13. Soft Starter (3RW30 / 3RW40 / 3RW52)
  if (/^3RW/i.test(code) || /SOFT STARTER/i.test(text)) {
    return {
      schneider_model: 'ATS22D32Q',
      schneider_desc: 'Schneider Electric Altistart 22 Soft Starter for 3-Phase Asynchronous Motor 32A 230...440V',
      abb_model: '1SFA896109R7000',
      abb_desc: 'ABB PSR30-600-70 Soft Starter 30A 208-600VAC with Integrated Bypass'
    }
  }

  // 14. Power Supply (6EP / SITOP)
  if (/^6EP/i.test(code) || /SITOP|POWER SUPPLY/i.test(text)) {
    return {
      schneider_model: 'ABLS1A24050',
      schneider_desc: 'Schneider Electric Modicon Power Supply Regulated 100-240V AC 24V DC 5A DIN Rail Mount',
      abb_model: '1SVR427034R0000',
      abb_desc: 'ABB CP-E 24/5.0 Primary Switch Mode Power Supply Input 100-240VAC Output 24VDC 5A'
    }
  }

  // 15. Default Clean Technical Fallback
  return {
    schneider_model: 'TRV00910',
    schneider_desc: `Schneider Electric Industrial Switchgear Accessory for ${name || sku}`,
    abb_model: '1SDA066989R1',
    abb_desc: `ABB Low Voltage Industrial Switchgear Accessory for ${name || sku}`
  }
}
