/* ============================================================
 *  Time Awareness Plugin for SillyTavern
 *  v1.1.0
 * ============================================================ */

(async function () {

    const MODULE_NAME = 'time_awareness';
    const LOG = '[TimeAwareness]';

    // ======================== 默认设置 ========================
    const defaultSettings = Object.freeze({
        enabled: true,
        injectTimestamp: true,
        injectGap: true,
        injectPeriod: true,
        injectDayType: true,
        injectHoliday: true,
        injectLunarFestival: true,
        anniversaries: [],
        autoSpecialDayEnabled: false,
        autoIdleEnabled: false,
        idleThresholdHours: 4,
        idleCheckIntervalMinutes: 30,
        idleTriggerProbability: 15,
        autoMessageCharacters: [],
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
    };
    let weatherFetching = false;

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
        return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day];
    }

    function timePeriod(h, m) {
        const t = h * 60 + m;
        if (t < 360) return '凌晨';
        if (t < 540) return '早晨';
        if (t < 690) return '上午';
        if (t < 810) return '中午';
        if (t < 1050) return '下午';
        if (t < 1140) return '傍晚';
        if (t < 1380) return '夜晚';
        return '深夜';
    }

    function calcGap(fromMs, toMs) {
        if (!fromMs || toMs <= fromMs) return null;
        const totalMin = Math.floor((toMs - fromMs) / 60000);
        return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
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
                    result.typeLabel = '调休工作日';
                } else if (isHol) {
                    result.typeLabel = '节假日';
                } else if (isWork) {
                    result.typeLabel = '工作日';
                } else {
                    result.typeLabel = '周末';
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
                result.typeLabel = isWeekend ? '周末' : '工作日';
            }
        } else {
            result.typeLabel = isWeekend ? '周末' : '工作日';
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

    // ======================== 天气工具 ========================
    function weatherCodeText(code) {
        const c = Number(code);
        if (c === 0) return '晴';
        if (c >= 1 && c <= 3) return '多云';
        if (c === 45 || c === 48) return '雾';
        if (c >= 51 && c <= 55) return '毛毛雨';
        if (c === 56 || c === 57) return '冻毛毛雨';
        if (c >= 61 && c <= 65) return '雨';
        if (c === 66 || c === 67) return '冻雨';
        if (c >= 71 && c <= 75) return '雪';
        if (c === 77) return '雪粒';
        if (c >= 80 && c <= 82) return '阵雨';
        if (c === 85 || c === 86) return '阵雪';
        if (c === 95) return '雷暴';
        if (c === 96 || c === 99) return '雷暴伴冰雹';
        return '未知天气';
    }

    function aqiLevel(aqi) {
        if (aqi === null || aqi === undefined || isNaN(aqi)) return '';
        if (aqi <= 20) return '（优）';
        if (aqi <= 40) return '（良）';
        if (aqi <= 60) return '（中等）';
        if (aqi <= 80) return '（较差）';
        if (aqi <= 100) return '（很差）';
        return '（极差）';
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
            $('#ta_weather_status').text('未设置地区，仅输入城市/区县并点击搜索即可定位。');
            return;
        }
        let txt = `已定位：${settings.weatherLocationText || '（已保存坐标）'} `;
        txt += `(${settings.weatherLat}, ${settings.weatherLon})`;
        if (weatherCache.ok && weatherCache.lastFetch) {
            const t = new Date(weatherCache.lastFetch);
            txt += `，上次更新：${fmtTime(t)}`;
        }
        $('#ta_weather_status').text(txt);
    }

    async function updateWeatherCache(force = false) {
        const settings = getSettings();
        if (!settings.weatherEnabled) return;
        if (!settings.weatherLat || !settings.weatherLon) return;
        if (weatherFetching) return;

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
                latitude: settings.weatherLat,
                longitude: settings.weatherLon,
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
            if (data && !data.error) {
                weatherCache.current = data.current || null;
                weatherCache.daily = data.daily || null;
                weatherCache.current_units = data.current_units || null;
                weatherCache.daily_units = data.daily_units || null;
            }

            if (settings.weatherIncludeAirQuality) {
                const aqParams = new URLSearchParams({
                    latitude: settings.weatherLat,
                    longitude: settings.weatherLon,
                    timezone: 'auto',
                    current: 'european_aqi,pm2_5,pm10',
                });
                const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${aqParams.toString()}`;
                const aqRes = await fetch(aqUrl);
                const aqData = await aqRes.json();
                if (aqData && !aqData.error) {
                    weatherCache.air = aqData;
                }
            }

            weatherCache.lastFetch = Date.now();
            weatherCache.ok = true;
            weatherCache.error = '';
        } catch (e) {
            console.warn(LOG, 'Weather fetch error:', e);
            weatherCache.ok = false;
            weatherCache.error = String(e || '');
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
            if (c.apparent_temperature !== undefined) text.push(`体感${fmtNum(c.apparent_temperature, 1)}°C`);
            if (c.relative_humidity_2m !== undefined) text.push(`湿度${fmtNum(c.relative_humidity_2m, 0)}%`);
            if (c.wind_speed_10m !== undefined) text.push(`风速${fmtNum(c.wind_speed_10m, 1)} km/h`);
            if (text.length > 0) lines.push(`当前天气：${text.join('，')}`);
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
            if (parts.length > 0) lines.push(`空气质量：${parts.join('，')}`);
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
                if (pop !== null && pop !== undefined) s += ` 降水${fmtNum(pop, 0)}%`;
                items.push(s.trim());
            }
            if (items.length > 0) lines.push(`未来预报：${items.join('；')}`);
        }

        return lines;
    }

    // ======================== 构建并注入时间 Prompt ========================
    function buildAndInjectPrompt() {
        const ctx = SillyTavern.getContext();
        const settings = getSettings();

        if (!settings.enabled || !ctx.getCurrentChatId()) {
            ctx.setExtensionPrompt(MODULE_NAME, '', 1, 0, false, 0);
            return '';
        }

        updateWeatherCache();

        const now = new Date();
        const iso = fmtISO(now);
        const lines = [];

        if (settings.injectTimestamp) {
            lines.push(`当前时间：${fmtDate(now)} ${fmtTime(now)}`);
        }

        if (settings.injectPeriod) {
            lines.push(`时间段：${timePeriod(now.getHours(), now.getMinutes())}`);
        }

        if (settings.injectDayType || settings.injectHoliday || settings.injectLunarFestival) {
            const info = getDayInfo(iso);

            if (settings.injectDayType) {
                let dayStr = `${info.weekday}，${info.typeLabel}`;
                if (settings.injectHoliday && info.holidayName) {
                    dayStr += `（${info.holidayName}`;
                    if (info.holidayDay) dayStr += ` 第${info.holidayDay}天`;
                    dayStr += '）';
                }
                lines.push(dayStr);
            } else if (settings.injectHoliday && info.holidayName) {
                let holStr = `今日节日：${info.holidayName}`;
                if (info.holidayDay) holStr += `（第${info.holidayDay}天）`;
                lines.push(holStr);
            }

            if (settings.injectLunarFestival && info.lunarFestivals.length > 0) {
                lines.push(`农历节日：${info.lunarFestivals.join('、')}`);
            }
        }

        if (settings.injectGap && lastUserMessageTime) {
            const gap = calcGap(lastUserMessageTime, now.getTime());
            if (gap && (gap.hours > 0 || gap.minutes > 0)) {
                let s = '距离用户上次发消息：';
                if (gap.hours > 0) s += `${gap.hours}小时`;
                if (gap.minutes > 0) s += `${gap.minutes}分钟`;
                lines.push(s);
            }
        }

        const weatherLines = buildWeatherLines();
        if (weatherLines.length > 0) {
            lines.push('天气信息：');
            lines.push(...weatherLines);
        }

        const annivs = matchAnniversaries(now);
        for (const a of annivs) {
            lines.push(`📌 今天是：${a}`);
        }

        const prompt = lines.length > 0 ? `[时间信息]\n${lines.join('\n')}` : '';
        ctx.setExtensionPrompt(MODULE_NAME, prompt, 1, 0, false, 0);
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

    // ======================== 自动消息：公共发送 ========================
    async function sendAsCharacter(quietPromptText) {
        if (isAutoGenerating) return false;
        const ctx = SillyTavern.getContext();
        if (!ctx.getCurrentChatId()) return false;
        if (ctx.characterId === undefined && ctx.characterId !== 0) return false;

        isAutoGenerating = true;
        try {
            const result = await ctx.generateQuietPrompt({
                quietPrompt: quietPromptText,
            });

            if (!result || !result.trim()) {
                console.log(LOG, 'Auto generation returned empty');
                return false;
            }

            const charName = ctx.name2 || 'Character';
            const msg = {
                name: charName,
                is_user: false,
                is_system: false,
                send_date: new Date().toISOString(),
                mes: result.trim(),
                extra: { isAutoMessage: true, fromPlugin: MODULE_NAME },
            };
            ctx.addOneMessage(msg, { scroll: true });
            await ctx.saveChat();
            ctx.saveChatDebounced();
            console.log(LOG, 'Auto message inserted');
            return true;
        } catch (e) {
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
            const prompt = `[系统指令 - 对用户不可见]\n你是${charName}。今天对用户来说是一个特别的日子：${desc}。\n请根据你和用户目前的关系、最近的聊天氛围，自然地决定如何提起（或含蓄暗示）这件事。\n如果当前气氛不适合直说，你可以用更微妙的方式。\n不要说"系统告诉我"之类暴露来源的话。\n直接输出你要发给用户的消息内容。`;

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
        let gapStr = '';
        if (gap) {
            if (gap.hours > 0) gapStr += `${gap.hours}小时`;
            if (gap.minutes > 0) gapStr += `${gap.minutes}分钟`;
        }

        const charName = ctx.name2 || '角色';
        const prompt = `[系统指令 - 对用户不可见]\n你是${charName}。用户已经有${gapStr || '一段时间'}没有发消息了。\n请根据当前的对话情境和你们的关系，自然地主动发一条消息。\n可以是闲聊、关心、吐槽、分享日常等——选你觉得最自然的方式。\n不要提到"你很久没说话了"或任何暴露这是系统触发的内容。\n直接输出你要发的消息。`;

        await sendAsCharacter(prompt);
    }

    // ======================== 角色范围判断 ========================
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
    }

    // ======================== 聊天切换 ========================
    function onChatChanged() {
        restoreLastUserMsgTime();
        idleTriggeredThisPeriod = false;
        lastIdleRollTime = 0;
        if ($('#ta_character_list').length) {
            refreshCharacterList();
        }
    }

    // ======================== Settings HTML 模板 ========================
    const SETTINGS_HTML = `
<div id="ta_settings" class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>时间感知 / Time Awareness</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
    </div>
    <div class="inline-drawer-content">

        <div class="settings_section flex-container" style="align-items:center;gap:8px;">
            <input type="checkbox" id="ta_enabled">
            <label for="ta_enabled"><b>启用插件</b></label>
            <span id="ta_cdn_status" style="margin-left:auto;font-size:0.8em;"></span>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>时间信息注入</b>
            <div style="margin-top:8px;">
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_timestamp"> 当前时间
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_period"> 时间段（凌晨/早晨/上午/中午/下午/傍晚/夜晚/深夜）
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_daytype"> 日期类型（工作日/周末/调休/节假日）
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_holiday"> 法定节假日名称 + 第几天
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_lunar"> 农历民俗节日
                </label>
                <label style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
                    <input type="checkbox" id="ta_inject_gap"> 距离用户上次发言
                </label>
            </div>
            <div class="ta_test_row">
                <div id="ta_btn_preview" class="menu_button ta-inline-btn" style="font-size:0.85em;">👁️ 预览当前注入内容</div>
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>🌤️ 天气与空气质量（Open-Meteo）</b>
            <div class="ta_section_note">
                仅注入天气数据，不会写入地区名称。请先搜索定位。
            </div>

            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_weather_enabled"> 启用天气注入
            </label>

            <div class="ta_weather_row">
                <input type="text" id="ta_weather_location" class="text_pole" placeholder="输入城市/区县，如：深圳南山">
                <div id="ta_weather_search" class="menu_button ta-inline-btn">搜索</div>
            </div>
            <div id="ta_weather_results"></div>
            <div id="ta_weather_status" class="ta_section_note"></div>

            <div class="ta_weather_opts">
                <label><input type="checkbox" id="ta_weather_current"> 当前天气</label>
                <label><input type="checkbox" id="ta_weather_air"> 空气质量</label>
                <label><input type="checkbox" id="ta_weather_forecast"> 未来预报</label>
                <label>预报天数
                    <input type="number" id="ta_weather_days" class="text_pole" min="1" max="7" step="1" style="width:60px;margin-left:6px;">
                </label>
                <label>更新间隔(分钟)
                    <input type="number" id="ta_weather_interval" class="text_pole" min="5" max="180" step="5" style="width:60px;margin-left:6px;">
                </label>
            </div>

            <div class="ta_test_row">
                <div id="ta_weather_refresh" class="menu_button ta-inline-btn" style="font-size:0.85em;">🔄 手动更新天气</div>
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>🎂 纪念日配置</b>
            <div class="ta_section_note">
                日期格式 MM-DD，年份选填（用于计算第几年）。
            </div>
            <div id="ta_anniversary_list"></div>
            <div id="ta_add_anniversary" class="menu_button ta-inline-btn" style="margin-top:5px;text-align:center;">
                ➕ 添加纪念日
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <b>自动消息</b>
            <div class="ta_section_note">
                需保持 SillyTavern 页面处于打开状态。
            </div>

            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_auto_specialday"> 纪念日当天角色主动发消息
            </label>
            <label style="display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="ta_auto_idle"> 用户长时间未发言时角色主动发消息
            </label>

            <div style="margin-top:8px;">
                <label style="display:block;margin-bottom:5px;">
                    闲置触发阈值（小时）
                    <input type="number" id="ta_idle_threshold" class="text_pole" min="0.5" max="72" step="0.5" style="width:75px;margin-left:6px;">
                </label>
                <label style="display:block;margin-bottom:5px;">
                    到达阈值后检查间隔（分钟）
                    <input type="number" id="ta_idle_interval" class="text_pole" min="1" max="360" step="1" style="width:75px;margin-left:6px;">
                </label>
                <label style="display:block;margin-bottom:5px;">
                    每次检查触发概率（%）
                    <input type="number" id="ta_idle_probability" class="text_pole" min="1" max="100" step="1" style="width:75px;margin-left:6px;">
                </label>
            </div>

            <div class="ta_test_row">
                <div id="ta_btn_test_idle" class="menu_button ta-inline-btn" style="font-size:0.85em;">手动测试闲置消息</div>
            </div>
        </div>

        <hr class="sysHR">

        <div class="settings_section">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <b>自动消息适用角色</b>
                <div id="ta_refresh_chars" class="menu_button" style="font-size:0.8em;" title="刷新列表">🔄</div>
            </div>
            <div class="ta_section_note">不勾选任何角色 = 对所有角色生效。</div>
            <div id="ta_character_list"></div>
        </div>

    </div>
</div>`;

    // ======================== UI 初始化 ========================
    function initUI() {
        const settings = getSettings();

        $('#extensions_settings').append(SETTINGS_HTML);

        $('#ta_cdn_status').html(
            chineseDaysLoaded
                ? '<span style="color:#4caf50;">节假日库 ✓</span>'
                : '<span style="color:#f44336;">节假日库 ✗（CDN 不可达）</span>'
        );

        $('#ta_enabled').prop('checked', settings.enabled).on('change', function () {
            settings.enabled = $(this).prop('checked');
            saveSettings();
            if (settings.enabled) { startMainTimer(); } else { stopMainTimer(); clearPrompt(); }
        });

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
        };
        for (const [sel, key] of Object.entries(checks)) {
            $(sel).prop('checked', settings[key]).on('change', function () {
                settings[key] = $(this).prop('checked');
                saveSettings();
                if (key === 'weatherEnabled') updateWeatherCache(true);
            });
        }

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

        $('#ta_weather_search').on('click', async () => {
            const q = $('#ta_weather_location').val().trim();
            if (!q) {
                toastr.warning('请输入城市/区县后再搜索');
                return;
            }
            $('#ta_weather_results').html('<div class="ta_section_note">搜索中...</div>');
            try {
                const list = await searchLocation(q);
                if (!list || list.length === 0) {
                    $('#ta_weather_results').html('<div class="ta_section_note">未找到匹配地点</div>');
                    return;
                }
                const $list = $('<div class="ta_weather_result_list"></div>');
                list.forEach((r) => {
                    const label = formatGeoLabel(r);
                    const $row = $(`
                        <div class="ta_weather_result_item">
                            <div class="ta_weather_result_text">${escHtml(label)}</div>
                            <div class="menu_button ta-inline-btn ta_weather_pick">选中</div>
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
                $('#ta_weather_results').html('<div class="ta_section_note">搜索失败，请稍后重试</div>');
            }
        });

        $('#ta_weather_refresh').on('click', async () => {
            if (!settings.weatherEnabled) {
                toastr.warning('请先启用天气注入');
                return;
            }
            if (!settings.weatherLat || !settings.weatherLon) {
                toastr.warning('请先搜索并选择地区');
                return;
            }
            toastr.info('正在更新天气数据…');
            await updateWeatherCache(true);
            toastr.success('天气数据已更新');
        });

        updateWeatherStatus();

        renderAnniversaries();
        $('#ta_add_anniversary').on('click', () => {
            settings.anniversaries.push({ name: '', date: '', year: '', enabled: true });
            saveSettings();
            renderAnniversaries();
        });

        refreshCharacterList();
        $('#ta_refresh_chars').on('click', refreshCharacterList);

        $('#ta_btn_preview').on('click', () => {
            const text = buildAndInjectPrompt();
            toastr.info(text || '（当前无注入内容）', '当前 Prompt 注入', { timeOut: 8000, escapeHtml: false });
        });

        $('#ta_btn_test_idle').on('click', async () => {
            const ctx = SillyTavern.getContext();
            if (!ctx.getCurrentChatId()) {
                toastr.warning('请先打开一个聊天');
                return;
            }
            toastr.info('正在生成测试消息…');
            const charName = ctx.name2 || '角色';
            const prompt = `[系统指令 - 对用户不可见]\n你是${charName}。这是一条测试，请你随意主动给用户发一条简短的消息，就像你突然想起来什么一样。\n直接输出你要发的内容。`;
            const ok = await sendAsCharacter(prompt);
            if (ok) toastr.success('测试消息已发送');
            else toastr.error('生成失败，请检查 API 连接');
        });

        console.log(LOG, 'UI mounted');
    }

    function clearPrompt() {
        SillyTavern.getContext().setExtensionPrompt(MODULE_NAME, '', 1, 0, false, 0);
    }

    // ======================== 纪念日列表渲染 ========================
    function renderAnniversaries() {
        const settings = getSettings();
        const $list = $('#ta_anniversary_list').empty();

        settings.anniversaries.forEach((ann, idx) => {
            const $row = $(`
                <div class="ta_anniversary_item">
                    <input type="checkbox" class="ta_ann_en" ${ann.enabled ? 'checked' : ''} title="启用">
                    <input type="text" class="ta_ann_name text_pole" value="${escHtml(ann.name)}" placeholder="名称（如：我的生日）" style="flex:1;min-width:80px;">
                    <input type="text" class="ta_ann_date text_pole" value="${escHtml(ann.date)}" placeholder="MM-DD" style="width:70px;">
                    <input type="text" class="ta_ann_year text_pole" value="${escHtml(ann.year)}" placeholder="年份(选填)" style="width:80px;">
                    <div class="menu_button ta_ann_del" title="删除">🗑️</div>
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
            $list.append('<div class="ta_section_note">暂无可用角色</div>');
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
        initUI();
        cleanOldTriggers();
        restoreLastUserMsgTime();
        startMainTimer();
        updateWeatherCache(true);

        console.log(LOG, 'Ready ✓');
    });

    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, () => {
        buildAndInjectPrompt();
    });

    eventSource.on(event_types.MESSAGE_SENT, () => {
        onUserMessage();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        onChatChanged();
    });

})();
