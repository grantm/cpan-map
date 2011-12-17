#
# Set up a cron job to refresh the map data and images every 8 hours
#

class cpan-map::cron {

    file {

        '/etc/cron.d/cpan-map':
            owner   => root,
            group   => root,
            mode    => 644,
            content => "# Managed by puppet

PERL5LIB=/home/grant/projects/cpan-map/lib

6 4,12,20    * * *   grant    /home/grant/projects/cpan-map/bin/cpan-map --refresh-data 2>&1 | mail -e -s \"CPAN Map data update\" grant@mclean.net.nz
\n";

    }
}
