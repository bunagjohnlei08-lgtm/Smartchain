-- SmartChain demand-readiness profile.
-- PostgreSQL / psql. Read-only by transaction mode; contains no credentials.
-- The forecast candidate is requested quantity from non-cancelled orders.

BEGIN TRANSACTION READ ONLY;

WITH valid_orders AS (
    SELECT * FROM orders WHERE status <> 'CANCELLED'
),
valid_items AS (
    SELECT oi.*, o.order_date
    FROM order_items oi
    JOIN valid_orders o ON o.id = oi.order_id
),
bounds AS (
    SELECT
        min(order_date)::date AS min_date,
        max(order_date)::date AS max_date,
        date_trunc('week', min(order_date))::date AS min_week,
        date_trunc('week', max(order_date))::date AS max_week
    FROM valid_orders
),
calendar_weeks AS (
    SELECT generate_series(min_week, max_week, interval '1 week')::date AS week_start
    FROM bounds
),
product_lines AS (
    SELECT
        p.id AS product_id,
        count(vi.id) AS observations,
        count(DISTINCT vi.order_date::date) AS active_days,
        count(DISTINCT date_trunc('week', vi.order_date)) AS active_weeks,
        coalesce(sum(vi.quantity), 0) AS total_quantity,
        max(vi.quantity) AS maximum_line_quantity
    FROM products p
    LEFT JOIN valid_items vi ON vi.product_id = p.id
    GROUP BY p.id
),
product_weekly AS (
    SELECT
        product_id,
        date_trunc('week', order_date)::date AS week_start,
        sum(quantity) AS quantity
    FROM valid_items
    WHERE product_id IS NOT NULL
    GROUP BY product_id, date_trunc('week', order_date)::date
),
weekly_grid AS (
    SELECT
        p.id AS product_id,
        w.week_start,
        coalesce(pw.quantity, 0) AS quantity
    FROM products p
    CROSS JOIN calendar_weeks w
    LEFT JOIN product_weekly pw
        ON pw.product_id = p.id AND pw.week_start = w.week_start
),
weekly_stats AS (
    SELECT
        product_id,
        count(*) AS weekly_periods,
        count(*) FILTER (WHERE quantity > 0) AS demand_weeks,
        count(*) FILTER (WHERE quantity = 0) AS zero_weeks,
        round(100.0 * count(*) FILTER (WHERE quantity = 0) / nullif(count(*), 0), 2) AS zero_percentage,
        round(avg(quantity), 3) AS average_weekly,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY quantity) AS median_weekly,
        max(quantity) AS maximum_weekly
    FROM weekly_grid
    GROUP BY product_id
)
SELECT jsonb_pretty(jsonb_build_object(
    'orders', jsonb_build_object(
        'total', (SELECT count(*) FROM orders),
        'valid', (SELECT count(*) FROM valid_orders),
        'cancelled', (SELECT count(*) FROM orders WHERE status = 'CANCELLED'),
        'oldest_valid_date', (SELECT min_date FROM bounds),
        'newest_valid_date', (SELECT max_date FROM bounds),
        'coverage_days', (SELECT max_date - min_date + 1 FROM bounds),
        'coverage_weeks', (SELECT count(*) FROM calendar_weeks),
        'coverage_months', (SELECT count(DISTINCT date_trunc('month', order_date)) FROM valid_orders)
    ),
    'items', jsonb_build_object(
        'total', (SELECT count(*) FROM order_items),
        'valid', (SELECT count(*) FROM valid_items),
        'requested_quantity', (SELECT coalesce(sum(quantity), 0) FROM valid_items),
        'null_quantity', (SELECT count(*) FROM valid_items WHERE quantity IS NULL),
        'zero_quantity', (SELECT count(*) FROM valid_items WHERE quantity = 0),
        'negative_quantity', (SELECT count(*) FROM valid_items WHERE quantity < 0),
        'null_product', (SELECT count(*) FROM valid_items WHERE product_id IS NULL),
        'orphan_product', (
            SELECT count(*) FROM valid_items vi
            LEFT JOIN products p ON p.id = vi.product_id
            WHERE vi.product_id IS NOT NULL AND p.id IS NULL
        )
    ),
    'products', jsonb_build_object(
        'total', (SELECT count(*) FROM products),
        'with_demand', (SELECT count(*) FROM product_lines WHERE observations > 0),
        'without_demand', (SELECT count(*) FROM product_lines WHERE observations = 0),
        'line_observation_buckets', (
            SELECT jsonb_build_object(
                '0', count(*) FILTER (WHERE observations = 0),
                '1-3', count(*) FILTER (WHERE observations BETWEEN 1 AND 3),
                '4-7', count(*) FILTER (WHERE observations BETWEEN 4 AND 7),
                '8-12', count(*) FILTER (WHERE observations BETWEEN 8 AND 12),
                '13-25', count(*) FILTER (WHERE observations BETWEEN 13 AND 25),
                '26-51', count(*) FILTER (WHERE observations BETWEEN 26 AND 51),
                '52+', count(*) FILTER (WHERE observations >= 52)
            ) FROM product_lines
        )
    ),
    'weekly', jsonb_build_object(
        'zero_percentage_minimum', (SELECT min(zero_percentage) FROM weekly_stats),
        'zero_percentage_median', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY zero_percentage) FROM weekly_stats),
        'zero_percentage_maximum', (SELECT max(zero_percentage) FROM weekly_stats),
        'products_with_no_demand_weeks', (SELECT count(*) FROM weekly_stats WHERE demand_weeks = 0),
        'products_with_1_to_3_demand_weeks', (SELECT count(*) FROM weekly_stats WHERE demand_weeks BETWEEN 1 AND 3),
        'products_with_4_or_more_demand_weeks', (SELECT count(*) FROM weekly_stats WHERE demand_weeks >= 4)
    ),
    'unit_and_duplicate_checks', jsonb_build_object(
        'products_missing_unit', (SELECT count(*) FROM products WHERE btrim(coalesce(unit, '')) = ''),
        'items_missing_unit', (SELECT count(*) FROM valid_items WHERE btrim(coalesce(unit, '')) = ''),
        'item_product_unit_mismatches', (
            SELECT count(*) FROM valid_items vi JOIN products p ON p.id = vi.product_id
            WHERE lower(btrim(coalesce(vi.unit, ''))) <> lower(btrim(coalesce(p.unit, '')))
        ),
        'products_with_multiple_item_units', (
            SELECT count(*) FROM (
                SELECT product_id FROM valid_items WHERE product_id IS NOT NULL
                GROUP BY product_id HAVING count(DISTINCT lower(btrim(unit))) > 1
            ) multi_unit
        ),
        'exact_duplicate_groups', (
            SELECT count(*) FROM (
                SELECT order_id, product_id, product_name, quantity, unit, unit_price
                FROM order_items
                GROUP BY order_id, product_id, product_name, quantity, unit, unit_price
                HAVING count(*) > 1
            ) duplicates
        )
    )
));

ROLLBACK;
