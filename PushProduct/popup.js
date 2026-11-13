/**
 * PushProduct - Popup Script
 * Handles popup UI interactions, settings, history, and communication
 * with active tabs and service worker.
 */

(function () {
  'use strict';

  const Parser = window.PushProductParser;
  const DEFAULT_HSO_CATEGORIES = [
    'ACB',
    'MCB',
    'MCCB',
    'RCBO',
    'RCCB/ELCB',
    'NH FUSE',
    'MOTOR STARTER CONTACTOR',
    'MOTOR STARTER OVERLOAD',
    'MOTOR STARTER PROTECTION',
    'SINOVA CONTACTOR',
    'CONTACTOR RELAY',
    'SOFTSTARTERS',
    'VSD/VARIABLE SPEED DRIVE',
    'POWER SUPPLY',
    'PLC',
    'COMMANDING AND SIGNALING DEVICES',
    'OVERVOLTAGE PROTECTION DEVICES',
    'SWITCH DISCONNECTORS',
    'SWITCHING DEVICE',
    'MONITORING RELAYS',
    'CURRENT TRANSFORMER',
    'TRANSFORMER',
    'TIMER SWITCH',
    'MEASURING DEVICES',
    'HYBRID MOTOR STARTER',
    'MOTOR MANAGEMENT - SIMOCODE',
    'MOTOR STARTER OVERLOAD ACC',
    'Acc Contactor',
    'MCB BOX',
    'BUSBAR CHASIS',
    'CABLE',
    'CAPACITOR',
    'PANEL',
    'RAKIT PANEL',
    'Monitoring Device Panel',
    'LV',
    'MV',
    'VCB',
    'CP',
    'PHF',
    'UPS',
    'VALE',
    'INDUSTRIAL LIGHTING',
    'LIGHTING',
    'MOBILE LIGHTING',
    'OMRON',
    'OPPLE',
    'SIEMENS OTHER',
    'SIEMENS OTHERS',
    'OTHER',
    'OTHERS',
    '* OTHER'
  ];
  const DEFAULT_ACCURATE_SECRET = 'NqS1k5iqrOEWIAzXnsN8kKEpYOkDdPDekxhF5yVOKkC0O4q6XBo89GRnpNvat1JS';
  const DEFAULT_ACCURATE_TOKEN = 'aat.NTA.eyJ2IjoxLCJ1Ijo1NDk3NjksImQiOjk3NjgxNywiYWkiOjU1NjA5LCJhayI6IjIyYzMxYzc1LTNhZjctNGRmZS04NzcwLTNiOWExMmNjMzAwYSIsImFuIjoiV2ViIEFwaSIsImFwIjoiYTNkYmJmY2MtMmU2Ny00YjQ5LTljNDQtNjNjZTlkNjk3ODllIiwidCI6MTc0NzIxOTgyNDI2M30.10JQiTa7Q3cwGX05diQxsXpOwL/NEe4zFfuStrupwrG5a+vbUhh79qIEh+yMct9YG0qtsLt8E6aMzcP62qBTMTiQjzvpAM8qXxFsvbhw6KZSVm9ToIvWF6a4xxI6/ZwqahtuKYyTG9/siqVc6xQlkCvd8Kb0Aawf0R+3qbWWM3gpt7lsM35lQRefpWmD1jqKqpPFeaFOcXIkJJYfVh9L/w==.YfeJD4hHsaPidTOmY40RwuADLVSauKlIVSlpf3teZDg';
  const DEFAULT_ACCURATE_HOST = 'https://zeus.accurate.id/accurate/api';
  let currentProduct = null;
  let activeTabUrl = '';
  let toastTimer = null;

  // DOM Elements
  const statusBadge = document.getElementById('page-status-badge');
  const manualBox = document.getElementById('manual-input-box');
  const btnToggleManual = document.getElementById('btn-toggle-manual');
  const manualCodeInput = document.getElementById('manual-code');
  const manualDescInput = document.getElementById('manual-desc');
  const btnRunManual = document.getElementById('btn-run-manual');

  // Output Fields
  const outName = document.getElementById('out-name');
  const outRawDesc = document.getElementById('out-raw-desc');
  const outCode = document.getElementById('out-code');
  const outBrand = document.getElementById('out-brand');
  const outCategory = document.getElementById('out-category');
  const outType = document.getElementById('out-type');
  const outUnit = document.getElementById('out-unit');
  const inSiePrice = document.getElementById('in-sieportal-price');
  const outPricelist = document.getElementById('out-pricelist');
  const outFormulaText = document.getElementById('out-formula-text');
  const tagFormula = document.getElementById('tag-formula');

  // Action Buttons
  const btnPushAccurate = document.getElementById('btn-push-accurate');
  const btnCopyTitle = document.getElementById('btn-copy-title');
  const btnCopyAll = document.getElementById('btn-copy-all');
  const btnOpenAccurateTab = document.getElementById('btn-open-accurate-tab');

  // AI Refine Elements
  const btnPopupAiRefine = document.getElementById('btn-popup-ai-refine');
  const btnPopupAiText = document.getElementById('btn-popup-ai-text');
  const popupAiStatus = document.getElementById('popup-ai-status');

  // History & Settings
  const historyList = document.getElementById('history-list');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const setDiscount1 = document.getElementById('set-discount1');
  const setDiscount2 = document.getElementById('set-discount2');
  const setDefaultUnit = document.getElementById('set-default-unit');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  // AI Settings
  const setGeminiKey = document.getElementById('set-gemini-key');
  const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
  const setGeminiModel = document.getElementById('set-gemini-model');
  const btnTestAi = document.getElementById('btn-test-ai');
  const btnSaveAiSettings = document.getElementById('btn-save-ai-settings');
  const aiTestResult = document.getElementById('ai-test-result');

  // Accurate Categories Elements
  const setAccurateCategories = document.getElementById('set-accurate-categories');
  const btnSyncCatsAccurate = document.getElementById('btn-sync-cats-accurate');
  const btnResetDefaultCats = document.getElementById('btn-reset-default-cats');
  const btnSyncCatsApi = document.getElementById('btn-sync-cats-api');
  const btnSaveCategories = document.getElementById('btn-save-categories');

  // Accurate API Elements
  const setAccurateToken = document.getElementById('set-accurate-token');
  const btnToggleTokenVisibility = document.getElementById('btn-toggle-token-visibility');
  const setAccurateSecret = document.getElementById('set-accurate-secret');
  const btnToggleSecretVisibility = document.getElementById('btn-toggle-secret-visibility');
  const setAccurateHost = document.getElementById('set-accurate-host');
  const btnTestAccurateApi = document.getElementById('btn-test-accurate-api');
  const btnSaveAccurateApi = document.getElementById('btn-save-accurate-api');
  const accTestResult = document.getElementById('acc-test-result');

  // Toast
  function showToast(text, duration = 2500) {
    const toast = document.getElementById('popup-toast');
    toast.innerText = text;
    toast.classList.add('active');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('active');
    }, duration);
  }

  // Tab Switching
  document.querySelectorAll('.nav-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      tabBtn.classList.add('active');
      const targetId = tabBtn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');

      if (targetId === 'tab-history') {
        loadHistory();
      } else if (targetId === 'tab-settings') {
        loadSettings();
      }
    });
  });

  // Toggle Manual Input
  btnToggleManual.addEventListener('click', () => {
    if (manualBox.style.display === 'none') {
      manualBox.style.display = 'block';
      btnToggleManual.innerText = 'Sembunyikan';
    } else {
      manualBox.style.display = 'none';
      btnToggleManual.innerText = 'Input Manual';
    }
  });

  // Run Manual Parser
  btnRunManual.addEventListener('click', async () => {
    const code = manualCodeInput.value.trim();
    const desc = manualDescInput.value.trim();
    if (!code && !desc) {
      showToast('⚠️ Masukkan minimal kode produk atau deskripsi!');
      return;
    }

    const { discount1 = 0.63, discount2 = 0.70 } = await chrome.storage.local.get(['discount1', 'discount2']);
    currentProduct = Parser.transformProduct(code, desc, inSiePrice.value || 0, { discount1, discount2 });
    renderProductToForm(currentProduct);
    showToast('✅ Berhasil memformat data!');
  });

  // Render Product into Form
  async function renderProductToForm(product) {
    if (!product) return;
    outName.value = product.name || '';
    if (outRawDesc) {
      outRawDesc.innerText = product.raw?.description || '(Deskripsi mentah belum terdeteksi)';
    }
    outCode.value = product.code || '';
    outBrand.value = product.brand || 'Siemens';
    outType.value = product.itemType || 'Persediaan';
    outUnit.value = product.unit || 'pcs';

    // Populate Accurate Categories dynamically
    const { accurateCategories = DEFAULT_HSO_CATEGORIES } = await chrome.storage.local.get('accurateCategories');

    const targetCat = (product.category || 'MCB').toUpperCase();
    if (targetCat && !accurateCategories.map(c => c.toUpperCase()).includes(targetCat)) {
      accurateCategories.push(product.category);
    }

    outCategory.innerHTML = accurateCategories.map(cat => `
      <option value="${cat}" ${cat.toUpperCase() === targetCat ? 'selected' : ''}>${cat}</option>
    `).join('');

    const { discount1 = 0.63, discount2 = 0.70 } = await chrome.storage.local.get(['discount1', 'discount2']);

    if (product.sieportalPrice && product.sieportalPrice > 0) {
      inSiePrice.value = product.sieportalPrice;
      const priceData = Parser.calculatePricelist(product.sieportalPrice, discount1, discount2);
      product.priceData = priceData;
      product.pricelist = priceData.pricelist;
    } else if (inSiePrice.value && !isNaN(parseFloat(inSiePrice.value)) && parseFloat(inSiePrice.value) > 0) {
      // Preserve existing user-entered price when AI refines title
      const priceData = Parser.calculatePricelist(inSiePrice.value, discount1, discount2);
      product.sieportalPrice = priceData.sieportalPrice;
      product.pricelist = priceData.pricelist;
      product.priceData = priceData;
    }

    outPricelist.innerText = product.priceData?.formattedPricelist || 'Rp 0';
    outFormulaText.innerText = product.priceData?.formulaText || `Harga SIEPortal / ${discount1} / ${discount2}`;
  }

  // Price Live Calculation
  inSiePrice.addEventListener('input', async (e) => {
    const { discount1 = 0.63, discount2 = 0.70 } = await chrome.storage.local.get(['discount1', 'discount2']);
    const priceData = Parser.calculatePricelist(e.target.value, discount1, discount2);

    outPricelist.innerText = priceData.formattedPricelist;
    outFormulaText.innerText = priceData.formulaText;

    if (currentProduct) {
      currentProduct.sieportalPrice = priceData.sieportalPrice;
      currentProduct.pricelist = priceData.pricelist;
      currentProduct.priceData = priceData;
    }
  });

  // Gather current form data
  async function getFormData() {
    const { discount1 = 0.63, discount2 = 0.70 } = await chrome.storage.local.get(['discount1', 'discount2']);
    const priceData = Parser.calculatePricelist(inSiePrice.value, discount1, discount2);

    return {
      name: outName.value.trim(),
      code: outCode.value.trim().toUpperCase(),
      brand: outBrand.value.trim() || 'Siemens',
      category: outCategory.value,
      itemType: outType.value.trim() || 'Persediaan',
      unit: outUnit.value.trim() || 'pcs',
      sieportalPrice: priceData.sieportalPrice,
      pricelist: priceData.pricelist,
      priceData,
      timestamp: new Date().toISOString()
    };
  }

  // Main Push Button Action (Direct Open API Push)
  btnPushAccurate.addEventListener('click', async () => {
    const item = await getFormData();
    if (!item.code || !item.name) {
      showToast('⚠️ Kode barang & Judul tidak boleh kosong!');
      return;
    }

    const btnPushText = document.getElementById('btn-push-text') || btnPushAccurate;
    const originalText = btnPushText.innerHTML;

    btnPushAccurate.disabled = true;
    btnPushText.innerHTML = '<span class="spinner-small"></span> <span>Menyimpan via API...</span>';
    showToast('🚀 Mengirim & membuat produk di Accurate Online via API...');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'PUSH_CREATE_ACCURATE_ITEM',
        payload: item
      });

      if (response && response.success) {
        btnPushAccurate.style.backgroundColor = '#059669';
        btnPushText.innerHTML = '<span>✅ Berhasil Disimpan di Accurate!</span>';
        showToast(response.message || `✅ Barang "${item.name}" berhasil disimpan di Accurate Online via API!`, 4000);

        setTimeout(() => {
          btnPushAccurate.disabled = false;
          btnPushAccurate.style.backgroundColor = '';
          btnPushText.innerHTML = originalText;
        }, 2500);
      } else {
        btnPushAccurate.disabled = false;
        btnPushAccurate.style.backgroundColor = '';
        btnPushText.innerHTML = originalText;
        showToast('⚠️ Gagal: ' + (response?.error || 'Gagal menyimpan ke Accurate.'), 5000);
        alert('⚠️ Gagal Push ke Accurate Online via API:\n\n' + (response?.error || 'Pastikan Access Token dan Secret Accurate valid di Tab Pengaturan.'));
      }
    } catch (err) {
      console.error('[PushProduct Popup Push Error]:', err);
      btnPushAccurate.disabled = false;
      btnPushAccurate.style.backgroundColor = '';
      btnPushText.innerHTML = originalText;
      showToast('⚠️ Gagal terhubung ke background script.');
    }
  });

  // Copy Title
  btnCopyTitle.addEventListener('click', () => {
    navigator.clipboard.writeText(outName.value);
    showToast('📋 Judul berhasil disalin!');
  });

  // Copy All
  btnCopyAll.addEventListener('click', async () => {
    const item = await getFormData();
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
    showToast('📋 Format lengkap berhasil disalin!');
  });

  // Open Accurate Tab Directly
  btnOpenAccurateTab.addEventListener('click', async () => {
    const accurateTabs = await chrome.tabs.query({
      url: ['*://*.accurate.id/*', '*://accurate.id/*']
    });
    if (accurateTabs && accurateTabs.length > 0) {
      await chrome.tabs.update(accurateTabs[0].id, { active: true });
    } else {
      await chrome.tabs.create({ url: 'https://accurate.id/accurate/', active: true });
    }
  });

  // History Tab Handling
  async function loadHistory() {
    const { recentHistory = [] } = await chrome.storage.local.get('recentHistory');
    if (!recentHistory || recentHistory.length === 0) {
      historyList.innerHTML = `
        <div style="text-align: center; color: #94A3B8; padding: 24px 0; font-size: 12px;">
          Belum ada riwayat produk yang dipush.
        </div>
      `;
      return;
    }

    historyList.innerHTML = recentHistory.map((item, idx) => `
      <div class="history-item">
        <div class="history-item-header">
          <span class="history-item-code">${item.code}</span>
          <span style="font-size: 10px; color: #94A3B8;">${new Date(item.timestamp || Date.now()).toLocaleTimeString()}</span>
        </div>
        <div class="history-item-title">${item.name}</div>
        <div class="history-item-footer">
          <span class="history-item-price">${item.priceData?.formattedPricelist || 'Rp ' + (item.pricelist || 0)}</span>
          <div style="display: flex; gap: 4px;">
            <button class="btn-secondary btn-hist-load" data-idx="${idx}" style="padding: 2px 6px; font-size: 10px;">
              Tampilkan
            </button>
            <button class="btn-secondary btn-hist-push" data-idx="${idx}" style="padding: 2px 6px; font-size: 10px; color: #E53935;">
              Push
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach History buttons
    document.querySelectorAll('.btn-hist-load').forEach(b => {
      b.addEventListener('click', (e) => {
        const idx = e.target.getAttribute('data-idx');
        const itm = recentHistory[idx];
        if (itm) {
          currentProduct = itm;
          renderProductToForm(itm);
          document.querySelector('.nav-tab[data-tab="tab-push"]').click();
          showToast(`Loaded ${itm.code}`);
        }
      });
    });

    document.querySelectorAll('.btn-hist-push').forEach(b => {
      b.addEventListener('click', async (e) => {
        const idx = e.target.getAttribute('data-idx');
        const itm = recentHistory[idx];
        if (itm) {
          showToast(`🚀 Menyimpan ${itm.code} ke Accurate via API...`);
          try {
            const res = await chrome.runtime.sendMessage({
              action: 'PUSH_CREATE_ACCURATE_ITEM',
              payload: itm
            });
            if (res && res.success) {
              showToast(`✅ ${res.message || 'Berhasil disimpan di Accurate Online via API!'}`);
              loadHistory();
            } else {
              showToast(`⚠️ Gagal: ${res?.error || 'Error'}`);
            }
          } catch (err) {
            showToast('⚠️ Gagal terhubung ke background script.');
          }
        }
      });
    });
  }

  // Clear History
  btnClearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ recentHistory: [] });
    loadHistory();
    showToast('Riwayat dibersihkan.');
  });

  // Gemini Flash AI Refine Button in Popup
  btnPopupAiRefine.addEventListener('click', async () => {
    let code = outCode.value.trim() || currentProduct?.code || '';
    let desc = manualDescInput.value.trim() || currentProduct?.raw?.description || '';
    let extraContext = activeTabUrl;

    // If active tab is SiePortal, query tab for fresh extracted description and specs
    if (activeTabUrl.includes('sieportal.siemens.com')) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const fresh = await chrome.tabs.sendMessage(tab.id, { action: 'GET_CURRENT_SIEPORTAL_PRODUCT' });
          if (fresh && fresh.success && fresh.product) {
            if (fresh.product.raw?.description) {
              desc = fresh.product.raw.description;
              if (outRawDesc) outRawDesc.innerText = desc;
            }
            if (fresh.product.code) code = fresh.product.code;
            if (fresh.extraContext) extraContext = `${activeTabUrl} | ${fresh.extraContext}`;
            if (fresh.product.sieportalPrice && (!inSiePrice.value || inSiePrice.value === '0')) {
              inSiePrice.value = fresh.product.sieportalPrice;
            }
          }
        }
      } catch (e) {
        console.warn('Could not query active tab for fresh desc:', e);
      }
    }

    // Fallback if still empty
    if (!desc) {
      desc = outName.value.trim();
    }

    const price = inSiePrice.value.trim() || currentProduct?.sieportalPrice || '';

    if (!code && !desc) {
      showToast('⚠️ Masukkan minimal kode produk atau deskripsi!');
      return;
    }

    btnPopupAiRefine.classList.add('loading');
    btnPopupAiText.innerText = '🤖 Gemini Flash menganalisis...';
    popupAiStatus.style.display = 'block';
    popupAiStatus.innerText = 'Memanggil Google Gemini Flash AI...';

    try {
      let response;
      try {
        response = await chrome.runtime.sendMessage({
          action: 'AI_FORMAT_PRODUCT',
          payload: {
            code,
            description: desc,
            price,
            extraContext
          }
        });
      } catch (e) {
        console.warn('Background message error:', e);
      }

      // If background succeeded and returned product
      if (response && response.success && response.product) {
        currentProduct = response.product;
        renderProductToForm(response.product);
        popupAiStatus.innerText = '✅ Berhasil disempurnakan oleh Gemini Flash AI!';
        showToast('✨ Judul & spesifikasi disempurnakan oleh Gemini Flash!');
        return;
      }

      // Direct fallback using GeminiService in popup context
      const service = window.GeminiService || globalThis.GeminiService;
      if (service && service.callGeminiFlash) {
        const config = await chrome.storage.local.get([
          'geminiApiKey', 'geminiModel', 'discount1', 'discount2', 'accurateCategories'
        ]);
        const apiKey = config.geminiApiKey || setGeminiKey?.value?.trim();
        if (!apiKey) {
          popupAiStatus.innerText = '⚠️ API Key Gemini belum diatur.';
          alert('⚠️ API Key Google Gemini belum diatur!\n\nSilakan buka tab "Pengaturan" di atas, lalu masukkan Google Gemini API Key Anda.');
          document.querySelector('.nav-tab[data-tab="tab-settings"]')?.click();
          setGeminiKey?.focus();
          return;
        }

        popupAiStatus.innerText = '🤖 Gemini Flash memproses langsung...';
        const aiResult = await service.callGeminiFlash({
          apiKey,
          model: config.geminiModel || setGeminiModel?.value || 'gemini-3.8-flash',
          code,
          description: desc,
          price,
          extraContext: activeTabUrl,
          categories: config.accurateCategories
        });

        const Parser = window.PushProductParser || globalThis.PushProductParser;
        const priceData = Parser ? Parser.calculatePricelist(price, config.discount1 || 0.63, config.discount2 || 0.70) : null;

        const fullProduct = {
          ...aiResult,
          code: (aiResult.code || code || '').trim().toUpperCase(),
          name: aiResult.name || '',
          brand: 'Siemens',
          category: aiResult.category || (config.accurateCategories?.[0] || 'MCB'),
          itemType: aiResult.itemType || 'Persediaan',
          unit: aiResult.unit || 'pcs',
          sieportalPrice: priceData?.sieportalPrice || 0,
          pricelist: priceData?.pricelist || 0,
          priceData,
          isAIGenerated: true,
          aiModel: config.geminiModel || 'gemini-3.8-flash',
          timestamp: new Date().toISOString()
        };

        currentProduct = fullProduct;
        renderProductToForm(fullProduct);
        popupAiStatus.innerText = '✅ Berhasil disempurnakan oleh Gemini Flash AI!';
        showToast('✨ Judul & spesifikasi disempurnakan oleh Gemini Flash!');
        return;
      }

      if (response && response.needsApiKey) {
        popupAiStatus.innerText = '⚠️ API Key Gemini belum diatur.';
        alert('⚠️ API Key Google Gemini belum diatur!\n\nSilakan buka tab "Pengaturan" di atas, lalu masukkan Google Gemini API Key Anda.');
        document.querySelector('.nav-tab[data-tab="tab-settings"]').click();
        setGeminiKey.focus();
      } else {
        popupAiStatus.innerText = '⚠️ ' + (response?.error || 'Gagal AI.');
        showToast('⚠️ ' + (response?.error || 'Gagal memanggil AI'));
      }
    } catch (err) {
      console.error('[Popup AI Refine Error]:', err);
      if (err.message && (err.message.includes('503') || err.message.includes('high demand') || err.message.includes('429'))) {
        const Parser = window.PushProductParser || globalThis.PushProductParser;
        if (Parser) {
          const config = await chrome.storage.local.get(['discount1', 'discount2', 'accurateCategories']);
          const fallbackProduct = Parser.transformProduct(code, desc, price, {
            discount1: config.discount1 || 0.63,
            discount2: config.discount2 || 0.70
          });
          currentProduct = fallbackProduct;
          renderProductToForm(fallbackProduct);
          popupAiStatus.innerText = '⚡ Server Google AI sedang antre (503). Judul otomatis diformat oleh mesin cerdas lokal.';
          popupAiStatus.style.color = '#B45309';
          popupAiStatus.style.display = 'block';
          showToast('⚡ Server AI antre, judul diformat mesin lokal');
          return;
        }
      }
      popupAiStatus.innerText = '⚠️ ' + err.message;
      showToast('⚠️ Gagal: ' + err.message);
    } finally {
      btnPopupAiRefine.classList.remove('loading');
      btnPopupAiText.innerText = '✨ Sempurnakan dengan Gemini Flash AI';
    }
  });

  // Settings Handling
  async function loadSettings() {
    const {
      discount1 = 0.63,
      discount2 = 0.70,
      defaultUnit = 'pcs',
      geminiApiKey = '',
      geminiModel = 'gemini-3.8-flash',
      availableGeminiModels = [],
      accurateToken = DEFAULT_ACCURATE_TOKEN,
      accurateSecret = DEFAULT_ACCURATE_SECRET,
      accurateHost = DEFAULT_ACCURATE_HOST,
      accurateCategories = DEFAULT_HSO_CATEGORIES
    } = await chrome.storage.local.get([
      'discount1', 'discount2', 'defaultUnit',
      'geminiApiKey', 'geminiModel', 'availableGeminiModels',
      'accurateToken', 'accurateSecret', 'accurateHost',
      'accurateCategories'
    ]);

    setDiscount1.value = discount1;
    setDiscount2.value = discount2;
    setDefaultUnit.value = defaultUnit;
    setGeminiKey.value = geminiApiKey;

    if (setAccurateToken) setAccurateToken.value = accurateToken;
    if (setAccurateSecret) setAccurateSecret.value = accurateSecret;
    if (setAccurateHost) setAccurateHost.value = accurateHost;

    let targetModel = geminiModel;
    if (!targetModel || targetModel.includes('2.5') || targetModel.includes('1.5')) {
      targetModel = 'gemini-3.8-flash';
      await chrome.storage.local.set({ geminiModel: 'gemini-3.8-flash' });
    }

    if (availableGeminiModels && availableGeminiModels.length > 0) {
      setGeminiModel.innerHTML = availableGeminiModels.map(m => `
        <option value="${m.id}" ${m.id === targetModel ? 'selected' : ''}>
          ${m.displayName || m.id}
        </option>
      `).join('');
    } else {
      setGeminiModel.value = targetModel;
    }

    if (setAccurateCategories) {
      setAccurateCategories.value = accurateCategories.join(', ');
    }
  }

  // Auto-fetch models when API key changes
  setGeminiKey.addEventListener('change', async () => {
    const key = setGeminiKey.value.trim();
    const service = window.GeminiService || globalThis.GeminiService;
    if (key.length > 10 && service && service.listAvailableModels) {
      try {
        const models = await service.listAvailableModels(key);
        if (models && models.length > 0) {
          const currentVal = setGeminiModel.value;
          setGeminiModel.innerHTML = models.map(m => `
            <option value="${m.id}" ${m.id === currentVal ? 'selected' : ''}>
              ${m.displayName || m.id}
            </option>
          `).join('');
          await chrome.storage.local.set({ availableGeminiModels: models });
        }
      } catch (e) {
        console.warn('[Model Fetch on change error]:', e);
      }
    }
  });

  // Save Accurate Categories
  if (btnSaveCategories) {
    btnSaveCategories.addEventListener('click', async () => {
      const rawText = setAccurateCategories.value;
      const parsedCats = rawText
        .split(/[,;\n]/)
        .map(c => c.trim().toUpperCase())
        .filter(c => c.length > 0);

      const uniqueCats = Array.from(new Set(parsedCats));
      if (uniqueCats.length === 0) {
        showToast('⚠️ Masukkan minimal 1 kategori Accurate!');
        return;
      }

      await chrome.storage.local.set({ accurateCategories: uniqueCats });
      showToast(`💾 Tersimpan ${uniqueCats.length} kategori Accurate!`);

      // Refresh category select in Tab 1 if current product exists
      if (currentProduct) {
        renderProductToForm(currentProduct);
      }
    });
  }

  // Reset to Default HSO Categories
  if (btnResetDefaultCats) {
    btnResetDefaultCats.addEventListener('click', async () => {
      setAccurateCategories.value = DEFAULT_HSO_CATEGORIES.join(', ');
      await chrome.storage.local.set({ accurateCategories: DEFAULT_HSO_CATEGORIES });
      showToast('⚡ 17 Kategori Standar HSO diterapkan!');
      if (currentProduct) {
        renderProductToForm(currentProduct);
      }
    });
  }

  // Direct Sync via Accurate Open API
  if (btnSyncCatsApi) {
    btnSyncCatsApi.addEventListener('click', async () => {
      let token = setAccurateToken ? setAccurateToken.value.trim() : '';
      let secret = setAccurateSecret ? setAccurateSecret.value.trim() : '';
      let host = setAccurateHost ? setAccurateHost.value : 'https://zeus.accurate.id/accurate/api';

      if (!token) {
        const stored = await chrome.storage.local.get(['accurateToken', 'accurateSecret', 'accurateHost']);
        token = stored.accurateToken || '';
        secret = stored.accurateSecret || '';
        host = stored.accurateHost || host;
      }

      if (!token) {
        alert('⚠️ Accurate Access Token belum diisi.\n\nSilakan masukkan Accurate Access Token Anda pada bagian "Accurate Online Open API" di bawah ini, lalu klik tombol ini lagi.');
        if (setAccurateToken) {
          setAccurateToken.focus();
          setAccurateToken.scrollIntoView({ behavior: 'smooth' });
        }
        return;
      }

      btnSyncCatsApi.innerText = '⏳ Mengambil API...';
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'FETCH_ACCURATE_CATEGORIES_API',
          payload: { accessToken: token, signatureSecret: secret, hostUrl: host }
        });

        if (res && res.success && res.categories && res.categories.length > 0) {
          setAccurateCategories.value = res.categories.join(', ');
          showToast(`✅ Berhasil menarik ${res.count} kategori via Accurate Open API!`);
          if (currentProduct) renderProductToForm(currentProduct);
        } else {
          alert('⚠️ Gagal mengambil kategori dari Accurate API: ' + (res?.error || 'Respon kosong'));
        }
      } catch (err) {
        alert('⚠️ Terjadi kesalahan saat menghubungi API Accurate: ' + err.message);
      } finally {
        btnSyncCatsApi.innerText = '🔌 Tarik via API';
      }
    });
  }

  // Sync Categories directly from active Accurate tab
  if (btnSyncCatsAccurate) {
    btnSyncCatsAccurate.addEventListener('click', async () => {
      btnSyncCatsAccurate.innerText = '⏳ Menghubungi Accurate...';

      try {
        const accurateTabs = await chrome.tabs.query({
          url: ['*://*.accurate.id/*', '*://accurate.id/*']
        });

        if (!accurateTabs || accurateTabs.length === 0) {
          alert('⚠️ Tab Accurate Online tidak ditemukan di browser Anda.\n\nSilakan buka Accurate Online (https://accurate.id/accurate/), pastikan sudah login ke database perusahaan Anda, lalu klik tombol ini lagi.');
          btnSyncCatsAccurate.innerText = '🔄 Tarik dari Tab Accurate';
          return;
        }

        // Prioritize active tab, or tab currently inside /accurate/ database
        const targetTab = accurateTabs.find(t => t.active) ||
                          accurateTabs.find(t => t.url && (t.url.includes('/accurate/') || t.url.includes('module'))) ||
                          accurateTabs[0];

        let categoriesFound = [];

        // Method 1: Direct in-page execution via chrome.scripting.executeScript
        // Executes with full page session cookies and doesn't rely on existing message listener
        if (chrome.scripting && chrome.scripting.executeScript) {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              func: async () => {
                const found = new Set();

                // 1. Fetch from Accurate Internal Session APIs
                const apiEndpoints = [
                  '/accurate/api/item-category/list.do?fields=id,name&sp.pageSize=200',
                  '/accurate/api/item-category/lookup.do?fields=id,name',
                  '/accurate/api/item-category/list.do',
                  '/accurate/api/item/category-list.do'
                ];

                for (const endpoint of apiEndpoints) {
                  try {
                    const resp = await fetch(endpoint, {
                      credentials: 'include',
                      headers: { 'Accept': 'application/json, text/plain, */*' }
                    });
                    if (resp.ok) {
                      const json = await resp.json();
                      const items = json.d || json.data || json.rows || (Array.isArray(json) ? json : []);
                      for (const it of items) {
                        const name = (it.name || it.categoryName || it.text || it.title || '').trim();
                        if (name && name.length >= 2 && name.length <= 40 && !/pilih|select|semua/i.test(name)) {
                          found.add(name);
                        }
                      }
                      if (found.size > 0) break;
                    }
                  } catch (e) {}
                }

                // 2. Scan Dojo Registry for category widgets
                try {
                  if (window.dijit && window.dijit.registry) {
                    window.dijit.registry.toArray().forEach(widget => {
                      const wid = (widget.id || '').toLowerCase();
                      if (wid.includes('category') || wid.includes('kategori')) {
                        if (widget.store && Array.isArray(widget.store.data)) {
                          widget.store.data.forEach(d => {
                            if (d.name) found.add(d.name.trim());
                          });
                        }
                      }
                    });
                  }
                } catch (e) {}

                // 3. Scan DOM options & dropdown menus
                const dropItems = document.querySelectorAll(
                  '.dijitComboBoxMenu .dijitMenuItem, .dijitPopup div, .dropdown-menu li, .select2-results__option, .lookup-result-item, .v-list-item, div[role="option"], li[role="option"]'
                );
                dropItems.forEach(el => {
                  const text = (el.innerText || '').trim();
                  if (text && text.length >= 2 && text.length <= 40 && !/pilih|tambah|baru|loading|memuat|cari/i.test(text)) {
                    found.add(text);
                  }
                });

                // 4. Scan Select elements
                document.querySelectorAll('select').forEach(sel => {
                  Array.from(sel.options).forEach(opt => {
                    const text = (opt.text || opt.value || '').trim();
                    if (text && text.length >= 2 && text.length <= 40 && !/pilih|select|semua|all/i.test(text)) {
                      found.add(text);
                    }
                  });
                });

                // 5. Scan Table Grid cells (e.g. if open on Kategori Barang list)
                document.querySelectorAll('table tr td, .grid-cell, [data-property*="name" i], [data-property*="category" i]').forEach(cell => {
                  const text = (cell.innerText || '').trim();
                  if (text && text.length >= 2 && text.length <= 35 && !text.includes('\n') && !/pilih|tambah|baru|edit|hapus|delete|cari|search/i.test(text)) {
                    if (window.location.href.includes('item-category') || cell.closest('table')?.innerText.includes('Kategori')) {
                      found.add(text);
                    }
                  }
                });

                return Array.from(found);
              }
            });

            if (results && results[0] && Array.isArray(results[0].result) && results[0].result.length > 0) {
              categoriesFound = results[0].result;
            }
          } catch (scriptErr) {
            console.warn('[executeScript direct extract warning]:', scriptErr);
          }
        }

        // Method 2: Ensure content-accurate.js is injected and try sendMessage as fallback
        if (categoriesFound.length === 0) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              files: ['content-accurate.js']
            });
          } catch (injectErr) {
            console.warn('[content-accurate inject warning]:', injectErr);
          }

          try {
            const res = await chrome.tabs.sendMessage(targetTab.id, { action: 'FETCH_CATEGORIES_FROM_ACCURATE_PAGE' });
            if (res && res.success && res.categories && res.categories.length > 0) {
              categoriesFound = res.categories;
            }
          } catch (msgErr) {
            console.warn('[FETCH_CATEGORIES_FROM_ACCURATE_PAGE sendMessage warning]:', msgErr);
          }
        }

        // Result evaluation
        if (categoriesFound && categoriesFound.length > 0) {
          const { accurateCategories = [] } = await chrome.storage.local.get('accurateCategories');
          const merged = Array.from(new Set([...categoriesFound, ...accurateCategories]));
          await chrome.storage.local.set({ accurateCategories: merged });
          setAccurateCategories.value = merged.join(', ');
          showToast(`✅ Berhasil menarik ${categoriesFound.length} kategori dari Accurate!`);
          if (currentProduct) renderProductToForm(currentProduct);
        } else {
          alert('ℹ️ Tidak terdeteksi kategori pada tab Accurate yang aktif saat ini.\n\nTips:\n1. Buka modul "Persediaan" > "Barang & Jasa" di Accurate, lalu klik kolom Kategori sekali agar daftarnya dimuat oleh Accurate.\n2. Atau klik tombol "⚡ Default HSO" di samping untuk langsung menggunakan 17 kategori standar HSO (ACB, MCB, MCCB, TOR, Contactors, dll).');
        }
      } catch (err) {
        console.error('[Sync Cats Error]:', err);
        showToast('⚠️ Gagal terhubung ke tab Accurate: ' + (err.message || 'Koneksi terputus'));
      } finally {
        btnSyncCatsAccurate.innerText = '🔄 Tarik dari Tab Accurate';
      }
    });
  }

  // Toggle API Key Visibility
  btnToggleKeyVisibility.addEventListener('click', () => {
    if (setGeminiKey.type === 'password') {
      setGeminiKey.type = 'text';
      btnToggleKeyVisibility.innerText = 'Sembunyikan';
    } else {
      setGeminiKey.type = 'password';
      btnToggleKeyVisibility.innerText = 'Lihat';
    }
  });

  // Save AI Settings
  btnSaveAiSettings.addEventListener('click', async () => {
    const apiKey = setGeminiKey.value.trim();
    const model = setGeminiModel.value;

    await chrome.storage.local.set({
      geminiApiKey: apiKey,
      geminiModel: model
    });

    showToast('💾 Pengaturan Gemini AI tersimpan!');
  });

  // Test AI Connection
  btnTestAi.addEventListener('click', async () => {
    const apiKey = setGeminiKey.value.trim();
    let model = setGeminiModel.value;
    if (!model || model.includes('2.5') || model.includes('1.5')) {
      model = 'gemini-3.8-flash';
    }

    if (!apiKey) {
      alert('Silakan masukkan API Key Gemini Anda terlebih dahulu.');
      setGeminiKey.focus();
      return;
    }

    btnTestAi.disabled = true;
    btnTestAi.innerText = '⏳ Menguji...';
    aiTestResult.style.display = 'block';
    aiTestResult.style.background = '#F1F5F9';
    aiTestResult.style.color = '#475569';
    aiTestResult.innerText = 'Menghubungkan ke Google Gemini API...';

    try {
      let testResult;
      // 1. Direct call using GeminiService in popup context (fast & independent of service worker cache)
      const service = window.GeminiService || globalThis.GeminiService;
      if (service && service.testGeminiConnection) {
        testResult = await service.testGeminiConnection(apiKey, model);
      } else {
        // 2. Fallback to background service worker
        const response = await chrome.runtime.sendMessage({
          action: 'TEST_GEMINI_CONNECTION',
          payload: { apiKey, model }
        });
        if (response && response.success && response.result) {
          testResult = response.result;
        } else {
          throw new Error(response?.error || 'Service worker tidak merespons');
        }
      }

      if (testResult && testResult.name) {
        const finalModel = testResult.usedModel || model;

        // If available models were discovered from Google API, dynamically populate the dropdown!
        if (testResult.availableModels && testResult.availableModels.length > 0) {
          setGeminiModel.innerHTML = testResult.availableModels.map(m => `
            <option value="${m.id}" ${m.id === finalModel ? 'selected' : ''}>
              ${m.displayName || m.id}
            </option>
          `).join('');
        }

        // Automatically save API key and model if test succeeds
        await chrome.storage.local.set({
          geminiApiKey: apiKey,
          geminiModel: finalModel,
          availableGeminiModels: testResult.availableModels || []
        });

        aiTestResult.style.background = '#DCFCE7';
        aiTestResult.style.color = '#166534';
        aiTestResult.innerHTML = `
          <strong>✅ Koneksi Sukses!</strong><br>
          Model Terpilih: <code>${finalModel}</code><br>
          Format Uji: <em>${testResult.name}</em>
        `;
        showToast('✅ Koneksi Gemini Flash Berhasil & Tersimpan!');
      } else {
        throw new Error('Respons AI tidak mengandung data produk yang valid.');
      }
    } catch (err) {
      console.error('[AI Test Error]:', err);
      aiTestResult.style.background = '#FEE2E2';
      aiTestResult.style.color = '#991B1B';
      aiTestResult.innerHTML = `<strong>❌ Gagal:</strong> ${err.message}`;
      showToast('❌ Koneksi gagal.');
    } finally {
      btnTestAi.disabled = false;
      btnTestAi.innerText = '🔌 Uji Koneksi AI';
    }
  });

  // Accurate API Credential Handlers
  if (btnToggleTokenVisibility && setAccurateToken) {
    btnToggleTokenVisibility.addEventListener('click', () => {
      if (setAccurateToken.type === 'password') {
        setAccurateToken.type = 'text';
        btnToggleTokenVisibility.innerText = 'Sembunyikan';
      } else {
        setAccurateToken.type = 'password';
        btnToggleTokenVisibility.innerText = 'Lihat';
      }
    });
  }

  if (btnToggleSecretVisibility && setAccurateSecret) {
    btnToggleSecretVisibility.addEventListener('click', () => {
      if (setAccurateSecret.type === 'password') {
        setAccurateSecret.type = 'text';
        btnToggleSecretVisibility.innerText = 'Sembunyikan';
      } else {
        setAccurateSecret.type = 'password';
        btnToggleSecretVisibility.innerText = 'Lihat';
      }
    });
  }

  if (btnSaveAccurateApi) {
    btnSaveAccurateApi.addEventListener('click', async () => {
      const token = setAccurateToken ? setAccurateToken.value.trim() : '';
      const secret = setAccurateSecret ? setAccurateSecret.value.trim() : '';
      const host = setAccurateHost ? setAccurateHost.value : 'https://zeus.accurate.id/accurate/api';

      await chrome.storage.local.set({
        accurateToken: token,
        accurateSecret: secret,
        accurateHost: host
      });

      showToast('💾 Kredensial Accurate API tersimpan!');
    });
  }

  if (btnTestAccurateApi) {
    btnTestAccurateApi.addEventListener('click', async () => {
      const token = setAccurateToken ? setAccurateToken.value.trim() : '';
      const secret = setAccurateSecret ? setAccurateSecret.value.trim() : '';
      const host = setAccurateHost ? setAccurateHost.value : 'https://zeus.accurate.id/accurate/api';

      if (!token) {
        alert('Silakan masukkan Accurate Access Token terlebih dahulu.');
        if (setAccurateToken) setAccurateToken.focus();
        return;
      }

      btnTestAccurateApi.disabled = true;
      btnTestAccurateApi.innerText = '⏳ Menguji...';
      if (accTestResult) {
        accTestResult.style.display = 'block';
        accTestResult.style.background = '#F0F9FF';
        accTestResult.style.color = '#0369A1';
        accTestResult.innerText = `Menghubungkan ke Accurate Online Open API (${host})...`;
      }

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'TEST_ACCURATE_API_CONNECTION',
          payload: { accessToken: token, signatureSecret: secret, hostUrl: host }
        });

        if (response && response.success) {
          if (accTestResult) {
            accTestResult.style.background = '#ECFDF5';
            accTestResult.style.color = '#065F46';
            accTestResult.innerHTML = `<strong>✅ Koneksi Sukses!</strong><br>Ditemukan ${response.count} kategori terdaftar di database Accurate.`;
          }
          showToast('✅ Koneksi Accurate API Berhasil!');
        } else {
          if (accTestResult) {
            accTestResult.style.background = '#FEF2F2';
            accTestResult.style.color = '#991B1B';
            accTestResult.innerHTML = `<strong>❌ Gagal:</strong> ${response?.error || 'Kredensial tidak valid'}`;
          }
          showToast('❌ Koneksi gagal.');
        }
      } catch (e) {
        if (accTestResult) {
          accTestResult.style.background = '#FEF2F2';
          accTestResult.style.color = '#991B1B';
          accTestResult.innerHTML = `<strong>❌ Error:</strong> ${e.message}`;
        }
        showToast('❌ Error menghubungkan API.');
      } finally {
        btnTestAccurateApi.disabled = false;
        btnTestAccurateApi.innerText = '🧪 Uji Koneksi API';
      }
    });
  }

  btnSaveSettings.addEventListener('click', async () => {
    const d1 = parseFloat(setDiscount1.value) || 0.63;
    const d2 = parseFloat(setDiscount2.value) || 0.70;
    const unit = setDefaultUnit.value.trim() || 'pcs';

    await chrome.storage.local.set({
      discount1: d1,
      discount2: d2,
      defaultUnit: unit
    });

    tagFormula.innerText = `/ ${d1} / ${d2}`;
    showToast('💾 Pengaturan diskon tersimpan!');

    // Recalculate price in active form
    if (inSiePrice.value) {
      const priceData = Parser.calculatePricelist(inSiePrice.value, d1, d2);
      outPricelist.innerText = priceData.formattedPricelist;
      outFormulaText.innerText = priceData.formulaText;
    }
  });

  // Check Current Active Tab on Open
  async function checkActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabUrl = tab?.url || '';

    // Load discount tag
    const { discount1 = 0.63, discount2 = 0.70 } = await chrome.storage.local.get(['discount1', 'discount2']);
    tagFormula.innerText = `/ ${discount1} / ${discount2}`;

    if (activeTabUrl.includes('sieportal.siemens.com')) {
      statusBadge.innerText = 'SiePortal Terhubung';
      statusBadge.className = 'badge-status active';

      // Ask content script for parsed product
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_CURRENT_SIEPORTAL_PRODUCT' });
        if (response && response.success && response.product) {
          currentProduct = response.product;
          renderProductToForm(currentProduct);

          // Auto-refine with Gemini if API Key is set and not yet AI generated
          const { geminiApiKey, autoUseGemini = true } = await chrome.storage.local.get(['geminiApiKey', 'autoUseGemini']);
          if (geminiApiKey && autoUseGemini !== false && !currentProduct.isAIGenerated) {
            btnPopupAiRefine.click();
          }
          return;
        }
      } catch (err) {
        console.log('[PushProduct Popup] Content script not responding, using URL fallback:', err);
      }

      // Fallback extraction from URL
      const urlCode = (activeTabUrl.match(/\/detail\/([A-Za-z0-9\-_]+)/i) || [])[1];
      if (urlCode) {
        currentProduct = Parser.transformProduct(urlCode, '', 0, { discount1, discount2 });
        renderProductToForm(currentProduct);
      }
    } else if (activeTabUrl.includes('accurate.id')) {
      statusBadge.innerText = 'Accurate Online Terbuka';
      statusBadge.className = 'badge-status active';
      // Load pending item if available
      const { pendingAccurateItem } = await chrome.storage.local.get('pendingAccurateItem');
      if (pendingAccurateItem) {
        currentProduct = pendingAccurateItem;
        renderProductToForm(pendingAccurateItem);
      }
    } else {
      statusBadge.innerText = 'Mode Mandiri (Standby)';
      statusBadge.className = 'badge-status inactive';
      // Pre-fill with the user's example so they immediately see the working demo
      const exampleCode = '5TJ4110-6';
      const exampleDesc = 'SINOPLUS, Miniature Circuit Breaker 240/415V 10kA, 1-pole B, 10 A';
      manualCodeInput.value = exampleCode;
      manualDescInput.value = exampleDesc;
      currentProduct = Parser.transformProduct(exampleCode, exampleDesc, 63000, { discount1, discount2 });
      renderProductToForm(currentProduct);
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    checkActiveTab();
  });

})();
