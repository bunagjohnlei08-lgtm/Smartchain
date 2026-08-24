<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Verify database isolation before Laravel initializes RefreshDatabase or
     * any other database-mutating test trait.
     */
    protected function setUpTraits()
    {
        $environment = $this->app->environment();
        $connection = config('database.default');
        $database = config("database.connections.{$connection}.database");

        if ($environment !== 'testing' || $connection !== 'pgsql' || $database !== 'smartchain_test_db') {
            throw new \RuntimeException(
                'Unsafe test database configuration. Tests require APP_ENV=testing, '
                .'DB_CONNECTION=pgsql, and DB_DATABASE=smartchain_test_db.'
            );
        }

        return parent::setUpTraits();
    }
}
