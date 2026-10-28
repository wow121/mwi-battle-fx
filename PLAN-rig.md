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
> 样板 `SKILL_FX`：火球、熔岩爆裂 / 火焰风暴、分裂斩、箭雨。用户满意后按同样方式铺开到其它技能（每种元素一套：水 / 冰、自然、物理）。
> 截图台 `drive-live.mjs <out> <试点> <按钮序号,…> <毫秒,…>`；.cmd 里 `call` 的参数带逗号要加引号（`"0,2,3"` + `%~3`）。
>
> **A 剩下的**：① 双手斩专属动作（现在是剑那套放慢），核对哥布林双手武器（弹弓、刺枪、爆炸杖）；② 各武器技能（v0.21.24 等反馈）；
> ③ 倒地时盾 / 小盾浮在身体上方（小问题）。之后进 B。

### B. 头像和时装（玩家，量大）
- 101 个头像 + 125 件时装，每个都要 Codex 画一层（对齐 `base_a.png`），然后跑切图流水线。
- 先写一个生成任务的脚本（参照 `tools/make-jobs.py` / `gen.sh` 的做法，`gen.sh <raw> <jobs.tsv> <并发>`，codex 在本机跑），
  分批生成、抽查对齐（`comp.py` 那种把基础小人轮廓叠上去看）。对不齐的重画。
- 切图脚本要从「单个试点」改成批量，每层独立（头像层、时装层各自切出 body / hm / ho / 胳膊 / head）。
- 已知瑕疵（可顺手解决）：肩膀是平切的、胳膊贴图两头直切、手伸远时胳膊纹理被拉长。用户同意过「让 Codex 画没有手臂的身体 +
  单独的圆头大臂小臂」这个方向，可以在批量前先试一个，效果好再定成标准。

### C. 怪物（95 种）
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
