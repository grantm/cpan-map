package CPAN::Map::WriteJSData;

use Moose;
use namespace::autoclean;

require File::Spec;

has 'output_filename' => (
    is      => 'ro',
    isa     => 'Str',
    lazy    => 1,
    default => 'cpan-map-data.txt',
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

has 'maintainer_number' => (
    is      => 'ro',
    isa     => 'HashRef',
    lazy    => 1,
    default => sub { {} },
);

has 'namespace_number' => (
    is      => 'ro',
    isa     => 'HashRef',
    lazy    => 1,
    default => sub { {} },
);


sub write {
    my($class, $builder, $output_dir) = @_;

    my $self = $class->new( builder => $builder, output_dir => $output_dir );
    my $out  = $self->open_output_file;

    $self->write_metadata($out, $builder);
    $self->write_maintainer_list($out, $builder);
    $self->write_namespace_list($out, $builder);
    $self->write_distribution_list($out, $builder);

    close($out);
}

sub open_output_file {
    my $self = shift;
    my $output_path = File::Spec->catfile(
        $self->output_dir, $self->output_filename
    );
    $self->builder->progress_message(" - writing JS data to $output_path");
    open my $out, '>', $output_path or die "open($output_path): $!";
    return $out;
}


sub write_metadata {
    my($self, $out, $builder) = @_;

    print $out "[META]\n";
    printf $out "mod_list_date,%s\n", $builder->mod_list_date;
    printf $out "slug_of_the_day,%s\n", $builder->slug_of_the_day;
    printf $out "module_count,%d\n", $builder->module_count;
    printf $out "distribution_count,%d\n", $builder->distro_count;
    printf $out "maintainer_count,%d\n", $builder->maintainer_count;
    printf $out "map_image,%s\n", "cpan-map.png";
    printf $out "plane_rows,%s\n", $builder->plane_rows;
    printf $out "plane_cols,%s\n", $builder->plane_cols;

    my $zoom_scales = join ',', @{ $builder->zoom_scales };
    print $out "zoom_scales,$zoom_scales\n";
}


sub write_maintainer_list {
    my($self, $out, $builder) = @_;

    # Write out the maintainer list
    print $out "[MAINTAINERS]\n";
    my $maintainer_number = $self->maintainer_number;
    my $i = 0;
    $builder->each_maintainer(sub {
        my($maintainer) = @_;
        $maintainer_number->{ $maintainer->id } = $i++;
        my $line = $maintainer->id;
        if($maintainer->name) {
            $line .= ',' . $maintainer->name;
            if($maintainer->gravatar_id) {
                $line .= ',' . $maintainer->gravatar_id;
            }
        }
        print $out "$line\n";
    });
    $builder->progress_message(" - listed $i maintainers");
}


sub write_namespace_list {
    my($self, $out, $builder) = @_;

    # Write out namespace list
    print $out "[NAMESPACES]\n";
    my $i = 0;
    my $namespace_number = $self->namespace_number;
    $builder->each_namespace(sub {
        my($ns) = @_;
        printf $out "%s,%s,%X\n", $ns->name, $ns->colour, $ns->mass;
        $namespace_number->{ lc($ns->name) } = $i++;
    });
    $builder->progress_message(" - listed $i namespaces");
}


sub write_distribution_list {
    my($self, $out, $builder) = @_;

    # Write out distro list
    print $out "[DISTRIBUTIONS]\n";
    my $maintainer_number = $self->maintainer_number;
    my $namespace_number  = $self->namespace_number;
    my $i = 0;
    $builder->each_distro(sub {
        my($distro) = @_;
        my $ns = $builder->namespace_for_distro( $distro );
        my $ns_number = defined($ns)
                      ? sprintf('%X', $namespace_number->{ lc($ns->name) })
                      : '';
        my $maint_index = $maintainer_number->{ $distro->maintainer_id }
            // die "Can't find maintainer number for " . $distro->maintainer_id;
        my $score_count = '';
        if($distro->rating_count) {
            $score_count = ',' . $distro->rating_score . ','. $distro->rating_count;
        }
        printf $out "%s,%s,%X,%X,%X%s\n",
            $distro->name,
            $ns_number,
            $maint_index,
            $distro->row,
            $distro->col,
            $score_count;
        $i++;
    });
    $builder->progress_message(" - listed $i distros");
}


__PACKAGE__->meta->make_immutable;


1;
