# ⏰ Time Awareness for SillyTavern

[![中文](https://img.shields.io/badge/中文-README-green)](README.zh-CN.md)
[![Changelog](https://img.shields.io/badge/Changelog-CHANGELOG-brightgreen)](CHANGELOG.en.md)

A SillyTavern extension that gives your LLM real-time awareness of **time, day context, holidays, weather, and air quality**, with optional proactive auto-messages for anniversaries and idle chats.

## Features

- **Time Awareness Injection**
  - Current date and time
  - Time period (dawn / morning / noon / afternoon / evening / night / late night)
  - Workday / weekend / holiday context
  - Time gap since last user message

- **Dual Holiday System**
  - **China (`CN`)**: `chinese-days` (official holidays, make-up workdays, lunar festivals)
  - **Non-CN countries**: `Nager.Date` public holiday API

- **Anniversary Support**
  - Custom anniversaries (birthday, milestones, etc.)
  - Optional year counter (e.g. Year N)
  - Can be injected into prompt and used for auto-messages

- **Weather + Air Quality (Open-Meteo)**
  - Location search by text
  - Current weather, AQI, and multi-day forecast
  - Cache + refresh interval control

- **Auto Messages (Optional)**
  - Character sends a proactive message on special days
  - Idle-triggered proactive chat by probability
  - Character whitelist support

- **Multilingual UI**
  - Chinese / English
  - Auto follow SillyTavern language, with manual override

- **Flexible Injection Modes**
  - **Macro mode (recommended):** place output exactly where you want in preset/world info/template
  - **Extension prompt mode (legacy):** plugin injects through `setExtensionPrompt`

---

## Installation

### Option A: Install from SillyTavern UI

1. Open SillyTavern → Extensions
2. Click `Install extension`
3. Paste repository clone URL
4. Click `Install`
5. Refresh SillyTavern page

### Option B: Manual install

1. Download and unzip repository
2. Put folder into:
   `SillyTavern/public/scripts/extensions/third-party/`
3. Refresh SillyTavern page

---

## Quick Start

1. Enable the plugin
2. Choose injection mode:
   - Macro (recommended)
   - Extension prompt (legacy)
3. Enable modules you need (time/holiday/weather/auto-message)
4. Use Preview to inspect final generated time block

---

## Injection Modes

### 1) Macro Mode (Recommended)

In macro mode, the plugin does not force-inject extension prompt.
You decide exact placement via a macro token in preset/world info/system prompt template.

- Default macro name: `time_awareness`
- Macro token: `{{time_awareness}}`
- If renamed to `my_time`, token becomes: `{{my_time}}`

### 2) Extension Prompt Mode (Legacy)

Plugin injects via `setExtensionPrompt` into system/world/prefill.
If prompt ordering behaves oddly in your frontend build, switch to macro mode.

---

## Holiday Logic

- If country code is `CN`, use `chinese-days`
- Otherwise use `Nager.Date`
- Optional auto country detection by timezone (`WorldTimeAPI` helper)

---

## Weather / Air Quality

1. Search location name
2. Pick a result to save coordinates
3. Enable weather injection
4. Toggle content:
   - Current weather
   - Air quality
   - Forecast (1–7 days)
5. Set refresh interval

---

## Auto Message Notes

This is a front-end extension.
Your browser page must remain open for timer checks and triggers to run.

---

## FAQ

- **Why no trigger when browser is closed?**
  Because all logic runs in front-end JavaScript.

- **Holiday data missing?**
  Usually API/CDN unreachable. Plugin falls back to workday/weekend logic.

- **Character list empty?**
  Load/import characters first, then click refresh (🔄).

- **Macro mode enabled but no injected content?**
  Make sure your template actually contains the macro token (e.g. `{{time_awareness}}`).

---

## Credits

- **chinese-days**
  https://github.com/vsme/chinese-days
  License: MIT

- **Nager.Date**
  https://date.nager.at

- **Open-Meteo**
  https://open-meteo.com
  License: CC BY 4.0
  Citation: Zippenfenig, P. (2023). Open-Meteo.com Weather API [Computer software]. Zenodo. https://doi.org/10.5281/ZENODO.7970649

- **WorldTimeAPI**
  https://worldtimeapi.org/
