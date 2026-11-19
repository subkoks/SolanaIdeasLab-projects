// Jest-only mapping: even tests importing config as production/staging must
// never load the developer's .env files. Runtime dotenv remains unchanged.
module.exports = { config: () => ({ parsed: {} }) }
