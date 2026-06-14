const fs = require('fs')
const file = 'saas/app/api/hub/action/route.ts'
let code = fs.readFileSync(file, 'utf8')
const start = code.indexOf("  // Create a product (name + description only; pricing handled by create_price)")
const end = code.indexOf("  // Edit a product (name/description/active)", start)
if (start === -1 || end === -1) throw new Error('Stripe product block not found')
const replacement = `  // Create Product + first Price
  if (template.id === 'stripe.create_product') {
    const params: Record<string, string> = { name: String(payload.name || '') }
    if (payload.description) params.description = String(payload.description)

    const productRes = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    })
    if (!productRes.ok) {
      const e = await productRes.text()
      return { ok: false, error: e || productRes.statusText }
    }
    const product = await productRes.json()

    const dollars = Number(payload.unit_amount || 0)
    const cents = Math.round(dollars * 100)
    const interval = String(payload.interval || 'month')

    if (cents <= 0) {
      return { ok: false, error: 'Price is required when creating a Stripe product from this form', data: { productId: product.id, productName: product.name } }
    }

    const priceParams: Record<string, string> = {
      product: product.id,
      currency: String(payload.currency || 'usd'),
      unit_amount: String(cents),
    }
    if (interval !== 'one_time') priceParams['recurring[interval]'] = interval

    const priceRes = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(priceParams).toString(),
    })
    if (!priceRes.ok) {
      const e = await priceRes.text()
      return { ok: false, error: 'Product created, but price creation failed: ' + (e || priceRes.statusText), data: { productId: product.id, productName: product.name } }
    }
    const price = await priceRes.json()

    return {
      ok: true,
      message: 'Product and price created: ' + (product.name || product.id),
      data: {
        productId: product.id,
        productName: product.name,
        priceId: price.id,
        unit_amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval || 'one_time',
      },
    }
  }

`
code = code.slice(0, start) + replacement + code.slice(end)
fs.writeFileSync(file, code)
console.log('Patched Stripe create_product to create product + price')
