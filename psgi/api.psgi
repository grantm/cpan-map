#!/usr/bin/perl

use strict;
use warnings;

use Plack::Request qw();
use LWP::Simple    qw(get);
use JSON::XS       qw();

my $api_url  = 'http://api.metacpan.org/pod/';

my $app = sub {
    my($env) = @_;

    my $req = Plack::Request->new($env);

    my($module)  = $req->path =~ m{([^/]*)$};
    my $callback = $req->param('callback');

    my $content_type = $callback ? 'text/javascript' : 'application/json';
    return [
        200,
        [
            'Content-Type' => $content_type . "; charset=UTF-8"
        ],
        [ make_jsonp_pod($callback, $module) ]
    ]
};

sub make_jsonp_pod {
    my($callback, $module) = @_;

    my $pod = get($api_url . $module . '?content-type=text/html') ||
        qq{<p class="error">Unable to find POD for "$module"</p>\n};

    my $json = JSON::XS->new->encode({ pod => $pod });
    if($callback) {
        return "$callback($json)\n";
    }
    return $json;
}

$app;
