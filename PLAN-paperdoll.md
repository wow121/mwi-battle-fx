# 交接：人物纸娃娃（方案 B）

目标：不再要求用户导出形象。游戏里**所有**头像、服装、可见装备都能拼出侧视立绘，作为所有玩家的兜底；
已整图生成的专属形象（`assets/p/<look>`）优先级仍最高。

用户偏好：所有回复用中文；本机（Linux，6 GB）不跑重活——图片处理、浏览器测试都放 109（Windows），
Codex 生成可以在本机跑（主要是网络等待）。

---

## 1. 现状（2026-10-23）

- 已发布 **v0.8.4**（`9f17b7c` 之后又发过一次素材：磁力魔像受击翻转）。
- 本地有一个**未发布、未验证**的提交（v0.8.5）：
  - `preloadFx()` 预加载清单里全部 70 张特效（修复"增益技能第一次释放显示通用特效"）
  - 增益持续期间的光晕（`BUFF_LOOK` / `renderLook`）和无敌护盾泡（`.bfx-bubble`）
  - 先用 `tools/test/run-mock.sh <dir>` 验证（看动画测试页里放狂暴、物理光环后的帧），再 `tools/publish.sh "<msg>"`。

### 脚本结构（`mwi-battle-fx.user.js`）
| 模块 | 作用 |
|---|---|
| `ABILITIES` / `BUFF_SECONDS` / `MONSTERS` / `LOCATIONS` / `ZONE_LOC` / `MONSTER_LOC` | 从 `mwi-gamedata/archive/<ver>/data.json` 生成的静态表 |
| `units` / `onNewBattle` / `onBattleUpdated` / `resolve` | 真实战斗状态与"谁对谁做了什么"的判断 |
| `Assets` | 素材清单（先读 raw.githubusercontent，再退 jsDelivr），图片按 `manifest.rev` 固定提交号加载 |
| `Looks` | 玩家形象：头像/服装/装备采集 + 形象 id（hash）+ 缺失记录 |
| `Stage` | 侧视舞台。`attach(host, "test"/"live")`；显示的单位是 `shown` |
| `Live` | 叠在 `BattlePanel_battleArea` 上 + 右上角"切换到原版/动画"按钮 |
| `Lab` | "动画测试"标签：任意地图/怪物/我方/技能/自动战斗/怪物图鉴 |

### 真实消息字段（已用用户日志确认）
- `battle_updated.pMap/mMap[i]`：`cHP cMP mHP mMP atkCounter dmgCounter critCounter abilityHrid|isAutoAtk int isStunned`
- `atkCounter` +1 = 该单位出手；`dmgCounter` +1 = 该单位被打中（不掉血 = MISS）；`abilityHrid`/`isAutoAtk` 是**下一次**动作
- 自己：`init_character_data`（`character`、`characterItems` 带 `itemLocationHrid`、`characterActions`、`partyInfo`）；
  队友装备：`profile_shared.profile.wearableItemMap`（需要用户点开过资料）
- 战斗卡片头像（用户贴的 DOM 确认）：`.CombatUnit_model use[href*="avatars_sprite"]#person_default`、
  `use[href*="avatar_outfits_sprite"]#halloween_ghost`；怪物 `combat_monsters_sprite#<id>`

### 素材流水线（`tools/`，原始文件在 `~/mwi-art-raw`，不进 Syncthing）
- `~/mwi-art-raw/ref/lib/`：已栅格化的 **544 张** 游戏图标 512px PNG：`i_<item>.png`（9 个可见部位的全部装备）、
  `a_<avatar>.png`（101）、`o_<outfit>.png`（125）。头像和服装同一 100×100 坐标系，直接叠加即可还原游戏形象。
- 栅格化做法（需要新图标时）：python 从 `archive/<ver>/sprites/<sheet>.svg` 里抠 `<symbol id=…>` 写成独立 svg，
  scp 到 109，用 `chrome --headless=new --window-size=512,512 --default-background-color=00000000 --screenshot` 逐个截图。
- `make-jobs.py <raw> base|tier|vfx`、`make-looks.py <raw> <looks.json>`：写 Codex 任务（提示词在 `<raw>/prompts`）
- `gen.sh <raw> <jobs.tsv> [并发]`：`codex exec --skip-git-repo-check -i <ref>… - < prompt`，已有的跳过
- `remote-build.sh`：把 sheets 传到 109 跑 `build-assets.py`（抠图 / 切帧 / webp / manifest），结果拉回 `assets/`
- `publish.sh "<msg>"`：提交 → manifest 写 `rev` → 再提交 → push → 等 raw 生效。**不要裸 push**。
- `tools/test/`：`run-mock.sh`（109 上 headless Chrome 跑模拟页面截帧）、`replay.js`（node 回放真实消息测 `resolve`）、
  `review-poses.py`（在 109 上把怪物 6 姿势拼成检查图）

### 踩过的坑
- `codex exec -i` 是变长参数：提示词必须走 stdin（`-`）
- `gen.sh` 曾用 `xargs -L 1`，行尾空列会把多行拼成一行；已改为按 Tab 拆整行
- 抠图：怪物偏绿的用品红底（`make-jobs.py` 的 `key_for`），切帧按连通块归属格子并外扩 96px 边距
- **朝向我自己判断不可靠**（翻错过咬咬鱼）——以用户在游戏里看到的为准，写进 `tools/flip.txt`
- jsDelivr `@main` 会卡旧版本好几个小时、清缓存会被限流 → 清单和脚本更新走 raw.githubusercontent
- 特效图片未加载完会退回通用效果 → 要预加载
- 每次提交后给 Syncthing 发 `.git` 重扫（`publish.sh` 已包含）

---

## 2. 方案 B 设计

### 2.1 骨骼（侧视，面朝右）
部件（从后到前的绘制顺序）：披风（back）→ 后臂 → 后腿 → 躯干 → 前腿 → 头 → 前臂（手里拿主武器）→ 副手。
每个部件一个枢轴点（肩、髋、颈、腕）。动作由程序关键帧驱动（CSS transform / WAAPI），替代玩家的逐帧姿势：
`idle`（呼吸）、`windup`、`strike`（按风格：斩/刺/钝 挥臂、远程拉弓、魔法举手）、`hurt`（后仰）、`cast`、`dead`（倒地）。
舞台里现有的跑位、击退、特效、光环、状态标记都不用动，只把玩家的 `.bfx-sprite` 换成拼装的纸娃娃。

### 2.2 部件素材怎么生成
1. **基础小人模板**：先让 Codex 生成一个中性小人（MWI 风格、Q 版比例）的"部件拆分图"，每个部件单独摆在绿底格子里，
   并定下每个部件的尺寸和枢轴点（写进 `assets/doll/rig.json`）。这一步要人工核对。
2. **头像 → 头部**（101 张）：参考 `a_<avatar>.png`，画成同样大小、同样枢轴的侧脸头部（含发型），面朝右。
3. **服装 → 躯干 / 手臂 / 腿 三件**（125 张，每张一个多格表）：参考 `o_<outfit>.png`，按模板部件的轮廓画对应部位的衣服。
4. **装备**（约 250，`_refined` 外观相同的合并）：按部位生成贴片——头盔→头、身体→躯干(+手臂)、腿→腿、脚→腿下端、
   手→手、主手/双手→武器（握持点对齐前手）、副手→后手/前臂、背部→披风。
5. 每张生成时把**模板部件图**也作为参考图传进去，要求"画在这个轮廓上"，生成后按 bbox 自动缩放对齐到模板部件框。

### 2.3 选择顺序
整图专属形象（`p/<lookId>`）> 纸娃娃（按菜单里"按装备/按服装"拼）> 现在的通用职业立绘（最后兜底，可以删）。
纸娃娃需要的数据 `Looks.assign` 已经都有：`u.avatar`、`u.outfit`、`u.items[slot]`、`u.style`。

### 2.4 步骤（用户要求：不做试点，直接全量做完，中途不停下来确认）
1. 定模板小人和 `rig.json`（所有部件都对齐它）——这是全量流程的第一步，不是停下来等确认的试点。
2. 骨骼动画系统 + 对位校准（`tools/` 里加一个对位预览脚本，在 109 上出图自检；对不齐的自己修 prompt / 对位参数后重生成）。
3. **全量**生成：101 个头像、125 套服装、全部可见装备（约 250，`_refined` 外观相同的合并），约 480 张，2 并发约 4–8 小时；
   `build-assets.py` 加 `doll/` 分支（抠图、裁到部件框、webp），manifest 加 `doll` 列表。
4. 动画测试页加"纸娃娃"选项：任选头像/服装/各部位装备组合预览，自己逐类抽查。
5. 用 `tools/publish.sh` 发布，把结果和抽查截图汇报给用户。
