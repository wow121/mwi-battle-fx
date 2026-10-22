# MWI 战斗动画（mwi-battle-fx）

银河奶牛放置（Milky Way Idle）油猴脚本：在战斗页"交战"旁加一个"舞台"标签，用杀戮尖塔式的侧视画面播放战斗——
角色和怪物的 AI 生成立绘（待机 / 蓄力 / 出手 / 受击 / 施法 / 倒下）、按地点和难度变化的背景、攻击跑位、弹道、受击、阵亡。

- 只在打开"舞台"标签时运行；不修改游戏原有界面，只读取游戏的 WebSocket 消息，不发送任何请求。
- 立绘从本仓库经 jsDelivr 加载：`assets/manifest.json` 列出已有素材。
- 角色形象可在油猴菜单里切换"按装备 / 按服装"；还没有立绘的形象用通用职业立绘代替，
  菜单"导出待生成形象"可导出清单补生成。

安装：[mwi-battle-fx.user.js](https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/mwi-battle-fx.user.js)（访问不了 GitHub 时用 jsDelivr 的固定版本地址）

## 素材生成（tools/）

参考图是游戏自身的精灵图（栅格化后作为 Codex 图像生成的参考），原始姿势表不入库。

1. `make-jobs.py <raw> base|tier` — 怪物姿势表、地点背景、难度变体的生成任务
2. `make-looks.py <raw> <looks.json>` — 玩家形象（脚本导出的待生成清单）
3. `gen.sh <raw> <jobs.tsv> [并发]` — 用 `codex exec` 逐个生成，已有的跳过
4. `build-assets.py` / `remote-build.sh` — 抠图、切帧、压缩为 webp，写 `assets/manifest.json`

立绘为基于游戏素材的二次生成，版权归原游戏所有，仅供玩家个人使用。
