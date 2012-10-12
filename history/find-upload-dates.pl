#!/usr/bin/perl

use 5.010;
use strict;
use warnings;
use autodie;

use LWP::UserAgent;
use HTTP::Request::Common qw( POST );
use JSON::XS              qw( decode_json );
use Data::Dumper;

my $new_dists_file  = 'new-dists-2012';
my $metacpan_base = 'http://api.metacpan.org';
my $release_api_url = "$metacpan_base/v0/release";

my $new_dist = load_new_dist_list();

foreach my $month (1 .. 12) {
    find_uploads_for_month($month, $new_dist);
    save_dist_list($new_dist);
}

exit;


sub load_new_dist_list {
    foreach my $file ( $new_dists_file, "${new_dists_file}.dated") {
        return load_dist_list($file) if -r $file;
    }
    die "Can't find dist list file";
}


sub load_dist_list {
    my($file) = @_;

    my %result;
    open my $fh, '<', $file;
    while(<$fh>) {
        chomp;
        my($name, $date) = split /,/;
        $result{$name} = $date;
    }
    return \%result;
}

sub save_dist_list {
    my($new_dist) = @_;
    open my $fh, '>', "${new_dists_file}.dated";
    foreach my $name (sort keys %$new_dist) {
        print $fh "$name," . ($new_dist->{$name} || '') . "\n";
    }
    close($fh);
}


sub find_uploads_for_month {
    my($from_month, $new_dist) = @_;

    my $from_year = 2012;
    my $to_year   = $from_month > 11 ? $from_year + 1 : $from_year;
    my $to_month  = $from_month > 11
                    ? ($from_month % 12 + 1)
                    : $from_month + 1;
    my $from_date = sprintf("%04u-%02u-01T00:00:00.000Z", $from_year, $from_month);
    my $to_date   = sprintf("%04u-%02u-01T00:00:00.000Z", $to_year,   $to_month);
    query_date_range($from_date, $to_date, $new_dist);
}


sub query_date_range {
    my($from_date, $to_date, $new_dist) = @_;

    print "Querying uploads for month: $from_date\n";

    my $query = qq{{
        "query": {
            "bool": {
                "must": [
                    {
                        "range": {
                            "release.date": {
                                "from" : "$from_date",
                                "to" : "$to_date"
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
print "  Hits: " . scalar(@$hits) . "\n";
    foreach (@$hits) {
        $_ = $_->{fields};
        my $name = $_->{distribution};
        my $date = $_->{date};
        next unless exists $new_dist->{$name};
warn "  Wanted: $name\n";
        if($new_dist->{$name}) {
            $new_dist->{$name} = $date if $date lt $new_dist->{$name};
        }
        else {
            $new_dist->{$name} = $date;
        }
    }

}
