// 自我介紹、經歷、社團、技能的資料表。舊版的 AboutMe / WorkExperience / SchoolClubs / Expertise
// 與自由落體版的 AboutFall 共用。
export interface QuickFact {
  label: string;
  value: string;
}

// Quick Facts label 是英文(不翻),value 隨語系變
export const QUICK_FACTS_BY_LANG: Record<string, QuickFact[]> = {
  'zh-TW': [
    { label: 'Born', value: '2004 · 雲林' },
    { label: 'School', value: 'NTUST · 資管系 4 年級' },
    { label: 'Currently', value: '微星科技 軟體工程實習' },
    { label: 'Side', value: '攝影 · 旅遊 · 閱讀' },
    { label: 'Coding since', value: '2017' },
  ],
  'zh-CN': [
    { label: 'Born', value: '2004 · 云林' },
    { label: 'School', value: 'NTUST · 资管系 4 年级' },
    { label: 'Currently', value: '微星科技 软体工程实习' },
    { label: 'Side', value: '摄影 · 旅游 · 阅读' },
    { label: 'Coding since', value: '2017' },
  ],
  en: [
    { label: 'Born', value: '2004 · Yunlin, Taiwan' },
    { label: 'School', value: 'NTUST · IM, 4th year' },
    { label: 'Currently', value: 'Software Engineer Intern @ MSI' },
    { label: 'Side', value: 'Photography · Travel · Reading' },
    { label: 'Coding since', value: '2017' },
  ],
  ja: [
    { label: 'Born', value: '2004 · 雲林（台湾）' },
    { label: 'School', value: 'NTUST · 情報管理学科 4 年' },
    { label: 'Currently', value: 'MSI ソフトウェアエンジニア インターン' },
    { label: 'Side', value: '写真・旅・読書' },
    { label: 'Coding since', value: '2017' },
  ],
  ko: [
    { label: 'Born', value: '2004 · 윈린(대만)' },
    { label: 'School', value: 'NTUST · 정보관리학과 4학년' },
    { label: 'Currently', value: 'MSI 소프트웨어 엔지니어 인턴' },
    { label: 'Side', value: '사진 · 여행 · 독서' },
    { label: 'Coding since', value: '2017' },
  ],
};

export const PARAGRAPHS_BY_LANG: Record<string, string[]> = {
  'zh-TW': [
    '我是 Koimsurai，2004 年出生的雲林人。目前就讀國立台灣科技大學資訊管理系四年級，現於微星科技 (MSI) 擔任軟體工程實習生，並於部門內實質負責前端框架標準與底層架構設計。',
    '過去具備 C++ / Python / Golang 與 App 開發經驗。在微星任職期間，我主導導入 Tauri + Rust 現代化輕量架構，替換原有龐大系統；獨立建置跨環境的 CI/CD 自動化部署管線，並完成「雲地混合 (Cloud-Edge Hybrid)」的 AI 系統部署架構。具備從前端 UI/UX 到系統底層記憶體控管的全端落地能力，並能解決複雜的跨環境編譯與資安漏洞問題。',
    '工作之外，我是一名 HomeLab 狂熱者。自行維護 24/7 的伺服器叢集，並從零開發個人 Web NAS OS (Next.js + Rust) 與專屬 AI 助理。',
    '我曾擔任資管系學會會長與程式講師，習慣用 Notion 與 GitHub 梳理複雜資訊，並熟練使用 Figma 進行介面設計。我相信好的軟體不僅需要強悍的底層架構支撐，更要在不同類型的產品與使用者之間，做出讓人覺得「順手」的東西。期許未來能持續在系統架構與 AI 整合領域發揮影響力。',
  ],
  'zh-CN': [
    '我是 Koimsurai，2004 年出生于云林。目前就读国立台湾科技大学资讯管理系四年级，于微星科技 (MSI) 担任软体工程实习生，并于部门内实质负责前端框架标准与底层架构设计。',
    '过去具备 C++ / Python / Golang 与 App 开发经验。在微星任职期间，我主导导入 Tauri + Rust 现代化轻量架构，替换原有庞大系统；独立建置跨环境的 CI/CD 自动化部署管线，并完成「云地混合 (Cloud-Edge Hybrid)」的 AI 系统部署架构。具备从前端 UI/UX 到系统底层记忆体控管的全端落地能力，并能解决复杂的跨环境编译与资安漏洞问题。',
    '工作之外，我是一名 HomeLab 狂热者。自行维护 24/7 的伺服器丛集，并从零开发个人 Web NAS OS (Next.js + Rust) 与专属 AI 助理。',
    '我曾担任资管系学会会长与程式讲师，习惯用 Notion 与 GitHub 梳理复杂资讯，并熟练使用 Figma 进行介面设计。我相信好的软体不仅需要强悍的底层架构支撑，更要在不同类型的产品与使用者之间，做出让人觉得「顺手」的东西。期许未来能持续在系统架构与 AI 整合领域发挥影响力。',
  ],
  en: [
    "I'm Koimsurai, born in 2004 in Yunlin, Taiwan. Currently a 4th-year IM student at National Taiwan University of Science and Technology (NTUST), interning as a software engineer at MSI — where I'm effectively responsible for frontend framework standards and underlying architecture design within my team.",
    'I have prior experience with C++, Python, Golang and app development. At MSI I led the adoption of a modern lightweight Tauri + Rust architecture to replace bulky legacy systems; built cross-environment CI/CD pipelines from scratch; and shipped an AI deployment architecture for cloud–edge hybrid workloads. My stack spans frontend UI/UX down to low-level memory management, plus debugging cross-platform builds and security issues.',
    "Outside work I'm a HomeLab enthusiast — maintaining a 24/7 server cluster and building a personal Web NAS OS (Next.js + Rust) and my own AI assistant from scratch.",
    "I served as president of NTUST's IM student council and as a programming instructor. I rely on Notion and GitHub to organize complex info, and Figma for UI design. I believe great software needs both solid foundations and an effortless feel across products and users. Hoping to keep making impact in system architecture and AI integration.",
  ],
  ja: [
    '私は Koimsurai、2004 年に台湾雲林県生まれ。国立台湾科技大学（NTUST）情報管理学科 4 年に在学中、MSI（微星科技）でソフトウェアエンジニアのインターンとして、部門内のフロントエンドフレームワーク標準と基盤アーキテクチャ設計を実質的に担当しています。',
    'C++ / Python / Golang・アプリ開発の経験を持ち、MSI では Tauri + Rust のモダンで軽量なアーキテクチャを主導導入し、既存の大規模システムを置き換えました。クロス環境の CI/CD 自動化パイプラインを単独で構築し、「クラウド・エッジハイブリッド」型 AI システムのデプロイアーキテクチャも完成させました。フロントエンド UI/UX からシステム下層のメモリ管理まで対応でき、クロス環境ビルドやセキュリティの問題も解決できます。',
    '仕事以外では HomeLab 愛好家。24/7 稼働のサーバークラスタを自前で運用し、Web NAS OS (Next.js + Rust) と専属 AI アシスタントをゼロから開発しています。',
    'NTUST 情報管理学科の学生会長と、プログラミング講師の経験があります。Notion と GitHub で複雑な情報を整理し、Figma で UI 設計するのが得意です。良いソフトウェアには強固な基盤と、製品や利用者を超えて「使いやすい」と感じてもらえる仕上がりの両方が必要だと考えています。今後もシステムアーキテクチャと AI 統合の分野で影響を残せたら、と思っています。',
  ],
  ko: [
    '저는 Koimsurai, 2004년 대만 윈린에서 태어났습니다. 현재 국립대만과학기술대학교(NTUST) 정보관리학과 4학년에 재학 중이며, MSI(미신과학기)에서 소프트웨어 엔지니어 인턴으로 일하면서 부서 내 프런트엔드 프레임워크 표준과 기반 아키텍처 설계를 실질적으로 담당하고 있습니다.',
    'C++ / Python / Golang과 앱 개발 경험이 있습니다. MSI 재직 중에는 Tauri + Rust 기반의 현대적이고 가벼운 아키텍처 도입을 주도해 기존의 거대한 시스템을 교체했고, 크로스 환경 CI/CD 자동화 파이프라인을 단독으로 구축했으며, 「클라우드–엣지 하이브리드」 형태의 AI 시스템 배포 아키텍처를 완성했습니다. 프런트엔드 UI/UX부터 시스템 저수준 메모리 관리까지 두루 다루며, 복잡한 크로스 환경 빌드와 보안 이슈도 해결할 수 있어요.',
    '업무 외에는 HomeLab 마니아입니다. 24/7 가동하는 서버 클러스터를 직접 운영하고, Web NAS OS(Next.js + Rust)와 개인 AI 어시스턴트를 처음부터 개발하고 있어요.',
    'NTUST 정보관리학과 학생회장과 프로그래밍 강사를 맡은 적이 있습니다. Notion과 GitHub으로 복잡한 정보를 정리하고, Figma로 UI를 디자인합니다. 좋은 소프트웨어는 견고한 기반과, 제품과 사용자 사이에서 「자연스럽게」 느껴지는 마무리가 함께 있어야 한다고 믿습니다. 앞으로도 시스템 아키텍처와 AI 통합 분야에서 영향력을 남기고 싶어요.',
  ],
};

// ── 經歷 ──
export interface ExpGroup {
  heading: string;
  items: string[];
}
export interface Experience {
  title: string;
  role: string;
  groups?: ExpGroup[];
  bullets?: string[];
}

// 期間 + tags 穩定（技術名英文）, 其餘隨語系
export const PERIODS = ['2025/7 — Now', '2024/9 — Now', '2024/10 — 2025/6'];
export const TAGS = [
  ['Monorepo', 'Turborepo', 'TypeScript', 'ASP.NET', 'Python', 'GitLab CI/CD'],
  ['Python', 'Scratch', 'MCE', 'App Inventor'],
  ['Kotlin', 'Android', 'Premiere Pro'],
];

export const EXPERIENCES_BY_LANG: Record<string, Experience[]> = {
  'zh-TW': [
    {
      title: '微星科技股份有限公司',
      role: '軟體工程師',
      groups: [
        {
          heading: '前端架構與標準化',
          items: [
            '主導導入 Monorepo 架構：用 Turborepo 整合內部多個前端專案，解決跨專案代碼共用與版控痛點',
            '建立 ESLint / Prettier / TypeScript 嚴格規則，提升團隊代碼品質',
            '封裝共用 UI Library 與 Utility Libraries，提供其他團隊（如 IT Team）復用',
            '撰寫標準化開發文件與 README，協助團隊成員上手新架構',
          ],
        },
        {
          heading: '後端開發與維護',
          items: [
            '維護 ASP.NET (C#) 與 Legacy Web API，解決 .NET Framework 相容性與 .web.config 配置問題',
            '處理 MS SQL 資料庫權限控管與 Stored Procedure 邏輯除錯',
            '用 Python 撰寫網頁爬蟲與自動化腳本，協助資料收集與批次處理',
          ],
        },
        {
          heading: 'DevOps 與流程優化',
          items: [
            '參與 GitLab CI/CD Pipeline 建置與維護，確保 Monorepo 自動化建置部署流暢',
            '熟悉 Git Flow，協助團隊解決版本衝突與 Merge Request Code Review',
          ],
        },
        {
          heading: '跨部門協作',
          items: [
            '與 AI Team / IT Team 緊密合作，作為前端技術窗口整合 AI 模型至 Web 介面',
            '向主管與非技術人員 demo，將複雜架構概念轉化為具體效益',
          ],
        },
      ],
    },
    {
      title: '猿創力程式設計學校',
      role: '儲備講師',
      bullets: ['教導國中、國小學生程式，小班制 MCE、Python 為主', 'App Inventor 到府一對一比賽特訓班'],
    },
    {
      title: '私立高偉數學補習班',
      role: '資訊助理 & 企劃部門',
      bullets: [
        '開發補習班 Android App 並上線維運',
        '完成主管交辦的其他資訊事務',
        '剪輯數十支 10 分鐘內宣傳影片、製作封面',
      ],
    },
  ],
  'zh-CN': [
    {
      title: '微星科技股份有限公司',
      role: '软体工程师',
      groups: [
        {
          heading: '前端架构与标准化',
          items: [
            '主导导入 Monorepo 架构：用 Turborepo 整合内部多个前端项目，解决跨项目代码共用与版控痛点',
            '建立 ESLint / Prettier / TypeScript 严格规则，提升团队代码品质',
            '封装共用 UI Library 与 Utility Libraries，提供其他团队（如 IT Team）复用',
            '撰写标准化开发文档与 README，协助团队成员上手新架构',
          ],
        },
        {
          heading: '后端开发与维护',
          items: [
            '维护 ASP.NET (C#) 与 Legacy Web API，解决 .NET Framework 相容性与 .web.config 配置问题',
            '处理 MS SQL 数据库权限控管与 Stored Procedure 逻辑除错',
            '用 Python 撰写网页爬虫与自动化脚本，协助资料收集与批次处理',
          ],
        },
        {
          heading: 'DevOps 与流程优化',
          items: [
            '参与 GitLab CI/CD Pipeline 建置与维护，确保 Monorepo 自动化建置部署流畅',
            '熟悉 Git Flow，协助团队解决版本冲突与 Merge Request Code Review',
          ],
        },
        {
          heading: '跨部门协作',
          items: [
            '与 AI Team / IT Team 紧密合作，作为前端技术窗口整合 AI 模型至 Web 介面',
            '向主管与非技术人员 demo，将复杂架构概念转化为具体效益',
          ],
        },
      ],
    },
    {
      title: '猿创力程式设计学校',
      role: '储备讲师',
      bullets: ['教导国中、国小学生程式，小班制 MCE、Python 为主', 'App Inventor 到府一对一比赛特训班'],
    },
    {
      title: '私立高伟数学补习班',
      role: '资讯助理 & 企划部门',
      bullets: [
        '开发补习班 Android App 并上线维运',
        '完成主管交办的其他资讯事务',
        '剪辑数十支 10 分钟内宣传影片、制作封面',
      ],
    },
  ],
  en: [
    {
      title: 'MSI (Micro-Star International)',
      role: 'Software Engineer',
      groups: [
        {
          heading: 'Frontend Architecture & Standardization',
          items: [
            'Led the Monorepo migration: used Turborepo to consolidate multiple internal frontend projects, solving cross-project code sharing and versioning pain points',
            'Established strict ESLint / Prettier / TypeScript rules, raising team code quality',
            'Packaged shared UI libraries and utility libraries for reuse by other teams (e.g. IT Team)',
            'Wrote standardized dev docs and READMEs to help teammates onboard',
          ],
        },
        {
          heading: 'Backend Development & Maintenance',
          items: [
            'Maintained ASP.NET (C#) and legacy Web APIs — fixed .NET Framework compatibility and .web.config issues',
            'Handled MS SQL permissions and debugged Stored Procedures',
            'Wrote Python scrapers and automation scripts for data collection and batch processing',
          ],
        },
        {
          heading: 'DevOps & Process Optimization',
          items: [
            'Built and maintained GitLab CI/CD pipelines, ensuring smooth automated builds and deploys for the monorepo',
            'Comfortable with Git Flow, helping teammates resolve conflicts and reviewing merge requests',
          ],
        },
        {
          heading: 'Cross-Team Collaboration',
          items: [
            'Worked closely with AI Team / IT Team as the frontend tech contact integrating AI models into web interfaces',
            'Demoed to non-technical stakeholders, translating complex architecture into concrete value',
          ],
        },
      ],
    },
    {
      title: 'Ape Programming School',
      role: 'Reserve Instructor',
      bullets: [
        'Teach programming to elementary and junior-high students; small-class MCE and Python focused',
        "App Inventor one-on-one competition prep — taught at students' homes",
      ],
    },
    {
      title: 'Gao-Wei Math Cram School',
      role: 'IT Assistant & Planning',
      bullets: [
        'Built and maintained an Android app for the cram school in production',
        'Handled various IT tasks assigned by management',
        'Edited dozens of <10-min promo videos with thumbnails',
      ],
    },
  ],
  ja: [
    {
      title: 'MSI（微星科技）',
      role: 'ソフトウェアエンジニア',
      groups: [
        {
          heading: 'フロントエンドアーキテクチャと標準化',
          items: [
            'Monorepo への移行を主導：Turborepo で社内の複数のフロントエンドプロジェクトを統合し、コード共有とバージョン管理の課題を解決',
            'ESLint / Prettier / TypeScript の厳格なルールを策定し、チームのコード品質を向上',
            '共有 UI ライブラリと Utility ライブラリを整備し、他チーム（IT Team など）でも再利用',
            '標準化された開発ドキュメントと README を整備し、新メンバーの立ち上げを支援',
          ],
        },
        {
          heading: 'バックエンド開発と保守',
          items: [
            'ASP.NET (C#) とレガシー Web API を保守。.NET Framework 互換性や .web.config の設定問題を解決',
            'MS SQL の権限管理とストアドプロシージャのロジックデバッグを担当',
            'Python で Web スクレイパーと自動化スクリプトを作成し、データ収集とバッチ処理を支援',
          ],
        },
        {
          heading: 'DevOps とプロセス最適化',
          items: [
            'GitLab CI/CD パイプラインの構築・保守に参加し、Monorepo の自動ビルド・デプロイを円滑に',
            'Git Flow に精通し、チームのバージョン衝突解決と MR レビューを支援',
          ],
        },
        {
          heading: '部門間連携',
          items: [
            'AI Team / IT Team と密に連携し、フロントエンド技術窓口として AI モデルを Web 画面に統合',
            '上司や技術以外のメンバーへデモを行い、複雑なアーキテクチャの概念を具体的な価値へ翻訳',
          ],
        },
      ],
    },
    {
      title: '猿創力プログラミングスクール',
      role: '見習い講師',
      bullets: [
        '小・中学生にプログラミングを指導。少人数制で MCE・Python を中心に',
        'App Inventor の一対一コンテスト特訓を生徒の家まで出張',
      ],
    },
    {
      title: '私立高偉数学塾',
      role: 'IT アシスタント & 企画部',
      bullets: [
        '塾の Android アプリを開発し、本番運用までを担当',
        '上司から依頼された各種 IT 業務を処理',
        '10 分以内の宣伝動画を数十本編集し、サムネイルも制作',
      ],
    },
  ],
  ko: [
    {
      title: 'MSI(미신과학기)',
      role: '소프트웨어 엔지니어',
      groups: [
        {
          heading: '프런트엔드 아키텍처 및 표준화',
          items: [
            'Monorepo 도입 주도: Turborepo로 사내 여러 프런트엔드 프로젝트를 통합해 코드 공유와 버전 관리 문제를 해결',
            'ESLint / Prettier / TypeScript의 엄격한 규칙을 도입해 팀 코드 품질을 향상',
            '공용 UI 라이브러리와 Utility 라이브러리를 패키징하여 다른 팀(IT Team 등)에서 재사용 가능하게 제공',
            '표준화된 개발 문서와 README를 작성해 팀원들의 온보딩을 지원',
          ],
        },
        {
          heading: '백엔드 개발 및 유지보수',
          items: [
            'ASP.NET (C#)과 레거시 Web API를 유지보수하며 .NET Framework 호환성과 .web.config 설정 문제를 해결',
            'MS SQL의 권한 관리와 Stored Procedure 로직 디버깅을 담당',
            'Python으로 웹 스크레이퍼와 자동화 스크립트를 작성해 데이터 수집과 배치 처리를 지원',
          ],
        },
        {
          heading: '데브옵스 및 프로세스 최적화',
          items: [
            'GitLab CI/CD 파이프라인 구축·유지에 참여해 Monorepo의 자동 빌드와 배포가 매끄럽게 동작',
            'Git Flow에 능숙하며 팀의 버전 충돌 해결과 머지 리퀘스트 코드 리뷰를 도움',
          ],
        },
        {
          heading: '부서 간 협업',
          items: [
            'AI Team / IT Team과 긴밀히 협력하며 프런트엔드 기술 창구로서 AI 모델을 웹 인터페이스에 통합',
            '관리자와 비기술 인력에게 데모를 진행하여 복잡한 아키텍처 개념을 구체적인 가치로 전달',
          ],
        },
      ],
    },
    {
      title: '원창리 프로그래밍 스쿨',
      role: '예비 강사',
      bullets: [
        '초·중학생에게 프로그래밍을 지도. 소그룹제 MCE·Python 중심',
        'App Inventor 1:1 대회 특훈을 학생 집에 방문하여 진행',
      ],
    },
    {
      title: '사립 가오웨이 수학학원',
      role: 'IT 보조 & 기획부',
      bullets: [
        '학원 Android 앱을 개발하고 출시·운영까지 담당',
        '관리자에게 위임된 각종 IT 업무 처리',
        '10분 이내의 홍보 영상 수십 편을 편집하고 썸네일 제작',
      ],
    },
  ],
};

// ── 社團 ──
export interface ClubEntry {
  name: string;
  role: string;
  activities: string[];
}

// 期間穩定，name/role/activities 隨語系
export const CLUB_PERIODS = ['2022 — 2023', '2023 — 2024', '2023 — 2024'];

export const CLUBS_BY_LANG: Record<string, ClubEntry[]> = {
  'zh-TW': [
    {
      name: '111 屆資管系學會',
      role: '會長',
      activities: ['宿營 活動副組長', '迎新茶會 總召、主持人', '十三系聯合聖誕夜店趴 副召', '系座談會 總召、主持人'],
    },
    {
      name: '112 屆絃韻吉他社',
      role: '文書',
      activities: [
        '吉他太美（迎新） 總召',
        '詐騙吉團（期初） 攝影',
        '吉拜郎（民歌之夜） 副召、攝影',
        '七校聯展 協辦',
        '吉卜力（社友會） 場佈、主持人',
        '吉良吉影（期末） 公關組長、攝影組長',
        '吉惡世代（期初下） 副召、主持人',
        '金絃獎 文宣、內招組長',
      ],
    },
    { name: '第一屆台科攝影社', role: '教學', activities: ['社課教學與規劃', '外拍活動帶領'] },
  ],
  'zh-CN': [
    {
      name: '111 届资管系学会',
      role: '会长',
      activities: ['宿营 活动副组长', '迎新茶会 总召、主持人', '十三系联合圣诞夜店派对 副召', '系座谈会 总召、主持人'],
    },
    {
      name: '112 届弦韵吉他社',
      role: '文书',
      activities: [
        '吉他太美（迎新） 总召',
        '诈骗吉团（期初） 摄影',
        '吉拜郎（民歌之夜） 副召、摄影',
        '七校联展 协办',
        '吉卜力（社友会） 场布、主持人',
        '吉良吉影（期末） 公关组长、摄影组长',
        '吉恶世代（期初下） 副召、主持人',
        '金弦奖 文宣、内招组长',
      ],
    },
    { name: '第一届台科摄影社', role: '教学', activities: ['社课教学与规划', '外拍活动带领'] },
  ],
  en: [
    {
      name: 'NTUST IM Student Council (111th)',
      role: 'President',
      activities: [
        'Freshman Camp · Vice Activities Lead',
        'Welcome Tea · Chief Organizer, MC',
        'Thirteen-Dept Christmas Party · Co-Lead',
        'Department Forum · Chief Organizer, MC',
      ],
    },
    {
      name: 'NTUST Guitar Club (112th)',
      role: 'Secretary',
      activities: [
        'Guitar Welcome Show · Chief Organizer',
        'Mid-Term Concert · Photographer',
        'Folk Night · Co-Lead, Photographer',
        'Seven-School Joint Exhibition · Co-organizer',
        'Alumni Gathering · Set Design, MC',
        'End-of-Term Show · PR Lead, Photo Lead',
        'New Semester Show · Co-Lead, MC',
        'Golden String Awards · PR & Recruitment Lead',
      ],
    },
    {
      name: 'NTUST Photography Club (Founding Year)',
      role: 'Instructor',
      activities: ['Workshop teaching & planning', 'Outdoor shoot leader'],
    },
  ],
  ja: [
    {
      name: 'NTUST 情報管理学生会（第111期）',
      role: '会長',
      activities: [
        '新入生キャンプ・活動副リーダー',
        '新歓茶会・総合プロデューサー、司会',
        '13 学科合同クリスマスパーティー・副リーダー',
        '学科フォーラム・総合プロデューサー、司会',
      ],
    },
    {
      name: 'NTUST 絃韻ギター部（第112期）',
      role: '書記',
      activities: [
        '新歓ライブ「吉他太美」・総合プロデューサー',
        '学期初コンサート「詐騙吉團」・撮影',
        'フォークナイト「吉拜郎」・副リーダー、撮影',
        '7 校合同展・共催',
        '部活同窓会「吉卜力」・会場設営、司会',
        '学期末ライブ「吉良吉影」・PR リーダー、撮影リーダー',
        '新学期ライブ「吉惡世代」・副リーダー、司会',
        'ゴールデンストリングス賞・広報、勧誘リーダー',
      ],
    },
    { name: 'NTUST 写真部（創設期）', role: '講師', activities: ['部活授業の企画・指導', '撮影遠征のリーダー'] },
  ],
  ko: [
    {
      name: 'NTUST 정보관리 학생회 (제111기)',
      role: '회장',
      activities: [
        '신입생 캠프 · 활동 부조장',
        '환영 다회 · 총괄, 사회',
        '13개 학과 합동 크리스마스 파티 · 부조장',
        '학과 포럼 · 총괄, 사회',
      ],
    },
    {
      name: 'NTUST 현운 기타 동아리 (제112기)',
      role: '서기',
      activities: [
        '신입생 환영 공연 · 총괄',
        '학기 초 콘서트 · 사진',
        '포크 나이트 · 부총괄, 사진',
        '7개 학교 합동 전시 · 공동 주최',
        '동아리 동문회 · 무대 설치, 사회',
        '학기 말 공연 · 홍보 팀장, 사진 팀장',
        '새 학기 공연 · 부총괄, 사회',
        '골든 스트링 어워드 · 홍보, 모집 팀장',
      ],
    },
    { name: 'NTUST 사진 동아리 (창립기)', role: '강사', activities: ['동아리 수업 기획 및 강의', '야외 촬영 리더'] },
  ],
};

// ── 技能 ──
export const NAMES_BY_LANG: Record<string, Record<string, string>> = {
  'zh-TW': {
    Frontend: '前端開發',
    Backend: '後端開發',
    Mobile: '行動開發',
    DevOps: '部署運維',
    Design: '設計多媒體',
    Data: '資料儲存',
    Network: '網路通訊',
    Productivity: '生產力',
    'AI Tools': 'AI 開發',
    Teaching: '教學工具',
  },
  'zh-CN': {
    Frontend: '前端开发',
    Backend: '后端开发',
    Mobile: '移动开发',
    DevOps: '部署运维',
    Design: '设计多媒体',
    Data: '数据存储',
    Network: '网络通讯',
    Productivity: '生产力',
    'AI Tools': 'AI 开发',
    Teaching: '教学工具',
  },
  en: {
    Frontend: 'Frontend',
    Backend: 'Backend',
    Mobile: 'Mobile',
    DevOps: 'DevOps',
    Design: 'Design',
    Data: 'Data',
    Network: 'Network',
    Productivity: 'Productivity',
    'AI Tools': 'AI Tools',
    Teaching: 'Teaching',
  },
  ja: {
    Frontend: 'フロントエンド',
    Backend: 'バックエンド',
    Mobile: 'モバイル',
    DevOps: 'DevOps',
    Design: 'デザイン・メディア',
    Data: 'データストア',
    Network: 'ネットワーク',
    Productivity: '生産性',
    'AI Tools': 'AI 開発',
    Teaching: '教育ツール',
  },
  ko: {
    Frontend: '프런트엔드',
    Backend: '백엔드',
    Mobile: '모바일',
    DevOps: '데브옵스',
    Design: '디자인 · 미디어',
    Data: '데이터 저장',
    Network: '네트워크',
    Productivity: '생산성',
    'AI Tools': 'AI 개발',
    Teaching: '교육 도구',
  },
};

export const CATEGORIES_BASE: { label: string; items: string[] }[] = [
  {
    label: 'Frontend',
    items: [
      'Next.js',
      'React',
      'TypeScript',
      'JavaScript',
      'Vite',
      'Framer Motion',
      'Three.js',
      'WebGL',
      'Tauri',
      'PWA',
      'Tailwind CSS',
      'Bootstrap',
      'HTML5',
      'CSS3',
    ],
  },
  {
    label: 'Backend',
    items: [
      'Rust',
      'Express',
      'Node.js',
      'ASP.NET',
      '.NET 8',
      'Spring Boot',
      'FastAPI',
      'Pydantic',
      'Jinja2',
      'discord.py',
      'Go',
      'Java',
      'Python',
      'C++',
      'C',
    ],
  },
  { label: 'Mobile', items: ['Kotlin', 'Android', 'Jetpack Compose', 'Flutter', 'Dart'] },
  {
    label: 'DevOps',
    items: [
      'Docker',
      'Cloudflare',
      'Turborepo',
      'pnpm',
      'ESLint',
      'Prettier',
      'Vitest',
      'Playwright',
      'GitLab CI/CD',
      'GitHub',
      'n8n',
      'Nginx',
      'Traefik',
      'Linux',
      'Bash',
      'PowerShell',
    ],
  },
  { label: 'Design', items: ['Figma', 'Photoshop', 'Illustrator', 'Premiere Pro', 'Lightroom'] },
  { label: 'Data', items: ['PostgreSQL', 'MS SQL Server', 'MongoDB', 'SQLite', 'Redis', 'Firebase', 'JSON'] },
  { label: 'Network', items: ['HTTP/HTTPS', 'TCP/IP', 'DNS', 'SSL/TLS', 'OAuth', 'JWT', 'WebSocket', 'CDN'] },
  {
    label: 'Productivity',
    items: ['VS Code', 'Postman', 'Notion', 'Obsidian', 'Markdown', 'Mermaid', 'Canva', 'Discord'],
  },
  {
    label: 'AI Tools',
    items: ['Claude', 'Cursor', 'GitHub Copilot', 'Antigravity', 'Gemini', 'GPT', 'Codex CLI', 'MCP'],
  },
  { label: 'Teaching', items: ['Scratch', 'pygame', 'MCE (Minecraft)', 'App Inventor'] },
];
