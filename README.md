# MWI 战斗动画（mwi-battle-fx）

银河奶牛放置（Milky Way Idle）油猴脚本：在战斗页"交战"旁加一个"舞台"标签，用杀戮尖塔式的侧视画面播放战斗——
角色和怪物的 AI 生成立绘（待机 / 蓄力 / 出手 / 受击 / 施法 / 倒下）、按地点和难度变化的背景、攻击跑位、弹道、受击、阵亡。

- 只在打开"舞台"标签时运行；不修改游戏原有界面，只读取游戏的 WebSocket 消息，不发送任何请求。
- 立绘从本仓库经 jsDelivr 加载：`assets/manifest.json` 列出已有素材。
- 角色用**纸娃娃**拼装：游戏里全部头像、服装和可见装备都有侧视部件，按玩家的头像 + 服装 + 装备叠出来，
  动作由骨骼驱动（待机 / 蓄力 / 出手按斩刺钝远程魔法区分 / 受击 / 施法 / 倒下）。油猴菜单可切换"按装备 / 按服装"
  （按服装时只叠武器和副手）。有整图专属立绘的形象仍优先用专属立绘。
- "动画测试"标签里每个我方单位可选"纸娃娃"，任意组合头像 / 服装 / 各部位装备预览。

安装：[mwi-battle-fx.user.js](https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/mwi-battle-fx.user.js)（访问不了 GitHub 时用 jsDelivr 的固定版本地址）

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
