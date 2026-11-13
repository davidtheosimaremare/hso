/**
 * PushProduct - Parser & Product Transformer Engine
 * Transforms Siemens SiePortal product information into standardized Accurate Online fields.
 * 
 * Rules:
 * - Brand: Always 'Siemens'
 * - Title / Deskripsi Format:
 *   Raw:  "SINOPLUS, Miniature Circuit Breaker 240/415V 10kA, 1-pole B, 10 A"
 *   Output: "SIEMENS MCB, 5TJ4110-6, SINOPLUS, 1P, 10A, CURVE B, 10KA, 240/415V AC"
 * - Kode Barang: Product Code / MLFB (e.g. 5TJ4110-6)
 * - Kategori: Auto-detected Accurate Category (e.g. MCB, MCCB, ACB, CONTACTOR, etc.)
 * - Jenis Barang: 'Persediaan' (INVENTORY)
 * - Satuan: 'pcs'
 * - Harga / Pricelist: Harga SIEPortal / 0.63 / 0.7
 */

(function (global) {
  'use strict';

  // Format currency helper
  function formatIDR(num) {
    if (num === null || num === undefined || isNaN(num)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  }

  // Helper to convert formatted number string into numeric float
  function cleanNumberString(numStr) {
    let s = numStr.replace(/\s+/g, '').trim();
    if (s.includes('.') && s.includes(',')) {
      if (s.lastIndexOf('.') < s.lastIndexOf(',')) {
        // European / Indonesian standard: 123.456,78 -> 123456.78
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // US standard: 123,456.78 -> 123456.78
        s = s.replace(/,/g, '');
      }
      return parseFloat(s) || 0;
    }
    if (s.includes('.')) {
      const parts = s.split('.');
      if (parts[parts.length - 1].length === 3) {
        // Thousands separator (e.g., 63.000 or 479.497)
        return parseFloat(s.replace(/\./g, '')) || 0;
      }
      return parseFloat(s) || 0;
    }
    if (s.includes(',')) {
      const parts = s.split(',');
      if (parts[parts.length - 1].length === 3) {
        // Thousands separator (e.g., 63,000)
        return parseFloat(s.replace(/,/g, '')) || 0;
      }
      return parseFloat(s.replace(',', '.')) || 0;
    }
    return parseFloat(s) || 0;
  }

  // Extract single price from text block without packaging unit
  function extractSinglePrice(str) {
    if (!str || typeof str !== 'string') return 0;
    const noUnit = str.split('/')[0].trim();

    // 1. Currency first: e.g. IDR 63.000,00 or Rp 63.000 or IDR 63,000.00
    const currFirst = /(?:IDR|Rp\.?|EUR|USD|SGD|GBP|[$€£])\s*([0-9]{1,3}(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+)/i;
    const match1 = noUnit.match(currFirst);
    if (match1 && match1[1]) return cleanNumberString(match1[1]);

    // 2. Currency last: e.g. 63.000,00 IDR or 63.000 IDR
    const currLast = /([0-9]{1,3}(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+)\s*(?:IDR|EUR|USD|SGD|GBP|[$€£]|Rupiah)/i;
    const match2 = noUnit.match(currLast);
    if (match2 && match2[1]) return cleanNumberString(match2[1]);

    // 3. Number with thousands separator (e.g. 63.000 or 479.497)
    const numOnly = /(?:^|\s)([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?)(?:\s|$)/;
    const match3 = noUnit.match(numOnly);
    if (match3 && match3[1]) return cleanNumberString(match3[1]);

    // 4. Raw digits if reasonable price (> 0)
    const rawDigits = noUnit.replace(/[^0-9]/g, '');
    if (rawDigits && rawDigits.length >= 1 && rawDigits.length <= 12) {
      return parseFloat(rawDigits);
    }

    return 0;
  }

  // Parse numeric price from diverse string formats (e.g., "IDR 63.000 / 1 Piece", "63.000,00 IDR", "Rp 63.000", "479497")
  // Prioritizes "Your price" / "Customer price" / "Harga Utama" over "List price" / "Pricelist"
  function parseNumericPrice(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val || typeof val !== 'string') return 0;

    // Prioritize Your Price / Customer Price / Net Price / Harga Utama over List Price
    if (/your\s*price|customer\s*price|net\s*price|harga\s*anda|harga\s*utama|harga\s*beli/i.test(val)) {
      const parts = val.split(/your\s*price|customer\s*price|net\s*price|harga\s*anda|harga\s*utama|harga\s*beli/i);
      if (parts.length > 1) {
        const afterYourPrice = parts[parts.length - 1].trim();
        const p = extractSinglePrice(afterYourPrice);
        if (p > 0) return p;
      }
    }

    return extractSinglePrice(val);
  }

  // Calculate Pricelist based on company margin formula: Harga SIEPortal / 0.63 / 0.7
  function calculatePricelist(rawPrice, discount1 = 0.63, discount2 = 0.70) {
    const numPrice = parseNumericPrice(rawPrice);
    const d1 = parseFloat(discount1) || 0.63;
    const d2 = parseFloat(discount2) || 0.70;

    if (!numPrice || numPrice <= 0) {
      return {
        sieportalPrice: 0,
        pricelist: 0,
        discount1: d1,
        discount2: d2,
        formattedSieportalPrice: 'Rp 0',
        formattedPricelist: 'Rp 0',
        formulaText: `Harga SIEPortal / ${d1} / ${d2}`
      };
    }

    const calculated = numPrice / d1 / d2;
    const rounded = Math.round(calculated);

    return {
      sieportalPrice: numPrice,
      pricelist: rounded,
      discount1: d1,
      discount2: d2,
      formattedSieportalPrice: formatIDR(numPrice),
      formattedPricelist: formatIDR(rounded),
      formulaText: `${formatIDR(numPrice)} / ${d1} / ${d2} = ${formatIDR(rounded)}`
    };
  }

  // Detect product device type and accurate category from text and part number
  function detectDeviceType(desc, code) {
    const text = `${code} ${desc}`.toUpperCase();
    const c = (code || '').toUpperCase();

    // 1. ACB (Air Circuit Breaker)
    if (/AIR CIRCUIT BREAKER|\bACB\b/i.test(text) || /^(3WL|3WA|3WT|3WN)/i.test(c)) {
      return { type: 'ACB', category: 'ACB' };
    }

    // 1b. Fuses (LV HRC, SITOR, Cylindrical, DIAZED, NEOZED)
    if (/LV\s*HRC|\bFUSE\b|SEKERING/i.test(text) || /^(3NA|3ND|3NE|3NC|3NW|5SE|5SB|5SD|5SG|5SH)/i.test(c)) {
      return { type: 'FUSE LINK', category: 'NH FUSE' };
    }

    // 2. RCCB (Residual Current Circuit Breaker / ELCB) - check before MCB because 5SV/5SM
    if (/RESIDUAL CURRENT|\bRCCB\b|\bELCB\b|EARTH LEAKAGE/i.test(text) || /^(5SV|5SM)/i.test(c)) {
      return { type: 'RCCB', category: 'RCCB/ELCB' };
    }

    // 3. RCBO (Residual Current Breaker with Overcurrent Protection)
    if (/\bRCBO\b/i.test(text) || /^(5SU)/i.test(c)) {
      return { type: 'RCBO', category: 'RCBO' };
    }

    // 4. MCB (Miniature Circuit Breaker)
    if (/MINIATURE CIRCUIT BREAKER|\bMCB\b/i.test(text) || /^(5TJ|5SL|5SY|5SJ|5SP|5ST)/i.test(c)) {
      return { type: 'MCB', category: 'MCB' };
    }

    // 5. MCCB (Molded / Moulded Case Circuit Breaker)
    if (/MOULDED CASE|MOLDED CASE|\bMCCB\b/i.test(text) || /^(3VA|3VJ|3VM|3VL|3VT)/i.test(c)) {
      return { type: 'MCCB', category: 'MCCB' };
    }

    // 6. Contactor Relay / Auxiliary Contactor (check before Power Contactor)
    if (/CONTACTOR RELAY|AUXILIARY CONTACTOR|RELAY CONTACTOR|CONTROL RELAY/i.test(text) || /^(3RH|3TH)/i.test(c)) {
      return { type: 'CONTACTOR RELAY', category: 'CONTACTOR RELAY' };
    }

    // 7. Contactor / Kontaktor
    if (/CONTACTOR|KONTAKTOR/i.test(text) || /^(3RT|3TF|3TG|3TS|3TD)/i.test(c)) {
      return { type: 'CONTACTOR', category: 'MOTOR STARTER CONTACTOR' };
    }

    // 8. Thermal Overload Relay (TOR)
    if (/OVERLOAD RELAY|\bTOR\b/i.test(text) || /^(3RU|3RB)/i.test(c)) {
      return { type: 'TOR', category: 'MOTOR STARTER OVERLOAD' };
    }

    // 9. MPCB (Motor Protection Circuit Breaker)
    if (/MOTOR STARTER PROTECTOR|MOTOR PROTECTION|\bMPCB\b/i.test(text) || /^(3RV)/i.test(c)) {
      return { type: 'MPCB', category: 'MOTOR STARTER PROTECTION' };
    }

    // 10. Soft Starter
    if (/SOFT STARTER/i.test(text) || /^(3RW)/i.test(c)) {
      return { type: 'SOFT STARTER', category: 'SOFTSTARTERS' };
    }

    // 11. Inverter / VFD
    if (/INVERTER|VARIABLE SPEED DRIVE|FREQUENCY CONVERTER|\bVFD\b/i.test(text) || /^(6SL|6SE|6AU|V20|G120)/i.test(c)) {
      return { type: 'VFD', category: 'VSD/VARIABLE SPEED DRIVE' };
    }

    // 12. Pilot Devices / Push Buttons
    if (/PUSH\s*BUTTON|PILOT\s*DEVICE|PILOT\s*LAMP|INDICATOR LIGHT|SELECTOR/i.test(text) || /^(3SU|3SB|3SE)/i.test(c)) {
      return { type: 'PILOT DEVICE', category: 'COMMANDING AND SIGNALING DEVICES' };
    }

    // 13. Power Supply
    if (/POWER SUPPLY|SITOP/i.test(text) || /^(6EP|6ES7148)/i.test(c)) {
      return { type: 'POWER SUPPLY', category: 'POWER SUPPLY' };
    }

    // 14. PLC / Automation
    if (/LOGIC MODULE|\bPLC\b|SIMATIC|LOGO!/i.test(text) || /^(6ED1|6ES7|6FC|6GK)/i.test(c)) {
      return { type: 'PLC', category: 'PLC' };
    }

    // 15. SPD Modular
    if (/SURGE PROTECTION|\bSPD\b/i.test(text) || /^(5SD|5TT)/i.test(c)) {
      return { type: 'SPD', category: 'OVERVOLTAGE PROTECTION DEVICES' };
    }

    // 16. Accessories
    if (/\bACC\b|ACCESSORIES|SWITCH|TERMINAL|RELAY|SOCKET|CABLE/i.test(text)) {
      return { type: 'ACCESSORIES', category: 'ACCESSORIES' };
    }

    // Default
    return { type: 'PRODUCT', category: 'OTHER' };
  }

  // Detect Series / Family
  function detectSeries(desc, code) {
    const text = `${desc} ${code}`;
    const seriesList = [
      'SINOPLUS', 'SINOVA', 'SENTRON', 'SIRIUS', 'SIMATIC', 'SITOP',
      'SINAMICS', 'DELTA', 'ALPHA', 'LOGO!'
    ];

    for (const s of seriesList) {
      const reg = new RegExp(`\\b${s}\\b`, 'i');
      if (reg.test(text)) {
        return s.toUpperCase();
      }
    }

    // Check if the very first token in desc before comma looks like a series name
    if (desc && desc.includes(',')) {
      const firstToken = desc.split(',')[0].trim();
      if (firstToken && firstToken.length <= 15 && !/\s/.test(firstToken) && !/circuit|breaker|switch|relay/i.test(firstToken)) {
        return firstToken.toUpperCase();
      }
    }

    return '';
  }

  // Extract Poles (e.g., "1-pole" -> "1P", "3-pole" -> "3P")
  function detectPoles(desc) {
    if (!desc) return '';
    const match = desc.match(/\b(\d+)\s*[-–]?\s*(?:pole|polig|pol|p)\b/i) || desc.match(/\b(\d+)P\b/i);
    if (match) {
      return `${match[1]}P`;
    }
    return '';
  }

  // Extract Rated Current (Ampere) (e.g. "10 A", "16A", "In=10A")
  function detectAmpere(desc) {
    if (!desc) return '';
    // Match patterns like "10 A", "10A", "In = 10 A", "In=10A"
    const match = desc.match(/\b(?:In\s*=\s*)?(\d+(?:\.\d+)?)\s*A\b/i);
    if (match) {
      return `${match[1]}A`;
    }
    return '';
  }

  // Extract Tripping Curve (e.g. "1-pole B", "Curve B", "B-characteristic", "Characteristic C")
  function detectCurve(desc) {
    if (!desc) return '';
    // In example: "1-pole B, 10 A" -> "B"
    const poleCurveMatch = desc.match(/\b\d+[-–\s]*(?:pole|polig|pol)\s+([A-D])\b/i);
    if (poleCurveMatch) {
      return `CURVE ${poleCurveMatch[1].toUpperCase()}`;
    }

    const curveMatch = desc.match(/\b(?:curve|characteristic|karakteristik|char\.?|type)\s*([A-D])\b/i) ||
                       desc.match(/\b([A-D])\s*[-–]?\s*(?:curve|characteristic)\b/i);
    if (curveMatch) {
      return `CURVE ${curveMatch[1].toUpperCase()}`;
    }

    return '';
  }

  // Extract Breaking Capacity (e.g. "10kA", "6 kA", "25kA")
  function detectBreakingCapacity(desc) {
    if (!desc) return '';
    const match = desc.match(/\b(\d+(?:\.\d+)?)\s*kA\b/i);
    if (match) {
      return `${match[1]}KA`;
    }
    return '';
  }

  // Extract Voltage Rating (e.g. "240/415V" -> "240/415V AC", "Un AC: 690 V, Un DC: 250 V" -> "690V AC / 250V DC")
  function detectVoltage(desc) {
    if (!desc) return '';
    const acMatch = desc.match(/(?:Un\s*AC:?\s*(\d+(?:\/\d+)?)\s*V|(\d+(?:\/\d+)?)\s*V\s*AC)/i);
    const dcMatch = desc.match(/(?:Un\s*DC:?\s*(\d+(?:\/\d+)?)\s*V|(\d+(?:\/\d+)?)\s*V\s*DC)/i);
    const ac = acMatch ? (acMatch[1] || acMatch[2]) + 'V AC' : '';
    const dc = dcMatch ? (dcMatch[1] || dcMatch[2]) + 'V DC' : '';
    if (ac && dc) return `${ac} / ${dc}`;
    if (ac) return ac;
    if (dc) return dc;

    const match = desc.match(/(\d+(?:\/\d+)?\s*V(?:AC|DC|\s*AC|\s*DC)?)/i);
    if (match) {
      let v = match[1].toUpperCase().replace(/\s+/g, '');
      if (!v.includes('AC') && !v.includes('DC')) {
        if (/690|500|440|415|400|240|230|110/.test(v)) {
          v = `${v} AC`;
        }
      }
      return v;
    }
    return '';
  }

  // Extract Contacts for Contactors/Auxiliaries (e.g., "1NO+1NC")
  function detectContacts(desc) {
    if (!desc) return '';
    const match = desc.match(/\b(\d+\s*NO\s*(?:\+\s*\d+\s*NC)?|\d+\s*NC)\b/i);
    if (match) {
      return match[1].toUpperCase().replace(/\s+/g, '');
    }
    return '';
  }

  // Extract Fuse Size (e.g. NH00, NH0, NH1, NH2, NH3, NH4)
  function detectFuseSize(desc) {
    if (!desc) return '';
    const m = desc.match(/\b(NH000|NH00|NH0|NH1|NH2|NH3|NH4|SIZE\s*[0-4]|10x38|14x51|22x58|DII|DIII|DIV)\b/i);
    return m ? m[1].toUpperCase().replace(/\s+/g, '') : '';
  }

  // Extract Fuse Operating Class (e.g. gG, aM, gR, aR, gS)
  function detectFuseClass(desc) {
    if (!desc) return '';
    const m = desc.match(/\b(gG|aM|gR|aR|gS|gL)\b/i);
    return m ? m[1].toUpperCase() : '';
  }

  /**
   * Main Transformation Function:
   * Parses raw product code and description into Accurate Online Barang & Jasa schema.
   */
  function transformProduct(rawCode, rawDesc, rawPrice = 0, options = {}) {
    const cleanCode = (rawCode || '').trim().replace(/^detail\//i, '').split(/[?#]/)[0].trim();
    const cleanDesc = (rawDesc || '').trim();

    const { type: deviceType, category: detectedCategory } = detectDeviceType(cleanDesc, cleanCode);
    const series = detectSeries(cleanDesc, cleanCode);
    const poles = detectPoles(cleanDesc);
    const ampere = detectAmpere(cleanDesc);
    const curve = detectCurve(cleanDesc);
    const breakingCapacity = detectBreakingCapacity(cleanDesc);
    const voltage = detectVoltage(cleanDesc);
    const contacts = detectContacts(cleanDesc);
    const fuseSize = detectFuseSize(cleanDesc);
    const fuseClass = detectFuseClass(cleanDesc);

    // Build Title / Judul (Deskripsi Barang Accurate):
    // Target Example: SIEMENS MCB, 5TJ4110-6, SINOPLUS, 1P, 10A, CURVE B, 10KA, 240/415V AC
    // Fuse Example: SIEMENS FUSE LINK, 3NA3820-6, SENTRON, NH00, 50A, GG, 690V AC
    const titleParts = [];
    titleParts.push(`SIEMENS ${deviceType}`);
    if (cleanCode) titleParts.push(cleanCode.toUpperCase());
    if (series) titleParts.push(series);
    if (fuseSize && deviceType.includes('FUSE')) titleParts.push(fuseSize);
    if (poles) titleParts.push(poles);
    if (ampere) titleParts.push(ampere);
    if (curve) titleParts.push(curve);
    if (fuseClass && deviceType.includes('FUSE')) titleParts.push(fuseClass);
    if (breakingCapacity) titleParts.push(breakingCapacity);
    if (voltage) titleParts.push(voltage);
    if (contacts && deviceType === 'CONTACTOR') titleParts.push(contacts);

    // If title parts only contain brand+type and code, fallback to including cleaned raw desc
    let generatedTitle = titleParts.join(', ');
    if (titleParts.length <= 2 && cleanDesc) {
      generatedTitle = `SIEMENS ${deviceType}, ${cleanCode.toUpperCase()}, ${cleanDesc}`;
    }

    // Price calculations
    const discount1 = options.discount1 !== undefined ? options.discount1 : 0.63;
    const discount2 = options.discount2 !== undefined ? options.discount2 : 0.70;
    const priceData = calculatePricelist(rawPrice, discount1, discount2);

    return {
      // Accurate Online Form Fields
      code: cleanCode.toUpperCase(),
      name: generatedTitle, // Judul / Deskripsi Barang
      brand: 'Siemens',
      category: options.customCategory || detectedCategory,
      itemType: 'Persediaan', // Default jenis barang
      unit: options.customUnit || 'pcs', // Default satuan
      sieportalPrice: priceData.sieportalPrice,
      pricelist: priceData.pricelist,
      
      // Technical Breakdown for Preview
      specs: {
        deviceType,
        series,
        poles,
        ampere,
        curve,
        breakingCapacity,
        voltage,
        contacts
      },
      raw: {
        code: rawCode,
        description: rawDesc,
        price: rawPrice
      },
      priceData,
      timestamp: new Date().toISOString()
    };
  }

  // Export to universal context (works in Chrome Content Scripts, Service Worker, Window, and Node.js)
  const PushProductParser = {
    detectDeviceType,
    detectSeries,
    detectPoles,
    detectAmpere,
    detectCurve,
    detectBreakingCapacity,
    detectVoltage,
    detectContacts,
    calculatePricelist,
    parseNumericPrice,
    transformProduct,
    formatIDR
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.PushProductParser = PushProductParser;
  }
  if (typeof window !== 'undefined') {
    window.PushProductParser = PushProductParser;
  }
  if (typeof self !== 'undefined') {
    self.PushProductParser = PushProductParser;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PushProductParser;
  }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
