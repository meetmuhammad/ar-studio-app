| Endpoint | Module | Auth enforced by code | unauth | staff | admin | no-role row | invalid input | missing record | persistence / invariants | Status | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `GET /.well-known/oauth-protected-resource/api/mcp` | MCP | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | – | PASS | public discovery document; 404 unless LEDGER_MCP_ENABLED=true |
| `GET /api/mcp` | MCP | OAuth bearer (ledger MCP) | PASS | – | – | – | – | – | – | PASS |  |
| `POST /api/mcp` | MCP | OAuth bearer (ledger MCP) | PASS | PASS | PASS | – | – | – | – | PASS |  |
| `DELETE /api/mcp` | MCP | OAuth bearer (ledger MCP) | PASS | – | – | – | – | – | – | PASS |  |
| `GET /api/customers` | Customers | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | – | PASS | 2 finding(s) |
| `POST /api/customers` | Customers | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | PASS | PASS | 2 finding(s) |
| `GET /api/customers/[id]` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | – | PASS | 2 finding(s) |
| `PATCH /api/customers/[id]` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | PASS | PASS | 2 finding(s) |
| `DELETE /api/customers/[id]` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | – | PASS | PASS | 1 finding(s) |
| `GET /api/customers/[id]/measurements` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |
| `GET /api/dashboard-stats` | Dashboard | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | – | – | – | PASS | 1 finding(s) |
| `GET /api/measurements` | Measurements | NONE (open) | FAIL | N/A (open) | PASS | N/A (open) | FAIL | – | – | FAIL | 2 finding(s) |
| `POST /api/measurements` | Measurements | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | PASS | PASS | 1 finding(s) |
| `GET /api/measurements/[id]` | Measurements | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS |  |
| `PUT /api/measurements/[id]` | Measurements | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |
| `DELETE /api/measurements/[id]` | Measurements | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |
| `GET /api/orders` | Orders | admin or staff | PASS | PASS | PASS | PASS | – | – | – | PASS | 1 finding(s) |
| `POST /api/orders` | Orders | admin or staff | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | 2 finding(s) |
| `GET /api/orders/all` | Orders | admin or staff | PASS | PASS | PASS | PASS | – | – | – | PASS |  |
| `GET /api/orders/[id]` | Orders | admin or staff | PASS | PASS | – | PASS | – | PASS | PASS | PASS |  |
| `PATCH /api/orders/[id]` | Orders | admin or staff | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | 3 finding(s) |
| `DELETE /api/orders/[id]` | Orders | admin or staff | PASS | PASS | – | PASS | – | – | PASS | PASS | 2 finding(s) |
| `GET /api/payments` | Payments | admin or staff | PASS | PASS | PASS | PASS | – | – | – | PASS |  |
| `POST /api/payments` | Payments | admin or staff | PASS | PASS | – | PASS | PASS | – | PASS | PASS | 2 finding(s) |
| `PATCH /api/payments/[id]` | Payments | admin or staff | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | 1 finding(s) |
| `DELETE /api/payments/[id]` | Payments | admin or staff | PASS | PASS | – | PASS | – | – | PASS | PASS | 1 finding(s) |
| `GET /api/general-ledger` | Ledger | admin only | PASS | PASS | PASS | PASS | – | – | PASS | PASS |  |
| `POST /api/general-ledger` | Ledger | admin only | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | 3 finding(s) |
| `GET /api/general-ledger/[id]` | Ledger | admin only | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | 1 finding(s) |
| `PUT /api/general-ledger/[id]` | Ledger | admin only | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS |  |
| `DELETE /api/general-ledger/[id]` | Ledger | admin only | PASS | PASS | – | PASS | – | PASS | PASS | PASS | 1 finding(s) |
| `GET /api/general-ledger/stats` | Ledger | admin only | PASS | PASS | PASS | PASS | – | – | PASS | PASS |  |
| `POST /api/general-ledger/sync-payments` | Ledger | admin only | PASS | PASS | – | PASS | – | – | – | PASS (rejections) / BLOCKED (admin path) | destructive: deletes and rebuilds all order_payment rows; admin success path deliberately NOT run |
| `GET /api/vendor-ledger` | Vendor ledger | admin only | PASS | PASS | – | PASS | PASS | PASS | – | PASS |  |
| `POST /api/vendor-ledger` | Vendor ledger | admin only | PASS | PASS | PASS | PASS | PASS | – | – | PASS |  |
| `GET /api/vendors` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS | 1 finding(s) |
| `POST /api/vendors` | Vendors | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | – | PASS | 1 finding(s) |
| `GET /api/vendors/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | PASS | PASS | 1 finding(s) |
| `PUT /api/vendors/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS |  |
| `DELETE /api/vendors/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS | 1 finding(s) |
| `GET /api/vendor-categories` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS | 1 finding(s) |
| `POST /api/vendor-categories` | Vendors | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | – | PASS |  |
| `PATCH /api/vendor-categories/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | PASS | PASS |  |
| `DELETE /api/vendor-categories/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | – | PASS | PASS |  |
| `GET /api/vendor-tags` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS |  |
| `POST /api/vendor-tags` | Vendors | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | – | – | – | PASS |  |
| `DELETE /api/vendor-tags/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |
