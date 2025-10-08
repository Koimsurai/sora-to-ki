# 🚀 個人品牌強化更新 - Journey & Now 頁面

**更新日期：** 2025年10月7日  
**版本：** v2.2.0  
**更新類型：** 新功能、個人品牌建設、用戶體驗優化

---

## 📋 更新摘要

本次更新聚焦於**個人品牌建設**和**故事敘述**，新增兩個核心頁面來展示個人成長歷程和當前狀態。同時大幅增強 GitHub 活動展示功能，通過視覺化圖表讓訪客更直觀地了解開發活動。

### 核心改動
- ✨ 新增 `/journey` 個人成長時間軸頁面
- ✨ 新增 `/now` 當前狀態頁面（nownownow 運動）
- 📊 GitHub 活動頁面增強（貢獻熱度圖 + 統計卡片）
- 🎨 全新的視覺設計與動畫效果
- 🌟 提升個人品牌敘事能力

---

## 🎯 設計理念

### 1. Storytelling（故事敘述）

> "成功的個人網站不只是技術列表，更是在講一個『關於我』的故事。"

本次更新遵循現代個人品牌建設理念：

- **時間軸敘事**：透過 `/journey` 展示技術成長軌跡
- **真實性**：透過 `/now` 分享當下真實狀態
- **可視化**：用圖表和動畫增強故事的表現力
- **情感連結**：讓訪客感受到一個立體、真實的人

### 2. Personal Branding（個人品牌）

參考優秀案例：
- [Brittany Chiang's Portfolio](https://brittanychiang.com/)
- [Jacek Hirsz's Portfolio](https://jackhirsz.com/)
- [.in/thinking](https://.in/thinking)

---

## 🆕 新功能詳解

### 1. Journey 歷程時間軸 (`/journey`)

#### 功能概述
一個互動式的個人成長時間軸頁面，展示從第一次接觸程式設計到現在的重要里程碑。

#### 核心特性

**📍 時間軸節點**
```jsx
// 每個里程碑包含：
{
  year: '2015',
  title: '第一次接觸程式設計',
  subtitle: 'Hello World 的魔力',
  description: '詳細描述...',
  icon: '💻',
  color: '#00aaff',
  tags: ['啟蒙', 'C++'],
  image: '🌱'
}
```

**🎨 視覺設計**
- **波浪形時間軸**：使用 SVG path 繪製流暢的曲線
- **左右交錯布局**：奇數項在左，偶數項在右
- **動態顏色系統**：每個里程碑有專屬顏色主題
- **脈衝動畫**：節點指示器持續脈衝吸引注意

**💫 互動動畫**
```javascript
// 使用 Framer Motion 實現
- 滾動觸發動畫（whileInView）
- 節點放大縮小（hover scale）
- 詳情展開/收起（AnimatePresence）
- 標籤彈出效果
```

**📱 響應式設計**
- 桌面版：左右交錯的時間軸
- 平板/手機：垂直居中單列布局
- 自適應字體大小（clamp）

#### 技術實現亮點

**1. 滾動進度追蹤**
```jsx
const { scrollYProgress } = useScroll({
  target: containerRef,
  offset: ["start start", "end end"]
});

const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);
```

**2. SVG 動態路徑繪製**
```jsx
<motion.path
  d="M 50 0 Q 30 25, 50 50 T 50 100"
  style={{ pathLength: pathLength }}
/>
```

**3. 條件展開內容**
```jsx
<AnimatePresence>
  {activeIndex === index && (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      {description}
    </motion.div>
  )}
</AnimatePresence>
```

#### 數據內容結構

```
2015 → 第一次接觸程式設計 (Hello World)
2017 → 建立第一個網站 (HTML/CSS/JS)
2019 → 完成第一個 React 專案
2020 → 探索 Node.js 後端開發
2021 → 深入 Docker 與容器化
2022 → 探索 n8n 自動化工作流
2023 → 愛上天文攝影
2024 → 建立個人品牌網站
2025 → 持續探索與成長 (AI, Web3)
```

---

### 2. Now 當前狀態頁面 (`/now`)

#### 功能概述
受 [nownownow.com](https://nownownow.com/) 運動啟發，展示當前正在做的事情、學習的技術、生活狀態等。

#### 核心特性

**📚 正在學習**
```jsx
- WebAssembly（35% 進度）
- Three.js 進階技巧（60% 進度）
- Rust 語言（25% 進度）
```
- 進度條動畫
- 外部鏈接跳轉
- Hover 卡片效果

**🚀 進行中的專案**
```jsx
- 個人網站 v3.0（進行中）
- n8n 自動化工作流（規劃中）
- 天文攝影作品集（更新中）
```
- 狀態標籤（進行中/規劃中/更新中）
- 技術標籤展示
- 專屬顏色主題

**🌈 生活近況**
```
- 🎮 遊戲：最近在玩《薩爾達傳說：王國之淚》
- 📚 閱讀：《Designing Data-Intensive Applications》
- 🏃 運動：每週跑步 3 次
- 🎵 音樂：沉迷於 Synthwave 和 Lo-fi Hip Hop
```

**🎯 當前目標**
```jsx
{
  goal: '完成 10 個開源貢獻',
  progress: 40,
  deadline: '2025 Q4',
  icon: '💻'
}
```
- 進度條可視化
- 截止日期顯示
- 自動進度計算

**💭 最近的想法**
```
"技術的本質是解決問題，而不是炫技"
"好的設計應該是無形的，只有體驗留在心中"
"每一行代碼都是與未來的自己對話"
"保持好奇心，永遠像初學者一樣學習"
```

#### 視覺設計特色

**🎨 背景動畫**
```css
.gradient-orb {
  /* 三個漸層光球緩慢飄動 */
  animation: float-orb 20s ease-in-out infinite;
}
```

**⏰ 實時時鐘**
```jsx
const [currentTime, setCurrentTime] = useState(new Date());

useEffect(() => {
  const timer = setInterval(() => {
    setCurrentTime(new Date());
  }, 1000);
  return () => clearInterval(timer);
}, []);
```

**🌍 當前狀態 Meta 資訊**
```
📍 台灣 · 地球
🕐 即時時間
☀️ 最後更新日期
```

#### 設計理念

**溫暖與真誠**
- 柔和的漸層背景
- 友善的文案語調
- 真實的個人分享

**可維護性**
```jsx
const currentStatus = {
  lastUpdated: '2025-10-07',
  mood: '🚀',
  learning: [...],
  projects: [...],
  life: [...],
  goals: [...],
  thoughts: [...]
};
```
- 數據驅動設計
- 易於更新內容
- 模組化結構

---

### 3. GitHub 活動頁面增強

#### 新增功能

**🔥 貢獻熱度圖（Heatmap）**

視覺化展示最近 12 週的 GitHub 提交活動：

```jsx
// 貢獻等級顏色映射
level-0: 無活動（灰色）
level-1: 1-2 commits（淺藍色）
level-2: 3-5 commits（藍色）
level-3: 6-8 commits（紫色）
level-4: 9+ commits（粉紅色）
```

**特性：**
- 14×12 網格（7天 × 12週）
- Hover 顯示詳細 Tooltip
- 漸進式動畫載入
- 自適應滾動條

**實現細節：**
```jsx
// 生成貢獻數據
const generateContributionData = (events) => {
  const weeks = 12;
  const daysInWeek = 7;
  
  // 統計每天的 commit 數量
  const commitsByDate = {};
  events.forEach(event => {
    const date = new Date(event.created_at).toDateString();
    commitsByDate[date] = (commitsByDate[date] || 0) + 
      (event.payload.commits?.length || 1);
  });
  
  // 生成網格數據...
};
```

**📊 統計卡片組**

四個核心統計指標：

```jsx
1. Total Stars ⭐
   - 所有 repo 的 star 總和

2. Total Forks 🍴
   - 所有 repo 的 fork 總和

3. Repositories 📦
   - 公開專案總數

4. Recent Commits 📝
   - 最近提交數量
```

**設計特色：**
- 玻璃擬態效果（Glassmorphism）
- Hover 放大動畫
- 漸層數值顯示
- 彈性網格布局

**CSS 實現：**
```css
.stat-card-small {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card-small:hover {
  transform: translateY(-5px);
  box-shadow: 0 0 30px rgba(138, 43, 226, 0.3);
}
```

---

## 🎨 視覺設計系統

### 配色方案

**主題色彩：**
```css
--primary-purple: #8a2be2;      /* 主色調 */
--accent-blue: #00aaff;         /* 強調色 */
--accent-pink: #ff1493;         /* 輔助色 */
--success-green: #00ff7f;       /* 成功/完成 */
--warning-orange: #ff6d5a;      /* 警告/進行中 */
--info-cyan: #61dafb;           /* 資訊提示 */
```

**漸層組合：**
```css
/* Journey 標題 */
linear-gradient(135deg, #ffffff, #00aaff, #8a2be2, #ff1493)

/* Now 進度條 */
linear-gradient(90deg, #8a2be2, #00aaff)

/* 背景氛圍 */
linear-gradient(to bottom, #0a0a1a, #1a0a2e, #0f0a1a)
```

### 動畫系統

**Framer Motion 配置：**

```jsx
// 淡入向上
initial={{ opacity: 0, y: 30 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}

// 滾動觸發
whileInView={{ opacity: 1, y: 0 }}
viewport={{ once: true, margin: "-100px" }}

// Hover 效果
whileHover={{ scale: 1.05, y: -5 }}
whileTap={{ scale: 0.95 }}
```

**關鍵幀動畫：**

```css
/* 星空閃爍 */
@keyframes twinkle {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* 光球飄動 */
@keyframes float-orb {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -30px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
}

/* 脈衝效果 */
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
```

### Glassmorphism（玻璃擬態）

統一的毛玻璃效果：

```css
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
```

---

## 📁 文件結構

```
src/
├── components/
│   ├── Journey.jsx            # 新增：歷程時間軸
│   ├── Journey.css            # 新增：時間軸樣式
│   ├── Now.jsx                # 新增：當前狀態頁面
│   ├── Now.css                # 新增：當前狀態樣式
│   ├── Activity.jsx           # 修改：增強 GitHub 功能
│   └── Activity.css           # 修改：新增熱度圖樣式
├── App.jsx                    # 修改：註冊新路由
└── ...
```

### 代碼統計

| 文件 | 行數 | 說明 |
|------|------|------|
| Journey.jsx | ~350 行 | 時間軸組件邏輯 |
| Journey.css | ~600 行 | 時間軸樣式與動畫 |
| Now.jsx | ~400 行 | 當前狀態組件 |
| Now.css | ~550 行 | 當前狀態樣式 |
| Activity.jsx | +~80 行 | 新增貢獻圖功能 |
| Activity.css | +~180 行 | 熱度圖與統計樣式 |

**總新增代碼：** ~2,160 行

---

## 🔧 技術實現細節

### 1. 路由配置

```jsx
// App.jsx
const LazyJourney = lazy(() => import('./components/Journey'));
const LazyNow = lazy(() => import('./components/Now'));

// Routes
<Route path="/journey" element={
  <Suspense fallback={<LoadingFallback />}>
    <LazyJourney />
  </Suspense>
} />
<Route path="/now" element={
  <Suspense fallback={<LoadingFallback />}>
    <LazyNow />
  </Suspense>
} />
```

### 2. Framer Motion 進階用法

**滾動進度綁定：**
```jsx
const { scrollYProgress } = useScroll({
  target: containerRef,
  offset: ["start start", "end end"]
});

const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);
```

**佈局動畫：**
```jsx
<motion.div
  layoutId="activeTab"
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
/>
```

**條件渲染動畫：**
```jsx
<AnimatePresence>
  {activeIndex === index && (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      {content}
    </motion.div>
  )}
</AnimatePresence>
```

### 3. GitHub API 數據處理

**貢獻熱度圖演算法：**
```javascript
// 1. 統計每天的 commit 數
const commitsByDate = {};
events.forEach(event => {
  if (event.type === 'PushEvent') {
    const date = new Date(event.created_at).toDateString();
    commitsByDate[date] = (commitsByDate[date] || 0) + 
      (event.payload.commits?.length || 1);
  }
});

// 2. 生成 12 週網格數據
for (let week = 0; week < 12; week++) {
  for (let day = 0; day < 7; day++) {
    const date = new Date();
    date.setDate(date.getDate() - (week * 7 + day));
    const count = commitsByDate[date.toDateString()] || 0;
    
    // 3. 計算活動等級 (0-4)
    const level = 
      count === 0 ? 0 :
      count <= 2 ? 1 :
      count <= 5 ? 2 :
      count <= 8 ? 3 : 4;
    
    grid.push({ date, count, level });
  }
}
```

### 4. 響應式設計策略

**斷點系統：**
```css
/* 桌面優先 */
@media (max-width: 1024px) { /* 平板 */ }
@media (max-width: 768px)  { /* 手機橫屏 */ }
@media (max-width: 480px)  { /* 手機豎屏 */ }
```

**自適應字體：**
```css
font-size: clamp(2.5rem, 6vw, 4.5rem);
/* 最小 2.5rem, 理想 6vw, 最大 4.5rem */
```

**彈性網格：**
```css
grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
/* 自動填充，最小 320px，最大 1fr */
```

---

## 🌟 用戶體驗優化

### 1. 性能優化

**Lazy Loading（懶加載）：**
```jsx
const LazyJourney = lazy(() => import('./components/Journey'));
const LazyNow = lazy(() => import('./components/Now'));

// 只在用戶訪問時載入
<Suspense fallback={<LoadingFallback />}>
  <LazyJourney />
</Suspense>
```

**動畫優化：**
```jsx
viewport={{ once: true }}  // 只觸發一次，節省性能
transition={{ duration: 0.3 }}  // 快速流暢的動畫時長
```

**圖片優化：**
- 使用 Emoji 替代圖片圖標
- SVG 圖形（體積小、無損縮放）

### 2. 無障礙性（A11y）

```jsx
// Hover 效果同時支援鍵盤導航
whileHover={{ scale: 1.05 }}
whileFocus={{ scale: 1.05 }}

// 語義化 HTML
<section>
  <h2>Section Title</h2>
  <article>Content</article>
</section>

// ARIA 標籤
<button aria-label="展開詳細資訊">
  查看詳情 ▼
</button>
```

### 3. 移動端優化

**Touch 友善：**
```css
.card {
  /* 足夠大的點擊區域 */
  min-height: 44px;
  
  /* 禁用長按選擇 */
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
```

**滾動優化：**
```css
overflow-x: auto;
-webkit-overflow-scrolling: touch;  /* iOS 平滑滾動 */
scrollbar-width: thin;  /* 細滾動條 */
```

---

## 📊 功能對比表

| 功能 | 舊版 | 新版 (v2.2.0) |
|------|------|---------------|
| 個人故事敘述 | ❌ 無 | ✅ Journey 時間軸 |
| 當前狀態展示 | ❌ 無 | ✅ Now 頁面 |
| GitHub 活動視覺化 | ⚠️ 基礎列表 | ✅ 熱度圖 + 統計 |
| 動畫豐富度 | ⚠️ 一般 | ✅ Framer Motion 全面應用 |
| 個人品牌深度 | ⚠️ 技能展示為主 | ✅ 故事 + 真實性 + 溫度 |
| 互動性 | ⚠️ 有限 | ✅ 高度互動（Hover、展開、滾動） |

---

## 🎯 使用指南

### 如何訪問新功能

**Journey 時間軸：**
```
URL: https://yoursite.com/journey
或從導航欄點擊 "歷程" / "Journey"
```

**Now 頁面：**
```
URL: https://yoursite.com/now
或從導航欄點擊 "現在" / "Now"
```

**增強的 GitHub 活動：**
```
URL: https://yoursite.com/activity
查看 "代碼銀河" 標籤頁
```

### 如何更新內容

**更新 Journey 里程碑：**
```jsx
// src/components/Journey.jsx
const milestones = [
  {
    id: 10,  // 新增一個 ID
    year: '2026',
    title: '你的新里程碑',
    subtitle: '副標題',
    description: '詳細描述...',
    icon: '🎯',
    color: '#your-color',
    tags: ['tag1', 'tag2'],
    image: '🎨'
  },
  // ... 其他里程碑
];
```

**更新 Now 頁面內容：**
```jsx
// src/components/Now.jsx
const currentStatus = {
  lastUpdated: '2025-10-07',  // 更新日期
  mood: '🚀',  // 當前心情
  learning: [
    // 更新學習內容
  ],
  projects: [
    // 更新專案狀態
  ],
  // ... 其他內容
};
```

---

## 🚀 部署指令

```bash
# 安裝依賴（如果有新增）
npm install

# 開發模式測試
npm run dev

# 建置生產版本
npm run build

# Docker 部署
docker-compose down
docker-compose up -d --build

# 檢查容器狀態
docker-compose ps

# 查看日誌
docker-compose logs -f frontend
```

---

## 🌐 靈感來源與參考

### 優秀個人網站案例

1. **[Brittany Chiang](https://brittanychiang.com/)**
   - 簡潔優雅的設計
   - 強大的視覺層次感
   - 出色的動畫細節

2. **[Jacek Hirsz](https://jackhirsz.com/)**
   - 創意互動設計
   - 獨特的個人風格
   - 技術與藝術的完美結合

3. **[.in/thinking](https://.in/thinking)**
   - 思考筆記展示
   - 真實的個人分享
   - 溫暖的設計語言

### UI 組件庫參考

- [shadcn/ui](https://ui.shadcn.com/)
- [Aceternity UI](https://ui.aceternity.com/)
- [Radix UI](https://www.radix-ui.com/)
- [Magic UI](https://magicui.design/)
- [Cobe Globe](https://cobe.vercel.app/)

### nownownow 運動

- [nownownow.com](https://nownownow.com/)
- [Derek Sivers - /now page](https://sive.rs/now)

---

## 💡 設計原則回顧

### 1. 真實性優先
- 展示真實的成長歷程
- 分享當下的真實狀態
- 避免過度包裝和誇大

### 2. 故事為王
- 用時間軸講述成長故事
- 用 /now 頁面展現當下狀態
- 讓技術能力服務於故事敘述

### 3. 視覺驅動
- 用顏色傳達情感
- 用動畫增強體驗
- 用圖表可視化數據

### 4. 用戶中心
- 響應式設計適配所有設備
- 快速載入提升體驗
- 直觀的互動反饋

---

## 🔮 未來規劃

### 短期計劃（1-2 個月）

- [ ] 在 Header 導航欄添加 Journey 和 Now 入口
- [ ] Journey 頁面增加篩選功能（按年份、類型）
- [ ] Now 頁面增加 RSS 訂閱支持
- [ ] Activity 頁面增加語言分佈圖表
- [ ] 添加暗色/亮色主題切換

### 中期計劃（3-6 個月）

- [ ] GitHub 活動整合 PR、Issue 數據
- [ ] 增加 Blog 文章與 Journey 的聯動
- [ ] Now 頁面自動從 GitHub README 同步
- [ ] 增加 /uses 頁面展示工具和設備
- [ ] 添加簡單的後台管理更新 Now 內容

### 長期願景（6-12 個月）

- [ ] 實現多語言支持（中文/英文）
- [ ] 整合更多社交平台活動（Twitter, LinkedIn）
- [ ] 建立個人知識庫系統
- [ ] 添加訪客留言牆功能
- [ ] 開發 API 供其他應用調用

---

## 📝 測試檢查清單

### 功能測試
- [x] Journey 頁面正確顯示所有里程碑
- [x] Now 頁面所有模塊正常渲染
- [x] GitHub 貢獻熱度圖數據準確
- [x] 統計卡片計算正確
- [x] 所有動畫流暢運行
- [x] 路由跳轉無異常

### 響應式測試
- [x] Desktop (1920×1080) ✓
- [x] Laptop (1366×768) ✓
- [x] Tablet (768×1024) ✓
- [x] Mobile (375×667) ✓

### 瀏覽器兼容性
- [x] Chrome/Edge (最新版本) ✓
- [x] Firefox (最新版本) ✓
- [x] Safari (最新版本) ✓

### 性能測試
- [x] 首屏載入時間 < 3s
- [x] 動畫幀率 > 30fps
- [x] Lighthouse 分數 > 85

---

## 🙏 致謝

感謝以下資源和社群的啟發：

- **Framer Motion** - 強大的 React 動畫庫
- **nownownow 運動** - Derek Sivers 發起的真實分享文化
- **shadcn** - 優秀的 UI 設計靈感
- **GitHub Copilot** - AI 輔助開發工具
- **所有優秀的個人網站開發者** - 你們的作品給了我無限靈感

---

## 📞 問題與反饋

如有任何問題或建議，歡迎通過以下方式聯繫：

- **GitHub Issues**: [你的 Repo Issues](https://github.com/timo9378/web/issues)
- **Email**: your-email@example.com
- **Twitter**: @yourhandle
- **LinkedIn**: [你的 LinkedIn](https://linkedin.com/in/yourprofile)

---

## 📄 授權

本專案採用 MIT 授權條款

---

**版本歷史：**
- v2.2.0 (2025-10-07): Journey & Now 頁面 + GitHub 活動增強
- v2.1.0 (2025-10-06): 視覺優化與 Bug 修復
- v2.0.0 (2025-09-XX): 主要重構與性能優化
- v1.0.0 (2024-XX-XX): 初始版本發布

---

**最後更新：** 2025-10-07  
**文檔版本：** 2.0  
**作者：** Timothy (timo9378)

🚀 **讓我們繼續探索，打造更好的個人品牌！** ✨
