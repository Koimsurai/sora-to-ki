import React from 'react';
import { Link } from 'react-router-dom'; // 導入 Link
import { useAuth } from '../contexts/AuthContext';
import './Footer.css';

function Footer() {
  const currentYear = new Date().getFullYear();
  const { user, isLoggedIn } = useAuth();
  const showAdmin = isLoggedIn && user?.displayName === 'timo9378';

  return (
    <footer className="app-footer">
      <p>
        &copy; {currentYear} 楊泰和. All rights reserved.{showAdmin && <> | <Link to="/admin/login" className="admin-login-link">Admin</Link></>}
      </p>
      {/* 您可以在此處添加其他連結，例如 GitHub、LinkedIn 等 */}
    </footer>
  );
}

export default Footer;
