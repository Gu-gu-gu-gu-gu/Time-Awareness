# CHANGELOG

## v1.4.0 - 2026.04.15

### Added
- Added editable auto-message prompt templates:
  - Custom template for anniversary-triggered auto messages
  - Custom template for idle-triggered auto messages
  - Editable directly from the settings panel
  - One-click reset to default template

### Improved
- Auto-message generation now prioritizes user-defined templates and falls back to built-in defaults when empty
- Added documentation for the character weather marker format to make character-location weather injection easier to test

### Notes
- Supported character weather marker formats:
  - `[CHAR_WEATHER|lat=35.07639|lon=118.31083|tz=Asia/Shanghai|name=Linyi]`
  - `[CHAR_WEATHER|city=shenzhen nanshan|tz=Asia/Shanghai|name=Shenzhen Nanshan]`

## v1.3.0 - 2026.03.25

### Added
- **Macro Injection Mode**: Added support for using a macro token to control where time-awareness content is injected.
  You can now place it freely in **System Prompt**, **User Prompt**, **World Info**, or **Character Card**.
- **Custom Macro Name**: You can now customize the macro name in the settings panel.

---

## v1.2.0 - 2026.03.24

### Added
- Selectable injection target (**System / World Info / Prefill**)
- Direct latitude/longitude input and DMS-to-decimal conversion
- Character filter for time prompt injection scope

### Fixed
- Auto messages not being saved into chat history
- Auto messages being lost after leaving a chat
- Improved compatibility with save/render flows across different SillyTavern versions

### Improved
- Increased stability of the auto-message insertion pipeline

---

## v1.1.0 - 2026.03.21

### Added
- Open-Meteo weather / air quality / forecast injection
- Region-based search and location selection (city / district)
- Weather cache and scheduled refresh

### Fixed
- Auto messages not being saved after refresh (chat save is now forced)

### Improved
- Prompt structure and injection logic

---

## v1.0.0

### Initial Release
- Time-awareness prompt injection
- Holiday detection (`chinese-days`)
- Anniversary reminders
- Auto messages (anniversary + idle greeting)
