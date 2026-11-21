/** Figures: old-style in running text, lining and tabular in tables. */

const rows: Array<[name: string, amount: number, unit: string, kcal: number]> = [
  ['Puy lentils', 180, 'g', 634],
  ['Leeks', 2, 'pcs', 108],
  ['Crème fraîche', 1.5, 'dl', 437],
  ['Dijon mustard', 15, 'g', 10],
]

const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const kcal = new Intl.NumberFormat('en')

export default function Figures() {
  const total = rows.reduce((sum, [, , , k]) => sum + k, 0)
  return (
    <>
      <p className="serif-text specimen-measure">
        In running text figures sit among the letters: serves 4, ready in 35 minutes, 1189 kcal across the
        dish, cooked on 3 of 7 nights in 2026.
      </p>
      <table className="specimen-table">
        <caption className="kicker">In a table they line up: lining and tabular</caption>
        <thead>
          <tr>
            <th scope="col">Ingredient</th>
            <th scope="col" className="specimen-right">Amount</th>
            <th scope="col">Unit</th>
            <th scope="col" className="specimen-right">kcal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, a, unit, k]) => (
            <tr key={name}>
              <td className="specimen-serif">{name}</td>
              <td className="specimen-right">{amount.format(a)}</td>
              <td>{unit}</td>
              <td className="specimen-right">{kcal.format(k)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Whole dish
            </th>
            <td className="specimen-right">{kcal.format(total)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  )
}
