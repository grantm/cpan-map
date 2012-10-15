package CPAN::Map::WriteMapHistImages;

use Moose;
use namespace::autoclean;

extends 'CPAN::Map::WriteMapImages';


has 'frame' => (
    is      => 'rw',
    isa     => 'Int',
);

has 'date' => (
    is      => 'rw',
    isa     => 'Str',
);

has 'date_font_size' => (
    is      => 'rw',
    isa     => 'Int',
    lazy    => 1,
    default => 15,
);


sub purge_old_files {
    my($self, $builder, $output_dir) = @_;

    unlink( glob("$output_dir/*.png") );
}


sub write_frame {
    my($self, $frame, $date) = @_;

    $self->frame( $frame );
    $self->date( $date );
    my $builder = $self->builder;
    my($scale) = @{ $builder->zoom_scales };
    $self->scale($scale);
    $self->write_image_file($builder, $scale);
}


sub render_image {
    my($self, $builder, $scale) = @_;

    $self->image_width( $self->image_width + 40 );
    $self->image_height( $self->image_height + 60 );
    $self->x_offset( 20 );
    $self->y_offset( 20 );

    my $im = $self->SUPER::render_image($builder, $scale);
    $self->add_date_label($im);
    return $im;
}


sub allocate_colours {
    my($self, $im) = @_;

    my $colour = $self->SUPER::allocate_colours($im);
    $colour->{date_label} = $im->colorAllocate(0x99, 0x99, 0x99);
    $colour->{new_distro} = $im->colorAllocate(0x00, 0x00, 0xFF);
    return $colour;
}


sub draw_distro {
    my($self, $im, $distro, $dist_colour, $borders) = @_;

    if($self->builder->is_recent_new_upload( $distro->name )) {
        my $col    = $distro->col;
        my $row    = $distro->row;
        my $colour = $self->colour;
        my $scale  = $self->scale;

        my $x1 = $self->x_offset + $col * $scale;
        my $y1 = $self->y_offset + $row * $scale;
        my $x2 = $x1 + $scale - 1;
        my $y2 = $y1 + $scale - 1;
        $im->filledRectangle($x1, $y1, $x2, $y2, $colour->{new_distro});

    }
    else {
        $self->SUPER::draw_distro($im, $distro, $dist_colour, $borders);
    }
}


sub image_file_path {
    my($self, $builder, $scale) = @_;

    return sprintf("%s/frame_%04u.png", $self->output_dir, $self->frame);
}


sub font_size_from_mass {
    my($self, $ns) = @_;

    my $font_size = $self->SUPER::font_size_from_mass($ns);
    return $font_size if $font_size >= $self->minimum_font_size;
    return $self->minimum_font_size;
}


sub add_date_label {
    my($self, $im) = @_;

    my $font   = $self->builder->date_label_font_path;
    my $colour = $self->colour;
    my $text   = $self->date;
    my $size   = $self->date_font_size;

    my @bounds = GD::Image->stringFT(
        $colour->{date_label}, $font, $size, 0, 0, 0, $text
    );
    my $width  = abs($bounds[2] - $bounds[0]);
    my $text_x = ($self->image_width - $width) / 2;
    my $text_y = $self->image_height - 15;

    $im->stringFT(
        $colour->{date_label},
        $font,
        $size,
        0,
        $text_x,
        $text_y,
        $text
    );
}


__PACKAGE__->meta->make_immutable;

1;


