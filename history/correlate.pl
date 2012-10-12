#!/usr/bin/perl

use 5.010;
use strict;
use warnings;
use autodie;

use JSON::XS qw( decode_json );

my $dists = decode_json( `cat upload-dates.json` );
my %upload;
foreach my $dist (@$dists) {
    my $date = substr($dist->{date}, 0, 10);
    $upload{ $dist->{distribution} } = $date;
}

@ARGV = ( 'new-dists-2012' );
while(<>) {
    chomp;
    print "$_," . ($upload{$_} || 'unknown') . "\n";
}


