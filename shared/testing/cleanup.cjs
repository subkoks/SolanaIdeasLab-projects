const { rmSync } = require('node:fs')

// Capture the directory before individual tests replace process.env.
const directory = process.env.TEST_WORK_DIR
afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true })
})
