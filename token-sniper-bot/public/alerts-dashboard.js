const formatJson = (payload) => JSON.stringify(payload, null, 2)

const fetchJson = async (url) => {
  const response = await fetch(url)
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
