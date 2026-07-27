export function debounce(callback, delay = 250) {
  let timeoutId

  return (...args) => {
    window.clearTimeout(timeoutId)
    timeoutId = window.setTimeout(() => callback(...args), delay)
  }
}
