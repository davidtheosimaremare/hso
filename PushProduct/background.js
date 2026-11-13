/**
 * PushProduct - Background Service Worker (Manifest V3)
 * Manages communication between SiePortal content script, popup, and Accurate Online tabs.
 */

// Ephemeral Service Worker - state persisted exclusively in chrome.storage.local

importScripts('parser.js', 'geminiService.js', 'accurateService.js');

const DEFAULT_ACCURATE_CATEGORIES = [
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

chrome.runtime.onInstalled.addListener(async () => {
  // Initialize default configuration
  const currentConfig = await chrome.storage.local.get([
    'discount1', 'discount2', 'defaultCategory', 'defaultUnit',
    'geminiApiKey', 'geminiModel', 'autoUseGemini', 'accurateCategories',
    'accurateToken', 'accurateSecret', 'accurateHost'
  ]);
  const defaults = {
    discount1: currentConfig.discount1 !== undefined ? currentConfig.discount1 : 0.63,
    discount2: currentConfig.discount2 !== undefined ? currentConfig.discount2 : 0.70,
    defaultCategory: currentConfig.defaultCategory || 'MCB',
    defaultUnit: currentConfig.defaultUnit || 'pcs',
    geminiApiKey: currentConfig.geminiApiKey || '',
    geminiModel: (currentConfig.geminiModel && !currentConfig.geminiModel.includes('2.5') && !currentConfig.geminiModel.includes('1.5'))
      ? currentConfig.geminiModel
      : 'gemini-3.8-flash',
    autoUseGemini: currentConfig.autoUseGemini !== false,
    accurateToken: currentConfig.accurateToken || DEFAULT_ACCURATE_TOKEN,
    accurateSecret: currentConfig.accurateSecret || DEFAULT_ACCURATE_SECRET,
    accurateHost: currentConfig.accurateHost || DEFAULT_ACCURATE_HOST,
    accurateCategories: currentConfig.accurateCategories && currentConfig.accurateCategories.length > 0
      ? currentConfig.accurateCategories
      : DEFAULT_ACCURATE_CATEGORIES,
    recentHistory: []
  };
  await chrome.storage.local.set(defaults);
  console.log('[PushProduct] Service Worker initialized with Accurate Open API & 54 Accurate Categories.');
});

// Listener for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'PUSH_CREATE_ACCURATE_ITEM' || message.action === 'OPEN_AND_FILL_ACCURATE') {
        const itemData = message.payload;
        if (!itemData) {
          sendResponse({ success: false, error: 'Payload data barang kosong.' });
          return;
        }

        // 1. Fetch credentials
        const config = await chrome.storage.local.get(['accurateToken', 'accurateSecret', 'accurateHost']);
        const token = config.accurateToken || DEFAULT_ACCURATE_TOKEN;
        const secret = config.accurateSecret || DEFAULT_ACCURATE_SECRET;
        const host = config.accurateHost || DEFAULT_ACCURATE_HOST;

        // 2. Direct API Push Create to Accurate Online
        let apiResult = null;
        try {
          apiResult = await AccurateService.saveItem({
            accessToken: token,
            signatureSecret: secret,
            hostUrl: host,
            item: itemData
          });
        } catch (apiErr) {
          console.error('[Accurate Direct API Push Error]:', apiErr);
          sendResponse({
            success: false,
            error: `${apiErr.message}`
          });
          return;
        }

        // 3. Save to recentHistory and pendingAccurateItem in storage
        const { recentHistory = [] } = await chrome.storage.local.get('recentHistory');
        const updatedHistory = [
          {
            ...itemData,
            accurateId: apiResult.id,
            isUpdated: apiResult.isUpdated,
            pushedVia: 'OPEN_API',
            timestamp: new Date().toISOString()
          },
          ...recentHistory.filter(h => h.code !== itemData.code)
        ].slice(0, 30);

        await chrome.storage.local.set({
          recentHistory: updatedHistory,
          pendingAccurateItem: itemData
        });

        sendResponse({
          success: true,
          pushedVia: 'OPEN_API',
          isUpdated: apiResult.isUpdated,
          id: apiResult.id,
          message: apiResult.message || `Barang "${itemData.name}" berhasil ${apiResult.isUpdated ? 'diperbarui' : 'dibuat'} di Accurate Online!`
        });
        return;
      } else if (message.action === 'AI_FORMAT_PRODUCT') {
        const { code, description, price, extraContext } = message.payload || {};
        const config = await chrome.storage.local.get([
          'geminiApiKey', 'geminiModel', 'discount1', 'discount2', 'accurateCategories'
        ]);

        if (!config.geminiApiKey || !config.geminiApiKey.trim()) {
          sendResponse({
            success: false,
            needsApiKey: true,
            error: 'API Key Google Gemini belum diatur. Silakan atur di Tab Pengaturan ekstensi.'
          });
          return;
        }

        try {
          const aiResult = await GeminiService.callGeminiFlash({
            apiKey: config.geminiApiKey,
            model: config.geminiModel || 'gemini-3.8-flash',
            code,
            description,
            price,
            extraContext,
            categories: config.accurateCategories || DEFAULT_ACCURATE_CATEGORIES
          });

          // Calculate Pricelist
          const priceData = PushProductParser.calculatePricelist(
            price,
            config.discount1 !== undefined ? config.discount1 : 0.63,
            config.discount2 !== undefined ? config.discount2 : 0.70
          );

          const fullProduct = {
            ...aiResult,
            code: (aiResult.code || code || '').trim().toUpperCase(),
            name: aiResult.name || '',
            brand: 'Siemens',
            category: aiResult.category || (config.accurateCategories?.[0] || 'MCB'),
            itemType: aiResult.itemType || 'Persediaan',
            unit: aiResult.unit || 'pcs',
            sieportalPrice: priceData.sieportalPrice,
            pricelist: priceData.pricelist,
            priceData,
            raw: {
              code,
              description,
              price
            },
            isAIGenerated: true,
            aiModel: config.geminiModel || 'gemini-3.8-flash',
            timestamp: new Date().toISOString()
          };

          sendResponse({ success: true, product: fullProduct });
        } catch (aiErr) {
          console.error('[Gemini Flash Call Error]:', aiErr);
          if (aiErr.message && (aiErr.message.includes('503') || aiErr.message.includes('high demand') || aiErr.message.includes('429'))) {
            const fallback = PushProductParser.transformProduct(code, description, price, {
              discount1: config.discount1 || 0.63,
              discount2: config.discount2 || 0.70
            });
            sendResponse({
              success: true,
              product: {
                ...fallback,
                isAIGenerated: false,
                aiModel: 'Local Engine (Parser Fallback on 503)'
              }
            });
            return;
          }
          sendResponse({ success: false, error: aiErr.message });
        }
      } else if (message.action === 'SYNC_ACCURATE_CATEGORIES') {
        const { categories = [] } = message.payload || {};
        if (categories && categories.length > 0) {
          const { accurateCategories = [] } = await chrome.storage.local.get('accurateCategories');
          const merged = Array.from(new Set([...categories, ...accurateCategories]));
          await chrome.storage.local.set({ accurateCategories: merged });
          console.log(`[PushProduct] Synced ${categories.length} categories from Accurate. Total: ${merged.length}`);
          sendResponse({ success: true, count: merged.length, categories: merged });
        } else {
          sendResponse({ success: false, error: 'Empty categories payload' });
        }
      } else if (message.action === 'GET_ACCURATE_CATEGORIES') {
        const { accurateCategories = DEFAULT_ACCURATE_CATEGORIES } = await chrome.storage.local.get('accurateCategories');
        sendResponse({ success: true, categories: accurateCategories });
      } else if (message.action === 'SAVE_CUSTOM_ACCURATE_CATEGORIES') {
        const { categories = [] } = message.payload || {};
        if (Array.isArray(categories) && categories.length > 0) {
          await chrome.storage.local.set({ accurateCategories: categories });
          sendResponse({ success: true, count: categories.length, categories });
        } else {
          sendResponse({ success: false, error: 'Daftar kategori tidak valid' });
        }
      } else if (message.action === 'TEST_GEMINI_CONNECTION') {
        const { apiKey, model } = message.payload || {};
        try {
          const result = await GeminiService.testGeminiConnection(apiKey, model);
          sendResponse({ success: true, result });
        } catch (testErr) {
          sendResponse({ success: false, error: testErr.message });
        }
      } else if (message.action === 'FETCH_ACCURATE_CATEGORIES_API') {
        const { accessToken, signatureSecret, hostUrl } = message.payload || {};
        try {
          const config = await chrome.storage.local.get(['accurateToken', 'accurateSecret', 'accurateHost']);
          const token = accessToken || config.accurateToken;
          const secret = signatureSecret !== undefined ? signatureSecret : config.accurateSecret;
          const host = hostUrl || config.accurateHost || 'https://zeus.accurate.id/accurate/api';

          const result = await AccurateService.fetchCategories({
            accessToken: token,
            signatureSecret: secret,
            hostUrl: host
          });

          if (result && result.categories && result.categories.length > 0) {
            const { accurateCategories = [] } = await chrome.storage.local.get('accurateCategories');
            const merged = Array.from(new Set([...result.categories, ...accurateCategories]));
            await chrome.storage.local.set({
              accurateCategories: merged,
              accurateToken: token,
              accurateSecret: secret,
              accurateHost: host
            });
            sendResponse({ success: true, count: result.categories.length, categories: merged });
          } else {
            sendResponse({ success: false, error: 'Tidak ditemukan kategori dari Accurate Open API.' });
          }
        } catch (apiErr) {
          sendResponse({ success: false, error: apiErr.message });
        }
      } else if (message.action === 'TEST_ACCURATE_API_CONNECTION') {
        const { accessToken, signatureSecret, hostUrl } = message.payload || {};
        try {
          const result = await AccurateService.testConnection({
            accessToken,
            signatureSecret,
            hostUrl
          });
          sendResponse({ success: true, count: result.count, result });
        } catch (apiErr) {
          sendResponse({ success: false, error: apiErr.message });
        }
      } else if (message.action === 'GET_PENDING_ITEM') {
        const { pendingAccurateItem = null } = await chrome.storage.local.get('pendingAccurateItem');
        sendResponse({ success: true, item: pendingAccurateItem });
      } else if (message.action === 'CLEAR_PENDING_ITEM') {
        await chrome.storage.local.remove('pendingAccurateItem');
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (err) {
      console.error('[PushProduct Background Error]:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
