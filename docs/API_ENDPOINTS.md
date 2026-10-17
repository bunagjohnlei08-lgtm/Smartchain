# SmartChain API Endpoint Reference

Generated from the current on-disk `backend/routes/api.php` and its API controllers. Base paths include Laravel's standard `/api` prefix.

## Quick navigation

- [Public Access, Authentication & Supplier Portal (16)](#public-access-authentication-supplier-portal)
- [Session, Profile & Notifications (12)](#session-profile-notifications)
- [Admin Dashboard, Reports & Audit Logs (17)](#admin-dashboard-reports-audit-logs)
- [Users & Organization Reference Data (14)](#users-organization-reference-data)
- [Product Catalog & BOMs (14)](#product-catalog-boms)
- [Warehouses & Inventory (21)](#warehouses-inventory)
- [Receiving & Stock-In (16)](#receiving-stockin)
- [Quality Assurance & Inventory Audits (13)](#quality-assurance-inventory-audits)
- [Orders (13)](#orders)
- [Procurement & Purchase Orders (15)](#procurement-purchase-orders)
- [Suppliers & Supplier Applications (24)](#suppliers-supplier-applications)
- [Production (11)](#production)
- [Stock-Out, Shipments & Logistics (11)](#stockout-shipments-logistics)

## Conventions

- **Authenticated** routes use `auth:sanctum`, `active`, and `idle` middleware.
- **Public (rate-limited)** routes do not require an access token but are protected by throttling.
- **Supplier portal token** routes require the dedicated supplier-portal session middleware.
- Payload fields come from controller validation rules. Fields containing `.*` describe array items.
- Response summaries show status codes and top-level JSON keys visible in the controller. Nested fields may follow Eloquent serialization.
- Standard Laravel failures may include HTTP 401 (unauthenticated), 403 (unauthorized), and 422 (validation).
- File and download responses are identified explicitly.

## Endpoint Inventory

The endpoints are grouped by business domain. The number beside each heading is the endpoint count for that section.

<a id="public-access-authentication-supplier-portal"></a>

### Public Access, Authentication & Supplier Portal

**16 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| POST | `/api/login` | Public (rate-limited) | `AuthController::login` | `email` (required, email); `password` (required, string) | 429: { `message`, `retry_after` }; 200: { `message`, `errors`, `email` }; 403: { `message` }; 503: { `message` }; 200: { `message`, `requires_otp`, `challenge_id`, `expires_in`, `resend_available_in` } | Authenticate login. |
| POST | `/api/supplier-applications` | Public (rate-limited) | `SupplierApplicationController::store` | `company_name` (required); `owner_name` (required); `address` (required); `contact_person` (required); `email` (required); `phone` (required); `business_type` (required); `supply_category` (required); `products_services` (nullable); `business_certificate` (required); `business_certificate.*` (validated array item); `business_permit` (required); `business_permit.*` (validated array item); `product_service_image` (required); `product_service_image.*` (validated array item) | 422: { `message` }; 200: { `message`, `data`, `application_number`, `status`, `submitted_at` } | Create supplier-applications. |
| GET | `/api/public/company-location` | Public (rate-limited) | `PublicCompanyLocationController::show` | None. | 200: { `data`, `name`, `address`, `latitude`, `longitude`, `map_embed_url`, `directions_url` } | Retrieve public company-location. |
| POST | `/api/supplier-portal/access` | Public (rate-limited) | `SupplierPortalController::exchange` | `access_token` (required) | 200: { `message` }; 200: { `session_token` } | Exchange supplier-portal access in the supplier portal integration flow. |
| GET | `/api/supplier-portal/application` | Supplier portal token | `SupplierPortalController::show` | None. | 200: { `data` } | Retrieve supplier-portal application in the supplier portal integration flow. |
| POST | `/api/supplier-portal/meeting-slots/{meetingSlot}/select` | Supplier portal token | `SupplierPortalController::selectMeeting` | No request body is read or validated by this handler. | 409: { `message` }; 200: { `message`, `data` } | Select meeting supplier-portal meeting-slots record select in the supplier portal integration flow. |
| POST | `/api/supplier-portal/request-another-schedule` | Supplier portal token | `SupplierPortalController::requestAnotherSchedule` | `message` (required) | 200: { `message`, `data` } | Request another schedule supplier-portal request-another-schedule in the supplier portal integration flow. |
| POST | `/api/supplier-portal/resubmit` | Supplier portal token | `SupplierPortalController::resubmit` | `owner_name` (nullable); `address` (nullable); `contact_person` (nullable); `phone` (nullable); `business_type` (nullable); `supply_category` (nullable); `products_services` (nullable); `business_certificate` (nullable); `business_certificate.*` (file); `business_permit` (nullable); `business_permit.*` (file); `product_service_image` (nullable); `product_service_image.*` (file) | 200: { `message`, `data` } | Resubmit supplier-portal resubmit in the supplier portal integration flow. |
| POST | `/api/login/verify-otp` | Public (rate-limited) | `AuthController::verifyOtp` | `challenge_id` (required); `otp` (required) | 422: { `message`, `reason` }; 200: { `message`, `token`, `user`, `is_first_login` } | Verify otp login verify-otp. |
| POST | `/api/login/resend-otp` | Public (rate-limited) | `AuthController::resendOtp` | `challenge_id` (required) | 422: { `message`, `reason` }; 429: { `message`, `reason` }; 429: { `message`, `reason`, `retry_after` }; 503: { `message`, `reason` }; 200: { `message`, `challenge_id`, `expires_in`, `resend_available_in` } | Resend otp login resend-otp. |
| POST | `/api/forgot-password` | Public (rate-limited) | `PasswordResetController::requestCode` | `email` (required) | 200: { `message`, `flow_id`, `expires_in`, `resend_available_in` } | Request code forgot-password. |
| POST | `/api/forgot-password/resend` | Public (rate-limited) | `PasswordResetController::resend` | `flow_id` (required) | 429: { `message`, `reason`, `retry_after` }; 200: { `message`, `expires_in`, `resend_available_in` } | Resend forgot-password resend. |
| POST | `/api/forgot-password/verify` | Public (rate-limited) | `PasswordResetController::verify` | `flow_id` (required); `otp` (required) | 200: { `message`, `reset_token`, `expires_in` } | Verify forgot-password verify. |
| POST | `/api/forgot-password/reset` | Public (rate-limited) | `PasswordResetController::reset` | `reset_token` (required); `password` (project password policy) | 200: { `message` } | Reset forgot-password reset. |
| POST | `/api/invitations/validate` | Public (rate-limited) | `InvitationController::check` | `token` (required) | 200: { `valid`, `name`, `email`, `expires_at` } | Check invitations validate. |
| POST | `/api/invitations/accept` | Public (rate-limited) | `InvitationController::accept` | `token` (required); `password` (project password policy) | 200: { `message` } | Accept invitations accept. |

<a id="session-profile-notifications"></a>

### Session, Profile & Notifications

**12 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/session/status` | Authenticated | `SessionController::status` | None. | 200: JSON serialized session status data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Status session status. |
| POST | `/api/session/activity` | Authenticated | `SessionController::activity` | No request body is read or validated by this handler. | 200/201: JSON serialized session activity data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Activity session activity. |
| POST | `/api/logout` | Authenticated | `AuthController::logout` | No request body is read or validated by this handler. | 200: { `message` } | End the current session logout. |
| GET | `/api/profile` | Authenticated | `ProfileController::show` | Multipart form-data; file field(s) are processed by the handler. | 200: JSON serialized profile data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve profile. |
| PUT | `/api/profile` | Authenticated | `ProfileController::update` | `name` (required); `email` (required) | 200: JSON serialized profile data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update profile. |
| POST | `/api/profile/photo` | Authenticated | `ProfileController::updatePhoto` | `photo` (required); `user_id` (prohibited) | 200/201: JSON serialized profile photo data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update photo profile photo. |
| DELETE | `/api/profile/photo` | Authenticated | `ProfileController::removePhoto` | Multipart form-data; file field(s) are processed by the handler. | 200: JSON serialized profile photo data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Remove photo profile photo. |
| PUT | `/api/profile/password` | Authenticated | `ProfileController::updatePassword` | `current_password` (required); `password` (project password policy) | 200: { `message` } | Update password profile password. |
| GET | `/api/notifications` | Authenticated | `NotificationController::index` | `filter` (nullable); `per_page` (nullable) | 200: { `data`, `total`, `unread_count`, `meta`, `current_page`, `last_page`, `per_page` } | List notifications. |
| GET | `/api/notifications/recent` | Authenticated | `NotificationController::recent` | None. | 200: { `data`, `unread_count` } | Recent notifications recent. |
| PUT | `/api/notifications/read-all` | Authenticated | `NotificationController::readAll` | No request body is read or validated by this handler. | 200: { `unread_count` } | Read all notifications read-all. |
| PUT | `/api/notifications/{id}/read` | Authenticated | `NotificationController::read` | No request body is read or validated by this handler. | 200: { `id`, `read_at`, `unread_count` } | Read notifications record read. |

<a id="admin-dashboard-reports-audit-logs"></a>

### Admin Dashboard, Reports & Audit Logs

**17 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/admin/dashboard` | Authenticated | `DashboardController::index` | None. | 200: { `data`, `metrics`, `warehouse_utilization`, `warehouse_capacity`, `warehouse_name`, `open_purchase_orders` } | List admin dashboard. |
| GET | `/api/admin/reports/dashboard` | Authenticated | `AdminReportController::dashboard` | None. | 200: { `metrics`, `total_reports_available`, `total_report_definitions`, `exports_today`, `generated_today`, `pending_reports`, `last_generated_at` } | Return dashboard metrics for admin reports dashboard. |
| GET | `/api/admin/reports/definitions` | Authenticated | `AdminReportController::definitions` | None. | 200: { `data` } | Definitions admin reports definitions. |
| GET | `/api/admin/reports/options` | Authenticated | `AdminReportController::options` | None. | 200: { `categories`, `id`, `label` } | Return selection options for admin reports options. |
| GET | `/api/admin/reports/preview` | Authenticated | `AdminReportController::preview` | None. | 200: { `report`, `key`, `name`, `category`, `category_label`, `formats`, `columns` } | Preview admin reports preview. |
| POST | `/api/admin/reports/export` | Authenticated | `AdminReportController::export` | No request body is read or validated by this handler. | File/binary response (not JSON); errors are returned as JSON. | Export admin reports export. |
| GET | `/api/admin/reports/history` | Authenticated | `AdminReportController::history` | `action` (nullable); `status` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | History admin reports history. |
| GET | `/api/admin/reports/schedules` | Authenticated | `AdminReportController::schedules` | None. | 200: { `data` } | Schedules admin reports schedules. |
| POST | `/api/admin/reports/schedules` | Authenticated | `AdminReportController::storeSchedule` | No request body is read or validated by this handler. | 200: { `message`, `data` } | Store schedule admin reports schedules. |
| PATCH | `/api/admin/reports/schedules/{reportSchedule}` | Authenticated | `AdminReportController::updateSchedule` | `status` (required) | 200: { `data` } | Update schedule admin reports schedules record. |
| DELETE | `/api/admin/reports/schedules/{reportSchedule}` | Authenticated | `AdminReportController::destroySchedule` | None. | 200: { `message` } | Destroy schedule admin reports schedules record. |
| GET | `/api/plant-manager/dashboard` | Authenticated | `PlantManagerDashboardController::index` | None. | 200: { `data`, `metrics`, `total_products`, `total_categories`, `stock_value`, `low_stock_items`, `out_of_stock`, `todays_stock_in`, `todays_stock_out` } | List plant-manager dashboard. |
| GET | `/api/plant-manager/reports/dashboard` | Authenticated | `ReportsController::dashboard` | None. | 200: { `filters`, `from`, `to`, `custom`, `timezone` } | Return dashboard metrics for plant-manager reports dashboard. |
| GET | `/api/plant-manager/reports/generate` | Authenticated | `ReportsController::generate` | `type` (required); `format` (required) | 200: { `report`, `type` } | Generate plant-manager reports generate. |
| GET | `/api/plant-manager/reports/recent` | Authenticated | `ReportsController::recent` | None. | 200: { `data`, `id`, `name`, `type`, `category`, `generated_at`, `generated_by`, `format` } | Recent plant-manager reports recent. |
| GET | `/api/admin/audit-logs` | Authenticated | `AuditLogController::index` | `search` (nullable); `action` (nullable); `module` (nullable); `status` (nullable); `date_from` (nullable); `date_to` (nullable); `page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List admin audit-logs. |
| GET | `/api/admin/audit-logs/options` | Authenticated | `AuditLogController::options` | None. | 200: { `actions`, `modules` } | Return selection options for admin audit-logs options. |

<a id="users-organization-reference-data"></a>

### Users & Organization Reference Data

**14 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/users/statistics` | Authenticated | `UserController::statistics` | None. | 200: { `total`, `active`, `pending`, `suspended` } | Statistics users statistics. |
| GET | `/api/users` | Authenticated | `UserController::index` | None. | JSON collection/paginated result with records and pagination metadata. | List users. |
| GET | `/api/users/{id}` | Authenticated | `UserController::show` | None. | 200: JSON serialized users data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve users record. |
| POST | `/api/users` | Authenticated | `UserController::store` | `name` (required, string, max:255); `email` (required, email, max:255, unique:users); `role_id` ($this->roleAssignmentRules($request); `department_id` (nullable, exists:departments); `branch_id` (nullable, exists:branches); `warehouse_id` (nullable, exists:warehouses); `employee_id` (prohibited); `password` (prohibited); `password_confirmation` (prohibited); `status` (prohibited); `email_verified_at` (prohibited); `invited_at` (prohibited); `activated_at` (prohibited) | 200/201: JSON serialized users data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Create users. |
| PUT | `/api/users/{id}` | Authenticated | `UserController::update` | `name` (sometimes, string, max:255); `email` (sometimes); `password` (PasswordPolicy::rules(confirmed:false); `employee_id` (sometimes); `role_id` ($this->roleAssignmentRules($request)); `department_id` (sometimes); `branch_id` (sometimes); `warehouse_id` (sometimes); `status` (sometimes) | 200: JSON serialized users data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update users record. |
| DELETE | `/api/users/{id}` | Authenticated | `UserController::destroy` | None. | 422: { `message` }; 409: { `message` }; 200: { `message` } | Delete users record. |
| POST | `/api/users/{id}/approve` | Authenticated | `UserController::approve` | No request body is read or validated by this handler. | 422: { `message` } | Approve users record approve. |
| POST | `/api/users/{id}/suspend` | Authenticated | `UserController::suspend` | No request body is read or validated by this handler. | 200/201: JSON serialized users suspend data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Suspend users record suspend. |
| POST | `/api/users/{id}/activate` | Authenticated | `UserController::activate` | No request body is read or validated by this handler. | 422: { `message` } | Activate users record activate. |
| POST | `/api/users/{id}/resend-invitation` | Authenticated | `UserController::resendInvitation` | No request body is read or validated by this handler. | 422: { `message` }; 429: { `message`, `retry_after` }; 200: { `sent`, `expires_at`, `message` } | Resend invitation users record resend-invitation. |
| GET | `/api/roles` | Authenticated | `UserController::roles` | None. | 200: JSON serialized roles data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Roles roles. |
| GET | `/api/departments` | Authenticated | `UserController::departments` | None. | 200: JSON serialized departments data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Departments departments. |
| GET | `/api/branches` | Authenticated | `UserController::branches` | None. | 200: JSON serialized branches data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Branches branches. |
| GET | `/api/warehouses` | Authenticated | `UserController::warehouses` | None. | 200: JSON serialized warehouses data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Warehouses warehouses. |

<a id="product-catalog-boms"></a>

### Product Catalog & BOMs

**14 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| POST | `/api/admin/products/bulk-supplier` | Authenticated | `ProductController::bulkAssignSupplier` | `product_ids` (required); `product_ids.*` (required); `supplier_id` (required); `make_primary` (sometimes) | 200: { `message`, `data` } | Bulk assign supplier admin products bulk-supplier. |
| POST | `/api/admin/products/{product}/warehouse` | Authenticated | `ProductController::assignWarehouse` | `warehouse_id` (required) | 200/201: JSON serialized admin products warehouse data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Assign warehouse admin products record warehouse. |
| GET | `/api/admin/products` | Authenticated | `ProductController::index` | `search` (nullable); `category` (nullable); `brand` (nullable); `item_classification` (nullable); `warehouse_id` (nullable); `status` (nullable); `sort_by` (nullable); `sort_direction` (nullable); `page` (nullable); `per_page` (nullable) | 200: { `data`, `current_page`, `per_page`, `total`, `last_page`, `meta` } | List admin products. |
| POST | `/api/admin/products` | Authenticated | `ProductController::store` | No request body is read or validated by this handler. | JSON resource/data object produced by the controller. | Create admin products. |
| GET | `/api/admin/products/{product}` | Authenticated | `ProductController::show` | None. | 200: JSON serialized admin products data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve admin products record. |
| PUT/PATCH | `/api/admin/products/{product}` | Authenticated | `ProductController::update` | No request body is read or validated by this handler. | 200: JSON serialized admin products data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update admin products record. |
| DELETE | `/api/admin/products/{product}` | Authenticated | `ProductController::destroy` | None. | 409: { `message`, `references` }; 200: { `message`, `references` }; 200: { `message` } | Delete admin products record. |
| GET | `/api/admin/catalog-mapping/offerings` | Authenticated | `AdminCatalogMappingController::index` | None. | 200: { `data`, `id`, `name`, `category`, `description`, `application_number`, `supplier`, `code`, `status`, `is_active` } | List admin catalog-mapping offerings. |
| POST | `/api/admin/catalog-mapping/offerings/{offering}/link` | Authenticated | `AdminCatalogMappingController::link` | `product_id` (required); `make_primary` (sometimes) | 200: { `message`, `data`, `offering_id`, `product` } | Link admin catalog-mapping offerings record link. |
| POST | `/api/admin/catalog-mapping/offerings/{offering}/create-product` | Authenticated | `AdminCatalogMappingController::createProduct` | `name` (required); `category` (nullable); `brand` (nullable); `cost_price` (nullable); `selling_price` (nullable); `warehouse_id` (required); `unit` (required); `item_classification` (sometimes) | 200: { `message`, `data`, `offering_id`, `product` } | Create product admin catalog-mapping offerings record create-product. |
| GET | `/api/admin/boms` | Authenticated | `BomController::index` | None. | 200: { `data` } | List admin boms. |
| POST | `/api/admin/boms` | Authenticated | `BomController::store` | No request body is read or validated by this handler. | 200/201: JSON serialized admin boms data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Create admin boms. |
| PUT | `/api/admin/boms/{bom}` | Authenticated | `BomController::update` | No request body is read or validated by this handler. | 200: JSON serialized admin boms data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update admin boms record. |
| GET | `/api/products` | Authenticated | `ProductController::options` | None. | JSON collection/paginated result with records and pagination metadata. | Return selection options for products. |

<a id="warehouses-inventory"></a>

### Warehouses & Inventory

**21 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/admin/warehouse/location` | Authenticated | `AdminWarehouseLocationController::show` | None. | 200: JSON serialized admin warehouse location data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve admin warehouse location. |
| PUT | `/api/admin/warehouse/location` | Authenticated | `AdminWarehouseLocationController::update` | `name` (required); `code` (required); `address` (Rule::requiredIf($willBePublic)); `latitude` (Rule::requiredIf($willBePublic)); `longitude` (Rule::requiredIf($willBePublic)); `capacity` (nullable); `capacity_powder` (nullable); `capacity_liquid` (nullable); `capacity_solid` (nullable); `capacity_returned` (nullable); `status` (required); `show_on_public_website` (sometimes) | 200: JSON serialized admin warehouse location data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update admin warehouse location. |
| GET | `/api/plant-manager/warehouse` | Authenticated | `PlantManagerWarehouseController::show` | None. | 404: { `message` }; 200: { `id`, `name`, `code`, `address`, `latitude`, `longitude`, `status`, `map_embed_url`, `directions_url`, `inventory`, `total_units` } | Retrieve plant-manager warehouse. |
| GET | `/api/inventory` | Authenticated | `InventoryController::index` | `item_classification` (nullable) | 200: { `data` } | List inventory. |
| GET | `/api/inventory/movements/recent` | Authenticated | `InventoryHistoryController::recent` | `limit` (nullable) | 200: { `data` } | Recent inventory movements recent. |
| GET | `/api/inventory/movements` | Authenticated | `InventoryHistoryController::index` | `search` (nullable); `type` (nullable); `warehouse_id` (nullable); `date_from` (nullable); `date_to` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List inventory movements. |
| POST | `/api/inventory` | Authenticated | `InventoryController::store` | `barcode` (required, string, unique:inventories); `product` (required, string, max:255); `category` (nullable, string, max:255); `brand` (nullable, string, max:255); `unit` (nullable, string, max:50); `cost_price` (nullable, numeric, min:0); `warehouse_id` (required, exists:warehouses); `available_stock` (required, integer, min:0); `reserved_stock` (required, integer, min:0); `backload` (required, integer, min:0); `status` (required, string, in:Available); `pending_receiving` (nullable, boolean) | JSON resource/data object produced by the controller. | Create inventory. |
| GET | `/api/inventory/{id}` | Authenticated | `InventoryController::show` | None. | 200: JSON serialized inventory data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve inventory record. |
| PUT | `/api/inventory/{id}` | Authenticated | `InventoryController::update` | `barcode` (sometimes); `product` (sometimes, string, max:255); `category` (nullable, string, max:255); `brand` (nullable, string, max:255); `unit` (nullable, string, max:50); `cost_price` (nullable, numeric, min:0); `warehouse_id` (sometimes, exists:warehouses); `available_stock` (sometimes, integer, min:0); `reserved_stock` (sometimes, integer, min:0); `backload` (sometimes, integer, min:0); `status` (sometimes); `pending_receiving` (sometimes, boolean) | JSON resource/data object produced by the controller. | Update inventory record. |
| POST | `/api/inventory/{inventory}/returned-storage` | Authenticated | `InventoryController::moveToReturned` | `quantity` (required); `source_bucket` (required); `source_type` (required); `source_reference` (required); `idempotency_key` (nullable); `notes` (nullable) | 200: { `message`, `movement` } | Move to returned inventory record returned-storage. |
| POST | `/api/inventory/{inventory}/returned-receipt` | Authenticated | `InventoryController::receiveReturned` | `quantity` (required); `source_type` (required); `source_reference` (required); `idempotency_key` (required); `notes` (nullable) | 200: { `message`, `movement` } | Receive returned inventory record returned-receipt. |
| DELETE | `/api/inventory/{id}` | Authenticated | `InventoryController::destroy` | None. | 200: { `message` } | Delete inventory record. |
| GET | `/api/qa/inventory-audits` | Authenticated | `QaInventoryAuditController::index` | None. | 200: { `schedule`, `months` } | List qa inventory-audits. |
| GET | `/api/qa/inventory-audits/history` | Authenticated | `QaInventoryAuditController::history` | None. | 200: { `data`, `items` } | History qa inventory-audits history. |
| POST | `/api/qa/inventory-audits/{inventory}` | Authenticated | `QaInventoryAuditController::store` | `result` (required); `failed_quantity` (required_if:result); `failure_reason` (required_if:result); `remarks` (conditionally required when result is FAILED and failure_reason is Other); `evidence` (required_if:result); `evidence.*` (file) | 200: { `data` } | Create qa inventory-audits record. |
| GET | `/api/inventory-audits/evidence/{evidence}` | Authenticated | `InventoryAuditEvidenceController::show` | None. | 200: JSON serialized inventory-audits evidence data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve inventory-audits evidence record. |
| GET | `/api/admin/inventory-audits` | Authenticated | `AdminInventoryAuditController::index` | `status` (nullable) | 200: { `schedule`, `months` } | List admin inventory-audits. |
| PUT | `/api/admin/inventory-audits/schedule/months` | Authenticated | `AdminInventoryAuditController::updateSchedule` | `months` (required); `months.*` (required) | 200: { `months` } | Update schedule admin inventory-audits schedule months. |
| GET | `/api/admin/inventory-audits/{inventoryAuditItem}` | Authenticated | `AdminInventoryAuditController::show` | None. | 200: { `data` } | Retrieve admin inventory-audits record. |
| POST | `/api/admin/inventory-audits/{inventoryAuditItem}/approve` | Authenticated | `AdminInventoryAuditController::approve` | `remarks` (nullable) | 200: { `data` } | Approve admin inventory-audits record approve. |
| POST | `/api/admin/inventory-audits/{inventoryAuditItem}/return` | Authenticated | `AdminInventoryAuditController::returnForReinspection` | `remarks` (required) | 200: { `data` } | Return for reinspection admin inventory-audits record return. |

<a id="receiving-stockin"></a>

### Receiving & Stock-In

**16 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/stock-in/receivings` | Authenticated | `StockInController::index` | None. | 200: { `data` } | List stock-in receivings. |
| GET | `/api/stock-in/capacity` | Authenticated | `StockInController::capacity` | None. | 200: { `name` } | Capacity stock-in capacity. |
| GET | `/api/stock-in/history` | Authenticated | `StockInController::history` | None. | 200: { `data` } | History stock-in history. |
| GET | `/api/stock-in/recently-stocked` | Authenticated | `StockInController::recentStockedIn` | None. | 200: { `data` } | Recent stocked in stock-in recently-stocked. |
| GET | `/api/stock-in/receivings/{id}` | Authenticated | `StockInController::show` | None. | 200: JSON serialized stock-in receivings data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve stock-in receivings record. |
| POST | `/api/stock-in/receivings/{id}/stock-in` | Authenticated | `StockInController::performStockIn` | No request body is read or validated by this handler. | 404: { `message` }; 200: { `message` }; 500: { `message` } | Perform stock in stock-in receivings record stock-in. |
| GET | `/api/receivings/qa-assignees` | Authenticated | `ReceivingController::qaAssignees` | None. | 200: { `data` } | Qa assignees receivings qa-assignees. |
| GET | `/api/receivings` | Authenticated | `ReceivingController::index` | `view` (nullable); `status` (nullable); `supplier` (nullable); `search` (nullable); `date` (nullable); `page` (nullable); `per_page` (nullable) | 200: { `data`, `meta`, `current_page`, `last_page`, `per_page`, `total`, `from`, `to` } | List receivings. |
| POST | `/api/receivings` | Authenticated | `ReceivingController::store` | `purchase_order_id` (required, integer, exists:purchase_orders); `reference_no` (nullable, string, max:255); `delivery_date` (required, date); `items` (required, array, min:1); `items.*.purchase_order_item_id` (required, integer, distinct, exists:purchase_order_items); `items.*.delivered_quantity` (required, integer, min:0) | JSON resource/data object produced by the controller. | Create receivings. |
| PATCH | `/api/receivings/{receiving}/assign-qa` | Authenticated | `ReceivingController::assignQa` | `qa_user_id` (required) | 200: { `message`, `errors`, `qa_user_id` }; 422: { `message` } | Assign qa receivings record assign-qa. |
| POST | `/api/receivings/{receiving}/confirm-replacement` | Authenticated | `ReceivingController::confirmReplacementDelivery` | `delivery_date` (required, date); `reference_no` (nullable, string, max:255); `items` (required, array, min:1); `items.*.receiving_item_id` (required, integer, distinct); `items.*.delivered_quantity` (required, integer, min:0) | JSON resource/data object produced by the controller. | Confirm replacement delivery receivings record confirm-replacement. |
| GET | `/api/receivings/{receiving}/receipts/{receiptAttachment}` | Authenticated | `ReceivingController::receiptAttachment` | None. | 404: { `message` } | Receipt attachment receivings record receipts record. |
| GET | `/api/receivings/{id}` | Authenticated | `ReceivingController::show` | None. | 200: JSON serialized receivings data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve receivings record. |
| PUT | `/api/plant-manager/receivings/{receiving}/notes` | Authenticated | `PlantManagerReceivingNoteController::update` | `notes` (nullable, string, max:5000) | 403: { `message` }; 200: { `message`, `receiving_id`, `notes` } | Update plant-manager receivings record notes. |
| GET | `/api/admin/receiving-discrepancies` | Authenticated | `ReceivingDiscrepancyController::index` | None. | 200: { `data` } | List admin receiving-discrepancies. |
| PATCH | `/api/admin/receiving-discrepancies/{receivingDiscrepancy}` | Authenticated | `ReceivingDiscrepancyController::update` | `action` (required); `contact_method` (nullable); `contact_note` (nullable); `supplier_response_code` (nullable); `response_notes` (nullable); `expected_balance_delivery_date` (nullable); `resolution_notes` (nullable) | JSON resource/data object produced by the controller. | Update admin receiving-discrepancies record. |

<a id="quality-assurance-inventory-audits"></a>

### Quality Assurance & Inventory Audits

**13 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/qa/inspections` | Authenticated | `QaInspectionController::index` | None. | 200: { `data` } | List qa inspections. |
| GET | `/api/qa/dashboard` | Authenticated | `QaDashboardController::index` | None. | 403: { `message` }; 200: { `todays_inspections`, `pending_inspection`, `approved_products`, `rejected_products`, `inspection_rate`, `recent_activities`, `inspection_queue` } | List qa dashboard. |
| GET | `/api/qa/inspection-history` | Authenticated | `QaInspectionHistoryController::index` | None. | 403: { `message` }; 200: { `data` } | List qa inspection-history. |
| GET | `/api/qa/rejected-items` | Authenticated | `QaRejectedItemsController::index` | None. | 403: { `message` }; 200: { `data` } | List qa rejected-items. |
| GET | `/api/qa/rejected-items/export.xlsx` | Authenticated | `QaRejectedItemsController::export` | `ids` (sometimes) | File/binary response (not JSON); errors are returned as JSON. | Export qa rejected-items export.xlsx. |
| GET | `/api/qa/quality-reports` | Authenticated | `QaQualityReportController::index` | `days` (sometimes); `from_date` (nullable); `to_date` (nullable) | 403: { `message` }; 200: { `data`, `report_period`, `from_date`, `to_date`, `label`, `is_custom` } | List qa quality-reports. |
| GET | `/api/qa/inspections/{receivingId}` | Authenticated | `QaInspectionController::show` | None. | 404: { `message` }; 422: { `message` } | Retrieve qa inspections record. |
| GET | `/api/qa/inspections/{receivingId}/attachment` | Authenticated | `QaInspectionController::attachment` | None. | 404: { `message` } | Attachment qa inspections record attachment. |
| GET | `/api/qa/inspections/{receivingId}/attachments/{attachmentId}` | Authenticated | `QaInspectionController::attachment` | None. | 404: { `message` } | Attachment qa inspections record attachments record. |
| GET | `/api/qa/inspections/{receivingId}/receipts/{receiptAttachmentId}` | Authenticated | `QaInspectionController::receivingReceipt` | None. | 404: { `message` } | Receiving receipt qa inspections record receipts record. |
| DELETE | `/api/qa/inspections/{receivingId}/attachments/{attachmentId}` | Authenticated | `QaInspectionController::destroyAttachment` | None. | 404: { `message` }; 422: { `message` }; 200: { `message` } | Destroy attachment qa inspections record attachments record. |
| POST | `/api/qa/inspections/{receivingId}` | Authenticated | `QaInspectionController::store` | No request body is read or validated by this handler. | 200/201: JSON serialized qa inspections data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Create qa inspections record. |
| PUT | `/api/qa/inspections/{receivingId}` | Authenticated | `QaInspectionController::update` | No request body is read or validated by this handler. | 200: JSON serialized qa inspections data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update qa inspections record. |

<a id="orders"></a>

### Orders

**13 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/admin/orders` | Authenticated | `AdminOrderController::index` | `search` (nullable); `status` (nullable); `date_from` (nullable); `date_to` (nullable); `sort_by` (nullable); `sort_direction` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List admin orders . |
| GET | `/api/admin/orders/summary` | Authenticated | `AdminOrderController::summary` | None. | 200: JSON serialized admin orders summary data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Return summary data for admin orders summary. |
| GET | `/api/admin/orders/plant-managers` | Authenticated | `AdminOrderController::plantManagers` | None. | 200: JSON serialized admin orders plant-managers data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Plant managers admin orders plant-managers. |
| GET | `/api/admin/orders/products` | Authenticated | `AdminOrderController::products` | None. | 200: JSON serialized admin orders products data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Products admin orders products. |
| POST | `/api/admin/orders` | Authenticated | `AdminOrderController::store` | `order_no` (nullable); `reference_no` (nullable); `customer_name` (required); `customer_address` (required); `customer_contact` (nullable); `order_date` (required); `required_delivery_date` (required); `items` (required); `items.*.product_id` (required); `items.*.quantity` (required); `items.*.unit` (nullable); `items.*.unit_price` (required) | JSON resource/data object produced by the controller. | Create admin orders . |
| GET | `/api/admin/orders/{order}` | Authenticated | `AdminOrderController::show` | None. | 200: JSON serialized admin orders data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve admin orders record. |
| PATCH | `/api/admin/orders/{order}/assign` | Authenticated | `AdminOrderController::assign` | `assigned_to` (required) | 200: JSON serialized admin orders assign data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Assign admin orders record assign. |
| PATCH | `/api/admin/orders/{order}/status` | Authenticated | `AdminOrderController::updateStatus` | `status` (required) | 200: JSON serialized admin orders status data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Update status admin orders record status. |
| GET | `/api/plant-manager/orders` | Authenticated | `PlantManagerOrderController::index` | `search` (nullable); `status` (nullable); `warehouse_id` (nullable); `priority` (nullable); `sort_by` (nullable); `sort_direction` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List plant-manager orders . |
| GET | `/api/plant-manager/orders/summary` | Authenticated | `PlantManagerOrderController::summary` | None. | 200: { `assigned` } | Return summary data for plant-manager orders summary. |
| GET | `/api/plant-manager/orders/{order}` | Authenticated | `PlantManagerOrderController::show` | None. | 200: JSON serialized plant-manager orders data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve plant-manager orders record. |
| POST | `/api/plant-manager/orders/{order}/start-preparing` | Authenticated | `PlantManagerOrderController::startPreparing` | No request body is read or validated by this handler. | 200/201: JSON serialized plant-manager orders start-preparing data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Start preparing plant-manager orders record start-preparing. |
| POST | `/api/plant-manager/orders/{order}/ready-for-stock-out` | Authenticated | `PlantManagerOrderController::readyForStockOut` | No request body is read or validated by this handler. | 200/201: JSON serialized plant-manager orders ready-for-stock-out data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Ready for stock out plant-manager orders record ready-for-stock-out. |

<a id="procurement-purchase-orders"></a>

### Procurement & Purchase Orders

**15 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/admin/procurement/requests` | Authenticated | `AdminProcurementController::index` | `search` (nullable); `status` (nullable); `priority` (nullable); `per_page` (nullable); `remarks` (nullable) | 200: { `total_requests`, `pending_approval` } | List admin procurement requests. |
| GET | `/api/admin/procurement/summary` | Authenticated | `AdminProcurementController::summary` | None. | 200: { `total_requests`, `pending_approval` } | Return summary data for admin procurement summary. |
| GET | `/api/admin/procurement/requests/{replenishmentRequest}` | Authenticated | `AdminProcurementController::show` | None. | 200: JSON serialized admin procurement requests data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve admin procurement requests record. |
| POST | `/api/admin/procurement/requests/{replenishmentRequest}/approve` | Authenticated | `AdminProcurementController::approve` | No request body is read or validated by this handler. | 200/201: JSON serialized admin procurement requests approve data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Approve admin procurement requests record approve. |
| POST | `/api/admin/procurement/requests/{replenishmentRequest}/decline` | Authenticated | `AdminProcurementController::decline` | No request body is read or validated by this handler. | 200/201: JSON serialized admin procurement requests decline data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Decline admin procurement requests record decline. |
| GET | `/api/plant-manager/procurement/options` | Authenticated | `PlantManagerProcurementController::options` | None. | 200: { `data`, `warehouse` } | Return selection options for plant-manager procurement options. |
| GET | `/api/plant-manager/procurement/requests` | Authenticated | `PlantManagerProcurementController::index` | `scope` (nullable) | 200: { `data` } | List plant-manager procurement requests. |
| POST | `/api/plant-manager/procurement/requests` | Authenticated | `PlantManagerProcurementController::store` | `product_id` (required); `warehouse_id` (required); `requested_qty` (required); `status` (nullable) | 200/201: JSON serialized plant-manager procurement requests data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Create plant-manager procurement requests. |
| POST | `/api/plant-manager/procurement/requests/bulk` | Authenticated | `PlantManagerProcurementController::bulkStore` | `items` (required); `items.*.product_id` (required); `items.*.requested_qty` (required) | 201: { `data` } | Bulk store plant-manager procurement requests bulk. |
| POST | `/api/plant-manager/procurement/requests/{replenishmentRequest}/submit` | Authenticated | `PlantManagerProcurementController::submit` | No request body is read or validated by this handler. | JSON resource/data object produced by the controller. | Submit plant-manager procurement requests record submit. |
| GET | `/api/purchase-orders/approved` | Authenticated | `PurchaseOrderController::approved` | None. | 200: { `data` } | Approved purchase-orders approved. |
| GET | `/api/purchase-orders` | Authenticated | `PurchaseOrderController::index` | `search` (nullable); `status` (nullable); `per_page` (nullable) | 200: { `summary`, `total`, `pending` } | List purchase-orders. |
| POST | `/api/purchase-orders` | Authenticated | `PurchaseOrderController::store` | `po_number` (nullable); `supplier_id` (required, integer, active supplier ID); `supplier_name` (prohibited); `delivery_details` (required); `expected_delivery_date` (required); `replenishment_request_id` (nullable); `status` (prohibited); `signature_data` (nullable); `items` (required); `items.*.product_name` (required); `items.*.ordered_quantity` (required); `items.*.unit_price` (required) | 200/201: JSON serialized purchase-orders data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Create purchase-orders. |
| GET | `/api/purchase-orders/{purchaseOrder}/pdf` | Authenticated | `PurchaseOrderController::pdf` | None. | 200: JSON serialized purchase-orders pdf data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Download PDF for purchase-orders record pdf. |
| PATCH | `/api/purchase-orders/{purchaseOrder}/send` | Authenticated | `PurchaseOrderController::send` | No request body is read or validated by this handler. | 502: { `message` } | Send purchase-orders record send. |

<a id="suppliers-supplier-applications"></a>

### Suppliers & Supplier Applications

**24 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/admin/rejected-items` | Authenticated | `AdminSupplierRejectionController::index` | `search` (nullable, string, max:100); `status` (nullable) | 200: { `data` } | List admin rejected-items . |
| GET | `/api/admin/rejected-items/{supplierRejectionCase}` | Authenticated | `AdminSupplierRejectionController::show` | None. | 200: { `data` } | Retrieve admin rejected-items record. |
| POST | `/api/admin/rejected-items/{supplierRejectionCase}/send` | Authenticated | `AdminSupplierRejectionController::send` | No request body is read or validated by this handler. | 502: { `message` }; 200: { `message`, `data` } | Send admin rejected-items record send. |
| POST | `/api/admin/rejected-items/{supplierRejectionCase}/resolve` | Authenticated | `AdminSupplierRejectionController::resolve` | `resolution_type` (required); `resolution_notes` (nullable, required_if:resolution_type) | 200: { `message`, `data` } | Resolve admin rejected-items record resolve. |
| GET | `/api/suppliers` | Authenticated | `SupplierController::index` | `search` (nullable); `status` (nullable) | 200: { `data` } | List suppliers. |
| POST | `/api/suppliers` | Authenticated | `SupplierController::store` | `supplier_code` (prohibited/server-generated); `name` (required, string); `contact_person` (nullable, string); `email` (nullable, email); `phone` (nullable, digits); `address` (nullable, string); `status` (required, allowed operational status); `payment_terms` (nullable); `notes` (nullable); `aliases` (optional array); `aliases.*` (required string) | 201: { `data` } | Create suppliers. |
| GET | `/api/suppliers/{supplier}` | Authenticated | `SupplierController::show` | None. | 200: { `data` } | Retrieve suppliers record. |
| PUT | `/api/suppliers/{supplier}` | Authenticated | `SupplierController::update` | No request body is read or validated by this handler. | 200: { `data` } | Update suppliers record. |
| PATCH | `/api/suppliers/{supplier}/status` | Authenticated | `SupplierController::updateStatus` | `status` (required) | 200: { `data` } | Update status suppliers record status. |
| POST | `/api/suppliers/{supplier}/restore` | Authenticated | `SupplierController::restore` | No request body is read or validated by this handler. | 200: { `message`, `data` }; 200: { `data` } | Restore suppliers record restore. |
| DELETE | `/api/suppliers/{supplier}` | Authenticated | `SupplierController::destroy` | None. | 200: { `data` } | Delete suppliers record. |
| GET | `/api/admin/supplier-applications` | Authenticated | `AdminSupplierApplicationController::index` | `search` (nullable); `status` (nullable) | 200: { `data`, `meta`, `current_page`, `last_page`, `total`, `counts` } | List admin supplier-applications. |
| GET | `/api/admin/supplier-applications/{supplierApplication}` | Authenticated | `AdminSupplierApplicationController::show` | None. | 200: { `data` } | Retrieve admin supplier-applications record. |
| GET | `/api/admin/supplier-applications/{supplierApplication}/attachments/{attachment}/preview` | Authenticated | `AdminSupplierApplicationController::previewAttachment` | None. | 200: JSON serialized admin supplier-applications attachments preview data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Preview attachment admin supplier-applications record attachments record preview. |
| GET | `/api/admin/supplier-applications/{supplierApplication}/attachments/{attachment}/download` | Authenticated | `AdminSupplierApplicationController::downloadAttachment` | None. | 200: JSON serialized admin supplier-applications attachments download data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Download attachment admin supplier-applications record attachments record download. |
| POST | `/api/admin/supplier-applications/{supplierApplication}/review` | Authenticated | `AdminSupplierApplicationController::startReview` | No request body is read or validated by this handler. | 200: { `data` } | Start review admin supplier-applications record review. |
| POST | `/api/admin/supplier-applications/{supplierApplication}/qualify` | Authenticated | `AdminSupplierApplicationController::qualify` | No request body is read or validated by this handler. | 422: { `message` } | Qualify admin supplier-applications record qualify. |
| POST | `/api/admin/supplier-applications/{supplierApplication}/revision` | Authenticated | `AdminSupplierApplicationController::requestRevision` | `reason_codes` (required); `reason_codes.*` (required); `supplier_message` (required); `internal_note` (nullable) | 200: { `message`, `data` } | Request revision admin supplier-applications record revision. |
| POST | `/api/admin/supplier-applications/{supplierApplication}/approve` | Authenticated | `AdminSupplierApplicationController::approve` | No request body is read or validated by this handler. | 200: { `message` } | Approve admin supplier-applications record approve. |
| POST | `/api/admin/supplier-applications/{supplierApplication}/reject` | Authenticated | `AdminSupplierApplicationController::reject` | `reason_codes` (required); `reason_codes.*` (required); `supplier_message` (required); `internal_note` (nullable) | 200: { `message`, `data` } | Reject admin supplier-applications record reject. |
| POST | `/api/admin/supplier-applications/{supplierApplication}/meeting-slots` | Authenticated | `AdminSupplierApplicationMeetingController::store` | `slots` (required); `slots.*.date` (required); `slots.*.start_time` (required); `slots.*.end_time` (required) | 200: { `message`, `data`, `application`, `meeting_slots` } | Create admin supplier-applications record meeting-slots. |
| DELETE | `/api/admin/supplier-applications/{supplierApplication}/meeting-slots/{meetingSlot}` | Authenticated | `AdminSupplierApplicationMeetingController::destroy` | None. | 200: { `message` } | Delete admin supplier-applications record meeting-slots record. |
| POST | `/api/admin/supplier-applications/{supplierApplication}/meeting-slots/{meetingSlot}/complete` | Authenticated | `AdminSupplierApplicationMeetingController::complete` | `overall_assessment` (required); `evaluation_notes` (nullable) | 200: { `message` } | Complete admin supplier-applications record meeting-slots record complete. |
| GET | `/api/admin/supplier-performance` | Authenticated | `AdminSupplierPerformanceController::index` | `search` (nullable) | 200: { `data`, `configuration`, `minimum_eligible_deliveries`, `weights`, `recognition_tiers` } | List admin supplier-performance. |

<a id="production"></a>

### Production

**11 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/production/options` | Authenticated | `ProductionController::options` | None. | 200: { `warehouse` } | Return selection options for production options. |
| GET | `/api/production/batches` | Authenticated | `ProductionController::index` | `status` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List production batches. |
| POST | `/api/production/batches` | Authenticated | `ProductionController::store` | `product_id` (required); `warehouse_id` (required); `target_quantity` (required) | 200/201: JSON serialized production batches data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Create production batches. |
| GET | `/api/production/batches/{productionBatch}` | Authenticated | `ProductionController::show` | None. | 200: { `data` } | Retrieve production batches record. |
| GET | `/api/production/batches/{productionBatch}/pick-list` | Authenticated | `ProductionController::pickList` | `format` (sometimes) | 200: JSON serialized production batches pick-list data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Pick list production batches record pick-list. |
| POST | `/api/production/batches/{productionBatch}/issue` | Authenticated | `ProductionController::issue` | No request body is read or validated by this handler. | 200/201: JSON serialized production batches issue data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Issue production batches record issue. |
| POST | `/api/production/batches/{productionBatch}/output` | Authenticated | `ProductionController::output` | `actual_quantity` (required); `assigned_qa_user_id` (required); `production_started_at` (prohibited); `output_available_at` (prohibited); `excess_confirmation` (sometimes); `excess_confirmation.target_quantity` (required_with:excess_confirmation); `excess_confirmation.actual_quantity` (required_with:excess_confirmation); `excess_confirmation.confirmed` (required_with:excess_confirmation) | 200/201: JSON serialized production batches output data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Output production batches record output. |
| POST | `/api/production/batches/{productionBatch}/qa` | Authenticated | `ProductionController::inspect` | `passed_quantity` (required); `failed_quantity` (required); `notes` (required); `excess_confirmation` (sometimes); `excess_confirmation.target_quantity` (required_with:excess_confirmation); `excess_confirmation.actual_quantity` (required_with:excess_confirmation); `excess_confirmation.passed_quantity` (required_with:excess_confirmation); `excess_confirmation.failed_quantity` (required_with:excess_confirmation); `excess_confirmation.inspection_notes` (required_with:excess_confirmation); `excess_confirmation.quantity_verified` (required_with:excess_confirmation); `excess_confirmation.passed_inspected` (sometimes); `excess_confirmation.passed_meets_requirements` (sometimes); `excess_confirmation.failed_excluded` (sometimes) | 200/201: JSON serialized production batches qa data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Inspect production batches record qa. |
| POST | `/api/production/batches/{productionBatch}/stock-in` | Authenticated | `ProductionController::stockIn` | No request body is read or validated by this handler. | 200/201: JSON serialized production batches stock-in data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Stock in production batches record stock-in. |
| POST | `/api/production/batches/{productionBatch}/cancel` | Authenticated | `ProductionController::cancel` | `reason` (required); `material_disposition` (nullable); `confirm_unused_materials` (sometimes) | 200/201: JSON serialized production batches cancel data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Cancel production batches record cancel. |
| POST | `/api/production/batches/{productionBatch}/non-conformance` | Authenticated | `ProductionController::disposition` | `disposition` (required); `notes` (required) | 200/201: JSON serialized production batches non-conformance data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Disposition production batches record non-conformance. |

<a id="stockout-shipments-logistics"></a>

### Stock-Out, Shipments & Logistics

**11 endpoints**

| Method | Full endpoint | Access | Controller method | Expected request | Expected response | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/admin/logistics/shipments` | Authenticated | `AdminLogisticsController::index` | `search` (nullable); `status` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List admin logistics shipments. |
| GET | `/api/stock-out/summary` | Authenticated | `StockOutController::summary` | None. | 200: { `orders_ready` } | Return summary data for stock-out summary. |
| GET | `/api/stock-out/orders` | Authenticated | `StockOutController::index` | `search` (nullable); `status` (nullable); `priority` (nullable); `warehouse_id` (nullable); `date_from` (nullable); `date_to` (nullable); `sort_by` (nullable); `sort_direction` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List stock-out orders. |
| GET | `/api/stock-out/orders/{order}` | Authenticated | `StockOutController::show` | None. | 200: JSON serialized stock-out orders data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Retrieve stock-out orders record. |
| POST | `/api/stock-out/orders/{order}/start` | Authenticated | `StockOutController::start` | No request body is read or validated by this handler. | JSON resource/data object produced by the controller. | Start stock-out orders record start. |
| POST | `/api/stock-out/orders/{order}/scan` | Authenticated | `StockOutController::scan` | No request body is read or validated by this handler. | 200/201: JSON serialized stock-out orders scan data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Scan stock-out orders record scan. |
| POST | `/api/stock-out/orders/{order}/release` | Authenticated | `StockOutController::release` | `barcode` (required); `quantity` (sometimes); `idempotency_key` (nullable) | 200/201: JSON serialized stock-out orders release data (model fields and any loaded relationships); validation/auth failures use Laravel error JSON. | Release stock-out orders record release. |
| GET | `/api/plant-manager/shipments` | Authenticated | `PlantManagerShipmentController::index` | `search` (nullable); `status` (nullable); `per_page` (nullable) | JSON collection/paginated result with records and pagination metadata. | List plant-manager shipments . |
| POST | `/api/plant-manager/shipments/{order}/start-packing` | Authenticated | `PlantManagerShipmentController::startPacking` | No request body is read or validated by this handler. | JSON resource/data object produced by the controller. | Start packing plant-manager shipments record start-packing. |
| POST | `/api/plant-manager/shipments/{order}/mark-ready-for-shipment` | Authenticated | `PlantManagerShipmentController::markReadyForShipment` | `number_of_boxes` (required); `estimated_weight_kg` (required); `is_fragile` (required); `packing_notes` (nullable); `correct_product` (accepted); `correct_quantity` (accepted); `package_condition` (accepted); `items_complete` (accepted) | JSON resource/data object produced by the controller. | Mark ready for shipment plant-manager shipments record mark-ready-for-shipment. |
| POST | `/api/plant-manager/shipments/{order}/forward-to-logistics` | Authenticated | `PlantManagerShipmentController::forwardToLogistics` | No request body is read or validated by this handler. | 200: { `id`, `status` } | Forward to logistics plant-manager shipments record forward-to-logistics. |

## Coverage notes

- Documented endpoints: **197**.
- Source scope: `backend/routes/api.php` and controllers in `backend/app/Http/Controllers/Api`.
- This is implementation-derived documentation, not a formal OpenAPI contract. Dynamic Eloquent attributes, authorization policies, middleware-specific error bodies, and database-dependent nested relations may add fields at runtime.

