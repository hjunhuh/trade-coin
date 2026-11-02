import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { Globe, Play, Wallet, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RailTooltip } from '@/components/RailTooltip'
import { LANGUAGES, type Language } from '@/i18n'
import { useUi } from '@/lib/store'
import { cn } from '@/lib/utils'

/** Each language is listed in its own name so it can be found from either side. */
const LANGUAGE_NAMES: Record<Language, string> = { ko: '한국어', en: 'English' }

/**
 * Page frame: the rail on the left and the screen to its right. Phones get the full width,
 * since there the rail slides over the page. Trading gets the whole screen: no rail on a chart.
 *
 * The rail floats over the page, so on wide screens pages stay centered on the window, in line
 * with sheets and toasts. Only when a 48rem page would reach under the rail does the frame make
 * room, and just enough to keep the page's left edge 5rem in: 58rem = 48rem page + 5rem on each side.
 */
export function SideNavFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const show = pathname !== '/' && !pathname.startsWith('/trade/')
  return (
    <>
      {show && <SideNav />}
      {/* Same element either way, so the page isn't remounted when the rail comes or goes */}
      <div className={show ? 'sm:pl-[clamp(0rem,calc(58rem-100vw),5rem)]' : undefined}>{children}</div>
    </>
  )
}

const itemClass = (active: boolean, accent = false) =>
  cn(
    'relative flex size-10 items-center justify-center rounded-xl text-muted-foreground outline-none',
    'transition-[color,background-color,scale] duration-150 ease-out [&_svg]:size-4.5 [&_svg]:shrink-0',
    // Hover looks come from `data-hovered`, set by the rail tooltip (see RailTooltip), not :hover
    'data-hovered:bg-white/6 data-hovered:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95',
    // Active: a lit tile plus a small marker on the rail's inner edge
    active &&
      'bg-white/8 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] data-hovered:bg-white/10 before:absolute before:top-1/2 before:-left-1.5 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-foreground',
    // The main action: a solid blue button
    accent &&
      'bg-blue-500 text-white shadow-[0_6px_16px_-4px_rgb(59_130_246/0.6),inset_0_1px_0_rgb(255_255_255/0.2)] data-hovered:bg-blue-400 data-hovered:text-white [&_svg]:fill-current',
  )

function Divider() {
  return <div aria-hidden className="my-1.5 h-px w-5 bg-white/8" />
}

/**
 * Floating icon rail, pinned to the left edge and centered vertically.
 * On phones it stays tucked behind a small edge tab and slides in when tapped.
 */
function SideNav() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  // Links first, then the language button, matching the tooltip's labels
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  // Tuck the phone rail away again after moving to another screen, or on Escape.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const sym = useUi((s) => s.sym)

  const items: { to: string; icon: LucideIcon; label: string; active: boolean; accent?: boolean }[] = [
    {
      to: `/trade/${sym}`,
      icon: Play,
      label: t('nav.trade'),
      // Never the current screen: the rail is hidden while trading
      active: false,
      accent: true,
    },
    { to: '/account', icon: Wallet, label: t('nav.account'), active: pathname.startsWith('/account') },
  ]
  const labels = [...items.map((item) => item.label), t('nav.language')]

  return (
    <>
      {/* Phones: edge tab that pulls the rail out, and a dim backdrop that puts it back */}
      <button
        type="button"
        aria-label={t('nav.menu')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          'fixed top-1/2 left-0 z-30 flex h-14 w-3.5 -translate-y-1/2 animate-appear items-center justify-center rounded-r-xl border border-l-0 bg-card sm:hidden',
          'shadow-[0_8px_24px_-6px_rgb(0_0_0/0.8)] transition-opacity duration-200',
          // A wider invisible hit area than the tab itself
          'before:absolute before:-inset-y-2 before:left-0 before:-right-3',
          open && 'pointer-events-none opacity-0',
        )}
      >
        <span className="h-5 w-1 rounded-full bg-white/25" />
      </button>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 sm:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <nav
        ref={navRef}
        aria-label={t('nav.menu')}
        className={cn(
          'fixed top-1/2 left-2 z-40 flex -translate-y-1/2 animate-appear flex-col items-center gap-1 sm:left-3',
          'rounded-[22px] border bg-card p-1.5',
          'shadow-[0_12px_40px_-8px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.04)]',
          'transition-[translate,opacity] duration-200 ease-out',
          !open && 'max-sm:pointer-events-none max-sm:-translate-x-[calc(100%+1rem)] max-sm:opacity-0',
        )}
      >
        {items.map(({ to, icon: Icon, label, active, accent }, i) => (
          <Link
            key={to}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            to={to}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            onClick={() => setOpen(false)}
            className={itemClass(active, accent)}
          >
            <Icon />
          </Link>
        ))}

        <Divider />

        <DropdownMenu open={languageOpen} onOpenChange={setLanguageOpen}>
          <DropdownMenuTrigger
            ref={(el) => {
              itemRefs.current[items.length] = el
            }}
            aria-label={t('nav.language')}
            className={cn(itemClass(false), 'data-[state=open]:bg-white/8 data-[state=open]:text-foreground')}
          >
            <Globe />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={14}>
            <DropdownMenuRadioGroup value={i18n.resolvedLanguage} onValueChange={(v) => i18n.changeLanguage(v)}>
              {LANGUAGES.map((l) => (
                <DropdownMenuRadioItem key={l} value={l} lang={l}>
                  {LANGUAGE_NAMES[l]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <RailTooltip navRef={navRef} itemRefs={itemRefs} labels={labels} suppressed={languageOpen} />
      </nav>
    </>
  )
}
