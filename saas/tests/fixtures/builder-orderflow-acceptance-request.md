<!-- saas/tests/fixtures/builder-orderflow-acceptance-request.md -->
# OrderFlow — End-to-End Builder Acceptance Test

## Objective

Build a complete, working **OrderFlow** application using Node.js and JavaScript.

OrderFlow is a small e-commerce order-management system supporting product catalogs, shopping carts, checkout, inventory management, orders, and reporting.

**This is a real end-to-end acceptance test of the Builder platform.**

Do not return a simulated implementation, placeholders, pseudocode, or an unverified success message.

## 1. Application requirements

### Product catalog
- Create products with ID, name, description, price, and inventory quantity.
- List and retrieve products.
- Update product information.
- Prevent duplicate product IDs.
- Reject invalid prices and quantities.

### Shopping cart
- Add products to a cart.
- Update product quantities.
- Remove products.
- Calculate subtotals and totals.
- Reject invalid quantities and nonexistent products.

### Inventory management
- Check inventory before checkout.
- Reject purchases exceeding available stock.
- Deduct inventory after successful checkout.
- Preserve inventory when checkout fails.

### Order processing
- Convert a valid cart into an order.
- Generate unique order IDs.
- Store order items, totals, timestamps, and status.
- Retrieve orders.
- Support order cancellation with inventory restoration.
- Prevent duplicate cancellation or restoration.

### Reporting
- Calculate total sales.
- Count completed and cancelled orders.
- Identify best-selling products.
- Report remaining inventory.

### CLI
Provide a working command-line demonstration through `node index.js`.

The demonstration must create products, add cart items, complete checkout, display an order, and print a sales report.

## 2. Required project structure

Create all 15 files:

```text
orderflow/
├── package.json
├── README.md
├── index.js
├── src/
│   ├── catalog.js
│   ├── cart.js
│   ├── inventory.js
│   ├── orders.js
│   ├── checkout.js
│   ├── reports.js
│   └── errors.js
├── test/
│   ├── catalog.test.js
│   ├── cart.test.js
│   ├── inventory.test.js
│   ├── orders.test.js
│   └── checkout.test.js
```

Use Node.js built-in testing tools. Do not require a database, external API, paid service, or credentials.

## 3. Automated tests

Implement at least **20 meaningful automated tests**, covering:

- Product creation and retrieval.
- Invalid product data.
- Duplicate IDs.
- Cart calculations.
- Quantity validation.
- Insufficient inventory.
- Successful checkout.
- Inventory deduction.
- Failed checkout without inventory loss.
- Unique order IDs.
- Order cancellation.
- Inventory restoration.
- Repeated cancellation protection.
- Sales reporting.

Tests must execute real application code.

## 4. Mandatory verification

Execute all three commands:

```bash
npm test
node --test test/*.test.js
node index.js
```

Record the actual exit code and relevant stdout/stderr for each command.

If a command fails, inspect its real error, repair the implementation, and rerun the failed command.

After the final source change, rerun all three commands.

## 5. Builder reliability requirements

This acceptance run must also validate the Builder itself.

1. Create and persist every required file.
2. Preserve completed work across execution slices, model timeouts, and continuations.
3. Do not repeat completed writes unnecessarily.
4. Do not fabricate tool execution or verification results.
5. Do not report success because files were merely generated.
6. Do not bypass tests, weaken assertions, or hardcode outputs to obtain a passing result.
7. Record file writes, command execution, errors, and verification evidence.
8. If interrupted, resume from saved progress without deleting completed files.
9. Keep all generated files available for inspection and download.
10. Never report the task as complete without actual passing verification.

## 6. Completion criteria

**SUCCESS** requires all of the following:

- All 15 required files exist.
- At least 20 meaningful tests are implemented.
- All tests pass.
- All three mandatory commands complete with exit code 0.
- No unresolved runtime errors remain.
- Application output demonstrates a functioning order workflow.
- Files and execution evidence are persisted.

If any requirement fails, report **INCOMPLETE**, identify the exact blocker, preserve the existing work, and provide the next corrective action.

## 7. Final response

Return a concise acceptance report containing:

- Overall status: PASS or FAIL.
- Number of required files created.
- Number of tests executed, passed, and failed.
- Results and exit codes for all three commands.
- Evidence of successful checkout and inventory updates.
- Location of saved project files.
- Any unresolved errors or limitations.

**Do not claim PASS without recorded, reproducible evidence.**
