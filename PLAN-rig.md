# 交接：骨骼动画补齐（长线任务）

> 写于 2026-10-28，开发版 v0.21.8（`846b50e`）。用户已确认方向：**失落城堡式「身体 + 漂浮的手（带可开关的胳膊）」**，
> 动作照失落城堡的参考图手工摆关键帧。任务：把所有玩家形象（头像 / 时装 / 武器握法）和所有怪物补齐，再接进真实战斗。
> 所有回复用中文；本机（Linux 6 GB）不跑重活，图片处理、浏览器测试放 109（Windows）。

## 0. 必读的规矩

- **只提交开发版**：只改 `mwi-battle-fx.user.js`（升 `@version`），不跑 `tools/publish.sh`、不提交 `release/`。用户说「可以发了」才发正式版。
  `build-release.py` 会改 `release/`，检查完 `git checkout release/`。
- **素材改动要固定版本**：提交素材 → `python3 -I tools/pin-manifest.py <该提交>` → 脚本里 `const ASSET_REV` 设成同一个提交 →
  再提交 → push → `curl https://purge.jsdelivr.net/gh/wow121/mwi-battle-fx@main/assets/manifest.json`。
  （v0.21.5 起，从 `@ASSET_REV` 取到的清单会把所有文件都按这个提交加载；正式版还没有这个修复，下次发版带上。）
- **每次提交后让 Syncthing 重扫**：文件夹 id 是 `9cdkn-uyw3k`（不是 config.xml 里的第一个），
  `curl -X POST -H "X-API-Key: …" "http://127.0.0.1:8384/rest/db/scan?folder=9cdkn-uyw3k&sub=mwi-battle-fx"`。
- **失落城堡只做参考**：它的解包数据和图片只在 109 的 `C:\Users\ruixi\fs-mine\lc-ref\`，**绝不能**把它的动画数据、图片放进仓库
  （仓库是公开的）。做法是看它的逐帧参考图，在我们的骨骼上自己重新摆关键帧。
- 用户只看效果，不想要编辑器；每做完一类，截定格图自查，再报给用户看。用户的反馈往往很具体（「从身后绕了一圈」「头裂开」），
  照着修即可。

## 1. 现状

### 测试页（`动画测试` 标签，全部在 `#dev` 里）
- `Lab`：1 号剑士（试点：头像 blue_person_1 + 时装 warrior_1 + 神圣剑 + 骑士盾，剑系技能）对**所有有骨骼的怪物**（目前只有磁力魔像），
  自动战斗、各种按钮、「胳膊：开/关」。怪物按 `MONSTER_SKILLS`（游戏数据生成）放自己的技能；`STUNS` 是能眩晕的技能（几率、时长）。
- `Arena`：PixiJS 8.14 + pixi-filters 6.1.5（jsDelivr 加载）。效果：泛光、剑光拖尾（普攻细白 / 技能粗彩）、技能名弹出、聚光、
  命中顿帧、镜头推、冲击环（`ring`）、穿身冲刺（`through`）、多段（`hits`）、眩晕星星、受击闪白、死亡溶解 / 散架。
- 动作：`ACTIONS[kind][name]` 关键帧。`kind` = `player` 或怪物 id。名字：`idle`、`attack`…`attack4`（普攻随机挑一套）、
  `skill:<技能key>`（专属）、`skill`（通用）、`hurt`、`cast`（增益 / 治疗）、`dead`（玩家；怪物死亡是散架 `rigCrumble`）。
  关键帧字段：`t`、`e`（缓动）、`a: { 部位: 角度 | [前, 上, 角度] }`、`x`/`y`（整体位移，身高为单位）、`r`（整体旋转）；
  动作字段：`dur`、`hit`、`hits`、`lunge`、`through`、`ring`、`color`、`loop`。
- 调试：`__mwiBattleFx.Arena.still('p'|'m', i, 动作名, 毫秒)` 定格某个姿势（`still(…, null)` 取消），`Arena.units()`、`Arena.play(events)`。

### 玩家骨骼（`assets/rig/player/`）
- 基础小人：明日方舟式四分之三侧身 Q 版，Codex 画的 `~/mwi-art-raw/rig/pl2/sheets/base_a.png`（光头、战斗站姿）。
- 每个头像 / 时装都是**画在这个基础小人上、逐像素对齐的一层**（Codex，提示词模板 `~/mwi-art-raw/rig/pl2/p_a_*.txt`、`p_o_*.txt`，
  参考图：`base_a.png` + 游戏里的正面头像 / 时装图 `~/mwi-art-raw/ref/lib/a_*.png`、`o_*.png`）。
- 切图流水线（脚本在 `~/mwi-art-raw/rig/pl2/`，仓库里有副本 `tools/rig-*.py`），顺序：
  1. `comp.py`：抠绿底、时装层去掉品红（未覆盖部分）→ `av.png` / `of.png`（复制成 `a_<头像>.png` / `o_<时装>.png`）
  2. `cutp.py a_… o_…`：切出身体（手臂抠掉、背后补色），写 `rig.json`
  3. `cuthands.py`：切出两只拳头 `hm`（后手 = 左手，主武器）、`ho`（前手 = 右手，副手）
  4. `cutarms.py`：胳膊——大臂 / 小臂贴图（`*_armf_up/lo`、`*_armb_up/lo`）、肩膀位置、长度、颜色
  5. `cuthead.py`：把头从身体层切出来（后臂从头和躯干之间穿过），身体层变为躯干
- `rig.json` 的 `avatars` / `outfits` 列出已画好的；没画的头像 / 时装目前用第一个顶替（试点期的写法，补齐后要改成「缺哪层就不画哪层 / 用默认」）。
- 武器：用纸娃娃现成的武器图（`Doll.held`，`assets/doll/`），挂在后手；副手挂前手。握持角度 `rot` 目前只为剑调过。

### 怪物骨骼（`assets/rig/<怪物id>/`）
- 磁力魔像：从它自己的待机立绘上切零件（`tools/rig-cut-magnetic-golem.py`），**不要让 Codex 重画**（用户说不像）。
  被挡住的部分用旁边颜色补。动作照失落城堡的花岗岩巨人（慢蓄力、快出手、长定住），死亡分先后散架。
- 怪物朝左；`face: "right"` 的是玩家。

### 失落城堡参考（109：`C:\Users\ruixi\fs-mine\lc-ref\`）
- `project\ExportedProject\Assets\`：AssetRipper 1.3.14 导出的工程（`AnimationClip\*.anim`、`Resources\*.prefab`、`Sprite`、`Texture2D`）。
- 渲染：`venv\Scripts\python render_lc.py <Assets> <prefab> <输出目录> <步长ms> [部位=图片名…] [scale=N] 动画名…`
  （副本：本机 `~/mwi-art-raw/rig/render_lc.py`，不进仓库）。
- 玩家：`Resources\character.prefab`，剑盾 `SHW_*`、双手 `THW_*`、双持 `DB_*`、长枪 `spear_*`、弓 `bow_*`、火枪 `gun_*`、法杖 `staff_*`；
  武器图用 `noumenon/Lhand/Lweapon=<图>`、`noumenon/Rhand/Rweapon=<图>` 装上（如 `SHW_imperialSword` / `SHW_imperialShield`）。
- 怪物：**预制体和动画名常常对不上**，先看预制体的 `Animator` 用哪个 `AnimatorController` / `AnimatorOverrideController`，
  再从 override 里的 clip guid 找动画名（花岗岩巨人 `GraniteGiant.prefab` 用的是 `rockGiant_*` + `attack2/attack3/dashAttack_0`）。
  渲染出来是静止的一团 = 动画路径和预制体对不上。
- 已有输出：`out\`（剑盾 23 个动作）、`out_gg\`（花岗岩巨人）。

## 2. 任务清单

### A. 武器握法与动作（玩家）
> **进度（v0.21.21，站立 + 普攻已过用户验收）**
> - 握法分组 `GRIPS` / `gripOf`：剑、锤、长枪、弩、法杖（含三叉戟、战斗法杖）、弓、重盾、双手斩；每组 `ACTIONS["player:<握法>"]`
>   （双手斩暂用剑那套 ×1.3 慢放；枪 + 盾用 `player:spear:shield`，枪画在盾上）。弩是单手，可配盾（弩画在盾前）。
> - 武器图来源：**长杆（法杖 / 三叉戟 / 长枪）用游戏自己的物品图标**，运行时从 items 图集渲染（`gameIcon`，带上 symbol 自身属性和
>   引用的 clipPath 等），轴线从像素算；**弩**和**书**是给骨骼重画的（`assets/rig/weapons/`，清单 `weapons`）：
>   弩 = Codex 侧视图（`tools/rig-weapons.py`），书 = 自己画平行投影线稿再让 Codex 照游戏图标的平面风格上色（`tools/rig-book-guide.py`，
>   握点 `RIG_GRIP`）；其余（剑、锤、弓、重盾、双手武器）还是纸娃娃图，轴线表 `WEAPON_AXIS`（`tools/rig-weapon-geom.py`）。
> - 副手按种类 `offOf`：盾（各套自己的前手动作）、书 / 遗物 / 匕首用 `OFF_TRACKS` 覆盖前手；匕首另加 `off:stab` / `off:slash` 普攻。
> - 飞行物 `shoot()`（箭 / 法球，`act.shot` 出手、`rain` 箭雨），从武器轴线头端（或弓手）出；弓弦只在射击时画。
> - 动画测试的 1 号可切 11 种武器组合。截图台：109 `C:\Users\ruixi\fs-mine\bfx-rig`（`drive-rig.mjs <out> <试点序号> <动作:毫秒,…>`，
>   assets 是仓库的目录联接，脚本要 scp 过去）。
>
> **经验（用户很看重）**：重画物件先画线稿（平行投影、对边平行，没有近大远小）再让 Codex 上色；画风照游戏图标（无描边、平涂、白饰边）；
> 厚度比例照游戏图标；手握位置要合理（书握书脊底部中间）。直的长兵器优先直接用游戏图标。截图要放大自己先查，不对别交。
>
> **技能动作 + 特效（v0.21.24，待用户验收）**：每种握法有本系常用技能的专属动作（v0.21.22：剑 致残斩；枪 破胆之刺 / 透骨之刺；
> 锤 重扫 / 重碾；重盾 盾击 / 重锤 / 重扫；弓、弩 快速射击 / 稳定射击 / 贯穿射击；法杖 冰枪术 / 缠绕 / 生命吸取 / 火焰风暴 / 剧毒粉尘·自然菌幕），
> 近战群体技能先冲到怪面前。用户说「没有之前华丽」指的是**换 PixiJS 之前的旧 DOM 舞台**（v0.21.23 误退回过，已恢复）。
> 旧舞台华丽在特效用法，v0.21.24 已移植：`Stage.fxSpec`（地面特效从脚底升起、按技能放大）、群体技能一张大图盖住整排（`groupAt`）、
> 法球 / 技能箭用自己的特效图飞并带拖尾（`shoot(…, { art })`）、施法脚下转魔法阵（`circle`）、射击闪光环（`muzzle`）、贯穿光束（`beam`）、
> 治疗 / 增益播自己的特效图（光环盖住全队）。尺寸系数 `FX_K`。
> 截图台另有 `drive-live.mjs <out> <试点>`（逐个点技能按钮，截整场 350/650/900/1150ms）。法杖竖起时手要前伸到 ≥0.45，否则杖身挡脸。
>
> **新引擎特效（v0.21.25，样板待验收）**：用户换引擎是为了特效更好看。通用部件：`emit()` 粒子（大小 / 颜色随寿命、阻力、被吸向某点、
> `tex: "streak"` 火花拖影、`"smoke"` 烟不发光）、`decal()` 地面贴花（焦痕 / 裂纹 / 插地的箭，淡出）、`haze()` 热浪扭曲、`zoomBlur()`、
> `slow()` 慢动作时钟（`now()` 是虚拟时钟）、`focusOn()` 镜头推近、`gather()` 蓄力汇聚、`rays()` 放射光、`crescent()` 剑气；
> 滤镜加在 `scene` 上（文字层在外面，不会被扭曲）；热浪只加在 `back`（背景 + 人物 + 烟），不扭曲特效本身（用户嫌扭曲太强、技能不清楚）。
> 配方 `sheet: false` = 自己画了这个技能，不再播旧舞台的特效图（用户：箭雨新旧两套同时播，只要一个）。所有技能：蓄力汇聚 + 命中放射光 / 火花，打击类加尘土和地裂，暴击 / 击杀慢动作。
> `SKILL_FX` 已覆盖所有玩家技能（v0.21.27）：元素小部件 `splash`（水）、`shatter`（冰）、`leaves` / 贴花 `vines`（自然）、`cloud`（孢子 / 烟）、
> `debris`（碎石）、`through`（穿透喷溅）、`shockRing`、`ripple`、`bubble`；治疗 `healFx`、增益 `buffFx` + `BUFF_FX`（颜色 + 各自的小效果）。
> **v0.21.28：新引擎不再用任何特效图**（用户要求「全部换成新引擎自己画」；旧 DOM 舞台还用它自己的）。程序绘制：`flameColumn` / `fireTornado` /
> `fireExplosion`、`waterColumn`、`iceSpikes`、`vinesGrow`、`petalVortex`、`slashArc`、`thrust`、`impactStar`、`claws`、`pillar`（光柱）、
> 法球（光晕 + 白芯 + 元素拖尾）、`circle`（符文魔法阵）。每个技能的主体在 `MAIN`，其余按元素 + 攻击类型走 `hitFx`。
> 经验：叠加层的粒子太密太亮会被泛光烧成一团白（火、水都踩过），火要稀、半透明、橙红为主；水用普通混合画实体柱子才像水。
> v0.21.29–30：流水冲击 = 一道浪从杖头涌到怪身上拍碎（无弹道，`release` 钩子在出手时触发）；法力喷泉 = 蓝紫色高喷泉 + 怪脚下符文阵；
> 缠绕 = 粗藤蔓螺旋缠身（背后那段画在身后，整根连续描边）；自然菌幕 = 绿色光幕垂落 + 菌丝 + 孢子 + 小蘑菇（`pre` 钩子，命中前 450ms 落下）。
> **技能特效已过用户验收（2026-10-28，「可以了」）。** 怪物技能走同一套，但没单独检查过；5 对 5 满场帧率没实测。
> 截图台 `drive-live.mjs <out> <试点> <按钮序号,…> <毫秒,…>`；.cmd 里 `call` 的参数带逗号要加引号（`"0,2,3"` + `%~3`）。
>
> **A 收尾（v0.21.31，待用户验收）**：双手斩有了自己的一套（`ACTIONS["player:great"]`，照失落城堡 THW_*：待机武器头拖在身后，
> 重砸 / 横扫 / 上挑接砸 / 跳劈…，前手跟着武器走，只摆后手）；哥布林重锤也用它。哥布林双手武器核对过：**刺枪其实是一对交叉的十手**
> （`ICON_CUT` 用遮罩把图标拆成一把，主副手各一把，握法 `sai` = 剑的动作 + 匕首副手）；爆炸杖图标头在左下（`ICON_FLIP`）；
> 弹弓握手柄、不画弦（`GRIP_AT`，图上自带皮筋）。倒地时盾落在腰旁地上（躺倒时手也会被抬高 0.3 身高，落地要 y≈-0.5）。
> 测试页加了 4 个哥布林试点。截图台：109 `bfx-rig\shot.cmd <out> <试点> "<动作:毫秒,…>"`（列表必须带引号，cmd 按逗号拆参数）。

### B. 头像和时装（玩家，量大）
> **新画法（v0.21.33，用户定的：无手臂身体 + 圆头胳膊零件）**——每层两张 Codex 图，原始图在 `~/mwi-art-raw/rig/pl3/sheets/`：
> - `<名字>.png`：对齐 `noarms_a.png`（Codex 画的无手臂基础小人，肩膀是圆的）画的无手臂身体。不用再抠手臂补色，尾巴 / 长袍不会被切断。
> - `<名字>_parts.png`：照版式图 `guide_parts.png`（`tools/rig-player-guide.py`：四段胶囊 = 前 / 后 × 大臂 / 小臂，按 rig.json 骨长，
>   2 倍尺寸；下排两个拳头取自基础小人）重画的胳膊和拳头；时装是袖子 / 护腕 / 手套，没覆盖的地方品红。生成时把画好的身体当参考 2。
> - 流程：`tools/make-rig-player-jobs.py ~/mwi-art-raw body <名字…|--all>` → `tools/gen.sh ~/mwi-art-raw/rig/pl3 <jobs-body.tsv> 3`
>   → 同样跑 `parts` 阶段 → 109 上 `C:\Users\ruixi\fs-mine\rigpl3\`：`python rig-player-layers.py sheets out <名字…>`
>   （sheets 里要有 noarms_a.png 和两张图；out 里先放 rig.json；脚本旁要有 rig-player-guide.py）→ copy 到 Windows 仓库
>   assets\rig\player、scp 回本机 → 提交素材 → pin → ASSET_REV。
> - 胶囊左端圆心 = 关节，`arms.pad = [大臂, 小臂]`；头按「下巴以上与头相连」切；时装品红按色相抠 + 清接缝。
> - 检查图 `check-<第一个>.png`：身体叠基础轮廓 + 零件，分数 body / spill / 各零件覆盖率。
> - **Codex 时装零件会随机画错袖长**（海盗泡泡袖只画肩头、战士多画了护手、游侠护腕画到拳头上），同一提示词重画一次就对。
>   全量时必须逐张看检查图，错的把旧图改名 `.vN.png` 再跑（gen.sh 跳过已有的）。头像零件 12 张全对。
> - 提示词已写进去的教训：零件两端不许画深色端帽（否则肩肘出现「球关节」）；保留下侧阴影；袖子按「从肩往下延伸到哪」描述。
> - **全量完成（v0.21.36，素材 32a7699）：101 个头像 + 125 件时装全部画完、逐张检查过。**
>   驱动脚本在 `~/mwi-art-raw/rig/pl3/`（不进仓库）：`full.sh`（20 层一批：body 再 parts）、`review.sh <批号>`（被拦的头像改画头、
>   切图、拆检查图、拼参考图）、`cut.sh <名字…>`（传到 109 切，拷回两边仓库；**一次只能跑一个**，109 的 rig.json 是共用的）、`refs.sh`。
> - 头像约五分之一（多是人类动漫脸）被 Codex 输出审核按「sexual」拦掉，肤色紧身衣也拦。改用 `bodym` 阶段：只画头（脸、头发、耳、尾、翅膀），
>   身体涂品红；`rig-player-layers.py` 用基础小人身体按胳膊零件的肤色重新上色填进去（保留明暗和描边）。
> - 反复画错的层：在 `pl3/hints.tsv`（名字、阶段、说明）写一句针对这件的话，make-jobs 会把它接到这件的提示词后面，重画一次基本就对。
>   常见错：长袖只画大臂（最多）、青绿色被画成蓝 / 藏青（jbq、dress_10、tshirt_brewing/intelligence、suit_8、uniform_foraging）、护腕画在肘端。
>   全量共重画约 30 层，时装大约每批 3/20。

- 101 个头像 + 125 件时装，每个都要 Codex 画一层（对齐 `base_a.png`），然后跑切图流水线。
- 先写一个生成任务的脚本（参照 `tools/make-jobs.py` / `gen.sh` 的做法，`gen.sh <raw> <jobs.tsv> <并发>`，codex 在本机跑），
  分批生成、抽查对齐（`comp.py` 那种把基础小人轮廓叠上去看）。对不齐的重画。
- 切图脚本要从「单个试点」改成批量，每层独立（头像层、时装层各自切出 body / hm / ho / 胳膊 / head）。
- 已知瑕疵（可顺手解决）：肩膀是平切的、胳膊贴图两头直切、手伸远时胳膊纹理被拉长。用户同意过「让 Codex 画没有手臂的身体 +
  单独的圆头大臂小臂」这个方向，可以在批量前先试一个，效果好再定成标准。

### C. 怪物（95 种）
> **批量方法（v0.21.37，哥布林 6 只做通，待用户验收）**：每只怪两张 Codex 图，都是描它的待机立绘（原始图在 `~/mwi-art-raw/rig/mon/sheets/`）：
> - `<id>_seg.png` 分区图：同一轮廓按部位涂纯色（红 = 躯干含头 / 黄 = 有脖子的头 / 蓝、青 = 画面左、右的胳膊 / 白 = 手里拿的东西 /
>   绿、品红 = 左、右腿），参考图白底。
> - `<id>_trunk.png` 躯干件：去掉胳膊、武器、脚，把被挡住的身体补完整（背景自动挑离怪物颜色最远的绿 / 品红 / 蓝）。
> - 流程：`tools/make-rig-monster-jobs.py ~/mwi-art-raw seg|trunk <id…>` → `tools/gen.sh ~/mwi-art-raw/rig/mon <jobs-*.tsv> 3` →
>   `python3 -I tools/rig-monster.py <id> <seg> <trunk> assets/rig/<id> --check <png>`（numpy + PIL，本机 venv 几秒一只）。
>   所有像素都取原图，躯干被挡住的部分用躯干件补（颜色按原图线性校正）。脚本从形状自动算：肩、握武器的拳（胳膊离肩最远的一端）、
>   哪只手握（武器较窄的一端 = 柄，挨着哪只手）、尖端、双持（两件分开各近一只手）、双手握（另一只手的远端搭在武器上 → `two`）、
>   前后层次（胳膊落在躯干件轮廓里 = 画在身体前面）、各肢体静止方向 `aim`。形状骗人的怪在 `tools/rig-monster.json` 写修正
>   （咻咻：弹弓的皮筋端不是柄，`{"weapon":"arm_l"}`）；Codex 画错的在 `~/mwi-art-raw/rig/mon/hints.tsv` 加一句重画（锤锤躯干件留了棒子）。
> - 零件名：`torso`（髋部为轴）、`arm_m`（握主武器）、`arm_o`、`weapon` / `weapon_o`、`leg_f` / `leg_b`（挂在躯干上）。`crumble: false` = 倒地而不是散架。
> - 动作模板 `MT`（脚本里）：`MT[体型]` + `MT[体型:攻击类型]`（slash / stab / smash / ranged / magic，按 `MONSTERS` 的 style），
>   怪物自己的 `ACTIONS[id]` 优先。**胳膊和武器写的是方向**（0 下、90 指向敌人、180 上、-90 身后；`weapon: "rest"` = 保持原画朝向），
>   `monsterActions` 按各自的 `aim` 换算成转角、转手腕让武器指向目标；双手武器两臂一起转；躯干前倾会加回去，方向始终是对地面的，脚不离地。
>   `rel: true` 的动作（待机、受击、倒地）是相对静止的转角。
> - 体型 `biped`（哥布林式短身两脚）参考失落城堡哥布林（109 `lc-ref\out_gob*`：狂战士 / 盗贼 / 法师 / 射手），渲染前先用
>   `lc_ctrl.py <Assets> <预制体…>` 查 override 里的动画名。
> - 截图（脚本副本在 `~/mwi-art-raw/rig/mon/`：`shot.sh` 一条命令同步 + 截图 + 取回）：109 `bfx-rig\mon.cmd <out> <地图> "<动作:毫秒,…>"`（`drive-mon.mjs`：每只怪单独定格、其他隐藏，6 列拼图）；
>   `drive-mon.mjs <out> <地图> angles,<动作:毫秒,…>` 打印各零件世界角度。动画测试页显示所选地图里有骨骼的怪（最多 6 只）。
> - **坑**：素材只能靠 Syncthing 送到 109（`scan` 后轮询内容一致），**不要 scp 进同步目录、更不要在 109 上删**——会冲突，删除还会同步回本机。
>   本机跑 Codex 时很卡，切图脚本也会慢。
> - **体型 `robed`（v0.21.38，巫师之塔 5 只）**：长袍无脚，从下摆摇；攻击沿用 biped 的（`MT[体型:类型]` 没有就用 `biped:类型`）。
>   分区图加了橙色 = 漂浮物（法球、雪花），每块单独成 `float1…`，引擎里各自上下浮动、死亡时淡出；原图里不与身体相连才算漂浮物
>   （红黄交界抗锯齿会出橙色细条，归给相邻部位）。倒地抬升按动作的 `lift`（默认 0.3 身高；长袍绕下摆转，0.05）。
>   体型在 `tools/rig-monster.json` 里按怪写 `{"tmpl":"robed"}`。
> - **熊熊星球（v0.21.39）**：软糖熊、熊猫、小熊猫站着，直接用 `biped`（空手，攻击按胳膊方向）。黑熊、棕熊、北极熊是四足 `quad`：
>   分区图和躯干件有自己的提示词（`make-rig-monster-jobs.py` 按 `rig-monster.json` 的 tmpl 选）：黄 = 头，蓝 / 青 = 前腿近 / 远，
>   绿 / 品红 = 后腿近 / 远；躯干件去掉头和四条腿。零件 `head`（+ = 低头咬）、`leg_fn/leg_ff/leg_bn/leg_bf`（画在身体后面，切口藏住），
>   躯干绕后腿根转（- = 人立）。参考失落城堡僵尸野猪（`out_boar`：低头蓄力、猛地上挑、肚皮着地死）。
>   动作：stab = 扑咬，slash = 人立挥爪，smash = 人立双掌拍地，普攻 2 都是咬。人立超过约 -30° 后腿会和身体脱开，模板都压在这以内。
>   倒地允许 y 为负（趴下）。
> - 已知不足：躯干件补的地方偶有淡淡的胳膊残影（锤锤、咻咻肚子上）；双手握的轰轰火把只能在腰部高度平推（刚体胳膊，手腕不能单独转）；
>   刺刺的副手叉子在身后那只手上，举起时手被身体挡住、叉子像悬空。
- 每只怪物：从它自己的 6 张姿势立绘（`assets/m/<id>/idle.webp` 等）里，从待机立绘切零件（不要重画），补被挡住的部分，写 `rig.json`。
- 按体型做动作模板（人形、四足、软体、飞行、块状、鱼类…），同类共用，首领单独做；每个模板找失落城堡里体型相近的怪物当参考。
- 技能按 `MONSTER_SKILLS`：伤害技能做攻击类动作，治疗 / 增益做施法动作；眩晕等状态按 `STUNS` 的几率（实战用消息里的状态）。
- 切零件需要每只怪物单独定多边形和关节，工作量大：先挑一种体型做通、做出批量方法，再铺开。

### D. 接进真实战斗
- 现在只有测试页用 PixiJS。正式战斗舞台（`Stage`，DOM / CSS）还是旧的整张立绘。全部补齐后，把 `Arena` 接到真实战斗消息上
  （`units` / `resolve` 产生的事件和测试页的 `play(evs)` 形状一致），替换旧舞台；眩晕用消息里的 `isStunned`。
- 性能：一场战斗最多 5 对 5 + 公会战更多人，注意 PixiJS 的帧率（以前用户关心过卡顿）。

## 3. 建议的顺序
1. A 的武器分组 + 剑盾以外的 2~3 种握法（各自先用试点形象），给用户看。
2. B 的批量流水线：先 5 个头像 + 5 件时装试跑，确认对齐和切图质量，再全量。
3. C：先做通一种体型（人形，比如巫师 / 哥布林），再铺开。
4. D：接实战。
每完成一块就提交开发版、截图给用户确认；不要一次性做完再给用户看。
