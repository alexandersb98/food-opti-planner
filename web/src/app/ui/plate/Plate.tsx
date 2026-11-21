import { useId, type CSSProperties, type ReactNode } from 'react'
import { plateDish, plateHue } from './plateHue'
import './plate.css'

// D2's colour plates (prototypes/d2-editorial-refined/app.js, plateSVG): a
// dish on a tablecloth seen from above, coloured by CSS from one hue (--h)
// and the edition's --pl-* tokens. Drawn shapes are static; only the hue,
// the dish and the cloth's pattern id change.

const leaves = (points: Array<[number, number, number]>) =>
  points.map(([x, y, angle]) => (
    <ellipse key={`${x},${y}`} className="leaf" cx={x} cy={y} rx="9" ry="3.6" transform={`rotate(${angle} ${x} ${y})`} />
  ))

/** The four dishes of the spread: plate with napkin and fork, oval platter,
 * bowl of soup with a spoon, cast-iron pan. */
const DISHES: readonly ReactNode[] = [
  <>
    <g transform="rotate(-7 95 116)">
      <rect className="napkin" x="40" y="26" width="104" height="176" />
      <rect className="napkin-line" x="47" y="33" width="90" height="162" />
      <rect className="cutlery" x="89" y="78" width="6" height="104" rx="3" />
      <path className="cutlery" d="M80 46h24v30a12 12 0 0 1-24 0z" />
    </g>
    <circle className="shade" cx="254" cy="128" r="96" />
    <circle className="china" cx="246" cy="120" r="96" />
    <circle className="rimline" cx="246" cy="120" r="72" />
    <circle className="food" cx="246" cy="122" r="50" />
    <circle className="food-2" cx="224" cy="104" r="13" />
    <circle className="food-2" cx="266" cy="140" r="10" />
    <circle className="food-2" cx="258" cy="96" r="7" />
    <circle className="cream" cx="236" cy="142" r="8" />
    {leaves([[268, 112, -30], [228, 132, 40], [246, 92, 10]])}
  </>,
  <>
    <ellipse className="shade" cx="210" cy="128" rx="136" ry="88" />
    <ellipse className="china" cx="202" cy="120" rx="136" ry="88" />
    <ellipse className="rimline" cx="202" cy="120" rx="112" ry="66" />
    <ellipse className="food" cx="178" cy="112" rx="56" ry="24" transform="rotate(-14 178 112)" />
    <ellipse className="food" cx="226" cy="134" rx="52" ry="22" transform="rotate(-8 226 134)" />
    <circle className="food-2" cx="150" cy="140" r="9" />
    <circle className="food-2" cx="166" cy="148" r="8" />
    <circle className="food-2" cx="260" cy="100" r="9" />
    <circle className="cream" cx="246" cy="96" r="10" />
    {leaves([[204, 100, -60], [212, 104, 20], [190, 142, 70], [140, 116, -20]])}
  </>,
  <>
    <g transform="rotate(18 80 120)">
      <ellipse className="cutlery" cx="80" cy="58" rx="16" ry="22" />
      <rect className="cutlery" x="76" y="76" width="8" height="110" rx="4" />
    </g>
    <circle className="shade" cx="258" cy="126" r="92" />
    <circle className="china" cx="250" cy="118" r="92" />
    <circle className="china-2" cx="250" cy="118" r="78" />
    <circle className="food" cx="250" cy="118" r="70" />
    <path className="swirl" d="M222 106c10-22 52-22 58 6s-30 40-50 22" />
    <circle className="food-2" cx="286" cy="150" r="5" />
    <circle className="food-2" cx="214" cy="146" r="4" />
    <circle className="food-2" cx="270" cy="84" r="4" />
    {leaves([[244, 120, 30], [258, 128, -40]])}
  </>,
  <>
    <rect className="iron" x="0" y="110" width="170" height="20" rx="10" />
    <circle className="shade" cx="262" cy="128" r="100" />
    <circle className="iron" cx="254" cy="120" r="100" />
    <circle className="iron-2" cx="254" cy="120" r="86" />
    <circle className="food" cx="226" cy="98" r="24" />
    <circle className="food" cx="280" cy="108" r="22" />
    <circle className="food" cx="248" cy="150" r="26" />
    <circle className="food-2" cx="204" cy="138" r="12" />
    <circle className="food-2" cx="292" cy="148" r="11" />
    <circle className="food-2" cx="262" cy="76" r="10" />
    <circle className="cream" cx="254" cy="120" r="7" />
    {leaves([[230, 128, 20], [276, 132, -50], [256, 96, 70]])}
  </>,
]

/** The tablecloth weave of each dish: check, stripes, dots, bias stripes. */
function cloth(dish: number, id: string) {
  switch (dish) {
    case 0:
      return (
        <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse">
          <rect className="cloth" width="28" height="28" />
          <rect className="band" width="14" height="28" opacity=".5" />
          <rect className="band" width="28" height="14" opacity=".5" />
        </pattern>
      )
    case 1:
      return (
        <pattern id={id} width="22" height="22" patternUnits="userSpaceOnUse">
          <rect className="cloth" width="22" height="22" />
          <rect className="band" x="3" width="3" height="22" />
          <rect className="band" x="9" width="1" height="22" />
        </pattern>
      )
    case 2:
      return (
        <pattern id={id} width="22" height="22" patternUnits="userSpaceOnUse">
          <rect className="cloth" width="22" height="22" />
          <circle className="band" cx="5.5" cy="5.5" r="2.6" />
          <circle className="band" cx="16.5" cy="16.5" r="2.6" />
        </pattern>
      )
    default:
      return (
        <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
          <rect className="cloth" width="9" height="9" />
          <rect className="band" width="2.5" height="9" opacity=".7" />
        </pattern>
      )
  }
}

/** The small round swatch of the recipe index (44 px): china or iron. */
function swatch(dish: number) {
  return (
    <>
      <circle className="shade" cx="23.5" cy="23.5" r="20" />
      {dish === 3 ? (
        <>
          <circle className="iron" cx="22" cy="22" r="20" />
          <circle className="iron-2" cx="22" cy="22" r="16.5" />
        </>
      ) : (
        <>
          <circle className="china" cx="22" cy="22" r="20" />
          <circle className="rimline" cx="22" cy="22" r="15.5" />
        </>
      )}
      <circle className="food" cx="22" cy="22" r={dish === 2 ? 13.5 : 10.5} />
      <circle className="food-2" cx="18.5" cy="19.5" r="3.6" />
      <circle className="food-2" cx="25.5" cy="18" r="2.2" />
      <ellipse className="leaf" cx="25.5" cy="26" rx="3.4" ry="1.6" transform="rotate(-30 25.5 26)" />
    </>
  )
}

/**
 * A recipe's drawn colour plate, its hue and dish taken from the recipe id
 * (the same id always draws the same plate). `spread` (default) fills its
 * box (give the box a size; D2's spread is full width, 232 px high);
 * `swatch` is the 44 px round of the recipe index.
 *
 * Decorative unless `label` is given ("Colour plate for Lentil soup"),
 * then it is an image with that name.
 *
 * ```tsx
 * <Plate id={recipe.id} label={t('recipes.plateOf', { name })} className="spread-plate" />
 * <Plate id={recipe.id} variant="swatch" />
 * ```
 */
export function Plate({
  id,
  variant = 'spread',
  label,
  className,
}: {
  id: number | string
  variant?: 'spread' | 'swatch'
  label?: string
  className?: string
}) {
  const patternId = `plate-cloth${useId().replace(/[^\w-]/g, '')}`
  const dish = plateDish(id)
  const style = { '--h': plateHue(id) } as CSSProperties
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  const classes = ['plate', `plate-${variant}`, className ?? ''].filter(Boolean).join(' ')

  if (variant === 'swatch') {
    return (
      <svg className={classes} viewBox="0 0 44 44" style={style} focusable="false" {...a11y}>
        {swatch(dish)}
      </svg>
    )
  }
  return (
    <svg className={classes} viewBox="0 0 390 232" preserveAspectRatio="xMidYMid slice" style={style} focusable="false" {...a11y}>
      <defs>{cloth(dish, patternId)}</defs>
      <rect width="390" height="232" fill={`url(#${patternId})`} />
      {DISHES[dish]}
    </svg>
  )
}
