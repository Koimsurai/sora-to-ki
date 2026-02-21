import React from 'react';
import { motion } from 'framer-motion';
// ✅ 優化: 使用解構引入 (Vite 的 tree-shaking 會自動移除未使用的 icons)
import {
  SiFigma, SiDart, SiMongodb, SiAdobepremierepro, SiAdobelightroom, SiKotlin, SiNotion, SiCanva,
  SiReact, SiJavascript, SiTypescript, SiDotnet, SiC, SiGo, SiAdobephotoshop,
  SiAdobeillustrator, SiHtml5, SiCss3, SiNextdotjs, SiTailwindcss, SiSqlite, SiPostgresql,
  SiRust, SiExpress, SiMarkdown, SiN8N, SiNginx, SiTraefikproxy
} from 'react-icons/si';
import {
  FaJava, FaPython, FaLinux, FaGithub, FaDocker, FaNetworkWired, FaServer, FaDatabase, FaCode
} from 'react-icons/fa';
import './Expertise.css'; // 引入對應的 CSS 檔案

// 將圖示元件化以便複用
const SkillIcon = ({ icon: Icon, name, animationProps }) => (
  <motion.span
    className="skill-icon"
    title={name}
    animate={animationProps || { y: [0, -2, 0], rotate: Math.random() > 0.5 ? [0, 3, -3, 0] : 0 }}
    transition={{ duration: 1.5 + Math.random() * 1.5, repeat: Infinity, ease: "easeInOut" }}
  >
    <Icon />
  </motion.span>
);


function Expertise() {
  // 更新技能分類和內容，新增前端框架和更多技術
  const skills = {
    '前端開發': ['Next.js', 'React', 'JavaScript', 'TypeScript', 'Tailwind CSS', 'HTML5', 'CSS3'],
    '後端開發': ['Rust', 'Express', 'ASP.NET', 'C', 'Go', 'Java', 'Python', 'SQL Server'],
    'Mobile Development': ['Dart', 'Kotlin'],
    'DevOps & Tools': ['Docker', 'Nginx', 'Traefik', 'n8n', 'Linux', 'Github'],
    'Design & Multimedia': ['Photoshop', 'Illustrator', 'Figma', 'Premiere Pro', 'Lightroom'],
    'Productivity & Design': ['Markdown', 'Notion', 'Canva'],
    'Database & Data': ['PostgreSQL', 'SQLite', 'MongoDB', 'JSON'],
    '網路技術': ['TCP/IP', 'HTTP/HTTPS']
  };


  return (
    <section // 恢復為普通 section
      id="expertise"
      className="expertise-section"
    >
      <motion.h2 // 為標題添加動畫
        initial={{ opacity: 0, scale: 0.8 }} // 改為縮小
        whileInView={{ opacity: 1, scale: 1 }} // 改為放大
        transition={{ duration: 0.6, ease: "easeOut" }}
        viewport={{ once: true }}
      >
        專業技能
      </motion.h2>
      <div // 移除外層 motion.div，改為普通 div
        className="skills-container"
      // 移除外層動畫屬性
      >
        {Object.entries(skills).map(([category, items], index) => ( // 加入 index
          <motion.div // 為每個分類添加動畫
            key={category}
            className="skill-category"
            initial={{ opacity: 0, scale: 0.8 }} // 移除 y，調整 scale
            whileInView={{ opacity: 1, scale: 1 }} // 移除 y
            transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }} // 錯開動畫
            viewport={{ once: true }}
          >
            <h3>{category}</h3>
            {/* 改用 div 包裹技能項目，取代 ul */}
            <div className="skill-items-wrapper">
              {items.map((item) => (
                // 改用 div 包裹單個技能，取代 li
                <div key={item} className="skill-item">
                  {item === 'React' ? <SkillIcon icon={SiReact} name="React" animationProps={{ rotate: [0, 360], transition: { duration: 4, repeat: Infinity, ease: "linear" } }} /> :
                    item === 'Next.js' ? <SkillIcon icon={SiNextdotjs} name="Next.js" /> :
                      item === 'Tailwind CSS' ? <SkillIcon icon={SiTailwindcss} name="Tailwind CSS" /> :
                        item === 'JavaScript' ? <SkillIcon icon={SiJavascript} name="JavaScript" /> :
                          item === 'TypeScript' ? <SkillIcon icon={SiTypescript} name="TypeScript" /> :
                            item === 'HTML5' ? <SkillIcon icon={SiHtml5} name="HTML5" /> :
                              item === 'CSS3' ? <SkillIcon icon={SiCss3} name="CSS3" /> :
                                item === 'Rust' ? <SkillIcon icon={SiRust} name="Rust" /> :
                                  item === 'Express' ? <SkillIcon icon={SiExpress} name="Express" /> :
                                    item === 'ASP.NET' ? <SkillIcon icon={SiDotnet} name="ASP.NET" /> :
                                      item === 'C' ? <SkillIcon icon={SiC} name="C" /> :
                                        item === 'Go' ? <SkillIcon icon={SiGo} name="Go" /> :
                                          item === 'Java' ? <SkillIcon icon={FaJava} name="Java" /> :
                                            item === 'Python' ? <SkillIcon icon={FaPython} name="Python" /> :
                                              item === 'SQL Server' ? <SkillIcon icon={FaDatabase} name="SQL Server" /> :
                                                item === 'Photoshop' ? <SkillIcon icon={SiAdobephotoshop} name="Photoshop" /> :
                                                  item === 'Illustrator' ? <SkillIcon icon={SiAdobeillustrator} name="Illustrator" /> :
                                                    item === 'Figma' ? <SkillIcon icon={SiFigma} name="Figma" animationProps={{ rotate: [0, 5, -5, 0], y: [0, -2, 2, 0] }} /> :
                                                      item === 'Premiere Pro' ? <SkillIcon icon={SiAdobepremierepro} name="Premiere Pro" /> :
                                                        item === 'Lightroom' ? <SkillIcon icon={SiAdobelightroom} name="Lightroom" /> :
                                                          item === 'Dart' ? <SkillIcon icon={SiDart} name="Dart (Flutter)" /> :
                                                            item === 'Kotlin' ? <SkillIcon icon={SiKotlin} name="Kotlin" /> :
                                                              item === 'Docker' ? <SkillIcon icon={FaDocker} name="Docker" /> :
                                                                item === 'Nginx' ? <SkillIcon icon={SiNginx} name="Nginx" /> :
                                                                  item === 'Traefik' ? <SkillIcon icon={SiTraefikproxy} name="Traefik" /> :
                                                                    item === 'n8n' ? <SkillIcon icon={SiN8N} name="n8n" /> :
                                                                      item === 'Linux' ? <SkillIcon icon={FaLinux} name="Linux" /> :
                                                                        item === 'Github' ? <SkillIcon icon={FaGithub} name="GitHub" /> :
                                                                          item === 'Markdown' ? <SkillIcon icon={SiMarkdown} name="Markdown" /> :
                                                                            item === 'Notion' ? <SkillIcon icon={SiNotion} name="Notion" /> :
                                                                              item === 'Canva' ? <SkillIcon icon={SiCanva} name="Canva" /> :
                                                                                item === 'PostgreSQL' ? <SkillIcon icon={SiPostgresql} name="PostgreSQL" /> :
                                                                                  item === 'SQLite' ? <SkillIcon icon={SiSqlite} name="SQLite" /> :
                                                                                    item === 'MongoDB' ? <SkillIcon icon={SiMongodb} name="MongoDB" /> :
                                                                                      item === 'JSON' ? <SkillIcon icon={FaCode} name="JSON" /> :
                                                                                        item === 'TCP/IP' ? <SkillIcon icon={FaNetworkWired} name="TCP/IP" /> :
                                                                                          item === 'HTTP/HTTPS' ? <SkillIcon icon={FaServer} name="HTTP/HTTPS" /> :
                                                                                            <span className="skill-text">{item}</span>
                  }
                </div>
              ))}
            </div>
          </motion.div> // 結束 motion.div
        ))}
      </div>
    </section> // 結束 section
  );
}

export default Expertise;
