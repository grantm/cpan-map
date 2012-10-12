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
    isa     => 'DateTime',
);

has 'date_font_size' => (
    is      => 'rw',
    isa     => 'Int',
    lazy    => 1,
    default => 13,
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


sub image_file_path {
    my($self, $builder, $scale) = @_;

    return sprintf("%s/frame_%04u.png", $self->output_dir, $self->frame);
}


sub add_date_label {
    my($self, $im) = @_;

    my $font   = $self->builder->label_font_path;
    my $colour = $self->colour;
    my $text   = $self->date->ymd;
    my $size   = $self->date_font_size;

    my @bounds = GD::Image->stringFT(
        $colour->{label}, $font, $size, 0, 0, 0, $text
    );
    my $width  = abs($bounds[2] - $bounds[0]);
    my $text_x = ($self->image_width - $width) / 2;
    my $text_y = $self->image_height - 15;

    # Don't anti-alias small font sizes (negative colour index)
    $im->stringFT(
        $colour->{shadow},
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


