#!/usr/bin/perl

use 5.010;
use strict;
use warnings;
use autodie;

use LWP::UserAgent;
use HTTP::Request::Common qw( POST );
use JSON::XS              qw( decode_json );
use Data::Dumper;

my $metacpan_base = 'http://api.metacpan.org';
my $release_api_url = "$metacpan_base/v0/release";

my $query = q{{
    "query": {
        "match_all": {},
        "range" : {
            "release.date" : {
                "from" : "2012-01-01T00:00:00",
                "to" : "2012-12-01T00:00:00"
            }
        }
    },
    "size": 5000,
    "filter": {
        "term": { "release.first": true }
    },
    "fields": ["release.name", "release.distribution", "release.date", "release.first"]
}};

$query = q{{
    "query": {
        "bool": {
            "must": [
                {
                    "term": { "release.first": true }
                },
                {
                    "range": {
                        "release.date": {
                            "from": "2012-01-01T00:00:00",
                            "to":   "2012-12-01T00:00:00"
                        }
                    }
                }
            ]
        }
    },
    "fields": ["release.name", "release.distribution", "release.date", "release.author"],
    "size": 5000
}};

my $test = decode_json( $query );   # dies on error;

my $ua = LWP::UserAgent->new;
my $req = POST($release_api_url, Content => $query);
my $resp = $ua->request($req);
die $resp->status_line unless $resp->is_success;

my $resultset = decode_json($resp->content);

my $hits = $resultset->{hits}->{hits};
$_ = $_->{fields} foreach @$hits;

print "// Matches returned: " . @$hits . "\n";
print JSON::XS->new->ascii->pretty->canonical->encode( $hits ), "\n";

# 359   01 - 12

