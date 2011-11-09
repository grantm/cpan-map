#!perl -T

use Test::More tests => 1;

use CPAN::Map;

ok(1, "Successfully loaded CPAN::Map via 'use'");

diag( "Testing CPAN::Map $CPAN::Map::VERSION, Perl $], $^X" );
