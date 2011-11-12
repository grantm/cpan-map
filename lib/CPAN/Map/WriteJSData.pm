package CPAN::Map::WriteJSData;

use strict;
use warnings;


sub write {
    my($class, $builder, $output_dir) = @_;

    my $output_file = File::Spec->catfile($output_dir, 'cpan-map-data.txt');
    open my $out, '>', $output_file or die "open($output_file): $!";
    $builder->progress_message("- writing JS data to $output_file");


    # Write out metadata
    print $out "[META]\n";
    printf $out "map_image,%s\n", "cpan-map.png";
    printf $out "plane_rows,%s\n", $builder->plane_rows;
    printf $out "plane_cols,%s\n",$ builder->plane_cols;
    printf $out "max_scale,%s\n", 10;

    # Write out the maintainer list
    print $out "[MAINTAINERS]\n";
    my %maintainer_num;
    $builder->each_distro(sub {
        my($distro) = @_;
        $maintainer_num{ $distro->{maintainer} } = undef;
    });
    my $i = 0;
    foreach my $name ( sort keys %maintainer_num ) {
        $maintainer_num{$name} = $i++;
        print $out $name, "\n";
    }
    $builder->progress_message("- listed $i maintainers");


    # Write out namespace list
    print $out "[NAMESPACES]\n";
    $i = 0;
    my %ns_num;
    $builder->each_namespace(sub {
        my($ns) = @_;
        printf $out "%s,%s,%X\n", $ns->{name}, $ns->{colour}, $ns->{mass};
        $ns_num{ lc($ns->{name}) } = $i++;
    });
    $builder->progress_message("- listed $i namespaces");


    # Write out distro list
    print $out "[DISTRIBUTIONS]\n";
    $i = 0;
    $builder->each_distro(sub {
        my($dist) = @_;
        my $ns_number = defined($ns_num{ $dist->{ns} })
                      ? sprintf('%X', $ns_num{ $dist->{ns} })
                      : '';
        die "Can't find maintainer number for $dist->{maintainer}"
            unless defined $maintainer_num{ $dist->{maintainer} };
        printf $out "%s,%s,%X,%X,%X\n",
            $dist->{name},
            $ns_number,
            $maintainer_num{ $dist->{maintainer} },
            $dist->{row},
            $dist->{col};
        $i++;
    });
    $builder->progress_message("- listed $i distros");


    close($out);
}

1;
