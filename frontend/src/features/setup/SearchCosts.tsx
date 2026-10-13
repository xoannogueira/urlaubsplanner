/** Was wie viele Google-Suchen kostet – im Tutorial und in den Einstellungen. */
const costs: [string, string][] = [
  ['Flüge suchen', '1'],
  ['Rückflug zu einem Hinflug aufklappen', '1'],
  ['Hotels suchen', '1 (bei unbekannten kleinen Orten bis zu 3)'],
  ['Weitere Hotels laden', '1'],
  ['Gemerktes Hotel oder Flug neu prüfen', '1–2'],
  ['Andere Daten prüfen', 'bis zu 6 (Hotels: 6 pro Hotel)'],
  ['Gleiche Suche innerhalb einer Stunde', 'kostenlos'],
  ['Aktivitäten, Karte, Ortssuche', 'kostenlos'],
]

export function SearchCosts() {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Was wie viele Google-Suchen kostet</caption>
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th scope="col" className="py-2 font-bold">
            Aktion
          </th>
          <th scope="col" className="py-2 text-right font-bold">
            Suchen
          </th>
        </tr>
      </thead>
      <tbody>
        {costs.map(([action, cost]) => (
          <tr key={action} className="border-b border-line last:border-0">
            <td className="py-2">{action}</td>
            <td className="py-2 text-right text-[13px] font-semibold">{cost}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
