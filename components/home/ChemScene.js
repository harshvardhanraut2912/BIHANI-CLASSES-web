import s from './chemScene.module.css';

/* Mobile-only animated chemistry scene shown at the top of the hero:
   bubbling flask (colour-changing indicator), orbiting-electron atom, H2O and CO2 molecules. */
export default function ChemScene() {
  const flask = 'M58 28V78L24 160Q20 172 34 172H106Q120 172 116 160L82 78V28Z';
  return (
    <div className={s.scene} aria-hidden="true">
      <svg viewBox="0 0 360 200" className={s.svg} focusable="false">
        <defs>
          <clipPath id="sceneFlask"><path d={flask} /></clipPath>
          <radialGradient id="sceneNuc" cx="35%" cy="35%">
            <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#e0242c" />
          </radialGradient>
        </defs>

        {/* drifting formulas */}
        <g className={s.floaters} fontWeight="700" fill="#172a85">
          <text x="132" y="34" className={s.f1}>pH 7</text>
          <text x="238" y="30" className={s.f2}>H⁺</text>
          <text x="236" y="188" className={s.f3}>NaCl</text>
          <text x="140" y="190" className={s.f4}>e⁻</text>
          <text x="338" y="110" className={s.f2}>OH⁻</text>
        </g>

        {/* flask */}
        <g clipPath="url(#sceneFlask)">
          <g className={s.waveWrap}>
            <path className={`${s.liquid} ${s.wave}`} d="M-50 112q15 -8 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0V190H-50Z" />
          </g>
          {[52, 70, 90].map((x, i) => (
            <circle key={x} cx={x} cy="165" r={3 + (i % 2)} className={s.bub} style={{ animationDelay: `${i * 0.8}s` }} />
          ))}
        </g>
        <path d={flask} fill="none" stroke="#172a85" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M51 28H89" stroke="#172a85" strokeWidth="4" strokeLinecap="round" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={64 + i * 6} cy="22" r="2.6" className={s.vapor} style={{ animationDelay: `${i * 0.7}s` }} />
        ))}

        {/* atom */}
        <g transform="translate(192 100)">
          {[0, 60, 120].map((rot, i) => (
            <g key={rot} transform={`rotate(${rot})`}>
              <ellipse rx="48" ry="17" fill="none" stroke="#172a85" strokeOpacity=".35" strokeWidth="1.5" />
              <circle r="4.6" fill={['#12a0ee', '#e0242c', '#f2b01d'][i]} stroke="#fff" strokeWidth="1">
                <animateMotion dur={`${3 + i}s`} repeatCount="indefinite" path="M-48,0 a48,17 0 1,0 96,0 a48,17 0 1,0 -96,0" />
              </circle>
            </g>
          ))}
          <circle r="11" fill="url(#sceneNuc)" stroke="#172a85" strokeWidth="1.5" className={s.pulse} />
        </g>

        {/* water molecule */}
        <g transform="translate(300 52)">
          <g className={s.bob}>
            <path d="M0 0L-19 15M0 0L19 15" stroke="#172a85" strokeWidth="3" strokeLinecap="round" />
            <circle r="12" fill="#e0242c" stroke="#172a85" strokeWidth="1.5" />
            <circle cx="-19" cy="15" r="7" fill="#fff" stroke="#172a85" strokeWidth="1.5" />
            <circle cx="19" cy="15" r="7" fill="#fff" stroke="#172a85" strokeWidth="1.5" />
          </g>
        </g>

        {/* carbon dioxide molecule */}
        <g transform="translate(300 148)">
          <g className={s.spinSlow}>
            <path d="M-26 -3H26M-26 3H26" stroke="#172a85" strokeWidth="2.5" strokeLinecap="round" />
            <circle r="10" fill="#4f5b78" stroke="#172a85" strokeWidth="1.5" />
            <circle cx="-28" r="9" fill="#e0242c" stroke="#172a85" strokeWidth="1.5" />
            <circle cx="28" r="9" fill="#e0242c" stroke="#172a85" strokeWidth="1.5" />
          </g>
        </g>
      </svg>
    </div>
  );
}
