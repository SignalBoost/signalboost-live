<!-- saas/tests/fixtures/builder-orderflow-request.md -->
# COS Builder Advanced Stress Test — OrderFlow

Build a complete, working Node.js order management application called **OrderFlow**, from scratch, in a new isolated workspace.

This is a software engineering and verification task, not a documentation task.

## 1. Technical requirements

- JavaScript, Node.js 20+, CommonJS modules.
- No external npm dependencies.
- Use `node:test` and `node:assert/strict`.
- Use integer cents for all monetary calculations.
- Persist data to a JSON file using Node's filesystem APIs.
- Organize the system into separate modules with clear responsibilities.

## 2. Required functionality

Implement these components:

**Product catalog**
- Create products with unique SKUs, names, prices, and inventory.
- Reject duplicate SKUs, negative prices, and invalid stock quantities.
- Support retrieving and listing products.

**Shopping cart**
- Add and remove products.
- Update quantities.
- Validate quantities and stock availability.
- Calculate accurate totals using integer arithmetic.

**Order processing**
- Create orders from carts.
- Generate unique order identifiers.
- Reserve inventory without allowing overselling.
- Store order status and timestamps.
- Support cancellation with inventory restoration.

**Discounts**
- Percentage discounts with deterministic integer rounding.
- Fixed-amount discounts.
- Prevent negative order totals.
- Reject invalid discount configurations.

**Persistence**
- Save products, inventory, and orders to disk.
- Recover valid state after application restart.
- Reject corrupted data instead of silently resetting it.
- Write updates atomically where practical.

**Error handling**
- Define consistent, meaningful error codes.
- Reject malformed input.
- Prevent duplicate order processing and double inventory restoration.

## 3. Required project structure

Create at least these files:

- `package.json`
- `src/catalog.js`
- `src/cart.js`
- `src/orders.js`
- `src/discounts.js`
- `src/storage.js`
- `src/errors.js`
- `index.js`
- `test/catalog.test.js`
- `test/cart.test.js`
- `test/orders.test.js`
- `test/discounts.test.js`
- `test/storage.test.js`
- `test/integration.test.js`
- `README.md`

## 4. Testing requirements

Write at least **30 independent automated tests** covering successful operations, invalid inputs, inventory limits, discount calculations, order cancellation, persistence, restart recovery, and full purchase workflows.

Include at least these adversarial scenarios:

1. Two orders competing for the last available unit must never both succeed.
2. Cancelling the same order twice must not restore inventory twice.
3. A corrupted persistence file must produce a controlled error.
4. Applying a discount greater than the order value must never create a negative total.
5. A rejected order must not reduce inventory.
6. State must survive restarting the application.
7. Two sequential purchases cannot oversell inventory.
8. A failed persistence write must not be reported as a successful committed order.

Use fresh temporary directories for disk tests and clean them afterward.

## 5. Verification

Execute these commands in the Builder workspace:

`node --test test/*.test.js`

`node index.js`

The CLI demonstration must create products, place an order, apply a discount, persist it, reload the state, and display a correct order summary.

If a test fails, identify the defect, modify the relevant source or test as justified, and rerun verification.

Do not invent command output. Do not claim success from code inspection alone.

## 6. Completion criteria

The task is complete only when:

- All required implementation files exist.
- The application actually runs.
- At least 30 tests execute successfully.
- Inventory never becomes negative through supported workflows.
- Persistence survives restart.
- The CLI demonstration executes successfully.
- All claims cite actual recorded commands and execution results.

## 7. Final report

Report:

- Files created and modified.
- Total automated tests passed and failed.
- Exact commands executed and exit codes.
- Any unresolved limitations.
- Whether all completion criteria were satisfied.

If a requirement remains incomplete, clearly mark the task incomplete. Do not fabricate success, omit failures, or substitute prose for implementation.

Do not modify the iTMounts platform repository. This is an isolated Builder workspace evaluation.