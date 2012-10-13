package CPAN::Map::HistBuilder;

use Moose;
use Moose::Util::TypeConstraints;
use namespace::autoclean;
use autodie;

extends "CPAN::Map::Builder";

require CPAN::Map::WriteMapHistImages;
require DateTime;
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

has 'upload_dates_file' => (
    is      => 'ro',
    isa     => 'Str',
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

has 'frames' => (
    is      => 'rw',
    isa     => 'ArrayRef',
);

has 'saved_plane_map' => (
    is      => 'rw',
    isa     => 'ArrayRef',
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

    open my $fh, '<', $self->upload_dates_file;
    my(%upload_date, %uploads_by_date);
    my $history_start = '9999-99-99';
    my $history_end   = '0000-00-00';
    while(<$fh>) {
        chomp;
        my($dist_name, $date) = split /,/;
        next unless $date;
        $date = substr($date, 0, 10);
        $history_start = $date if $date lt $history_start;
        $history_end   = $date if $date gt $history_end;
        $dist_name =~ s/-/::/g;
        $upload_date{$dist_name} = $date;
        $uploads_by_date{$date} ||= [];
        push @{$uploads_by_date{$date}}, $dist_name;
    }
    $self->history_start_date($history_start);
    $self->history_end_date($history_end);
    $self->uploads_by_date(\%uploads_by_date);
}


sub make_frame_set {
    my($self) = @_;

    my $uploads_per_frame = $self->uploads_per_frame;
    my $uploads_by_date = $self->uploads_by_date;
    my $last_date = $self->history_end_date;
    my $date = $self->history_start_date;
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
    #my $max = 30;
    my $max = 1;
    for(my $i = $#{$frames}; $i >= 0; $i--) {
        my($date, @distros) = @{ $frames->[$i] };
        $handler->($i, $date);
        if(@distros) {
            $self->remove_distro($_) foreach @distros;
            $self->remap_distros_to_plane;
        }
        last if --$max == 0;
    }
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

