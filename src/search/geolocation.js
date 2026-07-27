export function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Browser geolocation is not available.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        const messages = {
          1: 'Location permission was not granted.',
          2: 'Your location could not be determined.',
          3: 'Location detection timed out.',
        }

        reject(
          new Error(
            messages[error.code] ?? 'Your location could not be determined.',
          ),
        )
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 300_000,
      },
    )
  })
}
