/** The palette: live swatches of every colour token in the current edition,
 * and the contrast of the text pairs in both editions (values as in
 * styles/tokens.css). */

const swatches: Array<[token: string, role: string]> = [
  ['paper', 'The page'],
  ['paper-2', 'Insets, previews'],
  ['paper-3', 'Pressed, disabled chips'],
  ['ink', 'Text and ink buttons'],
  ['ink-2', 'Standfirsts, running heads'],
  ['muted', 'Labels, notes, kickers'],
  ['rule', 'Hairlines'],
  ['rule-strong', 'Section and double rules'],
  ['accent', 'The red pencil: focus, numbers, marks'],
  ['accent-ink', 'Text on the accent'],
  ['accent-soft', 'Selection, soft marks'],
  ['good', 'Met, done'],
  ['review', 'Needs a look'],
  ['review-ink', 'Text on review'],
  ['desk', 'The desk (wide screens)'],
]

const editions = {
  paper: { paper: '#f4efe4', 'paper-2': '#ebe4d5', ink: '#1d1a16', 'ink-2': '#39332b', muted: '#62594c', accent: '#a4371a', 'accent-ink': '#fff8ef', good: '#3b6636', review: '#f8e4a0', 'review-ink': '#4f3a00' },
  evening: { paper: '#16130f', 'paper-2': '#1f1b16', ink: '#efe6d4', 'ink-2': '#d6ccb8', muted: '#a99e8a', accent: '#ef8d66', 'accent-ink': '#1a110b', good: '#9cc38f', review: '#45380f', 'review-ink': '#f6dc8a' },
}
type Token = keyof typeof editions.paper

const pairs: Array<[fg: Token, bg: Token]> = [
  ['ink', 'paper'],
  ['ink-2', 'paper'],
  ['muted', 'paper'],
  ['accent', 'paper'],
  ['good', 'paper'],
  ['muted', 'paper-2'],
  ['accent', 'paper-2'],
  ['accent-ink', 'accent'],
  ['paper', 'ink'],
  ['review-ink', 'review'],
]

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const ratio = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function Ratio({ fg, bg }: { fg: string; bg: string }) {
  const value = contrast(fg, bg)
  return (
    <td className="specimen-ratio">
      {ratio.format(value)}:1 <span className={value >= 4.5 ? 'specimen-pass' : 'specimen-fail'}>{value >= 4.5 ? 'AA' : 'below AA'}</span>
    </td>
  )
}

export default function Palette() {
  return (
    <>
      <ul className="specimen-swatches">
        {swatches.map(([token, role]) => (
          <li key={token}>
            <span className="specimen-chip" style={{ background: `var(--${token})` }} aria-hidden="true" />
            <code translate="no">--{token}</code>
            <span className="specimen-role">{role}</span>
          </li>
        ))}
      </ul>
      <table className="specimen-contrast">
        <caption className="kicker">Contrast of text on its ground (WCAG AA asks 4.5:1 for body text)</caption>
        <thead>
          <tr>
            <th scope="col">Text on ground</th>
            <th scope="col">Paper</th>
            <th scope="col">Evening</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map(([fg, bg]) => (
            <tr key={`${fg}/${bg}`}>
              <th scope="row">
                <span className="specimen-pair" style={{ color: `var(--${fg})`, background: `var(--${bg})` }}>
                  Aa
                </span>{' '}
                {fg} on {bg}
              </th>
              <Ratio fg={editions.paper[fg]} bg={editions.paper[bg]} />
              <Ratio fg={editions.evening[fg]} bg={editions.evening[bg]} />
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
