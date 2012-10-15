package CPAN::Map::HistBuilder;

use Moose;
use Moose::Util::TypeConstraints;
use namespace::autoclean;
use autodie;

extends "CPAN::Map::Builder";

require CPAN::Map::WriteMapHistImages;
require DateTime;
require Parse::CPAN::Packages;

use File::Slurp   qw( read_file write_file );
use JSON::XS      qw( decode_json );
use Data::Dumper;

subtype 'CPAN::Map::Date' => as class_type('DateTime');

coerce 'CPAN::Map::Date' => from 'Str' => via {
    my($y, $m, $d) = split /-/, $_;
    DateTime->new(year => $y, month => $m, day => $d);
};

has 'uploads_per_frame' => (
    is      => 'ro',
    isa     => 'Int',
    lazy    => 1,
    default => 2,
);

has 'old_packages_file' => (
    is      => 'ro',
    isa     => 'Str',
);

has 'animation_start_date' => (
    is      => 'ro',
    isa     => 'CPAN::Map::Date',
    coerce  => 1,
);

has 'animation_end_date' => (
    is      => 'ro',
    isa     => 'CPAN::Map::Date',
    coerce  => 1,
);

has 'upload_dates_file' => (
    is      => 'ro',
    isa     => 'Str',
);

has 'date_label_font_path' => (
    is      => 'rw',
    isa     => 'Str',
    lazy    => 1,
    default => sub { shift->label_font_path },
);


has 'uploads_by_date' => (
    is      => 'rw',
    isa     => 'HashRef',
);

has 'history_start_date' => (
    is      => 'rw',
    isa     => 'CPAN::Map::Date',
    coerce  => 1,
);

has 'history_end_date' => (
    is      => 'rw',
    isa     => 'CPAN::Map::Date',
    coerce  => 1,
);

has 'post_historic_distros' => (
    is      => 'rw',
    isa     => 'HashRef',
);

has 'frames' => (
    is      => 'rw',
    isa     => 'ArrayRef',
);

has 'saved_plane_map' => (
    is      => 'rw',
    isa     => 'ArrayRef',
);

has 'recent_new_uploads' => (
    is      => 'rw',
    isa     => 'HashRef',
);

has 'new_upload_persistence' => (
    is      => 'rw',
    isa     => 'Int',
    lazy    => 1,
    default => 3,
);


sub generate {
    my $class = shift;
    my $self  = $class->new(@_);

    $self->load_upload_dates;
    $self->make_frame_set;
    $self->list_distros_by_ns;
    $self->map_distros_to_plane;
    $self->save_plane_mapping;
    $self->identify_mass_areas;
    $self->write_output_frames;
}


sub save_plane_mapping {
    my($self) = @_;

    my @saved_map;
    $self->each_distro(sub {
        my($distro) = @_;
        push @saved_map, [ $distro->row, $distro->col ];
    });
    $self->saved_plane_map(\@saved_map);
}


sub write_output_frames {
    my($self) = @_;

    $self->progress_message("Writing output frames");
    my $output_dir = $self->output_dir;
    my $writer = CPAN::Map::WriteMapHistImages->new(
        builder     => $self,
        output_dir  => $output_dir,
    );
    $writer->purge_old_files($self, $output_dir);
    $self->each_frame(sub {
        my($frame, $date) = @_;
        $writer->write_frame($frame, $date);
    });
}


sub load_upload_dates {
    my($self) = @_;

    $self->progress_message("Loading historical upload dates");

    # Get a list of distros that existed in old packages file

    my $packages = Parse::CPAN::Packages->new($self->old_packages_file);
    my %prehistoric = map {
        my $name = $_->dist;
        $name =~ s/-/::/g;
        $name => 1
    } $packages->latest_distributions;

    # Extract  effective date

    my $package_epoch = $packages->last_updated();
    $package_epoch = $self->parse_packages_timestamp( $package_epoch );
    $package_epoch = substr($package_epoch, 0, 10);


    # Build a mapping of distros uploaded since then, by date

    my $json = read_file( $self->upload_dates_file );
    my $state = decode_json( $json );
    my $distro_dates = $state->{upload_date} || {};

    my(%uploads_by_date, %post_historic);
    my $history_start = '9999-99-99';
    my $history_end   = '0000-00-00';
    my $animation_start = $self->animation_start_date->ymd;
    my $animation_end   = $self->animation_end_date->ymd;

    while(my($distro_name, $date) = each %$distro_dates) {
        $distro_name =~ s/-/::/g;
        next if $prehistoric{$distro_name};
        $date = substr($date, 0, 10);
        next if $date lt $package_epoch;
        $history_start = $date if $date lt $history_start;
        $history_end   = $date if $date gt $history_end;
        next if $date lt $animation_start;
        if($date gt $animation_end) {
            $post_historic{$distro_name}++;
            next;
        }
        $uploads_by_date{$date} ||= [];
        push @{$uploads_by_date{$date}}, $distro_name;
    }

    $self->history_start_date($history_start);
    $self->history_end_date($history_end);
    $self->post_historic_distros(\%post_historic);
    $self->uploads_by_date(\%uploads_by_date);
}


sub parse_packages_to_ns_hash {
    my $self = shift;

    my $distros_by_ns = $self->SUPER::parse_packages_to_ns_hash();

    # Discard distros first uploaded after animation end date
    my $post_historic = $self->post_historic_distros();
    my $end_date = $self->animation_end_date->ymd;
    foreach my $distros ( values %$distros_by_ns ) {
        foreach my $name ( keys %$distros ) {
            if($post_historic->{$name}) {
                delete $distros->{$name};
            };
        }
    }

    return $distros_by_ns;
}


sub make_frame_set {
    my($self) = @_;

    my $uploads_per_frame = $self->uploads_per_frame;
    my $uploads_by_date = $self->uploads_by_date;
    my $last_date = $self->animation_end_date;
    my $date = $self->animation_start_date;
    my @frames;
    while($date <= $last_date) {
        my $dists = $uploads_by_date->{ $date->ymd } || [];
        while(@$dists > $uploads_per_frame) {
            push @frames, [ $date->ymd, splice @$dists, -1 * $uploads_per_frame ];
        }
        push @frames, [ $date->ymd, @$dists ];
        $date->add(days => 1);
    }
    $self->frames( \@frames );
}


sub each_frame {
    my($self, $handler) = @_;

    my $frames = $self->frames;
    my $max = 99999;
    $max = 120;
    for(my $i = $#{$frames}; $i >= 0; $i--) {
        my($date, @distros) = @{ $frames->[$i] };
        $self->flag_recent_new_uploads($frames, $i);
        $handler->($i, $date);
        if(@distros) {
            $self->remove_distro($_) foreach @distros;
            $self->remap_distros_to_plane;
        }
        last if --$max == 0;
    }
}


sub flag_recent_new_uploads {
    my($self, $frames, $j) = @_;

    my $is_recent = {};
    my $i = $j - $self->new_upload_persistence + 1;
    $i = 0 if $i < 0;
    foreach my $f ($i .. $j) {
        $is_recent->{$_} = 1 foreach @{ $frames->[$f] };
    }
    $self->recent_new_uploads($is_recent);
}


sub is_recent_new_upload {
    my($self, $distro_name) = @_;

    my $is_recent = $self->recent_new_uploads;
    return $is_recent->{$distro_name};
}


sub remove_distro {
    my($self, $distro_name) = @_;

    my $distro_index = $self->distro_index;
    my $i = delete $distro_index->{$distro_name} or return;
    my $distro_list = $self->distro_list;
    splice @$distro_list, $i, 1;
    while($i < @$distro_list) {
        my $distro = $distro_list->[$i];
        $distro->index( $i );
        $distro_index->{ $distro->name } = $i;
        $i++;
    }
}


sub remap_distros_to_plane {
    my($self) = @_;

    my $mass_map = $self->mass_map;
    $_->reset_stats foreach values %$mass_map;

    my $saved = $self->saved_plane_map;
    my @plane;
    $self->each_distro(sub {
        my($distro) = @_;
        my($row, $col) = @{ $saved->[$distro->index] };
        $plane[$row][$col] = $distro->index;
        $distro->row($row);
        $distro->col($col);
        if( my $ns = $mass_map->{ lc($distro->ns) } ) {
            $ns->update_stats( $distro );
        }
    });
    $self->plane(\@plane);

    $_->finalise_stats foreach values %$mass_map;
}



__PACKAGE__->meta->make_immutable;

1;

