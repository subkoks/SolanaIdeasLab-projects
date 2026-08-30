process.env.SKIP_WALLET_SIGNATURE_VERIFY = 'true'
// Keep the server from auto-starting when tests import the app module.
process.env.NODE_ENV = 'test'

// Test-only Stripe configuration so the webhook route exercises the real
// signature-verification + claim/release path (JSON fallback DB, no network).
// These values are non-production secrets used exclusively by the test suite.
process.env.STRIPE_SECRET_KEY = 'sk_test_bot_http_coverage'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_bot_http_coverage'
process.env.STRIPE_PRICE_BASIC = 'price_basic'
process.env.STRIPE_PRICE_PRO = 'price_pro'
process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise'
