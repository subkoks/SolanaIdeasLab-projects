const formatJson = (payload) => JSON.stringify(payload, null, 2)

let dashboardAccessToken = ''

const initAccessToken = () => {
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('access_token')
  if (!fromUrl) {
    return
  }

  dashboardAccessToken = fromUrl
  params.delete('access_token')
  const query = params.toString()
  const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
  window.history.replaceState({}, '', cleanUrl)

  const input = document.getElementById('access-token-input')
  if (input instanceof HTMLInputElement) {
    input.value = fromUrl
  }
}

initAccessToken()

const getAccessToken = () => {
  const input = document.getElementById('access-token-input')
  if (input instanceof HTMLInputElement && input.value.trim()) {
    return input.value.trim()
  }
  return dashboardAccessToken
}

const fetchJson = async (url) => {
  const token = getAccessToken()
  const headers = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`${url} → ${response.status}`)
  }
  return response.json()
}

document.getElementById('load-metrics')?.addEventListener('click', async () => {
  const output = document.getElementById('metrics-output')
  if (!output) return
  output.textContent = 'Loading…'
  try {
    output.textContent = formatJson(await fetchJson('/api/v1/alerts/metrics'))
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : 'Failed'
  }
})

document.getElementById('load-launches')?.addEventListener('click', async () => {
  const output = document.getElementById('launch-output')
  if (!output) return
  output.textContent = 'Loading…'
  try {
    output.textContent = formatJson(await fetchJson('/api/v1/launches/stats'))
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : 'Failed'
  }
})

document.getElementById('load-history')?.addEventListener('click', async () => {
  const output = document.getElementById('history-output')
  const tokenInput = document.getElementById('token-input')
  if (!output || !(tokenInput instanceof HTMLInputElement)) return

  const token = tokenInput.value.trim()
  if (!token) {
    output.textContent = 'Enter a token mint address'
    return
  }

  output.textContent = 'Loading…'
  try {
    output.textContent = formatJson(
      await fetchJson(
        `/api/v1/alerts/history?token=${encodeURIComponent(token)}&limit=20`,
      ),
    )
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : 'Failed'
  }
})
