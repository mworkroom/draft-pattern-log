export function focusReviewForm(targetId = 'student-name') {
  window.requestAnimationFrame(() => {
    document.querySelector('.form-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    if (window.matchMedia('(max-width: 1100px)').matches) {
      document.querySelector('.form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    document.getElementById(targetId)?.focus({ preventScroll: true })
  })
}
