
class cpan-map::apt-packages {
    package {
        "aptitude":                       ensure => installed;
        "lsb-release":                    ensure => installed;
        "cron":                           ensure => installed;
        "sudo":                           ensure => installed;
        "strace":                         ensure => installed;
        "lsof":                           ensure => installed;
        "bash-completion":                ensure => installed;
        "vim":                            ensure => installed;
        "iputils-ping":                   ensure => installed;
        "less":                           ensure => installed;
        "wget":                           ensure => installed;
        "rsync":                          ensure => installed;
        "telnet":                         ensure => installed;
        "git-core":                       ensure => installed;
        "build-essential":                ensure => installed;
        "apt-file":                       ensure => installed;
        "perl-doc":                       ensure => installed;
        "man-db":                         ensure => installed;
        "bsd-mailx":                      ensure => installed;
        "ttf-liberation":                 ensure => installed;
        "libterm-readline-gnu-perl":      ensure => installed;
        "libmoose-perl":                  ensure => installed;
        "libnamespace-autoclean-perl":    ensure => installed;
        "libio-compress-perl":            ensure => installed;
        "libgd-gd2-perl":                 ensure => installed;
        "libstatistics-descriptive-perl": ensure => installed;
        "libtext-csv-xs-perl":            ensure => installed;
        "libgravatar-url-perl":           ensure => installed;
        "liburi-perl":                    ensure => installed;
        "libfile-find-rule-perl":         ensure => installed;
        "libjavascript-minifier-xs-perl": ensure => installed;
        "libcss-minifier-xs-perl":        ensure => installed;
        "dh-make-perl":                   ensure => installed;
        "libmath-libm-perl":              ensure => installed;
        "libconstant-defer-perl":         ensure => installed;
        "libmath-planepath-perl":         ensure => installed;
    }
}

