/**
 * PushProduct - SiePortal Content Script
 * Extracts product details from Siemens SiePortal (SPA), provides floating action drawer,
 * and communicates with background service worker to open & fill Accurate Online.
 */

(function () {
  'use strict';

  let currentParsedItem = null;
  let lastCheckedUrl = '';
  let drawerElement = null;
  let fabElement = null;
  let overlayElement = null;
  let toastTimeout = null;

  // Extract Product Code from URL or DOM
  function extractProductCode() {
    const url = window.location.href;
    const urlMatch = url.match(/\/detail\/([A-Za-z0-9\-_]+)/i);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1].trim();
    }

    // Fallback: Check DOM selectors
    const selectors = [
      '[data-testid*="article-number"]',
      '[data-testid*="product-id"]',
      '.article-number',
      '.product-number',
      'h1.product-title',
      'h1'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        const text = el.innerText.trim();
        // Check for typical Siemens MLFB pattern (e.g., 5TJ4110-6, 5SL6116-7CC, 3VA1110-3ED32-0AA0)
        const codeMatch = text.match(/\b([1-9][A-Z0-9]{2,}[A-Z0-9\-_]+)\b/i);
        if (codeMatch) return codeMatch[1];
      }
    }

    return '';
  }

  // Helper to check if element is inside navigation, tree, breadcrumb or header/footer
  function isNavOrTree(el) {
    if (!el) return false;
    return !!el.closest('nav, aside, header, footer, [class*="tree"], [class*="catalog"], [class*="breadcrumb"], [class*="sidebar"], [class*="menu"], [id*="tree"], [id*="menu"]');
  }

  // Extract Raw Description from DOM / Meta Tags / Structured Data
  function extractRawDescription(productCode) {
    // 1. Check Meta Description (Most authentic & unpolluted on SiePortal SPA)
    const metaDesc = document.querySelector('meta[name="description"]')?.content ||
                     document.querySelector('meta[property="og:description"]')?.content ||
                     document.querySelector('meta[name="twitter:description"]')?.content;
    if (metaDesc && metaDesc.trim().length > 10) {
      let clean = metaDesc.trim();
      if (productCode) {
        clean = clean.replace(new RegExp(`^${productCode}\\s*[-–:]*\\s*`, 'i'), '').trim();
      }
      clean = clean.replace(/\s*\|\s*Siemens.*$/i, '')
                   .replace(/\s*\|\s*SiePortal.*$/i, '')
                   .trim();
      if (clean.length > 10 && clean.toLowerCase() !== (productCode || '').toLowerCase()) {
        return clean;
      }
    }

    // 2. Check JSON-LD Structured Data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const item = Array.isArray(data)
          ? data.find(d => d['@type'] === 'Product')
          : (data['@type'] === 'Product' ? data : null);
        if (item && item.description && item.description.trim().length > 10) {
          let clean = item.description.trim();
          if (productCode) {
            clean = clean.replace(new RegExp(`^${productCode}\\s*[-–:]*\\s*`, 'i'), '').trim();
          }
          if (clean.length > 10) return clean;
        }
      } catch (e) {}
    }

    // 3. Check Main Product Content Area in DOM (strictly excluding sidebar/tree)
    const mainArea = document.querySelector('main, [role="main"], article, .product-details, .product-intro, cx-product-intro, app-product-details, .sie-product-details') || document.body;

    const descSelectors = [
      '[data-testid*="product-description"]',
      '[data-testid*="description"]',
      '.product-description',
      '.description-text',
      '.product-intro__description',
      '.overview-description',
      '.product-summary',
      'h1 + p',
      'h1 ~ div.description',
      'h1 ~ p'
    ];

    for (const sel of descSelectors) {
      const elements = mainArea.querySelectorAll(sel);
      for (const el of elements) {
        if (!isNavOrTree(el) && el.innerText && el.innerText.trim().length > 10) {
          const t = el.innerText.trim();
          if (t !== productCode && !/^(air circuit breakers|miniature circuit breakers|molded case circuit breakers)$/i.test(t)) {
            return t;
          }
        }
      }
    }

    // 4. Scan candidate elements within main area only (strictly excluding nav/tree)
    const candidateElements = mainArea.querySelectorAll('p, div, span, h2, h3');
    for (const el of candidateElements) {
      if (isNavOrTree(el)) continue;
      if (el.children.length === 0 && el.innerText) {
        const t = el.innerText.trim();
        if (/circuit breaker|fuse|kontaktor|contactor|sinoplus|sentron|sirius|sinova|1-pole|2-pole|3-pole|4-pole|miniature circuit|molded case|hrc|nh\d+|operating class/i.test(t)) {
          if (t.length > 20 && t.length < 500 && t !== productCode && !/^(air circuit breakers|miniature circuit breakers)$/i.test(t)) {
            return t;
          }
        }
      }
    }

    // 5. Document Title Fallback
    if (document.title) {
      let titleClean = document.title
        .replace(/\|.*Siemens.*/i, '')
        .replace(/SiePortal.*/i, '')
        .replace(new RegExp(`^${productCode}\\s*[-–:]*\\s*`, 'i'), '')
        .trim();
      if (titleClean && titleClean.length > 10 && titleClean !== productCode) {
        return titleClean;
      }
    }

    return '';
  }

  // Extract Extra Technical Context from SiePortal DOM
  function extractTechnicalContext() {
    const specs = [];
    const specRows = document.querySelectorAll('tr, dl, [class*="characteristic"], [class*="technical-data-row"]');
    for (const row of specRows) {
      if (isNavOrTree(row)) continue;
      const text = row.innerText ? row.innerText.replace(/\s+/g, ' ').trim() : '';
      if (text && text.length > 5 && text.length < 150) {
        if (/voltage|current|breaking capacity|operating class|pole|frequency|power|size|indicator/i.test(text)) {
          specs.push(text);
        }
      }
      if (specs.length >= 8) break;
    }
    return specs.join('; ');
  }

  // Comprehensive Price Extraction from SiePortal
  // STRICT RULE: Always prioritize HARGA UTAMA (Your Price / Customer Price / Net Price)
  // NEVER take List Price / Pricelist when Your Price is present!
  function extractPrice() {
    const Parser = window.PushProductParser || globalThis.PushProductParser;
    const parsePrice = (str) => {
      if (!str) return 0;
      if (Parser && Parser.parseNumericPrice) {
        return Parser.parseNumericPrice(str);
      }
      return 0;
    };

    const mainArea = document.querySelector('main, [role="main"], article, .product-details, .product-intro, cx-product-intro, app-product-details, .sie-product-details') || document.body;

    // =========================================================================
    // PHASE 1: TARGET HARGA UTAMA (Your Price / Customer Price / Net Price)
    // =========================================================================

    // 1A. Selectors specifically designated for Customer / Your price
    const yourPriceSelectors = [
      '[data-testid*="customer-price" i]',
      '[data-testid*="your-price" i]',
      '[class*="customer-price" i]',
      '[class*="your-price" i]',
      '.customer-price',
      '.your-price',
      '.net-price',
      '[class*="net-price" i]'
    ];

    for (const sel of yourPriceSelectors) {
      const elements = mainArea.querySelectorAll(sel);
      for (const el of elements) {
        if (isNavOrTree(el)) continue;
        const text = (el.innerText || '').trim();
        if (/\d/.test(text)) {
          const num = parsePrice(text);
          if (num > 0) {
            console.log(`[PushProduct] ✅ Found HARGA UTAMA (Your Price): ${num} via selector: ${sel}`);
            return num;
          }
        }
      }
    }

    // 1B. Table rows specifically labeled "Your price", "Customer price", "Net price", "Harga Anda"
    const rows = mainArea.querySelectorAll('tr, dl, [class*="commercial" i] div, [class*="characteristic" i], [class*="specification" i]');
    for (const row of rows) {
      if (isNavOrTree(row)) continue;
      const text = (row.innerText || '').replace(/\s+/g, ' ').trim();
      if (/your\s*price|customer\s*price|net\s*price|harga\s*anda|harga\s*utama|harga\s*beli/i.test(text) && /\d/.test(text)) {
        const num = parsePrice(text);
        if (num > 0) {
          console.log(`[PushProduct] ✅ Found HARGA UTAMA (Your Price): ${num} via table row: ${text.slice(0, 50)}`);
          return num;
        }
      }
    }

    // 1C. Scan any DOM blocks in mainArea that mention "Your price" / "Customer price"
    const candidateBlocks = mainArea.querySelectorAll('div, p, span, section');
    for (const el of candidateBlocks) {
      if (isNavOrTree(el)) continue;
      if (el.children.length > 5) continue;
      const text = (el.innerText || '').trim();
      if (/your\s*price|customer\s*price|net\s*price|harga\s*anda|harga\s*utama|harga\s*beli/i.test(text) && /\d/.test(text)) {
        const num = parsePrice(text);
        if (num > 0) {
          console.log(`[PushProduct] ✅ Found HARGA UTAMA (Your Price): ${num} via text match: ${text.slice(0, 50)}`);
          return num;
        }
      }
    }

    // =========================================================================
    // PHASE 2: MAIN PRICE CONTAINERS (STRICTLY SKIPPING LIST PRICE)
    // =========================================================================
    const mainPriceSelectors = [
      'cx-product-price .price',
      '.cx-product-price .price',
      'cx-product-price',
      '.cx-product-price',
      'app-product-price',
      '.product-price',
      '.portal-price',
      '.price-value',
      '.price',
      '[data-testid*="price" i]'
    ];

    for (const sel of mainPriceSelectors) {
      const elements = mainArea.querySelectorAll(sel);
      for (const el of elements) {
        if (isNavOrTree(el)) continue;
        // Skip elements explicitly marked as list-price
        if (el.matches('[class*="list-price" i], [data-testid*="list-price" i]') ||
            el.closest('[class*="list-price" i], [data-testid*="list-price" i]')) {
          continue;
        }

        const text = (el.innerText || '').trim();
        // If element text mentions both list price and your price, parsePrice will pick your price!
        // But if it only says "list price", skip it here.
        if (/list\s*price/i.test(text) && !/your\s*price|customer\s*price|net\s*price/i.test(text)) {
          continue;
        }

        if (/\d/.test(text)) {
          const num = parsePrice(text);
          if (num > 0) {
            console.log(`[PushProduct] ✅ Extracted HARGA UTAMA: ${num} via main container: ${sel}`);
            return num;
          }
        }
      }
    }

    // 2B. Leaf elements containing IDR / Rp that are NOT inside a list-price block
    const leafElements = mainArea.querySelectorAll('span, div, p, strong, b');
    for (const el of leafElements) {
      if (isNavOrTree(el) || el.children.length > 0) continue;
      if (el.closest('[class*="list-price" i], [data-testid*="list-price" i]')) continue;
      const text = (el.innerText || '').trim();
      if (/list\s*price/i.test(text)) continue;
      if (/(?:IDR|Rp)\s*[\d.,]+/i.test(text) || /[\d.,]+\s*(?:IDR|Rp)/i.test(text)) {
        const num = parsePrice(text);
        if (num > 0) {
          console.log(`[PushProduct] ✅ Extracted price: ${num} via leaf element: ${text}`);
          return num;
        }
      }
    }

    // =========================================================================
    // PHASE 3: FALLBACK (Only when no Customer/Main price exists on the page)
    // =========================================================================
    const fallbackListEls = mainArea.querySelectorAll('[class*="list-price" i], [data-testid*="list-price" i]');
    for (const el of fallbackListEls) {
      if (isNavOrTree(el)) continue;
      const text = (el.innerText || '').trim();
      if (/\d/.test(text)) {
        const num = parsePrice(text);
        if (num > 0) {
          console.warn(`[PushProduct] ⚠️ Fallback to List Price: ${num} (No 'Your price' found)`);
          return num;
        }
      }
    }

    // Meta tags fallback
    const metaSelectors = [
      'meta[property="product:price:amount"]',
      'meta[property="og:price:amount"]',
      'meta[itemprop="price"]',
      'meta[name="price"]',
      'meta[name="product:price"]'
    ];
    for (const sel of metaSelectors) {
      const el = document.querySelector(sel);
      if (el && el.content && /\d/.test(el.content)) {
        const num = parsePrice(el.content);
        if (num > 0) return num;
      }
    }

    // JSON-LD fallback
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const it of items) {
          const prod = it && it['@type'] === 'Product' ? it : null;
          if (prod && prod.offers) {
            const offers = Array.isArray(prod.offers) ? prod.offers : [prod.offers];
            for (const off of offers) {
              const p = off.price || off.lowPrice || off.highPrice;
              if (p) {
                const num = parsePrice(p);
                if (num > 0) return num;
              }
            }
          }
        }
      } catch (e) {}
    }

    // 6. Auto-click "Show prices" / "Tampilkan harga" button if present
    try {
      const showPriceBtn = Array.from(document.querySelectorAll('button, a, span')).find(b => 
        /show\s*prices?|tampilkan\s*harga/i.test((b.innerText || '').trim())
      );
      if (showPriceBtn && !showPriceBtn.dataset.pushproductClicked) {
        showPriceBtn.dataset.pushproductClicked = 'true';
        showPriceBtn.click();
      }
    } catch (e) {}

    return 0;
  }

  // Toast Notification
  function showToast(message, duration = 3000) {
    let toast = document.getElementById('pushproduct-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pushproduct-toast';
      toast.className = 'pushproduct-toast';
      document.body.appendChild(toast);
    }

    toast.innerText = message;
    toast.classList.add('active');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('active');
    }, duration);
  }

  // Create or Update Floating Action Button
  function renderFAB(product) {
    if (!fabElement) {
      fabElement = document.createElement('div');
      fabElement.id = 'pushproduct-fab';
      document.body.appendChild(fabElement);
    }

    fabElement.innerHTML = `
      <button class="pushproduct-btn-fab" id="pushproduct-open-drawer" title="Buka PushProduct untuk Accurate Online">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        <span>Push to Accurate</span>
        <span class="pushproduct-badge-code">${product.code || 'SIEMENS'}</span>
      </button>
    `;

    document.getElementById('pushproduct-open-drawer').addEventListener('click', () => {
      openDrawer();
    });
  }

  // Create or Update Drawer
  async function renderDrawer(product) {
    if (!drawerElement) {
      overlayElement = document.createElement('div');
      overlayElement.id = 'pushproduct-drawer-overlay';
      document.body.appendChild(overlayElement);

      drawerElement = document.createElement('div');
      drawerElement.id = 'pushproduct-drawer';
      document.body.appendChild(drawerElement);

      overlayElement.addEventListener('click', closeDrawer);
    }

    const { priceData } = product;
    const DEFAULT_CATEGORIES = [
      'ACB', 'MCB', 'MCCB', 'RCBO', 'RCCB/ELCB', 'NH FUSE',
      'MOTOR STARTER CONTACTOR', 'MOTOR STARTER OVERLOAD', 'MOTOR STARTER PROTECTION',
      'SINOVA CONTACTOR', 'CONTACTOR RELAY', 'SOFTSTARTERS',
      'VSD/VARIABLE SPEED DRIVE', 'POWER SUPPLY', 'PLC',
      'COMMANDING AND SIGNALING DEVICES', 'OVERVOLTAGE PROTECTION DEVICES', 'OTHER'
    ];

    let accurateCategories = DEFAULT_CATEGORIES;
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const stored = await chrome.storage.local.get('accurateCategories');
        if (stored?.accurateCategories && Array.isArray(stored.accurateCategories) && stored.accurateCategories.length > 0) {
          accurateCategories = stored.accurateCategories;
        }
      }
    } catch (e) {
      console.warn('[PushProduct] Error reading accurateCategories from storage:', e);
    }

    // Ensure the current product category is present in the list
    if (product.category && !accurateCategories.includes(product.category)) {
      accurateCategories.push(product.category);
    }

    const catOptionsHtml = accurateCategories.map(cat => `
      <option value="${cat}" ${product.category === cat ? 'selected' : ''}>${cat}</option>
    `).join('');

    drawerElement.innerHTML = `
      <div class="pushproduct-header">
        <h2>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          PushProduct: SiePortal ➜ Accurate
        </h2>
        <button class="pushproduct-close-btn" id="pushproduct-close-btn" title="Tutup">✕</button>
      </div>

      <div class="pushproduct-body">
        <!-- Card AI: Gemini Flash Engine -->
        <div class="pushproduct-ai-card">
          <div class="pushproduct-ai-header">
            <div class="pushproduct-ai-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
              </svg>
              <span>Gemini Flash AI Engine</span>
            </div>
            <span class="pushproduct-ai-badge" id="pushproduct-ai-badge">
              ${product.isAIGenerated ? '✨ AI Refined' : '⚡ 100% Akurat'}
            </span>
          </div>
          <button class="pushproduct-btn-ai" id="pushproduct-btn-refine-ai" title="Gunakan AI Gemini Flash untuk analisis spesifikasi katalog Siemens">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span id="pushproduct-ai-btn-text">✨ Sempurnakan Judul dengan Gemini Flash</span>
          </button>
          <div class="pushproduct-ai-status" id="pushproduct-ai-status" style="display: none;"></div>
        </div>

        <!-- Card 1: Accurate Target Fields -->
        <div class="pushproduct-card">
          <div class="pushproduct-card-title">
            <span>📋 Format Barang & Jasa Accurate</span>
            <button class="pushproduct-btn-secondary" id="pushproduct-copy-title" style="padding: 4px 8px; font-size: 11px;">
              Salin Judul
            </button>
          </div>

          <div class="pushproduct-field">
            <label class="pushproduct-label">Judul / Nama Barang (Deskripsi)</label>
            <textarea class="pushproduct-textarea" id="pushproduct-input-name">${product.name}</textarea>
          </div>

          <div class="pushproduct-row">
            <div class="pushproduct-col pushproduct-field">
              <label class="pushproduct-label">Kode Barang</label>
              <input type="text" class="pushproduct-input" id="pushproduct-input-code" value="${product.code}">
            </div>
            <div class="pushproduct-col pushproduct-field">
              <label class="pushproduct-label">Brand</label>
              <input type="text" class="pushproduct-input" id="pushproduct-input-brand" value="${product.brand}" readonly style="background:#F1F5F9;">
            </div>
          </div>

          <div class="pushproduct-row">
            <div class="pushproduct-col pushproduct-field">
              <label class="pushproduct-label">Kategori (Dari Accurate)</label>
              <select class="pushproduct-select" id="pushproduct-select-category">
                ${catOptionsHtml}
              </select>
            </div>
            <div class="pushproduct-col pushproduct-field">
              <label class="pushproduct-label">Jenis Barang</label>
              <input type="text" class="pushproduct-input" id="pushproduct-input-type" value="${product.itemType}" readonly style="background:#F1F5F9;">
            </div>
            <div class="pushproduct-col pushproduct-field">
              <label class="pushproduct-label">Satuan</label>
              <input type="text" class="pushproduct-input" id="pushproduct-input-unit" value="${product.unit}">
            </div>
          </div>
        </div>

        <!-- Card 2: Price & Pricelist Calculation -->
        <div class="pushproduct-card">
          <div class="pushproduct-card-title">
            <span>💰 Perhitungan Pricelist Accurate</span>
            <span style="font-size: 11px; font-weight: 500; color: #64748B;">Rumus: / 0.63 / 0.7</span>
          </div>

          <div class="pushproduct-field">
            <label class="pushproduct-label">Harga Web SIEPortal (IDR)</label>
            <input type="text" class="pushproduct-input" id="pushproduct-input-price" value="${product.sieportalPrice ? product.sieportalPrice : ''}" placeholder="Masukkan harga SIEPortal jika tersembunyi (cth: 63000)">
          </div>

          <div class="pushproduct-price-box">
            <div style="font-size: 11px; font-weight: 600; color: #166534; text-transform: uppercase;">
              Pricelist Accurate Otomatis
            </div>
            <div class="pushproduct-price-result" id="pushproduct-pricelist-display">
              ${priceData.formattedPricelist}
            </div>
            <div class="pushproduct-price-formula" id="pushproduct-formula-display">
              ${priceData.formulaText}
            </div>
          </div>
        </div>

        <!-- Card 3: Source Reference -->
        <div class="pushproduct-card">
          <div class="pushproduct-card-title">
            <span>🔍 Data Asli dari SiePortal</span>
          </div>
          <div style="font-size: 11px; color: #64748B; margin-bottom: 4px;">Deskripsi Mentah Web:</div>
          <div class="pushproduct-raw-text">
            ${product.raw?.description || 'Deskripsi mentah belum terdeteksi (Halaman sedang memuat data katalog).'}
          </div>
        </div>
      </div>

      <div class="pushproduct-footer">
        <button class="pushproduct-btn-push" id="pushproduct-btn-push">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
          </svg>
          <span id="pushproduct-btn-push-text">🚀 Push ke Accurate Online (API)</span>
        </button>

        <button class="pushproduct-btn-secondary" id="pushproduct-copy-all">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
          </svg>
          <span>Salin Semua Ringkasan Data</span>
        </button>
      </div>
    `;

    // Event Listeners inside Drawer
    document.getElementById('pushproduct-close-btn').addEventListener('click', closeDrawer);

    // Gemini Flash AI Refine Button
    const btnRefineAi = document.getElementById('pushproduct-btn-refine-ai');
    const aiStatus = document.getElementById('pushproduct-ai-status');
    const aiBtnText = document.getElementById('pushproduct-ai-btn-text');
    const aiBadge = document.getElementById('pushproduct-ai-badge');

    btnRefineAi.addEventListener('click', async () => {
      btnRefineAi.classList.add('loading');
      aiBtnText.innerHTML = '<span class="pushproduct-spinner"></span> <span>Gemini Flash sedang menganalisis katalog...</span>';
      aiStatus.style.display = 'flex';
      aiStatus.innerText = '🤖 Menganalisis parameter teknis (Poles, Ampere, Curve, kA, Voltage)...';

      try {
        let response;
        try {
          response = await chrome.runtime.sendMessage({
            action: 'AI_FORMAT_PRODUCT',
            payload: {
              code: product.code,
              description: product.raw?.description || extractRawDescription(product.code),
              price: document.getElementById('pushproduct-input-price')?.value || product.sieportalPrice,
              extraContext: document.title
            }
          });
        } catch (e) {
          console.warn('[PushProduct] Background message error:', e);
        }

        if (response && response.success && response.product) {
          const aiProd = response.product;
          currentParsedItem = aiProd;

          document.getElementById('pushproduct-input-name').value = aiProd.name;
          if (aiProd.code) document.getElementById('pushproduct-input-code').value = aiProd.code;
          if (aiProd.category) document.getElementById('pushproduct-select-category').value = aiProd.category;

          aiBadge.innerText = '✨ AI Verified';
          aiBadge.style.background = '#10B981';
          aiStatus.innerText = '✅ Judul & kategori disempurnakan oleh Gemini Flash AI!';
          showToast('✨ Judul & spesifikasi disempurnakan oleh Gemini Flash!');
          return;
        }

        // Direct fallback using GeminiService in page context
        const service = window.GeminiService || globalThis.GeminiService;
        if (service && service.callGeminiFlash) {
          let config = {
            geminiApiKey: '',
            geminiModel: 'gemini-3.8-flash',
            discount1: 0.63,
            discount2: 0.70,
            accurateCategories: DEFAULT_CATEGORIES
          };
          try {
            if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
              const stored = await chrome.storage.local.get([
                'geminiApiKey', 'geminiModel', 'discount1', 'discount2', 'accurateCategories'
              ]);
              config = { ...config, ...stored };
            }
          } catch (e) {
            console.warn('[PushProduct] Error reading config from storage:', e);
          }

          if (!config.geminiApiKey) {
            aiStatus.innerText = '⚠️ API Key Gemini belum diatur di Pengaturan ekstensi.';
            alert('⚠️ API Key Google Gemini belum diatur!\n\nSilakan klik ikon ekstensi PushProduct di toolbar browser Anda ➜ Masuk ke tab "Pengaturan" ➜ Masukkan API Key Gemini Anda.');
            return;
          }

          const rawDesc = product.raw?.description || extractRawDescription(product.code);
          const rawPrice = document.getElementById('pushproduct-input-price')?.value || product.sieportalPrice;

          aiStatus.innerText = '🤖 Gemini Flash menganalisis secara langsung...';

          const aiResult = await service.callGeminiFlash({
            apiKey: config.geminiApiKey,
            model: config.geminiModel || 'gemini-3.8-flash',
            code: product.code,
            description: rawDesc,
            price: rawPrice,
            extraContext: document.title,
            categories: config.accurateCategories
          });

          const Parser = window.PushProductParser || globalThis.PushProductParser;
          const priceData = Parser ? Parser.calculatePricelist(rawPrice, config.discount1 || 0.63, config.discount2 || 0.70) : null;

          const fullProduct = {
            ...aiResult,
            code: (aiResult.code || product.code || '').trim().toUpperCase(),
            name: aiResult.name || '',
            brand: 'Siemens',
            category: aiResult.category || (config.accurateCategories?.[0] || 'MCB'),
            itemType: aiResult.itemType || 'Persediaan',
            unit: aiResult.unit || 'pcs',
            sieportalPrice: priceData?.sieportalPrice || 0,
            pricelist: priceData?.pricelist || 0,
            priceData,
            raw: {
              code: product.code,
              description: rawDesc,
              price: rawPrice
            },
            isAIGenerated: true,
            aiModel: config.geminiModel || 'gemini-3.8-flash',
            timestamp: new Date().toISOString()
          };

          currentParsedItem = fullProduct;
          document.getElementById('pushproduct-input-name').value = fullProduct.name;
          if (fullProduct.code) document.getElementById('pushproduct-input-code').value = fullProduct.code;
          if (fullProduct.category) document.getElementById('pushproduct-select-category').value = fullProduct.category;

          aiBadge.innerText = '✨ AI Verified';
          aiBadge.style.background = '#10B981';
          aiStatus.innerText = '✅ Judul & kategori disempurnakan oleh Gemini Flash AI!';
          showToast('✨ Judul & spesifikasi disempurnakan oleh Gemini Flash!');
          return;
        }

        if (response && response.needsApiKey) {
          aiStatus.innerText = '⚠️ API Key Gemini belum diatur di Pengaturan ekstensi.';
          alert('⚠️ API Key Google Gemini belum diatur!\n\nSilakan klik ikon ekstensi PushProduct di toolbar browser Anda ➜ Masuk ke tab "Pengaturan" ➜ Masukkan API Key Gemini Anda.');
        } else {
          aiStatus.innerText = '⚠️ ' + (response?.error || 'Gagal memproses AI.');
          showToast('⚠️ Gagal: ' + (response?.error || 'Koneksi error'));
        }
      } catch (err) {
        console.error('[PushProduct AI Refine Error]:', err);
        if (err.message && (err.message.includes('503') || err.message.includes('high demand') || err.message.includes('429'))) {
          const Parser = window.PushProductParser;
          if (Parser) {
            const rawPrice = document.getElementById('pushproduct-input-price')?.value || product.sieportalPrice;
            const fallbackProduct = Parser.transformProduct(product.code, product.raw?.description || extractRawDescription(product.code), rawPrice);
            currentParsedItem = fallbackProduct;
            document.getElementById('pushproduct-input-name').value = fallbackProduct.name;
            if (fallbackProduct.code) document.getElementById('pushproduct-input-code').value = fallbackProduct.code;
            if (fallbackProduct.category) document.getElementById('pushproduct-select-category').value = fallbackProduct.category;
            aiBadge.innerText = '⚡ Local Engine';
            aiBadge.style.background = '#F59E0B';
            aiStatus.innerText = '⚡ Server Google AI sedang antre (503). Judul otomatis diformat oleh mesin cerdas lokal.';
            showToast('⚡ Server AI antre, judul diformat mesin lokal');
            return;
          }
        }
        aiStatus.innerText = '⚠️ ' + err.message;
        showToast('⚠️ Gagal: ' + err.message);
      } finally {
        btnRefineAi.classList.remove('loading');
        aiBtnText.innerText = '✨ Format Ulang dengan Gemini Flash';
      }
    });

    // Live Price Calculator
    const priceInput = document.getElementById('pushproduct-input-price');
    priceInput.addEventListener('input', (e) => {
      const Parser = window.PushProductParser;
      if (!Parser) return;

      const newPriceData = Parser.calculatePricelist(e.target.value, 0.63, 0.70);
      document.getElementById('pushproduct-pricelist-display').innerText = newPriceData.formattedPricelist;
      document.getElementById('pushproduct-formula-display').innerText = newPriceData.formulaText;

      if (currentParsedItem) {
        currentParsedItem.sieportalPrice = newPriceData.sieportalPrice;
        currentParsedItem.pricelist = newPriceData.pricelist;
        currentParsedItem.priceData = newPriceData;
      }
    });

    // Copy Title Button
    document.getElementById('pushproduct-copy-title').addEventListener('click', () => {
      const nameVal = document.getElementById('pushproduct-input-name').value;
      navigator.clipboard.writeText(nameVal);
      showToast('📋 Judul berhasil disalin ke clipboard!');
    });

    // Copy All Data Button
    document.getElementById('pushproduct-copy-all').addEventListener('click', () => {
      const item = getLatestFormData();
      const summary = [
        `KODE BARANG : ${item.code}`,
        `JUDUL / NAMA: ${item.name}`,
        `BRAND       : ${item.brand}`,
        `KATEGORI    : ${item.category}`,
        `JENIS BARANG: ${item.itemType}`,
        `SATUAN      : ${item.unit}`,
        `PRICELIST   : ${item.priceData?.formattedPricelist || item.pricelist}`
      ].join('\n');

      navigator.clipboard.writeText(summary);
      showToast('📋 Semua data produk berhasil disalin!');
    });

    // Main Push Button: Directly push & create/update item in Accurate via API
    const pushBtn = document.getElementById('pushproduct-btn-push');
    const pushBtnText = document.getElementById('pushproduct-btn-push-text');

    pushBtn.addEventListener('click', async () => {
      const itemToPush = getLatestFormData();
      if (!itemToPush.code || !itemToPush.name) {
        showToast('⚠️ Kode barang & Judul tidak boleh kosong!');
        return;
      }

      pushBtn.disabled = true;
      const originalText = pushBtnText ? pushBtnText.innerHTML : '🚀 Push ke Accurate Online (API)';
      if (pushBtnText) {
        pushBtnText.innerHTML = '<span class="pushproduct-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.4); border-top-color:#fff; border-radius:50%; animation:pushproduct-spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></span> Mengirim ke Accurate via API...';
      }
      showToast('🚀 Mengirim & membuat produk di Accurate Online via API...');

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'PUSH_CREATE_ACCURATE_ITEM',
          payload: itemToPush
        });

        if (response && response.success) {
          if (pushBtnText) {
            pushBtnText.innerHTML = '<span>✅ Berhasil Disimpan di Accurate!</span>';
          }
          pushBtn.style.backgroundColor = '#059669';
          showToast(`✅ ${response.message || 'Barang berhasil disimpan di Accurate Online via API!'}`, 4000);

          setTimeout(() => {
            closeDrawer();
            pushBtn.disabled = false;
            pushBtn.style.backgroundColor = '';
            if (pushBtnText) pushBtnText.innerHTML = originalText;
          }, 1800);
        } else {
          pushBtn.disabled = false;
          pushBtn.style.backgroundColor = '';
          if (pushBtnText) pushBtnText.innerHTML = originalText;
          showToast(`⚠️ Gagal: ${response?.error || 'Gagal menyimpan ke Accurate.'}`, 5000);
          alert(`⚠️ Gagal Push ke Accurate Online via API:\n\n${response?.error || 'Pastikan Access Token dan Secret Accurate valid di pengaturan ekstensi.'}`);
        }
      } catch (err) {
        console.error('[PushProduct Push Error]:', err);
        pushBtn.disabled = false;
        pushBtn.style.backgroundColor = '';
        if (pushBtnText) pushBtnText.innerHTML = originalText;
        showToast('⚠️ Gagal terhubung ke Service Worker.');
      }
    });
  }

  // Get current form values from drawer inputs
  function getLatestFormData() {
    if (!currentParsedItem) return {};

    const nameInput = document.getElementById('pushproduct-input-name');
    const codeInput = document.getElementById('pushproduct-input-code');
    const catSelect = document.getElementById('pushproduct-select-category');
    const unitInput = document.getElementById('pushproduct-input-unit');
    const priceInput = document.getElementById('pushproduct-input-price');

    const Parser = window.PushProductParser;
    const priceData = Parser ? Parser.calculatePricelist(priceInput?.value || currentParsedItem.sieportalPrice) : currentParsedItem.priceData;

    return {
      ...currentParsedItem,
      name: nameInput?.value || currentParsedItem.name,
      code: (codeInput?.value || currentParsedItem.code).toUpperCase(),
      category: catSelect?.value || currentParsedItem.category,
      unit: unitInput?.value || currentParsedItem.unit,
      sieportalPrice: priceData.sieportalPrice,
      pricelist: priceData.pricelist,
      priceData
    };
  }

  function openDrawer() {
    if (drawerElement && overlayElement) {
      drawerElement.classList.add('active');
      overlayElement.classList.add('active');
    }
  }

  function closeDrawer() {
    if (drawerElement && overlayElement) {
      drawerElement.classList.remove('active');
      overlayElement.classList.remove('active');
    }
  }

  // Main Extraction Routine
  function checkAndExtract() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.id) {
        return; // Extension context invalidated
      }
    } catch (e) {
      return;
    }

    const currentUrl = window.location.href;
    const isProductPage = currentUrl.includes('/detail/');

    if (!isProductPage) {
      if (fabElement) fabElement.style.display = 'none';
      return;
    }

    if (fabElement) fabElement.style.display = 'block';

    const code = extractProductCode();
    const desc = extractRawDescription(code);
    const price = extractPrice();

    if (!code && !desc) return;

    // Check if parser is loaded
    const Parser = window.PushProductParser;
    if (!Parser) {
      console.warn('[PushProduct] Parser engine not yet loaded.');
      return;
    }

    // Re-render if code, desc changed, or if price was discovered/changed
    const hasPriceAppeared = price > 0 && (!currentParsedItem?.sieportalPrice || currentParsedItem.sieportalPrice !== price);
    if (!currentParsedItem || currentParsedItem.code !== code || (desc && currentParsedItem.raw?.description !== desc) || hasPriceAppeared) {
      currentParsedItem = Parser.transformProduct(code, desc, price);
      console.log('[PushProduct] Extracted product:', currentParsedItem);
      renderFAB(currentParsedItem);
      renderDrawer(currentParsedItem);
    }
  }

  // Initialize
  function init() {
    checkAndExtract();

    // Check every 1.5s for SPA URL / DOM changes
    const pollInterval = setInterval(() => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.id) {
          clearInterval(pollInterval);
          return;
        }
        if (window.location.href !== lastCheckedUrl) {
          lastCheckedUrl = window.location.href;
          checkAndExtract();
        }
      } catch (e) {
        clearInterval(pollInterval);
      }
    }, 1500);

    // Also observe DOM changes
    const observer = new MutationObserver(() => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.id) {
          observer.disconnect();
          return;
        }
        checkAndExtract();
      } catch (e) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[PushProduct] SiePortal Content Script loaded & active.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Listen for queries from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_CURRENT_SIEPORTAL_PRODUCT') {
      const code = extractProductCode();
      const desc = extractRawDescription(code);
      const price = extractPrice();
      const extraContext = extractTechnicalContext();
      const Parser = window.PushProductParser;

      if ((code || desc) && Parser) {
        const hasPriceAppeared = price > 0 && (!currentParsedItem?.sieportalPrice || currentParsedItem.sieportalPrice !== price);
        if (!currentParsedItem || currentParsedItem.code !== code || (desc && currentParsedItem.raw?.description !== desc) || hasPriceAppeared) {
          currentParsedItem = Parser.transformProduct(code, desc, price);
        } else if (price > 0 && currentParsedItem) {
          const priceData = Parser.calculatePricelist(price);
          currentParsedItem.sieportalPrice = priceData.sieportalPrice;
          currentParsedItem.pricelist = priceData.pricelist;
          currentParsedItem.priceData = priceData;
          if (currentParsedItem.raw) currentParsedItem.raw.price = price;
        }
      }

      const data = currentParsedItem || getLatestFormData();
      sendResponse({ success: true, product: data, extraContext });
    }
    return true;
  });

})();
