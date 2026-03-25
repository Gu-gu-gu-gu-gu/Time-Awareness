# ⏰ SillyTavern 时间感知插件（Time Awareness）

[![English](https://img.shields.io/badge/English-README-blue)](README.md)
[![更新日志](https://img.shields.io/badge/更新日志-CHANGELOG-brightgreen)](CHANGELOG.en.md)

用于 [SillyTavern](https://github.com/SillyTavern/SillyTavern)，让 LLM 获得“当前时间 + 日期氛围 + 节假日 + 天气空气质量”感知，并支持纪念日/久未发言自动消息。

## 功能亮点

- **时间感知注入**
  - 当前日期与时间
  - 时间段（凌晨/早晨/上午/中午/下午/傍晚/夜晚/深夜）
  - 工作日/周末/节假日
  - 距离用户上次发言时间间隔

- **双节假日体系**
  - 中国地区：`chinese-days`（法定节假日、调休、农历民俗节日）
  - 非中国地区：`Nager.Date` 公共假期 API（按国家代码）

- **纪念日提示**
  - 自定义纪念日（生日/周年等）
  - 支持“第 N 年”自动计算
  - 可注入提示词，也可触发自动消息

- **天气与空气质量（Open-Meteo）**
  - 输入地名搜索并保存经纬度
  - 注入当前天气、空气质量、未来预报
  - 支持缓存与刷新间隔控制

- **自动消息**
  - 纪念日当天角色主动消息
  - 久未发言按概率触发主动问候
  - 支持按角色白名单生效

- **多语言界面**
  - 中文 / 英文
  - 可自动跟随 SillyTavern 语言，也可手动指定

- **两种注入模式**
  - **宏模式（推荐）**：你在预设/世界书/模板里自己决定插入位置
  - **扩展注入模式（旧）**：插件通过 `setExtensionPrompt` 自动注入

---

## 安装方式

### 方式一：SillyTavern 内置安装

1. 打开 SillyTavern → Extensions
2. 点击 `Install extension`
3. 粘贴仓库克隆 URL
4. 点击 `Install`
5. 刷新页面

### 方式二：手动安装

1. 下载并解压仓库
2. 放入目录：`SillyTavern/public/scripts/extensions/third-party/`
3. 刷新页面

---

## 快速开始

1. 勾选“启用插件”
2. 选择注入方式（推荐宏模式）
3. 按需开启时间/节假日/天气/自动消息
4. 点击“预览”确认当前注入内容

---

## 注入模式说明

### 1）宏模式（推荐）

宏模式下，插件不强制注入 Extension Prompt。
你可以在预设、世界书、系统提示模板中手动放置宏占位符，精确控制位置。

- 默认宏名：`time_awareness`
- 占位符：`{{time_awareness}}`
- 若改名为 `my_time`，占位符就是 `{{my_time}}`

### 2）扩展注入模式（旧）

插件通过 `setExtensionPrompt` 注入到 system/world/prefill。
若遇到前端版本导致位置异常，建议切回宏模式。

---

## 节假日逻辑

- 国家代码为 `CN` 时，使用 `chinese-days`
- 国家代码非 `CN` 时，使用 `Nager.Date`
- 可选按时区自动识别国家（借助 `WorldTimeAPI`）

---

## 常见问题

- **为什么必须开着页面？**
  因为插件是前端 JS 运行，页面关闭后定时任务停止。

- **节假日信息没显示？**
  常见原因是 API/CDN 不可达，会自动降级为工作日/周末判断。

- **宏模式没生效？**
  请检查你放置的模板里是否真的写了宏占位符（如 `{{time_awareness}}`）。

---

## 致谢

- **chinese-days**
  https://github.com/vsme/chinese-days
  License: MIT

- **Nager.Date**
  https://date.nager.at

- **Open-Meteo**
  https://open-meteo.com

- **WorldTimeAPI**
  https://worldtimeapi.org/
