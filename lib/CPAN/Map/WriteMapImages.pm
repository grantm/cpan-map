package CPAN::Map::WriteMapImages;

use Moose;
use namespace::autoclean;

require File::Spec;
require GD;


has 'output_filename' => (
    is      => 'ro',
    isa     => 'Str',
    lazy    => 1,
    default => 'cpan-map.png',
);

has 'output_dir' => (
    is       => 'ro',
    isa      => 'Str',
    required => 1,
);

has 'builder' => (
    is       => 'ro',
    isa      => 'CPAN::Map::Builder',
    required => 1,
    weak_ref => 1,
);

has 'scale' => (
    is       => 'rw',
    isa      => 'Int',
);

has 'minimum_font_size' => (
    is       => 'rw',
    isa      => 'Int',
    lazy     => 1,
    default  => 7,
);

has 'image_width' => (
    is       => 'rw',
    isa      => 'Int',
);

has 'image_height' => (
    is       => 'rw',
    isa      => 'Int',
);

has 'x_offset' => (
    is       => 'rw',
    isa      => 'Int',
    lazy     => 1,
    default  => 0,
);

has 'y_offset' => (
    is       => 'rw',
    isa      => 'Int',
    lazy     => 1,
    default  => 0,
);

has 'colour' => (
    is       => 'rw',
    isa      => 'Ref',
    lazy     => 1,
    default  => sub { {} },
);


use constant LINE_THICKNESS => 1;
use constant NORTH          => 1;
use constant SOUTH          => 2;
use constant EAST           => 4;
use constant WEST           => 8;


sub write {
    my($class, $builder, $output_dir) = @_;

    my $self = $class->new( builder => $builder, output_dir => $output_dir );

    $self->purge_old_files;
    foreach my $scale ( @{ $builder->zoom_scales } ) {
        $self->scale($scale);
        $self->write_image_file($builder, $scale);
    }
}


sub purge_old_files {
    my($self) = @_;
    my $pattern = File::Spec->catfile(
        $self->output_dir, $self->output_filename
    );
    $pattern =~ s{(?=[.]png$)}{*};
    $self->builder->progress_message(" - purging old files $pattern");
    unlink(glob($pattern));
}


sub write_image_file {
    my($self, $builder, $scale) = @_;

    my $output_path = $self->image_file_path($builder, $scale);
    $builder->progress_message(" - writing PNG image to $output_path");


    # Set up image dimensions

    my $rows = $builder->plane_rows;
    my $cols = $builder->plane_cols;

    $self->image_width($cols * $scale);
    $self->image_height($rows * $scale);

    my $im = $self->render_image($builder, $scale);

    # Write image out to file

    open my $out, '>', $output_path or die "open($output_path): $!";
    binmode($out);
    print $out $im->png;
    close($out);
}


sub render_image {
    my($self, $builder, $scale) = @_;

    my $font = $builder->label_font_path or $builder->warning_message(
        "can't add map labels without label_font_path"
    );


    # Set up colour map and fill the background

    my $im = new GD::Image($self->image_width, $self->image_height);

    my $colour = $self->allocate_colours($im);

    $im->fill(0, 0, $colour->{background});

    $im->setThickness(LINE_THICKNESS);


    # Draw area for each distro

    my $dist_colour = sub {
        if(my $ns = $builder->namespace_for_distro($_[0])) {
            return $ns->colour;
        }
        return 0;
    };
    my $dist_ns = sub {
        if(my $ns = $builder->namespace_for_distro($_[0])) {
            return $ns->name;
        }
        return '';
    };
    $builder->each_distro(sub {
        my($distro) = @_;
        my $colour = $colour->{'map_' . $dist_colour->($distro)};
        my $borders = $self->border_flags($distro, $builder, $dist_ns);
        $self->draw_distro($im, $distro, $colour, $borders);
    });


    # Add labels for each namespace/mass

    if($font) {
        die "Font file does not exist: $font" unless -e $font;
        $builder->each_namespace(sub {
            my($ns) = @_;
            $self->add_mass_label($im, $font, $ns);
        });
    }

    return $im;
}


sub allocate_colours {
    my($self, $im) = @_;

    my $colour = $self->colour;
    $colour->{background} = $im->colorAllocate(0x66, 0x66, 0x66);
    $colour->{label}      = $im->colorAllocate(0x44, 0x44, 0x44);
    $colour->{thin_label} = $im->colorAllocate(0x66, 0x66, 0x66);
    $colour->{shadow}     = $im->colorAllocate(0xEE, 0xEE, 0xEE);
    $colour->{border}     = $im->colorAllocate(0x55, 0x55, 0x55);
    $colour->{map_0}      = $im->colorAllocate(0xBB, 0xDD, 0xFF);
    $colour->{map_1}      = $im->colorAllocate(0x7A, 0xFF, 0x67);
    $colour->{map_2}      = $im->colorAllocate(0xFF, 0xE9, 0x3D);
    $colour->{map_3}      = $im->colorAllocate(0xFF, 0x97, 0xA6);
    $colour->{map_4}      = $im->colorAllocate(0xFF, 0x87, 0x49);

    return $colour;
}


sub image_file_path {
    my($self, $builder, $scale) = @_;

    my $image_path = File::Spec->catfile(
        $self->output_dir, $self->output_filename
    );
    my $slug = $builder->slug_of_the_day;
    $image_path =~ s{(?=[.]png$)}{-$scale-$slug};

    return $image_path;
}


sub border_flags {
    my($self, $distro, $builder, $dist_ns) = @_;

    my $this_ns = $dist_ns->($distro);
    my $row     = $distro->row;
    my $col     = $distro->col;

    my $flags = NORTH + SOUTH + EAST + WEST;

    if($row > 0) {
        if(my $that = $builder->dist_at($row - 1, $col)) {
            $flags &= (15 ^ NORTH) if $this_ns eq $dist_ns->($that);
        }
    }

    if($col > 0) {
        if(my $that = $builder->dist_at($row, $col - 1)) {
            $flags &= (15 ^ WEST) if $this_ns eq $dist_ns->($that);
        }
    }

    if(my $that = $builder->dist_at($row + 1, $col)) {
        $flags &= (15 ^ SOUTH) if $this_ns eq $dist_ns->($that);
    }

    if(my $that = $builder->dist_at($row, $col + 1)) {
        $flags &= (15 ^ EAST) if $this_ns eq $dist_ns->($that);
    }

    return $flags;
}


sub draw_distro {
    my($self, $im, $distro, $dist_colour, $borders) = @_;

    my $col    = $distro->col;
    my $row    = $distro->row;
    my $colour = $self->colour;
    my $scale  = $self->scale;

    my $x1 = $self->x_offset + $col * $scale;
    my $y1 = $self->y_offset + $row * $scale;
    my $x2 = $x1 + $scale - 1;
    my $y2 = $y1 + $scale - 1;
    $im->filledRectangle($x1, $y1, $x2, $y2, $dist_colour);

    if($scale > 6) {
        if($borders & NORTH) {
            $im->rectangle($x1, $y1 - 1, $x2, $y1, $colour->{border});
        }
        if($borders & SOUTH) {
            $im->rectangle($x1, $y2, $x2, $y2 + 1, $colour->{border});
        }
        if($borders & EAST) {
            $im->rectangle($x2, $y1, $x2 + 1, $y2, $colour->{border});
        }
        if($borders & WEST) {
            $im->rectangle($x1 - 1, $y1, $x1, $y2, $colour->{border});
        }
    }
    else {
        if($borders & SOUTH) {
            $im->line($x1, $y2, $x2, $y2, $colour->{border});
        }
        if($borders & EAST) {
            $im->line($x2, $y1, $x2, $y2, $colour->{border});
        }
    }
}


sub add_mass_label {
    my($self, $im, $font, $ns) = @_;

    return if not defined $ns->label_x;

    my $colour = $self->colour;
    my $scale  = $self->scale;

    my $x = $self->x_offset + $scale * $ns->label_x;
    my $y = $self->y_offset + $scale * $ns->label_y;

    my $name = $ns->name or return;
    my $size = $self->font_size_from_mass($ns);
    return if $size < $self->minimum_font_size; # Skip label if it's too small

    my @bounds = GD::Image->stringFT(
        $colour->{label}, $font, $size, 0, 0, 0, $name
    );
    my $width  = abs($bounds[2] - $bounds[0]);
    my $height = abs($bounds[7] - $bounds[1]);
    my $text_x = $x - $width / 2;
    my $text_y = $y + $height / 2;

    my @thick_border = (
                    [ -1, -2 ], [  0, -2 ], [  1, -2 ],
        [ -2, -1 ], [ -1, -1 ], [  0, -1 ], [  1, -1 ], [  2, -1 ],
        [ -2,  0 ], [ -1,  0 ],             [  1,  0 ], [  2,  0 ],
        [ -2,  1 ], [ -1,  1 ], [  0,  1 ], [  1,  1 ], [  2,  1 ],
                    [ -1,  2 ], [  0,  2 ], [  1,  2 ],
    );

    my @thin_border = (
        [ -1, -1 ], [  0, -1 ], [  1, -1 ],
        [ -1,  0 ],             [  1,  0 ],
        [ -1,  1 ], [  0,  1 ], [  1,  1 ],
    );

    # Don't anti-alias small font sizes (negative colour index)
    my $text_colour = $size < 10 ? $colour->{thin_label} * -1 : $colour->{label};

    foreach my $delta (
        ($size < 10 ? @thin_border : @thick_border),
        [ 0, 0 ],
    ) {
        my($delta_x, $delta_y) = @$delta;
        my $stroke_colour = ($delta_x | $delta_y)
                          ? $colour->{shadow}
                          : $text_colour;
        $im->stringFT(
            $stroke_colour,
            $font,
            $size,
            0,
            $text_x + $delta_x,
            $text_y + $delta_y,
            $name
        );
    }

}


sub font_size_from_mass {
    my($self, $ns) = @_;

    my $scale = $self->scale;

    my $mass = $ns->mass;
    return( ($mass/109 + 5.9) * (13 + $scale) / 16 )
}


__PACKAGE__->meta->make_immutable;

1;

