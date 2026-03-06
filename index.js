// ============================================================
//  Time Awareness Plugin for SillyTavern
//  v1.0.0
// ============================================================

(async function () {

    const MODULE_NAME = 'time_awareness';
    const LOG = '[TimeAwareness]';

    // ======================== 默认设置 ========================
    const defaultSettings = Object.freeze({
        enabled: true,
        // 时间注入开关
        injectTimestamp: true,
        injectGap: true,
        injectPeriod: true,
        injectDayType: true,
        injectHoliday: true,
        injectLunarFestival: true,
        // 纪念日
        anniversaries: [],
        // 自动消息
        autoSpecialDayEnabled: false,
        autoIdleEnabled: false,
        idleThresholdHours: 4,
        idleCheckIntervalMinutes: 30,
        idleTriggerProbability: 15,
        autoMessageCharacters: [],
        // 内部持久状态
        specialDayTriggered: {},
    });

    // ======================== 运行时状态 ========================
    let chineseDaysLoaded = false;
    let lastUserMessageTime = null;
    let idleTriggeredThisPeriod = false;
    let isAutoGenerating = false;
    let mainTimerHandle = null;
    let lastIdleRollTime = 0;

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

    function fmtDate(d) {
        return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日`;
    }

    function fmtTime(d) {
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }

    function fmtISO(d) {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function fmtMMDD(d) {
        return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

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

                // 获取详情：节日名称 + 第几天
                if (cd.getDayDetail) {
                    const detail = cd.getDayDetail(iso);
                    if (detail && detail.name && detail.name.includes(',')) {
                        const parts = detail.name.split(',');
                        result.holidayName = parts[1] || parts[0];
                        if (parts[2]) result.holidayDay = parts[2];
                    }
                }

                // 农历节日
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

    // ======================== 构建并注入时间 Prompt ========================
    function buildAndInjectPrompt() {
        const ctx = SillyTavern.getContext();
        const settings = getSettings();

        if (!settings.enabled || !ctx.getCurrentChatId()) {
            ctx.setExtensionPrompt(MODULE_NAME, '', 1, 0, false, 0);
            return '';
        }

        const now = new Date();
        const iso = fmtISO(now);
        const lines = [];

        // 当前时间
        if (settings.injectTimestamp) {
            lines.push(`当前时间：${fmtDate(now)} ${fmtTime(now)}`);
        }

        // 时间段
        if (settings.injectPeriod) {
            lines.push(`时间段：${timePeriod(now.getHours(), now.getMinutes())}`);
        }

        // 日期类型 + 节日
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

        // 距离上次发言
        if (settings.injectGap && lastUserMessageTime) {
            const gap = calcGap(lastUserMessageTime, now.getTime());
            if (gap && (gap.hours > 0 || gap.minutes > 0)) {
                let s = '距离用户上次发消息：';
                if (gap.hours > 0) s += `${gap.hours}小时`;
                if (gap.minutes > 0) s += `${gap.minutes}分钟`;
                lines.push(s);
            }
        }

        // 纪念日
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
        // 持久化到 chatMetadata
        try {
            const meta = SillyTavern.getContext().chatMetadata;
            if (meta) {
                meta[`${MODULE_NAME}_lastUserMsgTime`] = lastUserMessageTime;
                SillyTavern.getContext().saveMetadataDebounced();
            }
        } catch (_) { /* ignore */ }
    }

    function restoreLastUserMsgTime() {
        const ctx = SillyTavern.getContext();
        // 尝试从 chatMetadata 恢复
        const meta = ctx.chatMetadata;
        if (meta && meta[`${MODULE_NAME}_lastUserMsgTime`]) {
            lastUserMessageTime = meta[`${MODULE_NAME}_lastUserMsgTime`];
            return;
        }
        // 降级：扫描聊天记录
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
                send_date: ctx.humanizedDateTime(),
                mes: result.trim(),
                extra: { isAutoMessage: true },
            };
            ctx.addOneMessage(msg, { scroll: true });
            await ctx.saveChat();
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

        // 角色范围
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

        // 是否超过阈值
        const idleMs = Date.now() - lastUserMessageTime;
        const thresholdMs = settings.idleThresholdHours * 3600000;
        if (idleMs < thresholdMs) return;

        // 是否到了检查间隔
        const intervalMs = settings.idleCheckIntervalMinutes * 60000;
        if (Date.now() - lastIdleRollTime < intervalMs) return;
        lastIdleRollTime = Date.now();

        // Roll 概率
        const roll = Math.random() * 100;
        console.log(LOG, `Idle roll: ${roll.toFixed(1)} / need < ${settings.idleTriggerProbability}`);
        if (roll >= settings.idleTriggerProbability) return;

        // 触发
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
        // 空列表 = 全部允许
        if (!settings.autoMessageCharacters || settings.autoMessageCharacters.length === 0) return true;
        const current = ctx.characters[ctx.characterId];
        if (!current) return false;
        const key = current.avatar || current.name;
        return settings.autoMessageCharacters.includes(key);
    }

    // ======================== 主定时器 ========================
    function startMainTimer() {
        stopMainTimer();
        mainTimerHandle = setInterval(mainTick, 60000); // 每 60 秒
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

        <!-- 总开关 -->
        <div class="settings_section flex-container" style="align-items:center;gap:8px;">
            <input type="checkbox" id="ta_enabled">
            <label for="ta_enabled"><b>启用插件</b></label>
            <span id="ta_cdn_status" style="margin-left:auto;font-size:0.8em;"></span>
        </div>

        <hr class="sysHR">

        <!-- 时间信息注入 -->
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

        <!-- 纪念日 -->
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

        <!-- 自动消息 -->
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

        <!-- 适用角色 -->
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

        // CDN 状态
        $('#ta_cdn_status').html(
            chineseDaysLoaded
                ? '<span style="color:#4caf50;">节假日库 ✓</span>'
                : '<span style="color:#f44336;">节假日库 ✗（CDN 不可达）</span>'
        );

        // ---- 总开关 ----
        $('#ta_enabled').prop('checked', settings.enabled).on('change', function () {
            settings.enabled = $(this).prop('checked');
            saveSettings();
            if (settings.enabled) { startMainTimer(); } else { stopMainTimer(); clearPrompt(); }
        });

        // ---- 复选框批量绑定 ----
        const checks = {
            '#ta_inject_timestamp': 'injectTimestamp',
            '#ta_inject_gap': 'injectGap',
            '#ta_inject_period': 'injectPeriod',
            '#ta_inject_daytype': 'injectDayType',
            '#ta_inject_holiday': 'injectHoliday',
            '#ta_inject_lunar': 'injectLunarFestival',
            '#ta_auto_specialday': 'autoSpecialDayEnabled',
            '#ta_auto_idle': 'autoIdleEnabled',
        };
        for (const [sel, key] of Object.entries(checks)) {
            $(sel).prop('checked', settings[key]).on('change', function () {
                settings[key] = $(this).prop('checked');
                saveSettings();
            });
        }

        // ---- 数字输入 ----
        const nums = {
            '#ta_idle_threshold': 'idleThresholdHours',
            '#ta_idle_interval': 'idleCheckIntervalMinutes',
            '#ta_idle_probability': 'idleTriggerProbability',
        };
        for (const [sel, key] of Object.entries(nums)) {
            $(sel).val(settings[key]).on('input', function () {
                const v = parseFloat($(this).val());
                if (!isNaN(v) && v > 0) { settings[key] = v; saveSettings(); }
            });
        }

        // ---- 纪念日 ----
        renderAnniversaries();
        $('#ta_add_anniversary').on('click', () => {
            settings.anniversaries.push({ name: '', date: '', year: '', enabled: true });
            saveSettings();
            renderAnniversaries();
        });

        // ---- 角色列表 ----
        refreshCharacterList();
        $('#ta_refresh_chars').on('click', refreshCharacterList);

        // ---- 预览按钮 ----
        $('#ta_btn_preview').on('click', () => {
            const text = buildAndInjectPrompt();
            toastr.info(text || '（当前无注入内容）', '当前 Prompt 注入', { timeOut: 8000, escapeHtml: false });
        });

        // ---- 手动测试闲置消息 ----
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

    function escHtml(s) {
        if (!s) return '';
        return s.replace(/&/g, '&').replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>');
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

        console.log(LOG, 'Ready ✓');
    });

    // 每次生成前更新 prompt 注入
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, () => {
        buildAndInjectPrompt();
    });

    // 用户发消息
    eventSource.on(event_types.MESSAGE_SENT, () => {
        onUserMessage();
    });

    // 切换聊天
    eventSource.on(event_types.CHAT_CHANGED, () => {
        onChatChanged();
    });

})();
