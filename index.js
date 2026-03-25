/* ============================================================
 *  Time Awareness Plugin for SillyTavern
 *  v1.3.0
 * ============================================================ */

(async function () {

    const MODULE_NAME = 'time_awareness';
    const LOG = '[TimeAwareness]';
    const LANG_GLOBAL_KEY = 'TimeAwarenessLangs';
    const LANG_DEFAULT = 'zh';
    const LANG_AUTO_CHECK_MS = 30000;

    function getExtensionBaseUrl() {
        if (document.currentScript && document.currentScript.src) {
            return document.currentScript.src.substring(0, document.currentScript.src.lastIndexOf('/'));
        }
        const hints = ['Time-Awareness', 'Time Awareness', 'time_awareness', 'time-awareness', 'TimeAwareness'];
        const scripts = Array.from(document.getElementsByTagName('script'));
        for (const s of scripts) {
            const src = s.src || '';
            if (!src) continue;
            if (src.endsWith('/index.js') && hints.some(h => src.includes(`/${h}/`))) {
                return src.substring(0, src.lastIndexOf('/'));
            }
        }
        return '';
    }

    function loadLangScript(lang) {
        return new Promise((resolve) => {
            const base = getExtensionBaseUrl();
            if (!base) {
                resolve(false);
                return;
            }
            const url = `${base}/lang/${lang}.js`;
            const el = document.createElement('script');
            el.src = url;
            el.onload = () => resolve(true);
            el.onerror = () => resolve(false);
            document.head.appendChild(el);
        });
    }

    async function ensureLangLoaded(lang) {
        window[LANG_GLOBAL_KEY] = window[LANG_GLOBAL_KEY] || {};
        if (window[LANG_GLOBAL_KEY][lang]) return true;
        return await loadLangScript(lang);
    }

    function getLangPack(lang) {
        window[LANG_GLOBAL_KEY] = window[LANG_GLOBAL_KEY] || {};
        return window[LANG_GLOBAL_KEY][lang] || {};
    }

    function t(key, vars) {
        const pack = getLangPack(currentLang);
        const fallback = getLangPack(LANG_DEFAULT);
        let str = pack[key] || fallback[key] || key;
        if (vars) {
            str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
        }
        return str;
    }

    function normalizeLang(code) {
        if (!code) return '';
        const c = String(code).toLowerCase();
        if (c.startsWith('zh')) return 'zh';
        return 'en';
    }

    function getSillyTavernLang() {
        const ctx = SillyTavern.getContext();
        const candidates = [
            ctx?.settings?.language,
            ctx?.settings?.uiLanguage,
            ctx?.settings?.locale,
            ctx?.settings?.uiLocale,
            localStorage.getItem('language'),
            localStorage.getItem('selected_language'),
            localStorage.getItem('locale'),
        ];
        for (const v of candidates) {
            if (v) return v;
        }
        return '';
    }

    function resolveLanguageWithSource() {
        const settings = getSettings();
        if (settings.langMode && settings.langMode !== 'auto') {
            return { lang: settings.langMode, source: 'manual' };
        }
        const st = normalizeLang(getSillyTavernLang());
        if (st) return { lang: st, source: 'sillytavern' };
        const nav = normalizeLang(navigator.language || '');
        if (nav) return { lang: nav, source: 'browser' };
        return { lang: LANG_DEFAULT, source: 'default' };
    }

    async function applyLanguage(lang, source = 'auto') {
        await ensureLangLoaded('zh');
        await ensureLangLoaded('en');

        const settings = getSettings();
        currentLang = lang || LANG_DEFAULT;
        settings.langCurrent = currentLang;
        settings.langLastSource = source;
        saveSettings();

        if (uiMounted) {
            await remountUI();
            buildAndInjectPrompt();
        }
        updateLangStatus();
    }

    async function autoDetectLanguage(force = false) {
        const settings = getSettings();
        if (settings.langMode && settings.langMode !== 'auto' && !force) return;

        const info = resolveLanguageWithSource();
        settings.langLastSource = info.source;
        saveSettings();

        if (info.lang !== currentLang || force) {
            await applyLanguage(info.lang, info.source);
        }
        updateLangStatus();
    }

    function startLangWatcher() {
        stopLangWatcher();
        const settings = getSettings();
        if (settings.langMode === 'auto') {
            langWatcher = setInterval(() => {
                autoDetectLanguage(false);
            }, LANG_AUTO_CHECK_MS);
        }
    }

    function stopLangWatcher() {
        if (langWatcher) {
            clearInterval(langWatcher);
            langWatcher = null;
        }
    }

    function updateLangStatus() {
        if (!$('#ta_lang_status').length) return;
        const settings = getSettings();
        const langLabel = currentLang === 'zh' ? t('ui.lang.zh') : t('ui.lang.en');
        let txt = t('status.lang_current', { lang: langLabel });
        if (settings.langMode === 'auto') {
            let srcKey = 'status.lang_source_default';
            if (settings.langLastSource === 'sillytavern') srcKey = 'status.lang_source_sillytavern';
            if (settings.langLastSource === 'browser') srcKey = 'status.lang_source_browser';
            if (settings.langLastSource === 'manual') srcKey = 'status.lang_source_manual';
            txt += `，${t('status.lang_auto_source', { source: t(srcKey) })}`;
        }
        $('#ta_lang_status').text(txt);
    }

    async function remountUI() {
        if ($('#ta_settings').length) $('#ta_settings').remove();
        await initUI();
    }

    // ======================== 默认设置 ========================
    const defaultSettings = Object.freeze({
        enabled: true,
        injectTimestamp: true,
        injectGap: true,
        injectPeriod: true,
        injectDayType: true,
        injectHoliday: true,
        injectLunarFestival: true,
        promptPlacement: 'system',
        anniversaries: [],
        autoSpecialDayEnabled: false,
        autoIdleEnabled: false,
        idleThresholdHours: 4,
        idleCheckIntervalMinutes: 30,
        idleTriggerProbability: 15,
        autoMessageCharacters: [],
        injectCharacters: [],
        specialDayTriggered: {},
        weatherEnabled: false,
        weatherLocationText: '',
        weatherLat: '',
        weatherLon: '',
        weatherTimezone: 'auto',
        weatherUpdateMinutes: 30,
        weatherIncludeCurrent: true,
        weatherIncludeAirQuality: true,
        weatherIncludeForecast: true,
        weatherForecastDays: 3,
        nagerEnabled: true,
        nagerAutoDetect: true,
        nagerCountry: 'CN',
        nagerCountryName: 'China',
        nagerLastAutoCountry: '',
        nagerLastAutoTimezone: '',
        langMode: 'auto',
        langCurrent: 'zh',
        langLastSource: '',
        injectionMode: 'macro',
        macroName: 'time_awareness',
    });

    // ======================== 运行时状态 ========================
    let chineseDaysLoaded = false;
    let lastUserMessageTime = null;
    let idleTriggeredThisPeriod = false;
    let isAutoGenerating = false;
    let mainTimerHandle = null;
    let lastIdleRollTime = 0;
    let weatherCache = {
        lastFetch: 0,
        current: null,
        daily: null,
        air: null,
        ok: false,
        error: '',
        airError: '',
    };
    let weatherFetching = false;
    let nagerCache = {
        lastFetch: 0,
        year: 0,
        country: '',
        holidays: [],
        ok: false,
        error: '',
    };
    let nagerCountriesCache = {
        lastFetch: 0,
        list: [],
        ok: false,
        error: '',
    };
    let nagerDetecting = false;
    let lastAutoSaveFailed = false;
    let lastAutoSaveError = '';
    let lastAutoGenError = '';
    let currentLang = LANG_DEFAULT;
    let langWatcher = null;
    let uiMounted = false;
    let registeredMacroName = '';

    // ======================== 设置工具 ========================
    function getSettings() {
        const ctx = SillyTavern.getContext();
        if (!ctx.extensionSettings[MODULE_NAME]) {
            ctx.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        }
        const s = ctx.extensionSettings[MODULE_NAME];
        for (const key of Object.keys(defaultSettings)) {
            if (s[key] === undefined) {
                s[key] = typeof defaultSettings[key] === 'object' && defaultSettings[key] !== null
                    ? structuredClone(defaultSettings[key])
                    : defaultSettings[key];
            }
        }
        return s;
    }

    function saveSettings() {
        SillyTavern.getContext().saveSettingsDebounced();
    }

    function sanitizeMacroName(name) {
        const raw = String(name || '').trim().toLowerCase();
        if (!raw) return 'time_awareness';
        const safe = raw
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return safe || 'time_awareness';
    }

    function getMacroToken(name) {
        return `{{${name}}}`;
    }

    function unregisterTimeMacro(name) {
        const ctx = SillyTavern.getContext();
        if (!name) return;

        try {
            if (ctx.macros && ctx.macros.registry && typeof ctx.macros.registry.unregisterMacro === 'function') {
                ctx.macros.registry.unregisterMacro(name);
            }
        } catch (_) { }

        try {
            if (typeof ctx.unregisterMacro === 'function') {
                ctx.unregisterMacro(name);
            }
        } catch (_) { }
    }

    function registerTimeMacro(name) {
        const ctx = SillyTavern.getContext();
        let ok = false;

        try {
            if (ctx.macros && typeof ctx.macros.register === 'function') {
                ctx.macros.register(name, {
                    handler: () => buildTimePromptText(),
                    description: 'Time Awareness dynamic prompt',
                });
                ok = true;
            }
        } catch (e) {
            console.warn(LOG, 'register via macros.register failed:', e);
        }

        if (!ok) {
            try {
                if (typeof ctx.registerMacro === 'function') {
                    ctx.registerMacro(name, () => buildTimePromptText());
                    ok = true;
                }
            } catch (e) {
                console.warn(LOG, 'register via registerMacro failed:', e);
            }
        }

        return ok;
    }

    function refreshMacroRegistration(force = false) {
        const settings = getSettings();
        const targetName = sanitizeMacroName(settings.macroName || 'time_awareness');
        let changed = false;

        if (settings.macroName !== targetName) {
            settings.macroName = targetName;
            changed = true;
        }

        if (registeredMacroName && (force || registeredMacroName !== targetName)) {
            unregisterTimeMacro(registeredMacroName);
            registeredMacroName = '';
        }

        if (!registeredMacroName) {
            const ok = registerTimeMacro(targetName);
            if (ok) {
                registeredMacroName = targetName;
            }
        }

        if (changed) saveSettings();
        updateMacroStatus();
    }

    function updateMacroStatus() {
        const settings = getSettings();
        const macroName = sanitizeMacroName(settings.macroName || 'time_awareness');
        const token = getMacroToken(macroName);

        if ($('#ta_macro_token_preview').length) {
            $('#ta_macro_token_preview').text(token);
        }

        if (!$('#ta_macro_status').length) return;

        if (settings.injectionMode === 'macro') {
            $('#ta_macro_status').text(`宏模式已启用：请在预设/世界书中写入 ${token}`);
        } else {
            $('#ta_macro_status').text('当前为旧注入模式（Extension Prompt）');
        }
    }

    // ======================== 加载 chinese-days ========================
    function loadChineseDays() {
        return new Promise((resolve) => {
            if (window.chineseDays) {
                chineseDaysLoaded = true;
                console.log(LOG, 'chinese-days already present');
                resolve(true);
                return;
            }
            const el = document.createElement('script');
            el.src = 'https://cdn.jsdelivr.net/npm/chinese-days';
            el.onload = () => {
                chineseDaysLoaded = !!window.chineseDays;
                console.log(LOG, chineseDaysLoaded ? 'chinese-days loaded ✓' : 'chinese-days object missing');
                resolve(chineseDaysLoaded);
            };
            el.onerror = () => {
                console.warn(LOG, 'CDN unreachable – holiday detection disabled');
                chineseDaysLoaded = false;
                resolve(false);
            };
            document.head.appendChild(el);
        });
    }

    // ======================== 时间工具 ========================
    function pad2(n) { return String(n).padStart(2, '0'); }
    function fmtDate(d) { return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日`; }
    function fmtTime(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
    function fmtISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
    function fmtMMDD(d) { return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

    function weekdayName(day) {
        const keys = ['weekday.sun', 'weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat'];
        return t(keys[day] || 'weekday.sun');
    }

    function timePeriod(h, m) {
        const tmin = h * 60 + m;
        if (tmin < 360) return t('period.dawn');
        if (tmin < 540) return t('period.morning');
        if (tmin < 690) return t('period.forenoon');
        if (tmin < 810) return t('period.noon');
        if (tmin < 1050) return t('period.afternoon');
        if (tmin < 1140) return t('period.evening');
        if (tmin < 1380) return t('period.night');
        return t('period.late');
    }

    function calcGap(fromMs, toMs) {
        if (!fromMs || toMs <= fromMs) return null;
        const totalMin = Math.floor((toMs - fromMs) / 60000);
        return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
    }

    function formatGapText(gap) {
        if (!gap) return '';
        let s = '';
        if (gap.hours > 0) s += t('time.hours', { n: gap.hours });
        if (gap.minutes > 0) s += t('time.minutes', { n: gap.minutes });
        return s;
    }

    function escHtml(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&')
            .replace(/"/g, '"')
            .replace(/</g, '<')
            .replace(/>/g, '>');
    }

    // ======================== 节假日与日期信息 ========================
    function getDayInfo(iso) {
        const result = {
            weekday: '',
            typeLabel: '',
            holidayName: '',
            holidayDay: '',
            lunarFestivals: [],
        };

        const d = new Date(iso);
        result.weekday = weekdayName(d.getDay());
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;

        if (chineseDaysLoaded && window.chineseDays) {
            const cd = window.chineseDays;
            try {
                const isWork = cd.isWorkday(iso);
                const isHol = cd.isHoliday(iso);
                const isLieu = cd.isInLieu ? cd.isInLieu(iso) : false;

                if (isLieu) {
                    result.typeLabel = t('daytype.lieu');
                } else if (isHol) {
                    result.typeLabel = t('daytype.holiday');
                } else if (isWork) {
                    result.typeLabel = t('daytype.workday');
                } else {
                    result.typeLabel = t('daytype.weekend');
                }

                if (cd.getDayDetail) {
                    const detail = cd.getDayDetail(iso);
                    if (detail && detail.name && detail.name.includes(',')) {
                        const parts = detail.name.split(',');
                        result.holidayName = parts[1] || parts[0];
                        if (parts[2]) result.holidayDay = parts[2];
                    }
                }

                if (cd.getLunarFestivals) {
                    const fests = cd.getLunarFestivals(iso);
                    if (Array.isArray(fests) && fests.length > 0) {
                        result.lunarFestivals = fests.map(f => {
                            if (typeof f === 'string') return f;
                            if (f && f.name) return f.name;
                            if (f && f.desc) return f.desc;
                            return '';
                        }).filter(Boolean);
                    }
                }
            } catch (e) {
                console.warn(LOG, 'chinese-days query error:', e);
                result.typeLabel = isWeekend ? t('daytype.weekend') : t('daytype.workday');
            }
        } else {
            result.typeLabel = isWeekend ? t('daytype.weekend') : t('daytype.workday');
        }

        return result;
    }

    // ======================== 纪念日检查 ========================
    function matchAnniversaries(now) {
        const settings = getSettings();
        const mmdd = fmtMMDD(now);
        const hits = [];
        for (const ann of settings.anniversaries) {
            if (!ann.enabled || !ann.name || ann.date !== mmdd) continue;
            let text = ann.name;
            if (ann.year) {
                const diff = now.getFullYear() - parseInt(ann.year);
                if (diff > 0) text += `（第${diff}年）`;
            }
            hits.push(text);
        }
        return hits;
    }

    function parseDmsToDecimal(text) {
        if (!text) return null;
        const raw = String(text).trim();
        if (!raw) return null;

        const hasSouthWest = /[SW西南]/i.test(raw);
        const hasNorthEast = /[NE东北]/i.test(raw);
        const nums = raw.match(/-?\d+(?:\.\d+)?/g);
        if (!nums || nums.length === 0) return null;

        const deg = parseFloat(nums[0]);
        const min = nums[1] ? parseFloat(nums[1]) : 0;
        const sec = nums[2] ? parseFloat(nums[2]) : 0;
        if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;

        let dec = Math.abs(deg) + min / 60 + sec / 3600;
        let sign = deg < 0 ? -1 : 1;
        if (hasSouthWest) sign = -1;
        if (hasNorthEast) sign = 1;

        dec = dec * sign;
        return Number(dec.toFixed(6));
    }

    // ======================== 天气工具 ========================
    function weatherCodeText(code) {
        const c = Number(code);
        if (c === 0) return t('weather.sunny');
        if (c >= 1 && c <= 3) return t('weather.partly_cloudy');
        if (c === 45 || c === 48) return t('weather.fog');
        if (c >= 51 && c <= 55) return t('weather.drizzle');
        if (c === 56 || c === 57) return t('weather.freezing_drizzle');
        if (c >= 61 && c <= 65) return t('weather.rain');
        if (c === 66 || c === 67) return t('weather.freezing_rain');
        if (c >= 71 && c <= 75) return t('weather.snow');
        if (c === 77) return t('weather.snow_grains');
        if (c >= 80 && c <= 82) return t('weather.showers');
        if (c === 85 || c === 86) return t('weather.snow_showers');
        if (c === 95) return t('weather.thunder');
        if (c === 96 || c === 99) return t('weather.thunder_hail');
        return t('weather.unknown');
    }

    function aqiLevel(aqi) {
        if (aqi === null || aqi === undefined || isNaN(aqi)) return '';
        if (aqi <= 20) return t('aqi.excellent');
        if (aqi <= 40) return t('aqi.good');
        if (aqi <= 60) return t('aqi.moderate');
        if (aqi <= 80) return t('aqi.fair');
        if (aqi <= 100) return t('aqi.poor');
        return t('aqi.very_poor');
    }

    function fmtNum(n, digits = 1) {
        if (n === null || n === undefined || isNaN(n)) return null;
        return Number(n).toFixed(digits);
    }

    async function searchLocation(query) {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=zh&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data || !Array.isArray(data.results)) return [];
        return data.results;
    }

    function formatGeoLabel(r) {
        const parts = [];
        if (r.name) parts.push(r.name);
        if (r.admin3) parts.push(r.admin3);
        if (r.admin2) parts.push(r.admin2);
        if (r.admin1) parts.push(r.admin1);
        if (r.country) parts.push(r.country);
        return parts.filter(Boolean).join(' · ');
    }

    function updateWeatherStatus() {
        const settings = getSettings();
        if (!$('#ta_weather_status').length) return;

        if (!settings.weatherLat || !settings.weatherLon) {
            $('#ta_weather_status').text(t('status.weather_not_set'));
            return;
        }

        let txt = t('status.weather_located', {
            location: settings.weatherLocationText || '（已保存坐标）',
            lat: settings.weatherLat,
            lon: settings.weatherLon,
        });

        if (weatherCache.ok && weatherCache.lastFetch) {
            const tme = new Date(weatherCache.lastFetch);
            txt += `，${t('status.weather_last_update', { time: fmtTime(tme) })}`;
        } else if (weatherCache.error) {
            txt += `，${t('status.weather_failed', { error: weatherCache.error })}`;
        }

        if (weatherCache.airError) {
            txt += `，${t('status.weather_air_failed', { error: weatherCache.airError })}`;
        }

        $('#ta_weather_status').text(txt);
    }

    async function updateWeatherCache(force = false) {
        const settings = getSettings();
        if (!settings.weatherEnabled) return;
        if (!settings.weatherLat || !settings.weatherLon) return;
        if (weatherFetching) return;

        const lat = Number(settings.weatherLat);
        const lon = Number(settings.weatherLon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) {
            weatherCache.ok = false;
            weatherCache.error = t('toast.coord_invalid');
            updateWeatherStatus();
            return;
        }

        const now = Date.now();
        const intervalMs = Math.max(5, Number(settings.weatherUpdateMinutes || 30)) * 60000;
        if (!force && now - weatherCache.lastFetch < intervalMs) return;

        weatherFetching = true;
        try {
            const forecastDays = Math.min(Math.max(parseInt(settings.weatherForecastDays || 3), 1), 7);
            const currentVars = settings.weatherIncludeCurrent
                ? 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
                : '';
            const dailyVars = settings.weatherIncludeForecast
                ? 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
                : '';

            const params = new URLSearchParams({
                latitude: String(lat),
                longitude: String(lon),
                timezone: 'auto',
                temperature_unit: 'celsius',
                wind_speed_unit: 'kmh',
                precipitation_unit: 'mm',
                forecast_days: String(forecastDays),
            });
            if (currentVars) params.set('current', currentVars);
            if (dailyVars) params.set('daily', dailyVars);

            const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data || data.error) {
                throw new Error(data && data.reason ? data.reason : 'weather api error');
            }

            weatherCache.current = data.current || null;
            weatherCache.daily = data.daily || null;
            weatherCache.current_units = data.current_units || null;
            weatherCache.daily_units = data.daily_units || null;

            if (settings.weatherIncludeCurrent && !weatherCache.current) {
                throw new Error('missing current weather');
            }
            if (settings.weatherIncludeForecast && !weatherCache.daily) {
                throw new Error('missing forecast data');
            }

            weatherCache.air = null;
            weatherCache.airError = '';

            if (settings.weatherIncludeAirQuality) {
                const aqParams = new URLSearchParams({
                    latitude: String(lat),
                    longitude: String(lon),
                    timezone: 'auto',
                    current: 'european_aqi,pm2_5,pm10',
                });
                const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${aqParams.toString()}`;
                const aqRes = await fetch(aqUrl);
                const aqData = await aqRes.json();
                if (aqData && !aqData.error) {
                    weatherCache.air = aqData;
                } else {
                    weatherCache.airError = aqData && aqData.reason ? aqData.reason : 'air api error';
                }
            }

            weatherCache.lastFetch = Date.now();
            weatherCache.ok = true;
            weatherCache.error = '';
        } catch (e) {
            console.warn(LOG, 'Weather fetch error:', e);
            weatherCache.ok = false;
            weatherCache.error = String(e && e.message ? e.message : e || '');
        } finally {
            weatherFetching = false;
            updateWeatherStatus();
        }
    }

    function buildWeatherLines() {
        const settings = getSettings();
        if (!settings.weatherEnabled) return [];
        if (!weatherCache.ok) return [];

        const lines = [];

        if (settings.weatherIncludeCurrent && weatherCache.current) {
            const c = weatherCache.current;
            const text = [];
            const wt = weatherCodeText(c.weather_code);
            if (wt) text.push(wt);
            if (c.temperature_2m !== undefined) text.push(`${fmtNum(c.temperature_2m, 1)}°C`);
            if (c.apparent_temperature !== undefined) text.push(`${t('ui.weather.current')} ${fmtNum(c.apparent_temperature, 1)}°C`);
            if (c.relative_humidity_2m !== undefined) text.push(`湿度${fmtNum(c.relative_humidity_2m, 0)}%`);
            if (c.wind_speed_10m !== undefined) text.push(`风速${fmtNum(c.wind_speed_10m, 1)} km/h`);
            if (text.length > 0) lines.push(t('prompt.weather_current', { text: text.join('，') }));
        }

        if (settings.weatherIncludeAirQuality && weatherCache.air && weatherCache.air.current) {
            const a = weatherCache.air.current;
            const aqi = a.european_aqi;
            const parts = [];
            if (aqi !== undefined && aqi !== null) {
                parts.push(`AQI ${fmtNum(aqi, 0)}${aqiLevel(aqi)}`);
            }
            if (a.pm2_5 !== undefined) parts.push(`PM2.5 ${fmtNum(a.pm2_5, 1)}`);
            if (a.pm10 !== undefined) parts.push(`PM10 ${fmtNum(a.pm10, 1)}`);
            if (parts.length > 0) lines.push(t('prompt.weather_air', { text: parts.join('，') }));
        }

        if (settings.weatherIncludeForecast && weatherCache.daily && weatherCache.daily.time) {
            const d = weatherCache.daily;
            const n = Math.min(parseInt(settings.weatherForecastDays || 3), d.time.length);
            const items = [];
            for (let i = 0; i < n; i++) {
                const date = new Date(d.time[i]);
                const dayName = weekdayName(date.getDay());
                const code = d.weather_code ? d.weather_code[i] : null;
                const wt = code !== null ? weatherCodeText(code) : '';
                const tmin = d.temperature_2m_min ? d.temperature_2m_min[i] : null;
                const tmax = d.temperature_2m_max ? d.temperature_2m_max[i] : null;
                const pop = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
                let s = `${dayName} ${wt || ''}`.trim();
                if (tmin !== null && tmax !== null) s += ` ${fmtNum(tmin, 1)}~${fmtNum(tmax, 1)}°C`;
                if (pop !== null && pop !== undefined) s += ` ${t('weather.precip')}${fmtNum(pop, 0)}%`;
                items.push(s.trim());
            }
            if (items.length > 0) lines.push(t('prompt.weather_forecast', { text: items.join('；') }));
        }

        return lines;
    }

    function applyExtensionPrompt(text) {
        const ctx = SillyTavern.getContext();
        const settings = getSettings();
        let position = 1;
        if (settings.promptPlacement === 'world') position = 2;
        if (settings.promptPlacement === 'prefill') position = 3;

        const isStored = () => {
            const store = ctx.extensionPrompts;
            if (!store) return false;
            const p = store[MODULE_NAME];
            if (!p) return false;
            if (typeof p === 'string') return p === text;
            if (typeof p === 'object') {
                if (p.value !== undefined) return p.value === text;
                if (p.prompt !== undefined) return p.prompt === text;
            }
            return false;
        };

        const attempts = [];

        if (typeof ctx.setExtensionPrompt === 'function') {
            attempts.push(() => ctx.setExtensionPrompt(MODULE_NAME, text, position, 0));
            attempts.push(() => ctx.setExtensionPrompt(MODULE_NAME, text, 0, position));
            attempts.push(() => ctx.setExtensionPrompt(MODULE_NAME, text, position));
            attempts.push(() => ctx.setExtensionPrompt(MODULE_NAME, text));
        }

        for (const fn of attempts) {
            try {
                fn();
                if (isStored()) return;
            } catch (_) { }
        }

        try {
            if (ctx.extensionPrompts && typeof ctx.extensionPrompts === 'object') {
                ctx.extensionPrompts[MODULE_NAME] = { value: text, position, depth: 0 };
            }
        } catch (_) { }
    }

    // ======================== Nager.Date ========================
    function getEffectiveCountryCode() {
        const settings = getSettings();
        const code = settings.nagerCountry || 'CN';
        return String(code).toUpperCase();
    }

    async function fetchNagerCountries(force = false) {
        const ttl = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        if (!force && nagerCountriesCache.ok && now - nagerCountriesCache.lastFetch < ttl) {
            return nagerCountriesCache.list;
        }
        try {
            const res = await fetch('https://date.nager.at/api/v3/AvailableCountries');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('bad data');
            data.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en'));
            nagerCountriesCache.list = data;
            nagerCountriesCache.ok = true;
            nagerCountriesCache.error = '';
            nagerCountriesCache.lastFetch = Date.now();
        } catch (e) {
            nagerCountriesCache.ok = false;
            nagerCountriesCache.error = String(e && e.message ? e.message : e || '');
        }
        return nagerCountriesCache.list;
    }

    function renderNagerCountriesSelect() {
        const settings = getSettings();
        const $sel = $('#ta_nager_country_select');
        if (!$sel.length) return;

        $sel.empty();

        if (!nagerCountriesCache.ok || !nagerCountriesCache.list.length) {
            $sel.append(`<option value="">${t('status.nager_countries_not_loaded')}</option>`);
            return;
        }

        nagerCountriesCache.list.forEach((c) => {
            const code = escHtml(c.countryCode);
            const name = escHtml(c.name);
            $sel.append(`<option value="${code}">${name} (${code})</option>`);
        });

        const current = (settings.nagerCountry || '').toUpperCase();
        if (current) $sel.val(current);
    }

    function updateNagerStatus() {
        const settings = getSettings();
        if (!$('#ta_nager_status').length) return;

        const code = getEffectiveCountryCode();
        let txt = t('status.nager_current_country', { country: settings.nagerCountryName || code || 'N/A' });

        if (settings.nagerLastAutoTimezone) {
            txt += `，${t('status.nager_timezone', { tz: settings.nagerLastAutoTimezone })}`;
        }

        if (nagerCache.error) {
            txt += `，${t('status.nager_holiday_failed', { error: nagerCache.error })}`;
        }

        $('#ta_nager_status').text(txt);
    }

    async function detectCountryByTimezone() {
        const settings = getSettings();
        if (!settings.nagerAutoDetect) return;
        if (nagerDetecting) return;

        nagerDetecting = true;
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (!tz) return;

            const url = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const code = data && data.country_code ? String(data.country_code).toUpperCase() : '';

            if (!code) return;

            settings.nagerCountry = code;
            settings.nagerLastAutoCountry = code;
            settings.nagerLastAutoTimezone = tz;

            const match = nagerCountriesCache.list.find(x => x.countryCode === code);
            settings.nagerCountryName = match ? match.name : settings.nagerCountryName;

            saveSettings();
            $('#ta_nager_country_code').val(code);
            renderNagerCountriesSelect();
            updateNagerStatus();
            await updateNagerCache(true);
            buildAndInjectPrompt();
        } catch (e) {
            console.warn(LOG, 'Country detect failed:', e);
        } finally {
            nagerDetecting = false;
        }
    }

    async function updateNagerCache(force = false) {
        const settings = getSettings();
        if (!settings.nagerEnabled) return;

        const country = getEffectiveCountryCode();
        if (!country || country === 'CN') {
            nagerCache.ok = false;
            nagerCache.error = '';
            return;
        }

        const year = new Date().getFullYear();
        const ttl = 6 * 60 * 60 * 1000;
        const now = Date.now();

        if (!force && nagerCache.ok && nagerCache.country === country && nagerCache.year === year && now - nagerCache.lastFetch < ttl) {
            return;
        }

        try {
            const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('bad data');

            nagerCache.holidays = data;
            nagerCache.country = country;
            nagerCache.year = year;
            nagerCache.ok = true;
            nagerCache.error = '';
            nagerCache.lastFetch = Date.now();
        } catch (e) {
            nagerCache.ok = false;
            nagerCache.error = String(e && e.message ? e.message : e || '');
        } finally {
            updateNagerStatus();
        }
    }

    function getNagerDayInfo(iso) {
        if (!nagerCache.ok || !Array.isArray(nagerCache.holidays)) {
            return { ready: false, isPublicHoliday: false };
        }
        const hit = nagerCache.holidays.find(h => h.date === iso);
        if (!hit) {
            return { ready: true, isPublicHoliday: false };
        }
        return {
            ready: true,
            isPublicHoliday: true,
            localName: hit.localName || '',
            name: hit.name || '',
            types: Array.isArray(hit.types) ? hit.types : [],
            global: hit.global,
            counties: Array.isArray(hit.counties) ? hit.counties : [],
        };
    }

    // ======================== 构建并注入时间 Prompt ========================
    function buildTimePromptText() {
        const ctx = SillyTavern.getContext();
        const settings = getSettings();

        if (!settings.enabled || !ctx.getCurrentChatId()) {
            return '';
        }

        if (!isInjectAllowed(ctx)) {
            return '';
        }

        updateWeatherCache();

        const now = new Date();
        const iso = fmtISO(now);
        const lines = [];

        if (settings.injectTimestamp) {
            lines.push(t('prompt.current_time', { date: fmtDate(now), time: fmtTime(now) }));
        }

        if (settings.injectPeriod) {
            lines.push(t('prompt.time_period', { period: timePeriod(now.getHours(), now.getMinutes()) }));
        }

        if (settings.injectDayType || settings.injectHoliday || settings.injectLunarFestival) {
            const countryCode = getEffectiveCountryCode();
            const useNager = settings.nagerEnabled && countryCode && countryCode !== 'CN';

            if (useNager) {
                updateNagerCache();

                const d = new Date(iso);
                const weekday = weekdayName(d.getDay());
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const info = getNagerDayInfo(iso);

                if (settings.injectDayType) {
                    let dayStr = t('prompt.day_line', {
                        weekday,
                        type: isWeekend ? t('daytype.weekend') : t('daytype.workday'),
                        holiday: ''
                    });
                    if (info.ready) {
                        if (info.isPublicHoliday) dayStr += t('prompt.nager_daytype_holiday');
                    } else {
                        dayStr += t('prompt.nager_daytype_unknown');
                    }
                    lines.push(dayStr);
                }

                if (settings.injectHoliday) {
                    if (!info.ready) {
                        lines.push(t('prompt.nager_today_unknown'));
                    } else if (info.isPublicHoliday) {
                        let en = '';
                        if (info.name && info.name !== info.localName) en = t('prompt.nager_en_sep', { name: info.name });
                        let types = '';
                        if (info.types && info.types.length > 0) types = t('prompt.nager_types', { types: info.types.join(', ') });
                        let counties = '';
                        if (info.global === false && info.counties && info.counties.length > 0) counties = t('prompt.nager_counties', { counties: info.counties.join(', ') });

                        lines.push(t('prompt.nager_today_holiday', {
                            name: info.localName || 'Unknown',
                            en,
                            types,
                            counties
                        }));
                    } else {
                        lines.push(t('prompt.nager_today_none'));
                    }

                    if (settings.nagerCountryName || countryCode) {
                        const cn = settings.nagerCountryName || countryCode;
                        lines.push(t('prompt.nager_region', { name: cn, code: countryCode }));
                    }
                }
            } else {
                const info = getDayInfo(iso);

                if (settings.injectDayType) {
                    let holiday = '';
                    if (settings.injectHoliday && info.holidayName) {
                        let day = info.holidayDay ? t('prompt.holiday_day', { day: info.holidayDay }) : '';
                        holiday = t('prompt.holiday_suffix', { name: info.holidayName, day });
                    }
                    lines.push(t('prompt.day_line', { weekday: info.weekday, type: info.typeLabel, holiday }));
                } else if (settings.injectHoliday && info.holidayName) {
                    let day = info.holidayDay ? t('prompt.holiday_day', { day: info.holidayDay }) : '';
                    lines.push(t('prompt.today_holiday', { name: info.holidayName, day }));
                }

                if (settings.injectLunarFestival && info.lunarFestivals.length > 0) {
                    lines.push(t('prompt.lunar', { names: info.lunarFestivals.join('、') }));
                }
            }
        }

        if (settings.injectGap && lastUserMessageTime) {
            const gap = calcGap(lastUserMessageTime, now.getTime());
            if (gap && (gap.hours > 0 || gap.minutes > 0)) {
                lines.push(t('prompt.gap', { gap: formatGapText(gap) }));
            }
        }

        const weatherLines = buildWeatherLines();
        if (weatherLines.length > 0) {
            lines.push(t('prompt.weather_info'));
            lines.push(...weatherLines.map(x => x.replace(/^.+?:\s*/, '')));
        }

        const annivs = matchAnniversaries(now);
        for (const a of annivs) {
            lines.push(t('prompt.anniv', { text: a }));
        }

        const prompt = lines.length > 0 ? `${t('prompt.header')}\n${lines.join('\n')}` : '';
        return prompt;
    }

    function buildAndInjectPrompt() {
        const settings = getSettings();
        const prompt = buildTimePromptText();

        if (settings.injectionMode === 'macro') {
            applyExtensionPrompt('');
            return prompt;
        }

        applyExtensionPrompt(prompt);
        return prompt;
    }

    // ======================== 用户消息追踪 ========================
    function onUserMessage() {
        lastUserMessageTime = Date.now();
        idleTriggeredThisPeriod = false;
        try {
            const meta = SillyTavern.getContext().chatMetadata;
            if (meta) {
                meta[`${MODULE_NAME}_lastUserMsgTime`] = lastUserMessageTime;
                SillyTavern.getContext().saveMetadataDebounced();
            }
        } catch (_) { }
    }

    function restoreLastUserMsgTime() {
        const ctx = SillyTavern.getContext();
        const meta = ctx.chatMetadata;
        if (meta && meta[`${MODULE_NAME}_lastUserMsgTime`]) {
            lastUserMessageTime = meta[`${MODULE_NAME}_lastUserMsgTime`];
            return;
        }
        const chatArr = ctx.chat;
        if (chatArr && chatArr.length > 0) {
            for (let i = chatArr.length - 1; i >= 0; i--) {
                if (chatArr[i].is_user && chatArr[i].send_date) {
                    const t = new Date(chatArr[i].send_date).getTime();
                    if (!isNaN(t) && t > 0) {
                        lastUserMessageTime = t;
                        return;
                    }
                }
            }
        }
        lastUserMessageTime = null;
    }

    function normalizeGenerationResult(result) {
        if (!result) return '';
        if (typeof result === 'string') return result.trim();

        const candidates = [
            result.text,
            result.content,
            result.message,
            result.output,
            result.result,
            result.response,
            result?.message?.content,
            result?.message?.text,
            result?.data?.content,
            result?.data?.message,
            result?.choices?.[0]?.message?.content,
            result?.choices?.[0]?.text,
        ];

        for (const c of candidates) {
            if (typeof c === 'string' && c.trim()) return c.trim();
        }

        return '';
    }

    function isChatVisible() {
        return $('#chat').length > 0 && $('#chat').is(':visible');
    }

    function safeAddMessage(ctx, msg) {
        try {
            if (Array.isArray(ctx.chat)) {
                ctx.chat.push(msg);
                const idx = ctx.chat.length - 1;

                try {
                    if (typeof ctx.updateMessageBlock === 'function') {
                        ctx.updateMessageBlock(idx);
                    }
                } catch (_) { }

                try {
                    if (typeof ctx.printMessages === 'function') {
                        ctx.printMessages();
                    }
                } catch (_) { }

                return true;
            }
        } catch (_) { }

        try {
            if (typeof ctx.addOneMessage === 'function') {
                ctx.addOneMessage(msg, { scroll: true });
                return true;
            }
        } catch (_) { }

        return false;
    }

    function safeSaveChatDebounced(ctx) {
        try {
            if (typeof ctx.saveChatDebounced === 'function') ctx.saveChatDebounced();
        } catch (_) { }
    }

    async function safeSaveChat(ctx) {
        try {
            if (typeof ctx.saveChat === 'function') await ctx.saveChat();
            return true;
        } catch (e) {
            return e;
        } finally {
            safeSaveChatDebounced(ctx);
        }
    }

    function safeSaveMetadataDebounced(ctx) {
        try {
            if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
        } catch (_) { }
    }

    function getPendingMessages(ctx) {
        const meta = ctx.chatMetadata || (ctx.chatMetadata = {});
        const key = `${MODULE_NAME}_pendingAutoMessages`;
        if (!Array.isArray(meta[key])) meta[key] = [];
        return meta[key];
    }

    function enqueuePendingMessage(msg) {
        const ctx = SillyTavern.getContext();
        const list = getPendingMessages(ctx);
        list.push(msg);
        safeSaveMetadataDebounced(ctx);
    }

    function flushPendingMessages() {
        const ctx = SillyTavern.getContext();
        if (!ctx.getCurrentChatId()) return;

        const list = getPendingMessages(ctx);
        if (!list.length) return;

        while (list.length) {
            const msg = list.shift();
            const ok = safeAddMessage(ctx, msg);
            if (!ok) {
                list.unshift(msg);
                break;
            }
        }

        safeSaveChat(ctx);
        safeSaveMetadataDebounced(ctx);
    }

    // ======================== 自动消息：公共发送 ========================
    async function sendAsCharacter(quietPromptText) {
        if (isAutoGenerating) return false;
        const ctx = SillyTavern.getContext();
        if (!ctx.getCurrentChatId()) return false;
        if (ctx.characterId === undefined && ctx.characterId !== 0) return false;

        lastAutoSaveFailed = false;
        lastAutoSaveError = '';
        lastAutoGenError = '';

        isAutoGenerating = true;
        try {
            const result = await ctx.generateQuietPrompt({
                quietPrompt: quietPromptText,
            });

            const text = normalizeGenerationResult(result);
            if (!text) {
                lastAutoGenError = t('error.empty_gen');
                return false;
            }

            const charName = ctx.name2 || 'Character';
            const msg = {
                name: charName,
                is_user: false,
                is_system: false,
                send_date: new Date().toISOString(),
                mes: text,
                extra: { isAutoMessage: true, fromPlugin: MODULE_NAME },
            };

            if (!isChatVisible()) {
                enqueuePendingMessage(msg);
                return true;
            }

            const added = safeAddMessage(ctx, msg);
            if (!added) {
                enqueuePendingMessage(msg);
                return true;
            }

            const saveResult = await safeSaveChat(ctx);
            if (saveResult !== true) {
                lastAutoSaveFailed = true;
                lastAutoSaveError = String(saveResult && saveResult.message ? saveResult.message : saveResult || '');
            }

            console.log(LOG, 'Auto message inserted');
            return true;
        } catch (e) {
            lastAutoGenError = String(e && e.message ? e.message : e || '');
            console.error(LOG, 'Auto generation failed:', e);
            return false;
        } finally {
            isAutoGenerating = false;
        }
    }

    // ======================== 自动消息：纪念日 ========================
    async function checkSpecialDay() {
        const settings = getSettings();
        if (!settings.autoSpecialDayEnabled) return;

        const ctx = SillyTavern.getContext();
        if (!ctx.getCurrentChatId()) return;
        if (ctx.characterId === undefined) return;

        if (!isCharacterAllowed(ctx)) return;

        const now = new Date();
        const mmdd = fmtMMDD(now);
        const todayISO = fmtISO(now);

        for (const ann of settings.anniversaries) {
            if (!ann.enabled || !ann.name || ann.date !== mmdd) continue;

            const key = `${todayISO}:${ann.name}`;
            if (settings.specialDayTriggered[key]) continue;

            let desc = ann.name;
            if (ann.year) {
                const diff = now.getFullYear() - parseInt(ann.year);
                if (diff > 0) desc += `（第${diff}年）`;
            }

            const charName = ctx.name2 || '角色';
            const prompt = t('auto.special_prompt', { charName, desc });

            const ok = await sendAsCharacter(prompt);
            if (ok) {
                settings.specialDayTriggered[key] = true;
                saveSettings();
            }
        }
    }

    // ======================== 自动消息：闲置问候 ========================
    async function checkIdleMessage() {
        const settings = getSettings();
        if (!settings.autoIdleEnabled) return;
        if (idleTriggeredThisPeriod) return;
        if (!lastUserMessageTime) return;

        const ctx = SillyTavern.getContext();
        if (!ctx.getCurrentChatId()) return;
        if (ctx.characterId === undefined) return;
        if (!isCharacterAllowed(ctx)) return;

        const idleMs = Date.now() - lastUserMessageTime;
        const thresholdMs = settings.idleThresholdHours * 3600000;
        if (idleMs < thresholdMs) return;

        const intervalMs = settings.idleCheckIntervalMinutes * 60000;
        if (Date.now() - lastIdleRollTime < intervalMs) return;
        lastIdleRollTime = Date.now();

        const roll = Math.random() * 100;
        console.log(LOG, `Idle roll: ${roll.toFixed(1)} / need < ${settings.idleTriggerProbability}`);
        if (roll >= settings.idleTriggerProbability) return;

        idleTriggeredThisPeriod = true;

        const gap = calcGap(lastUserMessageTime, Date.now());
        const gapStr = formatGapText(gap) || 'a while';

        const now = new Date();
        const timeLine = t('prompt.current_time', { date: fmtDate(now), time: fmtTime(now) }) + `（${timePeriod(now.getHours(), now.getMinutes())}）`;
        const weatherLines = buildWeatherLines();
        const weatherText = weatherLines.length > 0 ? `\n${t('prompt.weather_info')}${weatherLines.join('；')}` : '';

        const charName = ctx.name2 || '角色';
        const prompt = t('auto.idle_prompt', { charName, gapStr, timeLine, weatherText });

        await sendAsCharacter(prompt);
    }

    // ======================== 角色范围判断 ========================
    function isInjectAllowed(ctx) {
        const settings = getSettings();
        if (!settings.injectCharacters || settings.injectCharacters.length === 0) return true;
        const current = ctx.characters[ctx.characterId];
        if (!current) return false;
        const key = current.avatar || current.name;
        return settings.injectCharacters.includes(key);
    }

    function isCharacterAllowed(ctx) {
        const settings = getSettings();
        if (!settings.autoMessageCharacters || settings.autoMessageCharacters.length === 0) return true;
        const current = ctx.characters[ctx.characterId];
        if (!current) return false;
        const key = current.avatar || current.name;
        return settings.autoMessageCharacters.includes(key);
    }

    // ======================== 主定时器 ========================
    function startMainTimer() {
        stopMainTimer();
        mainTimerHandle = setInterval(mainTick, 60000);
        console.log(LOG, 'Main timer started (60s interval)');
    }

    function stopMainTimer() {
        if (mainTimerHandle) {
            clearInterval(mainTimerHandle);
            mainTimerHandle = null;
        }
    }

    function mainTick() {
        const settings = getSettings();
        if (!settings.enabled) return;
        if (isAutoGenerating) return;

        checkSpecialDay();
        checkIdleMessage();
        updateWeatherCache();
        updateNagerCache();
        buildAndInjectPrompt();
    }

    // ======================== 聊天切换 ========================
    function onChatChanged() {
        restoreLastUserMsgTime();
        idleTriggeredThisPeriod = false;
        lastIdleRollTime = 0;
        if ($('#ta_character_list').length) {
            refreshCharacterList();
        }
        if ($('#ta_inject_character_list').length) {
            refreshInjectCharacterList();
        }
    }

    // ======================== Settings HTML 模板 ========================
    function buildSettingsHtml() {
        return `
<div id="ta_settings" class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>${t('ui.title')}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
    </div>
    <div class="inline-drawer-content">

        <div class="settings_section flex-container" style="align-items:center;gap:8px;">
            <input type="checkbox" id="ta_enabled">
            <label for="ta_enabled"><b>${t('ui.enable_plugin')}</b></label>
            <span id="ta_cdn_status" style="margin-left:auto;font-size:0.8em;"></span>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>${t('ui.lang.title')}</b>
            <div class="ta_lang_row">
                <select id="ta_lang_select" class="text_pole" style="min-width:220px;">
                    <option value="auto">${t('ui.lang.auto')}</option>
                    <option value="zh">${t('ui.lang.zh')}</option>
                    <option value="en">${t('ui.lang.en')}</option>
                </select>
            </div>
            <div id="ta_lang_status" class="ta_section_note"></div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <b>${t('ui.role_scope_inject')}</b>
                <div id="ta_refresh_inject_chars" class="menu_button" style="font-size:0.8em;" title="${t('ui.refresh_list')}">🔄</div>
            </div>
            <div class="ta_section_note">${t('ui.no_role_selected')}</div>
            <div id="ta_inject_character_list"></div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>${t('ui.time_inject')}</b>
            <div style="margin-top:8px;">
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_timestamp"> ${t('ui.inject_timestamp')}
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_period"> ${t('ui.inject_period')}
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_daytype"> ${t('ui.inject_daytype')}
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_holiday"> ${t('ui.inject_holiday')}
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_lunar"> ${t('ui.inject_lunar')}
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_gap"> ${t('ui.inject_gap')}
                </label>
            </div>
            <div style="margin-top:6px;">
                <label>${t('ui.prompt_pos')}
                    <select id="ta_prompt_pos" class="text_pole" style="width:170px;margin-left:6px;">
                        <option value="system">${t('ui.prompt_pos_system')}</option>
                        <option value="world">${t('ui.prompt_pos_world')}</option>
                        <option value="prefill">${t('ui.prompt_pos_prefill')}</option>
                    </select>
                </label>
            </div>

            <div style="margin-top:8px;">
                <label>注入方式
                    <select id="ta_inject_mode" class="text_pole" style="width:220px;margin-left:6px;">
                        <option value="macro">宏（推荐）</option>
                        <option value="extension">扩展注入（旧模式）</option>
                    </select>
                </label>
            </div>

            <div class="ta_nager_row" style="margin-top:6px;">
                <input type="text" id="ta_macro_name" class="text_pole" placeholder="宏名，如 time_awareness">
                <div id="ta_macro_apply" class="menu_button ta-inline-btn">应用宏名</div>
            </div>
            <div id="ta_macro_status" class="ta_section_note"></div>
            <div class="ta_section_note">可用占位符：<code id="ta_macro_token_preview">{{time_awareness}}</code></div>

            <div class="ta_test_row">
                <div id="ta_btn_preview" class="menu_button ta-inline-btn" style="font-size:0.85em;">${t('ui.preview')}</div>
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>${t('ui.nager.title')}</b>
            <div class="ta_section_note">
                ${t('ui.nager.desc')}
            </div>

            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_nager_enabled"> ${t('ui.nager.enable')}
            </label>
            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_nager_autodetect"> ${t('ui.nager.autodetect')}
            </label>

            <div class="ta_nager_row">
                <input type="text" id="ta_nager_country_code" class="text_pole" placeholder="${t('ui.nager.code_placeholder')}">
                <div id="ta_nager_apply_country" class="menu_button ta-inline-btn">${t('ui.apply')}</div>
            </div>

            <div class="ta_nager_row">
                <select id="ta_nager_country_select" class="text_pole"></select>
                <div id="ta_nager_refresh_countries" class="menu_button ta-inline-btn">${t('ui.refresh_country_list')}</div>
            </div>

            <div id="ta_nager_status" class="ta_section_note"></div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>${t('ui.weather.title')}</b>
            <div class="ta_section_note">
                ${t('ui.weather.desc')}
            </div>

            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_weather_enabled"> ${t('ui.weather.enable')}
            </label>

            <div class="ta_weather_row">
                <input type="text" id="ta_weather_location" class="text_pole" placeholder="${t('ui.weather.location_placeholder')}">
                <div id="ta_weather_search" class="menu_button ta-inline-btn">${t('ui.search')}</div>
            </div>
            <div class="ta_weather_row">
                <input type="text" id="ta_weather_lat" class="text_pole" placeholder="${t('ui.weather.lat_placeholder')}">
                <input type="text" id="ta_weather_lon" class="text_pole" placeholder="${t('ui.weather.lon_placeholder')}">
                <div id="ta_weather_apply_coord" class="menu_button ta-inline-btn">${t('ui.use_coord')}</div>
            </div>
            <div class="ta_weather_row">
                <input type="text" id="ta_weather_lat_dms" class="text_pole" placeholder="${t('ui.weather.lat_dms_placeholder')}">
                <input type="text" id="ta_weather_lon_dms" class="text_pole" placeholder="${t('ui.weather.lon_dms_placeholder')}">
                <div id="ta_weather_convert_dms" class="menu_button ta-inline-btn">${t('ui.convert_dms')}</div>
            </div>
            <div id="ta_weather_results"></div>
            <div id="ta_weather_status" class="ta_section_note"></div>

            <div class="ta_weather_opts">
                <label><input type="checkbox" id="ta_weather_current"> ${t('ui.weather.current')}</label>
                <label><input type="checkbox" id="ta_weather_air"> ${t('ui.weather.air')}</label>
                <label><input type="checkbox" id="ta_weather_forecast"> ${t('ui.weather.forecast')}</label>
                <label>${t('ui.weather.days')}
                    <input type="number" id="ta_weather_days" class="text_pole" min="1" max="7" step="1" style="width:60px;margin-left:6px;">
                </label>
                <label>${t('ui.weather.interval')}
                    <input type="number" id="ta_weather_interval" class="text_pole" min="5" max="180" step="5" style="width:60px;margin-left:6px;">
                </label>
            </div>

            <div class="ta_test_row">
                <div id="ta_weather_refresh" class="menu_button ta-inline-btn" style="font-size:0.85em;">${t('ui.weather.refresh')}</div>
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>${t('ui.anniv.title')}</b>
            <div class="ta_section_note">
                ${t('ui.anniv.desc')}
            </div>
            <div id="ta_anniversary_list"></div>
            <div id="ta_add_anniversary" class="menu_button ta-inline-btn" style="margin-top:5px;text-align:center;">
                ${t('ui.anniv.add')}
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>${t('ui.auto.title')}</b>
            <div class="ta_section_note">
                ${t('ui.auto.desc')}
            </div>

            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_auto_specialday"> ${t('ui.auto.special')}
            </label>
            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_auto_idle"> ${t('ui.auto.idle')}
            </label>

            <div style="margin-top:8px;">
                <label style="display:block;margin-bottom:5px;">
                    ${t('ui.auto.idle_threshold')}
                    <input type="number" id="ta_idle_threshold" class="text_pole" min="0.5" max="72" step="0.5" style="width:75px;margin-left:6px;">
                </label>
                <label style="display:block;margin-bottom:5px;">
                    ${t('ui.auto.idle_interval')}
                    <input type="number" id="ta_idle_interval" class="text_pole" min="1" max="360" step="1" style="width:75px;margin-left:6px;">
                </label>
                <label style="display:block;margin-bottom:5px;">
                    ${t('ui.auto.idle_probability')}
                    <input type="number" id="ta_idle_probability" class="text_pole" min="1" max="100" step="1" style="width:75px;margin-left:6px;">
                </label>
            </div>

            <div class="ta_test_row">
                <div id="ta_btn_test_idle" class="menu_button ta-inline-btn" style="font-size:0.85em;">${t('ui.auto.test_idle')}</div>
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <b>${t('ui.role_scope_auto')}</b>
                <div id="ta_refresh_chars" class="menu_button" style="font-size:0.8em;" title="${t('ui.refresh_list')}">🔄</div>
            </div>
            <div class="ta_section_note">${t('ui.no_role_selected')}</div>
            <div id="ta_character_list"></div>
        </div>

    </div>
</div>`;
    }

    // ======================== UI 初始化 ========================
    async function initUI() {
        const settings = getSettings();

        $('#extensions_settings').append(buildSettingsHtml());

        $('#ta_cdn_status').html(
            chineseDaysLoaded
                ? `<span style="color:#4caf50;">${t('ui.holiday_lib_ok')}</span>`
                : `<span style="color:#f44336;">${t('ui.holiday_lib_fail')}</span>`
        );

        $('#ta_enabled').prop('checked', settings.enabled).on('change', function () {
            settings.enabled = $(this).prop('checked');
            saveSettings();
            if (settings.enabled) { startMainTimer(); } else { stopMainTimer(); clearPrompt(); }
        });

        $('#ta_lang_select').val(settings.langMode || 'auto').on('change', async function () {
            const v = $(this).val();
            settings.langMode = v;
            saveSettings();
            if (v === 'auto') {
                await autoDetectLanguage(true);
            } else {
                await applyLanguage(v, 'manual');
            }
            startLangWatcher();
        });

        updateLangStatus();

        const checks = {
            '#ta_inject_timestamp': 'injectTimestamp',
            '#ta_inject_gap': 'injectGap',
            '#ta_inject_period': 'injectPeriod',
            '#ta_inject_daytype': 'injectDayType',
            '#ta_inject_holiday': 'injectHoliday',
            '#ta_inject_lunar': 'injectLunarFestival',
            '#ta_auto_specialday': 'autoSpecialDayEnabled',
            '#ta_auto_idle': 'autoIdleEnabled',
            '#ta_weather_enabled': 'weatherEnabled',
            '#ta_weather_current': 'weatherIncludeCurrent',
            '#ta_weather_air': 'weatherIncludeAirQuality',
            '#ta_weather_forecast': 'weatherIncludeForecast',
            '#ta_nager_enabled': 'nagerEnabled',
            '#ta_nager_autodetect': 'nagerAutoDetect',
        };
        for (const [sel, key] of Object.entries(checks)) {
            $(sel).prop('checked', settings[key]).on('change', function () {
                settings[key] = $(this).prop('checked');
                saveSettings();
                if (key === 'weatherEnabled') updateWeatherCache(true);
                if (key === 'nagerEnabled') updateNagerCache(true);
            });
        }

        $('#ta_nager_autodetect').on('change', async function () {
            if ($(this).prop('checked')) {
                await detectCountryByTimezone();
            }
        });

        $('#ta_prompt_pos').val(settings.promptPlacement).on('change', function () {
            settings.promptPlacement = $(this).val();
            saveSettings();
            buildAndInjectPrompt();
        });

        $('#ta_inject_mode').val(settings.injectionMode || 'macro').on('change', function () {
            settings.injectionMode = $(this).val();
            saveSettings();
            if (settings.injectionMode !== 'extension') {
                applyExtensionPrompt('');
            }
            refreshMacroRegistration(true);
            updateMacroStatus();
            buildAndInjectPrompt();
        });

        $('#ta_macro_name').val(settings.macroName || 'time_awareness');
        $('#ta_macro_apply').on('click', function () {
            const newName = sanitizeMacroName($('#ta_macro_name').val());
            settings.macroName = newName;
            $('#ta_macro_name').val(newName);
            saveSettings();
            refreshMacroRegistration(true);
            updateMacroStatus();
            toastr.success(`宏已更新：{{${newName}}}`);
        });

        updateMacroStatus();

        const nums = {
            '#ta_idle_threshold': 'idleThresholdHours',
            '#ta_idle_interval': 'idleCheckIntervalMinutes',
            '#ta_idle_probability': 'idleTriggerProbability',
            '#ta_weather_days': 'weatherForecastDays',
            '#ta_weather_interval': 'weatherUpdateMinutes',
        };
        for (const [sel, key] of Object.entries(nums)) {
            $(sel).val(settings[key]).on('input', function () {
                const v = parseFloat($(this).val());
                if (!isNaN(v) && v > 0) { settings[key] = v; saveSettings(); }
            });
        }

        $('#ta_weather_location').val(settings.weatherLocationText || '');

        $('#ta_weather_lat').val(settings.weatherLat || '');
        $('#ta_weather_lon').val(settings.weatherLon || '');

        $('#ta_weather_apply_coord').on('click', async () => {
            const lat = $('#ta_weather_lat').val().trim();
            const lon = $('#ta_weather_lon').val().trim();
            const latNum = Number(lat);
            const lonNum = Number(lon);

            if (lat === '' || lon === '' || Number.isNaN(latNum) || Number.isNaN(lonNum)) {
                toastr.warning(t('toast.coord_invalid'));
                return;
            }

            settings.weatherLat = latNum;
            settings.weatherLon = lonNum;
            settings.weatherLocationText = `坐标：${latNum}, ${lonNum}`;
            saveSettings();

            updateWeatherStatus();
            await updateWeatherCache(true);
            toastr.success(t('toast.coord_applied'));
        });

        $('#ta_weather_convert_dms').on('click', () => {
            const latDms = $('#ta_weather_lat_dms').val().trim();
            const lonDms = $('#ta_weather_lon_dms').val().trim();

            if (!latDms && !lonDms) {
                toastr.warning(t('toast.dms_empty'));
                return;
            }

            const latDec = latDms ? parseDmsToDecimal(latDms) : null;
            const lonDec = lonDms ? parseDmsToDecimal(lonDms) : null;

            if (latDms && (latDec === null || isNaN(latDec))) {
                toastr.warning(t('toast.dms_lat_invalid'));
                return;
            }
            if (lonDms && (lonDec === null || isNaN(lonDec))) {
                toastr.warning(t('toast.dms_lon_invalid'));
                return;
            }

            if (latDec !== null) $('#ta_weather_lat').val(latDec);
            if (lonDec !== null) $('#ta_weather_lon').val(lonDec);

            toastr.success(t('toast.dms_converted'));
        });

        $('#ta_weather_search').on('click', async () => {
            const q = $('#ta_weather_location').val().trim();
            if (!q) {
                toastr.warning(t('toast.search_empty'));
                return;
            }
            $('#ta_weather_results').html(`<div class="ta_section_note">${t('toast.searching')}</div>`);
            try {
                const list = await searchLocation(q);
                if (!list || list.length === 0) {
                    $('#ta_weather_results').html(`<div class="ta_section_note">${t('toast.search_no_result')}</div>`);
                    return;
                }
                const $list = $('<div class="ta_weather_result_list"></div>');
                list.forEach((r) => {
                    const label = formatGeoLabel(r);
                    const $row = $(`
                        <div class="ta_weather_result_item">
                            <div class="ta_weather_result_text">${escHtml(label)}</div>
                            <div class="menu_button ta-inline-btn ta_weather_pick">${t('ui.pick')}</div>
                        </div>
                    `);
                    $row.find('.ta_weather_pick').on('click', () => {
                        settings.weatherLat = r.latitude;
                        settings.weatherLon = r.longitude;
                        settings.weatherTimezone = r.timezone || 'auto';
                        settings.weatherLocationText = label;
                        $('#ta_weather_location').val(label);
                        saveSettings();
                        $('#ta_weather_results').empty();
                        updateWeatherStatus();
                        updateWeatherCache(true);
                    });
                    $list.append($row);
                });
                $('#ta_weather_results').empty().append($list);
            } catch (e) {
                console.warn(LOG, 'Geocode error:', e);
                $('#ta_weather_results').html(`<div class="ta_section_note">${t('toast.search_failed')}</div>`);
            }
        });

        $('#ta_weather_refresh').on('click', async () => {
            if (!settings.weatherEnabled) {
                toastr.warning(t('toast.weather_enable_first'));
                return;
            }
            if (!settings.weatherLat || !settings.weatherLon) {
                toastr.warning(t('toast.weather_need_location'));
                return;
            }
            toastr.info(t('toast.weather_updating'));
            await updateWeatherCache(true);
            toastr.success(t('toast.weather_updated'));
        });

        updateWeatherStatus();

        $('#ta_nager_country_code').val(settings.nagerCountry || '');

        await fetchNagerCountries();
        renderNagerCountriesSelect();

        $('#ta_nager_apply_country').on('click', async () => {
            const code = $('#ta_nager_country_code').val().trim().toUpperCase();
            if (!code || code.length !== 2) {
                toastr.warning(t('toast.country_code_invalid'));
                return;
            }
            settings.nagerCountry = code;
            const match = nagerCountriesCache.list.find(x => x.countryCode === code);
            settings.nagerCountryName = match ? match.name : '';
            saveSettings();
            renderNagerCountriesSelect();
            updateNagerStatus();
            await updateNagerCache(true);
            buildAndInjectPrompt();
        });

        $('#ta_nager_country_select').on('change', async function () {
            const code = $(this).val();
            if (!code) return;
            settings.nagerCountry = code;
            const match = nagerCountriesCache.list.find(x => x.countryCode === code);
            settings.nagerCountryName = match ? match.name : '';
            $('#ta_nager_country_code').val(code);
            saveSettings();
            updateNagerStatus();
            await updateNagerCache(true);
            buildAndInjectPrompt();
        });

        $('#ta_nager_refresh_countries').on('click', async () => {
            toastr.info(t('toast.country_list_updating'));
            await fetchNagerCountries(true);
            renderNagerCountriesSelect();
            toastr.success(t('toast.country_list_updated'));
        });

        updateNagerStatus();

        renderAnniversaries();
        $('#ta_add_anniversary').on('click', () => {
            settings.anniversaries.push({ name: '', date: '', year: '', enabled: true });
            saveSettings();
            renderAnniversaries();
        });

        refreshCharacterList();
        $('#ta_refresh_chars').on('click', refreshCharacterList);

        refreshInjectCharacterList();
        $('#ta_refresh_inject_chars').on('click', refreshInjectCharacterList);

        $('#ta_btn_preview').on('click', () => {
            const text = buildAndInjectPrompt();
            toastr.info(text || t('toast.no_prompt'), t('toast.prompt_title'), { timeOut: 8000, escapeHtml: false });
        });

        $('#ta_btn_test_idle').on('click', async () => {
            const ctx = SillyTavern.getContext();
            if (!ctx.getCurrentChatId()) {
                toastr.warning(t('toast.open_chat_first'));
                return;
            }
            toastr.info(t('toast.generating_test'));
            const charName = ctx.name2 || '角色';
            const prompt = t('auto.test_prompt', { charName });
            const ok = await sendAsCharacter(prompt);
            if (ok) {
                if (lastAutoSaveFailed) {
                    toastr.warning(t('toast.message_saved_failed', { error: lastAutoSaveError || 'Unknown' }));
                } else {
                    toastr.success(t('toast.test_sent'));
                }
            } else {
                toastr.error(t('toast.gen_failed', { error: lastAutoGenError || t('toast.api_check') }));
            }
        });

        uiMounted = true;
        updateLangStatus();
        console.log(LOG, 'UI mounted');
    }

    function clearPrompt() {
        applyExtensionPrompt('');
    }

    // ======================== 纪念日列表渲染 ========================
    function renderAnniversaries() {
        const settings = getSettings();
        const $list = $('#ta_anniversary_list').empty();

        settings.anniversaries.forEach((ann, idx) => {
            const $row = $(`
                <div class="ta_anniversary_item">
                    <input type="checkbox" class="ta_ann_en" ${ann.enabled ? 'checked' : ''} title="${t('ann.enable')}">
                    <input type="text" class="ta_ann_name text_pole" value="${escHtml(ann.name)}" placeholder="${t('ann.name_placeholder')}" style="flex:1;min-width:80px;">
                    <input type="text" class="ta_ann_date text_pole" value="${escHtml(ann.date)}" placeholder="${t('ann.date_placeholder')}" style="width:70px;">
                    <input type="text" class="ta_ann_year text_pole" value="${escHtml(ann.year)}" placeholder="${t('ann.year_placeholder')}" style="width:80px;">
                    <div class="menu_button ta_ann_del" title="${t('ann.delete')}">🗑️</div>
                </div>
            `);

            $row.find('.ta_ann_en').on('change', function () {
                settings.anniversaries[idx].enabled = $(this).prop('checked');
                saveSettings();
            });
            $row.find('.ta_ann_name').on('input', function () {
                settings.anniversaries[idx].name = $(this).val();
                saveSettings();
            });
            $row.find('.ta_ann_date').on('input', function () {
                settings.anniversaries[idx].date = $(this).val().trim();
                saveSettings();
            });
            $row.find('.ta_ann_year').on('input', function () {
                settings.anniversaries[idx].year = $(this).val().trim();
                saveSettings();
            });
            $row.find('.ta_ann_del').on('click', function () {
                settings.anniversaries.splice(idx, 1);
                saveSettings();
                renderAnniversaries();
            });

            $list.append($row);
        });
    }

    // ======================== 角色多选列表 ========================
    function refreshCharacterList() {
        const settings = getSettings();
        const $list = $('#ta_character_list').empty();
        const chars = SillyTavern.getContext().characters || [];

        if (chars.length === 0) {
            $list.append(`<div class="ta_section_note">${t('ui.no_roles')}</div>`);
            return;
        }

        chars.forEach((ch) => {
            const key = ch.avatar || ch.name;
            if (!key) return;
            const checked = settings.autoMessageCharacters.includes(key);
            const $item = $(`
                <label class="ta_char_item">
                    <input type="checkbox" class="ta_char_cb" data-key="${escHtml(key)}" ${checked ? 'checked' : ''}>
                    <span>${escHtml(ch.name || key)}</span>
                </label>
            `);
            $item.find('.ta_char_cb').on('change', function () {
                const k = $(this).data('key');
                const on = $(this).prop('checked');
                if (on && !settings.autoMessageCharacters.includes(k)) {
                    settings.autoMessageCharacters.push(k);
                } else if (!on) {
                    settings.autoMessageCharacters = settings.autoMessageCharacters.filter(x => x !== k);
                }
                saveSettings();
            });
            $list.append($item);
        });
    }

    function refreshInjectCharacterList() {
        const settings = getSettings();
        const $list = $('#ta_inject_character_list').empty();
        const chars = SillyTavern.getContext().characters || [];

        if (chars.length === 0) {
            $list.append(`<div class="ta_section_note">${t('ui.no_roles')}</div>`);
            return;
        }

        chars.forEach((ch) => {
            const key = ch.avatar || ch.name;
            if (!key) return;
            const checked = settings.injectCharacters.includes(key);
            const $item = $(`
                <label class="ta_char_item">
                    <input type="checkbox" class="ta_inject_char_cb" data-key="${escHtml(key)}" ${checked ? 'checked' : ''}>
                    <span>${escHtml(ch.name || key)}</span>
                </label>
            `);
            $item.find('.ta_inject_char_cb').on('change', function () {
                const k = $(this).data('key');
                const on = $(this).prop('checked');
                if (on && !settings.injectCharacters.includes(k)) {
                    settings.injectCharacters.push(k);
                } else if (!on) {
                    settings.injectCharacters = settings.injectCharacters.filter(x => x !== k);
                }
                saveSettings();
            });
            $list.append($item);
        });
    }

    // ======================== 清理过期的触发记录 ========================
    function cleanOldTriggers() {
        const settings = getSettings();
        const todayISO = fmtISO(new Date());
        const keys = Object.keys(settings.specialDayTriggered);
        let changed = false;
        for (const k of keys) {
            if (!k.startsWith(todayISO)) {
                delete settings.specialDayTriggered[k];
                changed = true;
            }
        }
        if (changed) saveSettings();
    }

    // ======================== 注册事件 & 启动 ========================
    const { eventSource, event_types } = SillyTavern.getContext();

    eventSource.on(event_types.APP_READY, async () => {
        console.log(LOG, 'Initializing…');

        await loadChineseDays();
        await ensureLangLoaded('zh');
        await ensureLangLoaded('en');

        const settings = getSettings();
        currentLang = settings.langCurrent || LANG_DEFAULT;

        await autoDetectLanguage(true);
        await initUI();
        refreshMacroRegistration(true);

        cleanOldTriggers();
        restoreLastUserMsgTime();
        flushPendingMessages();
        startMainTimer();
        updateWeatherCache(true);

        if (getSettings().nagerAutoDetect) {
            await detectCountryByTimezone();
        }
        await updateNagerCache(true);

        buildAndInjectPrompt();

        startLangWatcher();

        console.log(LOG, 'Ready ✓');
    });

    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, () => {
        buildAndInjectPrompt();
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
        onUserMessage();
        buildAndInjectPrompt();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        onChatChanged();
        flushPendingMessages();
        buildAndInjectPrompt();
    });

})();
