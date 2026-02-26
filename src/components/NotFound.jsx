import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from './SEOHead';

const NotFound = () => {
  return (
    <>
      <SEOHead
        title="404 — 頁面找不到 | Koimsurai"
        description="你迷路了嗎？這個頁面不存在。"
      />
      <div style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        textAlign: 'center',
        padding: '2rem',
        position: 'relative',
        zIndex: 10,
      }}>
        <h1 style={{
          fontSize: 'clamp(5rem, 15vw, 10rem)',
          fontWeight: 800,
          background: 'linear-gradient(135deg, #7f5af0, #2cb67d)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1,
          marginBottom: '0.5rem',
          userSelect: 'none',
        }}>
          404
        </h1>
        <p style={{
          fontSize: 'clamp(1rem, 3vw, 1.5rem)',
          color: 'rgba(255,255,255,0.6)',
          marginBottom: '2rem',
          maxWidth: '480px',
        }}>
          看起來你迷失在星際之間了。
          <br />這個頁面不存在，或已被移除。
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 2rem',
            borderRadius: '9999px',
            background: 'linear-gradient(135deg, #7f5af0, #2cb67d)',
            color: 'white',
            fontWeight: 600,
            fontSize: '1rem',
            textDecoration: 'none',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 0 20px rgba(127, 90, 240, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 0 30px rgba(127, 90, 240, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(127, 90, 240, 0.3)';
          }}
        >
          ← 返回首頁
        </Link>
      </div>
    </>
  );
};

export default NotFound;
