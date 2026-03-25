# ⏰ SillyTavern 时间感知插件（Time Awareness）

用于 [SillyTavern](https://github.com/SillyTavern/SillyTavern)，让 LLM 获得“当前时间 + 日期氛围 + 节假日 + 天气空气质量”感知，并支持纪念日/久未发言自动消息。

## 功能亮点

- **时间感知注入**
  - 当前日期与时间
  - 时间段（凌晨/早晨/上午/中午/下午/傍晚/夜晚/深夜）
  - 工作日/周末/节假日信息
  - 距离用户上次发言时间间隔

- **双节假日体系**
  - 中国地区：`chinese-days`（法定节假日、调休、农历民俗节日）
  - 非中国地区：`Nager.Date` 公共假期 API（按国家代码）

- **纪念日提示**
  - 自定义纪念日（生日/周年等）
  - 支持“第 N 年”自动计算
  - 可注入到提示词，也可触发自动消息

- **天气与空气质量（Open‑Meteo）**
  - 输入地名搜索并保存经纬度
  - 注入当前天气、空气质量、未来预报
  - 支持缓存与刷新间隔控制

- **自动消息**
  - 纪念日当天角色主动消息
  - 用户久未发言后按概率触发主动问候
  - 支持按角色白名单控制生效范围

- **多语言界面**
  - 支持中文 / 英文
  - 支持自动跟随 SillyTavern 语言（可手动覆盖）

- **两种注入模式**
  - **宏模式（推荐）**：你可在预设/世界书/模板中自行控制插入位置
  - **扩展注入模式（旧模式）**：由插件通过 Extension Prompt 注入

---

## 安装方式

### 方式一：SillyTavern 内置安装

1. 打开 SillyTavern → Extensions
2. 点击 `Install extension`
3. 粘贴仓库克隆 URL
4. 点击 `Install`
5. 刷新页面

### 方式二：手动安装

1. 下载仓库压缩包并解压
2. 放入目录：`SillyTavern/public/scripts/extensions/third-party/`
3. 刷新页面

---

## 快速开始

1. 勾选“启用插件”
2. 选择注入方式：
   - 推荐：`宏（推荐）`
   - 兼容：`扩展注入（旧模式）`
3. 按需开启时间、节假日、天气、自动消息等模块
4. 点击“预览”确认当前将注入的内容

---

## 注入模式说明（重要）

## 1）宏模式（推荐）

启用“宏模式”后，插件**不主动写入 Extension Prompt**，而是注册宏供你在任意位置调用。
你可以在预设、世界书、系统提示词模板中自由放置宏，从而精确控制注入位置和顺序。

- 默认宏名：`time_awareness`
- 宏占位符：`{{time_awareness}}`
- 若你改了宏名为 `my_time`，则占位符为：`{{my_time}}`

## 2）扩展注入模式（旧模式）

插件通过 `setExtensionPrompt` 自动注入到 system/world/prefill。
若遇到不同前端版本下 prefill/world 位置异常，建议改用宏模式。

---

## 节假日逻辑

- 当国家代码为 `CN`（中国）时，优先使用 `chinese-days`
- 当国家代码非 `CN` 时，使用 `Nager.Date` 公共假期
- 可启用“自动按时区识别国家”（通过时区推测国家代码）

---

## 天气与空气质量（Open‑Meteo）

1. 输入城市/地区名搜索位置
2. 选中结果后保存经纬度
3. 开启天气注入
4. 选择是否注入：
   - 当前天气
   - 空气质量
   - 未来预报（1~7天）
5. 设置刷新间隔（分钟）

---

## 自动消息（可选）

> 注意：插件运行在前端，需保持浏览器页面打开，定时逻辑才会执行。

- **纪念日主动消息**
  - 纪念日当天可自动生成角色消息
- **久未发言主动问候**
  - 达到“闲置阈值”后按间隔进行概率判定
  - 命中概率才触发一次自动消息
- 支持角色范围白名单（留空表示全部角色）

---

## 推荐默认值

- 闲置触发阈值：4 小时
- 闲置检查间隔：30 分钟
- 闲置触发概率：10%~20%
- 天气刷新间隔：30 分钟
- 未来预报天数：3 天

---

## 常见问题

- **为什么必须开着页面？**
  因为这是前端插件，页面关闭后 JS 停止执行，定时任务也会停止。

- **为什么节假日信息不显示？**
  可能是网络无法访问对应 API/CDN；插件会降级为基础工作日/周末判断。

- **为什么角色列表为空？**
  先确认已加载角色卡，再点面板中的刷新按钮（🔄）。

- **宏模式启用后看不到注入？**
  请确认你在提示词模板中放了对应宏占位符，例如 `{{time_awareness}}`。

---

## 致谢与引用

- **chinese-days** — 中国节假日、调休与农历节日库
  https://github.com/vsme/chinese-days
  License: MIT

- **Nager.Date** — Public Holiday API
  https://date.nager.at
  License: Open API（请以其官网说明为准）

- **Open‑Meteo** — Weather & Air Quality API
  https://open-meteo.com
  License: CC BY 4.0
  Citation: Zippenfenig, P. (2023). Open‑Meteo.com Weather API [Computer software]. Zenodo. https://doi.org/10.5281/ZENODO.7970649

- **WorldTimeAPI** — Timezone / country code data（用于时区自动识别国家）
  https://worldtimeapi.org/
