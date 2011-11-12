package CPAN::Map::Builder;

use strict;
use warnings;

use FindBin qw();
require File::Basename;
require File::Spec;
require Math::PlanePath::HilbertCurve;
use Data::Dumper;


my @defaults = (
    mod_list_source => $ENV{HOME} . '/.cpan/sources/modules/02packages.details.txt.gz',
    critical_mass   => 30,
    verbose         => 0,
#    output_map_js   => 'CPAN::Map::WriteJSData',
    output_map_png  => 'CPAN::Map::WriteMapImage',
);


sub generate {
    my $class = shift;
    my $self  = $class->new(@_);

    $self->list_distros_by_ns;
    $self->map_distros_to_plane;
    $self->identify_mass_areas;
    $self->write_output_mappings;
}


sub new {
    my $class = shift;
    my $output_dir = File::Spec->catdir(
        File::Basename::dirname($FindBin::Bin), 'html'
    );
    return bless { @defaults, output_dir => $output_dir, @_ }, $class;
}


sub mod_list_source { shift->{mod_list_source}; }
sub critical_mass   { shift->{critical_mass};   }
sub mass_map        { shift->{mass_map};        }
sub total_distros   { shift->{total_distros};   }
sub output_dir      { shift->{output_dir};      }
sub plane_rows      { shift->{max_row} + 1;     }
sub plane_cols      { shift->{max_col} + 1;     }


sub progress_message {
    my($self, $message) = @_;

    return unless $self->{verbose};
    print $message, "\n";
}


sub list_distros_by_ns {
    my $self = shift;

    $self->progress_message('Listing all CPAN distros');

    open my $in, '-|', 'zcat', $self->mod_list_source or die "$!";

    # Build a big hash of distros by namespace
    my %ns_dist = ();
    while(<$in>) {
        my($maintainer,$dist) = m{
            ^\S+                       # Module name
            \s+\S+                     # Version number
            \s+
            (?:[^/]+/)+                # Path to maintainer's director
            ([^/]+)/                   # Maintainer's CPAN-ID
            ([^/\s-]+(?:-[^/\s-]+)*)-  # Distribution name
        }x or next;
        $dist =~  s{-}{::}g;
        my($ns) = split '::', $dist, 2;
        $ns_dist{lc($ns)}->{$dist} = $maintainer;
    }
    close($in);

    # Save counts ('mass') of distros per namespace and create an alphabetical
    # list of distros
    my(%mass_map, @dist_list);
    my $i = 0;
    foreach my $ns ( sort keys %ns_dist ) {
        my $ns_dist = delete $ns_dist{$ns};
        my @dists = keys %$ns_dist;
        my $this_ns = $mass_map{$ns} = { mass => scalar @dists };

        foreach my $dist_name (sort { lc($a) cmp lc($b) } @dists) {
            my $maintainer = $ns_dist->{$dist_name};
            my($prefix) = $dist_name =~ m{^(\w+)};
            if(lc($prefix) eq $ns  and  $prefix ne $ns) {
                $this_ns->{name} = $prefix;
            }
            push @dist_list, {
                ns          => $ns,
                name        => $dist_name,
                maintainer  => $maintainer,
            };
        }
    }

    $self->{total_distros} = scalar @dist_list;
    $self->{dist_list} = \@dist_list;
    $self->{mass_map}  = \%mass_map;
    $self->progress_message(" - found $self->{total_distros}");
}


sub distro {
    my($self, $i) = @_;

    return unless(defined($i));
    return $self->{dist_list}->[$i];
}


sub map_distros_to_plane {
    my $self = shift;

    $self->progress_message('Mapping all distros into 2D space');

    my @plane;
    $self->{max_row} = 0;
    $self->{max_col} = 0;
    $self->each_distro(sub {
        my($distro, $i) = @_;
        my($row, $col) = $self->map_index_to_plane($i);
        $plane[$row][$col] = $i;
        $distro->{row} = $row;
        $distro->{col} = $col;
        $self->{max_row} = $row if $row > $self->{max_row};
        $self->{max_col} = $col if $col > $self->{max_col};
    });
    $self->{plane} = \@plane;
}


sub dist_at {
    my($self, $row, $col) = @_;

    my $plane = $self->{plane} or return;
    my $r = $plane->[$row] or return;
    my $i = $r->[$col];
    return $self->distro($i);
}


sub each_distro {
    my($self, $handler) = @_;

    my $dist_list = $self->{dist_list};
    my $last = $#{ $dist_list };

    foreach my $i (0..$last) {
        $handler->($dist_list->[$i], $i);
    }
}


sub each_namespace {
    my($self, $handler) = @_;

    my $mass_map = $self->mass_map;
    foreach my $ns (sort keys %$mass_map) {
        $handler->($mass_map->{$ns});
    }
}


sub map_index_to_plane {
    my($self, $i) = @_;

    my $path = $self->{hilbert_path} //= Math::PlanePath::HilbertCurve->new();
    if($i < 16384) {
        my($x, $y) = $path->n_to_xy($i);
        return($x, $y);
    }
    else {
        my($x, $y) = $path->n_to_xy($i - 16384);
        return($x, $y + 128);
    }
}


sub identify_mass_areas {
    my $self = shift;

    $self->progress_message("Identifying 'significant' namespaces");

    # Weed out namespaces smaller than 'critical mass'
    my $mass_map = $self->mass_map;
    my $critical_mass = $self->critical_mass;
    while(my($key, $ns) = each %$mass_map) {
        delete $mass_map->{$key} if $ns->{mass} < $critical_mass;
    }

    # Work out which masses are neighbours (skipping non-critical ones).
    # Also keep some running totals for calculating centre of mass.
    my %neighbour;
    $self->each_distro(sub {
        my($this_dist, $i) = @_;
        my $this_ns = $mass_map->{ $this_dist->{ns} } or return; # == next
        $this_ns->{row_sum} += $this_dist->{row};
        $this_ns->{col_sum} += $this_dist->{col};
        $neighbour{ $this_dist->{ns} } //= {};  # this is actually needed
        foreach my $look ('right', 'down') {
            my($row1, $col1) = $look eq 'right'
                             ? ($this_dist->{row}, $this_dist->{col} + 1)
                             : ($this_dist->{row} + 1, $this_dist->{col});
            my $that_dist = $self->dist_at($row1, $col1)  or return;
            my $that_ns = $mass_map->{ $that_dist->{ns} } or return;
            if($this_ns ne $that_ns) {
                $neighbour{ $this_dist->{ns} }->{ $that_dist->{ns} } = 1;
                $neighbour{ $that_dist->{ns} }->{ $this_dist->{ns} } = 1;
            }
        }
    });

    # Flatten lists of neighbours
    while(my($ns, $value) = each %neighbour ) {
        $neighbour{$ns} = [ sort keys %$value ];
    }

    # Assign colors to namespaces with critical mass

    my @critical_ns = sort keys %neighbour;
    my $colour_map = map_colours({}, \%neighbour, @critical_ns)
        or die "Unable to assign colour map";

    while(my($key, $value) = each %$colour_map) {
        my $mass = $mass_map->{$key};
        $mass->{colour} = $value;
        $mass->{label_x} = sprintf('%3.1f', delete($mass->{col_sum}) / $mass->{mass});
        $mass->{label_y} = sprintf('%3.1f', delete($mass->{row_sum}) / $mass->{mass});
    }

    my $count = scalar @critical_ns;
    $self->progress_message(
        " - found $count namespaces containing " . $self->critical_mass .
        " or more distros"
    );
}


sub map_colours {
    my($map, $neighbour, $ns, @namespaces) = @_;
    no warnings qw(recursion);
    return $map unless $ns;
    my $near = $neighbour->{$ns} or die "no neigbours for $ns!?!";
    my %available = map { $_ => 1 } (1..4);
    foreach my $n ( @$near ) {
        delete $available{ $map->{$n} } if $map->{$n};
    }

    foreach my $try (sort keys %available) {
        $map->{$ns} = $try;
        return $map if map_colours($map, $neighbour, @namespaces);
    }
    delete $map->{$ns};
    return;
}


sub write_output_mappings {
    my $self = shift;

    my $output_dir = $self->output_dir;
    my @mappers = sort grep /^output_map_/, keys %$self;
    foreach my $map_class ( map { $self->{$_} } @mappers) {
        next unless $map_class;  # ignore default keys overridden to undef
        eval "require $map_class";
        die $@ if $@;
        $self->progress_message("Writing output using $map_class");
        $map_class->write($self, $output_dir);
    }
}


1;
