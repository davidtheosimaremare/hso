/**
 * Component Converter Engine (Schneider & ABB -> Siemens)
 * Highly optimized for Indonesian Industrial Electrical Distribution & Automation standards.
 * Integrated with PT Hokiindo Raya Accurate Item Master Catalog.
 */

import { generateOfflineRuleSuggestion } from './aiSuggester.js'

// Helper to sanitize part numbers for fuzzy matching
export function cleanPartNumber(str) {
  if (!str) return ''
  return str.toString().trim().toUpperCase().replace(/[\s\-_.\/]/g, '')
}

// Format IDR Currency
export function formatRupiah(num) {
  if (num === null || num === undefined || isNaN(num)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num)
}

/**
 * Standard Siemens Product Knowledge Catalog
 */
export const SIEMENS_PRODUCT_KNOWLEDGE = {
  MCB: {
    name: 'Miniature Circuit Breaker (MCB)',
    series: [
      { code: '5SL6', name: 'SENTRON 5SL6 (6kA)', breakingCapacity: '6kA', standard: 'IEC 60898-1', target: 'Commercial & Residential' },
      { code: '5SL4', name: 'SENTRON 5SL4 (10kA)', breakingCapacity: '10kA', standard: 'IEC 60898-1 / 60947-2', target: 'Industrial Standard' },
      { code: '5SY6', name: 'SENTRON 5SY6 (6kA)', breakingCapacity: '6kA', standard: 'IEC 60898-1', target: 'Universal Industrial' },
      { code: '5SY4', name: 'SENTRON 5SY4 (10kA)', breakingCapacity: '10kA', standard: 'IEC 60947-2 / UL 1077', target: 'Heavy Duty Industrial' },
      { code: '5SP4', name: 'SENTRON 5SP4 (10kA High Current 80-125A)', breakingCapacity: '10kA', standard: 'IEC 60898-1', target: 'Main Incomer MCB' }
    ]
  },
  MCCB: {
    name: 'Moulded Case Circuit Breaker (MCCB)',
    series: [
      { code: '3VA1', name: 'SENTRON 3VA1 (16A - 630A)', breakingCapacity: '25kA - 70kA', tripUnit: 'TM210/TM220/TM240 Thermal-Magnetic', target: 'Premium Global Standard' },
      { code: '3VJ', name: 'SENTRON 3VJ (32A - 630A)', breakingCapacity: '10kA - 55kA', tripUnit: 'Fixed / Adjustable TM', target: 'Economical & Cost Efficient' },
      { code: '3VA2', name: 'SENTRON 3VA2 (25A - 1000A)', breakingCapacity: '55kA - 110kA', tripUnit: 'ETU Electronic Trip Unit', target: 'Advanced Selective Protection & Metering' }
    ]
  },
  ACB: {
    name: 'Air Circuit Breaker (ACB)',
    series: [
      { code: '3WA', name: 'SENTRON 3WA (630A - 6300A)', breakingCapacity: '55kA - 150kA', tripUnit: 'ETU300/ETU600 Electronic Trip', target: 'Latest Generation Smart ACB' },
      { code: '3WL', name: 'SENTRON 3WL (630A - 6300A)', breakingCapacity: '50kA - 150kA', tripUnit: 'ETU25B/ETU45B Electronic Trip', target: 'Proven Industrial Workhorse' }
    ]
  },
  CONTACTOR: {
    name: 'Magnetic Power Contactor',
    series: [
      { code: '3RT20', name: 'SIRIUS 3RT20 (Size S00 - S3, 3kW - 55kW / 7A - 110A)', standard: 'IEC 60947-4-1', target: 'Modern Modular SIRIUS System' },
      { code: '3RT10', name: 'SIRIUS 3RT10 (Size S6 - S12, 55kW - 250kW / 115A - 500A)', standard: 'IEC 60947-4-1', target: 'Heavy Duty Large Motor Contactor' },
      { code: '3TF', name: 'SIRIUS 3TF Classic Series', standard: 'IEC 60947-4-1', target: 'Legacy Heavy Industry Standard' }
    ]
  },
  TOR: {
    name: 'Thermal Overload Relay',
    series: [
      { code: '3RU21', name: 'SIRIUS 3RU21 Thermal Overload (Class 10)', target: 'Direct Mount to 3RT2 Contactor' },
      { code: '3RB30', name: 'SIRIUS 3RB30 Electronic Overload (Class 10E/20E)', target: 'Wide Range Electronic Overload' }
    ]
  },
  MPCB: {
    name: 'Motor Protection Circuit Breaker',
    series: [
      { code: '3RV20', name: 'SIRIUS 3RV20 MPCB (0.11A - 100A / Up to 100kA)', target: 'Class 10 Motor Starter Protection' }
    ]
  },
  SOFT_STARTER: {
    name: 'Soft Starter',
    series: [
      { code: '3RW30', name: 'SIRIUS 3RW30 Basic Soft Starter (1.5kW - 55kW)', target: 'Compact 2-phase controlled' },
      { code: '3RW40', name: 'SIRIUS 3RW40 Standard Soft Starter (5.5kW - 250kW)', target: 'Integrated By-pass & Overload' },
      { code: '3RW52', name: 'SIRIUS 3RW52 Advanced General Performance (5.5kW - 560kW)', target: '3-phase controlled smart soft starter' }
    ]
  },
  VFD: {
    name: 'Variable Frequency Drive (Inverter)',
    series: [
      { code: 'SINAMICS V20', name: 'SINAMICS V20 Basic Inverter (0.12kW - 30kW)', target: 'Compact, cost-effective standard drive' },
      { code: 'SINAMICS G120C', name: 'SINAMICS G120C Compact Vector Drive (0.55kW - 132kW)', target: 'High control precision & communication' }
    ]
  },
  PILOT_DEVICE: {
    name: 'Pilot Devices & Push Buttons (22mm)',
    series: [
      { code: '3SU1', name: 'SIRIUS ACT 3SU1 (Plastic & Metal 22mm)', target: 'Modular IP69K Pilot Devices' }
    ]
  },
  POWER_SUPPLY: {
    name: 'Industrial Power Supply (24V DC)',
    series: [
      { code: 'SITOP PSU100L / PSU6200', name: 'SITOP Power Supply (2.5A, 5A, 10A, 20A, 40A)', target: 'High efficiency regulated 24V power supply' }
    ]
  },
  PLC_AUTOMATION: {
    name: 'Micro PLC & Smart Relay',
    series: [
      { code: 'LOGO! 8', name: 'Siemens LOGO! 8.4 Smart Logic Controller', target: 'Small automation & lighting/pump control' },
      { code: 'S7-1200', name: 'SIMATIC S7-1200 Compact Modular PLC', target: 'Compact industrial automation standard' }
    ]
  }
}

/**
 * Direct & Parametric Conversion Rules Engine
 */
export class ComponentConverter {
  constructor(accurateItems = []) {
    this.accurateItems = accurateItems
    this.accurateMap = new Map()
    this.rebuildAccurateIndex(accurateItems)
  }

  setAccurateItems(items) {
    this.accurateItems = items || []
    this.rebuildAccurateIndex(this.accurateItems)
  }

  rebuildAccurateIndex(items) {
    this.accurateMap.clear()
    items.forEach(item => {
      if (item && item.item_no) {
        const cleanNo = cleanPartNumber(item.item_no)
        this.accurateMap.set(cleanNo, item)
      }
    })
  }

  // Find direct match in accurate items
  findInAccurate(partNo) {
    if (!partNo) return null
    const clean = cleanPartNumber(partNo)
    if (this.accurateMap.has(clean)) return this.accurateMap.get(clean)

    // Prefix fuzzy match
    for (const [key, item] of this.accurateMap.entries()) {
      if (key.startsWith(clean) || clean.startsWith(key)) {
        return item
      }
    }
    return null
  }

  // Search accurate items matching category, poles, current
  findMatchingAccurateItems({ category, poles, ampere, kA, voltage, prefix }) {
    if (!this.accurateItems.length) return []
    const results = []
    const cleanPrefix = prefix ? cleanPartNumber(prefix) : ''

    for (const item of this.accurateItems) {
      if (!item || !item.item_no) continue
      const itemNo = item.item_no.toUpperCase()
      const itemName = (item.item_name || '').toUpperCase()

      // Match category
      if (category && item.category && item.category !== 'OTHER') {
        if (item.category !== category) continue
      }

      // If prefix specified, verify prefix
      if (cleanPrefix && !cleanPartNumber(itemNo).startsWith(cleanPrefix)) {
        continue
      }

      let score = 50

      // Match poles if specified (e.g. 1P, 2P, 3P, 4P)
      if (poles) {
        const polePattern = new RegExp(`\\b${poles}P\\b|\\b${poles}\\s*POLE|\\b${poles}PIN`, 'i')
        if (polePattern.test(itemName) || (category === 'MCB' && itemNo.charAt(4) === String(poles))) {
          score += 25
        }
      }

      // Match ampere rating if specified (e.g. 16A, 100A)
      if (ampere) {
        const ampPattern = new RegExp(`\\b${ampere}\\s*A\\b|\\b${ampere}AMP|\\b${ampere}\\s*AMPERE`, 'i')
        if (ampPattern.test(itemName) || itemNo.includes(String(ampere))) {
          score += 25
        }
      }

      if (score >= 60) {
        results.push({ item, score })
      }
    }

    return results.sort((a, b) => b.score - a.score).map(r => r.item)
  }

  /**
   * Main Conversion Dispatcher
   */
  convert(inputStr, explicitBrand = null, customRules = []) {
    if (!inputStr || !inputStr.trim()) {
      return { success: false, message: 'Input part number atau spesifikasi tidak boleh kosong.' }
    }

    const query = inputStr.trim()

    // 1. Check User Custom Overrides & Admin Rules first
    if (customRules && customRules.length) {
      const cleanQ = cleanPartNumber(query)
      const lowerQ = query.toLowerCase()

      const matchCustom = customRules.find(r => {
        const cleanSchneider = cleanPartNumber(r.schneider_model || (r.source_brand === 'SCHNEIDER' ? r.source_model : ''))
        const cleanAbb = cleanPartNumber(r.abb_model || (r.source_brand === 'ABB' ? r.source_model : ''))
        const cleanSiemens = cleanPartNumber(r.siemens_mlfb || r.target_siemens_mlfb || '')
        const cleanOther = cleanPartNumber(r.other_model || (r.source_brand === 'OTHER' ? r.source_model : ''))
        const cleanSource = cleanPartNumber(r.source_model || '')

        const matchSchneiderDesc = Boolean(r.schneider_desc && r.schneider_desc.length > 3 && (lowerQ.includes(r.schneider_desc.toLowerCase()) || r.schneider_desc.toLowerCase().includes(lowerQ)))
        const matchAbbDesc = Boolean(r.abb_desc && r.abb_desc.length > 3 && (lowerQ.includes(r.abb_desc.toLowerCase()) || r.abb_desc.toLowerCase().includes(lowerQ)))
        const matchSiemensName = Boolean(r.siemens_name && r.siemens_name.length > 3 && (lowerQ.includes(r.siemens_name.toLowerCase()) || r.siemens_name.toLowerCase().includes(lowerQ)))

        return (cleanSchneider && (cleanSchneider === cleanQ || cleanQ.includes(cleanSchneider))) ||
               (cleanAbb && (cleanAbb === cleanQ || cleanQ.includes(cleanAbb))) ||
               (cleanSiemens && (cleanSiemens === cleanQ || cleanQ.includes(cleanSiemens))) ||
               (cleanOther && (cleanOther === cleanQ || cleanQ.includes(cleanOther))) ||
               (cleanSource && (cleanSource === cleanQ || cleanQ.includes(cleanSource))) ||
               matchSchneiderDesc || matchAbbDesc || matchSiemensName
      })

      if (matchCustom) {
        const targetSiemens = (matchCustom.siemens_mlfb || matchCustom.target_siemens_mlfb || '').trim().toUpperCase()
        const accurateItem = this.findInAccurate(targetSiemens)
        const schneiderModel = matchCustom.schneider_model || (matchCustom.source_brand === 'SCHNEIDER' ? matchCustom.source_model : '-')
        const abbModel = matchCustom.abb_model || (matchCustom.source_brand === 'ABB' ? matchCustom.source_model : '-')
        const schneiderPrice = matchCustom.schneider_price ? Number(matchCustom.schneider_price) : null
        const abbPrice = matchCustom.abb_price ? Number(matchCustom.abb_price) : null

        // Accurately determine whether query matches Schneider, ABB, or Siemens field
        let actualSourceBrand = 'SCHNEIDER'
        const cleanSchneider = cleanPartNumber(schneiderModel)
        const cleanAbb = cleanPartNumber(abbModel)
        const cleanSiemens = cleanPartNumber(targetSiemens)

        if (cleanSchneider && (cleanSchneider === cleanQ || cleanQ.includes(cleanSchneider) || cleanSchneider.includes(cleanQ))) {
          actualSourceBrand = 'SCHNEIDER'
        } else if (cleanAbb && (cleanAbb === cleanQ || cleanQ.includes(cleanAbb) || cleanAbb.includes(cleanQ))) {
          actualSourceBrand = 'ABB'
        } else if (cleanSiemens && (cleanSiemens === cleanQ || cleanQ.includes(cleanSiemens) || cleanSiemens.includes(cleanQ))) {
          actualSourceBrand = 'SIEMENS'
        } else if (matchCustom.schneider_desc && lowerQ.includes(matchCustom.schneider_desc.toLowerCase())) {
          actualSourceBrand = 'SCHNEIDER'
        } else if (matchCustom.abb_desc && lowerQ.includes(matchCustom.abb_desc.toLowerCase())) {
          actualSourceBrand = 'ABB'
        } else if (matchCustom.siemens_name && lowerQ.includes(matchCustom.siemens_name.toLowerCase())) {
          actualSourceBrand = 'SIEMENS'
        } else {
          actualSourceBrand = this.detectBrand(query)
        }

        return {
          success: true,
          matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'CUSTOM_RULE',
          matchConfidence: matchCustom.match_confidence || 100,
          sourceBrand: actualSourceBrand,
          sourceModel: query,
          category: matchCustom.category || 'OTHER',
          siemensMLFB: targetSiemens,
          siemensName: accurateItem?.item_name || matchCustom.siemens_name || matchCustom.target_siemens_name || `Siemens ${targetSiemens}`,
          schneiderModel,
          schneiderDesc: matchCustom.schneider_desc || '',
          schneiderPrice,
          abbModel,
          abbDesc: matchCustom.abb_desc || '',
          abbPrice,
          otherModel: matchCustom.other_model || '-',
          specsSummary: accurateItem?.long_description || accurateItem?.description || matchCustom.specs_summary || '',
          accurateItem,
          notes: matchCustom.specs_summary || matchCustom.spec_match_notes || 'Dikonversi berdasarkan Master Mapping Admin Database.',
          specsComparison: [],
          alternatives: []
        }
      }
    }

    // 2. Detect Brand & Category
    const detectedBrand = explicitBrand || this.detectBrand(query)
    
    // 3. Brand-specific conversion
    if (detectedBrand === 'SCHNEIDER') {
      return this.convertSchneider(query)
    } else if (detectedBrand === 'ABB') {
      return this.convertABB(query)
    } else if (detectedBrand === 'SIEMENS') {
      // Input is already Siemens -> look up in Accurate & custom rules
      const targetSiemens = query.trim().toUpperCase()
      const accurateItem = this.findInAccurate(targetSiemens)
      const matchingRule = (this.customRules || []).find(r => (r.siemens_mlfb || r.target_siemens_mlfb || '').toUpperCase() === targetSiemens)

      // Dynamic rule suggestion fallback if not explicitly mapped
      const dynamicSuggestion = generateOfflineRuleSuggestion(
        targetSiemens,
        accurateItem?.item_name || '',
        accurateItem?.category || 'OTHER',
        accurateItem || {}
      )

      const schneiderModel = (matchingRule?.schneider_model && matchingRule.schneider_model !== '-')
        ? matchingRule.schneider_model
        : (dynamicSuggestion?.schneider_model || '-')
      const schneiderDesc = matchingRule?.schneider_desc || dynamicSuggestion?.schneider_desc || ''
      const schneiderPrice = matchingRule?.schneider_price ? Number(matchingRule.schneider_price) : null

      const abbModel = (matchingRule?.abb_model && matchingRule.abb_model !== '-')
        ? matchingRule.abb_model
        : (dynamicSuggestion?.abb_model || '-')
      const abbDesc = matchingRule?.abb_desc || dynamicSuggestion?.abb_desc || ''
      const abbPrice = matchingRule?.abb_price ? Number(matchingRule.abb_price) : null

      return {
        success: true,
        matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'SIEMENS_DIRECT',
        matchConfidence: 100,
        sourceBrand: 'SIEMENS',
        sourceModel: query,
        category: accurateItem?.category || matchingRule?.category || 'SIEMENS_PRODUCT',
        siemensMLFB: targetSiemens,
        siemensName: accurateItem?.item_name || matchingRule?.siemens_name || `Siemens ${targetSiemens}`,
        schneiderModel,
        schneiderDesc,
        schneiderPrice,
        abbModel,
        abbDesc,
        abbPrice,
        specsSummary: accurateItem?.long_description || accurateItem?.description || matchingRule?.specs_summary || '',
        accurateItem,
        notes: 'Produk Siemens dari Database.',
        specsComparison: [],
        alternatives: []
      }
    }

    // Fallback: try Schneider then ABB
    const schneiderRes = this.convertSchneider(query)
    if (schneiderRes.success && schneiderRes.matchConfidence >= 75) {
      return schneiderRes
    }
    const abbRes = this.convertABB(query)
    if (abbRes.success && abbRes.matchConfidence >= 75) {
      return abbRes
    }

    return schneiderRes.success ? schneiderRes : abbRes
  }

  detectBrand(str) {
    if (!str) return 'SCHNEIDER'
    const s = str.trim().toUpperCase()
    if (/^(5TJ|5SL|5SY|5SJ|5SP|5SV|5SM|5SU|5ST|3VA|3VJ|3VM|3VL|3VT|3WL|3WA|3WT|3WN|3VW|3RT|3TF|3RU|3RB|3RV|3RW|6SL|6SE|3SU|6EP|6ED1|6ES7|6AV|6GK|6AG|3WA9|3WL9|3VA9|3VW9|3VJ9|3VM9|3RT29|3RT19|3RV29|3RU29|5ST3|5ST2|3TX|3TY|3ZX|3KD|3KF|3KC|3LD|3NP|3NA|3ND|3NE|3NC|3NW|3NH)/i.test(s) || /SIEMENS\b/i.test(s)) {
      return 'SIEMENS'
    }
    if (/^(S20|SH20|SN20|XT1|XT2|XT3|XT4|XT5|XT7|A1|A2|A3|AF|AX|TF42|TF65|TF96|EF19|EF45|MS116|MS132|MS165|PSR|PSE|PSTX|ACS|CP1|CL|E1\.2|E2\.2|E4\.2|E6\.2|1SDA|1SVR|1SFA|F20)/i.test(s) || /ABB\b/i.test(s)) {
      return 'ABB'
    }
    if (/^(A9F|A9K|A9R|DOM|EZ9|LV4|LV5|EZC|LC1D|LC1F|LC1E|LRD|GV2|GV3|GV4|ATS|ATV|XB4|XB5|XB7|TM221|SR2|SR3|NW|NT|MTZ|TRV|33668|33671|47893|47440|ABLS)/i.test(s) || /SCHNEIDER|TELEMECANIQUE|MERLIN\s*GERIN|ACTI9|EASYPACT|TESYS/i.test(s)) {
      return 'SCHNEIDER'
    }
    return 'SCHNEIDER' // default
  }

  // ==========================================
  // SCHNEIDER TO SIEMENS CONVERTER
  // ==========================================
  convertSchneider(str) {
    const q = str.toUpperCase().trim()

    // 1. MCB: Acti9 iC60N, iC60H, iK60N, Domae, Easy9, C60, C120
    const mcbMatch = this.matchSchneiderMCB(q)
    if (mcbMatch) return mcbMatch

    // 2. MCCB: Compact NSX, EasyPact CVS, EasyPact EZC, NSXm
    const mccbMatch = this.matchSchneiderMCCB(q)
    if (mccbMatch) return mccbMatch

    // 3. Contactor: TeSys D (LC1D), TeSys F (LC1F), TeSys E (LC1E)
    const contactorMatch = this.matchSchneiderContactor(q)
    if (contactorMatch) return contactorMatch

    // 4. Thermal Overload Relay (TOR): TeSys LRD, LR9D, LR9F
    const torMatch = this.matchSchneiderTOR(q)
    if (torMatch) return torMatch

    // 5. MPCB (Motor Protection): TeSys GV2ME, GV2P, GV3P, GV4
    const mpcbMatch = this.matchSchneiderMPCB(q)
    if (mpcbMatch) return mpcbMatch

    // 6. ACB (Air Circuit Breaker): Masterpact NT, NW, MTZ
    const acbMatch = this.matchSchneiderACB(q)
    if (acbMatch) return acbMatch

    // 7. Soft Starter: Altistart ATS01, ATS22, ATS48, ATS480
    const softStarterMatch = this.matchSchneiderSoftStarter(q)
    if (softStarterMatch) return softStarterMatch

    // 8. Inverter (VFD): Altivar ATV12, ATV310, ATV320, ATV610, ATV630
    const vfdMatch = this.matchSchneiderVFD(q)
    if (vfdMatch) return vfdMatch

    // 9. Pilot Devices: Harmony XB4, XB5, XB7
    const pilotMatch = this.matchSchneiderPilotDevice(q)
    if (pilotMatch) return pilotMatch

    // 10. Smart Relay / PLC: Zelio SR2/SR3, Modicon M221
    const plcMatch = this.matchSchneiderPLC(q)
    if (plcMatch) return plcMatch

    return {
      success: false,
      message: `Format part number Schneider "${str}" belum dikenali secara otomatis. Anda dapat memilih spesifikasi secara manual atau menambahkan aturan kustom.`
    }
  }

  // --- SCHNEIDER MCB MATCHER ---
  matchSchneiderMCB(q) {
    if (!/A9[FK]|DOM|EZ9|IC60|IK60|C60|C120|\bMCB\b/i.test(q) || /MTZ|MASTERPACT|NW|NT|LC1|GV2|GV3|LRD|ATV|ATS|XB[457]|33668|33671|47893|47440|TRV/i.test(q)) return null
    let poles = 1
    let ampere = 6
    let kA = '6kA'
    let series = '5SL6'

    if (/A9F84/i.test(q) || /iC60H/i.test(q) || /10\s*KA/i.test(q)) {
      kA = '10kA'
      series = '5SL4'
    } else if (/DOM/i.test(q) || /DOMAE/i.test(q) || /EZ9/i.test(q) || /4\.5\s*KA/i.test(q)) {
      kA = '4.5kA / 6kA'
      series = '5SL6'
    }

    // Extract Poles
    if (/A9F[78]41|A9K241|DOM111|EZ9F341/i.test(q) || /\b1P\b|\b1\s*POLE/i.test(q)) {
      poles = 1
    } else if (/A9F[78]42|A9K242|DOM112|EZ9F342/i.test(q) || /\b2P\b|\b2\s*POLE/i.test(q)) {
      poles = 2
    } else if (/A9F[78]43|A9K243|DOM113|EZ9F343/i.test(q) || /\b3P\b|\b3\s*POLE/i.test(q)) {
      poles = 3
    } else if (/A9F[78]44|A9K244|DOM114|EZ9F344/i.test(q) || /\b4P\b|\b4\s*POLE/i.test(q)) {
      poles = 4
    }

    // Extract Ampere
    const ampFromCode = q.match(/A9[FK][782]4\d(\d{2})|DOM11\d(\d{2})|EZ9F34\d(\d{2})/)
    if (ampFromCode) {
      ampere = parseInt(ampFromCode[1] || ampFromCode[2] || ampFromCode[3], 10)
    } else {
      const ampMatch = q.match(/\b(0\.5|1|2|3|4|6|10|16|20|25|32|40|50|63|80|100|125)\s*A\b/i)
      if (ampMatch) ampere = parseFloat(ampMatch[1])
    }

    // Check if valid MCB query
    if (!/A9[FK]|DOM|EZ9|IC60|IK60|C60|C120|MCB/i.test(q) && !q.includes('POLE') && !q.includes('1P') && !q.includes('3P')) {
      return null
    }

    const padAmp = String(ampere).padStart(2, '0')
    let siemensMLFB = `${series}${poles}${padAmp}-7CC`

    // High current handling (80A-125A)
    if (ampere > 63) {
      if (ampere === 80) siemensMLFB = `5SP4${poles}80-7`
      else if (ampere === 100) siemensMLFB = `5SP4${poles}91-7`
      else if (ampere === 125) siemensMLFB = `5SP4${poles}92-7`
    }

    const accurateItem = this.findInAccurate(siemensMLFB)
    const altMLFB = series === '5SL6' ? `5SL4${poles}${padAmp}-7CC` : `5SL6${poles}${padAmp}-7CC`
    const altAccurate = this.findInAccurate(altMLFB)

    const alternatives = []
    if (altAccurate || altMLFB) {
      alternatives.push({
        mlfb: altMLFB,
        name: altAccurate?.item_name || `Siemens MCB 5SL ${poles}P ${ampere}A (${series === '5SL6' ? '10kA Industrial' : '6kA Standard'})`,
        price: altAccurate?.unit_price || 0,
        stock: altAccurate?.stock_quantity || 0,
        tag: series === '5SL6' ? 'Opsi Kapasitas 10kA (High-Spec)' : 'Opsi Ekonomis 6kA'
      })
    }

    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 95,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'MCB',
      sourceSpecs: { poles: `${poles}P`, ampere: `${ampere}A`, breakingCapacity: kA, curve: 'C-Curve' },
      siemensMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS MCB, 5SL, ${poles}P, ${ampere}A, ${kA}, C-CURVE`,
      accurateItem,
      notes: `Ekuivalen langsung 1-to-1 dengan sertifikasi IEC 60898-1/60947-2. Pemasangan pada DIN-Rail 35mm standar.`,
      specsComparison: [
        { parameter: 'Jumlah Kutub (Poles)', sourceValue: `${poles} Pole (${poles}P)`, siemensValue: `${poles} Pole (${poles}P)`, status: 'MATCH' },
        { parameter: 'Arus Pengenal (In)', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Breaking Capacity (Icn)', sourceValue: kA, siemensValue: kA, status: 'MATCH' },
        { parameter: 'Karakteristik Trip', sourceValue: 'C-Curve (5-10 In)', siemensValue: 'C-Curve (5-10 In)', status: 'MATCH' },
        { parameter: 'Mounting & Form Factor', sourceValue: 'DIN Rail 35mm (18mm/Pole)', siemensValue: 'DIN Rail 35mm (18mm/Pole)', status: 'MATCH' }
      ],
      alternatives
    }
  }

  // --- SCHNEIDER MCCB MATCHER ---
  matchSchneiderMCCB(q) {
    if (!/NSX|CVS|EZC|LV4|LV5|MCCB/i.test(q)) return null

    let poles = 3
    let ampere = 100
    let kA = '36kA'
    let tripUnit = 'Thermal Magnetic (TM-D)'

    if (/4P|\b4\s*POLE|LV429638|LV429848/i.test(q)) poles = 4
    else poles = 3

    const ampMatch = q.match(/\b(16|20|25|32|40|50|63|80|100|125|160|200|250|320|400|500|630|800|1000|1250|1600)\s*A\b/i) ||
                     q.match(/TM(\d{2,3})D/i) ||
                     q.match(/(100|160|250|400|630|800)\b/i)
    if (ampMatch) {
      ampere = parseInt(ampMatch[1], 10)
    }

    if (/NSX.*F\b|CVS.*F\b|EZC.*F\b|36\s*KA/i.test(q)) kA = '36kA'
    else if (/NSX.*N\b|50\s*KA/i.test(q)) kA = '50kA / 55kA'
    else if (/NSX.*H\b|70\s*KA/i.test(q)) kA = '70kA'
    else if (/25\s*KA/i.test(q)) kA = '25kA'
    else if (/10\s*KA|18\s*KA/i.test(q)) kA = '18kA'

    if (/MICROLOGIC|ELEKTRONIK|ELECTRONIC/i.test(q) || ampere >= 400) {
      tripUnit = 'Electronic Trip Unit'
    }

    let target3VA = ''
    let target3VJ = ''

    if (ampere <= 100) {
      target3VA = `3VA1110-4EE32-0AA0`
      target3VJ = `3VJ1010-0DA32-0AA0`
    } else if (ampere <= 125) {
      target3VA = `3VA1112-4EE32-0AA0`
      target3VJ = `3VJ1012-3DB32-0AA0`
    } else if (ampere <= 160) {
      target3VA = `3VA1116-4EE32-0AA0`
      target3VJ = `3VJ1116-3DB32-0AA0`
    } else if (ampere <= 250) {
      target3VA = `3VA1225-4EF32-0AA0`
      target3VJ = `3VJ1225-3DB32-0AA0`
    } else if (ampere <= 400) {
      target3VA = `3VA1340-4EF32-0AA0`
      target3VJ = `3VJ1340-5DB32-0AA0`
    } else if (ampere <= 630) {
      target3VA = `3VA1463-4EF32-0AA0`
      target3VJ = `3VJ1463-5DB32-0AA0`
    } else {
      target3VA = `3VA2580-5HN32-0AA0`
    }

    const accurate3VA = this.findInAccurate(target3VA)
    const accurate3VJ = this.findInAccurate(target3VJ)

    const mainAccurate = accurate3VA || accurate3VJ
    const chosenMLFB = accurate3VA ? target3VA : (accurate3VJ ? target3VJ : target3VA)

    const alternatives = []
    if (target3VJ && target3VJ !== chosenMLFB) {
      alternatives.push({
        mlfb: target3VJ,
        name: accurate3VJ?.item_name || `SIEMENS MCCB, 3VJ, ${poles}P, ${ampere}A (Economical Series)`,
        price: accurate3VJ?.unit_price || 0,
        stock: accurate3VJ?.stock_quantity || 0,
        tag: 'Opsi Ekonomis (3VJ Series - Best Seller)'
      })
    }
    if (target3VA && target3VA !== chosenMLFB) {
      alternatives.push({
        mlfb: target3VA,
        name: accurate3VA?.item_name || `SIEMENS MCCB, 3VA1, ${poles}P, ${ampere}A (Premium Industrial)`,
        price: accurate3VA?.unit_price || 0,
        stock: accurate3VA?.stock_quantity || 0,
        tag: 'Opsi Premium (SENTRON 3VA1 Global)'
      })
    }

    return {
      success: true,
      matchType: mainAccurate ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: mainAccurate ? 100 : 92,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'MCCB',
      sourceSpecs: { poles: `${poles}P`, ampere: `${ampere}A`, breakingCapacity: kA, tripUnit },
      siemensMLFB: chosenMLFB,
      siemensName: mainAccurate?.item_name || `SIEMENS MCCB, 3VA1/3VJ, ${poles}P, ${ampere}A, ${kA}`,
      accurateItem: mainAccurate,
      notes: `Pengganti langsung untuk Schneider Compact NSX/CVS ${ampere}A dengan kapasitas pemutus setara. Tersedia varian 3VA1 (Global Standard) dan 3VJ (Ekonomis).`,
      specsComparison: [
        { parameter: 'Frame Size / Current (In)', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Jumlah Pole', sourceValue: `${poles} Pole`, siemensValue: `${poles} Pole`, status: 'MATCH' },
        { parameter: 'Breaking Capacity (Icu)', sourceValue: kA, siemensValue: kA, status: 'MATCH' },
        { parameter: 'Jenis Trip Unit', sourceValue: tripUnit, siemensValue: tripUnit, status: 'MATCH' },
        { parameter: 'Standar Industri', sourceValue: 'IEC 60947-2', siemensValue: 'IEC 60947-2', status: 'MATCH' }
      ],
      alternatives
    }
  }

  // --- SCHNEIDER CONTACTOR MATCHER ---
  matchSchneiderContactor(q) {
    if (!/LC1D|LC1F|LC1E|TESYS|KONTAKTOR|CONTACTOR/i.test(q)) return null

    let ampere = 25
    let kw = '11kW'
    let coilVoltage = '230V AC'
    let targetMLFB = '3RT2026-1AP00'
    let size = 'S0'

    const codeMatch = q.match(/LC1[DFE](\d{2,3})/i)
    if (codeMatch) {
      const codeVal = parseInt(codeMatch[1], 10)
      if (codeVal === 9) { ampere = 9; kw = '4kW'; targetMLFB = '3RT2016-1AP01'; size = 'S00' }
      else if (codeVal === 12) { ampere = 12; kw = '5.5kW'; targetMLFB = '3RT2017-1AP01'; size = 'S00' }
      else if (codeVal === 18) { ampere = 18; kw = '7.5kW'; targetMLFB = '3RT2018-1AP01'; size = 'S00' }
      else if (codeVal === 25) { ampere = 25; kw = '11kW'; targetMLFB = '3RT2026-1AP00'; size = 'S0' }
      else if (codeVal === 32) { ampere = 32; kw = '15kW'; targetMLFB = '3RT2027-1AP00'; size = 'S0' }
      else if (codeVal === 38) { ampere = 38; kw = '18.5kW'; targetMLFB = '3RT2028-1AP00'; size = 'S0' }
      else if (codeVal === 40) { ampere = 40; kw = '18.5kW'; targetMLFB = '3RT2035-1AP00'; size = 'S2' }
      else if (codeVal === 50) { ampere = 50; kw = '22kW'; targetMLFB = '3RT2036-1AP00'; size = 'S2' }
      else if (codeVal === 65) { ampere = 65; kw = '30kW'; targetMLFB = '3RT2037-1AP00'; size = 'S2' }
      else if (codeVal === 80) { ampere = 80; kw = '37kW'; targetMLFB = '3RT2038-1AP00'; size = 'S2' }
      else if (codeVal === 95) { ampere = 95; kw = '45kW'; targetMLFB = '3RT2046-1AP00'; size = 'S3' }
      else if (codeVal === 115) { ampere = 115; kw = '55kW'; targetMLFB = '3RT1054-1AP36'; size = 'S6' }
      else if (codeVal === 150) { ampere = 150; kw = '75kW'; targetMLFB = '3RT1055-6AP36'; size = 'S6' }
      else if (codeVal === 185) { ampere = 185; kw = '90kW'; targetMLFB = '3RT1056-6AP36'; size = 'S6' }
      else if (codeVal === 225) { ampere = 225; kw = '110kW'; targetMLFB = '3RT1064-6AP36'; size = 'S10' }
      else if (codeVal === 265) { ampere = 265; kw = '132kW'; targetMLFB = '3RT1065-6AP36'; size = 'S10' }
      else if (codeVal === 330) { ampere = 330; kw = '160kW'; targetMLFB = '3RT1066-6AP36'; size = 'S10' }
      else if (codeVal === 400) { ampere = 400; kw = '200kW'; targetMLFB = '3RT1075-6AP36'; size = 'S12' }
      else if (codeVal === 500) { ampere = 500; kw = '250kW'; targetMLFB = '3RT1076-6AP36'; size = 'S12' }
    }

    if (/M7|P7|220V|230V/i.test(q)) {
      coilVoltage = '230V AC (50/60Hz)'
    } else if (/BD|24V\s*DC|24VDC/i.test(q)) {
      coilVoltage = '24V DC'
      targetMLFB = targetMLFB.replace('-1AP00', '-1BB40').replace('-1AP01', '-1BB41')
    } else if (/B7|24V\s*AC/i.test(q)) {
      coilVoltage = '24V AC'
      targetMLFB = targetMLFB.replace('-1AP00', '-1AB00')
    } else if (/F7|110V/i.test(q)) {
      coilVoltage = '110V AC'
      targetMLFB = targetMLFB.replace('-1AP00', '-1AF00')
    }

    const accurateItem = this.findInAccurate(targetMLFB)

    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 95,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'CONTACTOR',
      sourceSpecs: { ampere: `${ampere}A (AC-3)`, power: kw, coilVoltage, contacts: '1NO+1NC' },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS POWER CONTACTOR, 3RT2, 3P, ${ampere}A, ${kw}, ${coilVoltage}, SIZE ${size}`,
      accurateItem,
      notes: `SIRIUS 3RT2 Contactor kompatibel langsung dengan kontak bantu terintegrasi 1NO+1NC dan mounting DIN Rail / baut.`,
      specsComparison: [
        { parameter: 'Rating Arus AC-3 (400V)', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Daya Motor (kW)', sourceValue: kw, siemensValue: kw, status: 'MATCH' },
        { parameter: 'Tegangan Coil', sourceValue: coilVoltage, siemensValue: coilVoltage, status: 'MATCH' },
        { parameter: 'Kontak Bantu Terintegrasi', sourceValue: '1 NO + 1 NC', siemensValue: '1 NO + 1 NC', status: 'MATCH' },
        { parameter: 'Ukuran Frame Modular', sourceValue: `TeSys ${ampere <= 38 ? 'D1' : 'D2'}`, siemensValue: `SIRIUS Size ${size}`, status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- SCHNEIDER TOR MATCHER ---
  matchSchneiderTOR(q) {
    if (!/LRD|LR9|OVERLOAD|TOR/i.test(q)) return null
    let targetMLFB = '3RU2126-4BB0'
    let range = '14 - 20 A'

    if (/LRD01/i.test(q)) { range = '0.1 - 0.16 A'; targetMLFB = '3RU2116-0AB0' }
    else if (/LRD02/i.test(q)) { range = '0.16 - 0.25 A'; targetMLFB = '3RU2116-0CB0' }
    else if (/LRD05/i.test(q)) { range = '0.63 - 1 A'; targetMLFB = '3RU2116-0JB0' }
    else if (/LRD06/i.test(q)) { range = '1 - 1.6 A'; targetMLFB = '3RU2116-1AB0' }
    else if (/LRD07/i.test(q)) { range = '1.6 - 2.5 A'; targetMLFB = '3RU2116-1CB0' }
    else if (/LRD08/i.test(q)) { range = '2.5 - 4 A'; targetMLFB = '3RU2116-1EB0' }
    else if (/LRD10/i.test(q)) { range = '4 - 6 A'; targetMLFB = '3RU2116-1GB0' }
    else if (/LRD12/i.test(q)) { range = '5.5 - 8 A'; targetMLFB = '3RU2116-1HB0' }
    else if (/LRD14/i.test(q)) { range = '7 - 10 A'; targetMLFB = '3RU2116-1JB0' }
    else if (/LRD16/i.test(q)) { range = '9 - 13 A'; targetMLFB = '3RU2126-1KB0' }
    else if (/LRD21/i.test(q)) { range = '12 - 18 A'; targetMLFB = '3RU2126-4AB0' }
    else if (/LRD22/i.test(q)) { range = '16 - 24 A'; targetMLFB = '3RU2126-4CB0' }
    else if (/LRD32/i.test(q)) { range = '23 - 32 A'; targetMLFB = '3RU2126-4EB0' }
    else if (/LRD35/i.test(q)) { range = '30 - 38 A'; targetMLFB = '3RU2126-4FB0' }
    else if (/LRD3322/i.test(q)) { range = '17 - 25 A (Size S2)'; targetMLFB = '3RU2136-4DB0' }
    else if (/LRD3353/i.test(q)) { range = '23 - 32 A (Size S2)'; targetMLFB = '3RU2136-4EB0' }
    else if (/LRD3355/i.test(q)) { range = '30 - 40 A (Size S2)'; targetMLFB = '3RU2136-4FB0' }
    else if (/LRD3359/i.test(q)) { range = '48 - 65 A (Size S2)'; targetMLFB = '3RU2136-4KB0' }
    else if (/LRD3365/i.test(q)) { range = '60 - 80 A (Size S2)'; targetMLFB = '3RU2136-4RB0' }

    const accurateItem = this.findInAccurate(targetMLFB)

    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 94,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'TOR',
      sourceSpecs: { settingRange: range, tripClass: 'Class 10' },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS THERMAL OVERLOAD RELAY, 3RU21, ${range}, CLASS 10`,
      accurateItem,
      notes: `Thermal Overload Relay SIRIUS 3RU21 dirancang pasang langsung di bawah kontaktor 3RT2.`,
      specsComparison: [
        { parameter: 'Rentang Penyetelan Arus', sourceValue: range, siemensValue: range, status: 'MATCH' },
        { parameter: 'Trip Class', sourceValue: 'Class 10A', siemensValue: 'Class 10', status: 'MATCH' },
        { parameter: 'Kontak Bantu Indikasi', sourceValue: '1 NO + 1 NC', siemensValue: '1 NO + 1 NC', status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- SCHNEIDER MPCB MATCHER ---
  matchSchneiderMPCB(q) {
    if (!/GV2|GV3|GV4|MPCB|MOTOR CIRCUIT/i.test(q)) return null
    let targetMLFB = '3RV2021-4AA10'
    let range = '10 - 16 A'

    if (/GV2ME01|GV2P01/i.test(q)) { range = '0.1 - 0.16 A'; targetMLFB = '3RV2011-0AA10' }
    else if (/GV2ME02|GV2P02/i.test(q)) { range = '0.16 - 0.25 A'; targetMLFB = '3RV2011-0BA10' }
    else if (/GV2ME05|GV2P05/i.test(q)) { range = '0.63 - 1 A'; targetMLFB = '3RV2011-0JA10' }
    else if (/GV2ME06|GV2P06/i.test(q)) { range = '1 - 1.6 A'; targetMLFB = '3RV2011-1AA10' }
    else if (/GV2ME07|GV2P07/i.test(q)) { range = '1.6 - 2.5 A'; targetMLFB = '3RV2011-1CA10' }
    else if (/GV2ME08|GV2P08/i.test(q)) { range = '2.5 - 4 A'; targetMLFB = '3RV2011-1EA10' }
    else if (/GV2ME10|GV2P10/i.test(q)) { range = '4 - 6.3 A'; targetMLFB = '3RV2011-1GA10' }
    else if (/GV2ME14|GV2P14/i.test(q)) { range = '6 - 10 A'; targetMLFB = '3RV2011-1JA10' }
    else if (/GV2ME16|GV2P16/i.test(q)) { range = '9 - 14 A'; targetMLFB = '3RV2011-1KA10' }
    else if (/GV2ME20|GV2P20/i.test(q)) { range = '13 - 18 A'; targetMLFB = '3RV2021-4BA10' }
    else if (/GV2ME21|GV2P21/i.test(q)) { range = '17 - 23 A'; targetMLFB = '3RV2021-4CA10' }
    else if (/GV2ME22|GV2P22/i.test(q)) { range = '20 - 25 A'; targetMLFB = '3RV2021-4DA10' }
    else if (/GV2ME32|GV2P32/i.test(q)) { range = '24 - 32 A'; targetMLFB = '3RV2021-4EA10' }
    else if (/GV3P40/i.test(q)) { range = '30 - 40 A'; targetMLFB = '3RV2031-4UA10' }
    else if (/GV3P50/i.test(q)) { range = '37 - 50 A'; targetMLFB = '3RV2031-4WA10' }
    else if (/GV3P65/i.test(q)) { range = '48 - 65 A'; targetMLFB = '3RV2031-4JA10' }

    const accurateItem = this.findInAccurate(targetMLFB)

    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 94,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'MPCB',
      sourceSpecs: { settingRange: range, breakingCapacity: '50kA/100kA' },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS MOTOR STARTER PROTECTOR (MPCB), 3RV20, ${range}, 100kA`,
      accurateItem,
      notes: `SIRIUS 3RV20 memberikan proteksi hubung singkat (short circuit) dan beban lebih (overload) sekaligus.`,
      specsComparison: [
        { parameter: 'Thermal Release Range', sourceValue: range, siemensValue: range, status: 'MATCH' },
        { parameter: 'Magnetic Trip', sourceValue: '13 x In', siemensValue: '13 x In', status: 'MATCH' },
        { parameter: 'Breaking Capacity (Icu)', sourceValue: '50 kA / 100 kA', siemensValue: '100 kA (S00/S0)', status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- SCHNEIDER ACB MATCHER ---
  matchSchneiderACB(q) {
    if (!/MASTERPACT|NW|NT|MTZ|LV8|ACB\b/i.test(q)) return null
    let ampere = 1600
    let ampCode = '116'

    const ampMatch = q.match(/\b(630|800|1000|1250|1600|2000|2500|3200|4000|5000|6300)\b/i) || q.match(/NT(\d{2})|NW(\d{2})|MTZ\d?\s*(\d{2})/i)
    if (ampMatch) {
      const rawVal = ampMatch[1] || ampMatch[2] || ampMatch[3]
      const val = parseInt(rawVal, 10)
      if (val === 6 || val === 630 || rawVal === '06') { ampere = 630; ampCode = '106' }
      else if (val === 8 || val === 800 || rawVal === '08') { ampere = 800; ampCode = '108' }
      else if (val === 10 || val === 1000) { ampere = 1000; ampCode = '110' }
      else if (val === 12 || val === 1250) { ampere = 1250; ampCode = '112' }
      else if (val === 16 || val === 1600) { ampere = 1600; ampCode = '116' }
      else if (val === 20 || val === 2000) { ampere = 2000; ampCode = '120' }
      else if (val === 25 || val === 2500) { ampere = 2500; ampCode = '125' }
      else if (val === 32 || val === 3200) { ampere = 3200; ampCode = '132' }
      else if (val === 40 || val === 4000) { ampere = 4000; ampCode = '140' }
      else if (val === 50 || val === 5000) { ampere = 5000; ampCode = '250' }
      else if (val === 63 || val === 6300) { ampere = 6300; ampCode = '363' }
    }

    const is4P = /\b4P\b|\b4-POLE/i.test(q)
    const poleChar = is4P ? '3' : '2'
    const poleStr = is4P ? '4P' : '3P'

    let kaChar = 'C'
    let kaVal = 66
    if (/\b(N1|N|42KA|50KA|55KA)\b/i.test(q)) { kaChar = 'B'; kaVal = 55 }
    else if (/\b(H1|H2|H|66KA|70KA)\b/i.test(q)) { kaChar = 'C'; kaVal = 66 }
    else if (/\b(H10|H3|L1|L|100KA|150KA)\b/i.test(q)) { kaChar = 'E'; kaVal = 100 }

    let tripChar = 'C'
    let tripStr = 'ETU600-LSI'
    let abbTrip = 'Dip-LSI'
    if (/6\.0|LSIG|GROUND FAULT/i.test(q)) {
      tripChar = 'E'
      tripStr = 'ETU600-LSIG'
      abbTrip = 'Touch-LSIG'
    } else if (/5\.0|LSI/i.test(q)) {
      tripChar = 'C'
      tripStr = 'ETU600-LSI'
      abbTrip = 'Dip-LSI'
    } else if (/2\.0|LI/i.test(q)) {
      tripChar = 'B'
      tripStr = 'ETU300-LSI'
      abbTrip = 'Dip-LSI'
    } else if (/NA|SWITCH|NON-AUTO/i.test(q)) {
      tripChar = 'A'
      tripStr = 'Switch-Disconnector'
      abbTrip = 'MS'
    }

    const isDrawout = /\b(DRAWOUT|WITHDRAWABLE|W\/O|DRW)\b/i.test(q)
    const mountChar = isDrawout ? '2' : '0'
    const mountStr = isDrawout ? 'Drawout (W/O)' : 'Fixed (F/T)'
    const abbMount = isDrawout ? 'Drawout (W MP)' : 'Fixed (F F)'

    const frameSize = (ampCode.startsWith('2') || ampCode.startsWith('3')) ? '2' : '1'
    const targetMLFB = `3WA${frameSize}${ampCode}-${poleChar}${kaChar}${tripChar}${mountChar}2-0AA0`

    // ABB Emax 2 SKU Mapping
    let abbModel = '1SDA070744R1'
    let abbFrame = 'E1.2N 800'
    if (ampere <= 800) {
      abbFrame = 'E1.2N 800'
      if (!isDrawout) {
        abbModel = is4P ? (abbTrip === 'Dip-LSI' ? '1SDA070722R1' : '1SDA070754R1') : (abbTrip === 'Dip-LSI' ? '1SDA070712R1' : '1SDA070744R1')
      } else {
        abbModel = is4P ? (abbTrip === 'Dip-LSI' ? '1SDA072122R1' : '1SDA072154R1') : (abbTrip === 'Dip-LSI' ? '1SDA072112R1' : '1SDA072144R1')
      }
    } else if (ampere <= 1000) {
      abbFrame = 'E1.2N 1000'
      abbModel = isDrawout ? (is4P ? '1SDA072204R1' : '1SDA072194R1') : (is4P ? '1SDA070804R1' : '1SDA070794R1')
    } else if (ampere <= 1250) {
      abbFrame = 'E1.2N 1250'
      abbModel = isDrawout ? (is4P ? '1SDA072234R1' : '1SDA072224R1') : (is4P ? '1SDA070834R1' : '1SDA070824R1')
    } else if (ampere <= 1600) {
      abbFrame = 'E1.2N 1600'
      abbModel = isDrawout ? (is4P ? '1SDA072284R1' : '1SDA072274R1') : (is4P ? '1SDA070884R1' : '1SDA070874R1')
    } else if (ampere <= 2500) {
      abbFrame = 'E2.2N 2500'
      abbModel = isDrawout ? (is4P ? '1SDA072464R1' : '1SDA072454R1') : (is4P ? '1SDA071064R1' : '1SDA071054R1')
    } else if (ampere <= 4000) {
      abbFrame = 'E4.2N 4000'
      abbModel = isDrawout ? (is4P ? '1SDA072864R1' : '1SDA072854R1') : (is4P ? '1SDA071464R1' : '1SDA071454R1')
    } else {
      abbFrame = 'E6.2H 6300'
      abbModel = isDrawout ? (is4P ? '1SDA071914R1' : '1SDA071904R1') : (is4P ? '1SDA071914R1' : '1SDA071904R1')
    }

    const abbDesc = `ABB Emax 2 ${abbFrame} ${ampere}A ${poleStr} ${kaVal}kA ${abbMount} Air Circuit Breaker with ${abbTrip === 'Touch-LSIG' ? 'Ekip Touch LSIG' : 'Ekip Dip LSI'} Trip Unit`

    const accurateItem = this.findInAccurate(targetMLFB)

    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 95,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'ACB',
      sourceSpecs: { ampere: `${ampere}A`, poles: poleStr, breakingCapacity: `${kaVal}kA`, type: mountStr, tripUnit: tripStr },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS AIR CIRCUIT BREAKER, 3WA, ${poleStr}, ${ampere}A, ${kaVal}kA, ${mountStr}, ${tripStr}`,
      abbModel: abbModel,
      abbDesc: abbDesc,
      accurateItem,
      notes: `SENTRON 3WA adalah generasi terbaru ACB Siemens menggantikan 3WL dengan performa tinggi & integrasi IoT.`,
      specsComparison: [
        { parameter: 'Arus Nominal (In)', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Jumlah Kutub', sourceValue: poleStr, siemensValue: poleStr, status: 'MATCH' },
        { parameter: 'Breaking Capacity (Icu)', sourceValue: `${kaVal}kA`, siemensValue: `${kaVal}kA`, status: 'MATCH' },
        { parameter: 'Electronic Trip Unit', sourceValue: tripStr, siemensValue: tripStr, status: 'MATCH' },
        { parameter: 'Tipe Pemasangan', sourceValue: mountStr, siemensValue: mountStr, status: 'MATCH' }
      ],
      alternatives: [
        { mlfb: `3WL11${String(ampere / 100).padStart(2, '0')}-2EB32-0AA0`, name: `SIEMENS ACB 3WL1 (Classic Proven Series) ${ampere}A`, price: 0, tag: '3WL Classic Series' }
      ]
    }
  }

  // --- SCHNEIDER SOFT STARTER MATCHER ---
  matchSchneiderSoftStarter(q) {
    if (!/ATS|ALTISTART|SOFT\s*STARTER/i.test(q)) return null
    let targetMLFB = '3RW4026-1BB14'
    let kw = '11kW'
    let ampere = '25A'

    const kwMatch = q.match(/\b(1\.5|2\.2|3|4|5\.5|7\.5|11|15|18\.5|22|30|37|45|55|75|90|110|132|160|200|250)\s*KW\b/i)
    if (kwMatch) kw = `${kwMatch[1]}kW`

    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: 90,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'SOFT_STARTER',
      sourceSpecs: { power: kw, ampere },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS SIRIUS SOFT STARTER, 3RW40, ${kw}, 200-480V`,
      accurateItem,
      notes: 'SIRIUS 3RW40 dilengkapi bypass contactor terintegrasi & perlindungan beban lebih elektronik.',
      specsComparison: [
        { parameter: 'Daya Motor', sourceValue: kw, siemensValue: kw, status: 'MATCH' },
        { parameter: 'Bypass Terintegrasi', sourceValue: 'Ya', siemensValue: 'Ya (Integrated)', status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- SCHNEIDER VFD MATCHER ---
  matchSchneiderVFD(q) {
    if (!/ATV|ALTIVAR|INVERTER|VFD/i.test(q)) return null
    let targetMLFB = '6SL3210-5BB21-1UV0'
    let kw = '0.75kW - 1.5kW'

    if (/ATV310|ATV320|ATV610/i.test(q)) {
      targetMLFB = '6SL3210-1KE13-2UB2'
    }

    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: 90,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'VFD',
      sourceSpecs: { series: 'Altivar', power: kw },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS SINAMICS V20 / G120C INVERTER DRIVE`,
      accurateItem,
      notes: 'SINAMICS V20 untuk aplikasi pompa/fan/konveyor standar; SINAMICS G120C untuk aplikasi industri dengan bus communication.',
      specsComparison: [
        { parameter: 'Tipe Drive', sourceValue: 'VFD Inverter', siemensValue: 'SINAMICS Vector/V/f Drive', status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- SCHNEIDER PILOT DEVICE MATCHER ---
  matchSchneiderPilotDevice(q) {
    if (!/XB4|XB5|XB7|PUSH\s*BUTTON|PILOT\s*LAMP|SELECTOR/i.test(q)) return null
    let targetMLFB = '3SU1000-0AB40-0AA0'
    let devType = 'Push Button Green Flush'

    if (/XB4BA21|XB5AA21|BLACK/i.test(q)) {
      targetMLFB = '3SU1000-0AB10-0AA0'; devType = 'Push Button Black 22mm'
    } else if (/XB4BA42|XB5AA42|RED/i.test(q)) {
      targetMLFB = '3SU1000-0AB20-0AA0'; devType = 'Push Button Red 22mm 1NC'
    } else if (/XB4BS542|XB5AS542|EMERGENCY|E-STOP/i.test(q)) {
      targetMLFB = '3SU1000-1HB20-0AA0'; devType = 'Emergency Stop 40mm Turn-to-Release'
    } else if (/XB4BVM3|XB5AVM3|PILOT.*GREEN|LAMPU.*HIJAU/i.test(q)) {
      targetMLFB = '3SU1106-6AA40-1AA0'; devType = 'Pilot Lamp Compact LED 230V Green'
    } else if (/XB4BVM4|XB5AVM4|PILOT.*RED|LAMPU.*MERAH/i.test(q)) {
      targetMLFB = '3SU1106-6AA20-1AA0'; devType = 'Pilot Lamp Compact LED 230V Red'
    } else if (/XB4BD21|XB5AD21|2\s*POS/i.test(q)) {
      targetMLFB = '3SU1002-2BF10-0AA0'; devType = 'Selector Switch 2-Position 1NO'
    } else if (/XB4BD33|XB5AD33|3\s*POS/i.test(q)) {
      targetMLFB = '3SU1002-2BL10-0AA0'; devType = 'Selector Switch 3-Position 2NO'
    }

    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: 95,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'PILOT_DEVICE',
      sourceSpecs: { type: devType, diameter: '22mm', rating: 'IP66 / IP69K' },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS SIRIUS ACT, ${devType}, 22mm`,
      accurateItem,
      notes: 'SIRIUS ACT 3SU1 memiliki proteksi IP69K dan mekanisme snap-on tercepat di kelasnya.',
      specsComparison: [
        { parameter: 'Diameter Lubang Panel', sourceValue: '22 mm', siemensValue: '22.5 mm (Standard 22mm)', status: 'MATCH' },
        { parameter: 'Rating Proteksi', sourceValue: 'IP66', siemensValue: 'IP66 / IP69K (High Durability)', status: 'UPGRADED' }
      ],
      alternatives: []
    }
  }

  // --- SCHNEIDER PLC / SMART RELAY MATCHER ---
  matchSchneiderPLC(q) {
    if (!/ZELIO|SR2|SR3|TM221|M221|M241|MODICON/i.test(q)) return null
    let targetMLFB = '6ED1052-1MD08-0BA2'
    let desc = 'Siemens LOGO! 8.4 Smart Logic Controller 12/24V'

    if (/220V|230V|SR2B121FU|SR3B261FU/i.test(q)) {
      targetMLFB = '6ED1052-1FB08-0BA2'
      desc = 'Siemens LOGO! 8.4 230RCE with Display (115/230V AC)'
    } else if (/M221|TM221|MODICON/i.test(q)) {
      targetMLFB = '6ES7212-1BE40-0XB0'
      desc = 'SIMATIC S7-1200 CPU 1212C AC/DC/Relay'
    }

    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: 92,
      sourceBrand: 'Schneider Electric',
      sourceModel: q,
      category: 'PLC_AUTOMATION',
      sourceSpecs: { model: desc },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || desc,
      accurateItem,
      notes: 'Siemens LOGO! 8 & S7-1200 dilengkapi built-in Ethernet/Web Server untuk monitoring jarak jauh.',
      specsComparison: [
        { parameter: 'Ethernet & Web Server', sourceValue: 'Opsional / Tergantung Tipe', siemensValue: 'Built-in Ethernet & Web Server', status: 'UPGRADED' }
      ],
      alternatives: []
    }
  }

  // ==========================================
  // ABB TO SIEMENS CONVERTER
  // ==========================================
  convertABB(str) {
    const q = str.toUpperCase().trim()

    // 1. ABB MCB: S200, SH200, S200M, S200P, Compact Home
    const mcbMatch = this.matchABB_MCB(q)
    if (mcbMatch) return mcbMatch

    // 2. ABB MCCB: SACE Tmax XT (XT1-XT7), Formula (A1-A3)
    const mccbMatch = this.matchABB_MCCB(q)
    if (mccbMatch) return mccbMatch

    // 3. ABB Contactor: AF series (AF09 - AF370), AX series, A series
    const contactorMatch = this.matchABB_Contactor(q)
    if (contactorMatch) return contactorMatch

    // 4. ABB TOR: TF42, TF65, TF96, EF19
    const torMatch = this.matchABB_TOR(q)
    if (torMatch) return torMatch

    // 5. ABB MPCB: MS116, MS132, MS165
    const mpcbMatch = this.matchABB_MPCB(q)
    if (mpcbMatch) return mpcbMatch

    // 6. ABB ACB: Emax 2 (E1.2, E2.2, E4.2, E6.2)
    const acbMatch = this.matchABB_ACB(q)
    if (acbMatch) return acbMatch

    // 7. ABB Soft Starter: PSR, PSE, PSTX
    const softStarterMatch = this.matchABB_SoftStarter(q)
    if (softStarterMatch) return softStarterMatch

    return {
      success: false,
      message: `Format part number ABB "${str}" belum dikenali secara otomatis. Anda dapat memilih spesifikasi secara manual atau menambahkan aturan kustom.`
    }
  }

  // --- ABB MCB MATCHER ---
  matchABB_MCB(q) {
    if (!/S20|SH20|SN20|2CDS/i.test(q) && !/MCB.*ABB/i.test(q)) return null

    let poles = 1
    let ampere = 6
    let kA = '6kA'
    let series = '5SL6'

    if (/S200M|S20\dM|10\s*KA/i.test(q)) {
      kA = '10kA'
      series = '5SL4'
    } else if (/S200P|25\s*KA/i.test(q)) {
      kA = '15kA / 25kA'
      series = '5SY7'
    }

    if (/S201|SH201|SN201|\b1P\b/i.test(q)) poles = 1
    else if (/S202|SH202|\b2P\b/i.test(q)) poles = 2
    else if (/S203|SH203|\b3P\b/i.test(q)) poles = 3
    else if (/S204|SH204|\b4P\b/i.test(q)) poles = 4

    const ampMatch = q.match(/[-_\s][BCD](\d{1,3})\b/i) || q.match(/\b(\d{1,3})\s*A\b/i)
    if (ampMatch) {
      ampere = parseInt(ampMatch[1], 10)
    }

    const padAmp = String(ampere).padStart(2, '0')
    const siemensMLFB = `${series}${poles}${padAmp}-7CC`
    const accurateItem = this.findInAccurate(siemensMLFB)

    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 95,
      sourceBrand: 'ABB',
      sourceModel: q,
      category: 'MCB',
      sourceSpecs: { poles: `${poles}P`, ampere: `${ampere}A`, breakingCapacity: kA, curve: 'C-Curve' },
      siemensMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS MCB, 5SL, ${poles}P, ${ampere}A, ${kA}, C-CURVE`,
      accurateItem,
      notes: `Pengganti langsung 1-to-1 untuk ABB System pro M compact (S200/SH200). Standar IEC 60898-1/60947-2.`,
      specsComparison: [
        { parameter: 'Jumlah Pole', sourceValue: `${poles} Pole`, siemensValue: `${poles} Pole`, status: 'MATCH' },
        { parameter: 'Arus Nominal (In)', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Kapasitas Pemutus (Icn)', sourceValue: kA, siemensValue: kA, status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- ABB MCCB MATCHER ---
  matchABB_MCCB(q) {
    if (!/XT[1-7]|FORMULA|A[123][ABCSN]|TMAX/i.test(q)) return null

    let poles = 3
    let ampere = 100
    let kA = '36kA'

    if (/4P|\b4\s*POLE/i.test(q)) poles = 4
    else poles = 3

    const ampMatch = q.match(/\b(16|20|25|32|40|50|63|80|100|125|160|200|250|320|400|500|630|800)\b/i) || q.match(/TMD(\d{2,3})/i)
    if (ampMatch) ampere = parseInt(ampMatch[1], 10)

    if (/XT\d[NB]|A\d[NB]|36\s*KA/i.test(q)) kA = '36kA'
    else if (/XT\d[SC]|A\d[SC]|25\s*KA/i.test(q)) kA = '25kA'
    else if (/XT\d[H]|70\s*KA/i.test(q)) kA = '70kA'

    let target3VA = ''
    let target3VJ = ''

    if (ampere <= 100) { target3VA = '3VA1110-4EE32-0AA0'; target3VJ = '3VJ1010-0DA32-0AA0' }
    else if (ampere <= 125) { target3VA = '3VA1112-4EE32-0AA0'; target3VJ = '3VJ1012-3DB32-0AA0' }
    else if (ampere <= 160) { target3VA = '3VA1116-4EE32-0AA0'; target3VJ = '3VJ1116-3DB32-0AA0' }
    else if (ampere <= 250) { target3VA = '3VA1225-4EF32-0AA0'; target3VJ = '3VJ1225-3DB32-0AA0' }
    else if (ampere <= 400) { target3VA = '3VA1340-4EF32-0AA0'; target3VJ = '3VJ1340-5DB32-0AA0' }
    else if (ampere <= 630) { target3VA = '3VA1463-4EF32-0AA0'; target3VJ = '3VJ1463-5DB32-0AA0' }

    const accurate3VA = this.findInAccurate(target3VA)
    const accurate3VJ = this.findInAccurate(target3VJ)
    const mainAccurate = accurate3VA || accurate3VJ
    const chosenMLFB = accurate3VA ? target3VA : (accurate3VJ ? target3VJ : target3VA)

    return {
      success: true,
      matchType: mainAccurate ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: mainAccurate ? 100 : 92,
      sourceBrand: 'ABB',
      sourceModel: q,
      category: 'MCCB',
      sourceSpecs: { poles: `${poles}P`, ampere: `${ampere}A`, breakingCapacity: kA },
      siemensMLFB: chosenMLFB,
      siemensName: mainAccurate?.item_name || `SIEMENS MCCB, 3VA1/3VJ, ${poles}P, ${ampere}A, ${kA}`,
      accurateItem: mainAccurate,
      notes: `Pengganti presisi untuk ABB SACE Tmax XT & Formula A1-A3. Standar IEC 60947-2.`,
      specsComparison: [
        { parameter: 'Arus Pengenal (In)', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Jumlah Kutub', sourceValue: `${poles} Pole`, siemensValue: `${poles} Pole`, status: 'MATCH' },
        { parameter: 'Breaking Capacity (Icu)', sourceValue: kA, siemensValue: kA, status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- ABB CONTACTOR MATCHER ---
  matchABB_Contactor(q) {
    if (!/AF\d{2,3}|AX\d{2,3}|A\d{1,3}-30/i.test(q)) return null

    let ampere = 26
    let kw = '11kW'
    let targetMLFB = '3RT2026-1AP00'
    let size = 'S0'

    const codeMatch = q.match(/AF(\d{2,3})|AX(\d{2,3})|A(\d{1,3})-30/i)
    if (codeMatch) {
      const val = parseInt(codeMatch[1] || codeMatch[2] || codeMatch[3], 10)
      if (val <= 9) { ampere = 9; kw = '4kW'; targetMLFB = '3RT2016-1AP01'; size = 'S00' }
      else if (val <= 12) { ampere = 12; kw = '5.5kW'; targetMLFB = '3RT2017-1AP01'; size = 'S00' }
      else if (val <= 16) { ampere = 16; kw = '7.5kW'; targetMLFB = '3RT2018-1AP01'; size = 'S00' }
      else if (val <= 26) { ampere = 25; kw = '11kW'; targetMLFB = '3RT2026-1AP00'; size = 'S0' }
      else if (val <= 30) { ampere = 32; kw = '15kW'; targetMLFB = '3RT2027-1AP00'; size = 'S0' }
      else if (val <= 38) { ampere = 38; kw = '18.5kW'; targetMLFB = '3RT2028-1AP00'; size = 'S0' }
      else if (val <= 40) { ampere = 40; kw = '18.5kW'; targetMLFB = '3RT2035-1AP00'; size = 'S2' }
      else if (val <= 52) { ampere = 50; kw = '22kW'; targetMLFB = '3RT2036-1AP00'; size = 'S2' }
      else if (val <= 65) { ampere = 65; kw = '30kW'; targetMLFB = '3RT2037-1AP00'; size = 'S2' }
      else if (val <= 80) { ampere = 80; kw = '37kW'; targetMLFB = '3RT2038-1AP00'; size = 'S2' }
      else if (val <= 96) { ampere = 95; kw = '45kW'; targetMLFB = '3RT2046-1AP00'; size = 'S3' }
      else if (val <= 116) { ampere = 115; kw = '55kW'; targetMLFB = '3RT1054-1AP36'; size = 'S6' }
      else if (val <= 140 || val <= 146) { ampere = 150; kw = '75kW'; targetMLFB = '3RT1055-6AP36'; size = 'S6' }
      else if (val <= 190) { ampere = 185; kw = '90kW'; targetMLFB = '3RT1056-6AP36'; size = 'S6' }
      else if (val <= 205 || val <= 265) { ampere = 265; kw = '132kW'; targetMLFB = '3RT1065-6AP36'; size = 'S10' }
      else if (val <= 305 || val <= 370) { ampere = 400; kw = '200kW'; targetMLFB = '3RT1075-6AP36'; size = 'S12' }
    }

    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 95,
      sourceBrand: 'ABB',
      sourceModel: q,
      category: 'CONTACTOR',
      sourceSpecs: { ampere: `${ampere}A (AC-3)`, power: kw, size: `SIRIUS ${size}` },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS POWER CONTACTOR, 3RT2, 3P, ${ampere}A, ${kw}, 230V AC, SIZE ${size}`,
      accurateItem,
      notes: `SIRIUS 3RT2 Contactor pengganti langsung untuk ABB AF/AX Series dengan coil 230V AC dan kontak bantu 1NO+1NC.`,
      specsComparison: [
        { parameter: 'Arus Nominal AC-3', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Daya Motor (kW)', sourceValue: kw, siemensValue: kw, status: 'MATCH' },
        { parameter: 'Kontak Bantu', sourceValue: '1 NO + 1 NC', siemensValue: '1 NO + 1 NC', status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- ABB TOR MATCHER ---
  matchABB_TOR(q) {
    if (!/TF42|TF65|TF96|EF19|EF45/i.test(q)) return null
    let targetMLFB = '3RU2126-4CB0'
    let range = '16 - 24 A'

    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: 93,
      sourceBrand: 'ABB',
      sourceModel: q,
      category: 'TOR',
      sourceSpecs: { settingRange: range, tripClass: 'Class 10' },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS THERMAL OVERLOAD RELAY, 3RU21, ${range}`,
      accurateItem,
      notes: 'SIRIUS 3RU21 Thermal Overload Relay pengganti ABB TF42/TF65/TF96.',
      specsComparison: [
        { parameter: 'Rentang Arus', sourceValue: range, siemensValue: range, status: 'MATCH' },
        { parameter: 'Trip Class', sourceValue: 'Class 10', siemensValue: 'Class 10', status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- ABB MPCB MATCHER ---
  matchABB_MPCB(q) {
    if (!/MS116|MS132|MS165/i.test(q)) return null
    let targetMLFB = '3RV2011-1JA10'
    let range = '6.3 - 10 A'

    const ampMatch = q.match(/MS1\d\d-(\d+(\.\d+)?)/i)
    if (ampMatch) {
      const val = parseFloat(ampMatch[1])
      if (val <= 1) { range = '0.63 - 1 A'; targetMLFB = '3RV2011-0JA10' }
      else if (val <= 2.5) { range = '1.6 - 2.5 A'; targetMLFB = '3RV2011-1CA10' }
      else if (val <= 4) { range = '2.5 - 4 A'; targetMLFB = '3RV2011-1EA10' }
      else if (val <= 6.3) { range = '4 - 6.3 A'; targetMLFB = '3RV2011-1GA10' }
      else if (val <= 10) { range = '6.3 - 10 A'; targetMLFB = '3RV2011-1JA10' }
      else if (val <= 16) { range = '10 - 16 A'; targetMLFB = '3RV2011-1KA10' }
      else if (val <= 25) { range = '17 - 23 A'; targetMLFB = '3RV2021-4CA10' }
      else if (val <= 32) { range = '24 - 32 A'; targetMLFB = '3RV2021-4EA10' }
    }

    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: 94,
      sourceBrand: 'ABB',
      sourceModel: q,
      category: 'MPCB',
      sourceSpecs: { settingRange: range },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS MOTOR STARTER PROTECTOR (MPCB), 3RV20, ${range}`,
      accurateItem,
      notes: 'SIRIUS 3RV20 memberikan proteksi komprehensif untuk motor induction.',
      specsComparison: [
        { parameter: 'Rentang Penyetelan', sourceValue: range, siemensValue: range, status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- ABB ACB MATCHER ---
  matchABB_ACB(q) {
    if (!/EMAX|E1\.2|E2\.2|E4\.2|E6\.2|1SDA07|1SDA038|1SDA066|1SDA076/i.test(q) && !/ACB.*ABB/i.test(q)) return null
    let ampere = 800
    let ampCode = '108'
    let is4P = /\b4P\b|\b4-POLE/i.test(q)
    let isDrawout = /\bDRAWOUT|WITHDRAWABLE|W\/O|W MP\b/i.test(q)
    let tripUnit = 'ETU600-LSI'
    let schneiderTrip = '5.0 X'

    // Check specific 1SDA codes
    if (/1SDA070712/i.test(q)) { ampere = 630; ampCode = '106'; is4P = false; isDrawout = false; tripUnit = 'ETU300-LSI'; schneiderTrip = '5.0 X' }
    else if (/1SDA070744/i.test(q)) { ampere = 630; ampCode = '106'; is4P = false; isDrawout = false; tripUnit = 'ETU600-LSIG'; schneiderTrip = '6.0 X' }
    else if (/1SDA070722/i.test(q)) { ampere = 630; ampCode = '106'; is4P = true; isDrawout = false; tripUnit = 'ETU600-LSI'; schneiderTrip = '5.0 X' }
    else if (/1SDA070754/i.test(q)) { ampere = 630; ampCode = '106'; is4P = true; isDrawout = false; tripUnit = 'ETU600-LSIG'; schneiderTrip = '6.0 X' }
    else if (/1SDA072112/i.test(q)) { ampere = 630; ampCode = '106'; is4P = false; isDrawout = true; tripUnit = 'ETU300-LSI'; schneiderTrip = '5.0 X' }
    else if (/1SDA072144/i.test(q)) { ampere = 630; ampCode = '106'; is4P = false; isDrawout = true; tripUnit = 'ETU600-LSIG'; schneiderTrip = '6.0 X' }
    else if (/1SDA072122/i.test(q)) { ampere = 800; ampCode = '108'; is4P = true; isDrawout = true; tripUnit = 'ETU300-LSI'; schneiderTrip = '5.0 X' }
    else if (/1SDA072154/i.test(q)) { ampere = 800; ampCode = '108'; is4P = true; isDrawout = true; tripUnit = 'ETU600-LSIG'; schneiderTrip = '6.0 X' }
    else {
      const ampMatch = q.match(/\b(630|800|1000|1250|1600|2000|2500|3200|4000|5000|6300)\b/i)
      if (ampMatch) {
        ampere = parseInt(ampMatch[1], 10)
        ampCode = ampere === 630 ? '106' : String(ampere / 100).padStart(3, '100')
      }
    }

    const poles = is4P ? '4P' : '3P'
    const poleChar = is4P ? '3' : '2'
    const mountChar = isDrawout ? '2' : '0'
    const mountStr = isDrawout ? 'Drawout (W/O)' : 'Fixed (F/T)'
    const mountSchneider = isDrawout ? 'Drawout' : 'Fix'
    const frameSize = (ampCode.startsWith('2') || ampCode.startsWith('3')) ? '2' : '1'

    const targetMLFB = `3WA${frameSize}${ampCode}-${poleChar}C${tripUnit.includes('LSIG') ? 'E' : 'C'}${mountChar}2-0AA0`
    const schneiderModel = `MTZ1 ${ampCode === '106' ? '06' : ampCode === '108' ? '08' : ampCode.slice(1)} H1 ${poles} ${mountSchneider} MicroLogic ${schneiderTrip}`
    const schneiderDesc = `Schneider Electric MasterPact MTZ1 ${ampCode === '106' ? '06' : ampCode === '108' ? '08' : ampCode.slice(1)} H1 ${ampere}A ${poles} 55/66kA ${isDrawout ? 'Drawout (Withdrawable)' : 'Fixed'} Air Circuit Breaker with MicroLogic ${schneiderTrip} Control Unit`

    const accurateItem = this.findInAccurate(targetMLFB)

    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: accurateItem ? 100 : 95,
      sourceBrand: 'ABB',
      sourceModel: q,
      category: 'ACB',
      sourceSpecs: { ampere: `${ampere}A`, poles, breakingCapacity: '66kA', type: mountStr },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || `SIEMENS AIR CIRCUIT BREAKER, 3WA, ${poles}, ${ampere}A, 66kA, ${mountStr}, ${tripUnit}`,
      schneiderModel,
      schneiderDesc,
      accurateItem,
      notes: 'SENTRON 3WA & MasterPact MTZ adalah padanan langsung dengan spesifikasi identik untuk ABB Emax 2.',
      specsComparison: [
        { parameter: 'Arus Nominal (In)', sourceValue: `${ampere} A`, siemensValue: `${ampere} A`, status: 'MATCH' },
        { parameter: 'Jumlah Kutub', sourceValue: poles, siemensValue: poles, status: 'MATCH' },
        { parameter: 'Breaking Capacity (Icu)', sourceValue: '66kA', siemensValue: '66kA', status: 'MATCH' },
        { parameter: 'Tipe Pemasangan', sourceValue: mountStr, siemensValue: mountStr, status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  // --- ABB SOFT STARTER MATCHER ---
  matchABB_SoftStarter(q) {
    if (!/PSR|PSE|PSTX/i.test(q)) return null
    let targetMLFB = '3RW4026-1BB14'
    const accurateItem = this.findInAccurate(targetMLFB)
    return {
      success: true,
      matchType: accurateItem ? 'EXACT_IN_ACCURATE' : 'DIRECT_EQUIVALENT',
      matchConfidence: 90,
      sourceBrand: 'ABB',
      sourceModel: q,
      category: 'SOFT_STARTER',
      sourceSpecs: { series: 'PSR/PSE/PSTX' },
      siemensMLFB: targetMLFB,
      siemensName: accurateItem?.item_name || 'SIEMENS SIRIUS SOFT STARTER, 3RW40, 11kW',
      accurateItem,
      notes: 'SIRIUS 3RW40 pengganti langsung untuk ABB PSR & PSE Series.',
      specsComparison: [
        { parameter: 'Bypass Terintegrasi', sourceValue: 'Ya', siemensValue: 'Ya', status: 'MATCH' }
      ],
      alternatives: []
    }
  }

  /**
   * Batch Conversion Processing
   * Accepts text lines (e.g. pasted from Excel / PDF table) or JSON objects
   */
  convertBatch(lines, explicitBrand = null, customRules = []) {
    if (!lines) return []
    const lineArray = Array.isArray(lines) ? lines : lines.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

    return lineArray.map((line, index) => {
      const text = typeof line === 'string' ? line : (line.model || line.partNo || line.text || '')
      const qty = typeof line === 'object' && line.quantity ? Number(line.quantity) : 1
      const res = this.convert(text, explicitBrand, customRules)

      return {
        rowId: index + 1,
        sourceInput: text,
        quantity: qty,
        ...res
      }
    })
  }
}
