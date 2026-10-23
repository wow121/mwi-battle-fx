# MWI 战斗动画（mwi-battle-fx）

银河奶牛放置（Milky Way Idle）油猴脚本：在战斗页"交战"旁加一个"舞台"标签，用杀戮尖塔式的侧视画面播放战斗——
角色和怪物的 AI 生成立绘（待机 / 蓄力 / 出手 / 受击 / 施法 / 倒下）、按地点和难度变化的背景、攻击跑位、弹道、受击、阵亡。

- 只在打开"舞台"标签时运行；不修改游戏原有界面，只读取游戏的 WebSocket 消息，不发送任何请求。
- 立绘从本仓库经 jsDelivr 加载：`assets/manifest.json` 列出已有素材。
- 角色用**游戏原版形象**：直接引用游戏自己的精灵图，画出战斗卡片上的头像 + 服装，手里拿着专门画的侧视武器和副手
  （复用纸娃娃的武器贴片，没有贴片的装备退回游戏图标；自己的装备总能读到，队友的要点开过一次对方的资料卡）。
  动作是整体前冲 / 后仰 / 倒下，加上武器按斩刺钝远程魔法挥动。
- 左上角显示当前地图和难度（如"魔像洞穴 T4"，普通 / 精英 / 噩梦三色），迷宫 / 公会试炼各有标签；中文界面下怪物用官方中文名。
- 公会试炼：公会页"进行中"标签里的试炼画面也换成舞台（读 `new_guild_battle` / `guild_battle_updated`）。全部玩家按阵型站位：
  坦克（放过嘲讽 / 挑衅 / 刺盾等或手持盾牌）在前，然后近战、远程，法师在最后；滚轮缩放、拖动平移、双击或 ⟲ 复位。
  只有自己和点开过资料卡的队友显示原版形象，其他人用职业通用立绘。
- 迷宫：战斗消息与普通战斗相同，`labyrinth_updated` 只用来切换背景。
- 远程：箭有发光尾迹和火花，出手时弓前闪光、命中沿弹道溅碎片；贯穿射击穿出光束，快速射击连发，箭雨先落一轮箭。
- 手持武器 / 副手按强化等级带光晕：+5 蓝、+8 紫、+10 橙（呼吸）、+12 红金（快速呼吸）、+15 起彩虹流转。
- 暴击伤害（按 `critCounter`）用金色大号斜体数字 + "暴击"标签，命中时加光环和更重的受击晃动。
- 95 级武器特效触发时武器闪一下对应颜色的光（炽焰 / 绽放 / 涟漪三叉戟、混沌连枷、裂空之弩、咒怨之弓、狂怒长枪、君王之剑、
  狮鹫重盾）。游戏不发送触发标记，按同一次战斗更新里的血量 / MP / 受击次数推断，机制参照 mwi-fastsim。
  有整图专属立绘的形象仍优先用专属立绘。
- "动画测试"标签里每个我方单位可选"游戏形象"，任意组合头像 / 服装 / 武器 / 副手预览；"武器闪光"按钮可预览特效光。
- 纸娃娃（`assets/doll/`）不再整体拼装（v0.9.1 起），只用其中的武器 / 副手贴片。

安装（发布版，推荐）：[release/mwi-battle-fx.user.js](https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/release/mwi-battle-fx.user.js)
——只有战斗画面，不带"动画测试"标签和调试菜单。

Greasy Fork 上的版本用"从网址同步"跟随 `release/mwi-battle-fx.user.js`（发布版不带 `@updateURL` / `@downloadURL`，
按油叉规则由各自的安装来源负责更新）。许可证：MIT（见 `LICENSE`）。

开发版：[mwi-battle-fx.user.js](https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/mwi-battle-fx.user.js)，多一个"动画测试"沙盒标签和调试菜单。
两个版本不要同时启用。发布版由 `tools/build-release.py` 从开发版生成（`publish.sh` 每次自动运行），不要直接改。
访问不了 GitHub 时用 jsDelivr 的固定版本地址。

## 素材生成（tools/）

参考图是游戏自身的精灵图（栅格化后作为 Codex 图像生成的参考），原始姿势表不入库。

1. `make-jobs.py <raw> base|tier` — 怪物姿势表、地点背景、难度变体的生成任务
2. `make-looks.py <raw> <looks.json>` — 玩家形象（脚本导出的待生成清单）
3. `gen.sh <raw> <jobs.tsv> [并发]` — 用 `codex exec` 逐个生成，已有的跳过
4. `build-assets.py` / `remote-build.sh` — 抠图、切帧、压缩为 webp，写 `assets/manifest.json`

纸娃娃（`tools/doll.py`）：`doll.py <raw> rig` 画一个纯色侧视假人（1024 画布）和各部件蒙版，
`doll.py <raw> jobs <gamedata 归档>` 为每个头像 / 服装 / 装备写一个任务——Codex 把它画**在假人身上**，所以所有图层天然同一坐标系。
`build-assets.py` 抠掉背景色和假人色，按蒙版切成 head / torso / arm / leg / weapon / off / back 部件（被遮住的躯干、腿根自动补色），
每层打成一张 `assets/doll/<id>.webp`，部件位置、武器朝向写进 `assets/doll/index.json`。
`tools/test/run-doll.sh <out> <spec.json>…` 在 109 上用真实脚本渲染组合 × 姿势的检查图。

立绘为基于游戏素材的二次生成，版权归原游戏所有，仅供玩家个人使用。
