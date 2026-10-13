import clsx from 'clsx'
import { CircleCheck, PanelBottom, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAddToDock, useInstallation, useUninstall, type Installation } from '../../api/app'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'

/** Desktop-App: ins Dock legen (Mac) und sauber deinstallieren. */
export function InstallationSection() {
  const installation = useInstallation(true)
  const [uninstalling, setUninstalling] = useState(false)
  const data = installation.data
  if (!data || data.platform === 'other') return null

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-extrabold">App auf diesem Computer</h2>
        <p className="text-sm text-muted">
          {data.platform === 'mac'
            ? 'Leg den Urlaubsplanner ins Dock, dann hast du ihn immer mit einem Klick zur Hand.'
            : data.installer
              ? 'Startmenü und Desktop-Verknüpfung legt der Installer an. Deinstallieren geht hier oder unter Windows-Einstellungen → Apps.'
              : 'Deinstallieren entfernt den Programmordner, Verknüpfungen und auf Wunsch deine Daten.'}
        </p>
      </div>
      {data.platform === 'mac' && <DockRow installation={data} />}
      {data.canUninstall && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-sm text-muted">App, Verknüpfungen und auf Wunsch alle Daten von diesem Computer entfernen.</span>
          <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setUninstalling(true)}>
            Urlaubsplanner deinstallieren
          </Button>
        </div>
      )}
      <UninstallDialog open={uninstalling} onClose={() => setUninstalling(false)} />
    </section>
  )
}

export function DockRow({ installation }: { installation: Installation }) {
  const dock = useAddToDock()
  if (installation.inDock) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 font-semibold">
        <CircleCheck size={18} className="text-accent" />
        Liegt im Dock
      </p>
    )
  }
  if (!installation.canAddToDock) {
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
        Zieh den Urlaubsplanner zuerst in den Ordner <strong>„Programme“</strong> und öffne ihn von dort – dann kann er ins Dock.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button className="w-fit" icon={<PanelBottom size={16} />} onClick={() => dock.mutate()} disabled={dock.isPending}>
        Ins Dock legen
      </Button>
      {dock.error && <p className="text-sm text-danger">Das hat nicht geklappt – zieh die App aus „Programme“ einfach selbst ins Dock.</p>}
    </div>
  )
}

function UninstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const uninstall = useUninstall()
  const [keepData, setKeepData] = useState(false)

  if (uninstall.isSuccess) return <Goodbye />

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Urlaubsplanner deinstallieren?"
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="destructive" onClick={() => uninstall.mutate(keepData)} disabled={uninstall.isPending}>
            Deinstallieren
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[15px] leading-relaxed text-muted">
          Die App schließt sich und wird mit allen Verknüpfungen von diesem Computer entfernt.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Was passiert mit deinen Daten?</legend>
          <Choice
            checked={!keepData}
            onSelect={() => setKeepData(false)}
            title="Alles löschen"
            text="Auch deine Reisen, Einstellungen und deinen API-Key."
          />
          <Choice
            checked={keepData}
            onSelect={() => setKeepData(true)}
            title="Reisen behalten"
            text="Falls du den Urlaubsplanner später wieder installierst, sind sie dann noch da."
          />
        </fieldset>
        {uninstall.error && <p className="text-sm text-danger">{uninstall.error.message}</p>}
      </div>
    </Dialog>
  )
}

function Choice({ checked, onSelect, title, text }: { checked: boolean; onSelect: () => void; title: string; text: string }) {
  return (
    <label
      className={clsx(
        'flex cursor-pointer gap-3 rounded-xl border px-4 py-3',
        checked ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
      )}
    >
      <input type="radio" name="daten" checked={checked} onChange={onSelect} className="mt-1" />
      <span className="flex flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted">{text}</span>
      </span>
    </label>
  )
}

function Goodbye() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 p-6 text-center backdrop-blur" role="status">
      <div className="flex max-w-md flex-col gap-2">
        <p className="text-2xl font-extrabold">Der Urlaubsplanner wird entfernt</p>
        <p className="text-muted">Das dauert ein paar Sekunden. Du kannst dieses Fenster jetzt schließen. Gute Reise!</p>
      </div>
    </div>
  )
}
