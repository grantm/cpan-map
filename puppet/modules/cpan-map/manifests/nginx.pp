
class cpan-map::nginx {

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
            source  => "puppet:///modules/cpan-map/etc/nginx/cpan-map.conf",
            owner   => root,
            group   => root,
            mode    => 640,
            notify  => Exec["nginx-reload"];

        '/etc/nginx/sites-enabled/cpan-map':
            ensure  => '../sites-available/cpan-map',
            notify  => Exec["nginx-reload"];

        '/etc/nginx/htpasswd':
            owner   => root,
            group   => www-data,
            mode    => 640,
            content => "treasure:qJRb6lIMLQRug\n";

    }

}

