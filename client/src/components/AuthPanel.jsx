import { NavLink } from 'react-router-dom';
import AuthBackdrop from './AuthBackdrop.jsx';

const TABS = [
  { to: '/login', label: 'Sign in' },
  { to: '/register', label: 'Register' },
];

/*
 * Written once and printed twice by the marquee below. Held here so the two
 * copies cannot drift apart — if they differed by a word the loop would visibly
 * change what it says halfway round.
 */
const CAPTION =
  'A library of ☯︎ 東方 Touhou Project ☯︎ doujin music. Listening and downloading are open to any travelers; an account is for keeping what you found in the Gensoukyo.';

/*
 * Shared by both copies for the same reason the text is. The loop travels half
 * the track's width, so the two must measure identically — a size or a padding
 * that applied to only one of them would put the seam in the wrong place.
 */
const CAPTION_CLASS = 'auth-shimmer pr-16 text-lg leading-relaxed';

/**
 * The shell both the sign-in and register screens sit in.
 *
 * Shared for the same reason the album and circle forms are: two auth screens
 * that drift apart is how one ends up with a switch to the other and the other
 * without it. Each page brings only its heading and its fields.
 *
 * The two routes are presented as one panel with a switch at the top rather
 * than as two pages with a sentence linking them — signing in and signing up
 * are the same decision made twice, and a segmented control says that better
 * than "No account? Register" tucked underneath a button.
 */
export default function AuthPanel({ title, blurb, children }) {
  return (
    <>
      <AuthBackdrop />

      <section className="relative z-10 mx-auto flex min-h-[70vh] max-w-4xl items-center">
        {/*
         * A floor on the height, so signing in and registering are the same
         * panel rather than two of visibly different size — register carries
         * two more fields, and without this the card would jump as the tabs
         * are switched. Only from md up, where the two columns exist; on a
         * phone the form stands alone and should take the room it needs.
         *
         * It is a floor, not a fixed height: a validation message still grows
         * the card rather than being clipped by it.
         */}
        <div className="grid w-full overflow-hidden rounded-3xl border border-white/15 shadow-2xl backdrop-blur-md md:min-h-[34rem] md:grid-cols-[1fr_1.15fr]">
          {/*
           * A greeting and the mark, nothing else. Hidden on a phone rather
           * than stacked above the form: it is who you have arrived at, not
           * anything to read, and nobody should scroll past it to reach the
           * field they came to type in.
           */}
          {/* Narrower side padding than top and bottom, so the width the
              column has goes to the words rather than to its margins. */}
          <aside className="relative hidden flex-col items-center justify-center gap-8 overflow-hidden px-7 py-10 text-center text-white md:flex">
            {/* A graded ground rather than one flat sheet of ink: the column
                gains depth against the wallpaper without hiding more of it. */}
            <div className="absolute inset-0 bg-gradient-to-b from-ink-deep/55 via-ink-deep/75 to-ink-deep/90" />

            {/* A vermilion bloom, borrowed from the torii in the mark below, so
                the panel carries the artwork's colour and not only the artwork. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-8 size-64 -translate-x-1/2 rounded-full bg-red-600/25 blur-3xl"
            />

            <div className="relative flex flex-col items-center">
              <p className="text-4xl font-bold tracking-tight">welcome to</p>

              {/* A rule instead of a gap: it separates the greeting from the
                  name without another line of text to read. */}
              <span aria-hidden="true" className="my-5 h-px w-12 bg-white/30" />

              <p className="text-sm font-medium uppercase tracking-[0.25em] text-white/65">
                Gensou Hub
              </p>
              {/* lang="ja" so the browser reaches for a Japanese face rather
                  than falling back to whatever the Latin stack offers. */}
              <p lang="ja" className="mt-1.5 text-xs tracking-[0.2em] text-white/45">
                幻想-ハブ
              </p>
            </div>

            {/*
             * Decorative: the name above already says where you are, so a
             * screen reader gains nothing by hearing the mark described too.
             * The shadow is heavier than the usual token because the artwork is
             * cut out, and its own edges are all that hold it off the panel.
             */}
            <img
              src="/gensou-hub-banner.png"
              alt=""
              aria-hidden="true"
              className="relative w-32 max-w-full drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
            />

            {/*
             * Given the column's full width rather than a narrow measure: at
             * this length a tight cap broke it into a column of five or six
             * short lines, which reads as a stack of fragments instead of a
             * sentence. It answers the question a sign-in page invites — what
             * is this, and do I even need an account — without listing
             * features.
             */}
            <div className="auth-marquee-viewport relative -mx-7 self-stretch overflow-hidden whitespace-nowrap">
              <div className="auth-marquee flex w-max">
                <p className={CAPTION_CLASS}>{CAPTION}</p>
                {/*
                 * The second copy is what makes the loop seamless, and it is
                 * the same sentence again — so it is hidden from assistive
                 * tech, which would otherwise read it out twice.
                 */}
                <p aria-hidden="true" className={`auth-marquee-echo ${CAPTION_CLASS}`}>
                  {CAPTION}
                </p>
              </div>
            </div>
          </aside>

          <div className="bg-surface/90 p-6 sm:p-8">
            {/* Where both routes live, so neither screen is a dead end. */}
            <nav className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    `flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition ${
                      isActive
                        ? 'bg-surface text-brand-700 shadow-sm dark:text-brand-300'
                        : 'text-slate-500 hover:text-slate-700'
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>

            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{blurb}</p>

            <div className="mt-6">{children}</div>
          </div>
        </div>
      </section>
    </>
  );
}
