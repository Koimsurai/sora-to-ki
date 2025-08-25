import React from 'react';
import './BlackHole.css';

const BlackHole = () => {
  return (
    <div className="black-hole-container">
      <div className="black-hole">
        <div className="event-horizon">
          <div className="accretion-disk"></div>
          <div className="accretion-disk disk-2"></div>
          <div className="accretion-disk disk-3"></div>
        </div>
        <div className="gravitational-lensing"></div>
        <div className="particle-jets">
          <div className="jet jet-top"></div>
          <div className="jet jet-bottom"></div>
        </div>
        <div className="swirling-matter">
          {[...Array(12)].map((_, i) => (
            <div key={i} className={`matter-particle particle-${i + 1}`}></div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BlackHole;
