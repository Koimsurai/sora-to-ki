import React from 'react';
import InfoPage from './InfoPage';

function Messages() {
  return (
    <InfoPage
      title="留言"
      subtitle="想說什麼都可以"
      slug="messages"
      prev={{ to: '/history', title: '歷史 — 站點走過的長河' }}
      next={null}
    >
      <p>
        這裡是留言板。不一定要跟文章相關，閒聊、技術問題、合作邀請、單純路過想留個記號都歡迎。
      </p>

      <h2 id="rules">幾個小規則</h2>

      <ol>
        <li>
          <strong>用真實一點的暱稱</strong> — 不限定本名，但希望別是「123」「test」這種我會分不清是同一人還是不同人。
        </li>
        <li>
          <strong>登入留言會自動帶頭像</strong> — 用 GitHub / Google 登入後，頭像跟暱稱會自動填入。匿名也可以，只是需要手動輸入。
        </li>
        <li>
          <strong>留言會經過審核</strong> — 預設不會直接公開，避免廣告 / spam。一般留言通常 24 小時內會過。
        </li>
        <li>
          <strong>支援 Markdown</strong> — 可以用 <code>**粗體**</code>、<code>`程式碼`</code>、<code>[連結](url)</code> 等基本語法。
        </li>
      </ol>

      <h2 id="contact">想私下聊？</h2>

      <p>
        如果是不適合公開的訊息，可以直接寄信給我：
        <a href="mailto:timo9378@gmail.com">timo9378@gmail.com</a>
        ，或從 <a href="/#contact">聯絡區塊</a> 看其他聯絡方式。
      </p>

      <p>
        若是 bug 回報或功能建議，建議去
        <a href="https://github.com/timo9378/web/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a>
        開單，比較好追蹤。
      </p>
    </InfoPage>
  );
}

export default Messages;
