FROM php:8.5.10-apache-bookworm AS php-extensions

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        libcurl4-openssl-dev \
        libfreetype6-dev \
        libjpeg62-turbo-dev \
        libonig-dev \
        libpng-dev \
        libpq-dev \
        libwebp-dev \
        libxml2-dev \
        libzip-dev; \
    docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp; \
    docker-php-ext-install -j2 curl dom gd mbstring opcache pdo_pgsql zip

FROM php:8.5.10-apache-bookworm

ENV APP_ENV=production \
    APACHE_DOCUMENT_ROOT=/app/public \
    COMPOSER_ALLOW_SUPERUSER=1 \
    PORT=8080

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        libcurl4 \
        libfreetype6 \
        libjpeg62-turbo \
        libonig5 \
        libpng16-16 \
        libpq5 \
        libwebp7 \
        libxml2 \
        libzip4; \
    rm -rf /var/lib/apt/lists/*; \
    mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"; \
    a2enmod rewrite; \
    sed -ri -e "s!/var/www/html!${APACHE_DOCUMENT_ROOT}!g" /etc/apache2/sites-available/*.conf; \
    printf '%s\n' \
        '<Directory /app/public>' \
        '    Options FollowSymLinks' \
        '    AllowOverride All' \
        '    Require all granted' \
        '</Directory>' \
        > /etc/apache2/conf-available/smartchain.conf; \
    a2enconf smartchain; \
    sed -ri -e 's!Listen 80!Listen ${PORT}!g' /etc/apache2/ports.conf; \
    sed -ri -e 's!<VirtualHost \*:80>!<VirtualHost *:${PORT}>!g' /etc/apache2/sites-available/*.conf; \
    grep -F 'DocumentRoot /app/public' /etc/apache2/sites-available/*.conf; \
    grep -F '<Directory /app/public>' /etc/apache2/conf-enabled/smartchain.conf; \
    grep -F 'AllowOverride All' /etc/apache2/conf-enabled/smartchain.conf; \
    grep -F 'Require all granted' /etc/apache2/conf-enabled/smartchain.conf; \
    apache2ctl -t

COPY --from=php-extensions /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=php-extensions /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/
COPY --from=composer:2.8 /usr/bin/composer /usr/local/bin/composer

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-interaction \
    --no-progress \
    --no-scripts \
    --optimize-autoloader \
    --prefer-dist

COPY . .
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/smartchain-entrypoint

RUN set -eux; \
    composer dump-autoload --no-dev --classmap-authoritative --no-interaction; \
    rm -rf public/storage; \
    ln -s ../storage/app/public public/storage; \
    mkdir -p \
        bootstrap/cache \
        storage/app/private \
        storage/app/public \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs; \
    chown -R www-data:www-data storage bootstrap/cache; \
    chmod -R ug+rwX storage bootstrap/cache

EXPOSE 8080

ENTRYPOINT ["smartchain-entrypoint"]
CMD ["apache2-foreground"]
