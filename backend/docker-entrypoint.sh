#!/bin/sh
set -eu

mkdir -p \
    bootstrap/cache \
    storage/app/private \
    storage/app/public \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs

chown -R www-data:www-data storage bootstrap/cache
chmod -R ug+rwX storage bootstrap/cache

if [ "${1:-}" = "apache2-foreground" ]; then
    for mpm in mpm_event mpm_worker; do
        if [ -e "/etc/apache2/mods-enabled/${mpm}.load" ]; then
            a2dismod -f "$mpm"
        fi
    done

    a2enmod mpm_prefork
    apache2ctl -t
    apache2ctl -M 2>&1 | grep 'mpm_.*_module'
    test "$(apache2ctl -M 2>&1 | grep -c 'mpm_.*_module')" -eq 1
    apache2ctl -M 2>&1 | grep -q 'mpm_prefork_module'
fi

exec "$@"
