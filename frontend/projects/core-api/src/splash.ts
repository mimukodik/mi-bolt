// projects/core-api/src/splash.ts — MIM-404.
//
// Every app's index.html carries a cover screen, #mi-bolt-splash, that paints
// before any script runs. The app calls dismissSplash() once its first
// screen is ready: the splash--leaving class starts the exit animation that
// index.html defines, the call waits for the animations running on the
// element itself (not its looping decoration), and only then removes it from
// the DOM. The splash is outside every Angular template, so animate.leave
// does not apply (https://angular.dev/guide/animations); getAnimations() is
// the DOM's own wait for a CSS animation
// (https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations).
// A cancelled animation rejects its finished promise, hence allSettled; with
// prefers-reduced-motion the list is empty and the element goes at once.

/** The id every app's index.html gives its cover screen. */
export const SPLASH_ID = 'mi-bolt-splash';

/** The class whose CSS animation takes the cover screen away. */
export const SPLASH_LEAVING_CLASS = 'splash--leaving';

/** Runs the cover screen's exit animation, then removes it. A second call is a no-op. */
export async function dismissSplash(doc: Document): Promise<void> {
  const splash = doc.getElementById(SPLASH_ID);
  if (splash === null || splash.classList.contains(SPLASH_LEAVING_CLASS)) return;
  splash.classList.add(SPLASH_LEAVING_CLASS);
  await Promise.allSettled(splash.getAnimations().map((animation) => animation.finished));
  splash.remove();
}
