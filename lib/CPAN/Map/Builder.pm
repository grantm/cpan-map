package CPAN::Map::Builder;

use Moose;
use namespace::autoclean;

use FindBin qw();
use File::Path qw(make_path);
require File::Basename;
require File::Spec;
require JSON::XS;
require LWP::Simple;
require IO::Uncompress::Gunzip;
require Text::CSV_XS;
use Digest::MD5 qw(md5_hex);
use Data::Dumper;


my $default_config = File::Spec->catfile($ENV{HOME}, '.config', 'cpan-map');

has 'refresh_data' => (
    is      => 'rw',
    isa     => 'Bool',
    lazy    => 1,
    default => 0
);

has 'quick' => (
    is      => 'rw',
    isa     => 'Bool',
    lazy    => 1,
    default => 0
);

has 'verbose' => (
    is      => 'rw',
    isa     => 'Bool',
    lazy    => 1,
    default => 0
);

has 'config_file' => (
    is      => 'rw',
    isa     => 'Str',
    lazy    => 1,
    default => $default_config,
);

has 'config' => (
    is      => 'rw',
    isa     => 'HashRef',
    lazy    => 1,
    default => sub {
        my $self = shift;
        my $config_file = $self->config_file;
        return {} if !-e $config_file  and  $config_file eq $default_config;
        open my $fh, '<', $config_file;
        local($/);
        my $json_text = <$fh>;
        return JSON::XS::decode_json($json_text);
    },
);

has 'critical_mass' => (
    is      => 'rw',
    isa     => 'Int',
    lazy    => 1,
    default => 30
);

has 'source_data_dir' => (
    is      => 'ro',
    isa     => 'Str',
    lazy    => 1,
    default => File::Spec->catdir(
        File::Basename::dirname($FindBin::Bin), 'source_data'
    ),
);

has 'output_dir' => (
    is      => 'ro',
    isa     => 'Str',
    lazy    => 1,
    default => File::Spec->catdir(
        File::Basename::dirname($FindBin::Bin), 'html'
    ),
);

has 'zoom_scales' => (
    is      => 'ro',
    isa     => 'ArrayRef[Int]',
    lazy    => 1,
    default => sub { [ 3, 4, 5, 6, 8, 10, 20 ] },
    # Note: additions to the zoom-scales list here must be accompanied by
    # corresponding changes to the CSS file
);

has 'mod_list_source' => (
    is      => 'rw',
    isa     => 'Str',
    lazy    => 1,
    default => sub {
        File::Spec->catfile(shift->source_data_dir, '02packages.details.txt.gz');
    },
);

has 'authors_source' => (
    is      => 'rw',
    isa     => 'Str',
    lazy    => 1,
    default => sub {
        File::Spec->catfile(shift->source_data_dir, '01mailrc.txt.gz');
    },
);

has 'ratings_source_url' => (
    is      => 'rw',
    isa     => 'Str',
    lazy    => 1,
    default => 'http://cpanratings.perl.org/csv/all_ratings.csv',
);

has 'ratings_source' => (
    is      => 'rw',
    isa     => 'Str',
    lazy    => 1,
    default => sub {
        File::Spec->catfile(shift->source_data_dir, 'all_ratings.csv');
    },
);

has 'label_font_path' => (
    is      => 'rw',
    isa     => 'Str',
    lazy    => 1,
    default => sub {
        foreach (
            '/usr/share/fonts/truetype/ttf-liberation/LiberationSans-Regular.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        ) {
            return $_ if -e $_;
        }
    },
);

has 'output_writers' => (
    is      => 'rw',
    isa     => 'ArrayRef[Str]',
    lazy    => 1,
    default => sub {
        return [
            'CPAN::Map::WriteJSData',
            'CPAN::Map::WriteMapImages',
            'CPAN::Map::WriteDocRoot',
        ];
    },
);

has 'mass_map' => (
    is      => 'rw',
    isa     => 'HashRef[CPAN::Map::Namespace]',
    lazy    => 1,
    default => sub { {} },
);

has 'distro_list' => (
    is      => 'rw',
    isa     => 'ArrayRef[CPAN::Map::Distribution]',
    lazy    => 1,
    default => sub { [] },
);

sub distro_count { scalar @{ shift->distro_list }; }

has 'distro_index' => (
    is      => 'rw',
    isa     => 'HashRef[Int]',
    lazy    => 1,
    default => sub { {} },
);

has 'maintainers' => (
    is      => 'rw',
    isa     => 'HashRef[CPAN::Map::Maintainer]'
);

sub maintainer_count { scalar keys %{ shift->maintainers }; }


has 'mod_list_date'    => ( is => 'rw', isa => 'Str' );
has 'slug_of_the_day'  => ( is => 'rw', isa => 'Str' );
has 'plane_rows'       => ( is => 'rw', isa => 'Int' );
has 'plane_cols'       => ( is => 'rw', isa => 'Int' );
has 'module_count'     => ( is => 'rw', isa => 'Int' );
has 'plane'            => ( is => 'rw', isa => 'Ref' );


sub generate {
    my $class = shift;
    my $self  = $class->new(@_);

    if($self->refresh_data) {
        $self->update_source_data;
    }
    $self->list_distros_by_ns;
    $self->map_distros_to_plane;
    $self->identify_mass_areas;
    $self->load_maintainer_data;
    $self->load_ratings_data;
    $self->write_output_mappings;
}


sub progress_message {
    my($self, $message) = @_;

    return unless $self->verbose;
    print $message, "\n";
}


sub warning_message {
    my($self, $message) = @_;
    warn "WARNING: <<< $message >>>\n";
}


sub gunzip_open {
    my($path) = @_;

    no warnings qw( once );

    my $z = IO::Uncompress::Gunzip->new($path)
        or die $IO::Uncompress::Gunzip::GunzipError;

    return $z;
}


sub config_item {
    my($self, $key, $default) = @_;

    return $self->config->{$key} // $default;
}


sub update_source_data {
    my($self) = @_;

    my $data_dir = $self->source_data_dir;
    $self->progress_message("Updating source data in $data_dir");

    make_path($data_dir) if not -d $data_dir;

    my $cpan_mirror = $self->config_item(
        'cpan_mirror' => 'http://cpan.perl.org/'
    );

    my($src_url, $dst_file, $status);

    $src_url  = $cpan_mirror . 'modules/02packages.details.txt.gz';
    $dst_file = $self->mod_list_source;
    $status   = LWP::Simple::mirror($src_url, $dst_file);
    die "Status code: $status downloading $src_url"
        unless $status =~ m/^(200|304)$/;

    $src_url  = $cpan_mirror . 'authors/01mailrc.txt.gz';
    $dst_file = $self->authors_source;
    $status   = LWP::Simple::mirror($src_url, $dst_file);
    die "Status code: $status downloading $src_url"
        unless $status =~ m/^(200|304)$/;

    $dst_file = $self->ratings_source;
    if(!-e $dst_file  or  -M $dst_file > 0.8) {
        $src_url  = $self->ratings_source_url;
        $status   = LWP::Simple::mirror($src_url, $dst_file);
        die "Status code: $status downloading $src_url"
            unless $status =~ m/^(200|304)$/;
    }
}


sub list_distros_by_ns {
    my $self = shift;

    # Parse packages file into a hash of hashes

    my $distros_by_ns = $self->parse_packages_to_ns_hash();


    # Reorganise hash by namespace into a big alphabetical list of distros.
    # Save counts ('mass') of distros per namespace

    my $mass_map = $self->mass_map;
    foreach my $prefix ( sort keys %$distros_by_ns ) {
        my $dists_for_ns = delete $distros_by_ns->{$prefix};
        my @dists = keys %$dists_for_ns;
        my $this_ns = $mass_map->{$prefix} = CPAN::Map::Namespace->new(
            name => $prefix,
            mass => scalar(@dists),
        );

        foreach my $dist_name (sort { lc($a) cmp lc($b) } @dists) {
            my $distro = $dists_for_ns->{$dist_name};
            my($dist_prefix) = $dist_name =~ m{^(\w+)};
            if(lc($dist_prefix) eq $prefix  and  $dist_prefix ne $prefix) {
                $this_ns->name($dist_prefix);  # prefer this capitalisation
            }
            $self->add_distro($distro);
        }
    }

    $self->progress_message(" - found " . $self->module_count . " modules");
    $self->progress_message(" - found " . $self->distro_count . " distributions");
}


sub parse_packages_to_ns_hash {
    my $self = shift;

    $self->progress_message('Listing all CPAN distros from 02packages file');

    my $z = gunzip_open($self->mod_list_source);

    # Process the header

    while($_ = $z->getline) {
        last unless /\S/;
        if( m{^Last-Updated:\s+(\S.*)$} ) {
            my $timestamp = $self->parse_packages_timestamp( $1 );
            $self->mod_list_date($timestamp);
            my $hex = md5_hex( $timestamp );
            $self->slug_of_the_day(substr($hex, 0, 8));
        }
    }
    die "Failed to extract timestamp from module-list" unless $self->slug_of_the_day;

    # Build a big hash of distros by namespace prefix
    my %prefix_dists = ();
    my $module_count = 0;
    while(my $line = $z->getline) {
        $module_count++;
        my($prefix, $distro_name, $maintainer, $module)
            = _parse_module_line($line) or next;
        my $distro = $prefix_dists{$prefix}->{$distro_name};
        if(not defined $distro) {
            $distro = $prefix_dists{$prefix}->{$distro_name} =
                CPAN::Map::Distribution->new(
                    name          => $distro_name,
                    ns            => $prefix,
                    maintainer_id => $maintainer,
                );
        }
        $distro->check_for_main_module($module);
    }
    $z->close();

    $self->module_count($module_count);

    return \%prefix_dists;
}


sub parse_packages_timestamp {
    my($self, $date_string) = @_;

    my %month_num = qw(
        jan 01 feb 02 mar 03 apr 04 may 05 jun 06
        jul 07 aug 08 sep 09 oct 10 nov 11 dec 12
    );

    my($d, $m, $y, $t) = $date_string =~ m{
        ^\S+,\s+(\d+)\s+(\S\S\S)\s+(\d\d\d\d)\s+(\d\d:\d\d:\d\d)
    }x or die "Unable to parse date from packages file: '$date_string'";

    $m = $month_num{lc($m)};
    return "$y-$m-$d $t UTC";
}


sub _parse_module_line{
    local($_) = shift;
    return if m{[.]pm(?:[.]gz)?$};
    my($module, $maintainer, $distro_name) = $_ =~ m{
        ^(\S+)                         # Module name
        \s+\S+                         # Version number
        \s+
        (?:[^/]+/){2}                  # Path to maintainer's directory
        ([^/]+)/                       # Maintainer's CPAN-ID
        (?:[^/]+/)*                    # Optional subdirs
        ([^/\s-]+(?:-[^/\s-]+)*)[.-]   # Distribution name
    }x or return;
    $distro_name =~  s{-}{::}g;
    $distro_name =~  s{::\d.+$}{};
    $distro_name =~  s{[.].*$}{};
    $distro_name =~  s{::[vV]\d+$}{};
    my($ns) = split '::', $distro_name, 2;

    return(lc($ns), $distro_name, $maintainer, $module);
}


sub add_distro {
    my($self, $distro) = @_;

    my $distro_list = $self->distro_list;
    $distro->index( scalar(@$distro_list) );
    push @$distro_list, $distro;
    $self->distro_index->{ $distro->name } = $distro->index;
}


sub distro {
    my($self, $i) = @_;

    return unless(defined($i));
    return $self->distro_list->[$i];
}


sub distro_by_name {
    my($self, $name) = @_;

    my $i = $self->distro_index->{$name} or return;
    return $self->distro($i);
}


sub map_distros_to_plane {
    my $self = shift;

    $self->progress_message('Mapping all distros into 2D space');

    my $mapper = $self->create_plane_mapper;

    my($max_row, $max_col, @plane) = (0, 0);
    $self->each_distro(sub {
        my($distro) = @_;
        my($row, $col) = $mapper->row_col_from_index($distro->index);
        $plane[$row][$col] = $distro->index;
        $distro->row($row);
        $distro->col($col);
        $max_row = $row if $row > $max_row;
        $max_col = $col if $col > $max_col;
    });
    $self->plane(\@plane);
    $self->plane_rows($max_row + 1);
    $self->plane_cols($max_col + 1);

    $self->progress_message(
        ' - plane mapping produced ' . $self->plane_rows . ' rows of '
        . $self->plane_cols . ' columns'
    );
}


sub create_plane_mapper {
    my($self) = @_;

    return CPAN::Map::PlaneMapperHilbert->new(set_size => $self->distro_count);
}


sub dist_at {
    my($self, $row, $col) = @_;

    my $plane = $self->plane or return;
    my $r = $plane->[$row] or return;
    my $i = $r->[$col];
    return $self->distro($i);
}


sub each_distro {
    my($self, $handler) = @_;

    $handler->($_) foreach ( @{ $self->distro_list } );
}


sub each_namespace {
    my($self, $handler) = @_;

    my $mass_map = $self->mass_map;
    $handler->($mass_map->{$_}) foreach (sort keys %$mass_map);
}


sub namespace_for_distro {
    my($self, $distro) = @_;
    return $self->mass_map->{ $distro->ns };
}


sub identify_mass_areas {
    my $self = shift;

    $self->progress_message("Identifying 'significant' namespaces");

    # Weed out namespaces smaller than 'critical mass'
    my $mass_map = $self->mass_map;
    my $critical_mass = $self->critical_mass;
    while(my($prefix, $ns) = each %$mass_map) {
        delete $mass_map->{$prefix} if $ns->mass < $critical_mass;
    }

    # Work out which masses are neighbours (skipping non-critical ones)
    my %neighbour;
    $self->each_distro(sub {
        my($this_distro) = @_;
        my $this_prefix = $this_distro->ns;
        my $this_mass = $mass_map->{$this_prefix} or return; # == next
        $this_mass->update_stats($this_distro); # for mass center
        $neighbour{ $this_distro->ns } //= {};  # this is actually needed
        foreach my $look ('right', 'down') {
            my($row1, $col1) = $look eq 'right'
                             ? ($this_distro->row, $this_distro->col + 1)
                             : ($this_distro->row + 1, $this_distro->col);
            my $that_distro = $self->dist_at($row1, $col1) or next;
            my $that_prefix = $that_distro->ns;
            my $that_mass   = $mass_map->{$that_prefix} or next; # not critical
            if($this_prefix ne $that_prefix) { # each neighbours the other
                $neighbour{$this_prefix}->{$that_prefix} = 1;
                $neighbour{$that_prefix}->{$this_prefix} = 1;
            }
        }
    });

    # Flatten lists of neighbours
    while(my($ns, $value) = each %neighbour ) {
        $neighbour{$ns} = [ sort keys %$value ];
    }
    my @critical_ns = sort keys %neighbour;

    my $count = scalar @critical_ns;
    $self->progress_message(
        " - found $count namespaces containing " . $self->critical_mass .
        " or more distros"
    );

    # Assign colors to namespaces with critical mass
    $self->progress_message(" - allocating colours to map regions");
    my $colour_map = map_colours({}, \%neighbour, @critical_ns)
        or die "Unable to assign colour map";

    while(my($key, $value) = each %$colour_map) {
        my $mass = $mass_map->{$key};
        $mass->colour($value);
        $mass->finalise_stats();
    }
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
        my $cpan_id = shift->maintainer_id;
        $maint{$cpan_id} //= CPAN::Map::Maintainer->new( id => $cpan_id );
    });

    # Read the authors file to get more details
    my $count  = 0;
    my $gcount = 0;
    while($_ = $z->getline) {
        my($id, $name, $email) = m{
            ^alias
            \s+([\w-]+)                # author ID
            \s+"(.*?)\s<               # author name
            (.*?)>                     # email address
        }x or next;
        my $maintainer = $maint{$id} or next; # skip if no uploads
        $maintainer->name($name);
        $count++;
        if($email) {
            $email =~ s{^\s+}{};
            $email =~ s{\s+$}{};
            $email =~ s{\s+dot\s+}{.}g;
            $email =~ s{\s+at\s+}{@};
            if($email !~ /\s/  and  $email =~ /@/) {
                $maintainer->email($email);
                $gcount++;
            }
        }
    }
    $z->close();

    $self->maintainers(\%maint);

    $self->progress_message(
        " - found $count 'active' maintainers\n" .
        " - generated $gcount Gravatar IDs"
    );
}


sub each_maintainer {
    my($self, $handler) = @_;

    my $maint = $self->maintainers;
    $handler->($maint->{$_}) foreach (sort keys %$maint);
}


sub load_ratings_data {
    my $self = shift;

    $self->progress_message("Loading ratings details");

    my $csv = Text::CSV_XS->new ({ binary => 1, eol => $/ });
    my $file = $self->ratings_source;
    open my $fh, "<", $file or die "$file: $!";

    my $count = 0;
    while (my $row = $csv->getline($fh)) {
        my($name, $rating, $reviews) = @$row;
        next if length($name) == 0 || $name eq 'distribution';
        $name =~ s/-/::/g;
        my $distro = $self->distro_by_name($name) or next;
        $distro->rating_score($rating);
        $distro->rating_count($reviews);
        $count++;
    }

    $self->progress_message(" - found ratings for $count distributions");
}


sub write_output_mappings {
    my $self = shift;

    my $output_dir = $self->output_dir;
    foreach my $map_class ( @{ $self->output_writers } ) {
        next unless $map_class;  # ignore default keys overridden to undef
        eval "require $map_class";
        die $@ if $@;
        $self->progress_message("Writing output using $map_class");
        $map_class->write($self, $output_dir);
    }
}


__PACKAGE__->meta->make_immutable;



package CPAN::Map::Namespace;

use Moose;
use namespace::autoclean;

require Statistics::Descriptive;

has 'name'     => ( is => 'rw', isa => 'Str' );
has 'mass'     => ( is => 'ro', isa => 'Int' );
has 'colour'   => ( is => 'rw', isa => 'Int' );

has 'label_x'  => ( is => 'rw', isa => 'Num', clearer => 'clear_label_x' );
has 'label_y'  => ( is => 'rw', isa => 'Num', clearer => 'clear_label_y' );

has 'row_stat' => (
    is      => 'rw',
    isa     => 'Statistics::Descriptive::Full',
    lazy    => 1,
    default => sub { Statistics::Descriptive::Full->new(); },
);

has 'col_stat' => (
    is      => 'rw',
    isa     => 'Statistics::Descriptive::Full',
    lazy    => 1,
    default => sub { Statistics::Descriptive::Full->new(); },
);

sub reset_stats {
    my($self) = @_;

    $self->clear_label_x;
    $self->clear_label_y;
    $self->row_stat( Statistics::Descriptive::Full->new() );
    $self->col_stat( Statistics::Descriptive::Full->new() );
}

sub update_stats {
    my($self, $distro) = @_;

    $self->row_stat->add_data($distro->row);
    $self->col_stat->add_data($distro->col);
}

sub finalise_stats {
    my($self) = @_;

    my $stat_x = $self->col_stat;
    return if $stat_x->count == 0;
    $self->label_x( $stat_x->mean );

    my $stat_y = $self->row_stat;
    $self->label_y( $stat_y->mean );
}


__PACKAGE__->meta->make_immutable;



package CPAN::Map::Distribution;

use Moose;
use namespace::autoclean;

has 'name'              => ( is => 'ro', isa => 'Str' );
has 'ns'                => ( is => 'ro', isa => 'Str' );
has 'maintainer_id'     => ( is => 'rw', isa => 'Str' );
has 'index'             => ( is => 'rw', isa => 'Int' );
has 'row'               => ( is => 'rw', isa => 'Int' );
has 'col'               => ( is => 'rw', isa => 'Int' );
has 'rating_score'      => ( is => 'rw', isa => 'Num' );
has 'rating_count'      => ( is => 'rw', isa => 'Int' );
has 'is_eponymous'      => ( is => 'rw', isa => 'Bool', default => 0 );
has 'main_module_guess' => ( is => 'rw', isa => 'ArrayRef');


sub main_module {
    my($self) = @_;

    return $self->name if $self->is_eponymous;
    my $guess = $self->main_module_guess;
    return $guess->[0];
}


sub check_for_main_module {
    my($self, $module) = @_;

    return if $self->is_eponymous();    # We already found the main module
    if($module eq $self->name) {
        return $self->is_eponymous(1);  # Module name matches distro name
    }
    my $score = _score_guess($self->name, $module);
    if(my $current = $self->main_module_guess) {
        my($guess, $guess_score) = @$current;
        return if $score < $guess_score;
        if($score == $guess_score) {
            return if length($module) >= length($guess);
        }
    }
    $self->main_module_guess([$module, $score]);
}


sub _score_guess {
    my($distro_name, $module) = @_;

    return 5 if lc($module) eq lc($distro_name);
    return 4 if lc($module) eq lc('app::' . $distro_name);

    if(my($prefix) = $distro_name =~ m{^(.+)(?:-|::)perl$}) {
        return 3 if lc($prefix) eq lc($module);
    }

    (my $bare_distro = lc($distro_name)) =~ s{(?:'|::|_)}{}g;
    (my $bare_module = lc($module))      =~ s{(?:'|::|_)}{}g;
    return 2 if $bare_distro eq $bare_module;

    return 1 if $module =~ m{^\Q$distro_name\E}i;
    return 1 if $module =~ m{\Q$distro_name\E$}i;

    return 0;
}


__PACKAGE__->meta->make_immutable;



package CPAN::Map::Maintainer;

use Moose;
use namespace::autoclean;

use Gravatar::URL qw(gravatar_id);

has 'id'          => ( is => 'ro', isa => 'Str' );
has 'name'        => ( is => 'rw', isa => 'Str' );
has 'email'       => ( is => 'rw', isa => 'Str' );
has 'gravatar_id' => ( is => 'rw', isa => 'Str' );

before 'email' => sub {
    my $self  = shift;
    my $email = shift or return;
    $self->gravatar_id( gravatar_id($email) );
};


__PACKAGE__->meta->make_immutable;



package CPAN::Map::PlaneMapperHilbert;

use Moose;
use namespace::autoclean;

require Math::PlanePath::HilbertCurve;

has 'set_size'    => ( is => 'ro', isa => 'Int' );

has 'path' => (
    is      => 'ro',
    isa     => 'Math::PlanePath::HilbertCurve',
    lazy    => 1,
    default => sub { Math::PlanePath::HilbertCurve->new },
);

sub row_col_from_index {
    my($self, $i) = @_;

    my($x, $y) = $self->path->n_to_xy($i);
    return($x, $y);
}


__PACKAGE__->meta->make_immutable;


1;

