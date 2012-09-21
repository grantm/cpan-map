# Package requires backports:
#
#   deb http://backports.debian.org/debian-backports squeeze-backports main
#

class cpan-map::nginx {

    $server_name = $ipaddress ? {
        /^192.168/   => "uat-mapofcpan.org",
        default      => "mapofcpan.org",
    }

    package {
        "nginx-full": ensure => installed;
    }

    exec { "nginx-reload":
        command     => "/etc/init.d/nginx reload",
        logoutput   => true,
        refreshonly => true,
    }

    file {

        '/etc/nginx/nginx.conf':
            require => Package['nginx-full'],
            source  => "puppet:///modules/cpan-map/etc/nginx/nginx.conf",
            owner   => root,
            group   => root,
            mode    => 640,
            notify  => Exec["nginx-reload"];

        '/etc/nginx/sites-available/cpan-map':
            require => Package['nginx-full'],
            content => template('cpan-map/cpan-map-nginx.erb'),
            owner   => root,
            group   => root,
            mode    => 640,
            notify  => Exec["nginx-reload"];

        '/etc/nginx/sites-enabled/cpan-map':
            require => File['/etc/nginx/sites-available/cpan-map'],
            ensure  => '../sites-available/cpan-map',
            notify  => Exec["nginx-reload"];

    }

}

