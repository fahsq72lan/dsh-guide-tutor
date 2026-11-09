# -*- coding: utf-8 -*-
"""生成 guide-tutor 打磨计划（xlsx + md）。"""
import os
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.utils import get_column_letter

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "打磨计划-2026-11.xlsx")

# ---------- 数据 ----------
ideas = [
    # id, 模块, 类型, 标题, 想法说明, 价值/场景, 优先级, 工作量, 状态, 来源, 备注
    ("F01", "AI 协作", "新功能", "AI 协作（三选一：ollama / 免费 API / 只做分流提示）",
     "HANDOFF 里挂着的最大一项：本机装 ollama、给免费 API key、或只做「该找谁」的分流提示。",
     "让插件从「执行器」变成「会拿主意的搭子」；也是差异化的核心。", "P1", "L", "待确认", "HANDOFF 2026-11-09", "先定方案再动手，方案表在 AI协作功能方案-2026-11-09.xlsx"),
    ("F02", "桌面清单", "体验优化", "清单条目拖拽排序/拖拽改时间",
     "在卡片上按住条目上下拖，松手改顺序；拖到别的时段就改 from/to。",
     "排计划时最自然的动作，比 ✎ 弹窗快得多。", "P1", "M", "想法", "我的建议", "需处理与滚动、点击、拖标题栏的手势冲突"),
    ("F03", "桌面清单", "新功能", "重复任务与模板",
     "支持每天/每周/工作日重复；把常用的一天存成模板，一键铺开。",
     "课表之外的固定习惯（背单词、跑步、复盘）不用每天手加。", "P1", "M", "想法", "用户提到「目标转每日清单」的延伸", "repeat 字段 + 生成规则，注意别和归档打架"),
    ("F04", "桌面清单", "新功能", "自然语言加任务",
     "面板输入「明天下午三点在图书馆复习概率论」，模型解析成 from/to/place/title 后直接落盘。",
     "把「想到一件事」到「写进清单」的摩擦降到一句话。", "P1", "M", "想法", "我的建议", "解析失败要回显确认，别静默写错时间"),
    ("F05", "桌面清单", "体验优化", "子任务、备注、优先级颜色",
     "一条任务下挂 2–5 个子项；备注写「带什么」；按优先级给左侧色条。",
     "大任务（写报告）拆开才推得动；颜色让紧急项一眼可见。", "P2", "M", "想法", "我的建议", "先做备注和颜色，子任务后置"),
    ("F06", "桌面清单", "新功能", "周视图 / 完成率热力图",
     "历史窗从「按天列表」升级成一周七列，颜色深浅表示完成率。",
     "看趋势比看单天更有用，也能给周报供数据。", "P2", "L", "想法", "我的建议", "依赖 plan-archive 数据质量"),
    ("F07", "顶部任务条", "体验优化", "顶条常驻开关 + 显示下一条 + 点击展开清单",
     "加一个「常驻」开关（state.topbar.always）；当前条右侧淡显「接着 16:00 …」；点条打开清单。",
     "现在没任务就整条消失，反而找不到；常驻后是稳定的时间锚。", "P1", "S", "想法", "功能清单 v0.20 第 5 页", "别挡窗口标题栏，默认贴最上"),
    ("F08", "悬浮球", "体验优化", "贴边自动半隐藏 + 长按快捷菜单",
     "拖到屏幕边缘自动收成半圆，鼠标靠近再出来；长按 0.5 秒弹读屏/清单/专注/静音。",
     "球常驻但不碍事；快捷入口比托盘右键快。", "P2", "M", "想法", "我的建议", "注意别和拖动、Ctrl+滚轮冲突"),
    ("F09", "面板", "体验优化", "面板 Markdown 渲染与代码高亮",
     "正文支持 **粗体**、`代码`、列表、代码块；教学步骤里的命令不再是一坨纯文本。",
     "教 Linux/Excel 公式时，代码块可读性直接决定能不能照着做。", "P2", "M", "想法", "我的建议", "WPF 里可用 RichTextBox/FlowDocument，别引重依赖"),
    ("F10", "标注层", "体验优化", "标注动画：箭头流动、步骤编号、自动淡出",
     "箭头沿线流动；每个标注左上角带 ①②③；任务完成后 0.3 秒淡出。",
     "静态箭头容易看漏；编号让「先点哪」更明确。", "P3", "M", "想法", "我的建议", "WPF 动画别在每帧重绘整层"),
    ("F11", "知识库", "新功能", "教程导出 Word / PDF / 长图",
     "把一次教学会话的步骤、截图、标注导出成一份可打印教程。",
     "实验报告、给同学讲操作时直接复用；也是知识库的产出形态。", "P2", "M", "想法", "我的建议", "docx_tool.py 已有排版能力，可复用"),
    ("F12", "知识库", "体验优化", "知识库搜索、标签、版本",
     "按关键词/标签搜步骤；同一篇保留最近 5 个版本，可回滚。",
     "文件多了以后「找得到」比「存得下」更重要。", "P2", "M", "想法", "我的建议", "先做搜索，再做版本"),
    ("F13", "语音", "新功能", "语音唤醒词 + 连续对话 + 音色/语速设置 UI",
     "说「小导小导」唤醒；一轮说完自动继续听；设置窗里选晓晓/云希/晓伊、调语速。",
     "现在要按快捷键或点按钮，手上有事时还是不方便。", "P1", "L", "想法", "我的建议", "唤醒词本地识别，别常开麦克风上传"),
    ("F14", "专注环", "新功能", "专注环与清单联动 + 今日专注统计",
     "点清单某条右侧「▶」直接开 25 分钟专注；结束自动打勾；统计今日专注时长。",
     "清单告诉你做什么，专注环帮你真的开始做。", "P1", "M", "想法", "我的建议", "和 plan 的 done 事件打通即可"),
    ("F15", "数据", "新功能", "日报 / 周报",
     "每天 22:30 生成：完成率、专注时长、读屏次数、摄像头巡检次数、明日待办。",
     "把「今天干了啥」变成可回看的一页，而不是散在 daylog。", "P2", "M", "想法", "我的建议", "先生成 Markdown，再考虑推送"),
    ("F16", "都市指令", "体验优化", "指令历史、完成率、语气自定义",
     "看最近 20 条指令与 done/failed；统计完成率；edict.json 的 tone 支持自定义句子。",
     "现在的催办像闹钟，有历史才像教练。", "P2", "S", "想法", "我的建议", "directives.jsonl 已有数据"),
    ("F17", "系统", "新功能", "开机自启 + 托盘增强 + 全局快捷键自定义",
     "开机自动拉起悬浮层；托盘加「专注 25 分钟」「静音 1 小时」；快捷键可在设置里改。",
     "减少「要先打开 DSH 才有插件」的存在感。", "P2", "M", "想法", "我的建议", "自启要能一键关掉"),
    ("F18", "系统", "新功能", "便携模式 / U 盘运行",
     "数据目录可指向 U 盘相对路径，换机器插上就能用。",
     "你已经在同步 U 盘副本，便携模式能省掉手工同步。", "P3", "M", "想法", "HANDOFF 的 U 盘副本", "注意盘符变化与路径迁移"),
    ("F19", "系统", "新功能", "插件内更新检查",
     "启动时对比 package.json 与 U 盘/仓库版本，提示「有新版」。",
     "避免本地和 U 盘各跑一个旧版。", "P3", "S", "想法", "我的建议", "只提示，不自动覆盖"),
    ("F20", "开发", "新功能", "调试面板：事件流 / 状态树 / 工具调用日志",
     "一个本地网页或面板页，实时看 events.jsonl、state.json、最近工具调用与耗时。",
     "排 bug 时不用来回翻三个日志文件。", "P1", "M", "想法", "我的建议", "复用现有 HTTP/SSE 服务"),
    ("F21", "教学", "新功能", "教学会话回放",
     "把一次任务的所有截图、标注、面板文字按时间存下来，可回放/导出。",
     "教完就忘的问题；回放比翻聊天记录直观。", "P3", "L", "想法", "我的建议", "先存元数据，视频后置"),
    ("F22", "桌面清单", "体验优化", "免打扰 / 请假模式",
     "点一下「今天不提醒」，到点提醒与催办静默，清单照常显示。",
     "周末或考试周不想被追着问。", "P3", "S", "想法", "我的建议", "状态存 state，跨天自动解除"),
    ("F23", "摄像头", "体验优化", "巡检摘要与一键清理",
     "记录今天拍了几次、变化百分比；设置里「保留最近 7 天」一键清理。",
     "现在只有「有变化才叫你」，长期文件没人管。", "P2", "S", "想法", "我的建议", "和隐私清理合并做"),
    ("F24", "多语言", "新功能", "英文界面补全",
     "locale/en.json 已有骨架，把面板/清单/托盘的硬编码中文抽出来。",
     "如果以后给别人用，英文是门槛。", "P3", "M", "想法", "我的建议", "优先级最低，别为它拖慢主线"),
    ("F25", "桌面清单", "体验优化", "清单字体大小独立设置",
     "设置窗加「清单字号」滑块，和面板缩放分开。",
     "高分屏或坐远一点时，现在只能整体缩放。", "P3", "S", "想法", "我的建议", "注意行高与块高联动"),
    ("F26", "桌面清单", "体验优化", "清单展开/收起动画",
     "展开与收起加 250ms 缓动，不再是瞬间跳变；动画期间 tick 不覆盖高度。",
     "每天点很多次，顺滑感直接影响使用心情。", "P2", "S", "已完成", "我的想法",
     "点「く」展开/收起有缓动；tick 更新时不在动画中重置高度"),
    ("F27", "开发", "体验优化", "打磨计划入库",
     "xlsx、md、生成脚本放进仓库 planning/，README 加「打磨计划」一节指向它。",
     "计划不能只躺在桌面，换电脑/重装就丢。", "P1", "S", "已完成", "我的想法",
     "planning/ 三个文件存在；README 一节能点开；发版前对照「5-版本计划」"),
    ("F28", "目标", "新功能", "目标看板：步骤/进度/排进清单",
     "目标窗口改成卡片：每条目标可拆步骤、勾选、进度条、一键把步骤排进今日清单。",
     "现在目标只是文字记录器，不能推动执行。", "P1", "L", "进行中", "我的想法",
     "目标窗口能加步骤/勾选/进度条/排清单；重启后数据不丢"),
]

bugs = [
    # id, 模块, 严重度, 优先级, 标题, 现象/复现, 影响, 修复方案, 状态, 验证方式, 来源
    ("B01", "桌面清单", "S1", "P0", "删除无二次确认，连点会成片误删",
     "点条目右侧 ✕ 立即删除，只有 1.2 秒防抖；overlay.log 显示 16:33、16:58、17:30 各有连续 4–5 次 delete。",
     "已经发生三次误删，每次 4–5 条，任务直接丢。", "删除后 5 秒在卡片底部浮出「撤销」；或 ✕ 第一次变红「再点确认」；连点同一坐标不重复删。", "待做",
     "删一条后 5 秒内点撤销，条目回到原位置；连点 5 次只删 1 条。", "overlay.log 2026-11-09 17:30 + daylog"),
    ("B02", "桌面清单", "S1", "P0", "删除后无法还原：日志没记条目内容",
     "daylog 只写「清单划掉：卡片上删掉一条」，没有标题/时间/地点；plan-archive 只有当天快照，且会被覆盖。",
     "误删后只能靠聊天记录猜，恢复成本极高。", "软删除：条目加 deletedAt，保留 24 小时；daylog 写完整 JSON；新增 guide_plan restore。", "待做",
     "删一条 → daylog 能看到完整字段 → restore 能原样恢复。", "daylog 2026-11-09"),
    ("B03", "桌面清单", "S1", "P0", "17:30 恢复的 4 条又被删光，当前清单为空",
     "plan.json 现在是 {date:2026-11-09, items:[]}；overlay.log 17:30:44–54 连续四次 delete，正好是 HANDOFF 里恢复的 17:40/18:10/19:30/20:30 四条。",
     "今天下午排的计划全没了；HANDOFF 明确要求新会话先核对。", "先确认这四条还要不要：要就按 HANDOFF 原文恢复；不要就保持空清单。", "待确认",
     "plan.json 的 items 数量与内容符合你的选择。", "HANDOFF 第 40 行 + overlay.log"),
    ("B04", "悬浮球", "S2", "P1", "球拖到清单下面会被盖住",
     "为了让球「拖到哪停在哪」，删掉了自动让位逻辑；现在球和清单重叠时被清单压住。",
     "球找不到，得先收清单才能拖出来。", "重叠时点球置顶（Topmost 切换或 BringToFront）；或轻推 8px 让出边缘。", "待做",
     "把球拖到清单区域，点一下球能浮到最上层。", "HANDOFF 第 38 行"),
    ("B05", "宿主", "S2", "P1", "改 index.js 必须重启 DSH，没有热重载",
     "cordis.patch.yml 的 reload 文本要手动改；忘了就以为改动没生效。",
     "每次改宿主逻辑都要重启，迭代慢、容易误判。", "加 dev watcher：index.js 变更后自动 touch cordis.patch.yml 并等 disposed→ready；或写一键 dev 脚本。", "待做",
     "改一行 console.log，保存后 plugin.log 自动出现 disposed→ready。", "HANDOFF 第 50 行"),
    ("B06", "语音", "S2", "P1", "Edge TTS 首句延迟大",
     "实测 45 字合成耗时 15.4 秒；长句要等整段合成完才开始播。",
     "口播像卡住，打断节奏。", "改用 edge-tts 流式输出边合成边播；常用句缓存；或预合成下一句。", "待做",
     "同一句第二次播放 <1 秒起播；长句 2 秒内出声。", "CHANGELOG 2026-11-06 验证记录"),
    ("B07", "桌面清单", "S2", "P1", "到点提醒从未真实触发过",
     "planTick 写了提前 10 分钟与过点 15 分钟追问，但只在代码层检查过。",
     "最该可靠的功能没被验证，可能到点不响。", "明天挑一条任务实跑一次，记录提醒时间与文案。", "待做",
     "提前 10 分钟与过点 15 分钟各收到一次提醒。", "CHANGELOG 2026-11-04 待办"),
    ("B08", "桌面清单", "S2", "P1", "guide_plan auto 未实跑",
     "「拿目标和课表自动排 4–8 条」写好但没真正跑过一次。",
     "空清单时最省事的入口，可能是坏的。", "清空测试清单后跑一次 auto，检查时间冲突与地点。", "待做",
     "生成 4–8 条，无重叠、时间落在 06:00–22:30。", "CHANGELOG 2026-11-04 待办"),
    ("B09", "悬浮层", "S2", "P2", "多显示器 / 缩放变化后坐标错位",
     "overlay 逻辑单位按 1.5 物理像素换算，换屏或改缩放后标注、卡片、球可能偏。",
     "换投影/外接屏时教学标注指错位置。", "启动与 DisplaySettingsChanged 时重算 DPI；坐标统一走逻辑单位换算函数。", "待做",
     "把系统缩放从 150% 改到 100%，重启 overlay 后球/卡片仍在可见区域且标注对得上。", "HANDOFF 第 65 行"),
    ("B10", "悬浮层", "S3", "P2", "位置越界不回收",
     "分辨率变小后，保存的球/卡片/顶条坐标可能在屏幕外。",
     "窗口「消失」，用户以为崩了。", "Apply 时把 x/y 钳到工作区；越界则回默认位。", "待做",
     "手动把 state.json 的 x 改成 99999，重启后窗口回到屏内。", "我的建议"),
    ("B11", "日志", "S3", "P2", "plugin.log / overlay.log 无轮转",
     "plugin.log 已 314 KB、overlay.log 51 KB，只追加不清理。",
     "长期膨胀；真错误被噪音淹没。", "超过 1 MB 轮转一份 .1；启动时写分隔头。", "待做",
     "把阈值临时调到 1 KB，触发后生成 .1 文件。", "我的建议"),
    ("B12", "文档", "S3", "P2", "README / 功能清单落后于版本",
     "package.json 是 0.21.0，功能清单 xlsx 仍是 v0.20.0；README 部分描述没跟上 11-09 的改动。",
     "下个会话或换机器时会被旧文档误导。", "升版流程加一步「同步 README + 功能清单」，或本次一并更新。", "待做",
     "README 里能找到 11-09 的改删/收缩/拖动持久化。", "我的建议"),
    ("B13", "语音", "S2", "P1", "播报无法打断",
     "长播报中再触发 guide_say 或想停，旧语音继续念。",
     "两句叠在一起；想静音只能等。", "speak 前先 kill 旧 tts 进程；面板加「停」按钮/快捷键。", "待做",
     "播报中点停止，1 秒内静音。", "我的建议"),
    ("B14", "桌面清单", "S3", "P2", "remove 与 done 的日志文案混淆",
     "删除条目也写「清单划掉」，和打勾完成分不清。",
     "回看 daylog 时无法判断是完成还是删除。", "remove 写「清单删除：标题」，done 写「清单完成：标题」。", "待做",
     "删一条 / 勾一条，daylog 两种文案正确。", "daylog 2026-11-09"),
    ("B15", "数据", "S3", "P2", "截图与摄像头照片无清理策略",
     "shots/ 与 cam 图片只增不减，没有保留天数设置。",
     "隐私与磁盘占用。", "设置「保留最近 N 天」；启动时清理；手动「清空截图」。", "待做",
     "设置 7 天后，20 天前的文件被删、近 7 天保留。", "我的建议"),
    ("B16", "日志", "S2", "P1", "plugin.log 里大量 PowerShell 报错噪音",
     "搜 error 出现几十条 UnexpectedToken / RuntimeException，真错误混在里面。",
     "排障时先被噪音带偏。", "区分「脚本 stderr 正常输出」与「真异常」；只把非零退出+关键行记 error。", "待做",
     "正常跑一轮后 plugin.log 无 error 级噪音。", "plugin.log 2026-11-09"),
    ("B17", "悬浮层", "S3", "P3", "悬浮层崩溃后重启，状态可能瞬断",
     "进程崩溃后守护会拉起，但当前标注/字幕可能丢。",
     "讲课中途闪一下。", "重启后从 state.json 重放标注与面板；记录崩溃次数。", "待做",
     "kill overlay 进程后 3 秒内恢复且标注还在。", "我的建议"),
]

debts = [
    ("T01", "宿主", "拆分 index.js（4872 行单文件）",
     "工具注册、清单、语音、视频、指令、专注全挤在一个文件；改一处要全文搜。",
     "按 edict/focus/camera/video/kb/plan 拆模块，index.js 只做装配与注册。", "L", "P2", "待做", "CHANGELOG 2026-11-04 待办"),
    ("T02", "悬浮层", "拆分 overlay.ps1（3442 行 / 166 KB）",
     "窗口、清单、设置、托盘、TTS 全在一个 PowerShell 脚本里；改错一处整层起不来。",
     "拆成 lib/windows.ps1、card.ps1、settings.ps1、tray.ps1，由 overlay.ps1 dot-source。", "L", "P2", "待做", "我的建议"),
    ("T03", "测试", "建立冒烟脚本（改完必跑）",
     "现在靠手工：node --check、check-ps、20 个工具、窗口枚举、语音、视频各点一遍。",
     "写 tmp/smoke.ps1：语法检查 + 工具调用 + 窗口存在性 + 日志无 error，一条命令出报告。", "M", "P0", "待做", "我的建议"),
    ("T04", "日志", "统一错误处理与日志分级",
     "各模块自己拼字符串写 plugin.log，级别不统一；stderr 原样进日志。",
     "加 log(level, tag, msg)，轮转与脱敏集中处理；错误带堆栈摘要。", "M", "P1", "待做", "我的建议"),
    ("T05", "状态", "state.json 写入收敛",
     "多处直接 read-modify-write；并发时后写覆盖先写。",
     "单一 writer 队列 + 原子写（tmp→rename）；读方只读快照。", "M", "P2", "待做", "我的建议"),
    ("T06", "配置", "配置项集中与校验",
     "config 散在 index.js 与 state.json，取值靠默认值兜底，没有 schema。",
     "config.js 集中默认值 + 范围校验；启动时打印生效配置。", "M", "P2", "待做", "我的建议"),
    ("T07", "依赖", "Python 依赖可复现安装",
     "py/libs 直接提交二进制；edge-tts/aiohttp 版本靠现场装。",
     "requirements.lock + 安装脚本；wheel 缓存保留当前版本。", "S", "P1", "待做", "CHANGELOG 2026-11-04"),
    ("T08", "数据", "数据 schema 版本与迁移",
     "state/plan/goals 结构随版本变，旧文件靠默认值硬兼容。",
     "加 schemaVersion；迁移函数按版本逐级升级；备份旧文件。", "M", "P2", "待做", "我的建议"),
    ("T09", "安全", "本机 HTTP 接口收紧",
     "41999 端口只绑 127.0.0.1（需确认），但无 token；同机任意进程可驱动标注。",
     "保留本机绑定；加一次性 token 或仅允许同用户；敏感接口限流。", "S", "P2", "待做", "我的建议"),
    ("T10", "隐私", "截图/摄像头数据的保留与告知",
     "读屏截图与巡检照片落盘无上限，README 未写保留策略。",
     "默认保留 7 天；设置里可见「存了什么」；README 写清楚。", "S", "P1", "待做", "我的建议"),
    ("T11", "文档", "文档自动化（工具表从代码生成）",
     "README 的工具清单、功能清单 xlsx 靠手抄，容易漏。",
     "从 index.js 的工具定义生成 Markdown 表与 xlsx 页。", "M", "P3", "待做", "我的建议"),
    ("T12", "规范", "ESLint / Prettier / PSScriptAnalyzer",
     "index.js 与 ps1 无静态检查；风格靠自觉。",
     "加最小规则集（no-unused-vars、no-undef），CI 或 pre-commit 跑。", "S", "P3", "待做", "我的建议"),
]

versions = [
    ("v0.22", "稳住", "不再丢数据，把没验证的功能验掉",
     "B01 B02 B03 B13 B16 + T03 + B12", "2–3 天",
     "删除可撤销/可恢复；今天四条清单有结论；提醒与 auto 各实跑一次；冒烟脚本一条命令能跑。"),
    ("v0.23", "顺手", "每天都会用的交互补齐",
     "F02 F03 F04 F07 F08 F14 + B04 B05", "4–6 天",
     "清单能拖、能重复、能一句话加；顶条常驻；点任务直接开专注；改宿主不用手动重启。"),
    ("v0.24", "聪明", "AI 协作与反馈闭环",
     "F01（先选型）F13 F15 F16 + B06", "1 周+",
     "AI 协作方案落地一个；语音唤醒可用；日报能生成；TTS 首句 <2 秒。"),
    ("v1.0", "可维护", "拆开、测起来、能带走",
     "T01 T02 T04 T05 T08 T09 T10 + F11 F12 F20", "2 周+",
     "index.js <800 行；overlay 拆 4 个文件；冒烟覆盖 20 工具；数据有 schema 版本；便携模式可跑。"),
]

done_items = [
    ("0.22.0-dev", "2026-11-09", "桌面清单", "展开/收起 250ms 缓动动画（F26）", "代码审阅 + ParseFile 通过；待实机点一次", "待验证"),
    ("0.22.0-dev", "2026-11-09", "开发", "打磨计划放进 planning/ + README 一节（F27）", "目录与文件存在性检查", "沿用"),
    ("0.22.0-dev", "2026-11-09", "目标", "目标看板：步骤/进度/排进清单（F28）", "ParseFile 通过；待实机打开目标窗口", "待验证"),
    ("0.21.0", "2026-11-06", "语音", "Edge 晓晓替换 SAPI", "tts.ps1 45 字实测 15.4s，fallback 正常", "沿用"),
    ("0.20.0", "2026-11-09", "桌面清单", "条目可改可删、空档＋、可收缩、拖动持久化", "overlay.log + state.json + 截图", "沿用"),
    ("0.20.0", "2026-11-05", "桌面清单", "真实时间轴、历史归档、齿轮设置", "5 张表 + 手工回归", "沿用"),
    ("0.19.0", "2026-11-04", "顶部任务条", "秒级倒计时、大小可调", "截图 + 窗口枚举", "沿用"),
    ("0.18.0", "2026-11-04", "顶部任务条", "当前/最近任务常驻显示", "截图", "沿用"),
    ("0.17.0", "2026-11-04", "桌面清单", "右侧满屏时间轴 + 设置窗", "窗口枚举 + 截图", "沿用"),
]

tools = [
    ("guide_screen", "截图（自动隐藏悬浮层）", "返回 path/width/height/left/top"),
    ("guide_teach", "标注 + 面板", "annots、panel.steps、stepIndex、opacity"),
    ("guide_kb", "知识库", "list/read/save/delete，支持 md/docx"),
    ("guide_overlay", "悬浮层控制", "status/start/restart/stop"),
    ("guide_say", "口播 + 字幕", "≤60 秒，8–12 句"),
    ("guide_finish", "收尾", "done/aborted"),
    ("guide_clock", "时间与心跳", "时区、ticks 次数、上次时间"),
    ("guide_camera", "摄像头", "snap/pending/status/clear"),
    ("guide_journal", "当日流水", "remind/answer/activity/review/note"),
    ("guide_directive", "都市指令", "issue/close/list/goals/status"),
    ("guide_focus", "专注环", "start/stop/status/ping"),
    ("guide_plan", "桌面清单", "list/add/remove/done/undo/clear/show/hide/auto"),
    ("video_search", "B 站搜索", "关键词、排序、分页"),
    ("video_learn", "学视频", "抓字幕，WBI 签名"),
    ("video_note", "写摘要", "summary + points"),
    ("video_recall", "回忆", "搜标题/摘要/要点/字幕"),
    ("video_list", "视频库", "列表"),
    ("video_transcript", "字幕分页", "offset/nextOffset"),
    ("video_show", "详情", "分P、字幕数、摘要"),
    ("video_forget", "删除", "删 json + md"),
    ("video_cookie", "登录态", "保存 SESSDATA"),
]

# ---------- 样式 ----------
FONT = "微软雅黑"
NAVY = "1F3864"
BLUE = "2E5C9A"
LIGHT = "EEF3FB"
ZEBRA = "F7F9FC"
GREY = "666666"
thin = Side(style="thin", color="D9E1F2")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)


def title_font(size=14, color="FFFFFF", bold=True):
    return Font(name=FONT, size=size, bold=bold, color=color)


def body_font(size=10, bold=False, color="333333"):
    return Font(name=FONT, size=size, bold=bold, color=color)


def fill(color):
    return PatternFill("solid", fgColor=color)


def style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = title_font(10)
        cell.fill = fill(NAVY)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER
    ws.row_dimensions[row].height = 30


def style_body(ws, first_row, last_row, ncols, heights=36):
    for r in range(first_row, last_row + 1):
        ws.row_dimensions[r].height = heights
        for c in range(1, ncols + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = body_font()
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            cell.border = BORDER
            if (r - first_row) % 2 == 1:
                cell.fill = fill(ZEBRA)


def add_table(ws, ref, name):
    tab = Table(displayName=name, ref=ref)
    tab.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2", showFirstColumn=False,
        showLastColumn=False, showRowStripes=True, showColumnStripes=False)
    ws.add_table(tab)


def add_priority_cf(ws, col_letter, first_row, last_row):
    colors = {"P0": ("FFC7CE", "9C0006"), "P1": ("FFE699", "7F6000"),
              "P2": ("BDD7EE", "1F4E78"), "P3": ("E2EFDA", "375623")}
    for val, (bg, fg) in colors.items():
        ws.conditional_formatting.add(
            f"{col_letter}{first_row}:{col_letter}{last_row}",
            CellIsRule(operator="equal", formula=[f'"{val}"'],
                       fill=fill(bg), font=Font(name=FONT, size=10, bold=True, color=fg)))


def add_dv(ws, formula, rng):
    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(rng)


wb = Workbook()

# ================= 0-总览 =================
ws = wb.active
ws.title = "0-总览"
ws.sheet_view.showGridLines = False
widths = [6, 16, 16, 22, 22, 18, 14, 12]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w

ws.merge_cells("A1:H1")
c = ws["A1"]
c.value = "guide-tutor 打磨计划 · 2026-11"
c.font = title_font(20)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", horizontal="left", indent=1)
ws.row_dimensions[1].height = 46

ws.merge_cells("A2:H2")
c = ws["A2"]
c.value = "一句话：先稳住（不再丢数据）→ 再顺手（每天用得上）→ 后变聪明（AI 协作）→ 最后可维护（拆得开、测得动）"
c.font = Font(name=FONT, size=11, bold=True, color="1F3864")
c.fill = fill(LIGHT)
c.alignment = Alignment(vertical="center", horizontal="left", indent=1)
ws.row_dimensions[2].height = 30

ws.merge_cells("A3:H3")
c = ws["A3"]
NOW = datetime.now().strftime("%Y-%m-%d %H:%M")
c.value = f"当前版本 0.21.0　|　整理于 {NOW}　|　数据来源：README / HANDOFF / CHANGELOG / overlay.log / daylog / 代码实测　|　共 25 个想法、17 个问题、12 项技术债"
c.font = Font(name=FONT, size=9, color=GREY)
c.alignment = Alignment(vertical="center", horizontal="left", indent=1)

# KPI
kpis = [("想法池", "=COUNTA('1-想法池'!A4:A200)", "F"), ("Bug/问题", "=COUNTA('2-Bug与问题'!A4:A200)", "B"),
        ("技术债", "=COUNTA('3-技术债'!A4:A200)", "T"), ("P0 必做", "=COUNTIF('1-想法池'!G4:G200,\"P0\")+COUNTIF('2-Bug与问题'!D4:D200,\"P0\")+COUNTIF('3-技术债'!G4:G200,\"P0\")", "!")]
for i, (label, formula, _) in enumerate(kpis):
    col = i * 2 + 1
    ws.merge_cells(start_row=5, start_column=col, end_row=5, end_column=col + 1)
    cc = ws.cell(row=5, column=col, value=label)
    cc.font = Font(name=FONT, size=9, color=GREY)
    cc.alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells(start_row=6, start_column=col, end_row=6, end_column=col + 1)
    cc = ws.cell(row=6, column=col, value=formula)
    cc.font = Font(name=FONT, size=22, bold=True, color=NAVY)
    cc.alignment = Alignment(horizontal="center", vertical="center")
    cc.fill = fill(LIGHT)
    ws.row_dimensions[6].height = 38

# 三件要事
ws.merge_cells("A8:H8")
c = ws["A8"]
c.value = "现在最重要的三件事（本周只碰这三件）"
c.font = Font(name=FONT, size=12, bold=True, color="FFFFFF")
c.fill = fill(BLUE)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[8].height = 28

top3 = [
    ("1", "把「删除」做成可撤销、可恢复",
     "B01 删除撤销 + B02 软删除/回收站 + B14 日志写全。先止血，再谈新功能。"),
    ("2", "给今天被删的 4 条清单一个结论",
     "17:40 通读实验六报告 / 18:10 整理截图 / 19:30 给 BookController 加两个接口 / 20:30 读 Python。要就恢复，不要就空着。"),
    ("3", "把「写了但没验过」的功能验掉",
     "B07 到点提醒、B08 auto 排程，各实跑一次；顺手加 T03 冒烟脚本，以后改完一条命令回归。"),
]
r = 9
for num, head, detail in top3:
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=1)
    c = ws.cell(row=r, column=1, value=num)
    c.font = Font(name=FONT, size=16, bold=True, color=BLUE)
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    c = ws.cell(row=r, column=2, value=head)
    c.font = Font(name=FONT, size=11, bold=True, color="1F3864")
    c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=8)
    c = ws.cell(row=r, column=4, value=detail)
    c.font = Font(name=FONT, size=10, color="333333")
    c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[r].height = 42
    r += 1

# 路线图
row = 13
ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
c = ws.cell(row=row, column=1, value="版本路线图（按顺序做，不并行开坑）")
c.font = Font(name=FONT, size=12, bold=True, color="FFFFFF")
c.fill = fill(BLUE)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[row].height = 28

hdr = ["版本", "主题", "目标", "主要包含", "预计", "验收标准"]
row = 14
for i, h in enumerate(hdr, 1):
    if i == 6:
        ws.merge_cells(start_row=row, start_column=6, end_row=row, end_column=8)
    c = ws.cell(row=row, column=i, value=h)
    c.font = title_font(10)
    c.fill = fill(NAVY)
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.border = BORDER
ws.row_dimensions[row].height = 28
row = 15
for v in versions:
    vals = list(v)
    for i, val in enumerate(vals, 1):
        if i == 6:
            ws.merge_cells(start_row=row, start_column=6, end_row=row, end_column=8)
        c = ws.cell(row=row, column=i, value=val)
        c.font = body_font(10, bold=(i == 1))
        c.alignment = Alignment(vertical="center", wrap_text=True)
        c.border = BORDER
        if (row - 15) % 2 == 1:
            c.fill = fill(ZEBRA)
    ws.row_dimensions[row].height = 64
    row += 1

# 怎么用
row = 21
ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
c = ws.cell(row=row, column=1, value="怎么用这张表")
c.font = Font(name=FONT, size=12, bold=True, color="FFFFFF")
c.fill = fill(BLUE)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[row].height = 28

howto = [
    "① 想到什么，先写进「7-想法收件箱」，一句话就行，不用分类；攒到 3–5 条让我整理进想法池。",
    "② 每周只从「P0 / P1」里挑 1–3 条做，做完把状态改成「已完成」并补验证；没做的下移，不要同时开五个坑。",
    "③ 改任何代码/文档，同回合在 CHANGELOG.md 留四段：改了什么、为什么、怎么验证、怎么恢复。",
    "④ 版本发布前跑一遍「5-版本计划」的验收标准；不过就不发版，别用「应该没问题」糊过去。",
    "⑤ 优先级可以随时改，但「P0」最多 5 条——超过 5 条说明不是在排优先级，是在许愿。",
]
row = 22
for t in howto:
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=6)
    c = ws.cell(row=row, column=1, value=t)
    c.font = Font(name=FONT, size=10, color="333333")
    c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
    ws.row_dimensions[row].height = 26
    row += 1

# 数据提醒
ws.merge_cells(start_row=28, start_column=1, end_row=28, end_column=6)
c = ws.cell(row=28, column=1, value=f"⚠ 数据现状提醒（{NOW}）")
c.font = Font(name=FONT, size=11, bold=True, color="9C0006")
c.fill = fill("FFC7CE")
c.alignment = Alignment(vertical="center", indent=1)
ws.merge_cells(start_row=29, start_column=1, end_row=29, end_column=6)
c = ws.cell(row=29, column=1, value="plan.json 当前是空的（items: []）。overlay.log 17:30:44–17:30:54 连续四次 delete，对应 HANDOFF 里恢复的 17:40 / 18:10 / 19:30 / 20:30 四条。若是你在测删除，忽略这条；否则先恢复。")
c.font = Font(name=FONT, size=10, color="9C0006")
c.fill = fill("FFF2F2")
c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
ws.row_dimensions[29].height = 38

# ================= 1-想法池 =================
ws = wb.create_sheet("1-想法池")
ws.sheet_view.showGridLines = False
headers = ["编号", "模块", "类型", "标题", "想法说明", "价值 / 场景", "优先级", "工作量", "状态", "来源", "备注 / 验收"]
widths = [6, 12, 10, 30, 48, 36, 7, 8, 8, 20, 34]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.merge_cells("A1:K1")
c = ws["A1"]
c.value = "1 · 想法池（新功能 / 体验优化）"
c.font = title_font(14)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34
ws.merge_cells("A2:K2")
c = ws["A2"]
c.value = "优先级：P0 本周必做 / P1 下一版 / P2 以后 / P3 观望　　工作量：S ≤半天 / M 1–2天 / L 3–5天 / XL 一周+　　状态：想法 / 待确认 / 待做 / 进行中 / 已完成 / 搁置"
c.font = Font(name=FONT, size=9, color=GREY)
c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
ws.row_dimensions[2].height = 24
for i, h in enumerate(headers, 1):
    ws.cell(row=3, column=i, value=h)
style_header(ws, 3, len(headers))
for i, item in enumerate(ideas, 4):
    for j, val in enumerate(item, 1):
        ws.cell(row=i, column=j, value=val)
style_body(ws, 4, 3 + len(ideas), len(headers), 46)
for r in range(4, 4 + len(ideas)):
    ws.cell(row=r, column=1).alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(row=r, column=7).alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(row=r, column=8).alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(row=r, column=9).alignment = Alignment(horizontal="center", vertical="center")
add_table(ws, f"A3:K{3+len(ideas)}", "IdeaPool")
add_priority_cf(ws, "G", 4, 200)
add_dv(ws, '"P0,P1,P2,P3"', "G4:G200")
add_dv(ws, '"S,M,L,XL"', "H4:H200")
add_dv(ws, '"想法,待确认,待做,进行中,已完成,搁置"', "I4:I200")
add_dv(ws, '"新功能,体验优化,Bug,重构,文档,测试"', "C4:C200")
ws.freeze_panes = "D4"

# ================= 2-Bug与问题 =================
ws = wb.create_sheet("2-Bug与问题")
ws.sheet_view.showGridLines = False
headers = ["编号", "模块", "严重度", "优先级", "标题", "现象 / 复现", "影响", "修复方案", "状态", "验证方式", "来源"]
widths = [6, 12, 7, 7, 32, 48, 28, 42, 8, 32, 24]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.merge_cells("A1:K1")
c = ws["A1"]
c.value = "2 · Bug 与体验问题"
c.font = title_font(14)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34
ws.merge_cells("A2:K2")
c = ws["A2"]
c.value = "严重度：S1 丢数据/崩溃 / S2 明显不好用 / S3 小瑕疵　　S1 一律 P0。状态与优先级联动，改状态时顺手改优先级。"
c.font = Font(name=FONT, size=9, color=GREY)
c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
ws.row_dimensions[2].height = 24
for i, h in enumerate(headers, 1):
    ws.cell(row=3, column=i, value=h)
style_header(ws, 3, len(headers))
for i, item in enumerate(bugs, 4):
    for j, val in enumerate(item, 1):
        ws.cell(row=i, column=j, value=val)
style_body(ws, 4, 3 + len(bugs), len(headers), 58)
for r in range(4, 4 + len(bugs)):
    for col in (1, 3, 4, 9):
        ws.cell(row=r, column=col).alignment = Alignment(horizontal="center", vertical="center")
add_table(ws, f"A3:K{3+len(bugs)}", "BugList")
add_priority_cf(ws, "D", 4, 200)
add_dv(ws, '"S1,S2,S3"', "C4:C200")
add_dv(ws, '"P0,P1,P2,P3"', "D4:D200")
add_dv(ws, '"待确认,待做,进行中,已完成,搁置"', "I4:I200")
ws.freeze_panes = "E4"

# ================= 3-技术债 =================
ws = wb.create_sheet("3-技术债")
ws.sheet_view.showGridLines = False
headers = ["编号", "领域", "标题", "现状 / 风险", "建议做法", "工作量", "优先级", "状态", "来源"]
widths = [6, 10, 30, 46, 46, 8, 7, 8, 26]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.merge_cells("A1:I1")
c = ws["A1"]
c.value = "3 · 技术债与重构"
c.font = title_font(14)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34
ws.merge_cells("A2:I2")
c = ws["A2"]
c.value = "技术债不直接产生用户价值，但决定「以后还敢不敢改」。一次只还一笔，改完必须跑 T03 冒烟。"
c.font = Font(name=FONT, size=9, color=GREY)
c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
ws.row_dimensions[2].height = 24
for i, h in enumerate(headers, 1):
    ws.cell(row=3, column=i, value=h)
style_header(ws, 3, len(headers))
for i, item in enumerate(debts, 4):
    for j, val in enumerate(item, 1):
        ws.cell(row=i, column=j, value=val)
style_body(ws, 4, 3 + len(debts), len(headers), 52)
for r in range(4, 4 + len(debts)):
    for col in (1, 6, 7, 8):
        ws.cell(row=r, column=col).alignment = Alignment(horizontal="center", vertical="center")
add_table(ws, f"A3:I{3+len(debts)}", "TechDebt")
add_priority_cf(ws, "G", 4, 200)
add_dv(ws, '"S,M,L,XL"', "F4:F200")
add_dv(ws, '"P0,P1,P2,P3"', "G4:G200")
add_dv(ws, '"待做,进行中,已完成,搁置"', "H4:H200")
ws.freeze_panes = "D4"

# ================= 4-工具清单 =================
ws = wb.create_sheet("4-工具清单")
ws.sheet_view.showGridLines = False
headers = ["工具", "作用", "参数 / 说明"]
widths = [18, 26, 60]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.merge_cells("A1:C1")
c = ws["A1"]
c.value = "4 · 21 个工具速查（改工具时同步这页）"
c.font = title_font(14)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34
for i, h in enumerate(headers, 1):
    ws.cell(row=2, column=i, value=h)
style_header(ws, 2, len(headers))
for i, item in enumerate(tools, 3):
    for j, val in enumerate(item, 1):
        ws.cell(row=i, column=j, value=val)
style_body(ws, 3, 2 + len(tools), len(headers), 26)
for r in range(3, 3 + len(tools)):
    ws.cell(row=r, column=1).font = Font(name="Consolas", size=10, color="1F3864")
add_table(ws, f"A2:C{2+len(tools)}", "ToolList")
ws.freeze_panes = "A3"

# ================= 5-版本计划 =================
ws = wb.create_sheet("5-版本计划")
ws.sheet_view.showGridLines = False
headers = ["版本", "主题", "目标", "包含条目", "预计", "状态", "验收标准（不过不发版）"]
widths = [8, 10, 34, 30, 10, 8, 54]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.merge_cells("A1:G1")
c = ws["A1"]
c.value = "5 · 版本计划（按顺序，不开并行坑）"
c.font = title_font(14)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34
ws.merge_cells("A2:G2")
c = ws["A2"]
c.value = "发版流程：改代码 → 跑冒烟 → 更新 README/功能清单 → package.json 升版 → CHANGELOG 四段 → 同步 U 盘 → 这一页状态改「已发布」。"
c.font = Font(name=FONT, size=9, color=GREY)
c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
ws.row_dimensions[2].height = 24
for i, h in enumerate(headers, 1):
    ws.cell(row=3, column=i, value=h)
style_header(ws, 3, len(headers))
for i, item in enumerate(versions, 4):
    for j, val in enumerate(item, 1):
        col = j if j < 6 else j + 1   # 第 6 列留给「状态」，验收标准放到第 7 列
        ws.cell(row=i, column=col, value=val)
    ws.cell(row=i, column=6, value="计划中")
style_body(ws, 4, 3 + len(versions), len(headers), 76)
for r in range(4, 4 + len(versions)):
    ws.cell(row=r, column=1).alignment = Alignment(horizontal="center", vertical="center")
    ws.cell(row=r, column=5).alignment = Alignment(horizontal="center", vertical="center")
add_table(ws, f"A3:G{3+len(versions)}", "PlanList")
add_dv(ws, '"计划中,进行中,已发布,搁置"', "F4:F50")
ws.freeze_panes = "B4"

# ================= 6-已完成 =================
ws = wb.create_sheet("6-已完成")
ws.sheet_view.showGridLines = False
headers = ["版本", "完成日期", "模块", "做了什么", "怎么验证的", "现在还在用？"]
widths = [10, 12, 12, 46, 46, 12]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.merge_cells("A1:F1")
c = ws["A1"]
c.value = "6 · 已完成（只记近两个版本，长历史看 CHANGELOG.md）"
c.font = title_font(14)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34
for i, h in enumerate(headers, 1):
    ws.cell(row=2, column=i, value=h)
style_header(ws, 2, len(headers))
for i, item in enumerate(done_items, 3):
    for j, val in enumerate(item, 1):
        ws.cell(row=i, column=j, value=val)
style_body(ws, 3, 2 + len(done_items), len(headers), 34)
add_table(ws, f"A2:F{2+len(done_items)}", "DoneList")
ws.freeze_panes = "A3"

# ================= 7-想法收件箱 =================
ws = wb.create_sheet("7-想法收件箱")
ws.sheet_view.showGridLines = False
headers = ["序号", "日期", "一句话原话 / 想法", "我理解的意思", "归类（功能/Bug/债）", "处理状态"]
widths = [6, 12, 52, 52, 18, 10]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.merge_cells("A1:F1")
c = ws["A1"]
c.value = "7 · 想法收件箱（先记下来，不急着分类）"
c.font = title_font(14)
c.fill = fill(NAVY)
c.alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34
ws.merge_cells("A2:F2")
c = ws["A2"]
c.value = "想到什么就在这里写一行：日期 + 原话。攒到 3–5 条，拿给我，我整理进想法池/Bug/技术债，并在「我理解的意思」里帮你写清楚。"
c.font = Font(name=FONT, size=9, color=GREY)
c.alignment = Alignment(vertical="center", wrap_text=True, indent=1)
ws.row_dimensions[2].height = 26
for i, h in enumerate(headers, 1):
    ws.cell(row=3, column=i, value=h)
style_header(ws, 3, len(headers))
for r in range(4, 24):
    ws.cell(row=r, column=1, value=r - 3)
    for cidx in range(1, len(headers) + 1):
        cell = ws.cell(row=r, column=cidx)
        cell.font = body_font()
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = BORDER
    ws.row_dimensions[r].height = 30

inbox_items = [
    ("2026-11-09", "给每日清单提供动画，包括展开动画和收起动画",
     "清单卡片展开/收起要有缓动，不能瞬间跳变", "功能", "已进池"),
    ("2026-11-09", "把这个打磨计划存到插件内部去吧（文件里）",
     "打磨计划文件放进仓库 planning/，随插件一起走", "功能", "已进池"),
    ("2026-11-09", "把目标这个区块功能完善点，精致点，让他不是单纯的文字记录器",
     "目标要能拆步骤、看进度、直接排进今日清单", "功能", "已进池"),
]
for i, (d, raw, mean, cat, st) in enumerate(inbox_items):
    r = 4 + i
    ws.cell(row=r, column=2, value=d)
    ws.cell(row=r, column=3, value=raw)
    ws.cell(row=r, column=4, value=mean)
    ws.cell(row=r, column=5, value=cat)
    ws.cell(row=r, column=6, value=st)
add_dv(ws, '"功能,Bug,技术债,待定"', "E4:E200")
add_dv(ws, '"未整理,已进池,已排期,已做,不做"', "F4:F200")
ws.freeze_panes = "C4"

wb.save(OUT)
print("saved:", OUT, os.path.getsize(OUT))

# ================= Markdown 版 =================
md = []
md.append("# guide-tutor 打磨计划（2026-11）\n")
md.append("> 一句话：先稳住（不再丢数据）→ 再顺手（每天用得上）→ 后变聪明（AI 协作）→ 最后可维护（拆得开、测得动）。\n")
md.append("> 完整可编辑版：`打磨计划-2026-11.xlsx`（8 页，带筛选/下拉/优先级色块）。\n")
md.append("\n## 现在最重要的三件事\n")
md.append("1. **把删除做成可撤销、可恢复**：B01 撤销 + B02 软删除 + B14 日志写全。先止血。\n")
md.append("2. **给今天被删的 4 条清单一个结论**：17:40 通读实验六报告 / 18:10 整理截图 / 19:30 给 BookController 加两个接口 / 20:30 读 Python。要就恢复，不要就空着。\n")
md.append("3. **把「写了但没验过」的功能验掉**：B07 到点提醒、B08 auto 排程各实跑一次；加 T03 冒烟脚本。\n")
md.append("\n## 版本路线图\n\n")
md.append("| 版本 | 主题 | 目标 | 主要包含 | 预计 | 验收标准 |\n|---|---|---|---|---|---|\n")
for v in versions:
    md.append(f"| {v[0]} | {v[1]} | {v[2]} | {v[3]} | {v[4]} | {v[5]} |\n")
md.append("\n## P0 / P1 清单（本周到下一版）\n\n")
md.append("| 编号 | 模块 | 标题 | 优先级 | 工作量 | 状态 |\n|---|---|---|---|---|---|\n")
for item in ideas:
    if item[6] in ("P0", "P1"):
        md.append(f"| {item[0]} | {item[1]} | {item[3]} | {item[6]} | {item[7]} | {item[8]} |\n")
for item in bugs:
    if item[3] in ("P0", "P1"):
        md.append(f"| {item[0]} | {item[1]} | {item[4]} | {item[3]} | - | {item[8]} |\n")
for item in debts:
    if item[6] in ("P0", "P1"):
        md.append(f"| {item[0]} | {item[1]} | {item[2]} | {item[6]} | {item[5]} | {item[7]} |\n")
md.append("\n## 数据现状提醒\n\n")
md.append("`plan.json` 现在是空的（`items: []`）。`overlay.log` 2026-11-09 17:30:44–17:30:54 连续四次 delete，对应 HANDOFF 里恢复的 17:40 / 18:10 / 19:30 / 20:30 四条。若是测试删除，忽略；否则先恢复。\n")
md.append("\n## 怎么用\n\n")
md.append("- 想到什么，先写进 xlsx 的「7-想法收件箱」，一句话就行，不用分类；攒 3–5 条让我整理。\n")
md.append("- 每周只从 P0/P1 挑 1–3 条做；做完改「已完成」并补验证。\n")
md.append("- 改任何代码/文档，同回合在 `CHANGELOG.md` 留四段：改了什么、为什么、怎么验证、怎么恢复。\n")
md.append("- 发版前跑「5-版本计划」的验收标准；不过不发版。\n")
md.append("- P0 最多 5 条，超过就是在许愿，不是在排优先级。\n")
md_path = os.path.join(BASE, "打磨计划-2026-11.md")
with open(md_path, "w", encoding="utf-8") as f:
    f.write("".join(md))
print("saved:", md_path, os.path.getsize(md_path))

