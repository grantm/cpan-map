#!perl -T

use strict;
use warnings;

use Test::More;

use CPAN::Map::Builder;

ok(1, "Successfully loaded CPAN::Map::Builder via 'use'");

test_parse_line(
    'conventional line',
    'AAC::Pvoice                        0.91  J/JO/JOUKE/AAC-Pvoice-0.91.tar.gz',
    prefix      => 'aac',
    distro_name => 'AAC::Pvoice',
    module      => 'AAC::Pvoice',
    maintainer  => 'JOUKE',
);

test_parse_line(
    'same again with fewer spaces',
    'AAC::Pvoice 0.91 J/JO/JOUKE/AAC-Pvoice-0.91.tar.gz',
    prefix      => 'aac',
    distro_name => 'AAC::Pvoice',
    module      => 'AAC::Pvoice',
    maintainer  => 'JOUKE',
);

test_parse_line(
    'version number is "undef"',
    'DBIx::MoCo::DataBase              undef  J/JK/JKONDO/DBIx-MoCo-0.18.tar.gz',
    prefix      => 'dbix',
    distro_name => 'DBIx::MoCo',
    module      => 'DBIx::MoCo::DataBase',
    maintainer  => 'JKONDO',
);

test_parse_line(
    'archive filename version number includes "rc"',
    'DBR::Query::Record                undef  I/IM/IMPIOUS/DBR-1.0.7rc7.tar.gz',
    prefix      => 'dbr',
    distro_name => 'DBR',
    module      => 'DBR::Query::Record',
    maintainer  => 'IMPIOUS',
);

test_parse_line(
    'no namespace delimiter',
    'abbreviation                       0.02  M/MI/MIYAGAWA/abbreviation-0.02.tar.gz',
    prefix      => 'abbreviation',
    distro_name => 'abbreviation',
    module      => 'abbreviation',
    maintainer  => 'MIYAGAWA',
);

test_parse_line(
    'skip bare module (compressed)',
    'Apache::AuthenIMAP                  0.1  M/MI/MICB/AuthenIMAP.pm.gz',
);

test_parse_line(
    'skip bare module in subdirectory',
    'LastLog::Entry                    undef  T/TO/TOMC/scripts/whenon.dir/LastLog/Entry.pm.gz',
);

test_parse_line(
    'parse with .pm in archive filename',
    'CGI                                3.59  M/MA/MARKSTOS/CGI.pm-3.59.tar.gz',
    prefix      => 'cgi',
    distro_name => 'CGI',
    module      => 'CGI',
    maintainer  => 'MARKSTOS',
);

test_parse_line(
    'archive in subdirectory',
    'BSD::Jail                          0.01  T/TB/TBONECA/BSD/Jail/BSD-Jail-0.01.tar.gz',
    prefix      => 'bsd',
    distro_name => 'BSD::Jail',
    module      => 'BSD::Jail',
    maintainer  => 'TBONECA',
);

test_parse_line(
    'v0.* correctly parsed as version rather than distro name',
    'Acme::Base64                     v0.0.2  H/HA/HAGGAI/Acme-Base64-v0.0.2.tar.gz',
    prefix      => 'acme',
    distro_name => 'Acme::Base64',
    module      => 'Acme::Base64',
    maintainer  => 'HAGGAI',
);

test_parse_line(
    'archive without version number',
    'Clip                                  1  C/CE/CECALA/CECALA.tar.gz',
    prefix      => 'cecala',
    distro_name => 'CECALA',
    module      => 'Clip',
    maintainer  => 'CECALA',
);


# These ones are really TODO tests

test_parse_line(
    'all-numeric name-part incorrectly parsed as version [TODO: fix]',
    'Lingua::31337                      0.02  C/CW/CWEST/Lingua-31337-0.02.tar.gz',
    prefix      => 'lingua',
    distro_name => 'Lingua',         # Should be 'Lingua::31337'
    module      => 'Lingua::31337',
    maintainer  => 'CWEST',
);

test_parse_line(
    'underscore delimiter before version number parsed as distro name [TODO: fix]',
    'Finance::BeanCounter              undef  E/ED/EDD/beancounter_0.8.10.tar.gz',
    prefix      => 'beancounter_0',
    distro_name => 'beancounter_0',         # Should be 'beancounter'
    module      => 'Finance::BeanCounter',
    maintainer  => 'EDD',
);

done_testing();

exit;


sub test_parse_line {
    my($desc, $line, %expected) = @_;

    my($package, $filename, $line_num) = caller;
    ok(1, "[line: $line_num] $desc");

    my @parts = CPAN::Map::Builder::_parse_module_line($line);

    if(!%expected) {
        if(@parts) {
            ok(0, " - parse unexpectedly succeeded (got: @parts)");
        }
        else {
            ok(1, " - line failed to parse (as expected)");
        }
        return;
    }

    is($parts[0], $expected{prefix},      " * namespace prefix looks good ($parts[0])");
    is($parts[1], $expected{distro_name}, " * distro name looks good ($parts[1])");
    is($parts[2], $expected{maintainer},  " * maintainer ID looks good ($parts[2])");
    is($parts[3], $expected{module},      " * module name looks good ($parts[3])");
}

