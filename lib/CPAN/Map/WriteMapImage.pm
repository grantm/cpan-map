package CPAN::Map::WriteMapImage;

use strict;
use warnings;

require GD;
use Data::Dumper;

use constant SCALE          => 10;  # Image scaling factor
use constant LINE_THICKNESS => 1;

use constant NORTH          => 1;
use constant SOUTH          => 2;
use constant EAST           => 4;
use constant WEST           => 8;

my($bg_colour, $label_colour, $shadow_colour, $border_colour, @map_colour);


sub write {
    my($class, $builder, $output_dir) = @_;

    my $output_file = File::Spec->catfile($output_dir, 'cpan-map.png');

    $builder->progress_message("- writing PNG image to $output_file");

    my $font = $builder->{label_font_path} or $builder->warning_message(
        "can't add map labels without label_font_path"
    );


    # Set up image dimensions, colour map and fill the background

    my $rows = $builder->plane_rows;
    my $cols = $builder->plane_cols;

    my $im = new GD::Image($cols * SCALE, $rows * SCALE);

    $bg_colour     = $im->colorAllocate(0xFF, 0xFF, 0xFF);
    $label_colour  = $im->colorAllocate(0x44, 0x44, 0x44);
    $shadow_colour = $im->colorAllocate(0xEE, 0xEE, 0xEE);
    $border_colour = $im->colorAllocate(0x33, 0x33, 0x33);
    @map_colour = (
        $im->colorAllocate(0xBB, 0xDD, 0xFF),
        $im->colorAllocate(0x7A, 0xFF, 0x67),
        $im->colorAllocate(0xFF, 0xE9, 0x3D),
        $im->colorAllocate(0xFF, 0x97, 0xA6),
        $im->colorAllocate(0xFF, 0x87, 0x49),
    );

    $im->fill(0, 0, $bg_colour);

    $im->setThickness(LINE_THICKNESS);


    # Draw area for each distro

    my $mass_map = $builder->mass_map;
    my $dist_colour = sub {
        my($dist) = @_;
        if(my $ns = $mass_map->{ $dist->{ns} }) {
            return $ns->{colour};
        }
        return 0;
    };
    $builder->each_distro(sub {
        my($dist) = @_;
        my $colour = $map_colour[ $dist_colour->($dist) ];
        my $borders = border_flags($dist, $builder, $dist_colour);
        draw_dist($im, $dist->{col}, $dist->{row}, $colour, $borders);
    });


    # Add labels for each namespace/mass

    if($font) {
        $builder->each_namespace(sub {
            my($ns) = @_;
            add_mass_label($im, $font, $ns);
        });
    }


    # Write image out to file

    open my $out, '>', $output_file or die "open($output_file): $!";
    binmode($out);
    print $out $im->png;
    close($out);
}


sub border_flags {
    my($dist, $builder, $dist_colour) = @_;

    my $colour  = $dist_colour->($dist);
    my $row     = $dist->{row};
    my $col     = $dist->{col};

    my $flags = NORTH + SOUTH + EAST + WEST;

    if($row > 0) {
        if(my $that = $builder->dist_at($row - 1, $col)) {
            $flags &= (15 ^ NORTH) if $colour == $dist_colour->($that);
        }
    }

    if($col > 0) {
        if(my $that = $builder->dist_at($row, $col - 1)) {
            $flags &= (15 ^ WEST) if $colour == $dist_colour->($that);
        }
    }

    if(my $that = $builder->dist_at($row + 1, $col)) {
        $flags &= (15 ^ SOUTH) if $colour == $dist_colour->($that);
    }

    if(my $that = $builder->dist_at($row, $col + 1)) {
        $flags &= (15 ^ EAST) if $colour == $dist_colour->($that);
    }

    return $flags;
}


sub draw_dist {
    my($im, $col, $row, $colour, $borders) = @_;

    my $x1 = $col * SCALE;
    my $y1 = $row * SCALE;
    my $x2 = $x1 + SCALE - 1;
    my $y2 = $y1 + SCALE - 1;
    $im->filledRectangle($x1, $y1, $x2, $y2, $colour);

    if($borders & NORTH) {
        $im->rectangle($x1, $y1 - 1, $x2, $y1, $border_colour);
    }
    if($borders & SOUTH) {
        $im->rectangle($x1, $y2, $x2, $y2 + 1, $border_colour);
    }
    if($borders & EAST) {
        $im->rectangle($x2, $y1, $x2 + 1, $y2, $border_colour);
    }
    if($borders & WEST) {
        $im->rectangle($x1 - 1, $y1, $x1, $y2, $border_colour);
    }
}


sub add_mass_label {
    my($im, $font, $ns) = @_;

    my $x = SCALE * $ns->{label_x};
    my $y = SCALE * $ns->{label_y};
    my $w = SCALE * $ns->{label_w};
    my $h = SCALE * $ns->{label_h};
    if(0) {
        $im->rectangle(
            $x - $w / 2,
            $y - $h / 2,
            $x + $w / 2,
            $y + $h / 2,
            $map_colour[0]
        );
    }

    my $name = $ns->{name} or return;
    my $size = font_size_from_mass($ns);
    my @bounds = GD::Image->stringFT(
        $label_colour, $font, $size, 0, 0, 0, $name
    );
    my $width  = abs($bounds[2] - $bounds[0]);
    my $height = abs($bounds[7] - $bounds[1]);
    my $text_x = $x - $width / 2;
    my $text_y = $y + $height / 2;
    foreach my $delta (
        [ -2, -2, $shadow_colour ],
        [  0, -2, $shadow_colour ],
        [  2, -2, $shadow_colour ],
        [  2,  0, $shadow_colour ],
        [  2,  2, $shadow_colour ],
        [  0,  2, $shadow_colour ],
        [ -2,  2, $shadow_colour ],
        [ -2,  0, $shadow_colour ],
        [  0,  0, $label_colour  ],
    ) {
        my($delta_x, $delta_y, $colour) = @$delta;
        $im->stringFT(
            $colour,
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
    my($ns) = @_;

    my $mass = $ns->{mass};
    return 26 if $mass > 400;
    return 18 if $mass > 180;
    return 12;
}


1;

