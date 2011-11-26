package CPAN::Map::Builder;

use strict;
use warnings;

use FindBin qw();
require File::Basename;
require File::Spec;
require IO::Uncompress::Gunzip;
require Math::PlanePath::HilbertCurve;
require Statistics::Descriptive;
require Gravatar::URL;
use Data::Dumper;


my $cpan_source_dir =  $ENV{HOME} . '/.cpan/sources';  # TODO portability fix

my @defaults = (
    mod_list_source => $cpan_source_dir . '/modules/02packages.details.txt.gz',
    authors_source  => $cpan_source_dir . '/authors/01mailrc.txt.gz',
    critical_mass   => 30,
    verbose         => 0,
    output_map_js   => 'CPAN::Map::WriteJSData',
    output_map_png  => 'CPAN::Map::WriteMapImage',
);


sub generate {
    my $class = shift;
    my $self  = $class->new(@_);

    $self->list_distros_by_ns;
    $self->map_distros_to_plane;
    $self->identify_mass_areas;
    $self->load_maintainer_data;
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
sub authors_source  { shift->{authors_source};  }
sub mod_list_date   { shift->{mod_list_date};   }
sub module_count    { shift->{module_count};    }
sub maintainer_count { shift->{maintainer_count}; }
sub critical_mass   { shift->{critical_mass};   }
sub mass_map        { shift->{mass_map};        }
sub maintainers     { shift->{maintainers};     }
sub total_distros   { shift->{total_distros};   }
sub output_dir      { shift->{output_dir};      }
sub plane_rows      { shift->{max_row} + 1;     }
sub plane_cols      { shift->{max_col} + 1;     }


sub progress_message {
    my($self, $message) = @_;

    return unless $self->{verbose};
    print $message, "\n";
}


sub warning_message {
    my($self, $message) = @_;
    warn "WARNING: <<< $message >>>\n";
}


sub gunzip_open {
    my($path) = @_;
    my $z = IO::Uncompress::Gunzip->new($path)
        or die $IO::Uncompress::Gunzip::GunzipError;
    return $z;
}


sub list_distros_by_ns {
    my $self = shift;

    $self->progress_message('Listing all CPAN distros');

    my $z = gunzip_open($self->mod_list_source);

    # Process the header

    my %month_num = qw(
        jan 01 feb 02 mar 03 apr 04 may 05 jun 06
        jul 07 aug 08 sep 09 oct 10 nov 11 dec 12
    );
    while($_ = $z->getline) {
        last unless /\S/;
        if(
            my($d, $m, $y, $t) = m{
                ^Last-Updated:\s+\S+,\s+
                (\d+)\s+(\S\S\S)\s+(\d\d\d\d)\s+(\d\d:\d\d:\d\d)
            }x
        ) {
            $m = $month_num{lc($m)};
            $self->{mod_list_date} = "$y-$m-$d $t UTC";
        }
    }

    # Build a big hash of distros by namespace
    my %ns_dist = ();
    my $module_count = 0;
    while($_ = $z->getline) {
        $module_count++;
        my($maintainer,$dist) = m{
            ^\S+                       # Module name
            \s+\S+                     # Version number
            \s+
            (?:[^/]+/){2}              # Path to maintainer's directory
            ([^/]+)/                   # Maintainer's CPAN-ID
            (?:[^/]+/)*                # Optional subdirs
            ([^/\s-]+(?:-[^/\s-]+)*)-  # Distribution name
        }x or next;
        $dist =~  s{-}{::}g;
        $dist =~  s{[.]pm$}{};
        my($ns) = split '::', $dist, 2;
        $ns_dist{lc($ns)}->{$dist} = $maintainer;
    }
    $z->close();

    # Save counts ('mass') of distros per namespace and create an alphabetical
    # list of distros
    my(%mass_map, @dist_list);
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

    $self->{module_count} = $module_count;
    $self->{total_distros} = scalar @dist_list;
    $self->{dist_list} = \@dist_list;
    $self->{mass_map}  = \%mass_map;
    $self->progress_message(" - found $self->{module_count} modules");
    $self->progress_message(" - found $self->{total_distros} distributions");
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

    $self->progress_message(
        ' - plane mapping produced ' . $self->plane_rows . ' rows of '
        . $self->plane_cols . ' columns'
    );
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

    # Set up statistics objects for centre of mass calculations
    foreach my $ns (values %$mass_map) {
        $ns->{row_stat} = Statistics::Descriptive::Full->new();
        $ns->{col_stat} = Statistics::Descriptive::Full->new();
    }

    # Work out which masses are neighbours (skipping non-critical ones)
    my %neighbour;
    $self->each_distro(sub {
        my($this_dist, $i) = @_;
        my $this_ns = $this_dist->{ns};
        my $this_mass = $mass_map->{$this_ns} or return; # == next
        $this_mass->{row_stat}->add_data($this_dist->{row});
        $this_mass->{col_stat}->add_data($this_dist->{col});
        $neighbour{ $this_dist->{ns} } //= {};  # this is actually needed
        foreach my $look ('right', 'down') {
            my($row1, $col1) = $look eq 'right'
                             ? ($this_dist->{row}, $this_dist->{col} + 1)
                             : ($this_dist->{row} + 1, $this_dist->{col});
            my $that_dist = $self->dist_at($row1, $col1) or next;
            my $that_ns = $that_dist->{ns};
            my $that_mass = $mass_map->{$that_ns} or next;
            if($this_ns ne $that_ns) {
                $neighbour{$this_ns}->{$that_ns} = 1;
                $neighbour{$that_ns}->{$this_ns} = 1;
            }
        }
    });

    # Flatten lists of neighbours
    while(my($ns, $value) = each %neighbour ) {
        $neighbour{$ns} = [ sort keys %$value ];
    }

    # Assign colors to namespaces with critical mass
    $self->progress_message("Allocating colours to map regions");
    my @critical_ns = sort keys %neighbour;
    my $colour_map = map_colours({}, \%neighbour, @critical_ns)
        or die "Unable to assign colour map";

    while(my($key, $value) = each %$colour_map) {
        my $mass = $mass_map->{$key};
        $mass->{colour} = $value;
        my $stat_x = delete($mass->{col_stat});
        $mass->{label_x} = $stat_x->mean;
        $mass->{label_w} = $stat_x->standard_deviation * 1.5;
        my $stat_y = delete($mass->{row_stat});
        $mass->{label_y} = $stat_y->mean;
        $mass->{label_h} = $stat_y->standard_deviation * 1.5;
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


sub load_maintainer_data {
    my($self) = @_;

    $self->progress_message("Loading maintainer details");

    my $z = gunzip_open($self->authors_source);

    # Work out which maintainers we're interested in
    my %maint;
    $self->each_distro(sub {
        my($distro) = @_;
        my $key = $distro->{maintainer};
        $maint{$key} = { id => $key };
    });

    # Read the authors file to get more details
    while($_ = $z->getline) {
        my($id, $name, $email) = m{
            ^alias
            \s+(\w+)                   # author ID
            \s+"(.*?)\s<               # author name
            (\S*?)>                    # email address
        }x or next;
        next unless $maint{$id};
        $maint{$id}->{name} = $name;
        if($email && $email =~ /@/) {
            $maint{$id}->{gravatar} = Gravatar::URL::gravatar_id($email);
        }
    }
    $z->close();

    $self->{maintainers} = \%maint;
    $self->{maintainer_count} = scalar keys %maint;
}


sub each_maintainer {
    my($self, $handler) = @_;

    my $maint = $self->maintainers;
    foreach my $id (sort keys %$maint) {
        $handler->($maint->{$id});
    }
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
