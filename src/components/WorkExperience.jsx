import React from 'react';
import { motion } from 'framer-motion'; // 導入 motion
import './WorkExperience.css'; // 引入對應的 CSS 檔案

function WorkExperience() {
  // 根據履歷內容
  const experiences = [
    {
      period: '2025/7 - Now',
      title: '微星科技股份有限公司',
      role: '軟體工程師',
      details: [
        {
          heading: '前端架構與標準化',
          items: [
            '主導導入 Monorepo 架構： 使用 Turborepo 整合公司內部多個前端專案，解決跨專案代碼共用與版本管理痛點。',
            '建立開發規範： 制定並實作 ESLint、Prettier 與 TypeScript 嚴格型別檢查規則，提升團隊代碼品質與維護性。',
            '模組化開發： 封裝共用 UI 元件庫與 Utility Libraries，提供給其他團隊（如 IT Team）復用，降低重複開發成本。',
            '技術文件撰寫： 撰寫標準化開發文件與 README，協助團隊成員快速上手新架構。'
          ]
        },
        {
          heading: '後端開發與維護',
          items: [
            '維護舊有系統： 負責 ASP.NET (C#) 與 Legacy Web API 的維護與除錯，解決 .NET Framework 版本相容性與 .web.config 配置問題。',
            '資料庫管理： 處理 MS SQL 資料庫權限控管與 Stored Procedure 邏輯除錯，確保資料存取安全性。',
            '自動化腳本開發： 使用 Python 撰寫網頁爬蟲 (Web Scraping) 與自動化腳本，協助資料收集與批次處理任務。'
          ]
        },
        {
          heading: 'DevOps 與流程優化',
          items: [
            '優化 CI/CD 流程： 參與 GitLab CI/CD Pipeline 的建置與維護，確保 Monorepo 架構下的自動化建置與部署流暢。',
            '協作與版控： 熟悉 Git Flow 開發流程，協助團隊解決版本衝突與 Merge Request Code Review。'
          ]
        },
        {
          heading: '跨部門協作',
          items: [
            '與 AI Team 及 IT Team 緊密合作，作為前端技術窗口，協助整合 AI 模型應用至 Web 介面。',
            '向主管與非技術人員進行技術展示 (Demo)，將複雜的架構概念轉化為具體的效益說明。'
          ]
        }
      ]
    },
    {
      period: '2024/9 - Now',
      title: '猿創力程式設計學校',
      role: '儲備講師',
      details: [
        '教導國中、國小學生程式，小班制 MCE、Python 為主',
        'App Inventor 到府一對一比賽特訓班'
      ]
    },
    {
      period: '2024/10 - 2025/6',
      title: '私立高偉數學補習班',
      role: '資訊助理 & 企劃部門',
      details: [
        '成功開發補習班 Android App & 上線維運',
        '完成其他主管交辦事項',
        '數十支宣傳用 10 分內長片剪輯、封面製作'
      ]
    }
  ];

  return (
    <section // 恢復為普通 section
      id="work-experience"
      className="work-experience-section"
    >
      <motion.h2 // 為標題添加動畫
        initial={{ opacity: 0, scale: 0.8 }} // 改為縮小
        whileInView={{ opacity: 1, scale: 1 }} // 改為放大
        transition={{ duration: 0.6, ease: "easeOut" }}
        viewport={{ once: true }}
      >
        工作經歷
      </motion.h2>
      <div // 移除外層 motion.div，改為普通 div
        className="experience-list"
      // 移除外層動畫屬性
      >
        {experiences.map((exp, index) => (
          <motion.div // 為每個項目添加動畫
            key={index}
            className="experience-item"
            initial={{ opacity: 0, scale: 0.8 }} // 改為縮小
            whileInView={{ opacity: 1, scale: 1 }} // 改為放大
            transition={{ duration: 0.5, delay: index * 0.15, ease: "easeOut" }} // 錯開動畫，延遲稍長
            viewport={{ once: true }}
          >
            <div className="experience-header">
              <h3>{exp.title} <span className="role">({exp.role})</span></h3>
              <span className="period">{exp.period}</span>
            </div>
            <ul className="details-list">
              {exp.details.map((detail, i) => {
                if (typeof detail === 'string') {
                  return <li key={i}>{detail}</li>;
                } else if (typeof detail === 'object' && detail.heading) {
                  return (
                    <li key={i} className="detail-group" style={{ listStyleType: 'none', marginLeft: '-20px', marginBottom: '12px', marginTop: '12px' }}>
                      <strong style={{ color: 'var(--clr-accent)', display: 'block', marginBottom: '8px', fontSize: '1.05rem' }}>{detail.heading}</strong>
                      <ul style={{ paddingLeft: '20px' }}>
                        {detail.items.map((item, j) => (
                          <li key={j} style={{ marginBottom: '6px' }}>{item}</li>
                        ))}
                      </ul>
                    </li>
                  );
                }
                return null;
              })}
            </ul>
          </motion.div>
        ))}
      </div>
    </section> // 結束 section
  );
}

export default WorkExperience;
