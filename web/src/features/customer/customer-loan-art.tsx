/** Decorative vector artwork; all account information is rendered separately as HTML. */
export function CustomerLoanArt({ security = false }: { security?: boolean }) {
  return (
    <svg
      className={`loans-art${security ? " security" : ""}`}
      viewBox="0 0 360 205"
      aria-hidden="true"
    >
      <ellipse
        cx="208"
        cy="188"
        rx="140"
        ry="12"
        fill="#ffb9c8"
        opacity=".35"
      />
      {[35, 65, 100, 132, 282, 316].map((x, i) => (
        <g key={x} opacity=".22" fill="#ff5a7b">
          <rect
            x={x}
            y={60 + (i % 3) * 22}
            width="27"
            height={120 - (i % 3) * 22}
            rx="2"
          />
          {[0, 1, 2, 3, 4].map((j) => (
            <path
              key={j}
              d={`M${x + 5} ${72 + (i % 3) * 22 + j * 17}h17`}
              stroke="white"
              strokeWidth="4"
            />
          ))}
        </g>
      ))}
      {!security && (
        <g>
          <path
            d="M114 98l68-68 78 65v87H114z"
            fill="#ffe9ed"
            stroke="#ff839d"
            strokeWidth="2"
          />
          <path d="M99 96l83-79 95 78-12 14-83-68-72 69z" fill="#ff244d" />
          <path d="M182 17v24l83 68 12-14z" fill="#d90e39" />
          <path d="M224 34h15v29l-15-13z" fill="#ed1745" />
          <path d="M151 184v-49h35v49" fill="#ff3159" />
          <rect x="204" y="115" width="32" height="33" rx="2" fill="#ff7290" />
          <path d="M220 115v33m-16-16h32" stroke="white" strokeWidth="3" />
          <circle cx="182" cy="80" r="14" fill="#ff7191" />
          <path d="M182 66v28m-14-14h28" stroke="white" strokeWidth="3" />
        </g>
      )}
      <g transform={security ? "translate(20 -8)" : "rotate(8 275 120)"}>
        <rect
          x="237"
          y="64"
          width="79"
          height="115"
          rx="8"
          fill="#fff"
          stroke="#ff9bb1"
          strokeWidth="2"
        />
        <rect x="250" y="55" width="53" height="17" rx="5" fill="#ff4067" />
        <text x="246" y="91" fontSize="13" fontWeight="bold" fill="#ff1741">
          D4 Bank
        </text>
        <path
          d="M249 107h53m-53 14h42m-42 14h53m-53 14h32"
          stroke="#ffc2cf"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M283 158l8 6 14-14"
          stroke="#ff244f"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <g fill="#ffcf66" stroke="#ffab23" strokeWidth="3">
        <circle cx="113" cy="158" r="23" />
        <circle cx="275" cy="38" r="25" />
        <path
          d="M106 157h15m-8-10v22m155-131h15m-8-10v22"
          stroke="#fff3d0"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      {security && (
        <g transform="translate(-30 3)">
          <path
            d="M185 65c17 17 35 21 52 23v32c0 34-27 55-52 65-25-10-52-31-52-65V88c18-2 36-6 52-23z"
            fill="#ff2b53"
            stroke="#ff98af"
            strokeWidth="6"
          />
          <path
            d="M162 124l16 16 33-37"
            fill="none"
            stroke="white"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}
